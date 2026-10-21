/**
 * Dolphin – heuristic source-code detector for exam text.
 *
 * Used when the file itself carries no hint (TXT, pasted text, Word in a normal font).
 * Conservative by design: a line is code only with ≥ 2 independent signals, or with
 * one signal while sitting next to a confirmed code line. Vietnamese prose and math
 * (anything with diacritics or $…$ outside strings/comments) never counts.
 */

import { looksLikeCodeFragment } from '../../../shared/utils/richText.js';
import { isPythonLike } from '../../../shared/utils/highlightCode.js';

const VIETNAMESE =/[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;

const CODE_START = new RegExp([
    '#\\s*(include|define|import|pragma)\\b', 'import\\s+[\\w.{*]', 'from\\s+[\\w.]+\\s+import\\b', 'using\\s+(namespace|System)\\b', 'package\\s+\\w',
    'def\\s+\\w+\\s*\\(', 'class\\s+\\w+', '(public|private|protected|static|final|abstract)\\s', 'void\\s+\\w', '(unsigned\\s+)?(int|long|short|float|double|char|bool|boolean|byte)\\s+\\*?\\w',
    '(string|String)\\s+\\w', '(var|let|const|auto)\\s+\\w', 'function\\s*\\w*\\s*\\(', 'return\\b', 'for\\s*\\(', 'for\\s+\\w+\\s+in\\s', 'for\\s+\\w+\\s*:=',
    'while\\s*\\(', 'while\\s+.+(:|\\bdo)$', 'if\\s*\\(', 'if\\s+.+(:|\\bthen)$', 'elif\\s', 'else\\b', 'switch\\s*\\(', 'case\\s+.+:', 'try\\s*[:{]?$', 'catch\\s*\\(', 'except\\b',
    'print\\s*\\(', 'printf\\s*\\(', 'scanf\\s*\\(', 'puts\\s*\\(', 'cout\\s*<<', 'cin\\s*>>', 'System\\.', 'console\\.', 'Console\\.',
    'begin\\b', 'end\\s*[;.]?$', 'program\\s+\\w', 'uses\\s+\\w', '(procedure|function)\\s+\\w+', 'writeln', 'readln', 'write\\s*\\(', 'read\\s*\\(',
    '(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\\s', '<\\?php', '^\\?>$','<\\/?[a-z][\\w-]*(\\s[^>]*)?>', '\\$\\w+\\s*=',
].map((p) => `(?:${p})`).join('|'));

const MATH_FUNCS = /^(sin|cos|tan|cot|log|ln|lg|exp|sqrt|lim|max|min|abs|arcsin|arccos|arctan)$/i;

/** Strip string literals and comments so their content (often Vietnamese) does not veto a code line. */
function stripLiteralsAndComments(line) {
    let code = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    // HTML element: its text content (<a href="…">Trang chủ</a>) is not code to judge.
    if (/^<[A-Za-z!/?]/.test(code) && />$/.test(code)) code = code.replace(/>[^<>]*</g, '><');
    // Pascal comments { … } and (* … *)
    if (/:=|\b(?:begin|end|then|do|writeln|readln)\b/i.test(code)) code = code.replace(/\{[^{}]*\}|\(\*.*?\*\)/g, ' ');
    // In Python `//` is floor division (x //= 2), only `#` starts a comment.
    if (isPythonLike(code)) return code.replace(/#.*$/, ' ');
    return code
        .replace(/\/\*.*?\*\//g, ' ')
        .replace(/(\/\/|--\s|#(?!\s*(include|define|import|pragma)\b)).*$/, ' ');
}

const isCommentOnly = (line) => /^\s*(\/\/|#(?!\s*(include|define|import|pragma)\b)|\/\*|\*\s|--\s|\(\*)/.test(line)
    || /^\{[^{}]*\}$/.test(line.trim()); // Pascal { comment }

/**
 * Score one plain-text line. Returns { score, neutral } where neutral means
 * "only braces / a comment" – code only if a neighbour is code.
 */
export function scoreCodeLine(raw) {
    const line = String(raw ?? '').replace(/\u00A0/g, ' ');
    const trimmed = line.trim();
    if (!trimmed) return { score: 0, neutral: false };
    if (/^[{}()[\];,]+$/.test(trimmed) || /^end[;.]?$/i.test(trimmed) || trimmed === '?>') return { score: 1, neutral: true };
    if (isCommentOnly(trimmed)) return { score: 0, neutral: true };
    // An embedded picture: base64 is full of + / = and would otherwise read as operators.
    if (/\[IMG:/.test(trimmed)) return { score: 0, neutral: false };

    const code = stripLiteralsAndComments(trimmed);
    if (VIETNAMESE.test(code) || /\$[^$]+\$/.test(code)) return { score: 0, neutral: false };

    let score = 0;
    if (CODE_START.test(code)) score += 2;
    // Literal/string/container assignments are stronger evidence than a bare
    // mathematical equality such as x = 2.
    if (/^[A-Za-z_]\w*\s*=\s*(?:["'`]|\[|\{)/.test(trimmed)) score += 1;
    if (/[;{]\s*$|^\s*}|\)\s*:\s*$/.test(code)) score += 1;
    // x += 1, i++, a == b, p && q exist only in code; ->, =>, << also appear in prose arrows.
    if (/\+\+|[-+*/%]=|==|&&|\|\|/.test(code)) score += 2;
    else if (/(!=|--(?!\s)|:=|->|=>|::|<<|>>)/.test(code)) score += 1;
    else if (/\b[A-Za-z_]\w*(\[[^\]]*\])?\s*=\s*[^=\s]/.test(code)) score += 1; // plain assignment
    // x = x * 2 - 3: a variable updated from itself is a statement, not an equation (x^2 is math).
    const self = code.match(/^([A-Za-z_]\w*)\s*=(?!=)(.*)$/);
    if (self && !/\^/.test(code) && new RegExp(`\\b${self[1]}\\b`).test(self[2])) score += 1;
    // Python-only operators: x //= 2, a // b, 3**2
    if (/\/\/|\*\*/.test(code) && isPythonLike(code)) score += 1;
    const calls = [...code.matchAll(/\b([A-Za-z_]\w+)\s*\(/g)].map((m) => m[1]).filter((n) => !MATH_FUNCS.test(n));
    if (calls.length > 0) score += 1;
    // A line that is only a call statement: f(), obj.run(x), stack.pop();
    // (math writes f(x), never f() or a.b(x)). Single-letter names count here too.
    const stmt = code.match(/^([A-Za-z_][\w.]*)\s*\((.*)\)\s*;?$/);
    if (stmt) {
        if (!calls.length && !MATH_FUNCS.test(stmt[1])) score += 1;
        if (!stmt[2].trim() || stmt[1].includes('.') || /;$/.test(code)) score += 1;
    } else if (/\b[A-Za-z_]\w*\.[A-Za-z_]\w*\s*\(/.test(code)) score += 1; // method call: math.sqrt(4)
    if (score > 0 && /^(\t| {2,})/.test(line)) score += 1; // indented body line
    return { score, neutral: false };
}

/**
 * Decide which lines (array of plain strings) are code.
 * @param {string[]} plains
 * @param {(i:number)=>boolean} [skip] lines that must never be code (question/option/answer lines)
 * @param {(i:number)=>boolean} [known] lines already marked as code by the source file
 * @returns {boolean[]}
 */
export function detectCodeLines(plains, skip = () => false, known = () => false) {
    const scores = plains.map((p, i) => (skip(i) ? { score: 0, neutral: false, skip: true } : scoreCodeLine(p)));
    // `known` = already code from the file itself (monospace font in Word/PDF): counts as a neighbour
    const isCode = scores.map((s, i) => known(i) || (!s.skip && s.score >= 2));
    // grow blocks: weak lines (1 signal), braces and comments join an adjacent code line
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < scores.length; i++) {
            if (isCode[i] || scores[i].skip) continue;
            const weak = scores[i].score >= 1 || scores[i].neutral || /^(\t| {2,})\S/.test(plains[i]);
            if (!weak) continue;
            if (isCode[i - 1] || isCode[i + 1]) { isCode[i] = true; changed = true; }
        }
    }
    // bridge: up to 3 short statement lines sandwiched between code belong to the listing
    for (let i = 0; i < plains.length; i++) {
        if (isCode[i] || !isCode[i - 1]) continue;
        let j = i;
        while (j < plains.length && j - i < 3 && !isCode[j] && !scores[j].skip && looksLikeCodeFragment(plains[j])) j++;
        if (j > i && isCode[j]) for (let k = i; k < j; k++) isCode[k] = true;
    }
    return isCode;
}

/** Single snippet (e.g. one option) – code only with strong evidence. */
export function looksLikeCode(text) {
    return scoreCodeLine(text).score >= 2;
}
