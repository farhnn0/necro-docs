import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getGitHubAppInstallUrl,
  getUserInstallations,
  INSTALLATIONS_COOKIE,
  OAUTH_STATE_COOKIE,
  sealInstallations,
  SESSION_TTL_SECONDS,
} from '@/lib/auth/github-app';

/**
 * GitHub sends users here after sign-in (`code` + `state`) and after installing the App (`installation_id`,
 * which is not trusted). Only installations GitHub lists for the signed-in user are stored, in a signed cookie.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const origin = request.nextUrl.origin;

  // Back from installing the App: sign in to prove which installations this user can access.
  if (!state) return NextResponse.redirect(new URL('/api/auth/github/install', origin));

  const fail = () => {
    const response = NextResponse.redirect(new URL('/?github_error=auth', origin));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };
  if (!code || state !== request.cookies.get(OAUTH_STATE_COOKIE)?.value) return fail();

  let installations;
  try {
    installations = await getUserInstallations(code);
  } catch (error) {
    console.warn('[github] sign-in failed:', error instanceof Error ? error.message : 'unknown');
    return fail();
  }

  const response = NextResponse.redirect(
    installations.length > 0 ? new URL('/?github_installed=true', origin) : new URL(getGitHubAppInstallUrl())
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete('gh_installation_id'); // unverified cookie from the previous flow
  if (installations.length > 0) {
    response.cookies.set(INSTALLATIONS_COOKIE, sealInstallations(installations), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
  }
  return response;
}
