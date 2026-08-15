/**
 * Soulbits API Client — first-party TypeScript/JavaScript client.
 *
 * Provides a {@link createClient} factory that returns typed sub-APIs for
 * auth, account, API keys, session, subscription, devices, models, inference,
 * and audio.
 *
 * ## Quick start
 *
 * ```ts
 * // API Key mode (static bearer, no refresh)
 * const client = createClient({ apiKey: 'sb_cloud_...' });
 * const models = await client.models.listModels();
 *
 * // PASETO mode (with auto-refresh on 401)
 * const client = createClient({ paseto, refreshToken });
 * const chat = await client.inference.chat({ model: 'qwen-35-9b', messages: [...] });
 * ```
 *
 * @module @harmony-ai-solutions/soulbits-api-client
 */

export { createClient } from './client.js';

// ── Re-export types ────────────────────────────────────────────────────────
export type {
  FetchClient,
  paths,
  components,
  Schemas,
} from './types.js';

export type { ClientOptions } from './config.js';
export { APIError, DeviceAuthRequiredError } from './errors.js';

// ── Sub-API types ──────────────────────────────────────────────────────────
export type { AccountAPI } from './account.js';
export type { APIKeysAPI } from './apikeys.js';
export type { SessionAPI } from './session.js';
export type { SubscriptionAPI } from './subscription.js';
export type { DevicesAPI } from './devices.js';
export type {
  DeviceDTO,
  DeviceListItemDTO,
  DeviceAuthorizationStatusDTO,
  ApproveDeviceResult,
  RegisterDeviceParams,
} from './devices.js';
export type { ModelsAPI } from './models.js';
export type { InferenceAPI } from './inference.js';

// ── Auth types ─────────────────────────────────────────────────────────────
export type { AuthState } from './config.js';
