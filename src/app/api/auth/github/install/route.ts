import { NextResponse } from 'next/server';
import { getGitHubAppInstallUrl } from '@/lib/auth/github-app';

export async function GET(): Promise<NextResponse> {
  const installUrl = getGitHubAppInstallUrl();
  return NextResponse.redirect(installUrl);
}
