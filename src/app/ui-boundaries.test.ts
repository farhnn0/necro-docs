import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'src/app');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('UI conversion accessibility and static boundaries', () => {
  const page = read('page.tsx');
  const workspace = read('workspace/page.tsx');
  const seance = read('workspace/SeanceConsole.tsx');
  const layout = read('layout.tsx');
  const css = read('globals.css');

  it('keeps client UI free of scripts, CDN references, credentials, badges, and colored dots', () => {
    const clientSource = `${page}\n${workspace}\n${seance}\n${layout}`;
    expect(clientSource).not.toMatch(/<script|cdn\.tailwindcss\.com|unpkg\.com/i);
    expect(clientSource).not.toMatch(/GITHUB_TOKEN|OPENAI_API_KEY|github[_-]?token/i);
    expect(clientSource).not.toMatch(/className=["'][^"']*(?:badge|colored-dot|status-dot)/i);
    expect(clientSource).not.toMatch(/on(?:click|submit)=["']/i);
  });

  it('keeps required landmarks, native controls, focus rings, and decorative hiding', () => {
    expect(page).toMatch(/<main[\s>]/);
    expect(page).toMatch(/<header[\s>]/);
    expect(page).toMatch(/<nav[\s>]/);
    expect(page).toMatch(/<h1[\s>]/);
    expect(page).toMatch(/<form[^>]+onSubmit=/);
    expect(page).toMatch(/<input[^>]+id="repository"/);
    expect(page).toMatch(/focus-visible:ring-2/);
    expect(page).toMatch(/aria-hidden="true"/);
    expect(workspace).toMatch(/<main[\s>]/);
    expect(workspace).toMatch(/<header[\s>]/);
    expect(workspace).toMatch(/<button/);
    expect(workspace).toMatch(/focus-visible:ring-2/);
    expect(seance).toMatch(/aria-live="polite"/);
    expect(seance).toMatch(/<input/);
    expect(seance).toMatch(/<button/);
  });

  it('keeps the approved effects, palette, and single reduced-motion block', () => {
    for (const token of ['--canvas: #FFFFFF', '--surface: #F6F7F9', '--ink: #111113', '--hairline: #E8E9ED', '--sky-accent: #0284C7', '--crimson: #E11D48']) {
      expect(css).toContain(token);
    }
    expect(css).toContain('.acctual-window');
    expect(css).toContain('.paper-grid');
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });
});
