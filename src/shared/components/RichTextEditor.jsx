import { useEffect, useRef, useState } from 'react';
import { isRichHtml, plainToRichHtml, sanitizeRichHtml, escapeHtml } from '@/shared/utils/richText';

// Caret anchor: lets the caret sit just outside an inline <code> (or inside an empty one).
// Never stored – stripped on every emit.
const ZWSP = '\u200B';

/** Stored value (HTML or legacy plain text) → editable HTML. Imported block code becomes <pre>. */
const toEditorHtml = (value) => {
  if (!value) return '';
  if (!isRichHtml(value)) return plainToRichHtml(value);
  return sanitizeRichHtml(value)
    .replace(/(?:<br>)?<code class="rt-block">([\s\S]*?)<\/code>(?:<br>)?/g, '<pre>$1</pre>');
};

const closest = (node, tag) => {
  let n = node;
  while (n && n.nodeType) {
    if (n.nodeType === 1 && n.tagName.toLowerCase() === tag) return n;
    n = n.parentNode;
  }
  return null;
};

/** Text of a node or fragment, <br> counted as a newline (how code is stored and rendered). */
const textOf = (node) => {
  if (node.nodeType === 3) return node.nodeValue.replace(/\u200B/g, '');
  if (node.nodeType === 1 && node.tagName === 'BR') return '\n';
  return Array.from(node.childNodes).map(textOf).join('');
};

const placeCaret = (node, offset) => {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
};

/** Text from the caret to the start / end of `el`. */
const textAround = (el, range) => {
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(range.endContainer, range.endOffset);
  return { before: textOf(before.cloneContents()), after: textOf(after.cloneContents()) };
};

const hasContent = (node) => !!node && (node.nodeType !== 3 || node.nodeValue.replace(/\u200B/g, '').trim() !== '');

/** Put the caret on the line after a code block, creating an empty paragraph when there is none. */
const leaveBlock = (pre) => {
  let next = pre.nextSibling;
  while (next && !hasContent(next) && next.nodeType === 3) next = next.nextSibling;
  if (next && next.nodeType === 3) { placeCaret(next, 0); return; }
  if (!next || next.tagName !== 'P') {
    next = document.createElement('p');
    next.appendChild(document.createElement('br'));
    pre.after(next);
  }
  placeCaret(next, 0);
};

/** Put the caret right after an inline <code>, so typing continues as normal text. */
const leaveInline = (code) => {
  let t = code.nextSibling;
  if (!t || t.nodeType !== 3) {
    t = document.createTextNode(ZWSP);
    code.after(t);
  } else if (!t.nodeValue.startsWith(ZWSP)) t.nodeValue = ZWSP + t.nodeValue;
  placeCaret(t, 1);
};

/** Turn a code block back into a normal paragraph (lines kept). */
const unwrapBlock = (pre) => {
  const p = document.createElement('p');
  p.innerHTML = escapeHtml(textOf(pre).replace(/\n+$/, '')).replace(/\n/g, '<br>') || '<br>';
  pre.replaceWith(p);
  placeCaret(p, p.textContent ? p.childNodes.length : 0);
};

const TOOLS = [
  { key: 'bold', label: <b>B</b>, title: 'In đậm (Ctrl+B)', run: () => document.execCommand('bold') },
  { key: 'italic', label: <i>I</i>, title: 'In nghiêng (Ctrl+I)', run: () => document.execCommand('italic') },
  { key: 'underline', label: <u>U</u>, title: 'Gạch chân (Ctrl+U)', run: () => document.execCommand('underline') },
  { key: 'strike', label: <s>S</s>, title: 'Gạch ngang', run: () => document.execCommand('strikeThrough') },
  { key: 'sup', label: <span>x²</span>, title: 'Chỉ số trên', run: () => document.execCommand('superscript') },
  { key: 'sub', label: <span>x₂</span>, title: 'Chỉ số dưới', run: () => document.execCommand('subscript') },
];

/**
 * Lightweight rich text editor (contentEditable). Emits sanitized HTML:
 * b / i / u / s / sub / sup / code / pre / mark / br / p. Colours and fonts from pasted
 * content are dropped, so text always stays black.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Nhập nội dung…',
  minHeight = 44,
  compact = false,
  className = '',
  disabled = false,
}) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);

  // Sync external value → DOM, but never while the user is typing the same content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastEmitted.current !== null && lastEmitted.current === (value ?? '')) return;
    el.innerHTML = toEditorHtml(value);
    lastEmitted.current = value ?? '';
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichHtml(el.innerHTML.replace(/\u200B/g, ''))
      .replace(/<code><\/code>|<pre><\/pre>/g, '');
    const out = /^(?:<br>|<p><br><\/p>|\s)*$/.test(html) ? '' : html;
    // Leftover <br> after deleting everything hides the placeholder
    if (!out && el.innerHTML !== '' && !el.textContent.replace(/\u200B/g, '')) el.innerHTML = '';
    lastEmitted.current = out;
    onChange?.(out);
  };

  /** Current caret range when it is inside this editor. */
  const caretRange = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return ref.current?.contains(range.commonAncestorContainer) ? range : null;
  };
  const inEditor = (node) => (node && ref.current?.contains(node) ? node : null);

  // Which kind of code the caret is in – lights up the button and shows how to get out.
  const [inCode, setInCode] = useState(null); // null | 'inline' | 'block'
  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
      const el = ref.current;
      const kind = !el || !node || !el.contains(node) ? null
        : closest(node, 'pre') && el.contains(closest(node, 'pre')) ? 'block'
          : closest(node, 'code') && el.contains(closest(node, 'code')) ? 'inline' : null;
      setInCode(kind);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const exec = (fn) => {
    ref.current?.focus();
    fn();
    emit();
  };

  // </> : with a selection wrap/unwrap it; with just a caret start inline code there,
  // or – when already inside inline code – step out of it.
  const toggleInlineCode = () => {
    const range = caretRange();
    if (!range) return;
    const existing = inEditor(closest(range.commonAncestorContainer, 'code'));
    if (existing && closest(existing, 'pre')) return; // code inside a block: nothing to toggle
    if (existing && range.collapsed) {
      leaveInline(existing);
    } else if (existing) {
      const parent = existing.parentNode;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
    } else {
      const empty = range.collapsed; // insertNode below expands the range
      const code = document.createElement('code');
      code.appendChild(empty ? document.createTextNode(ZWSP) : range.extractContents());
      range.insertNode(code);
      if (empty) placeCaret(code.firstChild, 1);
      else {
        const r = document.createRange();
        r.selectNodeContents(code);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
      }
    }
  };

  // { } : inside a code block turn it back into text, otherwise make the line(s) a code block.
  const toggleCodeBlock = () => {
    const range = caretRange();
    const pre = range && inEditor(closest(range.commonAncestorContainer, 'pre'));
    if (pre) unwrapBlock(pre);
    else document.execCommand('formatBlock', false, 'pre');
  };

  const clearFormat = () => {
    document.execCommand('removeFormat');
    const range = caretRange();
    if (!range) return;
    const pre = inEditor(closest(range.commonAncestorContainer, 'pre'));
    if (pre) { unwrapBlock(pre); return; }
    const code = inEditor(closest(range.commonAncestorContainer, 'code'));
    if (code) {
      const parent = code.parentNode;
      while (code.firstChild) parent.insertBefore(code.firstChild, code);
      parent.removeChild(code);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
      emit();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const range = caretRange();
    if (!range) return;
    const pre = inEditor(closest(range.startContainer, 'pre'));
    const code = !pre && inEditor(closest(range.startContainer, 'code'));

    if (pre && range.collapsed) {
      const { before, after } = textAround(pre, range);
      const isLast = !Array.from(ref.current.childNodes).slice(Array.from(ref.current.childNodes).indexOf(pre) + 1).some(hasContent);
      // Enter on an empty last line (Enter twice), Esc, or ↓/→ at the end leaves the block
      const leave = (e.key === 'Enter' && !e.shiftKey && after.replace(/\n/g, '') === '' && (before === '' || before.endsWith('\n')))
        || e.key === 'Escape'
        || (e.key === 'ArrowDown' && isLast && !after.includes('\n'))
        || (e.key === 'ArrowRight' && isLast && after.replace(/\n$/, '') === '');
      if (leave) {
        e.preventDefault();
        if (e.key === 'Enter') {
          const text = textOf(pre).replace(/\n+$/, '');
          if (!text) { unwrapBlock(pre); emit(); return; } // Enter in an empty block: plain line
          pre.textContent = text;
        }
        leaveBlock(pre);
        emit();
        return;
      }
      if (e.key === 'Backspace' && !textOf(pre)) { // empty block: back to a normal line
        e.preventDefault();
        unwrapBlock(pre);
        emit();
      }
      return;
    }

    if (code && range.collapsed) {
      const { after } = textAround(code, range);
      if (e.key === 'Escape' || (e.key === 'ArrowRight' && after === '')) {
        e.preventDefault();
        leaveInline(code);
        emit();
      }
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const range = caretRange();
    const inCode = range && (closest(range.startContainer, 'pre') || closest(range.startContainer, 'code'));
    if (inCode) {
      // Inside code keep the exact characters (indentation, < >, quotes), never formatting
      document.execCommand('insertHTML', false, escapeHtml(text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>'));
    } else if (html) {
      document.execCommand('insertHTML', false, sanitizeRichHtml(html));
    } else {
      document.execCommand('insertHTML', false, escapeHtml(text).replace(/\r?\n/g, '<br>'));
    }
    emit();
  };

  const btn = 'h-7 min-w-7 px-1.5 text-xs rounded-md text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-colors';
  const activeBtn = '!bg-blue-100 !text-blue-700';

  return (
    <div className={`border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-blue-500 transition-shadow ${className}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50/70 rounded-t-xl">
          {TOOLS.map((t) => (
            <button key={t.key} type="button" title={t.title} className={btn}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec(t.run)}>
              {t.label}
            </button>
          ))}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <button type="button" title="Mã (inline) – bấm lại, → hoặc Esc để thoát" aria-pressed={inCode === 'inline'}
            className={`${btn} font-mono ${inCode === 'inline' ? activeBtn : ''}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(toggleInlineCode)}>{'</>'}</button>
          {!compact && (
            <button type="button" title="Khối mã – Enter 2 lần, ↓ hoặc Esc để thoát; bấm lại để bỏ" aria-pressed={inCode === 'block'}
              className={`${btn} font-mono ${inCode === 'block' ? activeBtn : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec(toggleCodeBlock)}>{'{ }'}</button>
          )}
          <button type="button" title="Chèn tab (phím Tab)" className={btn}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(() => document.execCommand('insertText', false, '\t'))}>⇥</button>
          <button type="button" title="Xóa định dạng" className={btn}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(clearFormat)}>Tx</button>
          {inCode && (
            <span className="ml-auto text-[10px] text-blue-600 select-none" aria-live="polite">
              {inCode === 'block' ? 'Khối mã · Esc / Enter 2 lần để thoát' : 'Mã · Esc / → để thoát'}
            </span>
          )}
        </div>
      )}
      <div
        ref={ref}
        className="rt-editor rich-text-content px-3 py-2 text-sm text-gray-900"
        style={{ minHeight }}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </div>
  );
}
