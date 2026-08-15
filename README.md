# @harmony-ai-solutions/soulbits-api-client

**First-party TypeScript/JavaScript client for the Soulbits REST API.**

Spans two REST hosts:
- **Cloud API** (`cloud.soulbits.app`) — auth, API keys, account, session, devices, subscription, OpenAPI self-download
- **Inference API** (`api.soulbits.app`) — LLM chat, embeddings, rerank, TTS, STT, VAD, speaker embedding, audio/voice conversion

No WebSocket — this is a pure REST client.

---

## Installation

```bash
npm install @harmony-ai-solutions/soulbits-api-client
```

Consumable as a git dependency too:

```bash
npm install github:harmony-ai-solutions/soulbits-api-client-js
```

## Quick start

### API Key mode (static bearer, no auto-refresh)

```ts
import { createClient } from '@harmony-ai-solutions/soulbits-api-client';

const client = createClient({ apiKey: 'sb_cloud_...' });

// List models (public — no auth needed)
const { data: models, error } = await client.models.listModels();
if (error) console.error(error);
else console.log(models);
```

### PASETO mode (auto-refresh on 401)

```ts
const client = createClient({
  paseto: 'v4.local....',
  refreshToken: '...',
});

// Chat completions
const { data: chat, error } = await client.inference.chat({
  body: {
    model: 'qwen-35-9b',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: false,
  },
});
```

Both raw `{ data, error, response }` and throwing convenience methods (`xxxOrThrow`) are provided.

## Node.js example

```ts
import { createClient, APIError } from '@harmony-ai-solutions/soulbits-api-client';

const client = createClient({});

// Raw result style
const { data: tiers } = await client.subscription.listTiers();
console.log(tiers);

// Throwing convenience style
try {
  const profile = await client.account.loginOrThrow('user@example.com', 's3cret!');
  console.log('Logged in:', profile.token);
} catch (err) {
  if (err instanceof APIError) {
    console.error(`API error ${err.status}: ${err.message}`);
  }
}
```

## React Native (Hermes) example

No polyfill required — this package uses only the global `fetch` (via `openapi-fetch`), which is available in Hermes 0.73+ / React Native 0.73+.

```ts
import { createClient } from '@harmony-ai-solutions/soulbits-api-client';

const client = createClient({
  paseto: storedPaseto,
  refreshToken: storedRefreshToken,
});

// Your app's silent token refresh is handled automatically
const { data: models } = await client.models.listModels();
```

> **Note:** If your RN environment does not have a global `fetch` (Hermes <0.73), install `react-native-fetch-api` or `whatwg-fetch` polyfill. No Node built-ins (`http`, `https`, `fs`, `crypto`, `buffer`) are imported by this package.

## API overview

The client exposes sub-APIs, each auto-routed to the correct host:

| Property | Host | Methods |
|---|---|---|
| `client.account` | Cloud | `login`, `register`, `refresh`, `verify`, `resendVerification`, `passwordResetRequest`, `passwordResetConfirm`, `googleSignIn`, `googleWebSignIn`, `appleSignIn`, `appleWebSignIn`, `logout`, `me`, `updateProfile`, `changePassword`, `linkGoogle`, `unlinkGoogle`, `linkApple`, `unlinkApple` |
| `client.apiKeys` | Cloud | `createAPIKey`, `listAPIKeys`, `revokeAPIKey` |
| `client.session` | Cloud | `connect`, `disconnect`, `connected`, `versions` |
| `client.subscription` | Cloud | `listTiers`, `getMySubscription` |
| `client.devices` | Cloud | `registerDevice`, `listDevices`, `revokeDevice`, `requestDeviceAuthCode`, `verifyDeviceAuthCode`, `approveDevice`, `getDeviceAuthorizationStatus` |
| `client.models` | Inference | `listModels` (with model_type / input_modalities / output_modalities filters) |
| `client.inference` | Inference | `chat`, `embeddings`, `rerank`, `tts`, `stt`, `vad`, `speakerEmbed`, `audioConvert`, `voiceConvert`, `imageGen` (deprecated) |

Every method returns `{ data, error, response }` (openapi-fetch style).  
Every method has an `xxxOrThrow` variant that returns just `data` and throws `APIError` on error.

> **`client.devices` exception:** the devices facade is convenience-style — its
> methods return camelCase domain objects directly (the snake_case wire format
> is handled internally) and throw `APIError` on non-2xx responses. Use
> `err.status` / `err.code` / `err.isAuthError` / `err.isRateLimited` for typed
> handling.

## Configuration

```ts
interface ClientOptions {
  apiKey?: string;        // sb_cloud_* — static bearer, no refresh
  paseto?: string;        // v4.local.* — auto-refreshed on 401
  refreshToken?: string;  // required when paseto is set
  cloudURL?: string;      // default: https://beta.cloud.soulbits.app
  inferenceURL?: string;  // default: https://beta.api.soulbits.app
}
```

## Regenerating types

The `src/generated.d.ts` file is committed to the repo so the build is green without running the generator. To regenerate from the OpenAPI spec:

```bash
npm run gen
```

This runs:

```bash
openapi-typescript openapi.yaml -o src/generated.d.ts
```

The generated file must match what `npm run gen` produces. Verify with:

```bash
npm run gen && git diff --exit-code src/generated.d.ts
```

## Building

```bash
npm run build    # tsup → dist/index.mjs + dist/index.cjs + dist/index.d.ts
npm test         # vitest run
```

## Error handling

The `APIError` class provides typed error information:

```ts
import { APIError } from '@harmony-ai-solutions/soulbits-api-client';

try {
  await client.account.loginOrThrow('user@example.com', 'wrong');
} catch (err) {
  if (err instanceof APIError) {
    console.log(err.status);             // 401
    console.log(err.code);               // "unauthorized" or error code
    console.log(err.message);            // Human-readable message
    console.log(err.isAuthError);        // true
    console.log(err.isRateLimited);      // false
    console.log(err.isQuotaError);       // false
    console.log(err.upgradeUrl);         // present on 402
    console.log(err.requiredTier);       // present on 402
    console.log(err.soulCreditsAvailable); // present on 402
    console.log(err.taskId);             // present on 504
  }
}
```

## License

MIT
