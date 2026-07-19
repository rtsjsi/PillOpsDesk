/** Google OAuth credentials — set via environment (see .env.example). */

export const DRIVE_RETENTION_COUNT = 5;

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getGoogleOAuthClientId(): string | null {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  return id || null;
}

export function getGoogleOAuthClientSecret(): string | undefined {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return secret || undefined;
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleOAuthClientId() !== null;
}

export function assertGoogleDriveConfigured(): void {
  if (!isGoogleDriveConfigured()) {
    throw new Error(
      'Google Drive backup is not configured yet. Set GOOGLE_OAUTH_CLIENT_ID in your environment (see .env.example).'
    );
  }
}
