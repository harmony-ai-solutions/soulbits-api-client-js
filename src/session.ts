import type { FetchClient, components } from './types.js';
import { APIError, DeviceAuthRequiredError, unwrap } from './errors.js';

type SessionConnectResponse = components['schemas']['SessionConnectResponse'];

/**
 * Options for {@link SessionAPI.connectPoll}.
 */
export interface ConnectPollOptions {
  /**
   * Maximum number of polling attempts. Default: 120.
   * Ignored if `timeoutMs` is set.
   */
  maxRetries?: number;
  /**
   * Absolute timeout in milliseconds. When set, overrides `maxRetries`.
   */
  timeoutMs?: number;
}

/**
 * Session API — connect/disconnect cloud sessions and list HL image versions.
 */
export function createSessionAPI(client: FetchClient) {
  return {
    /**
     * Connect a cloud session. Asynchronous provisioning — the endpoint returns
     * 200 (ready), 202 (provisioning), or 503 (failed). Use {@link connectPoll}
     * for a higher-level polling loop.
     */
    connect(version?: string, deviceId?: string) {
      const body: { version?: string; device_id?: string } = {};
      if (version) body.version = version;
      if (deviceId) body.device_id = deviceId;
      return client.POST('/v1/session/connect', {
        body: Object.keys(body).length > 0 ? body : undefined,
      });
    },

    /** Convenience: connect and throw on error (no polling). */
    async connectOrThrow(version?: string, deviceId?: string) {
      return unwrap(await this.connect(version, deviceId));
    },

    /**
     * Poll-based connect: repeatedly calls `connect()` until the session is
     * `ready` or `active`, or a terminal state (`failed`) is reached.
     *
     * - While `provisioning` waits `retry_after_ms` milliseconds before
     *   the next attempt.
     * - Throws on `failed` status with the server-provided `failure_reason`.
     * - Throws on timeout (configurable via `options`).
     *
     * @param version - Optional HL image version.
     * @param options - Polling configuration.
     * @param deviceId - Optional per-install device identity (D-DEV-04 gate).
     * @returns The final `SessionConnectResponse` with status `ready` or `active`.
     * @throws {DeviceAuthRequiredError} if the broker rejects the device with 403
     *   `device_authorization_required` — the caller must complete the email
     *   auth-code flow before retrying.
     */
    async connectPoll(version?: string, options?: ConnectPollOptions, deviceId?: string): Promise<SessionConnectResponse> {
      const maxRetries = options?.maxRetries ?? 120;
      const timeoutMs = options?.timeoutMs;
      const startTime = Date.now();

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Check absolute timeout before each attempt
        if (timeoutMs !== undefined && Date.now() - startTime > timeoutMs) {
          throw new Error(
            `Session provisioning timed out after ${timeoutMs}ms (${attempt} attempts)`,
          );
        }

        const { data, error, response } = await this.connect(version, deviceId);

        // ── Handle non-2xx responses ────────────────────────────────────
        if (error) {
          // 403: Device authorization required — terminal, not retryable
          if (response.status === 403) {
            const errBody = error as Record<string, unknown>;
            if (errBody.error === 'device_authorization_required') {
              throw new DeviceAuthRequiredError();
            }
          }
          // 503: Session provisioning failed — body is SessionConnectResponse
          if (response.status === 503) {
            const errBody = error as Record<string, unknown>;
            const reason = (errBody.failure_reason as string) ?? 'Unknown reason';
            throw new Error(`Session provisioning failed: ${reason}`);
          }
          // 401, 429, or other errors — use the standard error type
          throw new APIError(response.status, error as Record<string, unknown>);
        }

        // ── Handle 2xx responses ────────────────────────────────────────
        if (data) {
          switch (data.status) {
            case 'provisioning': {
              const delay = data.retry_after_ms ?? 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            case 'ready':
            case 'active':
              return data;
            case 'failed':
              throw new Error(
                `Session provisioning failed: ${data.failure_reason ?? 'Unknown reason'}`,
              );
          }
        }

        // Should not reach here with a well-formed API response
        throw new Error('Unexpected response from session connect endpoint');
      }

      throw new Error(
        `Session provisioning timed out after ${maxRetries} retries`,
      );
    },

    /** Convenience: {@link connectPoll} with throw semantics (alias for consistency). */
    async connectPollOrThrow(version?: string, options?: ConnectPollOptions, deviceId?: string): Promise<SessionConnectResponse> {
      return this.connectPoll(version, options, deviceId);
    },

    /**
     * Disconnect a cloud session. Transitions to a 5-minute grace period.
     */
    disconnect(sessionId?: string, reason?: string) {
      return client.POST('/v1/session/disconnect', {
        body: sessionId ? { session_id: sessionId, reason } : undefined,
      });
    },

    /** Convenience: disconnect and throw on error. */
    async disconnectOrThrow(sessionId?: string, reason?: string) {
      return unwrap(await this.disconnect(sessionId, reason));
    },

    /**
     * Report session connected (called by the conduct proxy).
     */
    connected() {
      return client.POST('/v1/session/connected');
    },

    /** Convenience: connected and throw on error. */
    async connectedOrThrow() {
      return unwrap(await this.connected());
    },

    /**
     * List available HL image versions.
     */
    versions() {
      return client.GET('/v1/versions');
    },

    /** Convenience: versions and throw on error. */
    async versionsOrThrow() {
      return unwrap(await this.versions());
    },
  };
}

export type SessionAPI = ReturnType<typeof createSessionAPI>;
