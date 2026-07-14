import type { FetchClient } from './types.js';
import { unwrap } from './errors.js';

/**
 * Auth & Account API — login, register, OAuth, profile, password, etc.
 * Most methods are unauthenticated; some require PASETO.
 */
export function createAccountAPI(client: FetchClient) {
  return {
    /**
     * Register a new account. Returns 202 (no token).
     * { data, error, response } result.
     */
    register(email: string, password: string, displayName?: string) {
      return client.POST('/v1/auth/register', {
        body: { email, password, display_name: displayName },
      });
    },

    /** Convenience: register and throw on error. */
    async registerOrThrow(email: string, password: string, displayName?: string) {
      return unwrap(await this.register(email, password, displayName));
    },

    /**
     * Log in with email + password. Returns { token, refresh_token, expires_at }.
     */
    login(email: string, password: string) {
      return client.POST('/v1/auth/login', {
        body: { email, password },
      });
    },

    /** Convenience: login and throw on error. */
    async loginOrThrow(email: string, password: string) {
      return unwrap(await this.login(email, password));
    },

    /**
     * Refresh the PASETO token. Typically handled automatically by the
     * interceptor; exposed for manual use.
     */
    refresh(refreshToken: string) {
      return client.POST('/v1/auth/refresh', {
        body: { refresh_token: refreshToken },
      });
    },

    /** Convenience: refresh and throw on error. */
    async refreshOrThrow(refreshToken: string) {
      return unwrap(await this.refresh(refreshToken));
    },

    /**
     * Verify email with a hex token from the verification link.
     */
    verify(token: string) {
      return client.GET('/v1/auth/verify', {
        params: { query: { token } },
      });
    },

    /** Convenience: verify and throw on error. */
    async verifyOrThrow(token: string) {
      return unwrap(await this.verify(token));
    },

    /**
     * Resend the verification email. Per-user 60s cooldown.
     */
    resendVerification(email: string) {
      return client.POST('/v1/auth/resend-verification', {
        body: { email },
      });
    },

    /** Convenience: resend verification and throw on error. */
    async resendVerificationOrThrow(email: string) {
      return unwrap(await this.resendVerification(email));
    },

    /**
     * Request a password reset email.
     */
    passwordResetRequest(email: string) {
      return client.POST('/v1/auth/password/reset/request', {
        body: { email },
      });
    },

    /** Convenience: request password reset and throw on error. */
    async passwordResetRequestOrThrow(email: string) {
      return unwrap(await this.passwordResetRequest(email));
    },

    /**
     * Confirm a password reset with the token + new password.
     */
    passwordResetConfirm(token: string, newPassword: string) {
      return client.POST('/v1/auth/password/reset/confirm', {
        body: { token, new_password: newPassword },
      });
    },

    /** Convenience: confirm password reset and throw on error. */
    async passwordResetConfirmOrThrow(token: string, newPassword: string) {
      return unwrap(await this.passwordResetConfirm(token, newPassword));
    },

    /**
     * Google Sign-In (native / Android). Validates the Google `id_token`.
     */
    googleSignIn(idToken: string) {
      return client.POST('/v1/auth/google', {
        body: { id_token: idToken },
      });
    },

    /** Convenience: Google sign-in and throw on error. */
    async googleSignInOrThrow(idToken: string) {
      return unwrap(await this.googleSignIn(idToken));
    },

    /**
     * Google Sign-In (web OAuth code flow).
     */
    googleWebSignIn(authCode: string, redirectUri: string, codeVerifier?: string) {
      return client.POST('/v1/auth/google/web', {
        body: {
          auth_code: authCode,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        },
      });
    },

    /** Convenience: Google web sign-in and throw on error. */
    async googleWebSignInOrThrow(authCode: string, redirectUri: string, codeVerifier?: string) {
      return unwrap(await this.googleWebSignIn(authCode, redirectUri, codeVerifier));
    },

    /**
     * Apple Sign-In (native / iOS).
     */
    appleSignIn(identityToken: string) {
      return client.POST('/v1/auth/apple', {
        body: { identity_token: identityToken },
      });
    },

    /** Convenience: Apple sign-in and throw on error. */
    async appleSignInOrThrow(identityToken: string) {
      return unwrap(await this.appleSignIn(identityToken));
    },

    /**
     * Apple Sign-In (web OAuth code flow).
     */
    appleWebSignIn(code: string, redirectUri: string) {
      return client.POST('/v1/auth/apple/web', {
        body: { code, redirect_uri: redirectUri },
      });
    },

    /** Convenience: Apple web sign-in and throw on error. */
    async appleWebSignInOrThrow(code: string, redirectUri: string) {
      return unwrap(await this.appleWebSignIn(code, redirectUri));
    },

    /**
     * Log out. PASETO required.
     */
    logout(refreshToken?: string) {
      return client.POST('/v1/auth/logout', {
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      });
    },

    /** Convenience: logout and throw on error. */
    async logoutOrThrow(refreshToken?: string) {
      return unwrap(await this.logout(refreshToken));
    },

    /**
     * Get the current user profile. PASETO required.
     */
    me() {
      return client.GET('/v1/auth/me');
    },

    /** Convenience: get profile and throw on error. */
    async meOrThrow() {
      return unwrap(await this.me());
    },

    /**
     * Update profile (display_name only). PASETO required.
     */
    updateProfile(displayName: string) {
      return client.PATCH('/v1/auth/me', {
        body: { display_name: displayName },
      });
    },

    /** Convenience: update profile and throw on error. */
    async updateProfileOrThrow(displayName: string) {
      return unwrap(await this.updateProfile(displayName));
    },

    /**
     * Change password. PASETO required. Writes a Valkey cutoff (forces re-login).
     */
    changePassword(oldPassword: string, newPassword: string) {
      return client.PUT('/v1/auth/password', {
        body: { old_password: oldPassword, new_password: newPassword },
      });
    },

    /** Convenience: change password and throw on error. */
    async changePasswordOrThrow(oldPassword: string, newPassword: string) {
      return unwrap(await this.changePassword(oldPassword, newPassword));
    },

    /**
     * Link a Google identity. PASETO required.
     */
    linkGoogle(idToken: string) {
      return client.POST('/v1/auth/link/google', {
        body: { id_token: idToken },
      });
    },

    /** Convenience: link Google and throw on error. */
    async linkGoogleOrThrow(idToken: string) {
      return unwrap(await this.linkGoogle(idToken));
    },

    /**
     * Unlink the Google identity. PASETO required.
     */
    unlinkGoogle() {
      return client.DELETE('/v1/auth/link/google');
    },

    /**
     * Link an Apple identity. PASETO required.
     */
    linkApple(identityToken: string) {
      return client.POST('/v1/auth/link/apple', {
        body: { identity_token: identityToken },
      });
    },

    /** Convenience: link Apple and throw on error. */
    async linkAppleOrThrow(identityToken: string) {
      return unwrap(await this.linkApple(identityToken));
    },

    /**
     * Unlink the Apple identity. PASETO required.
     */
    unlinkApple() {
      return client.DELETE('/v1/auth/link/apple');
    },
  };
}

export type AccountAPI = ReturnType<typeof createAccountAPI>;
