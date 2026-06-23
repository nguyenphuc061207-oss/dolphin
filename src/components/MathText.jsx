/**
 * Dolphin – MathText Component
 * Renders mixed text containing LaTeX ($...$ and $$...$$) using KaTeX.
 * 
 * Usage:
 *   <MathText text="Tính $x^2 + y^2$ và $$\int_0^1 f(x) dx$$" />
 */

import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useRef, useEffect } from 'react';
import { normalizeUnicodeToLatex, normalizeWordMangledMath, tokenizeMath } from '../utils/mathUtils';

export default function MathText({ text, className = '' }) {
  if (!text) return null;

  // 1. Clean up Word mangled math
  let processed = normalizeWordMangledMath(text);
  
  // 2. Normalize Unicode symbols to LaTeX
  processed = normalizeUnicodeToLatex(processed);
  
  // Safe Check: If MathJax is loaded on the client-side, let MathJax handle the rendering beautifully!
  // We must still parse out our [IMG: ...] tokens and render them as actual <img> tags.
  if (typeof window !== 'undefined' && window.MathJax) {
    return <MathJaxRenderer processed={processed} className={className} />;
  }
  
  // Fallback to KaTeX (react-katex) if MathJax is not available (e.g. locally or during build)
  // 3. Tokenize and render
  const tokens = tokenizeMath(processed);

  // If no math tokens or image tokens, render as plain text
  const hasSpecial = tokens.some(t => t.type === 'inline' || t.type === 'block' || t.type === 'image');
  if (!hasSpecial) {
    return <span className={className}>{text}</span>;
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
        if (token.type === 'image') {
          return (
            <img 
              key={i} 
              src={token.content} 
              alt="Embedded from docx" 
              style={{ maxWidth: '100%', height: 'auto', display: 'inline-block', margin: '0 5px', verticalAlign: 'middle' }} 
            />
          );
        }
        // inline
        return (
          <MathErrorBoundary key={i} fallback={`$${token.content}$`}>
            <InlineMath math={token.content} />
          </MathErrorBoundary>
        );
      })}
    </span>
  );
}

/**
 * Sub-component that renders with MathJax and triggers typesetting after mount/update.
 */
function MathJaxRenderer({ processed, className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current && window.MathJax && window.MathJax.typesetPromise) {
      // Clear previous MathJax rendering then re-typeset
      window.MathJax.typesetPromise([containerRef.current]).catch((err) => {
        console.warn('MathJax typeset error:', err);
      });
    }
  }, [processed]);

  const parts = processed.split(/(\[IMG:\s*[^\]]+\])/g);
  return (
    <span ref={containerRef} className={`math-text ${className}`}>
      {parts.map((part, i) => {
        if (part.startsWith('[IMG:')) {
          const src = part.slice(5, -1).trim();
          return (
            <img 
              key={i} 
              src={src} 
              alt="Embedded from docx" 
              style={{ maxWidth: '100%', height: 'auto', display: 'inline-block', margin: '0 5px', verticalAlign: 'middle' }} 
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/**
 * Simple React Error Boundary for KaTeX rendering failures.
 */
import { Component } from 'react';

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
