/**
 * Dolphin – Advanced Question Parser v3
 * Supports: Plain text, rich HTML (from docxExtractor / PDF lines)
 *
 * Question Types:
 *   "single"     – Standard MCQ, single correct answer
 *   "multiple"   – Multi-select (Đáp án: A, B, C  or  [Loại: Chọn nhiều])
 *   "true_false" – Only Đúng/Sai options  or  [Loại: Đúng/Sai]
 *   "essay"      – No options found, or [Loại: Tự luận]
 *
 * Detects correct answers via 3 methods:
 *   Format A: Bold/Underline formatting on options (<strong>, <u>, <b>)
 *   Format B: Inline answer lines (Đáp án:, Đáp án đúng:, Key:, Chọn:, Answer:)
 *   Format C: Answer key table at end of document (1-A, 2-C, 3-B ...)
 *
 * v3 Changes vs v2:
 *   - OPTION_REGEX is now strict: only `.` or `)` delimiters, not bare space
 *     → prevents normal sentences starting with a letter being misread as options
 *   - Fixed "tự luận" type-tag detection bug (v2 checked for 'tuan' which never matched)
 *   - Format A: accumulates ALL bold/underline options → correct multi-select detection
 *   - extractAnswerKeyTable: section-header isolation + MIN_KEY_ENTRIES threshold
 *     → eliminates false positives from option/sentence text
 *   - QUESTION_NUM_ONLY: removed `:` as delimiter → won't mis-parse "1: A" answer lines
 *   - Multi-line support: continuation lines append to current option or question content
 *   - parseAnswerLine: added "đáp án đúng" variant + end-anchor `$`
 *   - applyAnswerKeyTable extracted as shared helper
 *   - hasFormattingMark: requires non-whitespace content inside the tag
 */

import { normalizeUnicodeToLatex } from '@/shared/math/mathUtils';
import { convertAsciiMathToLatex } from '@/shared/math/asciiMathParser';
import { extractMathMLFromText } from '@/shared/math/mathmlParser';
import { escapeHtml, sanitizeRichHtml, normalizeExplanation } from '@/shared/utils/richText';
import { detectCodeLines, looksLikeCode } from './codeDetector';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a letter (case-insensitive) to 0-based index (a=0 … z=25), or -1 */
function letterToIndex(letter) {
    if (!letter) return -1;
    const ch = letter.trim().toLowerCase().charCodeAt(0);
    return ch >= 97 && ch <= 122 ? ch - 97 : -1;
}

// ─────────────────────────────────────────────
// Type-tag inline detection
// ─────────────────────────────────────────────

const TYPE_TAG_REGEX = /\[Loại\s*:?\s*(Chọn\s*nhiều|Đúng\s*\/\s*Sai|Tự\s*luận)\]/i;

/**
 * Extract explicit [Loại: ...] tag → type string, or null.
 * v3: Uses targeted regex per variant instead of broken string-collapse comparison.
 *     v2 had `v.includes('tuan')` which never matched "tựluận".
 */
function extractTypeTag(text) {
    const m = text.match(TYPE_TAG_REGEX);
    if (!m) return null;
    const v = m[1].trim();
    if (/ch[oọ]n\s*nhi[eê]u/i.test(v)) return 'multiple';
    if (/[dđ][uú]ng\s*\/\s*sai/i.test(v)) return 'multi_true_false';
    if (/t[ựừu]\s*lu[aậ]n/i.test(v)) return 'essay';
    return null;
}

/** Remove [Loại: ...] tag from a content string */
function removeTypeTag(text) {
    return text.replace(TYPE_TAG_REGEX, '').trim();
}

// ─────────────────────────────────────────────
// Math notation normalization pipeline
// ─────────────────────────────────────────────

function normalizeMathNotations(text) {
    if (!text) return text;

    let result = text;

    // 1. Convert MathML to LaTeX
    result = extractMathMLFromText(result);

    // 2. Convert AsciiMath to LaTeX
    result = convertAsciiMathToLatex(result);

    // 3. Normalize LaTeX delimiters: \(...\) → $...$, \[...\] → $$...$$
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, (match, p1) => `$${p1}$`);
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => `$$$${p1}$$$$`);

    return result;
}

// ─────────────────────────────────────────────
// Format C: Answer Key Table scanner
// ─────────────────────────────────────────────

/**
 * Minimum number of entries a key-table cluster must have to be accepted.
 * Prevents stray "1-A" or "2.B" inside question text from polluting the map.
 */
const MIN_KEY_ENTRIES = 3;

/**
 * Scan text for patterns like "1-A", "2: B,C", "Câu 3 – A".
 *
 * v3 improvements:
 *   1. Tries to isolate a dedicated answer-key section first (look for header
 *      keywords: "đáp án", "answer key", "bảng đáp án").
 *   2. If no header found, only accepts the result when ≥ MIN_KEY_ENTRIES match,
 *      to reduce false positives from option lines or running text.
 *
 * Returns Map<number, number | number[]>
 */
function extractAnswerKeyTable(text) {
    const keyMap = new Map();
    let tableStartIndex = -1;

    // Try to isolate a dedicated section that starts with a header keyword
    const headerRegex = /(?:\n|^)\s*(?:(?:bảng\s*)?đáp\s*án(?:\s*(?:chi\s*tiết|trắc\s*nghiệm|tham\s*khảo|chuẩn))?|answer\s*key)\s*[:.]?\s*(?=\n|$)/gim;
    const headers = [...text.matchAll(headerRegex)];

    // v3: separator list is explicit (-, –, ., :) — bare space removed to cut noise
    const regex = /(?:câu\s*)?(\d+)\s*[-–.:]\s*([A-Za-z](?:\s*[,/]\s*[A-Za-z])*)\b/g;

    let foundSection = false;

    for (let i = headers.length - 1; i >= 0; i--) {
        const h = headers[i];
        const matchStart = h.index + (h[0].startsWith('\n') ? 1 : 0);
        const subText = text.slice(matchStart);
        
        let m;
        let localMap = new Map();
        regex.lastIndex = 0;
        while ((m = regex.exec(subText)) !== null) {
            const qNum = parseInt(m[1], 10);
            const letters = m[2].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
            if (qNum > 0 && letters.length > 0) {
                const indices = letters.map(letterToIndex).filter(idx => idx >= 0);
                if (indices.length > 0) {
                    localMap.set(qNum, indices.length === 1 ? indices[0] : indices);
                }
            }
        }
        
        if (localMap.size >= MIN_KEY_ENTRIES) {
            keyMap.clear();
            for (const [k, v] of localMap.entries()) keyMap.set(k, v);
            tableStartIndex = matchStart;
            foundSection = true;
            break;
        }
    }

    // If we didn't find a dedicated section, search the whole text
    if (!foundSection) {
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(text)) !== null) {
            const qNum = parseInt(m[1], 10);
            const letters = m[2].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
            if (qNum > 0 && letters.length > 0) {
                const indices = letters.map(letterToIndex).filter(idx => idx >= 0);
                if (indices.length > 0) {
                    keyMap.set(qNum, indices.length === 1 ? indices[0] : indices);
                }
            }
        }
        if (keyMap.size < MIN_KEY_ENTRIES) {
            keyMap.clear();
        }
    }

    return { keyMap, tableStartIndex };
}

// ─────────────────────────────────────────────
// Option line parsing
// ─────────────────────────────────────────────

/**
 * Strict option regex: letter MUST be followed by `.` or `)` then whitespace.
 * v3 fix: v2 used `[.):\s]` which matched any single space, causing normal
 * sentences that start with a letter (e.g. "Học sinh…") to be parsed as options.
 *
 * Primary:  "A. text"  "A) text"
 * Fallback: "A: text"  (less common but seen in some Vietnamese exams)
 */
const OPTION_REGEX = /^([A-Za-z])[.)]\s+(.+)/;
const OPTION_COLON_REGEX = /^([A-Za-z]):\s+(.+)/;

function parseOptionLine(line) {
    const clean = line.trim();
    const m = clean.match(OPTION_REGEX) ?? clean.match(OPTION_COLON_REGEX);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const index = letterToIndex(letter);
    if (index < 0) return null;
    return { letter, text: m[2].trim(), index };
}

// ─────────────────────────────────────────────
// Inline answer line detection (Format B)
// ─────────────────────────────────────────────

/**
 * Parse a multi-statement True/False answer.
 * Examples: "a-Đúng, b-Đúng, c-Đúng, d-Sai" or "A: Đúng, B: Sai, C: Đúng, D: Sai"
 * Abbrev: "a-Đ, b-S, c-Đ, d-S" or "A-T, B-F"
 */
export function parseMultiTrueFalseAnswer(text) {
    const clean = text.trim();
    // Match option letter and value: e.g. "a-Đúng", "B: Sai", "c) Đ", "d. S"
    const pairRegex = /([a-zA-Z])\s*[-.:)]\s*([đđĐDsS][úuúnnggai]*|[tTfF][rRuUeEaAlLsSeE]*)(?:\s|$|[,;.])/gi;
    
    const matches = [...clean.matchAll(pairRegex)];
    // Require at least 2 matches to prevent single MCQ answers like "A. Đúng" from being misidentified
    if (matches.length < 2) return null;
    
    const result = [];
    let maxIndex = -1;
    
    for (const match of matches) {
        const letter = match[1];
        const valueStr = match[2].toLowerCase();
        const index = letterToIndex(letter);
        if (index >= 0) {
            // Match any variant of "đúng", "đ", "true", "t"
            const isTrue = /[đđđDd][úuúnngg]*|[tT][rRuUeE]*/.test(valueStr);
            result[index] = isTrue;
            if (index > maxIndex) maxIndex = index;
        }
    }
    
    if (maxIndex < 0) return null;
    
    // Fill holes with false
    const finalAnswers = [];
    for (let i = 0; i <= maxIndex; i++) {
        finalAnswers[i] = result[i] ?? false;
    }
    
    return finalAnswers;
}

/**
 * v3: Added "đáp án đúng" variant and end-anchor `$` so a partial match
 *     inside a longer sentence does not produce a spurious answer.
 */
const ANSWER_LINE_REGEX =
    /^(?:đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*([A-Za-z](?:\s*[,/]\s*[A-Za-z])*)\s*[.]?(?:\s*(?:đúng|sai))?\s*$/i;

/** Returns a single index, an array of indices, an array of T/F booleans, or -1 if line is not an answer line. */
function parseAnswerLine(line) {
    const clean = line.trim();
    
    // 1. Try to parse as Multi-statement True/False answer by stripping prefix
    const prefixRegex = /^(?:đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i;
    const prefixMatch = clean.match(prefixRegex);
    if (prefixMatch) {
        const potentialTF = parseMultiTrueFalseAnswer(prefixMatch[1]);
        if (potentialTF) {
            return potentialTF;
        }
    }
    
    // 2. Fallback to standard parser
    const m = clean.match(ANSWER_LINE_REGEX);
    if (!m) return -1;
    const letters = m[1].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
    const indices = letters.map(letterToIndex).filter(i => i >= 0);
    if (indices.length === 0) return -1;
    return indices.length === 1 ? indices[0] : indices;
}

// ─────────────────────────────────────────────
// Question-start line detection
// ─────────────────────────────────────────────

const IS_ONLY_KEYS_REGEX = /^(?:\s*(?:câu\s*)?\d+\s*[-–.:]\s*[A-Za-z](?:\s*[,/]\s*[A-Za-z])*\s*[,;]*\s*)+$/i;

/** Named prefix: "Câu 1.", "Câu 1:", "Question 2)", "Q3." */
const QUESTION_NAMED_REGEX = /^(?:câu|question|q\.?)\s*(\d+)\s*[.:)]\s*(.*)/i;

/**
 * Bare number: "1. text", "2) text"
 * v3 fix: v2 also accepted `:` here which caused "1: A" answer-key lines to be
 * misread as question starts. Removed `:` from the delimiter class.
 */
const QUESTION_NUM_ONLY = /^(\d+)[.)]\s+(.*)/;

function parseQuestionStart(line) {
    if (IS_ONLY_KEYS_REGEX.test(line)) return null;

    const clean = line.trim().replace(/^\uFEFF/, ''); // strip BOM
    let m = clean.match(QUESTION_NAMED_REGEX);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    m = clean.match(QUESTION_NUM_ONLY);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    return null;
}

// ─────────────────────────────────────────────
// True/False option detector
// ─────────────────────────────────────────────

const TRUE_FALSE_TEXTS = new Set([
    'đúng', 'sai', 'true', 'false', 'đ', 's', 'correct', 'incorrect',
]);

function isTrueFalseOptions(options) {
    const nonEmpty = options.filter(o => o && o.trim() !== '');
    if (nonEmpty.length < 2) return false;
    return nonEmpty.every(o => TRUE_FALSE_TEXTS.has(o.trim().toLowerCase()));
}

// ─────────────────────────────────────────────
// Determine question type for a parsed block
// ─────────────────────────────────────────────

function determineType(block) {
    const combined = block.content + ' ' + block.options.filter(Boolean).join(' ');
    const tag = extractTypeTag(combined);
    if (tag) return tag;

    const hasOptions = block.options.some(o => o && o.trim() !== '');
    if (!hasOptions) return 'essay';

    // If correctAnswer is an array of booleans, it's multi_true_false!
    if (Array.isArray(block.correctAnswer) && block.correctAnswer.length > 0 && block.correctAnswer.every(val => typeof val === 'boolean')) {
        return 'multi_true_false';
    }

    if (isTrueFalseOptions(block.options)) return 'true_false';

    if (Array.isArray(block.correctAnswer) && block.correctAnswer.length > 1)
        return 'multiple';

    return 'single';
}

// ─────────────────────────────────────────────
// Finalize a raw block into the output shape
// ─────────────────────────────────────────────

function finalizeBlock(block) {
    // Trim sparse array: drop trailing empty/undefined slots
    let lastValid = -1;
    for (let i = 0; i < block.options.length; i++) {
        if (block.options[i] !== undefined && block.options[i] !== '') lastValid = i;
    }
    block.options = Array.from({ length: lastValid + 1 }, (_, i) => block.options[i] ?? '');

    const type = determineType(block);
    const content = removeTypeTag(block.content.trim());
    let { correctAnswer } = block;

    if (type === 'essay') {
        correctAnswer = '';
    } else if (type === 'multi_true_false') {
        if (!Array.isArray(correctAnswer)) {
            correctAnswer = Array(block.options.length).fill(false);
        } else {
            correctAnswer = block.options.map((_, idx) => {
                if (typeof correctAnswer[idx] === 'boolean') return correctAnswer[idx];
                return false;
            });
        }
    } else if (type === 'multiple') {
        if (!Array.isArray(correctAnswer))
            correctAnswer = correctAnswer >= 0 ? [correctAnswer] : [0];
    } else {
        // single / true_false
        if (Array.isArray(correctAnswer)) correctAnswer = correctAnswer[0] ?? 0;
        if (typeof correctAnswer !== 'number' || correctAnswer < 0) correctAnswer = 0;
    }

    return {
        num: block.num,
        content: normalizeUnicodeToLatex(content),
        type,
        options: block.options.map(o => normalizeUnicodeToLatex(o)),
        correctAnswer,
    };
}

// ─────────────────────────────────────────────
// Shared helper: apply Format-C key table to unanswered blocks
// ─────────────────────────────────────────────

function applyAnswerKeyTable(blocks, keyMap) {
    for (const block of blocks) {
        const unanswered =
            block.correctAnswer === -1 ||
            (Array.isArray(block.correctAnswer) && block.correctAnswer.length === 0);
        if (unanswered && keyMap.has(block.num)) {
            block.correctAnswer = keyMap.get(block.num);
        }
    }
}

// ─────────────────────────────────────────────
// Plain-text parser
// ─────────────────────────────────────────────

/**
 * Parse plain text into question objects.
 *
 * v3: Supports multi-line question bodies and multi-line option text.
 *     Continuation lines (lines that don't start a new question/option/answer)
 *     are appended to the previous option or to the question content if no
 *     options have been seen yet.
 *
 * @param {string} text
 * @returns {Array<{num, content, type, options, correctAnswer}>}
 */
export function parseQuestionsFromText(text) {
    if (!text?.trim()) return [];

    text = normalizeMathNotations(text);

    let { keyMap: answerKeyTable, tableStartIndex } = extractAnswerKeyTable(text);

    if (tableStartIndex !== -1) {
        text = text.slice(0, tableStartIndex);
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const blocks = [];
    let cur = null;
    let lastOptionIndex = -1; // track last parsed option for continuation lines

    const processSingleLine = (line) => {
        // ── New question? ──────────────────────────────────────────────────────
        const qStart = parseQuestionStart(line);
        if (qStart) {
            if (cur) blocks.push(cur);
            cur = { num: qStart.num, content: qStart.content, options: [], correctAnswer: -1 };
            lastOptionIndex = -1;
            return;
        }

        if (!cur) return;

        // ── MCQ option? ────────────────────────────────────────────────────────
        const optLine = parseOptionLine(line);
        if (optLine) {
            cur.options[optLine.index] = optLine.text;
            lastOptionIndex = optLine.index;
            return;
        }

        // ── Inline answer (Format B)? ──────────────────────────────────────────
        const inlineAns = parseAnswerLine(line);
        if (inlineAns !== -1) {
            cur.correctAnswer = inlineAns;
            lastOptionIndex = -1; // reset; answer line is not a continuation target
            return;
        }

        // ── Continuation line ──────────────────────────────────────────────────
        if (IS_ONLY_KEYS_REGEX.test(line)) {
            return;
        }

        if (lastOptionIndex >= 0 && cur.options[lastOptionIndex] !== undefined) {
            // Append to the most recently parsed option
            cur.options[lastOptionIndex] += '\n' + line;
        } else if (cur.options.length === 0) {
            // No options collected yet → still building the question stem
            cur.content += '\n' + line;
        }
    };

    for (const line of lines) {
        const embeddedMatch = line.match(/^(.*?)(?:^|\s)(đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i);
        if (embeddedMatch) {
            const before = embeddedMatch[1].trim();
            const keyword = embeddedMatch[2];
            const after = embeddedMatch[3].trim();
            
            const cleanAfter = after.replace(/[.\s]+$/, '');
            const isStandardAns = /^[A-Za-z](?:\s*[,/]\s*[A-Za-z])*(?:\s*(?:đúng|sai))?\s*$/i.test(cleanAfter);
            const isMultiTFAns = parseMultiTrueFalseAnswer(cleanAfter) !== null;
            
            if (isStandardAns || isMultiTFAns) {
                if (before) processSingleLine(before);
                processSingleLine(`${keyword}: ${cleanAfter}`);
                continue;
            }
        }
        processSingleLine(line);
    }

    if (cur) blocks.push(cur);
    applyAnswerKeyTable(blocks, answerKeyTable);

    return blocks
        .filter(b => b.content.trim() !== '')
        .map(finalizeBlock);
}

// ─────────────────────────────────────────────
// HTML parser (rich HTML from docxExtractor / PDF)
// ─────────────────────────────────────────────
//
// The HTML pipeline keeps the formatting of every line: structure detection
// runs on the plain text of a line, while the stored content/options are the
// line's HTML with the "Câu 1." / "A." marker cut off.

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decodeEntities = (s) => (s.includes('&') ? s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITY_MAP[e]) : s);

const tokenizeHtml = (html) => html.match(/<[^>]*>|[^<]+/g) || [];

const tagInfo = (tok) => {
    const m = tok.match(/^<\s*(\/)?\s*([a-zA-Z0-9]+)/);
    if (!m) return null;
    return { name: m[2].toLowerCase(), closing: !!m[1], selfClosing: /\/\s*>$/.test(tok) };
};

const closersOf = (stack) => stack.slice().reverse().map((t) => `</${t.name}>`).join('');
const openersOf = (stack) => stack.map((t) => t.open).join('');

/** Plain text of one (already line-split) HTML fragment. */
function linePlain(html) {
    let out = '';
    for (const tok of tokenizeHtml(html)) if (tok[0] !== '<') out += decodeEntities(tok);
    return out;
}

/** Split rich HTML into lines at </p> and <br>, re-balancing inline tags across the cut. */
function splitIntoLines(html) {
    const lines = [];
    const stack = [];
    let cur = '';
    const flush = (reopen) => {
        const text = cur + closersOf(stack);
        if (/\[IMG:/.test(text) || linePlain(text).trim() !== '') lines.push(text);
        cur = reopen ? openersOf(stack) : '';
        if (!reopen) stack.length = 0;
    };
    for (const tok of tokenizeHtml(html)) {
        const info = tok[0] === '<' ? tagInfo(tok) : null;
        if (!info) { cur += tok; continue; }
        if (info.name === 'p' || info.name === 'div') { flush(false); continue; }
        if (info.name === 'br') { flush(true); continue; }
        if (info.closing) {
            let idx = -1;
            for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === info.name) { idx = i; break; }
            if (idx >= 0) stack.splice(idx);
            cur += tok;
            continue;
        }
        if (!info.selfClosing) stack.push({ name: info.name, open: tok });
        cur += tok;
    }
    flush(false);
    return lines;
}

/** Split HTML after the first `n` plain-text characters; both halves stay well-formed. */
function splitHtmlAt(html, n) {
    const toks = tokenizeHtml(html);
    const stack = [];
    let head = '';
    let count = 0;
    let carry = '';
    let i = 0;
    while (i < toks.length) {
        const tok = toks[i];
        const info = tok[0] === '<' ? tagInfo(tok) : null;
        if (tok[0] === '<') {
            if (info?.closing) {
                for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === info.name) { stack.splice(k); break; }
                head += tok; i++; continue;
            }
            if (count >= n) break;
            if (info && !info.selfClosing) stack.push({ name: info.name, open: tok });
            head += tok; i++; continue;
        }
        if (count >= n) break;
        const text = decodeEntities(tok);
        const room = n - count;
        if (text.length <= room) { head += tok; count += text.length; i++; continue; }
        head += escapeHtml(text.slice(0, room));
        carry = escapeHtml(text.slice(room));
        i++;
        break;
    }
    return [head + closersOf(stack), openersOf(stack) + carry + toks.slice(i).join('')];
}

/** Apply fn to every text node of the HTML that is not inside <code>/<pre>. */
function mapTextOutsideCode(html, fn) {
    let codeDepth = 0;
    return tokenizeHtml(html).map((tok) => {
        if (tok[0] === '<') {
            const info = tagInfo(tok);
            if (info && (info.name === 'code' || info.name === 'pre')) codeDepth += info.closing ? -1 : 1;
            return tok;
        }
        if (codeDepth > 0) return tok;
        return escapeHtml(fn(decodeEntities(tok)));
    }).join('');
}

/**
 * Does this option line carry an "answer mark"?
 *   • the option letter ("A") itself is bold/underlined/highlighted, or
 *   • the whole option text is bold/underlined/highlighted.
 * A single bold word inside an option no longer counts.
 */
function isMarkedOption(html, offset, markerLen) {
    const chars = [];
    let fmt = 0;
    for (const tok of tokenizeHtml(html)) {
        if (tok[0] === '<') {
            const info = tagInfo(tok);
            if (info && ['b', 'strong', 'u', 'mark'].includes(info.name) && !info.selfClosing) fmt += info.closing ? -1 : 1;
            continue;
        }
        for (const c of decodeEntities(tok)) chars.push({ c, f: fmt > 0 });
    }
    const letter = chars.slice(offset).find((x) => /\S/.test(x.c));
    if (letter?.f) return true;
    const rest = chars.slice(offset + markerLen).filter((x) => /\S/.test(x.c));
    return rest.length > 0 && rest.every((x) => x.f);
}

/**
 * Explanation / solution label at the start of a line:
 * "Giải thích:", "Lời giải:", "Lời giải chi tiết:", "Hướng dẫn giải:", "HDG:", "Giải:",
 * "Phân tích:", "Explanation:", "Solution:" (optionally in parentheses/brackets).
 */
const EXPLANATION_LABEL = /^[([]?\s*((?:lời\s*)?giải\s*thích(?:\s*chi\s*tiết)?|lời\s*giải(?:\s*chi\s*tiết)?|hướng\s*dẫn(?:\s*giải)?(?:\s*chi\s*tiết)?|hd\s*giải|hdg|giải|phân\s*tích|explanation|solution)\s*[)\]]?\s*[:：]\s*/i;
/** Same label somewhere after an answer on one line: "Đáp án: A. Giải thích: …" */
const EXPLANATION_INLINE = /^(.*?)(?:^|\s|[.;,–-])\s*(\(?\s*(?:(?:lời\s*)?giải\s*thích(?:\s*chi\s*tiết)?|lời\s*giải(?:\s*chi\s*tiết)?|hướng\s*dẫn(?:\s*giải)?|hd\s*giải|hdg|giải|explanation|solution)\s*\)?\s*[:：].*)$/i;

const EMBEDDED_ANSWER_REGEX = /^(.*?)(?:^|\s)(đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i;

/**
 * Parse rich HTML into question objects. Content/options keep their inline
 * formatting (b, i, u, s, sub, sup, mark, code) and are sanitized.
 *
 * @param {string} html
 * @returns {Array<{num, content, type, options, correctAnswer, explanation?}>}
 */
export function parseQuestionsFromHtml(html) {
    if (!html?.trim()) return [];

    // 1. Lines of {html, plain}; split embedded "… Đáp án: A" into two lines and
    //    "Đáp án: A. Giải thích: …" into answer line + explanation line.
    const lines = [];
    const pushLine = (lineHtml, plain) => {
        const m = plain.match(EMBEDDED_ANSWER_REGEX);
        if (m) {
            const cleanAfter = m[3].trim().replace(/[.\s]+$/, '');
            const isStandardAns = /^[A-Za-z](?:\s*[,/]\s*[A-Za-z])*(?:\s*(?:đúng|sai))?\s*$/i.test(cleanAfter);
            if (isStandardAns || parseMultiTrueFalseAnswer(cleanAfter) !== null) {
                if (m[1].trim()) {
                    const head = splitHtmlAt(lineHtml, m[1].length)[0];
                    lines.push({ html: head, plain: linePlain(head) });
                }
                const ansText = `${m[2]}: ${cleanAfter}`;
                lines.push({ html: escapeHtml(ansText), plain: ansText });
                return;
            }
        }
        lines.push({ html: lineHtml, plain });
    };
    for (const rawHtml of splitIntoLines(html)) {
        let lineHtml = rawHtml;
        let plain = linePlain(rawHtml);
        let tail = null;
        const ex = !EXPLANATION_LABEL.test(plain.trim()) && plain.match(EXPLANATION_INLINE);
        if (ex && ex[1].trim()) {
            const headPlain = ex[1].replace(/[\s.;,–-]+$/, '');
            if (parseAnswerLine(headPlain) !== -1 || EMBEDDED_ANSWER_REGEX.test(headPlain)) {
                const [head, rest] = splitHtmlAt(lineHtml, plain.length - ex[2].length);
                tail = { html: rest, plain: linePlain(rest) };
                lineHtml = head;
                plain = linePlain(head);
            }
        }
        pushLine(lineHtml, plain);
        if (tail) lines.push(tail);
    }

    // 2. Answer-key table at the end of the document (Format C)
    const { keyMap: answerKeyTable, tableStartIndex } = extractAnswerKeyTable(normalizeMathNotations(lines.map((l) => l.plain).join('\n')));
    if (tableStartIndex !== -1) {
        let len = 0;
        let cut = lines.length;
        for (let i = 0; i < lines.length; i++) {
            if (len >= tableStartIndex) { cut = i; break; }
            len += normalizeMathNotations(lines[i].plain).length + 1;
        }
        lines.splice(cut);
    }

    // 2b. Auto-detect source code in lines the file gave no hint for (TXT, pasted text,
    //     Word in a normal font). Question / option / answer lines are never code.
    const hasBlockCode = (h) => /<code class="rt-block"/.test(h);
    const codeFlags = detectCodeLines(
        lines.map((l) => l.plain),
        (i) => {
            const p = lines[i].plain;
            return !!parseQuestionStart(p) || !!parseOptionLine(p) || parseAnswerLine(p) !== -1 || IS_ONLY_KEYS_REGEX.test(p);
        },
        (i) => hasBlockCode(lines[i].html),
    );
    lines.forEach((l, i) => {
        if (codeFlags[i] && !hasBlockCode(l.html)) l.html = `<code class="rt-block">${l.html}</code>`;
    });

    // 3. Build blocks
    const blocks = [];
    let cur = null;
    let lastOptionIndex = -1;
    let afterAnswer = false;
    let inExplanation = false; // after "Giải thích:" every following line belongs to the explanation

    const cutMarker = (line, consumedChars) => {
        const lead = line.plain.length - line.plain.replace(/^[\s\uFEFF]+/, '').length;
        return splitHtmlAt(line.html, lead + consumedChars)[1];
    };

    for (const line of lines) {
        const plain = line.plain;
        const trimmed = plain.replace(/^[\s\uFEFF]+/, '');
        const lead = plain.length - trimmed.length;

        let qStart = parseQuestionStart(plain);
        if (qStart && inExplanation && cur && !/^\s*(câu|question|q\.?)\s*\d/i.test(trimmed) && qStart.num !== cur.num + 1) qStart = null;
        if (qStart) {
            if (cur) blocks.push(cur);
            // content text is a suffix of the trimmed line
            const clean = trimmed.trimEnd();
            const rawTail = clean.slice(clean.length - qStart.content.length);
            const consumed = rawTail === qStart.content ? clean.length - qStart.content.length : 0;
            cur = {
                num: qStart.num,
                content: cutMarker(line, consumed),
                options: [],
                correctAnswer: -1,
                _marked: [],
                explanation: '',
            };
            lastOptionIndex = -1;
            afterAnswer = false;
            inExplanation = false;
            continue;
        }
        if (!cur) continue;

        const label = trimmed.match(EXPLANATION_LABEL);
        if (label) {
            const body = cutMarker(line, label[0].length);
            if (linePlain(body).trim() || /\[IMG:/.test(body)) cur.explanation += (cur.explanation ? '<br>' : '') + body;
            inExplanation = true;
            lastOptionIndex = -1;
            continue;
        }

        const optLine = parseOptionLine(plain);
        if (optLine && inExplanation && cur.options[optLine.index] !== undefined) {
            // "A. sai vì …" inside a solution → explanation text, not a new option
            cur.explanation += (cur.explanation ? '<br>' : '') + line.html;
            continue;
        }
        if (optLine) {
            const clean = trimmed.trimEnd();
            const consumed = clean.length - optLine.text.length;
            let optHtml = cutMarker(line, consumed);
            // a one-line option that is clearly code (e.g. "A. x += 1;") → inline code
            if (!/<code\b/.test(optHtml) && looksLikeCode(optLine.text)) optHtml = `<code>${optHtml}</code>`;
            cur.options[optLine.index] = optHtml;
            if (isMarkedOption(line.html, lead, consumed)) cur._marked.push(optLine.index);
            lastOptionIndex = optLine.index;
            afterAnswer = false;
            continue;
        }

        const inlineAns = parseAnswerLine(plain);
        if (inlineAns !== -1) {
            cur.correctAnswer = inlineAns;
            lastOptionIndex = -1;
            afterAnswer = true;
            continue;
        }

        if (IS_ONLY_KEYS_REGEX.test(plain)) continue;

        if (inExplanation) {
            cur.explanation += (cur.explanation ? '<br>' : '') + line.html;
        } else if (lastOptionIndex >= 0 && cur.options[lastOptionIndex] !== undefined) {
            cur.options[lastOptionIndex] += '<br>' + line.html;
        } else if (cur.options.length === 0) {
            cur.content += '<br>' + line.html;
        } else if (afterAnswer) {
            cur.explanation += (cur.explanation ? '<br>' : '') + line.html;
        }
    }
    if (cur) blocks.push(cur);

    // 4. Resolve Format A (marked options) when no explicit answer was given
    for (const block of blocks) {
        const optionCount = block.options.filter(Boolean).length;
        const marked = block._marked;
        // every option marked ⇒ the whole document is bold, not an answer key
        if (marked.length > 0 && !(optionCount > 1 && marked.length >= optionCount) && block.correctAnswer === -1) {
            block.correctAnswer = marked.length === 1 ? marked[0] : marked;
        }
        delete block._marked;
    }

    applyAnswerKeyTable(blocks, answerKeyTable);

    return blocks
        .filter((b) => linePlain(b.content).trim() !== '' || /\[IMG:/.test(b.content))
        .map((b) => finalizeRichBlock(b));
}

/** normalizeMathNotations, but never touch embedded [IMG: data:…] payloads. */
function normalizeKeepingImages(text) {
    return text.split(/(\[IMG:[^\]]*\])/g).map((p, i) => (i % 2 ? p : normalizeMathNotations(p))).join('');
}

function finalizeRichBlock(block) {
    const plainOf = (h) => linePlain(String(h ?? '').replace(/<br\s*\/?>/gi, ' '));
    const shadow = {
        ...block,
        content: plainOf(block.content),
        options: block.options.map((o) => (o === undefined ? undefined : plainOf(o))),
    };
    const base = finalizeBlock(shadow); // type, correctAnswer, option trimming
    const toMath = (h) => sanitizeRichHtml(mapTextOutsideCode(
        String(h ?? ''),
        normalizeKeepingImages,
    ));
    const content = sanitizeRichHtml(
        removeTypeTag(mapTextOutsideCode(block.content, normalizeKeepingImages)),
    );
    const out = {
        num: base.num,
        type: base.type,
        correctAnswer: base.correctAnswer,
        content,
        options: base.options.map((_, i) => toMath(block.options[i])),
    };
    const explanation = normalizeExplanation(toMath(block.explanation));
    if (explanation) out.explanation = explanation;
    return out;
}
