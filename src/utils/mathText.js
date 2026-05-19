/**
 * Shared math text normalization helpers.
 * Keep these outside React component files to preserve Fast Refresh stability.
 */

const UNICODE_TO_LATEX = [
  [/α/g, '\\alpha'], [/β/g, '\\beta'], [/γ/g, '\\gamma'], [/δ/g, '\\delta'], [/ε/g, '\\epsilon'],
  [/ζ/g, '\\zeta'], [/η/g, '\\eta'], [/θ/g, '\\theta'], [/ι/g, '\\iota'], [/κ/g, '\\kappa'],
  [/λ/g, '\\lambda'], [/μ/g, '\\mu'], [/ν/g, '\\nu'], [/ξ/g, '\\xi'], [/ο/g, '\\omicron'],
  [/π/g, '\\pi'], [/ρ/g, '\\rho'], [/σ/g, '\\sigma'], [/τ/g, '\\tau'], [/υ/g, '\\upsilon'],
  [/φ/g, '\\phi'], [/χ/g, '\\chi'], [/ψ/g, '\\psi'], [/ω/g, '\\omega'],
  [/Γ/g, '\\Gamma'], [/Δ/g, '\\Delta'], [/Θ/g, '\\Theta'], [/Λ/g, '\\Lambda'], [/Ξ/g, '\\Xi'],
  [/Π/g, '\\Pi'], [/Σ/g, '\\Sigma'], [/Φ/g, '\\Phi'], [/Ψ/g, '\\Psi'], [/Ω/g, '\\Omega'],
  [/∑/g, '\\sum'], [/∫/g, '\\int'], [/∬/g, '\\iint'], [/∭/g, '\\iiint'], [/∮/g, '\\oint'],
  [/∞/g, '\\infty'], [/±/g, '\\pm'], [/∓/g, '\\mp'], [/≤/g, '\\leq'], [/≥/g, '\\geq'],
  [/≠/g, '\\neq'], [/≈/g, '\\approx'], [/∝/g, '\\propto'], [/≡/g, '\\equiv'], [/≅/g, '\\cong'], [/∼/g, '\\sim'],
  [/×/g, '\\times'], [/÷/g, '\\div'], [/·/g, '\\cdot'], [/∗/g, '\\ast'], [/∘/g, '\\circ'],
  [/∂/g, '\\partial'], [/∇/g, '\\nabla'], [/√/g, '\\sqrt'], [/∛/g, '\\sqrt[3]'], [/∜/g, '\\sqrt[4]'],
  [/∈/g, '\\in'], [/∉/g, '\\notin'], [/∋/g, '\\ni'], [/∌/g, '\\not\\ni'], [/⊂/g, '\\subset'], [/⊃/g, '\\supset'], [/⊄/g, '\\not\\subset'], [/⊅/g, '\\not\\supset'],
  [/⊆/g, '\\subseteq'], [/⊇/g, '\\supseteq'], [/∩/g, '\\cap'], [/∪/g, '\\cup'], [/∀/g, '\\forall'], [/∃/g, '\\exists'], [/∄/g, '\\nexists'], [/∅/g, '\\emptyset'],
  [/¬/g, '\\neg'], [/∧/g, '\\land'], [/∨/g, '\\lor'], [/⊕/g, '\\oplus'], [/⊗/g, '\\otimes'],
  [/→/g, '\\rightarrow'], [/←/g, '\\leftarrow'], [/↔/g, '\\leftrightarrow'], [/⇒/g, '\\Rightarrow'], [/⇐/g, '\\Leftarrow'], [/⇔/g, '\\Leftrightarrow'],
  [/↑/g, '\\uparrow'], [/↓/g, '\\downarrow'], [/↗/g, '\\nearrow'], [/↘/g, '\\searrow'],
  [/⊥/g, '\\perp'], [/∥/g, '\\parallel'], [/∦/g, '\\not\\parallel'], [/∠/g, '\\angle'], [/∡/g, '\\measuredangle'], [/∢/g, '\\sphericalangle'],
  [/△/g, '\\triangle'], [/□/g, '\\square'], [/◊/g, '\\lozenge'], [/°/g, '^\\circ'], [/′/g, '^\\prime'], [/″/g, '^{\\prime\\prime}'],
  [/⁰/g, '^{0}'], [/¹/g, '^{1}'], [/²/g, '^{2}'], [/³/g, '^{3}'], [/⁴/g, '^{4}'], [/⁵/g, '^{5}'], [/⁶/g, '^{6}'], [/⁷/g, '^{7}'], [/⁸/g, '^{8}'], [/⁹/g, '^{9}'],
  [/₀/g, '_{0}'], [/₁/g, '_{1}'], [/₂/g, '_{2}'], [/₃/g, '_{3}'], [/₄/g, '_{4}'], [/₅/g, '_{5}'], [/₆/g, '_{6}'], [/₇/g, '_{7}'], [/₈/g, '_{8}'], [/₉/g, '_{9}'],
  [/½/g, '\\frac{1}{2}'], [/⅓/g, '\\frac{1}{3}'], [/⅔/g, '\\frac{2}{3}'], [/¼/g, '\\frac{1}{4}'], [/¾/g, '\\frac{3}{4}'], [/⅕/g, '\\frac{1}{5}'],
];

const UNICODE_MATH_PATTERN = /[∑∫∬∭∮√∛∜π∞±∓≤≥≠≈∝≡≅∼×÷·∗∘∂∇αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ∈∉∋∌⊂⊃⊆⊇⊄⊅∩∪∀∃∄∅¬∧∨⊕⊗→←↔⇒⇐⇔↑↓↗↘⊥∥∦∠∡∢△□◊°′″⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕]/;
const BARE_LATEX_CMD = /\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|sum|int|iint|iiint|oint|infty|pm|mp|leq|geq|neq|approx|propto|equiv|cong|sim|times|div|cdot|ast|circ|partial|nabla|sqrt|surd|in|notin|ni|subset|supset|subseteq|supseteq|cap|cup|forall|exists|nexists|emptyset|neg|land|lor|oplus|otimes|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|uparrow|downarrow|nearrow|searrow|perp|parallel|angle|measuredangle|triangle|square|lozenge|frac|text|mathbb|mathbf|boldsymbol|overline|underline|hat|tilde|vec|bar|dot|ddot|check|breve|acute|grave|mathring|overbrace|underbrace|overset|underset|boxed|left|right|middle|begin|end)\b/;

function tokenizeMath(text) {
  if (!text) return [];
  const tokens = [];
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    const raw = match[0];
    tokens.push(raw.startsWith('$$') ? { type: 'block', content: raw.slice(2, -2) } : { type: 'inline', content: raw.slice(1, -1) });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', content: text.slice(lastIndex) });
  return tokens;
}

function buildFromTokens(tokens) {
  return tokens.map((token) => token.type === 'inline' ? `$${token.content}$` : token.type === 'block' ? `$$${token.content}$$` : token.content).join('');
}

function mergeAdjacentMath(text) {
  const tokens = tokenizeMath(text);
  if (tokens.length <= 1) return text;
  const merged = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!merged.length) { merged.push({ ...token }); continue; }
    const last = merged[merged.length - 1];
    if (last.type === 'inline' && token.type === 'inline') last.content += ' ' + token.content;
    else if (last.type === 'inline' && token.type === 'text' && /^\s+$/.test(token.content) && tokens[i + 1]?.type === 'inline') last.content += token.content;
    else merged.push({ ...token });
  }
  return buildFromTokens(merged);
}

export function normalizeUnicodeToLatex(text) {
  if (!text) return text;
  const tokens = tokenizeMath(text);
  const processed = tokens.map((token) => {
    if (token.type === 'inline' || token.type === 'block') {
      let content = token.content.replace(/(?:\\?sqrt|√)\(([^)]+)\)/gi, '\\sqrt{$1}');
      content = content.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}').replace(/√/g, '\\surd');
      for (const [pattern, replacement] of UNICODE_TO_LATEX) content = content.replace(pattern, replacement);
      return { type: token.type, content };
    }
    let content = token.content.replace(/(?:\\?sqrt|√)\(([^)]+)\)/gi, '$\\sqrt{$1}$').replace(/√([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$').replace(/√/g, '$\\surd$');
    for (const [pattern, replacement] of UNICODE_TO_LATEX) content = content.replace(pattern, '$' + replacement + '$');
    if (/[a-zA-Z0-9](\^|_)[a-zA-Z0-9]/.test(content)) content = content.replace(/\b([a-zA-Z0-9]+(\^|_)[a-zA-Z0-9]+)\b/g, '$$$1$$');
    if (/\|[a-zA-Z0-9]+\|/.test(content)) content = content.replace(/\|([a-zA-Z0-9]+)\|/g, '$$|$1|$$');
    if (BARE_LATEX_CMD.test(content)) content = wrapBareLatexCommands(content);
    return { type: 'text', content };
  });
  return mergeAdjacentMath(buildFromTokens(processed));
}

export function normalizeWordMangledMath(text) {
  if (!text) return text;
  let result = text;
  result = result.replace(/[〚〛]/g, '$');
  result = result.replace(/█/g, '');
  result = result.replace(/\\(neg|land|lor|forall|exists|nexists|in|notin|subseteq|supseteq|subset|supset|cap|cup|leq|geq|neq|approx|equiv|cong|sim|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|times|div|cdot|pm|mp|partial|nabla|infty|sum|int|sqrt)(?=[A-Za-zÀ-ỹ0-9])/g, '\\$1 ');
  result = result.replace(/log_(\d+)/gi, '\\log_{$1}');
  result = result.replace(/\(([^/]+)\/([^@]+)@([^)]+)\)/g, '{$1 \\frac{2}{3}}_{$3}');
  result = result.replace(/@(\d+)/g, '_{$1}');
  result = result.replace(/\(([^/]+)\/([^)]+)\)/g, '\\frac{$1}{$2}');
  return result;
}

function wrapBareLatexCommands(text) {
  const parts = [];
  const cmdRegex = /(\\[a-zA-Z]+(?:\{[^}]*\})?(?:\s*[a-zA-Z0-9_^{}\\,\.\s<>=+\-*/|]*)?)/g;
  let lastIndex = 0;
  let match;
  while ((match = cmdRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    let latex = match[1].trim();
    const trailingMatch = latex.match(/([.,;:!?\s]+)$/);
    let trailing = '';
    if (trailingMatch) { trailing = trailingMatch[1]; latex = latex.slice(0, -trailing.length); }
    parts.push(`$${latex}$${trailing}`);
    lastIndex = cmdRegex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.join('');
}

export { tokenizeMath, UNICODE_MATH_PATTERN, BARE_LATEX_CMD };
