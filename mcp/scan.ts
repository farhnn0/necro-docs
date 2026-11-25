/** scan_code adapter: delegates to the shared scanner used by /api/patch; adds no rules. */
import { scanSource } from '@/lib/repoAnalyzer';
import { isPatchable } from '@/lib/types';
import type { ScanResult } from './types';

export function scanCode(path: string, code: string): ScanResult {
  return {
    path,
    findings: scanSource(path, code).map((f) => ({
      line: f.line ?? null,
      kind: f.kind,
      text: f.text,
      suggestion: f.suggestion,
      source: 'static' as const,
      patchable: isPatchable(f),
    })),
  };
}
