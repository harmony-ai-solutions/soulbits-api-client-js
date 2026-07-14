/**
 * Re-export the auto-generated OpenAPI types.
 *
 * NOTE: Import from this module, NOT from `generated.d.ts` directly,
 * so that consumers get a stable import path.
 */
export type { paths, components, webhooks, operations } from './generated.d.ts';

/**
 * The openapi-fetch client type parameterised on our paths.
 * Use this to type the `client` argument in API sub-modules.
 */
import type createOpenapiClient from 'openapi-fetch';
import type { paths as GeneratedPaths, components as GeneratedComponents } from './generated.d.ts';

/** The concrete client type returned by openapi-fetch `createClient<paths>()`. */
export type FetchClient = ReturnType<typeof createOpenapiClient<GeneratedPaths>>;

/** All response schema types accessible via `components["schemas"]`. */
export type Schemas = GeneratedComponents['schemas'];
