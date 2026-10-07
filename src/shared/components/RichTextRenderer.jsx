import React, { memo, useMemo } from 'react';
import MathText from './MathText';
import { isRichHtml, sanitizeRichHtml } from '@/shared/utils/richText';
import { highlightCode } from '@/shared/utils/highlightCode';

const TOKEN_REGEX = /\[!m:\$(mathml_\d+)\$\]/g;
const EMPTY_DICT = Object.freeze({}); // stable default: a fresh {} per render would defeat memoisation

// Sanitised + parsed DOM per content string. The same question/option text is rendered many
// times (preview, list, exam, review); parsing it once keeps re-renders cheap.
const DOM_CACHE = new Map();
const DOM_CACHE_LIMIT = 600;
function parseRich(content) {
  let body = DOM_CACHE.get(content);
  if (!body) {
    body = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(content)}</body>`, 'text/html').body;
    if (DOM_CACHE.size >= DOM_CACHE_LIMIT) DOM_CACHE.delete(DOM_CACHE.keys().next().value);
    DOM_CACHE.set(content, body);
  }
  return body;
}

/** Plain text (legacy) with optional math placeholders like [!m:$mathml_1$] */
function renderPlain(text, mathDict, keyPrefix = '') {
  const parts = text.split(TOKEN_REGEX);
  // split with a capture group returns [text, id, text, id, ...]
  return parts.map((part, index) => {
    const key = `${keyPrefix}${index}`;
    if (index % 2 === 0) return <MathText key={key} text={part} />;
    const latex = mathDict[part];
    if (!latex) return <span key={key} className="text-red-500 underline">[{part} missing]</span>;
    return <MathText key={key} text={`$${latex}$`} />;
  });
}

const TAG_COMPONENTS = {
  b: 'b', i: 'i', u: 'u', s: 's', sub: 'sub', sup: 'sup', mark: 'mark', code: 'code', pre: 'pre', p: 'p',
};

/** Block code: plain text with light syntax colouring (no layout change – text stays identical). */
function renderCode(text, key) {
  return highlightCode(text).map((t, i) => (t.type
    ? <span key={`${key}.${i}`} className={`tok-${t.type}`}>{t.text}</span>
    : t.text));
}

/** Convert a sanitized DOM tree to React elements. Math is rendered in text nodes except inside code. */
function domToReact(node, mathDict, inCode, key) {
  if (node.nodeType === 3) {
    const text = node.nodeValue;
    if (inCode === 'block') return <React.Fragment key={key}>{renderCode(text, key)}</React.Fragment>;
    return inCode ? text : <React.Fragment key={key}>{renderPlain(text, mathDict, `${key}-`)}</React.Fragment>;
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return <br key={key} />;
  const isBlockCode = (tag === 'code' && node.getAttribute('class') === 'rt-block') || tag === 'pre';
  const nextInCode = isBlockCode ? 'block' : (inCode || tag === 'code');
  const children = Array.from(node.childNodes).map((c, i) => domToReact(c, mathDict, nextInCode, `${key}.${i}`));
  const Comp = TAG_COMPONENTS[tag];
  if (!Comp) return <React.Fragment key={key}>{children}</React.Fragment>;
  const className = node.getAttribute('class') || undefined;
  return React.createElement(Comp, { key, className }, ...children);
}

/**
 * RichTextRenderer
 * Renders question text. New content is sanitized HTML (b/i/u/sub/sup/code/…) with $LaTeX$ and [IMG: …];
 * legacy content is plain text. Memoised: re-renders of the parent (e.g. the exam timer) are free
 * unless the content itself changes.
 */
function RichTextRenderer({ content, mathDict = EMPTY_DICT, className = '' }) {
  const dict = mathDict || EMPTY_DICT;
  const rich = typeof content === 'string' && isRichHtml(content);
  const nodes = useMemo(() => {
    if (!rich) return null;
    return Array.from(parseRich(content).childNodes).map((n, i) => domToReact(n, dict, false, String(i)));
  }, [rich, content, dict]);

  if (!content) return null;

  return (
    <div className={`rich-text-content ${className}`} style={{ whiteSpace: 'pre-wrap' }}>
      {rich ? nodes : renderPlain(typeof content === 'string' || typeof content === 'number' ? String(content) : '', dict)}
    </div>
  );
}

export default memo(RichTextRenderer);
