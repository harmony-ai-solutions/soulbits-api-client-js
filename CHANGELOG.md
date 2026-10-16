# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-16

Regenerated from the committed Soulbits OpenAPI spec (cloud backend commit
`e901965`, "better device pairing via backend"). The vendored `openapi.yaml`
was refreshed wholesale; the regenerated `src/generated.d.ts` is the source of
truth for the requests/responses below.

### Added

- **Delegated device enrollment (phase 7-15).**
  - `POST /v1/devices/enrollment-grants` (`EnrollmentGrantRequest` →
    `EnrollmentGrantResponse`) — an already-authorized device mints a
    short-lived, single-use grant that vouches for a new device.
  - `POST /v1/auth/device/enroll` (`DeviceEnrollRequest`) — the new device
    redeems the grant for its OWN device-scoped session; the grant itself is the
    credential, so no account auth is required.
- **Portal-mediated connect sessions (phase 7-15 C2).**
  - `POST /v1/devices/connect-session` (`DeviceConnectSessionRequest`) — the
    engine announces itself and receives an unguessable `connect_id`, a
    once-shown 256-bit `session_secret` (SHA-256 at rest), and the portal URL.
  - `GET /v1/devices/connect-session/{connect_id}` — the engine polls with its
    secret until the portal user allows (or denies) the sign-in.
  - `GET /v1/devices/connect-session/{connect_id}/meta` — public metadata for
    the portal approval page.
  - `POST /v1/devices/connect-session/{connect_id}/approve` — the signed-in
    portal user approves the connect session.
- **Data-blind sync relay (phases 7-1 / 7-5).**
  - `POST /v1/devices/sync-pairing` (`SyncPairingRequest` →
    `SyncPairingResponse`) — mint a single-use pairing token binding
    (user, device, dataset).
  - `POST /v1/sync/pairing/consume` and `GET /v1/sync/status` — pairing-token
    redemption and buffer status.
- **Sync-group key escrow + rotation flag (phase 7-4).**
  - `PUT /v1/account/sync-key`, `GET /v1/account/sync-key`,
    `DELETE /v1/account/sync-key` (`SyncKeyPutRequest` / `SyncKeyResponse` /
    `SyncKeyStatus`) — escrow the client-wrapped sync-group key (opaque, ≤1 KiB).
  - `PUT /v1/account/sync-rotation-required`,
    `DELETE /v1/account/sync-rotation-required` (`SyncRotationPutRequest` /
    `SyncRotationStatus`) — drive/clear a pending sync-key rotation.
- **Opaque backup blobs + manifests (phase 7-5).**
  - `PUT`/`GET`/`DELETE /v1/backup/objects/{sha256}` and
    `PUT`/`GET /v1/backup/manifest/{device}` — engine-encrypted backup storage.

### Removed

- **Session-hosting retirement.** The `/v1/session/*` paths are gone from the
  committed cloud spec, so the `session` facade (`src/session.ts`,
  `SessionAPI`, `DataPurgePhase`) and its exports were removed. This is a
  breaking change to the JS surface: `client.session` no longer exists. (See
  `0.3.0` for the last release that shipped it.)

### Changed

- `openapi.yaml` re-vendored from the committed cloud spec; `src/generated.d.ts`
  regenerated (account-deletion prose refreshed).

## [0.3.0] - 2026-10-02

### Changed

- **Async cloud data purge contract.** `session.deleteData` / `deleteDataOrThrow`
  now only ever resolve with `{ status: "in_progress", request_id }` (202 =
  newly accepted, 200 = already running). The terminal outcome is no longer
  returned by the POST — poll the new status endpoint instead.
- `SessionDataDeleteResponse` status is now `in_progress` only; `deleted` moved
  to the status endpoint.

### Added

- `session.deleteStatus()` — raw `GET /v1/session/data/delete/status` result
  for the authenticated user's purge. Returns one of four shapes:
  `in_progress` (with `phase`/`attempts`), `deleted` (with S3/beat/DEK
  counters), `failed` (with `error`, user unblocked), or `none`.
- `session.deleteStatusOrThrow()` — throwing convenience over `deleteStatus`
  that raises `APIError` on any error response (incl. 401, so callers can
  refresh + retry).
- `DataPurgePhase` type union (`start | kill | routing | s3 | beats | dek | done`)
  exported from the package root.
- `SessionDataDeleteStatusResponse` schema in the committed OpenAPI spec and
  generated types.

## [0.2.0] - 2026-08-19

### Added

- `session.deleteData` / `deleteDataOrThrow` — purge the authenticated user's
  cloud-side engine data (requires `confirm: "DELETE"`).
- Typed errors: `ConfirmationRequiredError` (400), `SnapshotBusyError` (409),
  `PurgeInProgressError` (409, also thrown by `connectPoll` as terminal).

## [0.1.0] - 2025

### Added

- First-party TypeScript/JavaScript client generated from the Soulbits OpenAPI
  spec — auth, account, API keys, session, subscription, devices, models,
  inference and audio APIs.