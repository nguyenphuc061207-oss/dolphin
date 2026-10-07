/**
 * Dolphin – MathText Component
 * Renders mixed text containing LaTeX ($...$ and $$...$$) and [IMG: …] tokens with KaTeX.
 *
 * KaTeX renders synchronously, so there is no global re-typeset pass: each snippet is
 * converted once and memoised (the per-second exam timer no longer re-processes math).
 *
 * Usage:
 *   <MathText text="Tính $x^2 + y^2$ và $$\int_0^1 f(x) dx$$" />
 */

import { Component, memo, useMemo } from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { normalizeUnicodeToLatex, normalizeWordMangledMath, tokenizeMath } from '../math/mathUtils';

const IMG_STYLE = { maxWidth: '100%', height: 'auto', display: 'inline-block', margin: '0 5px', verticalAlign: 'middle' };

function MathText({ text, className = '' }) {
  const tokens = useMemo(() => {
    if (!text) return null;
    // 1. Clean up Word mangled math, 2. Unicode symbols → LaTeX, 3. tokenize
    return tokenizeMath(normalizeUnicodeToLatex(normalizeWordMangledMath(text)));
  }, [text]);

  if (!text) return null;

  // No math / image tokens → plain text (fast path)
  if (!tokens.some((t) => t.type !== 'text')) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`math-text ${className}`}>
      {tokens.map((token, i) => {
        if (token.type === 'text') return <span key={i}>{token.content}</span>;
        if (token.type === 'block') {
          return (
            <span key={i} className="block my-2">
              <MathErrorBoundary fallback={token.content}>
                <BlockMath math={token.content} />
              </MathErrorBoundary>
            </span>
          );
        }
        if (token.type === 'image') {
          return <img key={i} src={token.content} alt="Hình minh họa trong đề" loading="lazy" decoding="async" style={IMG_STYLE} />;
        }
        return (
          <MathErrorBoundary key={i} fallback={`$${token.content}$`}>
            <InlineMath math={token.content} />
          </MathErrorBoundary>
        );
      })}
    </span>
  );
}

export default memo(MathText);

/** Simple React Error Boundary for KaTeX rendering failures. */
class MathErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <span className="text-red-400 bg-red-50 px-1 rounded text-[11px] font-mono border border-red-200">
          {this.props.fallback}
        </span>
      );
    }
    return this.props.children;
  }
}
