/**
 * Auth-Gateway gRPC Client
 *
 * gRPC client for communicating with the auth-gateway service.
 * Auth-gateway is a Rust service using Tonic gRPC framework.
 *
 * Proto file location:
 * - /Users/vibrantceo/Projects/portals/cloud/infra/lore/lore/lore-proto/proto/auth_api.proto
 *
 * Key methods from UrcAuthApi service:
 * - VerifyUser: Verify user token and return user info
 * - GetUserInfo: Fetch user information by user_id
 * - GetUserId: Get user ID by display name
 * - GetProviderUserId: Get provider-specific user ID
 *
 * Note: The UserInfo message only contains user_id and display_name.
 * Email and preferences are not available from auth-gateway.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export interface UserInfo {
  userId: string;
  displayName: string;
}

export interface AuthGatewayClient {
  /**
   * Verify a user token and return user information.
   *
   * @param token - The user token to verify
   * @returns User information (userId, displayName)
   */
  verifyUser(token: string): Promise<UserInfo>;

  /**
   * Get user information by user ID.
   *
   * @param resourceId - The resource ID (application identifier)
   * @param userId - The user ID to look up
   * @returns User information (userId, displayName)
   */
  getUserInfo(resourceId: string, userId: string): Promise<UserInfo>;

  /**
   * Get user ID by display name.
   *
   * @param resourceId - The resource ID (application identifier)
   * @param displayName - The display name to look up
   * @returns User information (userId, displayName)
   */
  getUserId(resourceId: string, displayName: string): Promise<UserInfo>;

  /**
   * Close the gRPC client connection.
   */
  close(): void;
}

export interface AuthGatewayClientConfig {
  /**
   * The gRPC server address (e.g., "localhost:50051" or "auth-gateway:50051")
   */
  address: string;

  /**
   * Whether to use SSL/TLS credentials
   */
  useTls?: boolean;

  /**
   * Connection timeout in milliseconds
   */
  timeout?: number;
}

/**
 * Create an auth-gateway gRPC client.
 *
 * @param config - Client configuration
 * @returns Auth-gateway client instance
 */
export function createAuthGatewayClient(
  config: AuthGatewayClientConfig,
): AuthGatewayClient {
  const PROTO_PATH =
    "/Users/vibrantceo/Projects/portals/cloud/infra/lore/lore/lore-proto/proto/auth_api.proto";

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  const urcAuthApi = (protoDescriptor as any).epic_urc.UrcAuthApi;

  const credentials = config.useTls
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

  const client = new urcAuthApi(config.address, credentials);

  return new AuthGatewayClientImpl(client);
}

class AuthGatewayClientImpl implements AuthGatewayClient {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async verifyUser(token: string): Promise<UserInfo> {
    return new Promise((resolve, reject) => {
      const request = {
        target_user: {
          user_token: token,
        },
        requirements: [],
      };

      this.client.verifyUser(request, (error: any, response: any) => {
        if (error) {
          console.error("[auth-gateway] VerifyUser failed:", error);
          reject(new Error(`Auth-gateway VerifyUser failed: ${error.message}`));
          return;
        }

        if (!response.user_info) {
          reject(new Error("Auth-gateway VerifyUser returned no user info"));
          return;
        }

        resolve({
          userId: response.user_info.user_id,
          displayName: response.user_info.display_name,
        });
      });
    });
  }

  async getUserInfo(resourceId: string, userId: string): Promise<UserInfo> {
    return new Promise((resolve, reject) => {
      const request = {
        resource_id: resourceId,
        user_id: [userId],
      };

      this.client.getUserInfo(request, (error: any, response: any) => {
        if (error) {
          console.error("[auth-gateway] GetUserInfo failed:", error);
          reject(new Error(`Auth-gateway GetUserInfo failed: ${error.message}`));
          return;
        }

        if (!response.user_info || response.user_info.length === 0) {
          reject(new Error("Auth-gateway GetUserInfo returned no user info"));
          return;
        }

        const userInfo = response.user_info[0];
        resolve({
          userId: userInfo.user_id,
          displayName: userInfo.display_name,
        });
      });
    });
  }

  async getUserId(resourceId: string, displayName: string): Promise<UserInfo> {
    return new Promise((resolve, reject) => {
      const request = {
        resource_id: resourceId,
        user_display_name: displayName,
      };

      this.client.getUserId(request, (error: any, response: any) => {
        if (error) {
          console.error("[auth-gateway] GetUserId failed:", error);
          reject(new Error(`Auth-gateway GetUserId failed: ${error.message}`));
          return;
        }

        if (!response.user_info) {
          reject(new Error("Auth-gateway GetUserId returned no user info"));
          return;
        }

        resolve({
          userId: response.user_info.user_id,
          displayName: response.user_info.display_name,
        });
      });
    });
  }

  close(): void {
    try {
      this.client.close();
    } catch (error) {
      console.error("[auth-gateway] Error closing client:", error);
    }
  }
}
