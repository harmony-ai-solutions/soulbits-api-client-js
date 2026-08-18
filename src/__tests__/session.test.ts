/**
 * SessionAPI tests — connect/connectPoll behavior against the typed client.
 *
 * We mock the global `fetch` so no real network traffic occurs, and assert
 * on the Request objects openapi-fetch sends to our custom fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../client.js';
import {
  ConfirmationRequiredError,
  DeviceAuthRequiredError,
  PurgeInProgressError,
  SnapshotBusyError,
} from '../errors.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a mock Response for openapi-fetch to consume. */
function mockResponse(body: unknown, status = 200): Response {
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SessionAPI.connect', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends device_id in the request body when provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'ready',
      session_id: 'sess-device',
      proxy_endpoint: 'wss://proxy.example.com/ws/sync',
    })));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.session.connect(undefined, 'device-abc-123');

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/session/connect');
    expect(req.method).toBe('POST');
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ device_id: 'device-abc-123' });
  });

  it('sends version and device_id together when both provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'ready',
      session_id: 'sess-device',
      proxy_endpoint: 'wss://proxy.example.com/ws/sync',
    })));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.session.connect('v1.2.3', 'device-abc-123');

    const req = extractRequest(0);
    const body = JSON.parse(await req.text());
    expect(body).toEqual({ version: 'v1.2.3', device_id: 'device-abc-123' });
  });

  it('sends an empty body when neither version nor device_id is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'ready',
      session_id: 'sess-plain',
      proxy_endpoint: 'wss://proxy.example.com/ws/sync',
    })));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.session.connect();

    const req = extractRequest(0);
    const body = await req.text();
    expect(body).toBe('');
  });
});

describe('SessionAPI.connectPoll', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('polls through provisioning and resolves when ready', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockReturnValueOnce(Promise.resolve(mockResponse({
        status: 'provisioning',
        session_id: 'sess-poll',
        retry_after_ms: 1,
      }, 202)))
      .mockReturnValueOnce(Promise.resolve(mockResponse({
        status: 'ready',
        session_id: 'sess-poll',
        proxy_endpoint: 'wss://proxy.example.com/ws/sync',
      }, 200)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const result = await client.session.connectPoll(undefined, { maxRetries: 5 }, 'device-abc-123');

    expect(result).toEqual({
      status: 'ready',
      session_id: 'sess-poll',
      proxy_endpoint: 'wss://proxy.example.com/ws/sync',
    });

    // Both polls must carry device_id
    for (let i = 0; i < 2; i++) {
      const req = extractRequest(i);
      const body = JSON.parse(await req.text());
      expect(body).toEqual({ device_id: 'device-abc-123' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws DeviceAuthRequiredError on 403 device_authorization_required (terminal)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { error: 'device_authorization_required' },
      403,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    await expect(
      client.session.connectPoll(undefined, { maxRetries: 5 }, 'device-unauthorized'),
    ).rejects.toBeInstanceOf(DeviceAuthRequiredError);

    // Terminal — must NOT keep polling after a 403
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws APIError for other 4xx errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { error: 'unauthorized', message: 'Bad credentials' },
      401,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    await expect(
      client.session.connectPoll(undefined, { maxRetries: 5 }),
    ).rejects.toThrow(/Bad credentials/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a provisioning failure error on 503', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { status: 'failed', failure_reason: 'circuit open' },
      503,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    await expect(
      client.session.connectPoll(undefined, { maxRetries: 5 }),
    ).rejects.toThrow('Session provisioning failed: circuit open');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws PurgeInProgressError on 409 purge_in_progress (terminal, single request)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { error: 'purge_in_progress', retry_after_ms: 5000 },
      409,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    const err = await client.session
      .connectPoll(undefined, { maxRetries: 5 })
      .then(() => { throw new Error('expected rejection'); }, (e) => e);

    expect(err).toBeInstanceOf(PurgeInProgressError);
    expect((err as PurgeInProgressError).retryAfterMs).toBe(5000);
    expect(err.message).toBe('purge_in_progress');

    // Terminal — must NOT keep polling after a 409
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SessionAPI.deleteData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends confirm=DELETE and passes through the deleted result + counts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'deleted',
      objects_deleted: 42,
      versions_deleted: 3,
      beats_removed: 7,
      dek_deleted: true,
    }, 200)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const { data } = await client.session.deleteData();

    const req = extractRequest(0);
    expect(req.url).toContain('/v1/session/data/delete');
    expect(req.method).toBe('POST');
    expect(JSON.parse(await req.text())).toEqual({ confirm: 'DELETE' });

    expect(data).toEqual({
      status: 'deleted',
      objects_deleted: 42,
      versions_deleted: 3,
      beats_removed: 7,
      dek_deleted: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('defaults to confirm=DELETE', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'deleted',
      objects_deleted: 0,
      versions_deleted: 0,
      beats_removed: 0,
      dek_deleted: true,
    }, 200)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    await client.session.deleteData();

    const req = extractRequest(0);
    expect(JSON.parse(await req.text())).toEqual({ confirm: 'DELETE' });
  });

  it('deleteDataOrThrow resolves normally with status=in_progress on 200', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({
      status: 'in_progress',
      request_id: 'purge-abc-123',
    }, 200)));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });
    const result = await client.session.deleteDataOrThrow();

    expect(result).toEqual({
      status: 'in_progress',
      request_id: 'purge-abc-123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deleteDataOrThrow throws ConfirmationRequiredError on 400 confirmation_required', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { error: 'confirmation_required' },
      400,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    await expect(client.session.deleteDataOrThrow('WRONG')).rejects.toBeInstanceOf(ConfirmationRequiredError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deleteDataOrThrow throws SnapshotBusyError with retryAfterMs on 409 snapshot_busy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse(
      { error: 'snapshot_busy', retry_after_ms: 2000 },
      409,
    )));

    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    const err = await client.session
      .deleteDataOrThrow()
      .then(() => { throw new Error('expected rejection'); }, (e) => e);

    expect(err).toBeInstanceOf(SnapshotBusyError);
    expect((err as SnapshotBusyError).retryAfterMs).toBe(2000);
    expect(err.message).toBe('snapshot_busy');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
