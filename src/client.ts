import type { ClientOptions } from './config.js';
import { resolveOptions } from './config.js';
import { createTransport } from './transport.js';
import { createAccountAPI } from './account.js';
import { createAPIKeysAPI } from './apikeys.js';
import { createSessionAPI } from './session.js';
import { createSubscriptionAPI } from './subscription.js';
import { createModelsAPI } from './models.js';
import { createInferenceAPI } from './inference.js';
import type { AccountAPI } from './account.js';
import type { APIKeysAPI } from './apikeys.js';
import type { SessionAPI } from './session.js';
import type { SubscriptionAPI } from './subscription.js';
import type { ModelsAPI } from './models.js';
import type { InferenceAPI } from './inference.js';

/**
 * Soulbits API client.
 *
 * Each property exposes a typed sub-API auto-routed to the correct host:
 * - {@link SoulbitsClient.account}        → Cloud API (auth, profile, OAuth, password)
 * - {@link SoulbitsClient.apiKeys}         → Cloud API (create / list / revoke API keys)
 * - {@link SoulbitsClient.session}         → Cloud API (HL session lifecycle)
 * - {@link SoulbitsClient.subscription}    → Cloud API (tiers / current subscription)
 * - {@link SoulbitsClient.models}          → Inference API (public model catalog)
 * - {@link SoulbitsClient.inference}       → Inference API (chat, embeddings, rerank, audio, image)
 */
export interface SoulbitsClient {
  account: AccountAPI;
  apiKeys: APIKeysAPI;
  session: SessionAPI;
  subscription: SubscriptionAPI;
  models: ModelsAPI;
  inference: InferenceAPI;
}

/**
 * Create a new Soulbits API client.
 *
 * @param opts - Client configuration.
 *
 * @example
 * ```ts
 * // API Key mode (static bearer, no automatic refresh)
 * const client = createClient({ apiKey: 'sb_cloud_...' });
 * const { data, error } = await client.models.listModels();
 *
 * // PASETO mode (auto-refresh on 401)
 * const client = createClient({ paseto, refreshToken });
 * const { data, error } = await client.inference.chat({ body: { model: '...', messages: [...] } });
 * ```
 */
export function createClient(opts: ClientOptions = {}): SoulbitsClient {
  const resolved = resolveOptions(opts);
  const { cloud, inference } = createTransport(resolved);

  return {
    account: createAccountAPI(cloud),
    apiKeys: createAPIKeysAPI(cloud),
    session: createSessionAPI(cloud),
    subscription: createSubscriptionAPI(cloud),
    models: createModelsAPI(inference),
    inference: createInferenceAPI(inference),
  };
}
