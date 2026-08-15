/**
 * Devices API — register, list, revoke, and authorize client devices.
 *
 * Device authorization flow (D-DEV-04 gate): after `registerDevice`, a device
 * must be authorized before cloud sessions can be provisioned for it — see
 * POST /v1/session/connect (403 `device_authorization_required`) and the
 * `/v1/devices/authorize` flow.
 *
 * Unlike the raw-style facades (`account`, `session`, ...), all methods here
 * are convenience-style: they return camelCase domain objects (the snake↔camel
 * wire mapping lives in this module) and throw {@link APIError} on non-2xx
 * responses. Use `err.status`, `err.code`, `err.isAuthError` and
 * `err.isRateLimited` for typed error handling.
 *
 * RN-safe: uses only the global `fetch` (via openapi-fetch) — no Node built-ins.
 */
import type { FetchClient } from './types.js';
import type { components } from './types.js';
import { unwrap } from './errors.js';

type Device = components['schemas']['Device'];
type DeviceListItem = components['schemas']['DeviceListItem'];
type Message = components['schemas']['Message'];

/** Options for {@link DevicesAPI.registerDevice}. */
export interface RegisterDeviceParams {
  /** Per-install device identity (client-generated UUID). */
  deviceId: string;
  /** Client platform. */
  platform: 'android' | 'ios' | 'web';
  /**
   * Push notification token for this install. Omit to leave unchanged;
   * pass `null` to clear push registration.
   */
  pushToken?: string | null;
}

/** Registered device (camelCase domain shape). */
export interface DeviceDTO {
  deviceId: string;
  userId: string;
  platform: 'android' | 'ios' | 'web';
  pushToken: string | null;
  authorized: boolean;
  authorizedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Device list item (camelCase domain shape). No `userId` — a caller only ever
 * lists their own devices.
 */
export interface DeviceListItemDTO {
  deviceId: string;
  platform: 'android' | 'ios' | 'web';
  pushToken: string | null;
  authorized: boolean;
  authorizedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Poll state for the device auth flow — poll until `authorized` is true. */
export interface DeviceAuthorizationStatusDTO {
  authorized: boolean;
  /** True while a code/token pair is outstanding for this device. */
  authorizationPending: boolean;
}

/** Result of {@link DevicesAPI.approveDevice}. */
export interface ApproveDeviceResult {
  deviceId: string;
}

// ── snake→camel DTO mappers (wire → domain) ────────────────────────────────

function mapDevice(d: Device): DeviceDTO {
  return {
    deviceId: d.device_id,
    userId: d.user_id,
    platform: d.platform,
    pushToken: d.push_token,
    authorized: d.authorized,
    authorizedAt: d.authorized_at ?? null,
    lastSeenAt: d.last_seen_at ?? null,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function mapDeviceListItem(d: DeviceListItem): DeviceListItemDTO {
  return {
    deviceId: d.device_id,
    platform: d.platform,
    pushToken: d.push_token,
    authorized: d.authorized,
    authorizedAt: d.authorized_at ?? null,
    lastSeenAt: d.last_seen_at ?? null,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

/**
 * Devices API — register, list, revoke, and authorize client devices.
 * Cloud API host; PASETO-authenticated.
 */
export function createDevicesAPI(client: FetchClient) {
  return {
    /**
     * Register (or refresh) a device install, e.g. after a push-token change.
     * Omit `pushToken` to leave it unchanged; pass `null` to clear push
     * registration.
     *
     * @returns The registered device (camelCase).
     */
    async registerDevice(params: RegisterDeviceParams): Promise<DeviceDTO> {
      const body: components['schemas']['RegisterDeviceRequest'] = {
        device_id: params.deviceId,
        platform: params.platform,
      };
      if (params.pushToken !== undefined) {
        body.push_token = params.pushToken;
      }
      const result = await client.POST('/v1/devices', { body });
      return mapDevice(await unwrap(result));
    },

    /**
     * List the caller's registered devices.
     *
     * @returns The caller's devices (camelCase, newest first not guaranteed).
     */
    async listDevices(): Promise<DeviceListItemDTO[]> {
      const result = await client.GET('/v1/devices');
      const data = await unwrap(result);
      return data.map(mapDeviceListItem);
    },

    /**
     * Revoke a device's authorization and remove it from the device list.
     * Resolves on 204; throws {@link APIError} on 401/404.
     */
    async revokeDevice(deviceId: string): Promise<void> {
      const result = await client.DELETE('/v1/devices/{device_id}', {
        params: { path: { device_id: deviceId } },
      });
      await unwrap(result);
    },

    /**
     * Request the device-auth flow: emails the user a 6-digit code AND an
     * approval button link. Returns 202 — authorization is pending until the
     * user approves (or the code is verified via {@link verifyDeviceAuthCode}).
     */
    async requestDeviceAuthCode(deviceId: string): Promise<Message> {
      const result = await client.POST('/v1/devices/authorize', {
        body: { device_id: deviceId },
      });
      return unwrap(result);
    },

    /**
     * Verify a 6-digit email auth code for a device. Returns 200 once the code
     * is accepted and the device is marked authorized.
     *
     * @throws {APIError} with `status` 401 (unauthorized) or 429 (rate
     *   limited) on failure.
     */
    async verifyDeviceAuthCode(deviceId: string, code: string): Promise<Message> {
      const result = await client.POST('/v1/devices/authorize', {
        body: { device_id: deviceId, code },
      });
      return unwrap(result);
    },

    /**
     * Redeem the high-entropy approval token from the emailed button URL.
     * The authenticated session user must match the user the token was issued
     * for.
     *
     * @returns The approved device id.
     * @throws {APIError} with `status` 401 (unauthorized), 403 (token mismatch
     *   / forbidden) or 429 (rate limited).
     */
    async approveDevice(token: string): Promise<ApproveDeviceResult> {
      const result = await client.POST('/v1/devices/approve', {
        body: { token },
      });
      const data = await unwrap(result);
      return { deviceId: data.device_id };
    },

    /**
     * Poll device authorization state. Returns `{ authorized,
     * authorizationPending }` — the app polls until `authorized` is true.
     */
    async getDeviceAuthorizationStatus(deviceId: string): Promise<DeviceAuthorizationStatusDTO> {
      const result = await client.GET('/v1/devices/authorize/status', {
        params: { query: { device_id: deviceId } },
      });
      const data = await unwrap(result);
      return {
        authorized: data.authorized,
        authorizationPending: data.authorization_pending,
      };
    },
  };
}

export type DevicesAPI = ReturnType<typeof createDevicesAPI>;
