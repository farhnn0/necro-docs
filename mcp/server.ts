/**
 * Necro-Docs MCP server: exactly four tools, strict schemas, compact results.
 * No side effects on import, no stdout writes (stdout is MCP protocol traffic), no repository writes.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { analysisCache, cacheAnalysis, findCached, normalizeRepoKey } from './cache';
import { errorResult } from './errors';
import { fileContext, projectFindings, summarizeAnalysis } from './helpers';
import { derivePatchResult } from './patch';
import { fetchAnalysis, fetchPatch } from './proxy';
import { scanCode } from './scan';
import {
  analyzeRepoSchema,
  getFindingsSchema,
  scanCodeSchema,
  synthesizePatchSchema,
} from './schemas';
import { INPUT_LIMITS } from './types';
import type { AnalysisCache, FindingsResult, ScanResult } from './types';

export interface ServerDeps {
  fetchImpl?: typeof fetch;
  cache?: AnalysisCache;
  scan?: typeof scanCode;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

type Handler = (args: unknown, deps?: ServerDeps) => Promise<ToolResult>;

const ok = (data: object): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data as Record<string, unknown>,
});

// Diagnostics: tool name and error class only; never source, bodies, or messages that may embed them.
const fail = (tool: string, err: unknown): ToolResult => {
  console.error(`[necro-mcp] ${tool} failed: ${err instanceof Error ? err.name : typeof err}`);
  return errorResult(err);
};

export const handlers: Record<string, Handler> = {
  async analyze_repo(args, deps = {}) {
    try {
      const { repoUrl } = analyzeRepoSchema.parse(args);
      const repoKey = normalizeRepoKey(repoUrl);
      const analysis = await fetchAnalysis(repoUrl, deps.fetchImpl);
      cacheAnalysis(repoKey, analysis, deps.cache ?? analysisCache);
      return ok(summarizeAnalysis(analysis));
    } catch (err) {
      return fail('analyze_repo', err);
    }
  },

  async get_findings(args, deps = {}) {
    try {
      const { repoUrl, path } = getFindingsSchema.parse(args);
      const repoKey = normalizeRepoKey(repoUrl);
      const { analysis, node } = findCached(repoKey, path, deps.cache ?? analysisCache);
      const result: FindingsResult = { repoUrl, path, findings: projectFindings(node.findings), ...fileContext(analysis, node) };
      return ok(result);
    } catch (err) {
      return fail('get_findings', err);
    }
  },

  async scan_code(args, deps = {}) {
    try {
      const { path, code } = scanCodeSchema.parse(args);
      let result: ScanResult;
      try {
        result = (deps.scan ?? scanCode)(path, code);
      } catch (err) {
        console.error(`[necro-mcp] scanner threw: ${err instanceof Error ? err.name : typeof err}`);
        return {
          isError: true,
          content: [{ type: 'text', text: 'Code scan failed: scanner error; check the MCP server stderr for details' }],
        };
      }
      return ok(result);
    } catch (err) {
      return fail('scan_code', err);
    }
  },

  async synthesize_patch(args, deps = {}) {
    try {
      const input = synthesizePatchSchema.parse(args);
      let { code } = input;
      let context = { dependencies: input.dependencies, importedBy: input.importedBy };
      if (input.repoUrl !== undefined) {
        // Same context the web workspace sends to /api/patch: cached code, callers from edges, repo dependencies.
        const { analysis, node } = findCached(normalizeRepoKey(input.repoUrl), input.path, deps.cache ?? analysisCache);
        code = node.code;
        context = { dependencies: analysis.dependencies.slice(0, INPUT_LIMITS.dependencies), importedBy: fileContext(analysis, node).importedBy };
        // Nothing a patch can fix: say so instead of spending a model call.
        if (!(deps.scan ?? scanCode)(input.path, code).findings.some((f) => f.patchable)) {
          return ok({ message: 'No patchable findings in this file; nothing to patch.', patchableCount: 0 });
        }
      }
      const response = await fetchPatch({ path: input.path, code: code as string, ...context }, deps.fetchImpl);
      return ok(derivePatchResult(code as string, response));
    } catch (err) {
      return fail('synthesize_patch', err);
    }
  },
};

const DESCRIPTIONS = {
  analyze_repo: 'Analyze a public GitHub repository via the running Necro-Docs app and return a compact rot summary with the top files.',
  get_findings: 'Return findings (with a patchable flag) plus importedBy/imports paths for one file from the latest cached analyze_repo result for the same repository. No network.',
  scan_code: 'Run the static Necro-Docs scanner on supplied source code and return findings. Does not modify files.',
  synthesize_patch: 'Propose a patch via the Necro-Docs patch endpoint for either supplied source { path, code } or a cached repository file { repoUrl, path }; returns summary, edits, verification, fixed and remaining. Proposal only: nothing is applied.',
} as const;

export function createServer(deps: ServerDeps = {}): McpServer {
  const server = new McpServer({ name: 'necro-docs', version: '0.1.0' });
  // Strict schemas so unknown keys are rejected by the SDK too; handlers re-parse for direct callers.
  const tools = [
    ['analyze_repo', analyzeRepoSchema, true],
    ['get_findings', getFindingsSchema, false],
    ['scan_code', scanCodeSchema, false],
    ['synthesize_patch', synthesizePatchSchema, true],
  ] as const;
  for (const [name, schema, openWorld] of tools) {
    server.registerTool(
      name,
      {
        description: DESCRIPTIONS[name],
        inputSchema: schema,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: openWorld },
      },
      ((args: unknown) => handlers[name](args, deps)) as never,
    );
  }
  return server;
}

async function main(): Promise<void> {
  try {
    await createServer().connect(new StdioServerTransport());
  } catch (err) {
    console.error(`[necro-mcp] startup failed: ${err instanceof Error ? err.name : typeof err}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
