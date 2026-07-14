import type { FetchClient } from './types.js';
import { unwrap } from './errors.js';

/**
 * Subscription API — list tiers and get the current user's subscription.
 */
export function createSubscriptionAPI(client: FetchClient) {
  return {
    /**
     * List all subscription tiers. Public (no auth required).
     */
    listTiers() {
      return client.GET('/v1/subscription/tiers');
    },

    /** Convenience: list tiers and throw on error. */
    async listTiersOrThrow() {
      return unwrap(await this.listTiers());
    },

    /**
     * Get the current user's subscription. Resolves tier from auth context.
     */
    getMySubscription() {
      return client.GET('/v1/subscription/me');
    },

    /** Convenience: get subscription and throw on error. */
    async getMySubscriptionOrThrow() {
      return unwrap(await this.getMySubscription());
    },
  };
}

export type SubscriptionAPI = ReturnType<typeof createSubscriptionAPI>;
