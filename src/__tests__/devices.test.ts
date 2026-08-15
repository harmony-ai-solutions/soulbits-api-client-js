/**
 * DevicesAPI tests — register/list/revoke/authorize against the typed client.
 *
 * We mock the global `fetch` so no real network traffic occurs, and assert on
 * the Request objects openapi-fetch sends to our custom fetch (snake_case wire
 * bodies) plus the camelCase DTOs returned by the facade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../client.js';
import { APIError } from '../errors.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a mock Response for openapi-fetch to consume. */
function mockResponse(body: unknown, status = 200): Response {
  // 204 No Content must not carry a body.
  if (status === 204) {
    return new Response(null, { status, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Extract what openapi-fetch sent to our custom fetch.
 * openapi-fetch passes a single Request object.
 */
function extractRequest(callIndex = 0): Request {
  const call = vi.mocked(fetch).mock.calls[callIndex];
  const input = call[0];
  if (input instanceof Request) return input;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
  const init = call[1] ?? {};
  return new Request(url, init);
}

/** A canonical snake_case `Device` / `DeviceListItem` wire payload. */
const DEVICE_WIRE = {
  device_id: 'device-abc-123',
  user_id: 'user-1',
  platform: 'ios',
  push_token: 'push-tok-1',
  authorized: true,
  authorized_at: '2026-08-15T10:00:00Z',
  last_seen_at: '2026-08-15T10:00:00Z',
  created_at: '2026-08-15T09:00:00Z',
  updated_at: '2026-08-15T10:00:00Z',
};

// ── registerDevice ─────────────────────────────────────────────────────────

describe('DevicesAPI.registerDevice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps camelCase params to a snake_case body and returns a camelCase DTO', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(DEVICE_WIRE, 200)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const device = await client.devices.registerDevice({
      deviceId: 'device-abc-123',
      platform: 'ios',
      pushToken: 'push-tok-1',
    });

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices');
    expect(req.method).toBe('POST');
    const body = JSON.parse(await req.text());
    expect(body).toEqual({
      device_id: 'device-abc-123',
      platform: 'ios',
      push_token: 'push-tok-1',
    });

    expect(device).toEqual({
      deviceId: 'device-abc-123',
      userId: 'user-1',
      platform: 'ios',
      pushToken: 'push-tok-1',
      authorized: true,
      authorizedAt: '2026-08-15T10:00:00Z',
      lastSeenAt: '2026-08-15T10:00:00Z',
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
    });
  });

  it('omits push_token from the body when pushToken is not provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ ...DEVICE_WIRE, push_token: null }, 200)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.devices.registerDevice({ deviceId: 'device-abc-123', platform: 'web' });

    const req = extractRequest(0);
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ device_id: 'device-abc-123', platform: 'web' });
  });

  it('sends push_token: null on the wire when pushToken is null', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ ...DEVICE_WIRE, push_token: null }, 200)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.devices.registerDevice({
      deviceId: 'device-abc-123',
      platform: 'ios',
      pushToken: null,
    });

    const req = extractRequest(0);
    const body = JSON.parse(await req.text());
    expect(body).toEqual({
      device_id: 'device-abc-123',
      platform: 'ios',
      push_token: null,
    });
  });
});

// ── listDevices ────────────────────────────────────────────────────────────

describe('DevicesAPI.listDevices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns camelCase DTOs from snake_case wire items', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(
        mockResponse([
          DEVICE_WIRE,
          {
            ...DEVICE_WIRE,
            device_id: 'device-2',
            platform: 'android',
            authorized: false,
            authorized_at: null,
            last_seen_at: null,
          },
        ], 200),
      ),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const devices = await client.devices.listDevices();

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices');
    expect(req.method).toBe('GET');

    expect(devices).toHaveLength(2);
    expect(devices[0]).toEqual({
      deviceId: 'device-abc-123',
      platform: 'ios',
      pushToken: 'push-tok-1',
      authorized: true,
      authorizedAt: '2026-08-15T10:00:00Z',
      lastSeenAt: '2026-08-15T10:00:00Z',
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
    });
    // List items have no user_id on the wire → no userId in the DTO
    expect(devices[0]).not.toHaveProperty('userId');
    expect(devices[1]).toEqual(expect.objectContaining({
      deviceId: 'device-2',
      platform: 'android',
      authorized: false,
      authorizedAt: null,
      lastSeenAt: null,
    }));
  });
});

// ── revokeDevice ───────────────────────────────────────────────────────────

describe('DevicesAPI.revokeDevice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs /v1/devices/{device_id} and resolves on 204', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse('', 204)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await expect(client.devices.revokeDevice('device-abc-123')).resolves.toBeUndefined();

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices/device-abc-123');
    expect(req.method).toBe('DELETE');
  });

  it('throws APIError with status 404 when the device does not exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'not_found', message: 'Device not found' }, 404)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.revokeDevice('device-missing').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(404);
  });
});

// ── requestDeviceAuthCode ──────────────────────────────────────────────────

describe('DevicesAPI.requestDeviceAuthCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs /v1/devices/authorize with device_id only and resolves on 202', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ message: 'Auth code emailed' }, 202)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const result = await client.devices.requestDeviceAuthCode('device-abc-123');

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices/authorize');
    expect(req.method).toBe('POST');
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ device_id: 'device-abc-123' });
    expect(result).toEqual({ message: 'Auth code emailed' });
  });
});

// ── verifyDeviceAuthCode ───────────────────────────────────────────────────

describe('DevicesAPI.verifyDeviceAuthCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('includes the code in the snake_case body and resolves on 200', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ message: 'Device authorized' }, 200)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const result = await client.devices.verifyDeviceAuthCode('device-abc-123', '123456');

    const req = extractRequest(0);
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ device_id: 'device-abc-123', code: '123456' });
    expect(result).toEqual({ message: 'Device authorized' });
  });

  it('throws APIError with status 401 on unauthorized', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'unauthorized' }, 401)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.verifyDeviceAuthCode('device-abc-123', '123456').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(401);
    expect(err.isAuthError).toBe(true);
  });

  it('throws APIError with status 429 on rate limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'rate_limited', message: 'Slow down' }, 429)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.verifyDeviceAuthCode('device-abc-123', '123456').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(429);
    expect(err.isRateLimited).toBe(true);
  });
});

// ── approveDevice ──────────────────────────────────────────────────────────

describe('DevicesAPI.approveDevice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the token and returns the camelCase { deviceId }', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ message: 'Device approved', device_id: 'device-abc-123' }, 200)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const result = await client.devices.approveDevice('tok-abc-123');

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices/approve');
    expect(req.method).toBe('POST');
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ token: 'tok-abc-123' });
    expect(result).toEqual({ deviceId: 'device-abc-123' });
  });

  it('throws APIError with status 401 on unauthorized', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'unauthorized' }, 401)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.approveDevice('tok-abc-123').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(401);
    expect(err.isAuthError).toBe(true);
  });

  it('throws APIError with status 403 on forbidden / token mismatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'invalid_token', message: 'Token mismatch' }, 403)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.approveDevice('tok-wrong').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(403);
  });

  it('throws APIError with status 429 on rate limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(mockResponse({ error: 'rate_limited', message: 'Slow down' }, 429)),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const err = await client.devices.approveDevice('tok-abc-123').catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(429);
    expect(err.isRateLimited).toBe(true);
  });
});

// ── getDeviceAuthorizationStatus ───────────────────────────────────────────

describe('DevicesAPI.getDeviceAuthorizationStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes device_id as a query param and maps to camelCase', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(
        mockResponse({
          device_id: 'device-abc-123',
          authorized: false,
          authorization_pending: true,
        }, 200),
      ),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const status = await client.devices.getDeviceAuthorizationStatus('device-abc-123');

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/devices/authorize/status');
    expect(req.url).toContain('device_id=device-abc-123');
    expect(req.method).toBe('GET');
    expect(status).toEqual({ authorized: false, authorizationPending: true });
  });

  it('reports an authorized, no-longer-pending device', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(
      Promise.resolve(
        mockResponse({
          device_id: 'device-abc-123',
          authorized: true,
          authorization_pending: false,
        }, 200),
      ),
    );

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const status = await client.devices.getDeviceAuthorizationStatus('device-abc-123');
    expect(status).toEqual({ authorized: true, authorizationPending: false });
  });
});
