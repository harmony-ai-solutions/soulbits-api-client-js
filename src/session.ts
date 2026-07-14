import type { FetchClient } from './types.js';
import { unwrap } from './errors.js';

/**
 * Session API — connect/disconnect cloud sessions and list HL image versions.
 */
export function createSessionAPI(client: FetchClient) {
  return {
    /**
     * Connect a cloud session. Acquires a connect lock, assigns a warm-pool HL task.
     */
    connect(version?: string) {
      return client.POST('/v1/session/connect', {
        body: version ? { version } : undefined,
      });
    },

    /** Convenience: connect and throw on error. */
    async connectOrThrow(version?: string) {
      return unwrap(await this.connect(version));
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
