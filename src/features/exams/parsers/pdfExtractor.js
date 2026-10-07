/**
 * Dolphin – PDF → rich HTML extractor (pdf.js text layer)
 * Groups text items into lines by baseline, keeps word spacing, and recovers
 * bold / italic / monospace from the embedded font names.
 */
import { escapeHtml } from '@/shared/utils/richText';

const BOLD = /bold|black|heavy|semibold|demi/i;
const ITALIC = /italic|oblique/i;
const MONO = /(consolas|courier|mono|menlo|monaco|lucida console|code)/i;

async function loadFontNames(page) {
    // Fonts are only registered in commonObjs after the operator list is processed.
    try { await page.getOperatorList(); } catch { /* best effort */ }
}

const fontStyle = (page, fontName) => {
    let name = '';
    try {
        if (page.commonObjs.has(fontName)) name = page.commonObjs.get(fontName)?.name || '';
    } catch { /* not loaded */ }
    return { b: BOLD.test(name), i: ITALIC.test(name), mono: MONO.test(name) };
};

const wrapItem = (text, st, withCode) => {
    let out = escapeHtml(text);
    if (!out.trim()) return out;
    if (st.i) out = `<i>${out}</i>`;
    if (st.b) out = `<b>${out}</b>`;
    if (withCode && st.mono) out = `<code>${out}</code>`;
    return out;
};

export async function extractPdfToHtml(pdf) {
    const paragraphs = [];

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        await loadFontNames(page);
        const content = await page.getTextContent();

        // 1. group items into visual lines by baseline
        const lines = [];
        let line = null;
        for (const item of content.items) {
            if (typeof item.str !== 'string') continue;
            const y = item.transform?.[5] ?? 0;
            const x = item.transform?.[4] ?? 0;
            const size = item.height || Math.abs(item.transform?.[3] || 10) || 10;
            if (!line || Math.abs(y - line.y) > size * 0.5) {
                line = { y, items: [] };
                lines.push(line);
            }
            line.items.push({ str: item.str, x, w: item.width || 0, size, st: fontStyle(page, item.fontName) });
            if (item.hasEOL) line = null;
        }

        // 2. build HTML per line
        for (const ln of lines) {
            const items = ln.items.filter((it) => it.str !== '');
            if (items.length === 0) continue;
            items.sort((a, b) => a.x - b.x);
            const allMono = items.every((it) => !it.str.trim() || it.st.mono);
            let html = '';
            let prevEnd = null;
            for (const it of items) {
                let text = it.str;
                if (prevEnd !== null && it.x - prevEnd > it.size * 0.15 && !/^\s/.test(text) && !/\s$/.test(html.replace(/<[^>]+>/g, ''))) {
                    text = ' ' + text;
                }
                html += wrapItem(text, it.st, !allMono);
                prevEnd = it.x + it.w;
            }
            if (!html.replace(/<[^>]+>/g, '').trim()) continue;
            paragraphs.push(allMono ? `<p><code class="rt-block">${html}</code></p>` : `<p>${html}</p>`);
        }
    }

    return paragraphs.join('\n');
}
