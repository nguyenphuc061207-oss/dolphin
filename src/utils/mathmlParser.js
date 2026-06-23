/**
 * Dolphin – MathML/MathType → LaTeX Converter
 *
 * Converts MathML (Presentation MathML) to LaTeX.
 * MathType plugin for Word exports formulas as MathML inside DOCX.
 *
 * Supports:
 *   - Presentation MathML elements: mi, mn, mo, mrow, mfrac, msqrt, mroot,
 *     msup, msub, msubsup, mover, munder, munderover, mtable, mtr, mtd,
 *     mtext, mspace, mfenced, menclose, mphantom, merror, mstyle
 *   - MathType-specific patterns and OLE fallback detection
 *   - Inline MathML in text strings: <math>...</math>
 */

// ─── Operator mapping: MathML operator → LaTeX ──────────────────────────────

const MO_MAP = {
    // Arithmetic
    '+': '+', '-': '-', '=': '=',
    '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div',
    '⋅': '\\cdot', '∗': '\\ast', '∘': '\\circ',

    // Comparison
    '<': '<', '>': '>', '≤': '\\leq', '≥': '\\geq',
    '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim',
    '≅': '\\cong', '≃': '\\simeq', '≪': '\\ll', '≫': '\\gg',
    '≺': '\\prec', '≻': '\\succ', '≼': '\\preceq', '≽': '\\succeq',
    '∝': '\\propto', '⊥': '\\perp', '∥': '\\parallel',

    // Arrows
    '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
    '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
    '↦': '\\mapsto', '↪': '\\hookrightarrow',
    '⟹': '\\implies', '⟺': '\\iff',

    // Set & Logic
    '∈': '\\in', '∉': '\\notin', '∋': '\\ni',
    '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
    '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
    '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
    '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists',

    // Calculus & Large Operators
    '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty',
    '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
    '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',
    '⋃': '\\bigcup', '⋂': '\\bigcap',

    // Grouping & Delimiters
    '(': '(', ')': ')',
    '[': '[', ']': ']',
    '{': '\\{', '}': '\\}',
    '|': '|', '‖': '\\|',
    '⟨': '\\langle', '⟩': '\\rangle',
    '⌈': '\\lceil', '⌉': '\\rceil',
    '⌊': '\\lfloor', '⌋': '\\rfloor',

    // Dots
    '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots',

    // Misc
    '°': '^{\\circ}', '′': "'", '″': "''",
    '∠': '\\angle', '△': '\\triangle',
    '√': '\\sqrt',
    '!': '!', ',': ',', ';': ';', ':': ':',
    '.': '.', '⁡': '',   // invisible function application
    '⁢': '',              // invisible times
    '⁣': '',              // invisible separator
};

// ─── Mi (identifier) mapping for multi-char names ───────────────────────────

const MI_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth',
    'log', 'ln', 'lg', 'exp',
    'lim', 'limsup', 'liminf',
    'max', 'min', 'sup', 'inf',
    'det', 'dim', 'ker', 'deg', 'gcd',
    'arg', 'hom', 'Pr',
]);

// ─── Greek letter names → LaTeX ─────────────────────────────────────────────

const GREEK_MAP = {
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
    'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
    'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    'ϕ': '\\varphi', 'ϵ': '\\varepsilon', 'ϑ': '\\vartheta',
    'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
    'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi',
    'Ψ': '\\Psi', 'Ω': '\\Omega',
    'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}',
    'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
};

// ─── Accent character → LaTeX command ───────────────────────────────────────

const ACCENT_MAP = {
    '̂': '\\hat',      // U+0302
    '̃': '\\tilde',    // U+0303
    '̄': '\\bar',      // U+0304
    '̅': '\\overline', // U+0305
    '̆': '\\breve',    // U+0306
    '̇': '\\dot',      // U+0307
    '̈': '\\ddot',     // U+0308
    '̌': '\\check',    // U+030C
    '⃗': '\\vec',      // U+20D7
    '→': '\\vec',
    '¯': '\\overline',
    '^': '\\hat',
    '~': '\\tilde',
    '⏞': '\\overbrace',
    '⏟': '\\underbrace',
};

// ─── Core converter: MathML DOM → LaTeX ─────────────────────────────────────

function nodeToLatex(node) {
    if (!node) return '';

    if (node.nodeType === 3) {
        const text = node.textContent.trim();
        return GREEK_MAP[text] || text;
    }

    if (node.nodeType !== 1) return '';

    const tag = node.localName || node.nodeName.replace(/^.*:/, '');
    const children = Array.from(node.childNodes).filter(n =>
        n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())
    );

    const childLatex = () => children.map(nodeToLatex).join('');
    const childAt = (idx) => children[idx] ? nodeToLatex(children[idx]) : '';

    switch (tag) {
        case 'math':
            return childLatex();

        case 'mrow':
        case 'mstyle':
        case 'merror':
        case 'mpadded':
            return childLatex();

        case 'mi': {
            const text = node.textContent.trim();
            if (!text) return '';
            if (GREEK_MAP[text]) return GREEK_MAP[text];
            if (MI_FUNCTIONS.has(text)) return `\\${text}`;

            const variant = node.getAttribute('mathvariant');
            if (variant === 'bold') return `\\mathbf{${text}}`;
            if (variant === 'bold-italic') return `\\boldsymbol{${text}}`;
            if (variant === 'double-struck') return `\\mathbb{${text}}`;
            if (variant === 'fraktur' || variant === 'bold-fraktur') return `\\mathfrak{${text}}`;
            if (variant === 'script' || variant === 'bold-script') return `\\mathcal{${text}}`;
            if (variant === 'monospace') return `\\mathtt{${text}}`;
            if (variant === 'sans-serif') return `\\mathsf{${text}}`;
            if (variant === 'normal') return `\\mathrm{${text}}`;

            if (text.length > 1 && /^[a-zA-Z]+$/.test(text)) {
                return `\\mathrm{${text}}`;
            }

            return text;
        }

        case 'mn':
            return node.textContent.trim();

        case 'mo': {
            const text = node.textContent.trim();
            return MO_MAP[text] ?? text;
        }

        case 'mtext': {
            const text = node.textContent;
            if (!text.trim()) return text.includes(' ') ? '\\,' : '';
            return `\\text{${text}}`;
        }

        case 'mspace': {
            const width = node.getAttribute('width');
            if (width) {
                const em = parseFloat(width);
                if (em <= 0.1) return '\\,';
                if (em <= 0.22) return '\\:';
                if (em <= 0.28) return '\\;';
                if (em <= 0.5) return '\\quad';
                return '\\qquad';
            }
            return '\\;';
        }

        case 'mfrac': {
            const num = childAt(0);
            const den = childAt(1);
            const lineThickness = node.getAttribute('linethickness');
            if (lineThickness === '0') {
                return `\\binom{${num}}{${den}}`;
            }
            return `\\frac{${num}}{${den}}`;
        }

        case 'msqrt':
            return `\\sqrt{${childLatex()}}`;

        case 'mroot': {
            const base = childAt(0);
            const index = childAt(1);
            if (index && index !== '2') {
                return `\\sqrt[${index}]{${base}}`;
            }
            return `\\sqrt{${base}}`;
        }

        case 'msup': {
            const base = childAt(0);
            const sup = childAt(1);
            return `${base}^{${sup}}`;
        }

        case 'msub': {
            const base = childAt(0);
            const sub = childAt(1);
            return `${base}_{${sub}}`;
        }

        case 'msubsup': {
            const base = childAt(0);
            const sub = childAt(1);
            const sup = childAt(2);
            return `${base}_{${sub}}^{${sup}}`;
        }

        case 'mmultiscripts': {
            let base = '';
            let postSub = '', postSup = '';
            let preSub = '', preSup = '';
            let phase = 'post';
            let idx = 0;

            for (const child of children) {
                const childTag = child.localName || child.nodeName.replace(/^.*:/, '');
                if (idx === 0) {
                    base = nodeToLatex(child);
                    idx++;
                    continue;
                }
                if (childTag === 'mprescripts') {
                    phase = 'pre';
                    continue;
                }
                if (childTag === 'none') {
                    idx++;
                    continue;
                }

                const val = nodeToLatex(child);
                if (phase === 'post') {
                    if (idx % 2 === 1) postSub = val;
                    else postSup = val;
                } else {
                    if (idx % 2 === 1) preSub = val;
                    else preSup = val;
                }
                idx++;
            }

            let result = '';
            if (preSub || preSup) {
                result += `{}_{${preSub}}^{${preSup}}`;
            }
            result += base;
            if (postSub) result += `_{${postSub}}`;
            if (postSup) result += `^{${postSup}}`;
            return result;
        }

        case 'mover': {
            const base = childAt(0);
            const over = childAt(1);
            const accentAttr = node.getAttribute('accent');
            if (accentAttr === 'true' || (over && over.length === 1 && ACCENT_MAP[over])) {
                const cmd = ACCENT_MAP[over] || '\\hat';
                return `${cmd}{${base}}`;
            }

            if (over === '⏞') return `\\overbrace{${base}}`;
            if (over === '⏜') return `\\overset{\\frown}{${base}}`;
            if (over === '¯' || over === '‾') return `\\overline{${base}}`;
            if (over === '→') return `\\overrightarrow{${base}}`;
            if (over === '←') return `\\overleftarrow{${base}}`;
            if (over === '↔') return `\\overleftrightarrow{${base}}`;
            if (over === '̂') return `\\hat{${base}}`;
            if (over === '~' || over === '̃') return `\\tilde{${base}}`;
            if (over === '̇') return `\\dot{${base}}`;
            if (over === '̈') return `\\ddot{${base}}`;

            return `\\overset{${over}}{${base}}`;
        }

        case 'munder': {
            const base = childAt(0);
            const under = childAt(1);

            if (under === '⏟') return `\\underbrace{${base}}`;
            if (under === '_' || under === '̲') return `\\underline{${base}}`;

            if (/^\\(lim|max|min|sup|inf|limsup|liminf)$/.test(base)) {
                return `${base}_{${under}}`;
            }

            return `\\underset{${under}}{${base}}`;
        }

        case 'munderover': {
            const base = childAt(0);
            const under = childAt(1);
            const over = childAt(2);

            if (/^\\(sum|prod|int|oint|bigcup|bigcap|coprod)$/.test(base)) {
                return `${base}_{${under}}^{${over}}`;
            }

            return `\\underset{${under}}{\\overset{${over}}{${base}}}`;
        }

        case 'mfenced': {
            let open = node.getAttribute('open') || '(';
            let close = node.getAttribute('close') || ')';
            const separators = node.getAttribute('separators') || ',';

            const delimMap = {
                '{': '\\{', '}': '\\}',
                '⟨': '\\langle', '⟩': '\\rangle',
                '‖': '\\|', '|': '|',
                '⌈': '\\lceil', '⌉': '\\rceil',
                '⌊': '\\lfloor', '⌋': '\\rfloor',
            };
            const lOpen = delimMap[open] || open;
            const lClose = delimMap[close] || close;

            const sep = separators.trim()[0] || ',';
            const parts = children.map(nodeToLatex);

            return `\\left${lOpen}${parts.join(` ${sep} `)}\\right${lClose}`;
        }

        case 'mtable': {
            const parent = node.parentNode;
            const parentTag = parent ? (parent.localName || parent.nodeName.replace(/^.*:/, '')) : '';
            let env = 'matrix';

            if (parentTag === 'mfenced') {
                const open = parent.getAttribute('open') || '(';
                const envMap = {
                    '(': 'pmatrix', '[': 'bmatrix', '{': 'Bmatrix',
                    '|': 'vmatrix', '‖': 'Vmatrix',
                };
                env = envMap[open] || 'pmatrix';
            }

            const rows = children.filter(c => {
                const t = c.localName || c.nodeName.replace(/^.*:/, '');
                return t === 'mtr' || t === 'mlabeledtr';
            });

            const latexRows = rows.map(row => {
                const cells = Array.from(row.childNodes).filter(c => {
                    const t = c.localName || c.nodeName.replace(/^.*:/, '');
                    return t === 'mtd';
                });
                return cells.map(nodeToLatex).join(' & ');
            });

            return `\\begin{${env}}${latexRows.join(' \\\\ ')}\\end{${env}}`;
        }

        case 'mtr':
        case 'mlabeledtr':
            return children.map(nodeToLatex).join(' & ');

        case 'mtd':
            return childLatex();

        case 'menclose': {
            const notation = node.getAttribute('notation') || '';
            const inner = childLatex();
            if (notation.includes('box')) return `\\boxed{${inner}}`;
            if (notation.includes('circle')) return `\\boxed{${inner}}`;
            if (notation.includes('horizontalstrike')) return `\\cancel{${inner}}`;
            if (notation.includes('updiagonalstrike')) return `\\cancel{${inner}}`;
            if (notation.includes('downdiagonalstrike')) return `\\bcancel{${inner}}`;
            if (notation.includes('top')) return `\\overline{${inner}}`;
            if (notation.includes('bottom')) return `\\underline{${inner}}`;
            if (notation.includes('radical')) return `\\sqrt{${inner}}`;
            return inner;
        }

        case 'mphantom':
            return `\\phantom{${childLatex()}}`;

        case 'none':
            return '';

        case 'annotation':
        case 'annotation-xml':
            return '';

        case 'semantics': {
            for (const child of children) {
                const childTag = child.localName || child.nodeName.replace(/^.*:/, '');
                if (childTag !== 'annotation' && childTag !== 'annotation-xml') {
                    return nodeToLatex(child);
                }
            }
            return childLatex();
        }

        default:
            return childLatex();
    }
}

// ─── Main API ───────────────────────────────────────────────────────────────

export function convertMathMLToLatex(mathmlStr) {
    if (!mathmlStr || typeof mathmlStr !== 'string') return '';

    try {
        let cleaned = mathmlStr.trim();
        cleaned = cleaned.replace(/<\/?m:/g, (m) => m.replace('m:', ''));
        cleaned = cleaned.replace(/<\/?mml:/g, (m) => m.replace('mml:', ''));

        const parser = new DOMParser();
        const doc = parser.parseFromString(cleaned, 'application/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.warn('MathML parse error:', parseError.textContent);
            return '';
        }

        const mathNode = doc.querySelector('math') || doc.documentElement;
        return nodeToLatex(mathNode);
    } catch (err) {
        console.warn('MathML conversion error:', err);
        return '';
    }
}

export function extractMathMLFromText(text) {
    if (!text) return text;

    const mathRegex = /<(?:m:|mml:)?math\b[^>]*>[\s\S]*?<\/(?:m:|mml:)?math>/gi;

    return text.replace(mathRegex, (match) => {
        const latex = convertMathMLToLatex(match);
        if (latex) {
            const isDisplay = /display\s*=\s*["']block["']/i.test(match);
            return isDisplay ? `$$${latex}$$` : `$${latex}$`;
        }
        return match;
    });
}

export function extractMathTypeFromDocx(xmlDoc) {
    if (!xmlDoc) return;

    const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
    const NS_MATHML = 'http://www.w3.org/1998/Math/MathML';

    const replacements = [];

    const altContents = xmlDoc.getElementsByTagNameNS(NS_MC, 'AlternateContent');
    for (const ac of altContents) {
        const choices = ac.getElementsByTagNameNS(NS_MC, 'Choice');
        const fallbacks = ac.getElementsByTagNameNS(NS_MC, 'Fallback');

        let mathNode = null;

        for (const choice of choices) {
            const requires = choice.getAttribute('Requires') || '';
            if (requires.toLowerCase().includes('mathml') || requires.toLowerCase().includes('math')) {
                mathNode = choice.getElementsByTagNameNS(NS_MATHML, 'math')[0];
                if (!mathNode) {
                    mathNode = choice.querySelector('math');
                }
                if (mathNode) break;
            }
        }

        if (!mathNode) {
            for (const fb of fallbacks) {
                mathNode = fb.getElementsByTagNameNS(NS_MATHML, 'math')[0];
                if (!mathNode) {
                    mathNode = fb.querySelector('math');
                }
                if (mathNode) break;
            }
        }

        if (mathNode) {
            const serializer = new XMLSerializer();
            const mathmlStr = serializer.serializeToString(mathNode);
            const latex = convertMathMLToLatex(mathmlStr);
            if (latex) {
                replacements.push({ originalNode: ac, latex });
            }
        }
    }

    const directMathNodes = xmlDoc.getElementsByTagNameNS(NS_MATHML, 'math');
    for (const mathNode of directMathNodes) {
        let parent = mathNode.parentNode;
        let insideAC = false;
        while (parent) {
            if (parent.localName === 'AlternateContent') {
                insideAC = true;
                break;
            }
            parent = parent.parentNode;
        }
        if (insideAC) continue;

        const serializer = new XMLSerializer();
        const mathmlStr = serializer.serializeToString(mathNode);
        const latex = convertMathMLToLatex(mathmlStr);
        if (latex) {
            replacements.push({ originalNode: mathNode, latex });
        }
    }

    for (const { originalNode, latex } of replacements) {
        const doc = originalNode.ownerDocument;
        const rNode = doc.createElementNS(NS_W, 'w:r');
        const tNode = doc.createElementNS(NS_W, 'w:t');
        tNode.setAttribute('xml:space', 'preserve');
        tNode.textContent = ` $${latex}$ `;
        rNode.appendChild(tNode);

        if (originalNode.parentNode) {
            originalNode.parentNode.replaceChild(rNode, originalNode);
        }
    }
}

export function containsMathML(text) {
    if (!text) return false;
    return /<(?:m:|mml:)?math\b/i.test(text);
}
