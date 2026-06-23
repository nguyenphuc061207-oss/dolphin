import { convertAsciiMathToLatex } from './asciiMathParser';
import { extractMathMLFromText } from './mathmlParser';

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
  [/≅/g, '\\cong'], [/≈/g, '\\approx'], [/∼/g, '\\sim'], [/∝/g, '\\propto'],
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
  [/°/g, '^\\circ'], [/′/g, '^\prime'], [/″/g, '^{\prime\prime}'],
  
  // Super/Sub scripts
  [/⁰/g, '^{0}'], [/¹/g, '^{1}'], [/²/g, '^{2}'], [/³/g, '^{3}'], [/⁴/g, '^{4}'], 
  [/⁵/g, '^{5}'], [/⁶/g, '^{6}'], [/⁷/g, '^{7}'], [/⁸/g, '^{8}'], [/⁹/g, '^{9}'],
  [/₀/g, '_{0}'], [/₁/g, '_{1}'], [/₂/g, '_{2}'], [/₃/g, '_{3}'], [/₄/g, '_{4}'],
  [/₅/g, '_{5}'], [/₆/g, '_{6}'], [/₇/g, '_{7}'], [/₈/g, '_{8}'], [/₉/g, '_{9}'],

  // Fractions
  [/½/g, '\\frac{1}{2}'], [/⅓/g, '\\frac{1}{3}'], [/⅔/g, '\\frac{2}{3}'],
  [/¼/g, '\\frac{1}{4}'], [/¾/g, '\\frac{3}{4}'], [/⅕/g, '\\frac{1}{5}'],
];

/**
 * Pre-process text to convert Unicode math symbols to LaTeX equivalents.
 * Only converts symbols found OUTSIDE of existing $...$ delimiters.
 */
export function normalizeUnicodeToLatex(text) {
  if (!text) return text;
  
  // Regex to match existing math blocks ($...$, $$...$$, \(...\), \[...\]) and images
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\)|\[IMG:\s*data:[^\]]+\])/g;

  // Pre-pass: convert MathML and AsciiMath to LaTeX before splitting
  let preprocessed = extractMathMLFromText(text);
  preprocessed = convertAsciiMathToLatex(preprocessed);

  // Normalize \(...\) → $...$ and \[...\] → $$...$$ before splitting
  preprocessed = preprocessed.replace(/\\\(([\s\S]*?)\\\)/g, (match, p1) => `$${p1}$`);
  preprocessed = preprocessed.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => `$$$${p1}$$$$`);

  const parts = preprocessed.split(mathRegex);
  
  let finalResult = "";
  for (let i = 0; i < parts.length; i++) {
    // Even indices are plain text, odd indices are matched math/img blocks
    if (i % 2 === 0) {
      let result = parts[i];

      // 1. sqrt(...) or \sqrt(...) or √(...) -> \sqrt{...}
      if (/(?:\\?sqrt|√)\(([^)]+)\)/i.test(result)) {
        result = result.replace(/(?:\\?sqrt|√)\(([^)]+)\)/gi, '$\\sqrt{$1}$');
      }
      
      // 1b. √ followed by a number or word (e.g. √123 or √x)
      if (/√([a-zA-Z0-9]+)/.test(result)) {
        result = result.replace(/√([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$');
      }
      
      // 1c. If there is a stray √ left over without arguments, replace it with a text radical symbol
      if (/√/.test(result)) {
        result = result.replace(/√/g, '$\\surd$'); 
      }
      
      for (const [pattern, replacement] of UNICODE_TO_LATEX) {
        if (pattern.test(result)) {
          result = result.replace(pattern, '$' + replacement + '$');
        }
      }

      // 3. Detect caret (^) and underscore (_) for exponents/subscripts
      if (/[a-zA-Z0-9](\^|_)[a-zA-Z0-9]/.test(result)) {
         result = result.replace(/\b([a-zA-Z0-9]+(\^|_)[a-zA-Z0-9]+)\b/g, '$$$1$$');
      }

      // 4. Detect Absolute Value |x| and Norm ||x||
      if (/\|[a-zA-Z0-9]+\|/.test(result)) {
        result = result.replace(/\|([a-zA-Z0-9]+)\|/g, '$$|$1|$$');
      }
      
      // Cleanup only for newly created adjacent inline math blocks
      result = result.replace(/\$\$\$/g, '$'); 
      // Merge: $a$ $b$ -> $a b$
      result = result.replace(/\$\s+\$/g, ' '); 
      
      finalResult += result;
    } else {
      // It's already math or image, just append it exactly as is
      finalResult += parts[i];
    }
  }

  return finalResult;
}

/**
 * Check if a string contains any Unicode math symbol that should be wrapped in $
 */
export function hasBareUnicode(text) {
  if (!text) return false;
  const unicodePattern = /[∑∫√π∞±≤≥≠≈×÷·αβγδεθλμστφωΔΣΩ∂∇∈∉⊂⊃∪∩∀∃→←↔⇒⇔⁰¹²³⁴⁵⁶⁷⁸⁹½⅓¼¾]/;
  return unicodePattern.test(text);
}

/**
 * Tokenize a string into plain text and LaTeX parts.
 * Returns an array of { type: 'text' | 'inline' | 'block', content: string }
 */
export function tokenizeMath(text) {
  if (!text) return [];
  const tokens = [];
  // Match $$...$$ (block), $...$ (inline), and [IMG: ...] (image)
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\[IMG:\s*data:[^\]]+\])/g;
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
    } else if (raw.startsWith('[IMG:')) {
      tokens.push({ type: 'image', content: raw.slice(5, -1).trim() });
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
 * Clean up weird symbols produced by Mammoth/Word conversion
 */
export function normalizeWordMangledMath(text) {
  if (!text) return text;
  let result = text;
  
  // Word Equation delimiters
  result = result.replace(/[〚〛]/g, '$');
  
  // Word placeholders/artifacts
  result = result.replace(/█/g, '');
  
  // Degree symbols
  result = result.replace(/°C/g, '^{\\circ}C');
  result = result.replace(/°/g, '^{\\circ}');
  
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
