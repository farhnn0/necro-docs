import { DEMO_REPOSITORIES } from '@/lib/constants';
import { IngestError } from './errors';
import { parseRepositoryUrl } from './github';

export interface IngestTarget {
  owner: string;
  repo: string;
  /** Canonical URL: https://github.com/{owner}/{repo} */
  repositoryUrl: string;
}

export function parseIngestRequest(body: unknown): IngestTarget {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new IngestError('INVALID_REQUEST', 'Request body must be a JSON object');
  }
  const { useDemo, demoId, repositoryUrl } = body as Record<string, unknown>;

  let input: unknown = repositoryUrl;
  if (useDemo === true) {
    if (typeof demoId !== 'string' || !Object.hasOwn(DEMO_REPOSITORIES, demoId)) {
      throw new IngestError('INVALID_DEMO_ID', 'Unknown demoId', { demoId });
    }
    input = DEMO_REPOSITORIES[demoId as keyof typeof DEMO_REPOSITORIES];
  }

  if (input === undefined || input === null) {
    throw new IngestError('MISSING_REPOSITORY_URL', 'repositoryUrl is required');
  }
  if (typeof input !== 'string') {
    throw new IngestError('INVALID_URL_FORMAT', 'repositoryUrl must be a string');
  }

  const { owner, repo } = parseRepositoryUrl(input);
  return { owner, repo, repositoryUrl: `https://github.com/${owner}/${repo}` };
}
