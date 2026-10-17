import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

export interface UserInfo { userId: string; displayName: string }
export interface AuthGatewayClient {
  verifyUser(token: string): Promise<UserInfo>;
  getUserInfo(resourceId: string, userId: string): Promise<UserInfo>;
  getUserId(resourceId: string, displayName: string): Promise<UserInfo>;
  close(): void;
}
export interface AuthGatewayClientConfig {
  address: string;
  /** Enable TLS outside a trusted private network. */
  useTls?: boolean;
  /** Per-call deadline in milliseconds, defaults to 5000. */
  timeout?: number;
  protoPath?: string;
}
type WireUser = { user_id: string; display_name: string };
type WireResponse = { user_info?: WireUser | WireUser[] };

export function createAuthGatewayClient(config: AuthGatewayClientConfig): AuthGatewayClient {
  if (!config.address.trim()) throw new TypeError("Auth-gateway address is required.");
  const timeout = config.timeout ?? 5000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError("Timeout must be positive and finite.");
  const definition = protoLoader.loadSync(config.protoPath ?? fileURLToPath(new URL("./proto/auth_api.proto", import.meta.url)), {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const methods = definition["epic_urc.UrcAuthApi"] as protoLoader.ServiceDefinition;
  const descriptor = grpc.loadPackageDefinition(definition);
  const namespace = descriptor.epic_urc as grpc.GrpcObject;
  const Constructor = namespace.UrcAuthApi as grpc.ServiceClientConstructor;
  const client = new Constructor(config.address, config.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure());
  let closed = false;

  async function call(method: string, request: object, expectedId?: string): Promise<UserInfo> {
    if (closed) throw new Error("Auth-gateway client is closed.");
    const response = await new Promise<WireResponse>((resolve, reject) => {
      client.makeUnaryRequest(`/epic_urc.UrcAuthApi/${method}`,
        (value: object) => methods[method].requestSerialize(value),
        (value: Buffer) => methods[method].responseDeserialize(value),
        request, new grpc.Metadata(), { deadline: Date.now() + timeout },
        (error, result: WireResponse | undefined) => error ? reject(error) : resolve(result ?? {}));
    });
    const candidates = Array.isArray(response.user_info) ? response.user_info : response.user_info ? [response.user_info] : [];
    const user = expectedId ? candidates.find((candidate) => candidate.user_id === expectedId) : candidates[0];
    if (!user || typeof user.user_id !== "string" || !user.user_id.trim() || typeof user.display_name !== "string") {
      throw new Error(`Auth-gateway ${method} returned no valid user info`);
    }
    return { userId: user.user_id, displayName: user.display_name };
  }
  return {
    verifyUser: (token) => call("VerifyUser", { target_user: { user_token: token }, requirements: [] }),
    getUserInfo: (resourceId, userId) => call("GetUserInfo", { resource_id: resourceId, user_id: [userId] }, userId),
    getUserId: (resourceId, displayName) => call("GetUserId", { resource_id: resourceId, user_display_name: displayName }),
    close: () => { if (!closed) { closed = true; client.close(); } },
  };
}
