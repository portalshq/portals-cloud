import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthGatewayClient, type AuthGatewayClient } from "./auth-gateway-client.js";

// Real HTTP/2 transport and canonical wire protocol, no external credentials needed.
describe("auth-gateway wire integration", () => {
  const definition = loader.loadSync(new URL("./proto/auth_api.proto", import.meta.url).pathname, { keepCase: true });
  const methods = definition["epic_urc.UrcAuthApi"] as loader.ServiceDefinition;
  const server = new grpc.Server();
  let client: AuthGatewayClient;
  beforeAll(async () => {
    server.addService(methods, {
      verifyUser(call: grpc.ServerUnaryCall<{ target_user: { user_token: string } }, unknown>, callback: grpc.sendUnaryData<unknown>) {
        const token = call.request.target_user.user_token;
        if (token === "invalid") return callback({ code: grpc.status.UNAUTHENTICATED, details: "invalid credential" });
        if (token === "timeout") return;
        if (token === "empty") return callback(null, {});
        if (token === "blank") return callback(null, { user_info: { user_id: "", display_name: "" } });
        callback(null, { user_info: { user_id: "u1", display_name: "Ada" } });
      },
      getUserInfo(call: grpc.ServerUnaryCall<{ resource_id: string; user_id: string[] }, unknown>, callback: grpc.sendUnaryData<unknown>) {
        expect(call.request.resource_id).toBe("app");
        callback(null, { user_info: call.request.user_id[0] === "missing" ? [] : [
          { user_id: "other", display_name: "Other" }, { user_id: "u1", display_name: "Ada" },
        ] });
      },
      getUserId(call: grpc.ServerUnaryCall<{ user_display_name: string }, unknown>, callback: grpc.sendUnaryData<unknown>) {
        expect(call.request.user_display_name).toBe("Ada");
        callback(null, { user_info: { user_id: "u1", display_name: "Ada" } });
      },
    });
    const port = await new Promise<number>((resolve, reject) => server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)));
    client = createAuthGatewayClient({ address: `127.0.0.1:${port}`, timeout: 200 });
  });
  afterAll(() => { client?.close(); server.forceShutdown(); });
  it("verifies and looks up identities using the proto", async () => {
    await expect(client.verifyUser("valid")).resolves.toEqual({ userId: "u1", displayName: "Ada" });
    await expect(client.getUserInfo("app", "u1")).resolves.toEqual({ userId: "u1", displayName: "Ada" });
    await expect(client.getUserId("app", "Ada")).resolves.toEqual({ userId: "u1", displayName: "Ada" });
  });
  it("preserves gRPC status codes and enforces deadlines", async () => {
    await expect(client.verifyUser("invalid")).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
    await expect(client.verifyUser("timeout")).rejects.toMatchObject({ code: grpc.status.DEADLINE_EXCEEDED });
  });
  it("rejects missing, malformed and mismatched identities", async () => {
    for (const token of ["empty", "blank"]) await expect(client.verifyUser(token)).rejects.toThrow("no valid user info");
    await expect(client.getUserInfo("app", "missing")).rejects.toThrow("no valid user info");
    await expect(client.getUserInfo("app", "wrong")).rejects.toThrow("no valid user info");
  });
  it("validates configuration", () => {
    expect(() => createAuthGatewayClient({ address: " " })).toThrow();
    for (const timeout of [0, -1, Infinity, NaN]) expect(() => createAuthGatewayClient({ address: "localhost:1", timeout })).toThrow();
    const tls = createAuthGatewayClient({ address: "localhost:1", useTls: true, protoPath: new URL("./proto/auth_api.proto", import.meta.url).pathname });
    tls.close(); tls.close();
  });
  it("rejects calls after closing", async () => {
    client.close(); client.close();
    await expect(client.verifyUser("valid")).rejects.toThrow("closed");
  });
});

const address = process.env.AUTH_GATEWAY_ADDRESS;
const resource = process.env.AUTH_GATEWAY_RESOURCE_ID;
const token = process.env.IDENTITY_AUTH_GATEWAY_TEST_TOKEN;
describe.skipIf(!address || !resource || !token)("deployed auth-gateway", () => {
  it("round trips a verified test identity", async () => {
    const client = createAuthGatewayClient({ address: address!, useTls: process.env.AUTH_GATEWAY_TLS === "true" });
    try {
      const user = await client.verifyUser(token!);
      expect(await client.getUserInfo(resource!, user.userId)).toEqual(user);
      expect(await client.getUserId(resource!, user.displayName)).toEqual(user);
      await expect(client.verifyUser("invalid-test-credential")).rejects.toThrow();
    } finally { client.close(); }
  });
});
