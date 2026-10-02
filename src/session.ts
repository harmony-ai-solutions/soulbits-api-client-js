import type { FetchClient, components } from './types.js';
import {
  APIError,
  ConfirmationRequiredError,
  DeviceAuthRequiredError,
  PurgeInProgressError,
  SnapshotBusyError,
  unwrap,
} from './errors.js';

type SessionConnectResponse = components['schemas']['SessionConnectResponse'];
type SessionDataDeleteResponse = components['schemas']['SessionDataDeleteResponse'];
type SessionDataDeleteStatusResponse = components['schemas']['SessionDataDeleteStatusResponse'];

/**
 * Coarse phase of an in-flight data purge, as reported by
 * {@link SessionAPI.deleteStatus}. The generated schema types `phase` as a
 * plain string; this union lets consumers switch exhaustively over the known
 * phases without string casting.
 */
export type DataPurgePhase = 'start' | 'kill' | 'routing' | 's3' | 'beats' | 'dek' | 'done';

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
          // 409: A data purge is in progress — terminal, not retryable by this
          // poll. The caller must wait retryAfterMs and start a fresh flow once
          // the purge completes.
          if (response.status === 409) {
            const errBody = error as Record<string, unknown>;
            if (errBody.error === 'purge_in_progress') {
              throw new PurgeInProgressError(errBody.retry_after_ms as number | undefined);
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

    /**
     * Start an async purge of ALL cloud-side engine data for the
     * authenticated user (hard-kills a live session, deletes every S3
     * version, the beat schedule, and the DEK). Requires confirm: "DELETE".
     * Idempotent.
     *
     * The purge runs in the background. This POST only ever resolves with
     * `status: "in_progress"` plus a `request_id` (202 = newly accepted,
     * 200 = already running) — it NEVER returns "deleted". Follow progress
     * with {@link deleteStatus} / {@link deleteStatusOrThrow} until a
     * terminal `deleted` or `failed` outcome.
     */
    deleteData(confirm: string = 'DELETE') {
      return client.POST('/v1/session/data/delete', { body: { confirm: confirm as 'DELETE' } });
    },

    /**
     * Convenience: {@link deleteData} with typed error mapping.
     *
     * - 400 `confirmation_required` → {@link ConfirmationRequiredError}
     * - 409 `snapshot_busy` → {@link SnapshotBusyError}(retry_after_ms)
     * - 401 / 503 / other errors → {@link APIError}
     *
     * Resolves with the initiation shape `{ status: "in_progress",
     * request_id }` (202 or 200). The terminal outcome ("deleted" | "failed")
     * comes from {@link deleteStatus} — poll it after initiating.
     */
    async deleteDataOrThrow(confirm: string = 'DELETE'): Promise<SessionDataDeleteResponse> {
      const result = await this.deleteData(confirm);
      if (result.error) {
        const body = result.error as Record<string, unknown>;
        const status = result.response.status;
        if (status === 400 && body.error === 'confirmation_required') {
          throw new ConfirmationRequiredError();
        }
        if (status === 409 && body.error === 'snapshot_busy') {
          throw new SnapshotBusyError(body.retry_after_ms as number | undefined);
        }
        throw new APIError(status, body);
      }
      return result.data as SessionDataDeleteResponse;
    },

    /**
     * Poll the status of the authenticated user's data purge. Always returns
     * 200 when authed, with one of four shapes:
     *
     * - `in_progress` — purge active/stalled, with `phase` and `attempts`
     * - `deleted` — terminal success, with the S3/beat/DEK counters
     * - `failed` — terminal failure; the user is unblocked, retry the delete
     * - `none` — nothing running or remembered (tombstone may have expired)
     *
     * Returns the raw openapi-fetch result — check `data.status` for the
     * terminal outcome. Use {@link deleteStatusOrThrow} to throw on error.
     */
    deleteStatus() {
      return client.GET('/v1/session/data/delete/status');
    },

    /**
     * Convenience: {@link deleteStatus} with throw semantics.
     *
     * Throws {@link APIError} on any error response — including 401, so the
     * caller can refresh the token and retry — and resolves with the typed
     * {@link SessionDataDeleteStatusResponse} union otherwise. The status
     * discriminates: `in_progress` (with `phase`/`attempts`), `deleted`
     * (with counters), `failed` (with `error` + zero counters), or `none`.
     */
    async deleteStatusOrThrow(): Promise<SessionDataDeleteStatusResponse> {
      const result = await this.deleteStatus();
      if (result.error) {
        throw new APIError(result.response.status, result.error as Record<string, unknown>);
      }
      return result.data as SessionDataDeleteStatusResponse;
    },
  };
}

export type SessionAPI = ReturnType<typeof createSessionAPI>;
