/**
 * Typed API error parsed from the Soulbits error envelope.
 *
 * The API has three error shapes:
 *   - Inference gateway: `{ error: "<code>", message: "<text>" }`
 *   - Auth-service:      `{ error: "<message>" }`
 *   - Session-broker:    `{ error_code: "<code>", message: "<text>" }`
 *
 * All validated against the `Error` schema (extra fields allowed).
 */
export class APIError extends Error {
  /** HTTP status code. */
  readonly status: number;

  /** Error code (inference/session) OR message (auth-service). */
  readonly code: string | undefined;

  /** Present on 402 quota_exceeded. */
  readonly upgradeUrl?: string;
  readonly currentTier?: string;
  readonly requiredTier?: string;
  readonly soulCreditsAvailable?: number;

  /** Present on 504 gateway_timeout. */
  readonly taskId?: string;

  constructor(status: number, body: Record<string, unknown>) {
    const code = (body.error as string | undefined) ?? (body.error_code as string | undefined);
    const message = (body.message as string | undefined) ?? body.error as string | undefined ?? `HTTP ${status}`;
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.upgradeUrl = body.upgrade_url as string | undefined;
    this.currentTier = body.current_tier as string | undefined;
    this.requiredTier = body.required_tier as string | undefined;
    this.soulCreditsAvailable = body.soul_credits_available as number | undefined;
    this.taskId = body.task_id as string | undefined;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isQuotaError(): boolean {
    return this.status === 402;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Thrown when POST /v1/session/connect returns 403
 * `{"error":"device_authorization_required"}` (D-DEV-04 gate). NOT a generic
 * failure: the connecting device must complete the email auth-code flow before
 * the broker provisions a session. Terminal — `connectPoll` never retries it.
 */
export class DeviceAuthRequiredError extends Error {
  constructor() {
    super('device_authorization_required');
    this.name = 'DeviceAuthRequiredError';
  }
}

/**
 * Unwrap an openapi-fetch result.
 * Returns `data` if present, otherwise throws `APIError`.
 */
export async function unwrap<T, E>(result: { data?: T; error?: E; response: Response }): Promise<T> {
  if (result.error) {
    const body = result.error as Record<string, unknown>;
    throw new APIError(result.response.status, body);
  }
  if (result.data !== undefined) {
    return result.data;
  }
  // If both data and error are undefined (e.g. 204 No Content)
  return result.data as T;
}

/**
 * Parse an error Response body into an APIError.
 */
export async function toAPIError(response: Response): Promise<APIError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response
  }
  return new APIError(response.status, body);
}
