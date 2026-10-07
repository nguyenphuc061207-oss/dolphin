/**
 * Dolphin – DOCX → rich HTML extractor
 *
 * Reads word/document.xml directly (JSZip + DOMParser) and produces one
 * `<p>…</p>` per paragraph. Preserves bold / italic / underline / strike /
 * sub / sup / highlight / monospace (code) / tabs / line breaks, converts math
 * (OMML + MathType MathML) to `$LaTeX$` and images to `[IMG: data:…]`.
 * Text colour is intentionally ignored so everything renders black.
 */
import JSZip from 'jszip';
import { extractMathTypeFromDocx } from '@/shared/math/mathmlParser';
import { escapeHtml } from '@/shared/utils/richText';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const MONO_FONT = /(consolas|courier|menlo|monaco|lucida console|source code|fira (code|mono)|jetbrains|dejavu sans mono|cascadia|inconsolata|monospace|andale mono|roboto mono|ubuntu mono)/i;
const CODE_STYLE = /(code|preformatted|source ?code|verbatim)/i;

const wVal = (el) => el?.getAttribute('w:val') ?? el?.getAttributeNS(NS_W, 'val') ?? null;
const child = (node, name) => Array.from(node.childNodes).find((n) => n.localName === name) || null;
const isOff = (el) => {
    const v = wVal(el);
    return v === '0' || v === 'false' || v === 'off';
};

// ── OMML → LaTeX (moved from TeacherDashboard) ───────────────────────────
const toLatex = (() => {
        // Namespace constants
        const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

        // ── Utility helpers ──────────────────────────────────────────────────────

        const getMVal = (node) =>
            node.getAttributeNS(NS_M, 'val') ||
            node.getAttribute('m:val') ||
            node.getAttribute('val') ||
            '';

        const firstChild = (node, name) =>
            Array.from(node.childNodes).find((n) => n.localName === name) || null;

        const allChildren = (node, name) =>
            Array.from(node.childNodes).filter((n) => n.localName === name);

        // ── Unicode → LaTeX symbol map ───────────────────────────────────────────

        const SYMBOL_MAP = {
            // ── Greek lowercase ──────────────────────────────────────────────────
            'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma',
            'δ': '\\delta', 'ε': '\\epsilon', 'ζ': '\\zeta',
            'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota',
            'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
            'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi',
            'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
            'υ': '\\upsilon', 'φ': '\\phi', 'χ': '\\chi',
            'ψ': '\\psi', 'ω': '\\omega',
            // Variants
            'ϕ': '\\varphi', 'ϵ': '\\varepsilon', 'ϑ': '\\vartheta',
            'ϰ': '\\varkappa', 'ϱ': '\\varrho', 'ς': '\\varsigma',
            'ϖ': '\\varpi',

            // ── Greek uppercase ──────────────────────────────────────────────────
            'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
            'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Υ': '\\Upsilon',
            'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',

            // ── Arithmetic operators ─────────────────────────────────────────────
            '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div',
            '∗': '\\ast', '⋅': '\\cdot', '∘': '\\circ', '∙': '\\bullet',
            '⊕': '\\oplus', '⊗': '\\otimes', '⊘': '\\oslash', '⊙': '\\odot',
            '⊞': '\\boxplus', '⊟': '\\boxminus', '⊠': '\\boxtimes', '⋊': '\\rtimes',
            '⋉': '\\ltimes', '⋋': '\\leftthreetimes', '⋌': '\\rightthreetimes',

            // ── Comparison & relations ───────────────────────────────────────────
            '≠': '\\neq', '≤': '\\leq', '≥': '\\geq',
            '≪': '\\ll', '≫': '\\gg', '≦': '\\leqq', '≧': '\\geqq',
            '≲': '\\lesssim', '≳': '\\gtrsim', '≶': '\\lessgtr', '≷': '\\gtrless',
            '≈': '\\approx', '≅': '\\cong', '≡': '\\equiv', '∼': '\\sim',
            '≃': '\\simeq', '≐': '\\doteq', '≑': '\\doteqdot',
            '≺': '\\prec', '≻': '\\succ', '≼': '\\preceq', '≽': '\\succeq',
            '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
            '⊊': '\\subsetneq', '⊋': '\\supsetneq',
            '∈': '\\in', '∉': '\\notin', '∋': '\\ni',
            '∝': '\\propto', '⊥': '\\perp', '∥': '\\parallel', '∦': '\\nparallel',
            '≮': '\\not<', '≯': '\\not>', '≢': '\\not\\equiv',
            '⊄': '\\not\\subset', '⊅': '\\not\\supset',

            // ── Arrows ──────────────────────────────────────────────────────────
            '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
            '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
            '↑': '\\uparrow', '↓': '\\downarrow', '↕': '\\updownarrow',
            '⇑': '\\Uparrow', '⇓': '\\Downarrow', '⇕': '\\Updownarrow',
            '↦': '\\mapsto', '↪': '\\hookrightarrow', '↩': '\\hookleftarrow',
            '↠': '\\twoheadrightarrow', '↞': '\\twoheadleftarrow',
            '⟹': '\\implies', '⟺': '\\iff',
            '⟶': '\\longrightarrow', '⟵': '\\longleftarrow', '⟷': '\\longleftrightarrow',
            '⟼': '\\longmapsto',
            '⇝': '\\rightsquigarrow', '↝': '\\rightsquigarrow',
            '↗': '\\nearrow', '↘': '\\searrow',
            '↙': '\\swarrow', '↖': '\\nwarrow',
            '⇀': '\\rightharpoonup', '↼': '\\leftharpoonup',
            '⇁': '\\rightharpoondown', '↽': '\\leftharpoondown',
            '⇌': '\\rightleftharpoons', '⇋': '\\leftrightharpoons',

            // ── Set & logic ──────────────────────────────────────────────────────
            '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∖': '\\setminus',
            '△': '\\triangle', '▽': '\\triangledown',
            '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
            '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists',
            '⊢': '\\vdash', '⊣': '\\dashv', '⊨': '\\models', '⊩': '\\Vdash',
            '⊻': '\\veebar', '⊼': '\\barwedge', '⊽': '\\barvee',

            // ── Calculus / Analysis ──────────────────────────────────────────────
            '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty',
            '℘': '\\wp', 'ℑ': '\\Im', 'ℜ': '\\Re',
            '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
            '∮': '\\oint', '∯': '\\oiint', '∰': '\\oiiint',
            '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',

            // ── Dots & ellipsis ──────────────────────────────────────────────────
            '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots', '⋰': '\\iddots',
            '…': '\\ldots', '·': '\\cdot',

            // ── Number sets (blackboard bold) ────────────────────────────────────
            'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}',
            'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}', 'ℍ': '\\mathbb{H}',
            'ℙ': '\\mathbb{P}', '𝔽': '\\mathbb{F}',

            // ── Fraktur ──────────────────────────────────────────────────────────
            '𝔄': '\\mathfrak{A}', '𝔅': '\\mathfrak{B}', 'ℭ': '\\mathfrak{C}',
            '𝔊': '\\mathfrak{G}', '𝔏': '\\mathfrak{L}', '𝔐': '\\mathfrak{M}',
            '𝔑': '\\mathfrak{N}', '𝔓': '\\mathfrak{P}', '𝔔': '\\mathfrak{Q}',
            '𝔖': '\\mathfrak{S}', '𝔗': '\\mathfrak{T}', '𝔘': '\\mathfrak{U}',
            '𝔙': '\\mathfrak{V}', '𝔚': '\\mathfrak{W}', '𝔛': '\\mathfrak{X}',
            '𝔜': '\\mathfrak{Y}', 'ℨ': '\\mathfrak{Z}',

            // ── Geometry / misc ──────────────────────────────────────────────────
            '∠': '\\angle', '∡': '\\measuredangle', '∢': '\\sphericalangle',
            '√': '\\sqrt', '∴': '\\therefore', '∵': '\\because',
            '†': '\\dagger', '‡': '\\ddagger', '|': '|',
            'ℓ': '\\ell', '℧': '\\mho',
            '°': '^{\\circ}', '′': "'", '″': "''", '‴': "'''",

            // ── Fence characters ─────────────────────────────────────────────────
            '⟨': '\\langle', '⟩': '\\rangle',
            '⌈': '\\lceil', '⌉': '\\rceil',
            '⌊': '\\lfloor', '⌋': '\\rfloor',

            // ── Special symbols ──────────────────────────────────────────────────
            '♦': '\\diamond', '♠': '\\spadesuit', '♥': '\\heartsuit', '♣': '\\clubsuit',
            '★': '\\bigstar', '☆': '\\star',
            '©': '\\copyright', '®': '\\circledR', '™': '\\text{\\texttrademark}',
            'Å': '\\text{\r\nÅ}',
        };

        /**
         * Chuyển một chuỗi Unicode thành LaTeX bằng cách thay thế từng ký tự.
         * Ký tự không có trong map thì giữ nguyên.
         */
        const applySymbolMap = (str) =>
            [...str].map((ch) => SYMBOL_MAP[ch] ?? ch).join('');

        // ── Kiểu rPr (math run properties) ──────────────────────────────────────
        const getRPrStyle = (rPr) => {
            if (!rPr) return null;
            // m:sty val: p=plain text, b=bold, i=italic, bi=bold-italic
            const sty = firstChild(rPr, 'sty');
            if (sty) return getMVal(sty); // 'p' | 'b' | 'i' | 'bi'
            if (firstChild(rPr, 'b')) return 'b';
            if (firstChild(rPr, 'i')) return 'i';
            return null;
        };

        // ── Core converter ───────────────────────────────────────────────────────

        const toLatex = (node) => {
            if (!node || node.nodeType === 3) return '';
            const local = node.localName;
            if (!local) return '';

            const kids = () => Array.from(node.childNodes).map(toLatex).join('');
            const childOf = (n) => (n ? Array.from(n.childNodes).map(toLatex).join('') : '');

            switch (local) {

                // ── Outer wrappers ───────────────────────────────────────────────

                case 'oMathPara':
                    // Block display: wrap each oMath as $$...$$
                    return allChildren(node, 'oMath')
                        .map((n) => `$$${Array.from(n.childNodes).map(toLatex).join('')}$$`)
                        .join('\n');

                case 'oMath':
                    return `$${kids()}$`;

                // ── Text run ─────────────────────────────────────────────────────

                case 'r': {
                    // m:rPr → styling; m:t → actual text content
                    const t = firstChild(node, 't');
                    if (!t) return '';

                    const raw = t.textContent;
                    const mapped = applySymbolMap(raw);

                    const rPr = firstChild(node, 'rPr');
                    const style = getRPrStyle(rPr);

                    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(raw);

                    if (style === 'bi') return `\\boldsymbol{${mapped}}`;
                    if (style === 'b') return `\\mathbf{${mapped}}`;
                    if (style === 'p' || hasVietnamese) return `\\text{${mapped}}`; // plain/roman text
                    // 'i' (italic) is the default math style — no wrapper needed
                    return mapped;
                }

                // ── Fraction ─────────────────────────────────────────────────────

                case 'f': {
                    const fPr = firstChild(node, 'fPr');
                    const typeNode = fPr ? firstChild(fPr, 'type') : null;
                    const typeVal = typeNode ? getMVal(typeNode) : 'bar';
                    const num = firstChild(node, 'num');
                    const den = firstChild(node, 'den');
                    switch (typeVal) {
                        case 'lin': return `${childOf(num)}/${childOf(den)}`;
                        case 'noBar': return `\\binom{${childOf(num)}}{${childOf(den)}}`;
                        case 'skw': return `{}^{${childOf(num)}}\\!\\!/\\!{}_{${childOf(den)}}`;
                        default: return `\\frac{${childOf(num)}}{${childOf(den)}}`;
                    }
                }

                // ── Radical ──────────────────────────────────────────────────────

                case 'rad': {
                    const radPr = firstChild(node, 'radPr');
                    const degHideNode = radPr ? firstChild(radPr, 'degHide') : null;
                    const isHidden = degHideNode
                        ? (getMVal(degHideNode) === '1' || degHideNode.getAttribute('m:val') === '1')
                        : false;
                    const degNode = firstChild(node, 'deg');
                    const eNode = firstChild(node, 'e');
                    const degTex = (!isHidden && degNode) ? childOf(degNode).trim() : '';
                    const eTex = childOf(eNode);
                    return (degTex && degTex !== '2')
                        ? `\\sqrt[${degTex}]{${eTex}}`
                        : `\\sqrt{${eTex}}`;
                }

                // ── Super / Sub / Both ───────────────────────────────────────────

                case 'sSup': {
                    const e = firstChild(node, 'e');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}^{${childOf(sup)}}`;
                }

                case 'sSub': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    return `${childOf(e)}_{${childOf(sub)}}`;
                }

                case 'sSubSup': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}_{${childOf(sub)}}^{${childOf(sup)}}`;
                }

                // ── Pre-subscript/superscript (tensor notation) ──────────────────
                // e.g. {}_{i}^{j} T  →  \tensor notation

                case 'sPre': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    const subTex = sub ? childOf(sub) : '';
                    const supTex = sup ? childOf(sup) : '';
                    // Emit both pre-sub and pre-sup only if present
                    const preSub = subTex ? `{}_{${subTex}}` : '{}';
                    const preSup = supTex ? `^{${supTex}}` : '';
                    return `${preSub}${preSup}${childOf(e)}`;
                }

                // ── N-ary operators (∑ ∏ ∫ ∮ …) ─────────────────────────────────

                case 'nary': {
                    const pr = firstChild(node, 'naryPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const chrVal = chrNode ? getMVal(chrNode) : '∫';
                    const limLocNode = pr ? firstChild(pr, 'limLoc') : null;
                    const limLoc = limLocNode ? getMVal(limLocNode) : 'subSup';
                    const subHideNode = pr ? firstChild(pr, 'subHide') : null;
                    const supHideNode = pr ? firstChild(pr, 'supHide') : null;
                    const subHide = subHideNode
                        ? (getMVal(subHideNode) === '1' || subHideNode.getAttribute('m:val') === '1')
                        : false;
                    const supHide = supHideNode
                        ? (getMVal(supHideNode) === '1' || supHideNode.getAttribute('m:val') === '1')
                        : false;

                    const OP_MAP = {
                        '∑': '\\sum', '\u2211': '\\sum',
                        '∏': '\\prod', '\u220F': '\\prod',
                        '∐': '\\coprod', '\u2210': '\\coprod',
                        '∫': '\\int', '\u222B': '\\int',
                        '∬': '\\iint', '\u222C': '\\iint',
                        '∭': '\\iiint', '\u222D': '\\iiint',
                        '∮': '\\oint', '\u222E': '\\oint',
                        '∯': '\\oiint', '\u222F': '\\oiint',
                        '∰': '\\oiiint', '\u2230': '\\oiiint',
                        '⋃': '\\bigcup', '\u22C3': '\\bigcup',
                        '⋂': '\\bigcap', '\u22C2': '\\bigcap',
                        '⊕': '\\bigoplus',
                        '⊗': '\\bigotimes',
                        '⊙': '\\bigodot',
                        '⊎': '\\biguplus',
                        '⋁': '\\bigvee', '\u22C1': '\\bigvee',
                        '⋀': '\\bigwedge', '\u22C0': '\\bigwedge',
                        '⊔': '\\bigsqcup',
                    };

                    const op = OP_MAP[chrVal]
                        ?? SYMBOL_MAP[chrVal]
                        ?? chrVal
                        ?? '\\int';

                    // \limits forces limits above/below (display-style) rather than inline
                    const limitsFlag = limLoc === 'undOvr' ? '\\limits' : '';

                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    const e = firstChild(node, 'e');

                    return (
                        op +
                        limitsFlag +
                        (!subHide && sub ? `_{${childOf(sub)}}` : '') +
                        (!supHide && sup ? `^{${childOf(sup)}}` : '') +
                        (e ? ` ${childOf(e)}` : '')
                    );
                }

                // ── Delimiter (brackets, norms, …) ───────────────────────────────

                case 'd': {
                    const pr = firstChild(node, 'dPr');
                    let beg = '(', end = ')';
                    if (pr) {
                        const b = firstChild(pr, 'begChr');
                        const en = firstChild(pr, 'endChr');
                        if (b) beg = getMVal(b) || '(';
                        if (en) end = getMVal(en) || ')';
                    }

                    // Separator character between multiple elements (e.g. | in ⟨…|…⟩)
                    const sepNode = pr ? firstChild(pr, 'sepChr') : null;
                    const sepChr = sepNode ? getMVal(sepNode) : ',';
                    const sepTex = sepChr === '|' ? ' \\middle| ' : `, `;

                    // Plain absolute value: empty beg + end means ||
                    if (beg === '' && end === '') { beg = '|'; end = '|'; }

                    const BEG_MAP = {
                        '(': '\\left(', '[': '\\left[',
                        '{': '\\left\\{', '|': '\\left|',
                        '‖': '\\left\\|', '⌈': '\\left\\lceil',
                        '⌊': '\\left\\lfloor', '⟨': '\\left\\langle',
                        '⌜': '\\left\\ulcorner', '⌞': '\\left\\llcorner',
                    };
                    const END_MAP = {
                        ')': '\\right)', ']': '\\right]',
                        '}': '\\right\\}', '|': '\\right|',
                        '‖': '\\right\\|', '⌉': '\\right\\rceil',
                        '⌋': '\\right\\rfloor', '⟩': '\\right\\rangle',
                        '⌝': '\\right\\urcorner', '⌟': '\\right\\lrcorner',
                    };

                    const lBeg = BEG_MAP[beg] ?? `\\left${beg}`;
                    const lEnd = END_MAP[end] ?? `\\right${end}`;

                    const parts = allChildren(node, 'e').map(childOf);
                    return `${lBeg}${parts.join(sepTex)}${lEnd}`;
                }

                // ── Function (sin, cos, lim, …) ──────────────────────────────────

                case 'func': {
                    const fName = firstChild(node, 'fName');
                    const e = firstChild(node, 'e');

                    // All standard LaTeX function names (no \ prefix in source text)
                    const FUNC_NAMES = new Set([
                        'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
                        'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
                        'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
                        'ln', 'log', 'lg', 'exp',
                        'lim', 'limsup', 'liminf', 'varlimsup', 'varliminf',
                        'max', 'min', 'sup', 'inf', 'arg',
                        'gcd', 'lcm', 'det', 'dim', 'ker', 'deg',
                        'hom', 'Hom', 'Pr', 'tr', 'rank',
                    ]);

                    const nameRaw = childOf(fName).trim();
                    // Strip leading backslash if already present
                    const nameClean = nameRaw.replace(/^\\/, '');
                    const nameTex = FUNC_NAMES.has(nameClean)
                        ? `\\${nameClean}`
                        : nameRaw; // keep as-is (could be a letter or custom operator)

                    return `${nameTex}\\left(${childOf(e)}\\right)`;
                }

                // ── Accent (hat, tilde, vec, …) ──────────────────────────────────

                case 'acc': {
                    const pr = firstChild(node, 'accPr');
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const accent = chrNode ? getMVal(chrNode) : '\u0302';

                    const ACC_MAP = {
                        '\u0300': `\\grave{${eTex}}`,        // grave  `
                        '\u0301': `\\acute{${eTex}}`,        // acute  ´
                        '\u0302': `\\hat{${eTex}}`,          // circumflex ^
                        '\u0303': `\\tilde{${eTex}}`,        // tilde  ~
                        '\u0304': `\\bar{${eTex}}`,          // macron ‾
                        '\u0305': `\\bar{${eTex}}`,          // overline
                        '\u0306': `\\breve{${eTex}}`,        // breve  ˘
                        '\u0307': `\\dot{${eTex}}`,          // dot above ·
                        '\u0308': `\\ddot{${eTex}}`,         // diaeresis ¨
                        '\u030A': `\\mathring{${eTex}}`,     // ring above °
                        '\u030B': `\\H{${eTex}}`,            // double acute
                        '\u030C': `\\check{${eTex}}`,        // caron ˇ
                        '\u0323': `\\underdot{${eTex}}`,     // dot below
                        '\u20D7': `\\vec{${eTex}}`,          // combining right arrow
                        '\u2192': `\\vec{${eTex}}`,          // →
                        '\u20D1': `\\vec{${eTex}}`,          // combining right harpoon
                        '\u20DB': `\\dddot{${eTex}}`,        // triple dot
                        '\u20DC': `\\ddddot{${eTex}}`,       // quadruple dot
                        '^': `\\hat{${eTex}}`,
                        '~': `\\tilde{${eTex}}`,
                        '-': `\\bar{${eTex}}`,
                    };
                    return ACC_MAP[accent] ?? `\\hat{${eTex}}`;
                }

                // ── Over/underline ───────────────────────────────────────────────

                case 'bar': {
                    const pr = firstChild(node, 'barPr');
                    const pos = pr ? firstChild(pr, 'pos') : null;
                    const posV = pos ? getMVal(pos) : 'top';
                    const e = firstChild(node, 'e');
                    return posV === 'bot'
                        ? `\\underline{${childOf(e)}}`
                        : `\\overline{${childOf(e)}}`;
                }

                // ── Limit below/above ────────────────────────────────────────────

                case 'limLow': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    const eTex = childOf(e).trim();
                    const limTex = childOf(lim);
                    // Named operators: use subscript directly; otherwise \underset
                    return /^\\?(lim|max|min|sup|inf|limsup|liminf|varlimsup|varliminf)/.test(eTex)
                        ? `${eTex}_{${limTex}}`
                        : `\\underset{${limTex}}{${eTex}}`;
                }

                case 'limUpp': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    const eTex = childOf(e).trim();
                    const limTex = childOf(lim);
                    return /^\\?(lim|max|min|sup|inf)/.test(eTex)
                        ? `${eTex}^{${limTex}}`
                        : `\\overset{${limTex}}{${eTex}}`;
                }

                // ── Matrix ───────────────────────────────────────────────────────

                case 'm': {
                    const pr = firstChild(node, 'mPr');
                    const begNode = pr ? firstChild(pr, 'begChr') : null;
                    const begChr = begNode ? getMVal(begNode) : '(';

                    // Map opening delimiter → LaTeX environment name
                    const ENV_MAP = {
                        '(': 'pmatrix',   // ( … )
                        '[': 'bmatrix',   // [ … ]
                        '{': 'Bmatrix',   // { … }
                        '|': 'vmatrix',   // | … |
                        '‖': 'Vmatrix',   // ‖ … ‖
                        '': 'matrix',    // no delimiters
                    };
                    const env = ENV_MAP[begChr] ?? 'pmatrix';

                    const rows = allChildren(node, 'mr').map((row) =>
                        allChildren(row, 'e').map(childOf).join(' & ')
                    );
                    return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`;
                }

                // ── Equation array (cases, piecewise) ────────────────────────────

                case 'eqArr': {
                    const rows = allChildren(node, 'e').map(childOf);
                    return `\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`;
                }

                // ── Group characters (overbrace, underbrace, arc, arrow) ─────────

                case 'groupChr': {
                    const pr = firstChild(node, 'groupChrPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const posNode = pr ? firstChild(pr, 'pos') : null;
                    const vertNode = pr ? firstChild(pr, 'vertJc') : null;
                    const chr = chrNode ? getMVal(chrNode) : '';
                    const posV = posNode ? getMVal(posNode) : 'bot';
                    const vertJc = vertNode ? getMVal(vertNode) : 'top';
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);

                    // Arc, arrows, overbrace/underbrace
                    const CHR_MAP = {
                        '⌣': `\\overset{\\frown}{${eTex}}`,
                        '\u2322': `\\overset{\\frown}{${eTex}}`,
                        '⌢': `\\overset{\\frown}{${eTex}}`,
                        '⏞': `\\overbrace{${eTex}}`,
                        '⏟': `\\underbrace{${eTex}}`,
                        '⏜': `\\overset{\\frown}{${eTex}}`,
                        '⏝': `\\underset{\\smile}{${eTex}}`,
                        '→': `\\overrightarrow{${eTex}}`,
                        '←': `\\overleftarrow{${eTex}}`,
                        '↔': `\\overleftrightarrow{${eTex}}`,
                        '⇒': `\\overrightarrow{${eTex}}`,
                    };

                    if (CHR_MAP[chr]) return CHR_MAP[chr];

                    // Fallback: position determines over vs under
                    if (posV === 'top' || vertJc === 'top') return `\\overbrace{${eTex}}`;
                    return `\\underbrace{${eTex}}`;
                }

                // ── Box with border ──────────────────────────────────────────────

                case 'borderBox': {
                    const e = firstChild(node, 'e');
                    return `\\boxed{${childOf(e)}}`;
                }

                // ── Phantom ──────────────────────────────────────────────────────

                case 'phant': {
                    const pr = firstChild(node, 'phantPr');
                    const zeroW = pr ? firstChild(pr, 'zeroWid') : null;
                    const zeroH = pr ? firstChild(pr, 'zeroAsc') : null;
                    const showNode = pr ? firstChild(pr, 'show') : null;
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);

                    const isZeroW = zeroW && (getMVal(zeroW) === '1');
                    const isZeroH = zeroH && (getMVal(zeroH) === '1');
                    const isHidden = showNode && (getMVal(showNode) === '0');

                    if (isHidden) return `\\phantom{${eTex}}`;
                    if (isZeroW && isZeroH) return `\\phantom{${eTex}}`;
                    if (isZeroW) return `\\hphantom{${eTex}}`;
                    if (isZeroH) return `\\vphantom{${eTex}}`;
                    return `\\vphantom{${eTex}}`;
                }

                // ── Stacked elements (overset / underset via ctrl chars) ──────────

                case 'ctrl': // rare — pass through children
                    return kids();

                // ── Pass-through containers ──────────────────────────────────────

                case 'num': case 'den':
                case 'e': case 'sup': case 'sub':
                case 'fName': case 'lim': case 'deg':
                case 'mr': case 'sPrePr':
                    return kids();

                default:
                    return kids();
            }
        };

        return toLatex;
})();

// ── Numbering (auto-numbered "Câu 1.", "A." lists) ───────────────────────
const toRoman = (n) => {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out;
};

const formatCount = (fmt, n) => {
    switch (fmt) {
        case 'upperLetter': return String.fromCharCode(65 + ((n - 1) % 26));
        case 'lowerLetter': return String.fromCharCode(97 + ((n - 1) % 26));
        case 'upperRoman': return toRoman(n);
        case 'lowerRoman': return toRoman(n).toLowerCase();
        case 'bullet': case 'none': return '';
        default: return String(n);
    }
};

class NumberingDictionary {
    constructor(xmlStr) {
        this.numMap = new Map();      // numId -> abstractNumId
        this.abstractMap = new Map(); // abstractNumId -> { ilvl: { fmt, text, start } }
        this.counters = new Map();    // numId -> number[] (per level)
        if (!xmlStr) return;
        const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
        for (const a of doc.getElementsByTagNameNS('*', 'abstractNum')) {
            const levels = {};
            for (const lvl of a.getElementsByTagNameNS('*', 'lvl')) {
                levels[lvl.getAttribute('w:ilvl')] = {
                    fmt: wVal(lvl.getElementsByTagNameNS('*', 'numFmt')[0]) || 'decimal',
                    text: wVal(lvl.getElementsByTagNameNS('*', 'lvlText')[0]) || '',
                    start: parseInt(wVal(lvl.getElementsByTagNameNS('*', 'start')[0]) || '1', 10),
                };
            }
            this.abstractMap.set(a.getAttribute('w:abstractNumId'), levels);
        }
        for (const n of doc.getElementsByTagNameNS('*', 'num')) {
            const aId = wVal(n.getElementsByTagNameNS('*', 'abstractNumId')[0]);
            if (aId) this.numMap.set(n.getAttribute('w:numId'), aId);
        }
    }

    next(numId, ilvl) {
        const levels = this.abstractMap.get(this.numMap.get(numId));
        const lvl = levels?.[ilvl];
        if (!lvl) return '';
        const li = parseInt(ilvl, 10);
        const counters = this.counters.get(numId) || [];
        counters[li] = counters[li] === undefined ? lvl.start : counters[li] + 1;
        for (let k = li + 1; k < counters.length; k++) counters[k] = undefined;
        this.counters.set(numId, counters);
        if (lvl.fmt === 'bullet') return '';
        return lvl.text.replace(/%(\d)/g, (_, d) => {
            const idx = parseInt(d, 10) - 1;
            const l = levels[String(idx)];
            return formatCount(l?.fmt || 'decimal', counters[idx] ?? l?.start ?? 1);
        });
    }
}

// Symbol-font private-use chars (w:sym) → real Unicode for the common ones
const SYMBOL_FONT_MAP = {
    0xB1: '±', 0xB3: '≥', 0xA3: '≤', 0xB9: '≠', 0xBB: '≈', 0xB4: '×', 0xB8: '÷', 0xA5: '∞',
    0xAE: '→', 0xAC: '←', 0xAB: '↔', 0xDE: '⇒', 0xDC: '⇐', 0xDB: '⇔', 0xB0: '°',
    0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x64: 'δ', 0x65: 'ε', 0x71: 'θ', 0x6C: 'λ', 0x6D: 'μ',
    0x70: 'π', 0x73: 'σ', 0x66: 'φ', 0x77: 'ω', 0x44: 'Δ', 0x57: 'Ω', 0x53: 'Σ', 0x50: 'Π',
    0xD6: '√', 0xB7: '•', 0xA7: '♣', 0xD7: '⋅', 0xCE: '∈', 0xC7: '∩', 0xC8: '∪', 0xB6: '∂',
};

const symToChar = (el) => {
    const code = parseInt(el.getAttribute('w:char') || '', 16);
    if (!code) return '';
    const font = (el.getAttribute('w:font') || '').toLowerCase();
    const low = code >= 0xF000 ? code - 0xF000 : code;
    if (font === 'symbol' && SYMBOL_FONT_MAP[low]) return SYMBOL_FONT_MAP[low];
    return String.fromCharCode(font === 'symbol' ? low : code);
};

// ── Run / paragraph extraction ───────────────────────────────────────────
const runProps = (rPr, styleCode) => {
    const p = { b: false, i: false, u: false, s: false, sup: false, sub: false, mark: false, mono: styleCode };
    if (!rPr) return p;
    const on = (name) => {
        const el = child(rPr, name);
        return !!el && !isOff(el);
    };
    p.b = on('b');
    p.i = on('i');
    const u = child(rPr, 'u');
    p.u = !!u && !['none', '0', 'false'].includes(wVal(u));
    p.s = on('strike') || on('dstrike');
    const va = wVal(child(rPr, 'vertAlign'));
    p.sup = va === 'superscript';
    p.sub = va === 'subscript';
    const hl = wVal(child(rPr, 'highlight'));
    p.mark = !!hl && hl !== 'none';
    const fonts = child(rPr, 'rFonts');
    if (fonts) {
        const names = ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'].map((a) => fonts.getAttribute(a) || '');
        if (names.some((n) => MONO_FONT.test(n))) p.mono = true;
    }
    const rStyle = wVal(child(rPr, 'rStyle'));
    if (rStyle && CODE_STYLE.test(rStyle)) p.mono = true;
    return p;
};

const wrap = (html, p, withCode) => {
    if (!html.trim()) return html;
    let out = html;
    if (p.sup) out = `<sup>${out}</sup>`;
    if (p.sub) out = `<sub>${out}</sub>`;
    if (p.i) out = `<i>${out}</i>`;
    if (p.b) out = `<b>${out}</b>`;
    if (p.u) out = `<u>${out}</u>`;
    if (p.s) out = `<s>${out}</s>`;
    if (p.mark) out = `<mark>${out}</mark>`;
    if (withCode && p.mono) out = `<code>${out}</code>`;
    return out;
};

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };

export async function extractDocxToHtml(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlStr = await zip.file('word/document.xml')?.async('string');
    if (!docXmlStr) throw new Error('Không đọc được nội dung file DOCX.');

    // Images
    const imageMap = new Map();
    const relsXmlStr = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (relsXmlStr) {
        const relsDoc = new DOMParser().parseFromString(relsXmlStr, 'application/xml');
        for (const rel of relsDoc.getElementsByTagNameNS('*', 'Relationship')) {
            const rId = rel.getAttribute('Id');
            const target = rel.getAttribute('Target');
            if (!target) continue;
            let imgPath = target;
            if (target.startsWith('/word/')) imgPath = target.substring(1);
            else if (!target.startsWith('word/')) imgPath = 'word/' + target.replace(/^\.\//, '');
            if (!imgPath.startsWith('word/media/')) continue;
            const file = zip.file(imgPath);
            if (!file) continue;
            const ext = target.split('.').pop().toLowerCase();
            imageMap.set(rId, `data:${MIME_BY_EXT[ext] || 'image/png'};base64,${await file.async('base64')}`);
        }
    }

    const numbering = new NumberingDictionary(await zip.file('word/numbering.xml')?.async('string'));

    const xmlDoc = new DOMParser().parseFromString(docXmlStr, 'application/xml');
    if (xmlDoc.querySelector('parsererror')) throw new Error('File DOCX bị lỗi cấu trúc XML.');
    const body = xmlDoc.getElementsByTagNameNS(NS_W, 'body')[0];
    if (!body) throw new Error('Không tìm thấy nội dung trong file DOCX.');

    extractMathTypeFromDocx(xmlDoc);

    const imagesIn = (container) => {
        const found = new Set();
        for (const el of container.getElementsByTagNameNS('*', '*')) {
            const rId = el.localName === 'blip' ? el.getAttribute('r:embed')
                : el.localName === 'imagedata' ? el.getAttribute('r:id') : null;
            if (rId && imageMap.has(rId)) found.add(imageMap.get(rId));
        }
        return Array.from(found).map((src) => `[IMG: ${src}]`).join('');
    };

    // Walk inline content into segments so the caller can detect code paragraphs
    const walkInline = (node, styleCode, out) => {
        for (const n of Array.from(node.childNodes)) {
            if (n.nodeType !== 1) continue;
            const ns = n.namespaceURI;
            const local = n.localName;

            if (ns === NS_M && (local === 'oMath' || local === 'oMathPara')) {
                out.push({ html: toLatex(n).replace(/\n/g, ' '), p: runProps(null, false), isMath: true });
                continue;
            }
            if (ns !== NS_W) continue;

            switch (local) {
                case 'r': {
                    const p = runProps(child(n, 'rPr'), styleCode);
                    let html = '';
                    for (const c of Array.from(n.childNodes)) {
                        const cl = c.localName;
                        if (cl === 't') html += escapeHtml(c.textContent);
                        else if (cl === 'tab') html += '\t';
                        else if (cl === 'br' || cl === 'cr') {
                            if (c.getAttribute('w:type') !== 'page') html += '<br>';
                        } else if (cl === 'noBreakHyphen') html += '‑';
                        else if (cl === 'sym') html += escapeHtml(symToChar(c));
                        else if (cl === 'drawing' || cl === 'pict' || cl === 'object' || cl === 'AlternateContent') {
                            html += imagesIn(c);
                        }
                    }
                    if (html) out.push({ html, p });
                    break;
                }
                case 'hyperlink': case 'smartTag': case 'sdt': case 'sdtContent': case 'ins': case 'fldSimple': case 'customXml':
                    walkInline(n, styleCode, out);
                    break;
                default: break; // pPr, bookmarks, del, proofErr, instrText…
            }
        }
    };

    const paragraphHtml = (pNode) => {
        const pPr = child(pNode, 'pPr');
        const pStyle = wVal(pPr && child(pPr, 'pStyle')) || '';
        const styleCode = CODE_STYLE.test(pStyle);

        let prefix = '';
        const numPr = pPr && child(pPr, 'numPr');
        if (numPr) {
            const ilvl = wVal(child(numPr, 'ilvl')) ?? '0';
            const numId = wVal(child(numPr, 'numId'));
            if (numId && numId !== '0') {
                const s = numbering.next(numId, ilvl);
                if (s) prefix = escapeHtml(s) + ' ';
            }
        }

        const segs = [];
        walkInline(pNode, styleCode, segs);
        const meaningful = segs.filter((s) => s.isMath || s.html.replace(/<br>|\s/g, ''));
        const allMono = !prefix && meaningful.length > 0 && meaningful.every((s) => !s.isMath && s.p.mono);

        if (allMono) {
            const inner = segs.map((s) => wrap(s.html, s.p, false)).join('');
            return `<p><code class="rt-block">${inner}</code></p>`;
        }
        return `<p>${prefix}${segs.map((s) => wrap(s.html, s.p, true)).join('')}</p>`;
    };

    const lines = [];
    const walkBlocks = (container) => {
        for (const node of Array.from(container.childNodes)) {
            const local = node.localName;
            if (local === 'p') lines.push(paragraphHtml(node));
            else if (local === 'tbl') {
                for (const tr of Array.from(node.childNodes).filter((n) => n.localName === 'tr')) {
                    for (const tc of Array.from(tr.childNodes).filter((n) => n.localName === 'tc')) walkBlocks(tc);
                }
            } else if (local === 'sdt') {
                const content = child(node, 'sdtContent');
                if (content) walkBlocks(content);
            }
        }
    };
    walkBlocks(body);

    return lines.join('\n');
}
