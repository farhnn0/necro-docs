/**
 * Strict Zod input schemas for the four MCP tools (Requirements 4.1-4.5, 4.7, 8.7).
 * Unknown keys are rejected. There is no autoApprove, client-supplied findings, or mutation option.
 */
import { z } from 'zod';
import { INPUT_LIMITS } from './types';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

// Raw shapes, for registerTool's inputSchema when the SDK wants a shape.
export const analyzeRepoShape = {
  repoUrl: trimmed(INPUT_LIMITS.repoUrl),
};

export const getFindingsShape = {
  repoUrl: trimmed(INPUT_LIMITS.repoUrl),
  path: trimmed(INPUT_LIMITS.path),
};

// code is intentionally not trimmed: whitespace is part of the source.
export const scanCodeShape = {
  path: trimmed(INPUT_LIMITS.path),
  code: z.string().min(1).max(INPUT_LIMITS.code),
};

// Exactly one of `code` (caller supplies the file) or `repoUrl` (read the file from the analyze_repo cache).
export const synthesizePatchShape = {
  path: scanCodeShape.path,
  code: scanCodeShape.code.optional(),
  repoUrl: trimmed(INPUT_LIMITS.repoUrl).optional(),
  dependencies: z.array(trimmed(INPUT_LIMITS.dependencyName)).max(INPUT_LIMITS.dependencies).optional(),
  importedBy: z.array(trimmed(INPUT_LIMITS.importerPath)).max(INPUT_LIMITS.importedBy).optional(),
};

export const analyzeRepoSchema = z.object(analyzeRepoShape).strict();
export const getFindingsSchema = z.object(getFindingsShape).strict();
export const scanCodeSchema = z.object(scanCodeShape).strict();
export const synthesizePatchSchema = z.object(synthesizePatchShape).strict().superRefine((v, ctx) => {
  if ((v.code === undefined) === (v.repoUrl === undefined)) {
    ctx.addIssue({ code: 'custom', path: [v.code === undefined ? 'repoUrl' : 'code'], message: 'provide exactly one of code or repoUrl' });
    return;
  }
  if (v.repoUrl !== undefined) {
    for (const key of ['dependencies', 'importedBy'] as const) {
      if (v[key] !== undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'not allowed with repoUrl; context comes from the cached analysis' });
    }
  }
});

export type AnalyzeRepoInput = z.infer<typeof analyzeRepoSchema>;
export type GetFindingsInput = z.infer<typeof getFindingsSchema>;
export type ScanCodeInput = z.infer<typeof scanCodeSchema>;
export type SynthesizePatchInput = z.infer<typeof synthesizePatchSchema>;
