import { useEffect, useRef } from 'react';
import { isRichHtml, plainToRichHtml, sanitizeRichHtml, escapeHtml } from '@/shared/utils/richText';

/** Stored value (HTML or legacy plain text) → editable HTML. */
const toEditorHtml = (value) => {
  if (!value) return '';
  return isRichHtml(value) ? sanitizeRichHtml(value) : plainToRichHtml(value);
};

const closest = (node, tag) => {
  let n = node;
  while (n && n.nodeType) {
    if (n.nodeType === 1 && n.tagName.toLowerCase() === tag) return n;
    n = n.parentNode;
  }
  return null;
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
    const html = sanitizeRichHtml(el.innerHTML);
    const out = html === '<br>' || html === '<p><br></p>' ? '' : html;
    lastEmitted.current = out;
    onChange?.(out);
  };

  const exec = (fn) => {
    ref.current?.focus();
    fn();
    emit();
  };

  const toggleInlineCode = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!ref.current?.contains(range.commonAncestorContainer)) return;
    const existing = closest(range.commonAncestorContainer, 'code');
    if (existing) {
      const parent = existing.parentNode;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
    } else if (!range.collapsed) {
      const code = document.createElement('code');
      code.appendChild(range.extractContents());
      range.insertNode(code);
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(code);
      sel.addRange(r);
    }
  };

  const toggleCodeBlock = () => {
    const sel = window.getSelection();
    const inPre = sel?.rangeCount && closest(sel.getRangeAt(0).commonAncestorContainer, 'pre');
    document.execCommand('formatBlock', false, inPre ? 'p' : 'pre');
  };

  const clearFormat = () => {
    document.execCommand('removeFormat');
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const code = closest(sel.getRangeAt(0).commonAncestorContainer, 'code');
      if (code) {
        const parent = code.parentNode;
        while (code.firstChild) parent.insertBefore(code.firstChild, code);
        parent.removeChild(code);
      }
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
      emit();
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichHtml(html));
    } else {
      document.execCommand('insertHTML', false, escapeHtml(text).replace(/\r?\n/g, '<br>'));
    }
    emit();
  };

  const btn = 'h-7 min-w-7 px-1.5 text-xs rounded-md text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-colors';

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
          <button type="button" title="Mã (inline)" className={`${btn} font-mono`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(toggleInlineCode)}>{'</>'}</button>
          {!compact && (
            <button type="button" title="Khối mã" className={`${btn} font-mono`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec(toggleCodeBlock)}>{'{ }'}</button>
          )}
          <button type="button" title="Chèn tab (phím Tab)" className={btn}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(() => document.execCommand('insertText', false, '\t'))}>⇥</button>
          <button type="button" title="Xóa định dạng" className={btn}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(clearFormat)}>Tx</button>
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
