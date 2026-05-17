/**
 * Dolphin – Advanced Question Parser v2
 * Supports: Plain text, HTML (from mammoth .docx), and raw text (from PDF)
 *
 * Question Types:
 *   "single"     – Standard 4-option MCQ, single correct answer
 *   "multiple"   – Multi-select (Đáp án: A, B, C  or  [Loại: Chọn nhiều])
 *   "true_false" – Only Đúng/Sai options  or  [Loại: Đúng/Sai]
 *   "essay"      – No A-D options found, or [Loại: Tự luận]
 *
 * Detects correct answers via 3 methods:
 *   Format A: Bold/Underline formatting on options (<strong>, <u>)
 *   Format B: Inline answer lines (Đáp án:, Key:, Chọn:)
 *   Format C: Answer key table at end of document (1-A, 2-C, 3-B ...)
 */

import { normalizeUnicodeToLatex } from '../components/MathText';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const LETTER_TO_INDEX = { a: 0, b: 1, c: 2, d: 3 };

/** Map a single letter (case-insensitive) to 0-3 index, or -1 */
function letterToIndex(letter) {
    if (!letter) return -1;
    return LETTER_TO_INDEX[letter.trim().toLowerCase()] ?? -1;
}

/** Strip all HTML tags and decode basic entities */
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
        .trim();
}

/** Check if an HTML fragment contains <strong> or <u> wrapping meaningful content */
function hasFormattingMark(html) {
    return /<strong\b[^>]*>[^<]+<\/strong>/i.test(html) ||
           /<u\b[^>]*>[^<]+<\/u>/i.test(html) ||
           /<b\b[^>]*>[^<]+<\/b>/i.test(html);
}

// ─────────────────────────────────────────────
// Type tag inline detection
// ─────────────────────────────────────────────

const TYPE_TAG_REGEX = /\[Loại\s*:\s*(Chọn\s*nhiều|Đúng\s*\/\s*Sai|Tự\s*luận)\]/i;

/** Extract explicit type tag from content, returns null if none */
function extractTypeTag(text) {
    const m = text.match(TYPE_TAG_REGEX);
    if (!m) return null;
    const v = m[1].toLowerCase().replace(/\s+/g, '');
    if (v.includes('chọnnhiều') || v.includes('chonnhieu')) return 'multiple';
    if (v.includes('đúng/sai') || v.includes('dung/sai')) return 'true_false';
    if (v.includes('tựluận') || v.includes('tuan')) return 'essay';
    return null;
}

/** Remove type tag from content string */
function removeTypeTag(text) {
    return text.replace(TYPE_TAG_REGEX, '').trim();
}

// ─────────────────────────────────────────────
// Format C: Answer Key Table scanner
// ─────────────────────────────────────────────

/**
 * Scan the entire text for answer key patterns like:
 *   "1-A", "1.A", "1: A", "1 - A", "Câu 1: A", etc.
 *   Also detects multi-answer: "1-A,B" or "1: A, B, C"
 * Returns a Map<number, number|number[]> mapping question number → correctAnswer
 */
function extractAnswerKeyTable(text) {
    const keyMap = new Map();
    // Match: 1-A,B or 1: A or Câu 1: A,B,C
    const regex = /(?:câu\s*)?(\d+)\s*[.\-:\s]\s*([A-Da-d](?:\s*[,/]\s*[A-Da-d])*)\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const letters = match[2].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
        if (qNum > 0 && letters.length > 0) {
            const indices = letters.map(l => letterToIndex(l)).filter(i => i >= 0);
            if (indices.length === 1) {
                keyMap.set(qNum, indices[0]);
            } else if (indices.length > 1) {
                keyMap.set(qNum, indices); // multi-answer → array
            }
        }
    }
    return keyMap;
}

// ─────────────────────────────────────────────
// Option line regex – handles A. / A) / A: / A,
// ─────────────────────────────────────────────

const OPTION_REGEX = /^([A-Da-d])\s*[.):\s]\s*(.*)/;

/**
 * Identify which option letter a line starts with.
 * Returns { letter: 'A', text: '...', index: 0 } or null
 */
function parseOptionLine(line) {
    const clean = line.trim();
    const m = clean.match(OPTION_REGEX);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const text = m[2].trim();
    const index = letterToIndex(letter);
    return { letter, text, index };
}

// ─────────────────────────────────────────────
// Inline answer line detection (Format B)
// Supports multi-answer: "Đáp án: A, B, C"
// ─────────────────────────────────────────────

const ANSWER_LINE_REGEX = /^(?:đáp\s*án|key|chọn|answer)\s*[:.]?\s*([A-Da-d](?:\s*[,/]\s*[A-Da-d])*)\b/i;

/**
 * Parse inline answer line.
 * Returns a single index (number) or array of indices, or -1 if not found.
 */
function parseAnswerLine(line) {
    const m = line.trim().match(ANSWER_LINE_REGEX);
    if (!m) return -1;
    const letters = m[1].split(/[\s,/]+/).map(l => l.trim()).filter(Boolean);
    const indices = letters.map(l => letterToIndex(l)).filter(i => i >= 0);
    if (indices.length === 0) return -1;
    if (indices.length === 1) return indices[0];
    return indices; // multi
}

// ─────────────────────────────────────────────
// Question block regex
// ─────────────────────────────────────────────

const QUESTION_START_REGEX = /^(?:câu|question|q)\s*(\d+)\s*[.:)]\s*(.*)/i;
const QUESTION_NUM_ONLY = /^(\d+)\s*[.:)]\s*(.*)/;

function parseQuestionStart(line) {
    const clean = line.trim().replace(/^[^\w\s]+/, '');
    let m = clean.match(QUESTION_START_REGEX);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    m = clean.match(QUESTION_NUM_ONLY);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    return null;
}

// ─────────────────────────────────────────────
// True/False option detector
// ─────────────────────────────────────────────

const TRUE_FALSE_TEXTS = ['đúng', 'sai', 'true', 'false', 'đ', 's'];

function isTrueFalseOptions(options) {
    const nonEmpty = options.filter(o => o && o.trim() !== '');
    if (nonEmpty.length < 2) return false;
    return nonEmpty.every(o => TRUE_FALSE_TEXTS.includes(o.trim().toLowerCase()));
}

// ─────────────────────────────────────────────
// Determine type for a parsed block
// ─────────────────────────────────────────────

function determineType(block) {
    // 1. Explicit tag in content
    const tag = extractTypeTag(block.content + ' ' + block.options.join(' '));
    if (tag) return tag;

    // 2. Essay: no options found
    const hasOptions = block.options.some(o => o && o.trim() !== '');
    if (!hasOptions) return 'essay';

    // 3. True/False by option text
    if (isTrueFalseOptions(block.options)) return 'true_false';

    // 4. Multiple choice: correctAnswer is an array
    if (Array.isArray(block.correctAnswer)) return 'multiple';

    // 5. Default: single
    return 'single';
}

// ─────────────────────────────────────────────
// Finalize block: assign type, clean content, default correctAnswer
// ─────────────────────────────────────────────

function finalizeBlock(block) {
    const type = determineType(block);

    // Clean type tag from content
    let content = removeTypeTag(block.content.trim());

    // Default correctAnswer by type
    let correctAnswer = block.correctAnswer;
    if (type === 'essay') {
        correctAnswer = ''; // essays have no preset answer
    } else if (type === 'multiple') {
        if (!Array.isArray(correctAnswer)) {
            correctAnswer = correctAnswer >= 0 ? [correctAnswer] : [0];
        }
    } else {
        // single / true_false
        if (Array.isArray(correctAnswer)) correctAnswer = correctAnswer[0] ?? 0;
        if (correctAnswer < 0) correctAnswer = 0;
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
// Main parser: works on plain text lines
// ─────────────────────────────────────────────

/**
 * Parse plain text (no HTML) into question objects.
 * @param {string} text - raw text content
 * @returns {Array<{content, type, options, correctAnswer}>}
 */
export function parseQuestionsFromText(text) {
    if (!text || !text.trim()) return [];

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

    // Pre-scan for answer key table (Format C)
    const answerKeyTable = extractAnswerKeyTable(text);

    const questionBlocks = [];
    let currentBlock = null;

    for (const line of lines) {
        const qStart = parseQuestionStart(line);
        if (qStart) {
            if (currentBlock) questionBlocks.push(currentBlock);
            currentBlock = {
                num: qStart.num,
                content: qStart.content,
                options: ['', '', '', ''],
                correctAnswer: -1
            };
            continue;
        }

        if (!currentBlock) continue;

        const optLine = parseOptionLine(line);
        if (optLine) {
            currentBlock.options[optLine.index] = optLine.text;
            continue;
        }

        // Format B: inline answer (may be multi)
        const inlineAnswer = parseAnswerLine(line);
        if (inlineAnswer !== -1) {
            currentBlock.correctAnswer = inlineAnswer;
            continue;
        }

        // Append to question content if no options collected yet
        if (currentBlock.options.every(o => o === '')) {
            currentBlock.content += ' ' + line;
        }
    }

    if (currentBlock) questionBlocks.push(currentBlock);

    // Apply answer key table (Format C) as fallback
    for (const block of questionBlocks) {
        const isUnanswered = block.correctAnswer === -1 ||
            (Array.isArray(block.correctAnswer) && block.correctAnswer.length === 0);
        if (isUnanswered && answerKeyTable.has(block.num)) {
            block.correctAnswer = answerKeyTable.get(block.num);
        }
    }

    return questionBlocks
        .filter(b => b.content.trim() !== '')
        .map(finalizeBlock);
}

// ─────────────────────────────────────────────
// HTML parser: detects formatting marks (Format A)
// ─────────────────────────────────────────────

/**
 * Parse HTML content (from mammoth .docx conversion).
 * @param {string} html - HTML string from mammoth
 * @returns {Array<{content, type, options, correctAnswer}>}
 */
export function parseQuestionsFromHtml(html) {
    if (!html || !html.trim()) return [];

    const normalized = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<\/?p[^>]*>/gi, '\n')
        .replace(/<span[^>]*>/gi, '')
        .replace(/<\/span>/gi, '');

    const htmlLines = normalized.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l !== '' && !/^&nbsp;$/.test(l));
    const textLines = htmlLines.map(l => stripHtml(l));

    const plainText = textLines.join('\n');
    const answerKeyTable = extractAnswerKeyTable(plainText);

    const questionBlocks = [];
    let currentBlock = null;

    for (let i = 0; i < textLines.length; i++) {
        const line = textLines[i];
        const rawHtml = htmlLines[i];

        const qStart = parseQuestionStart(line);
        if (qStart) {
            if (currentBlock) questionBlocks.push(currentBlock);
            currentBlock = {
                num: qStart.num,
                content: qStart.content,
                options: ['', '', '', ''],
                optionsHtml: ['', '', '', ''],
                correctAnswer: -1
            };
            continue;
        }

        if (!currentBlock) continue;

        const optLine = parseOptionLine(line);
        if (optLine) {
            currentBlock.options[optLine.index] = optLine.text;
            currentBlock.optionsHtml[optLine.index] = rawHtml;

            // Format A: detect bold/underline on this option
            if (hasFormattingMark(rawHtml)) {
                currentBlock.correctAnswer = optLine.index;
            }
            continue;
        }

        // Format B: inline answer (may be multi)
        const inlineAnswer = parseAnswerLine(line);
        if (inlineAnswer !== -1) {
            currentBlock.correctAnswer = inlineAnswer;
            continue;
        }

        if (currentBlock.options.every(o => o === '')) {
            currentBlock.content += ' ' + line;
        }
    }

    if (currentBlock) questionBlocks.push(currentBlock);

    // Apply Format C as last-resort fallback
    for (const block of questionBlocks) {
        const isUnanswered = block.correctAnswer === -1 ||
            (Array.isArray(block.correctAnswer) && block.correctAnswer.length === 0);
        if (isUnanswered && answerKeyTable.has(block.num)) {
            block.correctAnswer = answerKeyTable.get(block.num);
        }
        delete block.optionsHtml;
    }

    return questionBlocks
        .filter(b => b.content.trim() !== '')
        .map(finalizeBlock);
}
