import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  updatedAt: string;
  defaultBranch: string;
}

/**
 * Resolves the GitHub App private key from environment variables or file path.
 */
function resolvePrivateKey(): string {
  const envKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const envPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();

  // If PEM content is supplied directly
  if (envKey && envKey.includes('-----BEGIN')) {
    // In case newlines were escaped as literal \n in .env
    return envKey.replace(/\\n/g, '\n');
  }

  // If envKey points to a file path
  const candidatePath = envPath || envKey;
  if (candidatePath) {
    const resolved = path.isAbsolute(candidatePath)
      ? candidatePath
      : path.resolve(/*turbopackIgnore: true*/ process.cwd(), candidatePath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf8');
    }
  }

  // Default fallback if named github-key.pem exists in cwd
  const defaultPem = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'github-key.pem');
  if (fs.existsSync(defaultPem)) {
    return fs.readFileSync(defaultPem, 'utf8');
  }

  throw new Error('GITHUB_APP_PRIVATE_KEY or github-key.pem not found');
}

/**
 * Creates an RS256 JWT for GitHub App authentication (valid for 10 minutes).
 */
export function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not configured');
  }

  const privateKey = resolvePrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // 60 seconds in the past to compensate for clock drift
      exp: now + 600, // 10 minutes validity
      iss: appId,
    })
  ).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Exchanges the GitHub App JWT for a short-lived installation access token.
 */
export async function getInstallationToken(
  installationId: string | number
): Promise<{ token: string; expiresAt: string }> {
  const jwt = createAppJwt();
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NecroDocs-Scanner',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create installation access token (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

/**
 * Fetches the list of repositories accessible to this installation (public + private).
 */
export async function getInstallationRepositories(
  installationId: string | number
): Promise<{ repositories: GitHubRepoSummary[]; totalCount: number }> {
  const { token } = await getInstallationToken(installationId);

  const response = await fetch('https://api.github.com/installation/repositories?per_page=100', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NecroDocs-Scanner',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list repositories (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    total_count: number;
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      description: string | null;
      updated_at: string;
      default_branch: string;
    }>;
  };

  const repositories: GitHubRepoSummary[] = (data.repositories || []).map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    description: repo.description,
    updatedAt: repo.updated_at,
    defaultBranch: repo.default_branch,
  }));

  return {
    repositories,
    totalCount: data.total_count ?? repositories.length,
  };
}

/**
 * Returns the GitHub App installation URL where users choose "All repositories" or "Only select repositories".
 */
export function getGitHubAppInstallUrl(): string {
  const rawSlug = process.env.GITHUB_APP_SLUG?.trim() || 'necrodocs-scanner';
  // Sanitize slug to valid GitHub URL format (lowercase, hyphens, no spaces)
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `https://github.com/apps/${slug}/installations/new`;
}

/** Installations the signed-in user can access, as GitHub listed them at sign-in. */
export interface VerifiedInstallation {
  id: number;
  account: string;
}

export const INSTALLATIONS_COOKIE = 'gh_installations';
export const OAUTH_STATE_COOKIE = 'gh_oauth_state';
/** Matches the lifetime of a GitHub App user access token. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function requiredEnv(name: 'GITHUB_APP_CLIENT_ID' | 'GITHUB_APP_CLIENT_SECRET'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

const mac = (body: string) => crypto.createHmac('sha256', requiredEnv('GITHUB_APP_CLIENT_SECRET')).update(body).digest('base64url');

/** Signs the verified installations so the browser can hold them without being able to change them. */
export function sealInstallations(installations: VerifiedInstallation[], now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ installations, exp: now + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${body}.${mac(body)}`;
}

/** The installations in a cookie made by `sealInstallations`; empty when it is missing, altered or expired. */
export function openInstallations(cookie: string | undefined, now = Date.now()): VerifiedInstallation[] {
  const [body, signature] = cookie?.split('.') ?? [];
  if (!body || !signature) return [];
  try {
    const expected = Buffer.from(mac(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return [];
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { installations?: VerifiedInstallation[]; exp?: number };
    return typeof data.exp === 'number' && data.exp > now && Array.isArray(data.installations) ? data.installations : [];
  } catch {
    return [];
  }
}

/** GitHub's sign-in page for this App; GitHub sends the user back to the App's callback URL with `code` and `state`. */
export function getOAuthAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({ client_id: requiredEnv('GITHUB_APP_CLIENT_ID'), state });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchanges a sign-in code for a user token and returns the installations of this App that the user can access.
 * The user token is not kept.
 */
export async function getUserInstallations(code: string): Promise<VerifiedInstallation[]> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'NecroDocs-Scanner' },
    body: JSON.stringify({ client_id: requiredEnv('GITHUB_APP_CLIENT_ID'), client_secret: requiredEnv('GITHUB_APP_CLIENT_SECRET'), code }),
    cache: 'no-store',
  });
  const tokenData = (await tokenResponse.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!tokenResponse.ok || !tokenData?.access_token) {
    throw new Error(`GitHub rejected the sign-in code (${tokenData?.error ?? tokenResponse.status})`);
  }

  // shortcut: first 100 installations only, page through `Link` if a user ever has more.
  const response = await fetch('https://api.github.com/user/installations?per_page=100', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'NecroDocs-Scanner' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Failed to list the user's installations (${response.status})`);
  const data = (await response.json()) as { installations?: Array<{ id: number; account?: { login?: string } | null }> };
  return (data.installations ?? []).map((installation) => ({ id: installation.id, account: installation.account?.login ?? '' }));
}
