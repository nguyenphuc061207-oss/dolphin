import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { Component } from 'react';
import { normalizeUnicodeToLatex, normalizeWordMangledMath, tokenizeMath } from '../utils/mathText';

/**
 * MathText Component
 * Renders mixed text containing LaTeX ($...$ and $$...$$) using KaTeX.
 *
 * The normalization helpers live in `src/utils/mathText.js` so this component
 * stays refresh-friendly during development.
 */
export default function MathText({ text, className = '' }) {
  if (!text) return null;

  let processed = normalizeWordMangledMath(text);
  processed = normalizeUnicodeToLatex(processed);
  const tokens = tokenizeMath(processed);

  const hasMath = tokens.some((token) => token.type === 'inline' || token.type === 'block');
  if (!hasMath) {
    return <span className={className}>{processed}</span>;
  }

  return (
    <span className={`math-text ${className}`}>
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          return <span key={i}>{token.content}</span>;
        }
        if (token.type === 'block') {
          return (
            <span key={i} className="block my-2">
              <MathErrorBoundary fallback={token.content}>
                <BlockMath math={token.content} />
              </MathErrorBoundary>
            </span>
          );
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
