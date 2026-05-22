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

import { normalizeUnicodeToLatex } from '../components/MathText';

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
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
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
        const embeddedMatch = line.match(/^(.*?)\s*\b(đáp\s*án(?:\s*đúng)?|key|chọn|answer)\s*[:.]?\s*(.*)$/i);
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
        .map(l => l.trim())
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
            const isStandardAns = /^[A-Za-z](?:\s*[,/]\s*[A-Za-z])*(?:\s*(?:đúng|sai))?\s*$/i.test(cleanAfter);
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
    const { keyMap: answerKeyTable, tableStartIndex } = extractAnswerKeyTable(plainText);

    if (tableStartIndex !== -1) {
        let currentLength = 0;
        let truncateLineIdx = textLines.length;
        for (let i = 0; i < textLines.length; i++) {
            if (currentLength >= tableStartIndex) {
                truncateLineIdx = i;
                break;
            }
            currentLength += textLines[i].length + 1;
        }
        
        textLines.splice(truncateLineIdx);
        processedHtmlLines.splice(truncateLineIdx);
    }

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
        if (IS_ONLY_KEYS_REGEX.test(line)) {
            continue;
        }

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
            block.correctAnswer =
                block._boldAnswers.length === 1
                    ? block._boldAnswers[0]
                    : block._boldAnswers; // multi-select
        }
        delete block._boldAnswers;
        delete block.optionsHtml;
    }

    applyAnswerKeyTable(blocks, answerKeyTable);

    return blocks
        .filter(b => b.content.trim() !== '')
        .map(finalizeBlock);
}