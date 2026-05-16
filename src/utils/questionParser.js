/**
 * Dolphin – Advanced Question Parser
 * Supports: Plain text, HTML (from mammoth .docx), and raw text (from PDF)
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
// Format C: Answer Key Table scanner
// ─────────────────────────────────────────────

/**
 * Scan the entire text for answer key patterns like:
 *   "1-A", "1.A", "1: A", "1 - A", "Câu 1: A", etc.
 * Returns a Map<number, number> mapping question number → correctAnswer index
 */
function extractAnswerKeyTable(text) {
    const keyMap = new Map();
    // Match patterns: 1-A, 1.A, 1: A, 1 A, Câu 1: A (with optional spaces/dashes)
    const regex = /(?:câu\s*)?(\d+)\s*[.\-:\s]\s*([A-Da-d])\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const idx = letterToIndex(match[2]);
        if (idx >= 0 && qNum > 0) {
            keyMap.set(qNum, idx);
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
// Question block regex – handles various numbering styles
// ─────────────────────────────────────────────

// Matches: "Câu 1:", "Câu 1.", "1.", "1:", "1)", "Question 1:" etc.
const QUESTION_START_REGEX = /^(?:câu|question|q)\s*(\d+)\s*[.:)]\s*(.*)/i;
const QUESTION_NUM_ONLY = /^(\d+)\s*[.:)]\s*(.*)/;

function parseQuestionStart(line) {
    const clean = line.trim().replace(/^[^\w\s]+/, ''); // Strip leading special chars like 〚
    let m = clean.match(QUESTION_START_REGEX);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    m = clean.match(QUESTION_NUM_ONLY);
    if (m) return { num: parseInt(m[1], 10), content: m[2].trim() };
    return null;
}

// ─────────────────────────────────────────────
// Inline answer line detection (Format B)
// ─────────────────────────────────────────────

const ANSWER_LINE_REGEX = /^(?:đáp\s*án|key|chọn|answer)\s*[:.]?\s*([A-Da-d])\b/i;

function parseAnswerLine(line) {
    const m = line.trim().match(ANSWER_LINE_REGEX);
    if (!m) return -1;
    return letterToIndex(m[1]);
}

// ─────────────────────────────────────────────
// Main parser: works on plain text lines
// ─────────────────────────────────────────────

/**
 * Parse plain text (no HTML) into question objects.
 * @param {string} text - raw text content
 * @returns {Array<{content: string, options: string[], correctAnswer: number}>}
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

        // Check for inline answer (Format B)
        const inlineAnswer = parseAnswerLine(line);
        if (inlineAnswer >= 0) {
            currentBlock.correctAnswer = inlineAnswer;
            continue;
        }

        // Append to question content if we haven't started collecting options yet
        if (currentBlock.options.every(o => o === '')) {
            currentBlock.content += ' ' + line;
        }
    }

    if (currentBlock) questionBlocks.push(currentBlock);

    // Apply answer key table (Format C) as fallback
    for (const block of questionBlocks) {
        if (block.correctAnswer < 0 && answerKeyTable.has(block.num)) {
            block.correctAnswer = answerKeyTable.get(block.num);
        }
        // Default to 0 if nothing was found
        if (block.correctAnswer < 0) block.correctAnswer = 0;
    }

    return questionBlocks
        .filter(b => b.content.trim() !== '')
        .map(b => ({
            ...b,
            content: normalizeUnicodeToLatex(b.content.trim()),
            options: b.options.map(o => normalizeUnicodeToLatex(o)),
        }));
}

// ─────────────────────────────────────────────
// HTML parser: detects formatting marks (Format A)
// ─────────────────────────────────────────────

/**
 * Parse HTML content (from mammoth .docx conversion).
 * Detects <strong>/<u> on option lines to determine correct answer.
 * @param {string} html - HTML string from mammoth
 * @returns {Array<{content: string, options: string[], correctAnswer: number}>}
 */
export function parseQuestionsFromHtml(html) {
    if (!html || !html.trim()) return [];

    // Normalize <br> to newlines, then split into lines keeping HTML tags
    const normalized = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<\/?p[^>]*>/gi, '\n')
        .replace(/<span[^>]*>/gi, '') // Word loves nested spans, strip them to simplify
        .replace(/<\/span>/gi, '');

    const htmlLines = normalized.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l !== '' && !/^&nbsp;$/.test(l));
    const textLines = htmlLines.map(l => stripHtml(l));

    // Pre-scan for answer key table (Format C) from plain text
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

        // Format B: inline answer
        const inlineAnswer = parseAnswerLine(line);
        if (inlineAnswer >= 0) {
            currentBlock.correctAnswer = inlineAnswer;
            continue;
        }

        // Append to question content
        if (currentBlock.options.every(o => o === '')) {
            currentBlock.content += ' ' + line;
        }
    }

    if (currentBlock) questionBlocks.push(currentBlock);

    // Apply Format C as last-resort fallback
    for (const block of questionBlocks) {
        if (block.correctAnswer < 0 && answerKeyTable.has(block.num)) {
            block.correctAnswer = answerKeyTable.get(block.num);
        }
        if (block.correctAnswer < 0) block.correctAnswer = 0;
        // Clean up internal tracking field
        delete block.optionsHtml;
    }

    return questionBlocks
        .filter(b => b.content.trim() !== '')
        .map(b => ({
            ...b,
            content: normalizeUnicodeToLatex(b.content.trim()),
            options: b.options.map(o => normalizeUnicodeToLatex(o)),
        }));
}
