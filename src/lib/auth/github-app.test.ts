import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { openInstallations, sealInstallations } from './github-app';
import { GET as callback } from '@/app/api/auth/github/callback/route';
import { GET as repos } from '@/app/api/auth/github/repos/route';
import { POST as ingest } from '@/app/api/ingest/route';

const mine = [{ id: 11, account: 'farhnn0' }];
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'client-id');
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('GITHUB_TOKEN', '');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const calledUrls = () => fetchMock.mock.calls.map(([url]) => String(url));

describe('installation cookie', () => {
  it('round-trips and rejects altered, expired or unsigned values', () => {
    const sealed = sealInstallations(mine, 1_000);
    expect(openInstallations(sealed, 2_000)).toEqual(mine);
    const forged = Buffer.from(JSON.stringify({ installations: [{ id: 99, account: 'victim' }], exp: 9e15 })).toString('base64url');
    expect(openInstallations(`${forged}.${sealed.split('.')[1]}`, 2_000)).toEqual([]);
    expect(openInstallations(sealed, 1_000 + 9 * 60 * 60 * 1000)).toEqual([]);
    expect(openInstallations('99', 2_000)).toEqual([]);
    vi.stubEnv('GITHUB_APP_CLIENT_SECRET', '');
    expect(openInstallations(sealed, 2_000)).toEqual([]);
  });
});

describe('GET /api/auth/github/callback', () => {
  const call = (query: string, state?: string) =>
    callback(new NextRequest(`http://localhost/api/auth/github/callback?${query}`, { headers: state ? { cookie: `gh_oauth_state=${state}` } : {} }));

  it('stores only the installations GitHub lists for the signed-in user, never the one in the URL', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'user-token' }))
      .mockResolvedValueOnce(json({ installations: [{ id: 11, account: { login: 'farhnn0' } }] }));
    const response = await call('code=c&state=s&installation_id=99', 's');
    expect(response.headers.get('location')).toBe('http://localhost/?github_installed=true');
    expect(openInstallations(response.cookies.get('gh_installations')?.value)).toEqual(mine);
    expect(calledUrls()).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user/installations?per_page=100']);
  });

  it('rejects a state that does not match the cookie without calling GitHub', async () => {
    const response = await call('code=c&state=other', 's');
    expect(response.headers.get('location')).toBe('http://localhost/?github_error=auth');
    expect(response.cookies.get('gh_installations')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns an installation redirect into a sign-in', async () => {
    const response = await call('installation_id=99&setup_action=install');
    expect(response.headers.get('location')).toBe('http://localhost/api/auth/github/install');
    expect(response.cookies.get('gh_installations')).toBeUndefined();
  });

  it('sends a user without installations to install the App', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'user-token' })).mockResolvedValueOnce(json({ installations: [] }));
    const response = await call('code=c&state=s', 's');
    expect(response.headers.get('location')).toMatch(/^https:\/\/github\.com\/apps\/.+\/installations\/new$/);
    expect(response.cookies.get('gh_installations')).toBeUndefined();
  });
});

describe('installation use', () => {
  it('lists repositories only for a signed cookie, ignoring installation_id', async () => {
    const response = await repos(new NextRequest('http://localhost/api/auth/github/repos?installation_id=99', { headers: { cookie: 'gh_installation_id=99' } }));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ingest ignores an installation id from a header or the old cookie', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Not Found' }, 404));
    await ingest(new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-github-installation-id': '99', cookie: 'gh_installation_id=99' },
      body: JSON.stringify({ repoUrl: 'victim/private' }),
    }));
    expect(calledUrls().some((url) => url.includes('/app/installations/'))).toBe(false);
  });

  it('ingest does not use a verified installation for a repository of another owner', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Not Found' }, 404));
    await ingest(new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `gh_installations=${sealInstallations(mine)}` },
      body: JSON.stringify({ repoUrl: 'victim/private' }),
    }));
    expect(calledUrls().some((url) => url.includes('/app/installations/'))).toBe(false);
  });
});
