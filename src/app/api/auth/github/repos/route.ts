import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInstallationRepositories } from '@/lib/auth/github-app';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const installationId =
    searchParams.get('installation_id') ||
    request.cookies.get('gh_installation_id')?.value;

  if (!installationId) {
    return NextResponse.json(
      { error: 'MISSING_INSTALLATION_ID', message: 'No GitHub App installation ID provided.' },
      { status: 400 }
    );
  }

  try {
    const result = await getInstallationRepositories(installationId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'GITHUB_API_ERROR', message },
      { status: 502 }
    );
  }
}
