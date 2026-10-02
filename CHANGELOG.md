# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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