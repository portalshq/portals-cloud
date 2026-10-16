/**
 * Auth-Gateway gRPC Client (Placeholder)
 *
 * This file is a placeholder for the auth-gateway gRPC client implementation.
 * 
 * To implement this, you'll need to:
 * 1. Install protobuf compilation tools: `npm install @grpc/grpc-js @grpc/proto-loader`
 * 2. Generate TypeScript stubs from proto files using grpc-tools
 * 3. Implement the client methods defined in auth_api.proto
 *
 * Proto files are located at:
 * - /Users/vibrantceo/Projects/portals/cloud/infra/lore/lore/lore-proto/proto/auth_api.proto
 * - /Users/vibrantceo/Projects/portals/cloud/infra/lore/lore/lore-proto/proto/rebac_api.proto
 *
 * Key methods to implement from UrcAuthApi service:
 * - GetUserInfo: Fetch user information
 * - VerifyUser: Verify user credentials
 * - GetUserId: Get user ID by display name
 * - GetProviderUserId: Get provider-specific user ID
 *
 * Example implementation pattern:
 * ```typescript
 * import * as grpc from '@grpc/grpc-js';
 * import * as protoLoader from '@grpc/proto-loader';
 *
 * const PROTO_PATH = '/path/to/auth_api.proto';
 * const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
 *   keepCase: true,
 *   longs: String,
 *   enums: String,
 *   defaults: true,
 *   oneofs: true
 * });
 * const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
 * const urcAuthApi = protoDescriptor.epic_urc.UrcAuthApi;
 *
 * const client = new urcAuthApi('localhost:50051', grpc.credentials.createInsecure());
 * ```
 */

export interface AuthGatewayClient {
  // Placeholder for auth-gateway client methods
  getUserInfo(userId: string): Promise<{ userId: string; displayName: string }>;
  verifyUser(token: string): Promise<{ userId: string; displayName: string }>;
}

// TODO: Implement actual gRPC client when protobuf tooling is set up
export function createAuthGatewayClient(): AuthGatewayClient {
  throw new Error("Auth-gateway gRPC client not yet implemented - requires protobuf compilation");
}
