/**
 * Dolphin – rich text helpers.
 * Question content is stored as a restricted HTML subset (+ $LaTeX$ + [IMG: …]).
 * Legacy content is plain text; `isRichHtml` tells them apart.
 */

const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre', 'br', 'p', 'div', 'span']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title', 'meta', 'link']);
const ALLOWED_CLASSES = new Set(['rt-block']);

export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Decode one layer of text entities without interpreting angle brackets as tags. */
export function decodeTextEntities(text) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };
    return String(text ?? '').replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity, name) => {
        if (name[0] !== '#') return named[name.toLowerCase()];
        const hex = name[1].toLowerCase() === 'x';
        const point = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
        return point > 0 && point <= 0x10FFFF && !(point >= 0xD800 && point <= 0xDFFF) ? String.fromCodePoint(point) : entity;
    });
}

/** True when the string contains tags from our whitelist (i.e. it was produced by the rich pipeline). */
export function isRichHtml(str) {
    return typeof str === 'string' && (/<\/?(?:b|strong|i|em|u|s|sub|sup|mark|code|pre|br|p|div|span)\b[^>]*>/i.test(str)
        || /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/i.test(str));
}

/** Legacy plain text → rich HTML (escape + newline → <br>). */
export function plainToRichHtml(text) {
    return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

const cleanNode = (node, doc) => {
    const out = doc.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
            out.appendChild(doc.createTextNode(child.nodeValue));
        } else if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
            if (DROP_WITH_CONTENT.has(tag)) continue;
            if (!ALLOWED_TAGS.has(tag)) {
                out.appendChild(cleanNode(child, doc)); // unwrap unknown tags, keep text
                continue;
            }
            // Word pastes style bold/italic via inline styles on spans – recover them
            let el = doc.createElement(tag === 'strong' ? 'b' : tag === 'em' ? 'i' : tag === 'div' ? 'p' : tag);
            if (tag === 'span') {
                const style = (child.getAttribute('style') || '').toLowerCase();
                let inner = cleanNode(child, doc);
                const wrapWith = (name) => {
                    const w = doc.createElement(name);
                    w.appendChild(inner);
                    inner = doc.createDocumentFragment();
                    inner.appendChild(w);
                };
                if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) wrapWith('b');
                if (/font-style\s*:\s*italic/.test(style)) wrapWith('i');
                if (/text-decoration[^;]*underline/.test(style)) wrapWith('u');
                if (/text-decoration[^;]*line-through/.test(style)) wrapWith('s');
                if (/vertical-align\s*:\s*super/.test(style)) wrapWith('sup');
                if (/vertical-align\s*:\s*sub/.test(style)) wrapWith('sub');
                if (/font-family[^;]*(consolas|courier|monospace|menlo|monaco)/.test(style)) wrapWith('code');
                out.appendChild(inner);
                continue;
            }
            const cls = (child.getAttribute('class') || '').split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c));
            if (cls.length) el.setAttribute('class', cls.join(' '));
            el.appendChild(cleanNode(child, doc));
            out.appendChild(el);
        }
    }
    return out;
};

/** Whitelist sanitizer: keeps formatting tags, drops every attribute (except rt-* classes) and any script. */
export function sanitizeRichHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const holder = doc.createElement('div');
    holder.appendChild(cleanNode(doc.body, doc));
    return mergeCodeBlocks(holder.innerHTML);
}

/**
 * Consecutive code lines are stored as <code class="rt-block">a</code><br><code class="rt-block">b</code>.
 * Join them into a single block so code reads as one continuous listing (one box, real newlines).
 */
export function mergeCodeBlocks(html) {
    // Repair listings saved with short statements left outside the box (`f()` between two
    // blocks): up to 3 plain lines between two code blocks join them when they read as code.
    html = html.replace(/(<\/code>)((?:<br\s*\/?>[^<]*){1,3})<br\s*\/?>(?=<code class="rt-block">)/g, (gap, close, between, offset, whole) => {
        if (whole.lastIndexOf('<code class="rt-block">', offset) <= whole.lastIndexOf('<code>', offset)) return gap; // closes an inline <code>
        const lines = between.split(/<br\s*\/?>/).slice(1);
        if (!lines.every((l) => looksLikeCodeFragment(decodeTextEntities(l)))) return gap;
        return close + lines.map((l) => `<br><code class="rt-block">${l}</code>`).join('') + '<br>';
    });
    // Only join block code. An inline <code> immediately before a block stays inline.
    return html.replace(/<code class="rt-block">[\s\S]*?<\/code>(?:(?:<br\s*\/?>)?<code class="rt-block">[\s\S]*?<\/code>)+/g,
        (block) => block.replace(/<\/code>(?:<br\s*\/?>)?<code class="rt-block">/g, '\n'));
}

/**
 * A short ASCII statement with code punctuation and no prose: `f()`, `x += 1`, `}`, `a[i] = b;`.
 * Only meaningful for a line already sitting between code lines.
 */
export function looksLikeCodeFragment(line) {
    const t = String(line ?? '').replace(/\u00A0/g, ' ').trim();
    return t.length > 0 && t.length <= 120 && /^[\x20-\x7E\t]+$/.test(t) && /[()[\]{}=;]/.test(t)
        && !/[.?!]$/.test(t) && !/\$[^$]+\$/.test(t)
        && !/[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(t); // 4+ words = a sentence
}

/** Strip tags & decode entities. Used only for structure detection and previews – never for storage. */
export function htmlToPlain(html) {
    if (!html) return '';
    if (!/[<&]/.test(html)) return html;
    const doc = new DOMParser().parseFromString(`<body>${String(html).replace(/<br\s*\/?>/gi, '\n')}</body>`, 'text/html');
    return doc.body.textContent || '';
}

/** Optional explanations: formatting-only HTML and invisible whitespace are empty. */
export function normalizeExplanation(value) {
    if (typeof value !== 'string') return '';
    const content = isRichHtml(value) || /<(?:script|style|iframe|object|embed|noscript|template|head|title|meta|link)\b/i.test(value) ? sanitizeRichHtml(value) : value;
    const visible = htmlToPlain(content).replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');
    return visible ? content.trim() : '';
}

/** Omit empty explanations when saving, without changing question order or answers. */
export function normalizeQuestionExplanation(question) {
    const { explanation: raw, ...rest } = question;
    const explanation = normalizeExplanation(raw);
    return explanation ? { ...rest, explanation } : rest;
}
