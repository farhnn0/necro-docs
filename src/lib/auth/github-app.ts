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
  const slug = process.env.GITHUB_APP_SLUG?.trim() || 'necrodocs-scanner';
  return `https://github.com/apps/${slug}/installations/new`;
}
