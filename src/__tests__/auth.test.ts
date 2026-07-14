/**
 * Auth module tests — single-flight PASETO refresh on 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthState, createAuthFetch, updateToken } from '../auth.js';
import type { AuthState } from '../config.js';

function mockJSONResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createAuthState', () => {
  it('should create API Key auth state', () => {
    const state = createAuthState({ apiKey: 'sb_cloud_test' });
    expect(state.type).toBe('apiKey');
    expect(state.token).toBe('sb_cloud_test');
    expect(state.refreshToken).toBeUndefined();
    expect(state.refreshingPromise).toBeNull();
  });

  it('should create PASETO auth state', () => {
    const state = createAuthState({ paseto: 'v4.local.foo', refreshToken: 'rt_bar' });
    expect(state.type).toBe('paseto');
    expect(state.token).toBe('v4.local.foo');
    expect(state.refreshToken).toBe('rt_bar');
    expect(state.refreshingPromise).toBeNull();
  });

  it('should fall back to empty apiKey when no auth is given', () => {
    const state = createAuthState({});
    expect(state.type).toBe('apiKey');
    expect(state.token).toBe('');
    expect(state.refreshingPromise).toBeNull();
  });
});

describe('updateToken', () => {
  it('should update token and refreshToken', () => {
    const state: AuthState = {
      type: 'paseto',
      token: 'old',
      refreshToken: 'old_rt',
      refreshingPromise: null,
    };
    updateToken(state, 'new', 'new_rt');
    expect(state.token).toBe('new');
    expect(state.refreshToken).toBe('new_rt');
  });

  it('should only update token when refreshToken is omitted', () => {
    const state: AuthState = {
      type: 'paseto',
      token: 'old',
      refreshToken: 'old_rt',
      refreshingPromise: null,
    };
    updateToken(state, 'new');
    expect(state.token).toBe('new');
    expect(state.refreshToken).toBe('old_rt');
  });
});

describe('createAuthFetch (single-flight refresh)', () => {
  let auth: AuthState;
  const cloudURL = 'https://beta.cloud.soulbits.app';

  beforeEach(() => {
    vi.restoreAllMocks();
    auth = {
      type: 'paseto',
      token: 'v4.local.expired',
      refreshToken: 'rt_valid',
      refreshingPromise: null,
    };
  });

  it('should add Authorization header', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockJSONResponse({ message: 'ok' }));

    const authFetch = createAuthFetch(auth, cloudURL);
    await authFetch('https://beta.cloud.soulbits.app/v1/auth/me');

    const call = vi.mocked(fetch).mock.calls[0];
    const input = call[0];
    // When called directly (not through openapi-fetch), input is a string URL
    const request = new Request(input, call[1]);
    expect(request.headers.get('Authorization')).toBe('Bearer v4.local.expired');
    expect(request.url).toBe('https://beta.cloud.soulbits.app/v1/auth/me');
  });

  it('should skip refresh for API Key mode on 401', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockJSONResponse({ error: 'unauthorized' }, 401));

    const apiKeyAuth: AuthState = {
      type: 'apiKey',
      token: 'sb_cloud_test',
      refreshingPromise: null,
    };

    const authFetch = createAuthFetch(apiKeyAuth, cloudURL);
    const response = await authFetch('https://beta.cloud.soulbits.app/v1/auth/me');

    expect(response.status).toBe(401);
    // Should not have made a second call (no refresh attempt)
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should perform single-flight refresh on 401 (2 concurrent requests)', async () => {
    // Track how many normal (non-refresh) requests have been attempted
    let normalAttempts = 0;

    vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : (input as Request).url;

        if (url.includes('/v1/auth/refresh')) {
          return mockJSONResponse({
            token: 'v4.local.fresh',
            refresh_token: 'rt_fresh',
            expires_at: '2026-12-31T23:59:59Z',
          });
        }

        // Non-refresh requests
        normalAttempts++;
        if (normalAttempts <= 2) {
          // First two non-refresh calls return 401 (triggering refresh)
          return mockJSONResponse({ error: 'unauthorized' }, 401);
        }
        // Subsequent retries succeed
        return mockJSONResponse({ message: 'ok' });
      });

    const authFetch = createAuthFetch(auth, cloudURL);

    // Fire two concurrent requests
    const [resA, resB] = await Promise.all([
      authFetch('https://beta.cloud.soulbits.app/v1/auth/me'),
      authFetch('https://beta.cloud.soulbits.app/v1/auth/me'),
    ]);

    // Both should eventually succeed
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // There should be exactly 3 non-refresh calls (2 originals that 401 + 2 retries... wait)
    // Actually: 2 originals + 2 retries = 4 normal calls? No...
    // The first two get 401, the retries get 200. But with single-flight:
    // Request A (normalAttempts=1) → 401 → triggers refresh
    // Request B (normalAttempts=2) → 401 → shares refresh promise
    // Refresh succeeds
    // Request C retry (normalAttempts=3) → mock returns 200
    // Request D retry (normalAttempts=4) → mock returns 200
    // Wait, but the code creates retry requests for both A and B:
    // After `await promise` resolves, A creates retryRequest and calls fetch
    // Then B creates retryRequest and calls fetch
    // So total normal calls = 4 (2 originals + 2 retries)
    expect(normalAttempts).toBe(4);

    // Refresh should have been called exactly once
    const refreshCalls = vi.mocked(fetch).mock.calls.filter(
      (call) => String(call[0]).includes('/v1/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('should propagate refresh failure to all waiters', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/v1/auth/refresh')) {
          return mockJSONResponse({ error: 'refresh_failed', message: 'Token revoked' }, 401);
        }
        return mockJSONResponse({ error: 'unauthorized' }, 401);
      });

    const authFetch = createAuthFetch(auth, cloudURL);

    // Fire two concurrent requests — both should throw APIError
    const [resA, resB] = await Promise.allSettled([
      authFetch('https://beta.cloud.soulbits.app/v1/auth/me'),
      authFetch('https://beta.cloud.soulbits.app/v1/auth/me'),
    ]);

    // Both should reject (because refresh throws, and the throw propagates)
    expect(resA.status).toBe('rejected');
    expect(resB.status).toBe('rejected');

    // Refresh should have been called only once
    const refreshCalls = vi.mocked(fetch).mock.calls.filter(
      (call) => String(call[0]).includes('/v1/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('should clear refreshingPromise after successful refresh', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJSONResponse({ error: 'unauthorized' }, 401)) // original → 401
      .mockResolvedValueOnce(
        mockJSONResponse({
          token: 'v4.local.fresh',
          refresh_token: 'rt_fresh',
          expires_at: '2026-12-31T23:59:59Z',
        }), // refresh → success
      )
      .mockResolvedValueOnce(mockJSONResponse({ message: 'ok' })); // retry → success

    const authFetch = createAuthFetch(auth, cloudURL);
    const response = await authFetch('https://beta.cloud.soulbits.app/v1/auth/me');

    expect(response.status).toBe(200);
    expect(auth.refreshingPromise).toBeNull();
    expect(auth.token).toBe('v4.local.fresh');
    expect(auth.refreshToken).toBe('rt_fresh');
  });
});
