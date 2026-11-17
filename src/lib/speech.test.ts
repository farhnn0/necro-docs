import { describe, expect, it } from 'vitest';
import { detectSpeechLang, prepareSpeech } from './speech';

describe('prepareSpeech', () => {
  it('speaks file extensions without the dot', () => {
    expect(prepareSpeech('Check movie.controller.js now.', 'en').plain).toBe('Check movie controller J S now.');
  });
  it('uses basename of paths and splits names', () => {
    expect(prepareSpeech('See src/hooks/use-auth.ts.', 'en').plain).toBe('See use auth T S.');
    expect(prepareSpeech('Call getUser() first.', 'en').plain).toBe('Call get User first.');
  });
  it('strips markdown and localizes symbols', () => {
    expect(prepareSpeech('**Risk** 80% a & b', 'id').plain).toBe('Risk 80 persen a dan b');
    expect(prepareSpeech('80%', 'en').plain).toBe('80 percent');
  });
  it('builds escaped SSML with sentence breaks', () => {
    const { ssml } = prepareSpeech('A < B. Next one.', 'en');
    expect(ssml).toBe('<speak><s>A &lt; B.</s><break time="220ms"/><s>Next one.</s></speak>');
  });
});

describe('detectSpeechLang', () => {
  it('detects language', () => {
    expect(detectSpeechLang('File ini bergantung pada yang lain')).toBe('id');
    expect(detectSpeechLang('This file depends on the other')).toBe('en');
  });
});
