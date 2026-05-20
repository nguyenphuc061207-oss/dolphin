/**
 * OMML (Word Math) to LaTeX Parser - Fixed Spacing & Text Run Blocks
 */

const toLatex = (() => {
    const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

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
        'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon',
        'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa',
        'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi',
        'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
        'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega', 'ϕ': '\\varphi', 'ϵ': '\\varepsilon',
        'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi',
        'Π': '\\Pi', 'Σ': '\\Sigma', 'Ω': '\\Omega',

        '±': '\\pm', '×': '\\times', '÷': '\\div', '⋅': '\\cdot', '∘': '\\circ', '∙': '\\bullet',
        '≠': '\\neq', '≤': '\\leq', '≥': '\\geq', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim',
        '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
        '∈': '\\in', '∉': '\\notin', '∅': '\\emptyset',

        '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
        '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '⟹': '\\implies', '⟺': '\\iff',

        '∪': '\\cup', '∩': '\\cap', '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
        '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists',

        '∞': '\\infty', '∫': '\\int', '∑': '\\sum', '∏': '\\prod',
        '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots',
        'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
        '√': '\\sqrt', '°': '^{\\circ}', '′': "'", '″': "''"
    };

    // Ép buộc thêm khoảng trống sau mỗi macro chữ để tránh lỗi \forallx
    const ensureMacroSpacing = (val) => {
        if (typeof val === 'string' && val.startsWith('\\') && /[a-zA-Z]$/.test(val)) {
            return val + ' ';
        }
        return val;
    };

    const applySymbolMap = (str) =>
        [...str].map((ch) => {
            const replacement = SYMBOL_MAP[ch];
            if (replacement) {
                return ensureMacroSpacing(replacement);
            }
            return ch;
        }).join('');

    const getRPrStyle = (rPr) => {
        if (!rPr) return null;
        const sty = firstChild(rPr, 'sty');
        if (sty) return getMVal(sty);
        if (firstChild(rPr, 'b')) return 'b';
        if (firstChild(rPr, 'i')) return 'i';
        return null;
    };

    const toLatex = (node) => {
        if (!node || node.nodeType === 3) return '';
        const local = node.localName;
        if (!local) return '';

        const kids = () => Array.from(node.childNodes).map(toLatex).join('');
        const childOf = (n) => (n ? Array.from(n.childNodes).map(toLatex).join('') : '');

        switch (local) {
            case 'oMathPara':
                return allChildren(node, 'oMath')
                    .map((n) => {
                        const content = Array.from(n.childNodes).map(toLatex).join('');
                        return `$$${content}$$`;
                    })
                    .join('\n');

            case 'oMath': {
                const mathContent = kids();
                return `$${mathContent}$`;
            }

            case 'r': {
                const t = firstChild(node, 't');
                if (!t) return '';
                const raw = t.textContent;

                if (raw.trim() === '' && raw.length > 0) {
                    return `\\text{${raw}}`;
                }

                const mapped = applySymbolMap(raw);
                const rPr = firstChild(node, 'rPr');
                const style = getRPrStyle(rPr);

                const hasVietnamese = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵđ]/i.test(raw);
                const hasMultipleLetters = /\b[a-zA-Z]{2,}\b/.test(raw);

                // Nếu chứa chữ tiếng Việt hoặc text thông thường, bọc trong \text{ } và thêm khoảng trống biên cách xa toán tử
                if (hasVietnamese || hasMultipleLetters || style === 'p') {
                    return `\\text{ ${mapped.trim()} }`;
                }

                if (style === 'bi') return `\\boldsymbol{${mapped}}`;
                if (style === 'b') return `\\mathbf{${mapped}}`;
                return mapped;
            }

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

            case 'rad': {
                const radPr = firstChild(node, 'radPr');
                const degHideNode = radPr ? firstChild(radPr, 'degHide') : null;
                const isHidden = degHideNode ? (getMVal(degHideNode) === '1' || degHideNode.getAttribute('m:val') === '1') : false;
                const degNode = firstChild(node, 'deg');
                const eNode = firstChild(node, 'e');
                const degTex = (!isHidden && degNode) ? childOf(degNode).trim() : '';
                return (degTex && degTex !== '2') ? `\\sqrt[${degTex}]{${childOf(eNode)}}` : `\\sqrt{${childOf(eNode)}}`;
            }

            case 'sSup': return `${childOf(firstChild(node, 'e'))}^{${childOf(firstChild(node, 'sup'))}}`;
            case 'sSub': return `${childOf(firstChild(node, 'e'))}_{${childOf(firstChild(node, 'sub'))}}`;
            case 'sSubSup': return `${childOf(firstChild(node, 'e'))}_{${childOf(firstChild(node, 'sub'))}}^{${childOf(firstChild(node, 'sup'))}}`;

            case 'd': {
                const pr = firstChild(node, 'dPr');
                let beg = '(', end = ')';
                if (pr) {
                    const b = firstChild(pr, 'begChr');
                    const en = firstChild(pr, 'endChr');
                    if (b) beg = getMVal(b) || '(';
                    if (en) end = getMVal(en) || ')';
                }
                if (beg === '' && end === '') { beg = '|'; end = '|'; }
                const parts = allChildren(node, 'e').map(childOf);
                return `\\left${beg}${parts.join(', ')}\\right${end}`;
            }

            case 'func': {
                const fName = firstChild(node, 'fName');
                const e = firstChild(node, 'e');
                const nameRaw = childOf(fName).trim();
                return `\\text{${nameRaw.replace(/^\\/, '')}}\\left(${childOf(e)}\\right)`;
            }

            default:
                return kids();
        }
    };

    return toLatex;
})();

export function extractMathFromXml(xmlDoc) {
    const NS_MATH = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    const mathNodes = [];
    const walker = xmlDoc.createTreeWalker(xmlDoc.documentElement, 1);
    let node = walker.nextNode();
    while (node) {
        if (node.namespaceURI === NS_MATH) {
            if (node.localName === 'oMathPara') {
                mathNodes.push({ node, type: 'display' });
            } else if (node.localName === 'oMath') {
                let parent = node.parentNode;
                let isInsideMathPara = false;
                while (parent) {
                    if (parent.localName === 'oMathPara' && parent.namespaceURI === NS_MATH) {
                        isInsideMathPara = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
                if (!isInsideMathPara) {
                    mathNodes.push({ node, type: 'inline' });
                }
            }
        }
        node = walker.nextNode();
    }

    mathNodes.forEach(({ node }) => {
        const latex = toLatex(node);
        const doc = node.ownerDocument;
        const rNode = doc.createElementNS(NS_W, 'w:r');
        const tNode = doc.createElementNS(NS_W, 'w:t');
        tNode.setAttribute('xml:space', 'preserve');
        tNode.textContent = ` ${latex} `;
        rNode.appendChild(tNode);
        node.parentNode.replaceChild(rNode, node);
    });

    return {};
}