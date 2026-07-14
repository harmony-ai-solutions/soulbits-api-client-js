/**
 * Integration-style test for the complete client flow.
 *
 * We mock the global `fetch` so no real network traffic occurs.
 * openapi-fetch calls the custom fetch with a single `Request` argument,
 * so we assert against the Request object directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../client.js';

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
  // openapi-fetch v0.13 passes a Request object as the sole argument
  if (input instanceof Request) return input;
  // Fallback for direct fetch calls (no openapi-fetch wrapping)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
  const init = call[1] ?? {};
  return new Request(url, init);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform a login → listModels → chat flow (API Key mode)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    // 1st call: login → 200 TokenResponse
    fetchMock.mockReturnValueOnce(
      Promise.resolve(
        mockResponse({
          token: 'v4.local.fake-token',
          refresh_token: 'rt_fake',
          expires_at: '2026-12-31T23:59:59Z',
        }),
      ),
    );

    // 2nd call: listModels → 200 models array
    fetchMock.mockReturnValueOnce(
      Promise.resolve(
        mockResponse([
          {
            model_id: 'qwen-35-9b',
            display_name: 'Qwen 3.5 9B',
            model_type: 'llm' as const,
            min_tier: 'free' as const,
            description: 'A powerful LLM',
            input_modalities: ['text'],
            output_modalities: ['text'],
          },
        ]),
      ),
    );

    // 3rd call: chat → 200 ChatCompletionResponse
    fetchMock.mockReturnValueOnce(
      Promise.resolve(
        mockResponse({
          id: 'chat-fake',
          object: 'chat.completion',
          created: 1234567890,
          model: 'qwen-35-9b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ),
    );

    // Act
    const client = createClient({ apiKey: 'sb_cloud_fakekey' });

    const loginResult = await client.account.login('user@test.com', 'password123');
    expect(loginResult.data).toBeDefined();
    expect(loginResult.data?.token).toBe('v4.local.fake-token');

    const modelsResult = await client.models.listModels();
    expect(modelsResult.data).toBeDefined();
    expect(modelsResult.data).toHaveLength(1);
    expect(modelsResult.data![0].model_id).toBe('qwen-35-9b');

    const chatResult = await client.inference.chat({
      body: {
        model: 'qwen-35-9b',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      },
    });
    expect(chatResult.data).toBeDefined();
    expect(chatResult.data?.choices[0]?.message?.content).toBe('Hello!');

    // Assert fetch call count
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Verify login call
    const loginReq = extractRequest(0);
    expect(loginReq.url).toContain('/v1/auth/login');
    expect(loginReq.method).toBe('POST');

    // Verify models call (inference host)
    const modelsReq = extractRequest(1);
    expect(modelsReq.url).toContain('beta.api.soulbits.app');
    expect(modelsReq.url).toContain('/v1/models');
    expect(modelsReq.method).toBe('GET');

    // Verify chat call (inference host)
    const chatReq = extractRequest(2);
    expect(chatReq.url).toContain('beta.api.soulbits.app');
    expect(chatReq.url).toContain('/v1/chat/completions');
    expect(chatReq.method).toBe('POST');
  });

  it('should pass Authorization header for API Key mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse({ message: 'Hello' })));

    const client = createClient({ apiKey: 'sb_cloud_testkey' });
    await client.models.listModels();

    const req = extractRequest(0);
    expect(req.headers.get('Authorization')).toBe('Bearer sb_cloud_testkey');
  });

  it('should return error from raw result and throw from convenience method', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // Each call gets a fresh Response so body isn't consumed twice
    const errResponse = () => mockResponse({ error: 'unauthorized', message: 'Bad credentials' }, 401);
    fetchMock
      .mockResolvedValueOnce(errResponse())
      .mockResolvedValueOnce(errResponse());

    const client = createClient({ apiKey: 'sb_cloud_fake' });

    // Raw result style
    const result = await client.account.login('bad@user.com', 'wrong');
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.response.status).toBe(401);

    // Throwing convenience style
    await expect(
      client.account.loginOrThrow('bad@user.com', 'wrong'),
    ).rejects.toThrow(/Bad credentials/);
  });

  it('should use custom base URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReturnValue(Promise.resolve(mockResponse([])));

    const client = createClient({
      apiKey: 'sb_cloud_test',
      cloudURL: 'https://custom.cloud.example.com',
      inferenceURL: 'https://custom.api.example.com',
    });

    await client.models.listModels();

    const req = extractRequest(0);
    expect(req.url).toContain('custom.api.example.com');
  });
});
