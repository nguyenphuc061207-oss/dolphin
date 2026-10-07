/**
 * Dolphin – TXT → rich HTML extractor.
 * Decodes the bytes (UTF-8 / UTF-8 BOM / UTF-16 / legacy Vietnamese ANSI) and returns
 * one <p> per line so tabs, indentation and special characters (< > &) are preserved.
 */
import { escapeHtml } from '@/shared/utils/richText';

function decodeText(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        // Not valid UTF-8 → typical of old Notepad "ANSI" Vietnamese files
        return new TextDecoder('windows-1258').decode(bytes);
    }
}

/** Plain text (pasted or decoded) → one escaped <p> per line. */
export function plainTextToHtml(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('\n');
}

export function extractTxtToHtml(arrayBuffer) {
    const text = decodeText(arrayBuffer);
    if (!text.trim()) throw new Error('File TXT trống.');
    return plainTextToHtml(text);
}
