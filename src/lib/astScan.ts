/**
 * AST pass for the checks a line/regex scanner gets wrong because they need context:
 * what a string literal is, what follows a catch, what wraps an HTML sink, what a long function is made of.
 * Uses the TypeScript compiler API in syntax-only mode (no type checker, no program), so it is fast and
 * never needs the project's tsconfig. Server-only.
 *
 * shortcut: syntax-only, so "sanitizer" and "i18n dictionary" are recognised by name, not by type.
 * Upgrade to the type checker if teams alias sanitizers under unrelated names.
 */
import * as ts from 'typescript';

export type AstFindingKind = 'unsafe-html' | 'html-notice' | 'monolith';

export interface AstFinding {
  kind: AstFindingKind;
  line: number;
  text: string;
  /** Concrete next step; replaces the generic recommendation when this finding ranks first. */
  suggestion?: string;
}

export interface AstScan {
  findings: AstFinding[];
  /** 1-based lines that are the inside of a multi-line string/template literal (prompts, SQL, HTML, schemas). */
  stringLines: Set<number>;
  /** 1-based lines of `catch` clauses with an empty body that are only the first stage of a multi-stage fallback. */
  fallbackCatchLines: Set<number>;
  /** Interfaces and type aliases declared at the top level of this file. */
  declaredTypes: string[];
  /** `interface X` / `type X =` text found inside string literals, i.e. a schema copied into a prompt. */
  promptTypeRefs: Array<{ name: string; line: number }>;
  /** Refactoring advice for the deepest function, when control flow is nested at least NEST_HINT_DEPTH levels. */
  nestingHint: string | null;
  /** Per-line views with real line numbers; see `lineViews`. */
  views: LineViews;
  /** 1-based line of every `any` type keyword. */
  anyLines: number[];
  /** 1-based line of every `@ts-ignore` / `@ts-nocheck` directive: a comment whose last line starts with it, as TypeScript reads it. */
  suppressionLines: number[];
  /** Actionable technical-debt markers detected per individual comment range (so a second same-line comment is not masked by an earlier one). */
  debtComments: Array<{ line: number; tag: string; note: string }>;
  /** The function with the most lines (declaration to closing brace). */
  longestFunction: { name: string; line: number; length: number } | null;
  /** Exact control-flow decision points (if/loop/case/catch/ternary/&&/||), ignoring property names and types. */
  branches: number;
}

export interface LineViews {
  /** Source lines as written. */
  lines: string[];
  /** Comments blanked, string literals kept (used to read import specifiers). */
  code: string[];
  /** Like `code`, with string, template, regex and JSX text contents blanked (used for counting and brace matching). */
  bare: string[];
  /** Comment text only. */
  comment: string[];
}

const MONOLITH_LINES = 1500;
const NEST_HINT_DEPTH = 4;
const FOLLOWING_STATEMENTS = 8;

const SANITIZER_CALL_RE = /(?:^|\.)(?:sanitize\w*|safeSanitize\w*|purify\w*|escapeHtml|xss)$/i;
const I18N_CALL_RE = /^(?:t|i18n\.t|intl\.formatMessage|getTranslations?|useTranslations?)$/;
const I18N_ROOT_RE = /^(?:t|i18n|dict|dictionary|messages|translations?|locale|strings)$/i;
const RECOVERY_CALL_RE = /(?:repair|recover|fallback|retry|salvage|heal|extract|sanitiz|normaliz|coerce|bestEffort|tryParse)/i;
const VERBS = new Set([
  'get', 'set', 'create', 'update', 'delete', 'remove', 'add', 'list', 'fetch', 'find', 'load', 'save', 'handle', 'build',
  'parse', 'validate', 'is', 'has', 'use', 'on', 'toggle', 'reset', 'init', 'render', 'format', 'compute', 'calculate',
  'generate', 'send', 'submit', 'approve', 'reject', 'cancel', 'check', 'sync', 'export', 'import', 'run', 'process', 'assign',
]);

const kindFor = (path: string): ts.ScriptKind => (/\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : /\.ts$/i.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS);

const unwrap = (node: ts.Node): ts.Node => {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
};

function walk(node: ts.Node, visit: (node: ts.Node) => boolean | void): void {
  if (visit(node) === false) return;
  ts.forEachChild(node, (child) => walk(child, visit));
}

type HtmlKind = 'sanitized' | 'static' | 'unsafe';

/** How an `__html` expression is produced. One hop through a same-file `const` is followed. */
function classifyHtml(expression: ts.Node, sf: ts.SourceFile, depth = 0): { kind: HtmlKind; via: string } {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return { kind: 'static', via: 'a string literal' };
  if (ts.isTemplateExpression(node)) {
    const parts = node.templateSpans.map((span) => classifyHtml(span.expression, sf, depth + 1));
    const bad = parts.find((p) => p.kind === 'unsafe');
    return bad ?? { kind: parts.some((p) => p.kind === 'sanitized') ? 'sanitized' : 'static', via: 'a template of trusted parts' };
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText(sf);
    if (SANITIZER_CALL_RE.test(callee)) return { kind: 'sanitized', via: `${callee}()` };
    if (I18N_CALL_RE.test(callee)) return { kind: 'static', via: `the i18n function ${callee}()` };
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    let root: ts.Node = node;
    while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = root.expression;
    if (ts.isIdentifier(root) && I18N_ROOT_RE.test(root.text)) return { kind: 'static', via: `the i18n dictionary ${root.text}` };
  }
  if (ts.isConditionalExpression(node)) {
    const branches = [classifyHtml(node.whenTrue, sf, depth + 1), classifyHtml(node.whenFalse, sf, depth + 1)];
    return branches.find((b) => b.kind === 'unsafe') ?? branches[0];
  }
  if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    const sides = [classifyHtml(node.left, sf, depth + 1), classifyHtml(node.right, sf, depth + 1)];
    return sides.find((s) => s.kind === 'unsafe') ?? sides[0];
  }
  if (ts.isIdentifier(node) && depth < 2) {
    let found: ts.Expression | undefined;
    walk(sf, (n) => {
      if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === node.text && n.initializer) found = n.initializer;
    });
    if (found) return classifyHtml(found, sf, depth + 1);
  }
  return { kind: 'unsafe', via: node.getText(sf).slice(0, 60) };
}

const names = (node: ts.Node, sf: ts.SourceFile): Set<string> => {
  const out = new Set<string>();
  walk(node, (n) => { if (ts.isCallExpression(n)) out.add(n.expression.getText(sf)); });
  return out;
};

/** Identifiers the try block assigns to (`parsed = JSON.parse(x)`), which later code may test. */
const assignedIn = (node: ts.Node): Set<string> => {
  const out = new Set<string>();
  walk(node, (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left)) out.add(n.left.text);
  });
  return out;
};

/**
 * An empty catch is the first stage of a fallback chain when something right after the try retries the same
 * operation, runs a second try, calls a repair/recover helper, or tests what the try was meant to produce.
 */
function isFirstStage(tryStmt: ts.TryStatement, sf: ts.SourceFile): boolean {
  const parent = tryStmt.parent;
  if (!(ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isCaseClause(parent) || ts.isDefaultClause(parent) || ts.isModuleBlock(parent))) return false;
  const siblings = parent.statements;
  const following = siblings.slice(siblings.indexOf(tryStmt) + 1, siblings.indexOf(tryStmt) + 1 + FOLLOWING_STATEMENTS);
  if (following.length === 0) return false;
  const tried = names(tryStmt.tryBlock, sf);
  const assigned = assignedIn(tryStmt.tryBlock);
  let found = false;
  for (const statement of following) {
    walk(statement, (n) => {
      if (found) return false;
      if (ts.isTryStatement(n)) found = true;
      else if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(sf);
        if (tried.has(callee) || RECOVERY_CALL_RE.test(callee.split('.').pop() ?? callee)) found = true;
      } else if (assigned.size > 0 && (ts.isIfStatement(n) || ts.isConditionalExpression(n) || (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken)))) {
        const tested = ts.isIfStatement(n) ? n.expression : ts.isConditionalExpression(n) ? n.condition : n.left;
        walk(tested, (m) => { if (ts.isIdentifier(m) && assigned.has(m.text)) found = true; });
      }
      return !found;
    });
    if (found) return true;
  }
  return false;
}

const isControl = (n: ts.Node): boolean => ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isTryStatement(n) || ts.isCatchClause(n);
const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);

function controlDepth(node: ts.Node, current = 0): number {
  const here = isControl(node) && !(ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node) ? current + 1 : current;
  let max = here;
  ts.forEachChild(node, (child) => { if (!isFunctionLike(child)) max = Math.max(max, controlDepth(child, here)); });
  return max;
}

function functionName(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(fn)) return 'constructor';
  if (fn.name) return fn.name.getText(sf);
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return parent.name.getText(sf);
  return 'this function';
}

/** Refactoring advice for the function with the deepest control flow. */
function nestingAdvice(sf: ts.SourceFile): string | null {
  let best: { fn: ts.FunctionLikeDeclaration; depth: number } | null = null;
  walk(sf, (n) => {
    if (isFunctionLike(n) && n.body && ts.isBlock(n.body)) {
      const depth = controlDepth(n.body);
      if (depth >= NEST_HINT_DEPTH && (!best || depth > best.depth)) best = { fn: n, depth };
    }
  });
  if (!best) return null;
  const { fn, depth } = best as { fn: ts.FunctionLikeDeclaration; depth: number };
  const body = fn.body as ts.Block;
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const span = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.end).line - sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const name = functionName(fn, sf);
  const wrapper = body.statements.find((s): s is ts.IfStatement => ts.isIfStatement(s) && !s.elseStatement && span(s) >= span(body) * 0.5);
  if (wrapper) {
    return `${name}() reaches ${depth} levels: its body is wrapped in the \`if\` at line ${lineOf(wrapper)}. Invert it into a guard clause (\`if (!condition) return …;\`) so the rest drops one level, then repeat for the next wrapping \`if\`.`;
  }
  let loop: ts.Node | undefined;
  walk(body, (n) => { if (!loop && (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n)) && controlDepth(n) >= 3) loop = n; });
  if (loop) return `${name}() reaches ${depth} levels: extract the body of the loop at line ${lineOf(loop)} into a named helper and use \`continue\` for the skip cases.`;
  return `${name}() reaches ${depth} levels: extract the innermost block into a named function, and return early on the error paths.`;
}

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean);

/** Groups top-level function names by the noun left after the leading verb: createOrder, updateOrder -> order. */
function monolithAdvice(sf: ts.SourceFile): { count: number; plan: string } {
  const declared: string[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) declared.push(s.name.text);
    else if (ts.isClassDeclaration(s) && s.name) declared.push(s.name.text);
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) declared.push(d.name.text);
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const name of declared) {
    const parts = words(name);
    const noun = (parts.length > 1 && VERBS.has(parts[0].toLowerCase()) ? parts[1] : parts[0]).toLowerCase();
    groups.set(noun, [...(groups.get(noun) ?? []), name]);
  }
  const clusters = [...groups.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  const plan = clusters.length
    ? `${clusters.map(([noun, list]) => `${noun}.ts (${list.slice(0, 3).join(', ')}${list.length > 3 ? `, +${list.length - 3} more` : ''})`).join('; ')}. Keep this file as a barrel that re-exports them so existing imports keep working.`
    : 'Group the exports by the entity they act on and move each group into its own module; keep this file as a barrel that re-exports them.';
  return { count: declared.length, plan };
}

const splitLines = (text: string): string[] => {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * Builds the line views from real tokens, so a quote inside a regex literal or JSX text can never be
 * mistaken for the start of a string. Every view keeps the original columns: removed text becomes spaces.
 */
/** Actionable debt markers: at the start of a comment (or JSDoc `*` line), or followed by `:` anywhere. */
const DEBT_RE = /^\s*\*?\s*(?:(TODO|FIXME|HACK|XXX)(?:\s*\([^)]*\))?(?:[:\-\s]|$)|(UNSAFE)(?:\s*\([^)]*\))?[:\-])|\b(TODO|FIXME|HACK|XXX|UNSAFE)(?:\s*\([^)]*\))?:/;

export function matchDebtComment(text: string): { tag: string; note: string } | null {
  const m = DEBT_RE.exec(text);
  if (!m) return null;
  const tag = (m[1] ?? m[2] ?? m[3]).toUpperCase();
  const note = text.trim().replace(/\s+/g, ' ').slice(0, 70);
  return { tag, note };
}

function lineViews(sf: ts.SourceFile, suppressionLines: number[], debtComments: AstScan['debtComments']): LineViews {
  const text = sf.text;
  // UTF-16 units, not code points: every position below is a string index, and an emoji is two of them.
  const code = text.split('');
  const bare = text.split('');
  const comment: string[] = text.split('').map((ch) => (ch === '\n' || ch === '\r' ? ch : ' '));
  const blank = (target: string[], from: number, to: number) => {
    for (let i = from; i < to; i++) if (target[i] !== '\n' && target[i] !== '\r') target[i] = ' ';
  };
  const seen = new Set<number>();
  const seenDebtLines = new Set<number>();
  const visit = (node: ts.Node) => {
    const start = node.getStart(sf);
    if (node.kind === ts.SyntaxKind.JsxText) blank(bare, node.pos, node.end);
    else {
      // Every comment sits in the trivia before some token (the end-of-file token holds the last ones). TypeScript
      // splits that trivia into "trailing" (same line as the previous token) and "leading" (after a line break).
      const collect = (pos: number, end: number, kind: ts.CommentKind) => {
        if (seen.has(pos)) return;
        seen.add(pos);
        blank(code, pos, end);
        blank(bare, pos, end);
        const innerEnd = kind === ts.SyntaxKind.MultiLineCommentTrivia ? end - 2 : end;
        for (let i = pos + 2; i < innerEnd; i++) comment[i] = text[i];
        const startLineNum = sf.getLineAndCharacterOfPosition(pos).line + 1;
        text.slice(pos + 2, innerEnd).split(/\r?\n/).forEach((part, offset) => {
          const line = startLineNum + offset;
          if (seenDebtLines.has(line)) return;
          const hit = matchDebtComment(part);
          if (hit) {
            seenDebtLines.add(line);
            debtComments.push({ line, ...hit });
          }
        });
        if (/^[\s/*]*@ts-(?:ignore|nocheck)\b/.test(text.slice(pos, end).split('\n').pop() ?? '')) {
          suppressionLines.push(sf.getLineAndCharacterOfPosition(end - 1).line + 1);
        }
      };
      ts.forEachTrailingCommentRange(text, node.getFullStart(), collect);
      ts.forEachLeadingCommentRange(text, node.getFullStart(), collect);
    }
    if (ts.isRegularExpressionLiteral(node)) blank(bare, start + 1, text.lastIndexOf('/', node.end - 1));
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateTail(node)) blank(bare, start + 1, node.end - 1);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) blank(bare, start + 1, node.end - 2);
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  return { lines: splitLines(text), code: splitLines(code.join('')), bare: splitLines(bare.join('')), comment: splitLines(comment.join('')) };
}

const startLine = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

function isBranchNode(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node)
  ) return true;
  return ts.isBinaryExpression(node) && (
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
    node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
  );
}

export function scanAst(path: string, content: string): AstScan {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kindFor(path));
  const suppressionLines: number[] = [];
  const debtComments: AstScan['debtComments'] = [];
  const out: AstScan = { findings: [], stringLines: new Set(), fallbackCatchLines: new Set(), declaredTypes: [], promptTypeRefs: [], nestingHint: null, views: lineViews(sf, suppressionLines, debtComments), anyLines: [], suppressionLines, debtComments, longestFunction: null, branches: 0 };

  const literal = (node: ts.Node, text: string) => {
    const first = startLine(sf, node);
    const last = sf.getLineAndCharacterOfPosition(node.end).line + 1;
    for (let line = first + 1; line <= last; line++) out.stringLines.add(line);
    for (const m of text.matchAll(/\b(?:interface|type)\s+([A-Z]\w*)\s*(?:<[^>{=]*>)?\s*(?:\{|=)/g)) {
      out.promptTypeRefs.push({ name: m[1], line: first + text.slice(0, m.index).split('\n').length - 1 });
    }
  };

  for (const s of sf.statements) {
    if ((ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name) out.declaredTypes.push(s.name.text);
  }

  walk(sf, (node) => {
    if (isBranchNode(node)) out.branches++;
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isStringLiteral(node)) {
      literal(node, node.text);
    } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
      out.anyLines.push(startLine(sf, node));
    } else if ((isFunctionLike(node) || ts.isConstructorDeclaration(node) || ts.isAccessor(node)) && node.body && ts.isBlock(node.body)) {
      const line = startLine(sf, node);
      const length = sf.getLineAndCharacterOfPosition(node.end).line + 1 - line + 1;
      if (!out.longestFunction || length > out.longestFunction.length) {
        const name = functionName(node, sf);
        out.longestFunction = { name: name === 'this function' ? 'anonymous' : name, line, length };
      }
    } else if (ts.isTryStatement(node) && node.catchClause && node.catchClause.block.statements.length === 0 && isFirstStage(node, sf)) {
      out.fallbackCatchLines.add(startLine(sf, node.catchClause));
    } else if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'dangerouslySetInnerHTML') {
      const line = startLine(sf, node);
      const init = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
      const object = init ? unwrap(init) : undefined;
      const html = object && ts.isObjectLiteralExpression(object)
        ? object.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText(sf) === '__html')
        : undefined;
      const value = html && ts.isPropertyAssignment(html) ? classifyHtml(html.initializer, sf) : html ? classifyHtml((html as ts.ShorthandPropertyAssignment).name, sf) : { kind: 'unsafe' as const, via: (init?.getText(sf) ?? 'unknown value').slice(0, 60) };
      if (value.kind === 'unsafe') {
        out.findings.push({ kind: 'unsafe-html', line, text: `Line ${line}: dangerouslySetInnerHTML renders \`${value.via}\`, which is not sanitized; unsanitized input here is an XSS risk.` });
      } else {
        out.findings.push({
          kind: 'html-notice', line,
          text: value.kind === 'sanitized'
            ? `Line ${line}: dangerouslySetInnerHTML receives HTML sanitized by ${value.via}; keep the sanitizer on every path that reaches it.`
            : `Line ${line}: dangerouslySetInnerHTML renders trusted static content from ${value.via}; it stays safe only while that content never includes user input.`,
        });
      }
    }
  });

  const total = out.views.lines.length;
  if (total > MONOLITH_LINES) {
    const { count, plan } = monolithAdvice(sf);
    out.findings.push({ kind: 'monolith', line: 1, text: `Line 1: ${total} lines and ${count} top-level declarations in one file, so many unrelated changes land here. Possible split by prefix/domain (heuristic): ${plan}`, suggestion: `Consider splitting this ${total}-line file by domain (heuristic): ${plan}` });
  }
  out.nestingHint = nestingAdvice(sf);
  return out;
}
