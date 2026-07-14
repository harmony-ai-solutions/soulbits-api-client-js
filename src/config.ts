/** Default base URLs (beta). Production drops the `beta.` prefix. */
export const DEFAULT_CLOUD_URL = 'https://beta.cloud.soulbits.app';
export const DEFAULT_INFERENCE_URL = 'https://beta.api.soulbits.app';

export interface ClientOptions {
  /**
   * API Key (sb_cloud_*). Static bearer, no refresh. Mutually exclusive with `paseto`.
   */
  apiKey?: string;

  /**
   * PASETO v4.local token. Requires `refreshToken` for automatic refresh on 401.
   * Mutually exclusive with `apiKey`.
   */
  paseto?: string;

  /**
   * Opaque refresh token, returned alongside the PASETO on login/register/refresh.
   * Required when using `paseto`.
   */
  refreshToken?: string;

  /** Cloud API base URL. Defaults to `https://beta.cloud.soulbits.app`. */
  cloudURL?: string;

  /** Inference API base URL. Defaults to `https://beta.api.soulbits.app`. */
  inferenceURL?: string;
}

export interface AuthState {
  type: 'apiKey' | 'paseto';
  token: string;
  refreshToken?: string;
  /** Single-flight refresh promise — concurrent 401s share this. */
  refreshingPromise: Promise<string> | null;
}

export function resolveOptions(opts: ClientOptions): Required<Pick<ClientOptions, 'cloudURL' | 'inferenceURL'>> & ClientOptions {
  return {
    ...opts,
    cloudURL: opts.cloudURL ?? DEFAULT_CLOUD_URL,
    inferenceURL: opts.inferenceURL ?? DEFAULT_INFERENCE_URL,
  };
}
