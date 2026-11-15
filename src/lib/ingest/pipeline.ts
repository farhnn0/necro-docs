import { INGEST_CONFIG } from '@/lib/constants';
import type { IngestResult } from '@/lib/types';
import { mapWithConcurrency } from '@/lib/utils';

import { classifyLines, languageOf } from './analyze';
import { IngestError } from './errors';
import type { GitHubClient, TreeEntry } from './github';
import { buildEdges, buildNodes, summarize, validateIngestResult } from './graph';
import type { AnalyzedFile } from './graph';
import type { IngestTarget } from './request';
import { selectCodeFiles } from './select-files';

export interface PipelineDeps {
  client: GitHubClient;
  now: Date;
  startedAt: number;
}

/** Reads a repository through the injected GitHub client and returns the validated graph result. */
export async function ingestRepository(target: IngestTarget, deps: PipelineDeps): Promise<IngestResult> {
  const { client, now, startedAt } = deps;
  const { owner, repo } = target;

  const defaultBranch = await client.getDefaultBranch(owner, repo);
  const tree = await client.getTree(owner, repo, defaultBranch);
  const selection = selectCodeFiles(tree.entries);

  const fetched = await mapWithConcurrency(selection.files, INGEST_CONFIG.FETCH_CONCURRENCY, (entry: TreeEntry) =>
    client.getFileContent(owner, repo, defaultBranch, entry),
  );

  const skippedFiles: string[] = [];
  const files: AnalyzedFile[] = [];
  selection.files.forEach((entry, i) => {
    const f = fetched[i];
    const lang = languageOf(entry.path);
    if (!f || !lang) {
      skippedFiles.push(entry.path);
      return;
    }
    files.push({
      entry,
      language: lang.language,
      content: f.content,
      fetchTruncated: f.truncated,
      stats: classifyLines(f.content, lang.family),
    });
  });

  if (files.length === 0) {
    throw new IngestError('NO_CODE_FILES_FOUND', 'No code files could be fetched', {
      skippedFiles,
      criteria: selection.criteria,
    });
  }

  const analyzedAt = now.toISOString();
  const { nodes, relations } = buildNodes(files, analyzedAt);
  const edges = buildEdges(nodes, relations);
  const { fileCount, averageRotScore } = summarize(nodes);

  const result: IngestResult = {
    nodes,
    edges,
    metadata: {
      repositoryUrl: target.repositoryUrl,
      defaultBranch,
      analyzedAt,
      fileCount,
      averageRotScore,
      processingDurationMs: Math.round(performance.now() - startedAt),
      treeTruncated: tree.truncated,
      skippedFiles,
      selection: selection.criteria,
      rateLimit: client.getRateLimit(),
    },
  };
  validateIngestResult(result);
  return result;
}
