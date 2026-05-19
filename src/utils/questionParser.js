/**
 * Dolphin – Advanced Question Parser v3
 * Supports: Plain text, HTML (from mammoth .docx), and raw text (from PDF)
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

import { normalizeUnicodeToLatex, normalizeWordMangledMath } from './mathText';

const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PDF_PAGES = 1000;

function normalizeXmlNamespaceName(name) {
    return String(name || '').replace(/^.*:/, '').toLowerCase();
}

function normalizeMathText(text) {
    if (!text) return text;
    let normalized = normalizeWordMangledMath(text);
    normalized = normalized.replace(/\\(neg|land|lor|forall|exists|nexists|in|notin|subseteq|supseteq|subset|supset|cap|cup|leq|geq|neq|approx|equiv|cong|sim|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|times|div|cdot|pm|mp|partial|nabla|infty|sum|int|sqrt)(?=[A-Za-zÀ-ỹ0-9])/g, '\\$1 ');
    normalized = normalizeUnicodeToLatex(normalized);
    return normalized
        .replace(/[\u00A0\u200B\u200C\u200D]/g, ' ')
        .replace(/\s*([:→←↔⇒⇐⇔=≠≤≥<>])/g, '$1')
        .replace(/\s*([,;])\s*/g, '$1 ')
        .replace(/\s*([()+\-*/])\s*/g, '$1')
        .replace(/\s+([\]}])/g, '$1')
        .replace(/([\[{(])\s+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

export function findXmlNodeByLocalName(root, localName) {
    if (!root || !localName) return null;
    const wanted = String(localName).toLowerCase();
    const queue = [root];

    while (queue.length) {
        const node = queue.shift();
        if (!node) continue;

        const nodeLocalName = normalizeXmlNamespaceName(node.localName || node.nodeName || node.tagName);
        if (nodeLocalName === wanted) return node;

        const children = node.children || node.childNodes || [];
        for (const child of children) {
            if (child && typeof child === 'object') queue.push(child);
        }
    }

    return null;
}

export function getXmlElementsByLocalName(root, localName) {
    if (!root || !localName) return [];
    const wanted = String(localName).toLowerCase();
    const result = [];
    const queue = [root];

    while (queue.length) {
        const node = queue.shift();
        if (!node) continue;

        const nodeLocalName = normalizeXmlNamespaceName(node.localName || node.nodeName || node.tagName);
        if (nodeLocalName === wanted) result.push(node);

        const children = node.children || node.childNodes || [];
        for (const child of children) {
            if (child && typeof child === 'object') queue.push(child);
        }
    }

    return result;
}

function isPdfTextItem(item) {
    return item && typeof item.str === 'string' && Array.isArray(item.transform) && item.transform.length >= 6;
}

export function groupPdfTextItemsByLine(items, yTolerance = 2) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const lines = [];
    const sorted = items.filter(isPdfTextItem).map((item) => ({
        ...item,
        _y: Number(item.transform[5]) || 0,
    })).sort((a, b) => b._y - a._y || ((a.transform?.[4] || 0) - (b.transform?.[4] || 0)));

    for (const item of sorted) {
        const lastLine = lines[lines.length - 1];
        if (lastLine && Math.abs(lastLine.y - item._y) <= yTolerance) {
            lastLine.items.push(item);
            continue;
        }
        lines.push({ y: item._y, items: [item] });
    }

    return lines.map((line) => ({
        y: line.y,
        text: line.items
            .slice()
            .sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0))
            .map((item) => item.str)
            .join('')
            .trim(),
    })).filter((line) => line.text);
}

export function extractPdfTextFromItems(items, yTolerance = 2) {
    return groupPdfTextItemsByLine(items, yTolerance).map((line) => line.text).join('\n');
}

export async function extractTextFromPdfDocument(pdfDocument, options = {}) {
    const { maxPages = DEFAULT_MAX_PDF_PAGES, yTolerance = 2 } = options;
    if (!pdfDocument || typeof pdfDocument.numPages !== 'number') return '';

    const totalPages = Math.min(pdfDocument.numPages, maxPages);
    const pageTexts = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        let page = null;
        try {
            page = await pdfDocument.getPage(pageNumber);
            const textContent = await page.getTextContent();
            pageTexts.push(extractPdfTextFromItems(textContent.items, yTolerance));
        } catch (error) {
            console.error(`PDF page ${pageNumber} parse failed:`, error);
        } finally {
            if (page?.cleanup) {
                try {
                    page.cleanup();
                } catch (cleanupError) {
                    console.warn(`PDF page ${pageNumber} cleanup failed:`, cleanupError);
                }
            }
            page = null;
        }
    }

    return pageTexts.join('\n\n');
}

export function assertFileSizeWithinLimit(file, maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES) {
    const size = typeof file === 'number' ? file : file?.size;
    if (typeof size === 'number' && size > maxBytes) {
        throw new Error(`File too large. Maximum allowed size is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
    }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a letter (case-insensitive) to 0-based index (a=0 … z=25), or -1 */
function letterToIndex(letter) {
    if (!letter) return -1;
    const ch = letter.trim().toLowerCase().charCodeAt(0);
    return ch >= 97 && ch <= 122 ? ch - 97 : -1;
}

/** Strip all HTML tags and decode common entities; collapse internal whitespace */
function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;|&#160;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[\u00A0\u200B\u200C\u200D]/g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n[ \t\f\v]+/g, '\n')
        .replace(/[ \t\f\v]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Return true if the HTML fragment contains a <strong>, <u>, or <b> tag
 * wrapping at least one non-whitespace character.
 * v3: Added \s* guards so an empty <strong> </strong> doesn't trigger a hit.
 */
function hasFormattingMark(html) {
    return /<(?:strong|u|b)\b[^>]*>\s*[^<\s][^<]*<\/(?:strong|u|b)>/i.test(html);
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

    // Try to isolate a dedicated section that starts with a header keyword
    const sectionMatch = text.match(
        /(?:đáp\s*án|answer\s*key|bảng\s*đáp\s*án)\s*[:\.\n]([\s\S]*)/i
    );
    const scanText = sectionMatch ? sectionMatch[1] : text;

    // v3: separator list is explicit (-, –, ., :) — bare space removed to cut noise
    const regex = /(?:câu\s*)?(\d+)\s*[-–.:]\s*([A-Za-z](?:\s*[,/]\s*[A-Za-z])*)\b/g;
    let m;
    while ((m = regex.exec(scanText)) !== null) {
        const qNum = parseInt(m[1], 10);
        const letters = m[2].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
        if (qNum > 0 && letters.length > 0) {
            const indices = letters.map(letterToIndex).filter(i => i >= 0);
            if (indices.length === 1) keyMap.set(qNum, indices[0]);
            else if (indices.length > 1) keyMap.set(qNum, indices);
        }
    }

    // If we didn't find a dedicated section, enforce the minimum-cluster threshold
    if (!sectionMatch && keyMap.size < MIN_KEY_ENTRIES) {
        keyMap.clear();
    }

    return keyMap;
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
    const pairRegex = /([a-zA-Z])\s*[-.:)]\s*([đđĐDsS][úuúnnggai]*|[tTfF][rRuUeEaAlLsSeE]*)\b/gi;
    
    const matches = [...clean.matchAll(pairRegex)];
    if (matches.length === 0) return null;
    
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
    /^(?:đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*([A-Za-z](?:\s*[,/]\s*[A-Za-z])*)\s*[.]?\s*$/i;

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

/** Named prefix: "Câu 1.", "Câu 1:", "Question 2)", "Q3." */
const QUESTION_NAMED_REGEX = /^(?:câu|question|q\.?)\s*(\d+)\s*[.:)]\s*(.*)/i;

/**
 * Bare number: "1. text", "2) text"
 * v3 fix: v2 also accepted `:` here which caused "1: A" answer-key lines to be
 * misread as question starts. Removed `:` from the delimiter class.
 */
const QUESTION_NUM_ONLY = /^(\d+)[.)]\s+(.*)/;

function parseQuestionStart(line) {
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

    const lines = text
        .split(/\r?\n/)
        .map(l => l.replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/[ \t\f\v]+/g, ' ').trim())
        .filter(Boolean);
    const answerKeyTable = extractAnswerKeyTable(text);

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
        if (lastOptionIndex >= 0 && cur.options[lastOptionIndex] !== undefined) {
            // Append to the most recently parsed option
            cur.options[lastOptionIndex] += '\n' + line;
        } else if (cur.options.length === 0) {
            // No options collected yet → still building the question stem
            cur.content += '\n' + line;
        }
    };

    for (const line of lines) {
        const embeddedMatch = line.match(/^(.*?)\s*\b(đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i);
        if (embeddedMatch) {
            const before = embeddedMatch[1].trim();
            const keyword = embeddedMatch[2];
            const after = embeddedMatch[3].trim();
            
            const cleanAfter = after.replace(/[.\s]+$/, '');
            const isStandardAns = /^[A-Za-z](?:\s*[,/]\s*[A-Za-z])*\s*$/i.test(cleanAfter);
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
        .map((block) => {
            block.content = normalizeMathText(block.content);
            block.options = block.options.map((option) => normalizeMathText(option));
            return finalizeBlock(block);
        });
}

// ─────────────────────────────────────────────
// HTML parser (mammoth .docx output)
// ─────────────────────────────────────────────

/**
 * Parse HTML (from mammoth .docx conversion) into question objects.
 *
 * v3: Format A now accumulates ALL bold/underlined options in `_boldAnswers`.
 *     After the block is complete the array is resolved to a single index (single)
 *     or an array of indices (multi-select) before being assigned to correctAnswer.
 *     v2 overwrote correctAnswer on every hit, keeping only the last one.
 *
 * @param {string} html
 * @returns {Array<{num, content, type, options, correctAnswer}>}
 */
export function parseQuestionsFromHtml(html) {
    if (!html?.trim()) return [];

    const normalized = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<\/?p[^>]*>/gi, '\n')
        .replace(/<span[^>]*>/gi, '')
        .replace(/<\/span>/gi, '');

    const htmlLines = normalized
        .split(/\r?\n/)
        .map(l => l.replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').replace(/[ \t\f\v]+/g, ' ').trim())
        .filter(l => l !== '' && l !== '&nbsp;');

    const rawTextLines = htmlLines.map(stripHtml);
    
    // Split embedded answer lines first, maintaining strict parallel arrays for text and html lines
    const textLines = [];
    const processedHtmlLines = [];
    for (let i = 0; i < rawTextLines.length; i++) {
        const line = rawTextLines[i];
        const rawHtml = htmlLines[i];
        
        const embeddedMatch = line.match(/^(.*?)\s*\b(đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i);
        if (embeddedMatch) {
            const before = embeddedMatch[1].trim();
            const keyword = embeddedMatch[2];
            const after = embeddedMatch[3].trim();
            
            const cleanAfter = after.replace(/[.\s]+$/, '');
            const isStandardAns = /^[A-Za-z](?:\s*[,/]\s*[A-Za-z])*\s*$/i.test(cleanAfter);
            const isMultiTFAns = parseMultiTrueFalseAnswer(cleanAfter) !== null;
            
            if (isStandardAns || isMultiTFAns) {
                if (before) {
                    textLines.push(before);
                    processedHtmlLines.push(rawHtml);
                }
                textLines.push(`${keyword}: ${cleanAfter}`);
                processedHtmlLines.push(`<p>${keyword}: ${cleanAfter}</p>`);
                continue;
            }
        }
        textLines.push(line);
        processedHtmlLines.push(rawHtml);
    }
    
    const plainText = textLines.join('\n');
    const answerKeyTable = extractAnswerKeyTable(plainText);

    const blocks = [];
    let cur = null;
    let lastOptionIndex = -1;

    for (let i = 0; i < textLines.length; i++) {
        const line = textLines[i];
        const rawHtml = processedHtmlLines[i];

        // ── New question? ──────────────────────────────────────────────────────
        const qStart = parseQuestionStart(line);
        if (qStart) {
            if (cur) blocks.push(cur);
            cur = {
                num: qStart.num,
                content: qStart.content,
                options: [],
                optionsHtml: [],
                correctAnswer: -1,
                _boldAnswers: [], // v3: accumulate ALL Format-A hits
            };
            lastOptionIndex = -1;
            continue;
        }

        if (!cur) continue;

        // ── MCQ option? ────────────────────────────────────────────────────────
        const optLine = parseOptionLine(line);
        if (optLine) {
            cur.options[optLine.index] = optLine.text;
            cur.optionsHtml[optLine.index] = rawHtml;
            lastOptionIndex = optLine.index;

            // Format A: collect this option if it carries a formatting mark
            if (hasFormattingMark(rawHtml)) {
                cur._boldAnswers.push(optLine.index);
            }
            continue;
        }

        // ── Inline answer (Format B)? ──────────────────────────────────────────
        const inlineAns = parseAnswerLine(line);
        if (inlineAns !== -1) {
            cur.correctAnswer = inlineAns;
            lastOptionIndex = -1;
            continue;
        }

        // ── Continuation line ──────────────────────────────────────────────────
        if (lastOptionIndex >= 0 && cur.options[lastOptionIndex] !== undefined) {
            cur.options[lastOptionIndex] += '\n' + line;
            cur.optionsHtml[lastOptionIndex] += '<br/>' + rawHtml;
        } else if (cur.options.length === 0) {
            cur.content += '\n' + line;
        }
    }

    if (cur) blocks.push(cur);

    // Resolve Format-A bold answers; only apply when Format B hasn't fired
    for (const block of blocks) {
        if (block._boldAnswers.length > 0 && block.correctAnswer === -1) {
            const unique = [...new Set(block._boldAnswers)].sort((a, b) => a - b);
            block.correctAnswer = unique.length === 1 ? unique[0] : unique;
        }
        delete block._boldAnswers;
        delete block.optionsHtml;
    }

    applyAnswerKeyTable(blocks, answerKeyTable);

    return blocks
        .filter(b => b.content.trim() !== '')
        .map(finalizeBlock);
}