import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";
import { Pool } from "pg";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.IDENTITY_CENTRAL_TEST_DATABASE_URL;
describe.skipIf(!url)("documentation examples against PostgreSQL and gRPC", () => {
  const schema = `identity_docs_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url });
  const server = new grpc.Server();
  let address: string;
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const definition = loader.loadSync(new URL("./proto/auth_api.proto", import.meta.url).pathname, { keepCase: true });
    server.addService(definition["epic_urc.UrcAuthApi"] as loader.ServiceDefinition, {
      verifyUser: (_call: unknown, callback: grpc.sendUnaryData<unknown>) => callback(null, { user_info: { user_id: "docs", display_name: "Ada" } }),
      getUserInfo: (_call: unknown, callback: grpc.sendUnaryData<unknown>) => callback(null, { user_info: [{ user_id: "docs", display_name: "Ada" }] }),
    });
    const port = await new Promise<number>((resolve, reject) => server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)));
    address = `127.0.0.1:${port}`;
  });
  afterAll(async () => {
    server.forceShutdown();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  it.each(["README.md", "docs/integration-guide.md"])("executes TypeScript examples in %s", async (file) => {
    const markdown = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const snippets = [...markdown.matchAll(/```typescript\n([\s\S]*?)```/g)].map((match) => match[1]);
    const connection = new URL(url!);
    connection.searchParams.set("options", `-c search_path=${schema}`);
    const env = {
      CENTRAL_DATABASE_URL: connection.href,
      AUTH_GATEWAY_ADDRESS: address,
      AUTH_GATEWAY_TLS: "false",
      AUTH_GATEWAY_RESOURCE_ID: "example",
      IDENTITY_AUTH_GATEWAY_TEST_TOKEN: "test-token",
    };
    const previous = { ...process.env };
    Object.assign(process.env, env);
    try {
      for (let index = 0; index < snippets.length; index++) {
        let source = snippets[index];
        if (source.includes("const gateway") && !source.includes("finally")) source += "\ngateway.close(); await pool.end();";
        const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
        const require = createRequire(import.meta.url);
        // Use the compiled entry point so examples verify the shipped interface and asset paths.
        const executable = compiled
          .replaceAll('"@portalshq/capability-identity"', JSON.stringify(new URL("../dist/index.js", import.meta.url).href))
          .replaceAll('"pg"', JSON.stringify(pathToFileURL(require.resolve("pg")).href));
        await import(`data:text/javascript;base64,${Buffer.from(executable + `\n// ${file}:${index}:${randomUUID()}`).toString("base64")}`);
      }
      expect(snippets.length).toBeGreaterThan(0);
    } finally {
      for (const key of Object.keys(env)) {
        if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
      }
    }
  });
});
