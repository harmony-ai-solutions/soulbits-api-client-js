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
| `client.session` | Cloud | `connect`, `connectPoll`, `disconnect`, `connected`, `versions`, `deleteData`, `deleteDataOrThrow`, `deleteStatus`, `deleteStatusOrThrow` (v0.3.0) |
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

## Cloud data purge (Reset Cloud Data)

Added in **v0.2.0**, the purge became fully async in **v0.3.0**.
`session.deleteData` starts a background purge of the authenticated user's
cloud-side engine data (hard-kills a live session, deletes every S3 version,
the beat schedule, and the DEK). It is idempotent and destructive — it
requires `confirm: "DELETE"`.

`POST /v1/session/data/delete` never returns a terminal result anymore: it
resolves immediately with `{ status: "in_progress", request_id }` (202 =
newly accepted, 200 = already running). Poll
`session.deleteStatus` / `deleteStatusOrThrow` for the terminal outcome:

- `in_progress` — purge active, with `phase` (`start|kill|routing|s3|beats|dek|done`) and `attempts`
- `deleted` — done, with `objects_deleted` / `versions_deleted` / `beats_removed` / `dek_deleted` / `finished_at`
- `failed` — the sweeper gave up; the user is unblocked but deletion was not guaranteed — retry the delete
- `none` — nothing running or remembered (the tombstone may have expired)

```ts
import {
  createClient,
  ConfirmationRequiredError,
  SnapshotBusyError,
  PurgeInProgressError,
  type DataPurgePhase,
} from '@harmony-ai-solutions/soulbits-api-client';

const client = createClient({ paseto, refreshToken });

// 1. Initiate — only ever returns in_progress (202) or already-running (200)
const { status, request_id } = await client.session.deleteDataOrThrow('DELETE');
if (status !== 'in_progress') throw new Error('unexpected');

// 2. Poll until terminal
let result = await client.session.deleteStatusOrThrow();
while (result.status === 'in_progress') {
  const phase = result.phase as DataPurgePhase; // 's3', 'beats', …
  await sleep(2000);
  result = await client.session.deleteStatusOrThrow();
}

if (result.status === 'deleted') {
  console.log('purged', result.objects_deleted, 'objects');
} else if (result.status === 'failed') {
  console.log('purge failed:', result.error);
}
```

Typed errors:

- 400 `confirmation_required` → `ConfirmationRequiredError`
- 409 `snapshot_busy` → `SnapshotBusyError` (retry after `err.retryAfterMs`)
- 401 / 503 / other → `APIError` (from both `deleteDataOrThrow` and `deleteStatusOrThrow`, so callers can refresh the token and retry)

`DataPurgePhase` is exported as a convenience union of the known phase
strings (`'start' | 'kill' | 'routing' | 's3' | 'beats' | 'dek' | 'done'`).

While a purge is in flight, `connectPoll` treats the server's `409
purge_in_progress` as **terminal** — it throws a `PurgeInProgressError` instead
of retrying, because connecting is blocked until the purge completes. The caller
waits `retryAfterMs` and starts a fresh connect flow once the purge finishes.

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
