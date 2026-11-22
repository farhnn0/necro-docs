import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getGitHubAppInstallUrl, getOAuthAuthorizeUrl, OAUTH_STATE_COOKIE } from '@/lib/auth/github-app';

/**
 * Starts GitHub sign-in. The callback trusts only installations GitHub lists for the signed-in user.
 * `?add=1` opens the App's install page instead, to install on another account; GitHub then returns to the callback.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.searchParams.get('add')) return NextResponse.redirect(getGitHubAppInstallUrl());
  const state = crypto.randomBytes(16).toString('base64url');
  let url: string;
  try {
    url = getOAuthAuthorizeUrl(state);
  } catch {
    return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'GitHub sign-in is not configured on this server.' }, { status: 503 });
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
