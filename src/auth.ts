import type { AuthState, ClientOptions } from './config.js';
import { APIError, toAPIError } from './errors.js';

/**
 * Create the initial AuthState from client options.
 */
export function createAuthState(opts: ClientOptions): AuthState {
  if (opts.apiKey) {
    return { type: 'apiKey', token: opts.apiKey, refreshingPromise: null };
  }
  if (opts.paseto) {
    return {
      type: 'paseto',
      token: opts.paseto,
      refreshToken: opts.refreshToken,
      refreshingPromise: null,
    };
  }
  // Anonymous — no auth. Only hits public endpoints.
  return { type: 'apiKey', token: '', refreshingPromise: null };
}

/**
 * Update the stored PASETO token (and optionally refresh token).
 */
export function updateToken(auth: AuthState, token: string, refreshToken?: string): void {
  auth.token = token;
  if (refreshToken !== undefined) {
    auth.refreshToken = refreshToken;
  }
}

/**
 * Create a custom `fetch` function that:
 * 1. Injects the `Authorization: Bearer <token>` header.
 * 2. On 401 in PASETO mode, performs a single-flight refresh and retries.
 */
export function createAuthFetch(auth: AuthState, cloudURL: string): typeof fetch {
  return async (input, init?) => {
    // Build the request with auth header
    const request = new Request(input, init);
    if (auth.token) {
      request.headers.set('Authorization', `Bearer ${auth.token}`);
    }

    let response = await fetch(request);

    // Single-flight PASETO refresh on 401
    if (response.status === 401 && auth.type === 'paseto' && auth.refreshToken) {
      const promise = getOrCreateRefreshPromise(auth, cloudURL);
      try {
        await promise;
      } finally {
        // Only clear if we are the one that created it
        if (auth.refreshingPromise === promise) {
          auth.refreshingPromise = null;
        }
      }

      // Retry the original request with the new token
      const retryRequest = new Request(input, init);
      retryRequest.headers.set('Authorization', `Bearer ${auth.token}`);
      response = await fetch(retryRequest);
    }

    return response;
  };
}

/**
 * Get the existing refresh promise, or create a new one (single-flight).
 */
function getOrCreateRefreshPromise(auth: AuthState, cloudURL: string): Promise<string> {
  if (auth.refreshingPromise) {
    return auth.refreshingPromise;
  }

  auth.refreshingPromise = doRefresh(auth, cloudURL);
  return auth.refreshingPromise;
}

/**
 * Execute the refresh call.
 */
async function doRefresh(auth: AuthState, cloudURL: string): Promise<string> {
  const url = `${cloudURL}/v1/auth/refresh`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ refresh_token: auth.refreshToken }),
  });

  if (!response.ok) {
    throw await toAPIError(response);
  }

  const body = (await response.json()) as {
    token: string;
    refresh_token: string;
    expires_at: string;
  };

  auth.token = body.token;
  auth.refreshToken = body.refresh_token;
  return body.token;
}
