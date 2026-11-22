import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInstallationRepositories, INSTALLATIONS_COOKIE, openInstallations } from '@/lib/auth/github-app';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const installations = openInstallations(request.cookies.get(INSTALLATIONS_COOKIE)?.value);
  if (installations.length === 0) {
    return NextResponse.json(
      { error: 'NOT_CONNECTED', message: 'Connect GitHub to list your repositories.' },
      { status: 401 }
    );
  }

  try {
    const results = await Promise.all(installations.map((installation) => getInstallationRepositories(installation.id)));
    return NextResponse.json({
      repositories: results.flatMap((result) => result.repositories),
      totalCount: results.reduce((total, result) => total + result.totalCount, 0),
      installationId: String(installations[0].id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'GITHUB_API_ERROR', message },
      { status: 502 }
    );
  }
}
