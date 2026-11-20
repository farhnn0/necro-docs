import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const installationId = searchParams.get('installation_id');

  const redirectUrl = new URL('/', request.nextUrl.origin);
  if (installationId) {
    redirectUrl.searchParams.set('installation_id', installationId);
    redirectUrl.searchParams.set('github_installed', 'true');
  }

  const response = NextResponse.redirect(redirectUrl);
  if (installationId) {
    // Also store in an HTTP-only or accessible cookie for convenience
    response.cookies.set('gh_installation_id', installationId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
    });
  }

  return response;
}
