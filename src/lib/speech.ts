export type SpeechLang = 'en' | 'id';

const EXT: Record<string, string> = {
  js: 'J S', mjs: 'J S', cjs: 'J S', jsx: 'J S X', ts: 'T S', tsx: 'T S X', py: 'P Y', go: 'Go',
  json: 'JSON', css: 'C S S', html: 'H T M L', md: 'markdown', yml: 'YAML', yaml: 'YAML',
};

const ID_WORDS = /\b(yang|dan|dengan|untuk|ini|itu|tidak|dari|pada|karena|akan|ada|file|bergantung|perubahan|sebuah|juga|bisa|adalah)\b/gi;
const EN_WORDS = /\b(the|and|with|this|that|depends|change|which|from|has|are|can|will|file)\b/gi;

/** Rough language guess: Indonesian when it has clearly more Indonesian stopwords. */
export function detectSpeechLang(text: string): SpeechLang {
  const id = (text.match(ID_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  return id > en ? 'id' : 'en';
}

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');

/** Turns "src/hooks/use-auth.ts" into "use auth T S" so TTS does not stop at the dot. */
function speakFile(token: string): string {
  const base = token.split('/').pop() ?? token;
  const dot = base.lastIndexOf('.');
  const ext = base.slice(dot + 1).toLowerCase();
  if (dot <= 0 || !EXT[ext]) return token;
  return `${words(base.slice(0, dot)).replace(/\./g, ' ')} ${EXT[ext]}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Returns text for speech (`plain`) and SSML with short pauses between sentences. */
export function prepareSpeech(text: string, lang: SpeechLang): { plain: string; ssml: string } {
  const plain = text
    .replace(/[*`#•]/g, '')
    .replace(/(?:[\w@-]+\/)*[\w@-]+(?:\.[\w-]+)*\.(?:mjs|cjs|jsx|tsx|json|yaml|yml|html|css|js|ts|py|go|md)\b/g, speakFile)
    .replace(/\b([A-Za-z_]\w*)\(\)/g, (_, n: string) => words(n))
    .replace(/\s*(?:->|→)\s*/g, lang === 'id' ? ' ke ' : ' to ')
    .replace(/(\d)\s*%/g, lang === 'id' ? '$1 persen' : '$1 percent')
    .replace(/&/g, lang === 'id' ? ' dan ' : ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
  const sentences = plain.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [plain];
  const ssml = `<speak>${sentences.map((s) => `<s>${esc(s)}</s>`).join('<break time="220ms"/>')}</speak>`;
  return { plain, ssml };
}
