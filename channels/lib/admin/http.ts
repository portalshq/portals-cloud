/**
 * Shared response helpers for the admin API route handlers.
 */

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export function badRequest(message: string): AdminApiError {
  return new AdminApiError(400, message);
}

export function notFound(message: string): AdminApiError {
  return new AdminApiError(404, message);
}

export function serviceUnavailable(message: string): AdminApiError {
  return new AdminApiError(503, message);
}

/**
 * Uniform error boundary for route handlers: AdminApiError carries its own
 * status; anything else is a 500 whose detail stays in the server log so a
 * failed query never leaks a connection string or schema internals.
 */
export function adminErrorResponse(error: unknown): Response {
  if (error instanceof AdminApiError) {
    return jsonError(error.status, error.message);
  }
  console.error("[admin] request failed:", error);
  return jsonError(500, "Internal server error");
}
