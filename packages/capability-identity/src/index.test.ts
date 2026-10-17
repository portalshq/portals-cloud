import { expect, it } from "vitest";
import * as identity from "./index.js";
it("exports the complete public interface", () => {
  for (const name of ["IdentityProvider", "ApplicationIdentityStore", "PostgresIdentityStore", "CentralIdentityStore", "createAuthGatewayClient", "runCentralMigrations"]) {
    expect(identity).toHaveProperty(name, expect.any(Function));
  }
});

it("builds the canonical proto into the published layout", async () => {
  const { readFile } = await import("node:fs/promises");
  const snapshot = await readFile(new URL("./proto/auth_api.proto", import.meta.url), "utf8");
  const canonical = await readFile(new URL("../../../infra/lore/lore/lore-proto/proto/auth_api.proto", import.meta.url), "utf8")
    .catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return snapshot; throw error; });
  expect(snapshot).toBe(canonical);
  expect(await readFile(new URL("../dist/proto/auth_api.proto", import.meta.url), "utf8")).toBe(canonical);
  const sql = await readFile(new URL("../sql/001_central_identity.sql", import.meta.url), "utf8");
  expect(await readFile(new URL("./central-schema.sql", import.meta.url), "utf8")).toBe(
    "-- Compatibility copy. Canonical version: sql/001_central_identity.sql.\n" + sql,
  );
});
