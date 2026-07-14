import createOpenapiClient from 'openapi-fetch';
import type { paths } from './generated.d.ts';
import type { ClientOptions } from './config.js';
import { createAuthFetch, createAuthState } from './auth.js';
import { resolveOptions } from './config.js';
import type { FetchClient } from './types.js';

export interface Transport {
  cloud: FetchClient;
  inference: FetchClient;
}

/**
 * Create two openapi-fetch clients (cloud + inference).
 *
 * Each client gets its own custom `fetch` that injects auth headers.
 * The cloud client additionally handles PASETO refresh on 401.
 * The inference client also uses the same auth-fetch (refresh is shared via the
 * common AuthState — refreshing the token is fine regardless of which host
 * triggered the 401).
 */
export function createTransport(opts: ClientOptions): Transport {
  const resolved = resolveOptions(opts);
  const auth = createAuthState(resolved);

  const cloudFetch = createAuthFetch(auth, resolved.cloudURL);
  const inferenceFetch = createAuthFetch(auth, resolved.cloudURL);

  const cloud = createOpenapiClient<paths>({
    baseUrl: resolved.cloudURL,
    fetch: cloudFetch,
  });

  const inference = createOpenapiClient<paths>({
    baseUrl: resolved.inferenceURL,
    fetch: inferenceFetch,
  });

  return { cloud, inference };
}
