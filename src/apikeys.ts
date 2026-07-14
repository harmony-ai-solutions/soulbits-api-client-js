import type { FetchClient } from './types.js';
import { unwrap } from './errors.js';

/**
 * API Keys API — create, list, revoke `sb_cloud_*` keys.
 * PASETO-authenticated only (API keys cannot manage other API keys).
 */
export function createAPIKeysAPI(client: FetchClient) {
  return {
    /**
     * Create an API key. Returns the full key ONCE.
     * Max 5 active (non-revoked) keys per user.
     * PASETO required.
     */
    createAPIKey(name?: string) {
      return client.POST('/v1/auth/api-keys', {
        body: name ? { name } : undefined,
      });
    },

    /** Convenience: create API key and throw on error. */
    async createAPIKeyOrThrow(name?: string) {
      return unwrap(await this.createAPIKey(name));
    },

    /**
     * List all API keys for the current user. PASETO required.
     */
    listAPIKeys() {
      return client.GET('/v1/auth/api-keys');
    },

    /** Convenience: list API keys and throw on error. */
    async listAPIKeysOrThrow() {
      return unwrap(await this.listAPIKeys());
    },

    /**
     * Revoke an API key by ID. Idempotent. PASETO required.
     */
    revokeAPIKey(id: string) {
      return client.DELETE('/v1/auth/api-keys/{id}', {
        params: { path: { id } },
      });
    },
  };
}

export type APIKeysAPI = ReturnType<typeof createAPIKeysAPI>;
