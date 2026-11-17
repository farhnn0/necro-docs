import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeanceRequest, filterSpotlight } from '@/lib/conversion/helpers';
import { PRESET_SPECIMENS } from '@/lib/conversion/specimens';

const source = readFileSync(new URL('./SeanceConsole.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');
const specimen = PRESET_SPECIMENS.payment;

describe('Seance console/API contract', () => {
  it('builds the exact bounded request shape without rawContent', () => {
    const request = buildSeanceRequest(`  ${'q'.repeat(600)}  `, 'charge', specimen);

    expect(request).toEqual({
      question: 'q'.repeat(500),
      selectedNodeId: 'charge',
      specimenId: 'payment',
      repositoryUrl: null,
      repoTitle: specimen.title,
      nodes: specimen.nodes.map(({ id, path, rotScore }) => ({ id, path, rotScore })),
      edges: specimen.edges.map(({ source, target }) => ({ source, target })),
    });
    expect(request).not.toHaveProperty('rawContent');
  });

  it('filters invalid spotlight and selection ids before forwarding them', () => {
    expect(filterSpotlight({ answer: 'ok', spotlightNodeIds: ['charge', 'missing'], selectNodeId: 'missing' }, specimen))
      .toEqual({ nodeIds: ['charge'], selectedNodeId: null });
  });

  it('keeps fallback matching, unsupported-browser, recognition, synthesis, and timer behavior explicit', () => {
    expect(source).toContain("answers.find((item) => item.question === question)");
    expect(source).toContain("question.toLowerCase().includes");
    expect(source).toContain('Voice input is not supported in this browser.');
    expect(source).toContain("speechErrorMessages[event.error]");
    expect(source).toContain('utterance.rate = 1.02');
    expect(source).toContain('window.setTimeout(() => controller.abort(), 15000)');
    expect(source).toContain('window.setTimeout(() => {');
    expect(source).toContain('2600');
    expect(source).toContain("window.speechSynthesis.cancel()");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('wave-bar');
  });

  it('uses latest-query abort protection and preserves keyboard fallback controls', () => {
    expect(source).toContain('controllerRef.current?.abort()');
    expect(source).toContain('if (controllerRef.current === controller)');
    expect(source).toContain('type="text"');
    expect(source).toContain('type="submit"');
    expect(source).toContain('disabled={!speechRecognition && !isListening}');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
