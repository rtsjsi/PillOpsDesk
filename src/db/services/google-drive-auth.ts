import { safeStorage, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import {
  assertGoogleDriveConfigured,
  getGoogleOAuthClientId,
  getGoogleOAuthClientSecret,
  GOOGLE_DRIVE_SCOPES,
} from '@shared/google-oauth-config';

const AUTH_FILENAME = 'google-drive-auth.json';

interface StoredAuth {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  email: string;
}

function getAuthFilePath(): string {
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), AUTH_FILENAME);
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(value).toString('base64')}`;
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decrypt(value: string): string {
  if (value.startsWith('enc:')) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Stored Google credentials cannot be decrypted on this system.');
    }
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  }
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice(6), 'base64').toString('utf8');
  }
  throw new Error('Invalid stored Google credentials.');
}

function readStoredAuth(): StoredAuth | null {
  const filePath = getAuthFilePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      refreshToken: string;
      accessToken?: string;
      expiryDate?: number;
      email: string;
    };
    return {
      ...parsed,
      refreshToken: decrypt(parsed.refreshToken),
    };
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth): void {
  const filePath = getAuthFilePath();
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      refreshToken: encrypt(auth.refreshToken),
      accessToken: auth.accessToken,
      expiryDate: auth.expiryDate,
      email: auth.email,
    }),
    'utf8'
  );
}

function deleteStoredAuth(): void {
  const filePath = getAuthFilePath();
  if (fs.existsSync(filePath)) fs.rmSync(filePath);
}

function createOAuthClient(redirectUri?: string): OAuth2Client {
  assertGoogleDriveConfigured();
  return new OAuth2Client(
    getGoogleOAuthClientId()!,
    getGoogleOAuthClientSecret(),
    redirectUri
  );
}

async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Could not read your Google account details after sign-in.');
  }
  const data = (await res.json()) as { email?: string };
  if (!data.email) {
    throw new Error('Could not determine your Google account email.');
  }
  return data.email;
}

export function isGoogleDriveConnected(): boolean {
  return readStoredAuth() !== null;
}

export async function connectGoogleDrive(): Promise<string> {
  assertGoogleDriveConfigured();

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const address = server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Could not start local sign-in helper.'));
            return;
          }

          const url = new URL(req.url ?? '/', `http://127.0.0.1:${address.port}`);
          if (url.pathname !== '/oauth2callback') {
            res.writeHead(404);
            res.end();
            return;
          }

          const error = url.searchParams.get('error');
          const authCode = url.searchParams.get('code');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          if (error) {
            res.end(
              '<html><body style="font-family:sans-serif;padding:2rem"><h1>Connection cancelled</h1><p>You can close this window and return to PillOpsDesk.</p></body></html>'
            );
            server.close();
            reject(new Error(`Google sign-in was cancelled (${error}).`));
            return;
          }
          if (!authCode) {
            res.end(
              '<html><body style="font-family:sans-serif;padding:2rem"><h1>Connection failed</h1><p>Missing authorization code.</p></body></html>'
            );
            server.close();
            reject(new Error('Google sign-in did not return an authorization code.'));
            return;
          }

          res.end(
            '<html><body style="font-family:sans-serif;padding:2rem"><h1>Connected</h1><p>Return to PillOpsDesk. You can close this window.</p></body></html>'
          );
          server.close();
          resolve({
            code: authCode,
            redirectUri: `http://127.0.0.1:${address.port}/oauth2callback`,
          });
        } catch (err) {
          server.close();
          reject(err);
        }
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Could not start local sign-in helper.'));
          return;
        }

        const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
        const oauth2Client = createOAuthClient(redirectUri);
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: GOOGLE_DRIVE_SCOPES,
          prompt: 'consent',
        });
        void shell.openExternal(authUrl);
      });
    }
  );

  const oauth2Client = createOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not provide a refresh token. Disconnect the app in your Google Account permissions and try again.'
    );
  }
  if (!tokens.access_token) {
    throw new Error('Google sign-in did not return an access token.');
  }

  const email = await fetchAccountEmail(tokens.access_token);
  writeStoredAuth({
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiryDate: tokens.expiry_date ?? undefined,
    email,
  });
  return email;
}

export async function disconnectGoogleDrive(): Promise<void> {
  const stored = readStoredAuth();
  if (stored?.refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${stored.refreshToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // Best-effort revoke; local disconnect still proceeds.
    }
  }
  deleteStoredAuth();
}

export async function getAuthorizedClient(): Promise<OAuth2Client> {
  const stored = readStoredAuth();
  if (!stored) {
    throw new Error('Google Drive is not connected. Connect your account in Settings first.');
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken,
    expiry_date: stored.expiryDate,
  });

  if (!stored.accessToken || !stored.expiryDate || stored.expiryDate <= Date.now() + 60_000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    const next: StoredAuth = {
      refreshToken: credentials.refresh_token ?? stored.refreshToken,
      accessToken: credentials.access_token ?? undefined,
      expiryDate: credentials.expiry_date ?? undefined,
      email: stored.email,
    };
    writeStoredAuth(next);
    oauth2Client.setCredentials(credentials as Credentials);
  }

  return oauth2Client;
}

export function getConnectedGoogleEmail(): string | null {
  return readStoredAuth()?.email ?? null;
}
