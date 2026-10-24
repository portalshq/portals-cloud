import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthGatewayClient, type AuthGatewayClient } from "./auth-gateway-client.js";

const CLIENT_STATE = "33333333-3333-4333-8333-333333333333";
const AUTHORIZED_SESSION = "11111111-1111-4111-8111-111111111111";
const PENDING_SESSION = "22222222-2222-4222-8222-222222222222";

// Real HTTP/2 transport and canonical wire protocol, no external credentials needed.
describe("auth-gateway wire integration", () => {
  const definition = loader.loadSync(new URL("./proto/auth_api.proto", import.meta.url).pathname, { keepCase: true });
  const methods = definition["epic_urc.UrcAuthApi"] as loader.ServiceDefinition;
  const server = new grpc.Server();
  let client: AuthGatewayClient;
  let revokedWith: unknown;
  beforeAll(async () => {
    server.addService(methods, {
      startAuthSession(call: grpc.ServerUnaryCall<{ client_state: string }, unknown>, callback: grpc.sendUnaryData<unknown>) {
        if (call.request.client_state !== CLIENT_STATE) {
          return callback({ code: grpc.status.INVALID_ARGUMENT, details: "client_state must be a UUID" });
        }
        callback(null, { session_code: AUTHORIZED_SESSION, login_url: "https://auth.test/login" });
      },
      getAuthSession(call: grpc.ServerUnaryCall<{ session_code: string; client_state: string }, unknown>, callback: grpc.sendUnaryData<unknown>) {
        if (call.request.session_code === PENDING_SESSION) return callback(null, {});
        callback(null, {
          user_token: {
            user_token: "jwt-1", expires_at: 1893456000, user_id: "u1", user_name: "Ada", refresh_token: "rt-1",
          },
        });
      },
      refreshAuthSession(call: grpc.ServerUnaryCall<object, unknown>, callback: grpc.sendUnaryData<unknown>) {
        const authorization = call.metadata.get("authorization")[0];
        if (authorization !== "Bearer rt-1") {
          return callback({ code: grpc.status.UNAUTHENTICATED, details: "refresh token is invalid" });
        }
        callback(null, {
          user_token: {
            user_token: "jwt-2", expires_at: 1893456000, user_id: "u1", user_name: "Ada", refresh_token: "rt-2",
          },
        });
      },
      revokeAuthSession(call: grpc.ServerUnaryCall<object, unknown>, callback: grpc.sendUnaryData<unknown>) {
        revokedWith = call.metadata.get("authorization")[0];
        callback(null, {});
      },
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
  it("runs the hosted sign-in session lifecycle", async () => {
    const started = await client.startAuthSession(CLIENT_STATE);
    expect(started).toEqual({ sessionCode: AUTHORIZED_SESSION, loginUrl: "https://auth.test/login" });
    // A session the viewer has not finished resolves null — the caller polls again.
    await expect(client.getAuthSession(PENDING_SESSION, CLIENT_STATE)).resolves.toBeNull();
    await expect(client.getAuthSession(AUTHORIZED_SESSION, CLIENT_STATE)).resolves.toEqual({
      userToken: "jwt-1", expiresAt: 1893456000, userId: "u1", userName: "Ada", refreshToken: "rt-1",
    });
  });
  it("sends the refresh credential as bearer metadata and returns rotated tokens", async () => {
    await expect(client.refreshAuthSession("rt-1")).resolves.toEqual({
      userToken: "jwt-2", expiresAt: 1893456000, userId: "u1", userName: "Ada", refreshToken: "rt-2",
    });
    await expect(client.refreshAuthSession("stale")).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
  });
  it("revokes a session by its refresh credential", async () => {
    await client.revokeAuthSession("rt-9");
    expect(revokedWith).toBe("Bearer rt-9");
  });
  it("rejects calls after closing", async () => {
    client.close(); client.close();
    await expect(client.verifyUser("valid")).rejects.toThrow("closed");
    await expect(client.startAuthSession(CLIENT_STATE)).rejects.toThrow("closed");
    await expect(client.getAuthSession(AUTHORIZED_SESSION, CLIENT_STATE)).rejects.toThrow("closed");
    await expect(client.refreshAuthSession("rt-1")).rejects.toThrow("closed");
    await expect(client.revokeAuthSession("rt-1")).rejects.toThrow("closed");
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
