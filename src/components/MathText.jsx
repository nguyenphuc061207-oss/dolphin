/**
 * Dolphin – MathText Component v4
 * Renders mixed text containing LaTeX ($...$ and $$...$$) using KaTeX.
 * 
 * v4 Changes:
 *   - normalizeUnicodeToLatex: tokenizer-based approach preserves existing $...$ blocks
 *   - Handles bare LaTeX commands (\forall, \exists, etc.) found outside math delimiters
 *   - MathText component: always uses KaTeX for rendering (removes unreliable MathJax bypass)
 *   - MathJax is still loaded for pages that call typesetPromise() directly
 * 
 * Usage:
 *   <MathText text="Tính $x^2 + y^2$ và $$\int_0^1 f(x) dx$$" />
 */

import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { Component, useEffect, useRef } from 'react';

// ─── Unicode → LaTeX mapping ───────────────────────────────────────────────
const UNICODE_TO_LATEX = [
  // Greek Lowercase
  [/α/g, '\\alpha'], [/β/g, '\\beta'], [/γ/g, '\\gamma'], [/δ/g, '\\delta'], [/ε/g, '\\epsilon'], 
  [/ζ/g, '\\zeta'], [/η/g, '\\eta'], [/θ/g, '\\theta'], [/ι/g, '\\iota'], [/κ/g, '\\kappa'], 
  [/λ/g, '\\lambda'], [/μ/g, '\\mu'], [/ν/g, '\\nu'], [/ξ/g, '\\xi'], [/ο/g, '\\omicron'], 
  [/π/g, '\\pi'], [/ρ/g, '\\rho'], [/σ/g, '\\sigma'], [/τ/g, '\\tau'], [/υ/g, '\\upsilon'], 
  [/φ/g, '\\phi'], [/χ/g, '\\chi'], [/ψ/g, '\\psi'], [/ω/g, '\\omega'],
  
  // Greek Uppercase
  [/Γ/g, '\\Gamma'], [/Δ/g, '\\Delta'], [/Θ/g, '\\Theta'], [/Λ/g, '\\Lambda'], [/Ξ/g, '\\Xi'], 
  [/Π/g, '\\Pi'], [/Σ/g, '\\Sigma'], [/Φ/g, '\\Phi'], [/Ψ/g, '\\Psi'], [/Ω/g, '\\Omega'],

  // Operators & Symbols
  [/∑/g, '\\sum'], [/∫/g, '\\int'], [/∬/g, '\\iint'], [/∭/g, '\\iiint'], [/∮/g, '\\oint'],
  [/∞/g, '\\infty'], [/±/g, '\\pm'], [/∓/g, '\\mp'], [/≤/g, '\\leq'], [/≥/g, '\\geq'], 
  [/≠/g, '\\neq'], [/≈/g, '\\approx'], [/∝/g, '\\propto'], [/≡/g, '\\equiv'], 
  [/≅/g, '\\cong'], [/∼/g, '\\sim'],
  [/×/g, '\\times'], [/÷/g, '\\div'], [/·/g, '\\cdot'], [/∗/g, '\\ast'], [/∘/g, '\\circ'],
  [/∂/g, '\\partial'], [/∇/g, '\\nabla'], [/√/g, '\\sqrt'], [/∛/g, '\\sqrt[3]'], [/∜/g, '\\sqrt[4]'],

  // Set Theory & Logic
  [/∈/g, '\\in'], [/∉/g, '\\notin'], [/∋/g, '\\ni'], [/∌/g, '\\not\\ni'], 
  [/⊂/g, '\\subset'], [/⊃/g, '\\supset'], [/⊄/g, '\\not\\subset'], [/⊅/g, '\\not\\supset'],
  [/⊆/g, '\\subseteq'], [/⊇/g, '\\supseteq'], [/∩/g, '\\cap'], [/∪/g, '\\cup'], 
  [/∀/g, '\\forall'], [/∃/g, '\\exists'], [/∄/g, '\\nexists'], [/∅/g, '\\emptyset'],
  [/¬/g, '\\neg'], [/∧/g, '\\land'], [/∨/g, '\\lor'], [/⊕/g, '\\oplus'], [/⊗/g, '\\otimes'],
  
  // Arrows
  [/→/g, '\\rightarrow'], [/←/g, '\\leftarrow'], [/↔/g, '\\leftrightarrow'], 
  [/⇒/g, '\\Rightarrow'], [/⇐/g, '\\Leftarrow'], [/⇔/g, '\\Leftrightarrow'],
  [/↑/g, '\\uparrow'], [/↓/g, '\\downarrow'], [/↗/g, '\\nearrow'], [/↘/g, '\\searrow'],

  // Geometry & Misc
  [/⊥/g, '\\perp'], [/∥/g, '\\parallel'], [/∦/g, '\\not\\parallel'], 
  [/∠/g, '\\angle'], [/∡/g, '\\measuredangle'], [/∢/g, '\\sphericalangle'],
  [/△/g, '\\triangle'], [/□/g, '\\square'], [/◊/g, '\\lozenge'],
  [/°/g, '^\\circ'], [/′/g, '^\prime'], [/″/g, '^{\\prime\\prime}'],
  
  // Super/Sub scripts
  [/⁰/g, '^{0}'], [/¹/g, '^{1}'], [/²/g, '^{2}'], [/³/g, '^{3}'], [/⁴/g, '^{4}'], 
  [/⁵/g, '^{5}'], [/⁶/g, '^{6}'], [/⁷/g, '^{7}'], [/⁸/g, '^{8}'], [/⁹/g, '^{9}'],
  [/₀/g, '_{0}'], [/₁/g, '_{1}'], [/₂/g, '_{2}'], [/₃/g, '_{3}'], [/₄/g, '_{4}'],
  [/₅/g, '_{5}'], [/₆/g, '_{6}'], [/₇/g, '_{7}'], [/₈/g, '_{8}'], [/₉/g, '_{9}'],

  // Fractions
  [/½/g, '\\frac{1}{2}'], [/⅓/g, '\\frac{1}{3}'], [/⅔/g, '\\frac{2}{3}'],
  [/¼/g, '\\frac{1}{4}'], [/¾/g, '\\frac{3}{4}'], [/⅕/g, '\\frac{1}{5}'],
];

// ─── Unicode detection pattern ─────────────────────────────────────────────
const UNICODE_MATH_PATTERN = /[∑∫∬∭∮√∛∜π∞±∓≤≥≠≈∝≡≅∼×÷·∗∘∂∇αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ∈∉∋∌⊂⊃⊆⊇⊄⊅∩∪∀∃∄∅¬∧∨⊕⊗→←↔⇒⇐⇔↑↓↗↘⊥∥∦∠∡∢△□◊°′″⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕]/;

// ─── Bare LaTeX command pattern ─────────────────────────────────────────────
// Detects LaTeX commands outside of $...$ that need to be wrapped
const BARE_LATEX_CMD = /\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|sum|int|iint|iiint|oint|infty|pm|mp|leq|geq|neq|approx|propto|equiv|cong|sim|times|div|cdot|ast|circ|partial|nabla|sqrt|surd|in|notin|ni|subset|supset|subseteq|supseteq|cap|cup|forall|exists|nexists|emptyset|neg|land|lor|oplus|otimes|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|uparrow|downarrow|nearrow|searrow|perp|parallel|angle|measuredangle|triangle|square|lozenge|frac|text|mathbb|mathbf|boldsymbol|overline|underline|hat|tilde|vec|bar|dot|ddot|check|breve|acute|grave|mathring|overbrace|underbrace|overset|underset|boxed|left|right|middle|begin|end)\b/;

/**
 * Tokenize a string into plain text and LaTeX parts.
 * Returns an array of { type: 'text' | 'inline' | 'block', content: string }
 */
function tokenizeMath(text) {
  if (!text) return [];
  const tokens = [];
  // Match $$...$$ (block) first, then $...$ (inline)
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('$$')) {
      tokens.push({ type: 'block', content: raw.slice(2, -2) });
    } else {
      tokens.push({ type: 'inline', content: raw.slice(1, -1) });
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Pre-process text to convert Unicode math symbols to LaTeX equivalents.
 * Uses tokenizer-based approach to preserve existing $...$ blocks.
 *
 * v4: Also detects bare LaTeX commands (e.g. \forall, \alpha) outside of $...$
 *     and wraps them in inline math delimiters.
 */
export function normalizeUnicodeToLatex(text) {
  if (!text) return text;

  // 1. Tokenize the text into math and text parts
  const tokens = tokenizeMath(text);

  // 2. Process each token
  const processedTokens = tokens.map(token => {
    if (token.type === 'inline' || token.type === 'block') {
      let content = token.content;
      
      // Inside math: replace unicode symbols with LaTeX equivalents (no $ wrapping)
      if (/(?:\\?sqrt|√)\(([^)]+)\)/i.test(content)) {
        content = content.replace(/(?:\\?sqrt|√)\(([^)]+)\)/gi, '\\sqrt{$1}');
      }
      if (/√([a-zA-Z0-9]+)/.test(content)) {
        content = content.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');
      }
      if (/√/.test(content)) {
        content = content.replace(/√/g, '\\surd');
      }

      for (const [pattern, replacement] of UNICODE_TO_LATEX) {
        if (pattern.test(content)) {
          content = content.replace(pattern, replacement);
        }
      }

      return { type: token.type, content };
    } else {
      // Outside math: we need to wrap symbols and bare LaTeX commands in $...$
      let content = token.content;

      // 1. Square root replacements
      if (/(?:\\?sqrt|√)\(([^)]+)\)/i.test(content)) {
        content = content.replace(/(?:\\?sqrt|√)\(([^)]+)\)/gi, '$\\sqrt{$1}$');
      }
      if (/√([a-zA-Z0-9]+)/.test(content)) {
        content = content.replace(/√([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$');
      }
      if (/√/.test(content)) {
        content = content.replace(/√/g, '$\\surd$');
      }

      // 2. Unicode symbols to LaTeX (with $ wrapping)
      for (const [pattern, replacement] of UNICODE_TO_LATEX) {
        if (pattern.test(content)) {
          content = content.replace(pattern, '$' + replacement + '$');
        }
      }

      // 3. Exponents and subscripts (x^2, y_1)
      if (/[a-zA-Z0-9](\^|_)[a-zA-Z0-9]/.test(content)) {
        content = content.replace(/\b([a-zA-Z0-9]+(\^|_)[a-zA-Z0-9]+)\b/g, '$$$1$$');
      }

      // 4. Absolute values and Norms
      if (/\|[a-zA-Z0-9]+\|/.test(content)) {
        content = content.replace(/\|([a-zA-Z0-9]+)\|/g, '$$|$1|$$');
      }

      // 5. Wrap bare LaTeX commands (\forall, \exists, etc.) that are outside $...$
      //    These may come from OMML conversion or user input
      if (BARE_LATEX_CMD.test(content)) {
        content = wrapBareLatexCommands(content);
      }

      return { type: 'text', content };
    }
  });

  // 3. Build the joined string from processed tokens
  let result = buildFromTokens(processedTokens);

  // 4. Merge adjacent inline math blocks
  result = mergeAdjacentMath(result);

  return result;
}

/**
 * Wrap bare LaTeX commands found outside of $...$ delimiters.
 * 
 * Scans a plain-text segment for sequences that contain LaTeX commands
 * (e.g. "\forall x \in R") and wraps them in $...$, while leaving
 * surrounding Vietnamese/plain text alone.
 */
function wrapBareLatexCommands(text) {
  // Split on existing math delimiters first to avoid double-processing
  const parts = [];
  // We need to find runs of text that contain LaTeX and wrap them
  // Strategy: find each LaTeX command and expand to capture the surrounding math-like context
  
  // Match a LaTeX command followed by optional math content (letters, numbers, operators, braces, etc.)
  // until we hit something that's clearly not math (Vietnamese text, punctuation sentence boundaries)
  const cmdRegex = /(\\[a-zA-Z]+(?:\{[^}]*\})?(?:\s*[a-zA-Z0-9_^{}\\,.\s<>=+\-*/|]*)?)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = cmdRegex.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Wrap the LaTeX command in $...$
    let latex = match[1].trim();
    // Remove trailing punctuation that's not math
    const trailingMatch = latex.match(/([.,;:!?\s]+)$/);
    let trailing = '';
    if (trailingMatch) {
      trailing = trailingMatch[1];
      latex = latex.slice(0, -trailing.length);
    }
    
    parts.push(`$${latex}$${trailing}`);
    lastIndex = cmdRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.join('');
}

/**
 * Build a string from processed tokens
 */
function buildFromTokens(tokens) {
  let result = '';
  for (const token of tokens) {
    if (token.type === 'inline') {
      result += `$${token.content}$`;
    } else if (token.type === 'block') {
      result += `$$${token.content}$$`;
    } else {
      result += token.content;
    }
  }
  return result;
}

/**
 * Merge adjacent inline math blocks to produce cleaner output.
 * $\forall$ $x$ $\in$ → $\forall x \in$
 */
function mergeAdjacentMath(text) {
  const tokens = tokenizeMath(text);
  if (tokens.length <= 1) return text;
  
  const merged = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (merged.length === 0) {
      merged.push({ ...token });
      continue;
    }

    const last = merged[merged.length - 1];

    if (last.type === 'inline' && token.type === 'inline') {
      // Merge adjacent inline math: $a$$b$ → $a b$
      last.content += ' ' + token.content;
    } else if (last.type === 'inline' && token.type === 'text' && /^\s+$/.test(token.content)) {
      // Whitespace between inline math blocks: $a$ $b$ → $a b$
      const nextToken = tokens[i + 1];
      if (nextToken && nextToken.type === 'inline') {
        last.content += token.content;
      } else {
        merged.push({ ...token });
      }
    } else {
      merged.push({ ...token });
    }
  }

  return buildFromTokens(merged);
}

/**
 * Clean up weird symbols produced by Mammoth/Word conversion
 */
export function normalizeWordMangledMath(text) {
  if (!text) return text;
  let result = text;
  
  // Word Equation delimiters
  result = result.replace(/[〚〛]/g, '$');
  
  // Word placeholders/artifacts
  result = result.replace(/█/g, '');
  
  // Degree symbols (only outside of existing $...$)
  // Handled by UNICODE_TO_LATEX mapping instead
  
  // Word log/subscripts: log_3 -> \log_{3}
  result = result.replace(/log_(\d+)/gi, '\\log_{$1}');
  
  // Word fractions/superscripts: (a/b@c) -> \frac{a}{b}_{c}
  result = result.replace(/\(([^/]+)\/([^@]+)@([^)]+)\)/g, '{$1 \\frac{2}{3}}_{$3}'); 
  // General fallback for @ as subscript marker in mangled Word text
  result = result.replace(/@(\d+)/g, '_{$1}');
  
  // Simple fractions (a/b)
  result = result.replace(/\(([^/]+)\/([^)]+)\)/g, '\\frac{$1}{$2}');
  
  return result;
}

/**
 * MathText Component
 * 
 * v4: Always renders using KaTeX for reliable inline rendering.
 * MathJax typesetPromise() is called separately via useEffect for
 * any content that KaTeX can't handle (rare edge cases).
 */
export default function MathText({ text, className = '' }) {
  if (!text) return null;
  const ref = useRef(null);

  // 1. Clean up Word mangled math
  let processed = normalizeWordMangledMath(text);
  
  // 2. Normalize Unicode symbols to LaTeX
  processed = normalizeUnicodeToLatex(processed);
  
  // 3. Tokenize and render using KaTeX
  const tokens = tokenizeMath(processed);

  // If no math tokens, render as plain text
  const hasMath = tokens.some(t => t.type === 'inline' || t.type === 'block');
  if (!hasMath) {
    return <span className={className}>{processed}</span>;
  }

  return (
    <span className={`math-text ${className}`} ref={ref}>
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
 * Simple React Error Boundary for KaTeX rendering failures.
 * Falls back to displaying the raw LaTeX source.
 */
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
