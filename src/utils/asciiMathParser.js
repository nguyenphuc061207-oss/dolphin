/**
 * Dolphin – AsciiMath → LaTeX Converter
 *
 * Converts AsciiMath notation to LaTeX.
 * AsciiMath is a lightweight math markup used in educational contexts.
 *
 * Supported syntax:
 *   Backtick delimiters: `sqrt(x^2 + 1)` → $\sqrt{x^{2} + 1}$
 *   Common functions: sqrt, frac, sum, int, lim, sin, cos, tan, log, ln ...
 *   Greek letters: alpha, beta, gamma, delta, theta, pi, sigma, omega ...
 *   Operators: >=, <=, !=, +-,  ** , xx, -:, @, oo ...
 *   Grouping: (a+b), [a,b], {a,b}, |x|, ||x||
 *   Matrix: ((a,b),(c,d)) → \begin{pmatrix}...\end{pmatrix}
 */

// ─── AsciiMath keyword → LaTeX mapping ─────────────────────────────────────

const AM_SYMBOLS = [
    // ── Greek lowercase (sorted longest-first to avoid partial matches) ──
    ['epsilon', '\\epsilon'],
    ['varepsilon', '\\varepsilon'],
    ['vartheta', '\\vartheta'],
    ['varphi', '\\varphi'],
    ['alpha', '\\alpha'],
    ['beta', '\\beta'],
    ['gamma', '\\gamma'],
    ['delta', '\\delta'],
    ['zeta', '\\zeta'],
    ['eta', '\\eta'],
    ['theta', '\\theta'],
    ['iota', '\\iota'],
    ['kappa', '\\kappa'],
    ['lambda', '\\lambda'],
    ['mu', '\\mu'],
    ['nu', '\\nu'],
    ['xi', '\\xi'],
    ['pi', '\\pi'],
    ['rho', '\\rho'],
    ['sigma', '\\sigma'],
    ['tau', '\\tau'],
    ['upsilon', '\\upsilon'],
    ['phi', '\\phi'],
    ['chi', '\\chi'],
    ['psi', '\\psi'],
    ['omega', '\\omega'],

    // ── Greek uppercase ──
    ['Gamma', '\\Gamma'],
    ['Delta', '\\Delta'],
    ['Theta', '\\Theta'],
    ['Lambda', '\\Lambda'],
    ['Xi', '\\Xi'],
    ['Pi', '\\Pi'],
    ['Sigma', '\\Sigma'],
    ['Phi', '\\Phi'],
    ['Psi', '\\Psi'],
    ['Omega', '\\Omega'],

    // ── Standard functions ──
    ['arcsin', '\\arcsin'],
    ['arccos', '\\arccos'],
    ['arctan', '\\arctan'],
    ['sinh', '\\sinh'],
    ['cosh', '\\cosh'],
    ['tanh', '\\tanh'],
    ['sin', '\\sin'],
    ['cos', '\\cos'],
    ['tan', '\\tan'],
    ['cot', '\\cot'],
    ['sec', '\\sec'],
    ['csc', '\\csc'],
    ['log', '\\log'],
    ['ln', '\\ln'],
    ['exp', '\\exp'],
    ['det', '\\det'],
    ['dim', '\\dim'],
    ['gcd', '\\gcd'],
    ['lcm', '\\operatorname{lcm}'],
    ['lim', '\\lim'],
    ['limsup', '\\limsup'],
    ['liminf', '\\liminf'],
    ['max', '\\max'],
    ['min', '\\min'],
    ['mod', '\\bmod'],

    // ── Operators (multi-char, longest first) ──
    ['!=', '\\neq'],
    ['>=', '\\geq'],
    ['<=', '\\leq'],
    ['~=', '\\cong'],
    ['~~', '\\approx'],
    ['-:', '\\div'],
    ['+-', '\\pm'],
    ['-+', '\\mp'],
    ['**', '\\ast'],
    ['//', '\\slash'],
    ['xx', '\\times'],
    ['|><', '\\ltimes'],
    ['><|', '\\rtimes'],
    ['|><|', '\\bowtie'],
    ['@@', '\\circ'],
    ['o+', '\\oplus'],
    ['ox', '\\otimes'],
    ['o.', '\\odot'],
    ['^^^', '\\bigwedge'],
    ['vvv', '\\bigvee'],
    ['nnn', '\\bigcap'],
    ['uuu', '\\bigcup'],
    ['^^', '\\wedge'],
    ['vv', '\\vee'],
    ['nn', '\\cap'],
    ['uu', '\\cup'],
    ['=>', '\\Rightarrow'],
    ['<=>', '\\Leftrightarrow'],
    ['->', '\\rightarrow'],
    ['<-', '\\leftarrow'],
    ['<->', '\\leftrightarrow'],
    ['>->', '\\rightarrowtail'],
    ['->>', '\\twoheadrightarrow'],
    ['|->', '\\mapsto'],
    ['>>=', '\\succeq'],
    ['<<=', '\\preceq'],
    ['>>', '\\gg'],
    ['<<', '\\ll'],

    // ── Miscellaneous symbols ──
    ['oo', '\\infty'],
    ['del', '\\partial'],
    ['grad', '\\nabla'],
    ['nabla', '\\nabla'],
    ['prop', '\\propto'],
    ['AA', '\\forall'],
    ['EE', '\\exists'],
    ['TT', '\\top'],
    ['_|_', '\\bot'],
    ['|--', '\\vdash'],
    ['|==', '\\models'],
    ['CC', '\\mathbb{C}'],
    ['NN', '\\mathbb{N}'],
    ['QQ', '\\mathbb{Q}'],
    ['RR', '\\mathbb{R}'],
    ['ZZ', '\\mathbb{Z}'],
    ['in', '\\in'],
    ['notin', '\\notin'],
    ['sub', '\\subset'],
    ['sup', '\\supset'],
    ['sube', '\\subseteq'],
    ['supe', '\\supseteq'],
    ['empty', '\\emptyset'],

    // ── Dots ──
    ['cdots', '\\cdots'],
    ['vdots', '\\vdots'],
    ['ddots', '\\ddots'],
    ['ldots', '\\ldots'],
    ['...', '\\ldots'],

    // ── Accents/decorations (handled specially) ──
    ['hat', '\\hat'],
    ['bar', '\\overline'],
    ['vec', '\\vec'],
    ['tilde', '\\tilde'],
    ['dot', '\\dot'],
    ['ddot', '\\ddot'],
    ['ul', '\\underline'],

    // ── Large operators ──
    ['sum', '\\sum'],
    ['prod', '\\prod'],
    ['int', '\\int'],
    ['iint', '\\iint'],
    ['iiint', '\\iiint'],
    ['oint', '\\oint'],

    // ── Misc ──
    ['sqrt', '\\sqrt'],
    ['root', '\\sqrt'],
    ['abs', '\\left|'],
    ['norm', '\\left\\|'],
    ['floor', '\\lfloor'],
    ['ceil', '\\lceil'],
    ['cancel', '\\cancel'],
    ['bb', '\\mathbf'],
    ['bbb', '\\mathbb'],
    ['cc', '\\mathcal'],
    ['tt', '\\mathtt'],
    ['fr', '\\mathfrak'],
    ['sf', '\\mathsf'],

    // ── Single char operators ──
    ['*', '\\cdot'],
    ['+', '+'],
    ['-', '-'],
    ['=', '='],
    ['/', '/'],
];

const AM_SYMBOL_MAP = new Map();
AM_SYMBOLS.forEach(([k, v]) => AM_SYMBOL_MAP.set(k, v));

const AM_KEYWORDS = AM_SYMBOLS.map(([k]) => k).sort((a, b) => b.length - a.length);

const ASCIIMATH_INDICATORS = /(?:sqrt|frac|sum|int|prod|lim|alpha|beta|gamma|delta|theta|pi|sigma|omega|infty|partial|nabla|forall|exists|rightarrow|leftarrow|Rightarrow|Leftrightarrow|vec|hat|bar|tilde|neq|geq|leq|approx|equiv|cdot|times|div|pm|cup|cap|subset|supset|emptyset|mathbb|begin|end|\\\\[a-zA-Z]|\^[\{0-9]|_[\{0-9]|[a-z]\^[0-9]|[a-z]_[0-9]|>=|<=|!=|->|=>|xx|\+-|oo|RR|QQ|ZZ|NN|CC|AA|EE)/;

function looksLikeAsciiMath(content) {
    if (!content || content.length > 500) return false;
    if (/\n.*\n/.test(content) && /[{};]/.test(content)) return false;
    if (/\b(import|export|function|const|let|var|return|if|else|for|while|class)\b/.test(content)) return false;
    return ASCIIMATH_INDICATORS.test(content);
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(input) {
    const tokens = [];
    let pos = 0;
    const len = input.length;

    while (pos < len) {
        if (/\s/.test(input[pos])) {
            tokens.push({ type: 'space', value: ' ' });
            while (pos < len && /\s/.test(input[pos])) pos++;
            continue;
        }

        let matched = false;
        for (const kw of AM_KEYWORDS) {
            if (input.startsWith(kw, pos)) {
                if (/[a-zA-Z]/.test(kw[0])) {
                    const nextChar = input[pos + kw.length];
                    if (nextChar && /[a-zA-Z]/.test(nextChar)) continue;
                }
                tokens.push({ type: 'symbol', value: kw, latex: AM_SYMBOL_MAP.get(kw) });
                pos += kw.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        if (/[0-9]/.test(input[pos])) {
            let num = '';
            while (pos < len && /[0-9.]/.test(input[pos])) {
                num += input[pos];
                pos++;
            }
            tokens.push({ type: 'number', value: num });
            continue;
        }

        if (/[a-zA-Z]/.test(input[pos])) {
            let word = '';
            while (pos < len && /[a-zA-Z]/.test(input[pos])) {
                word += input[pos];
                pos++;
            }
            if (AM_SYMBOL_MAP.has(word)) {
                tokens.push({ type: 'symbol', value: word, latex: AM_SYMBOL_MAP.get(word) });
            } else if (word.length === 1) {
                tokens.push({ type: 'variable', value: word });
            } else {
                tokens.push({ type: 'text', value: word });
            }
            continue;
        }

        if ('()[]{}|'.includes(input[pos])) {
            tokens.push({ type: 'group', value: input[pos] });
            pos++;
            continue;
        }

        if (input[pos] === '^' || input[pos] === '_') {
            tokens.push({ type: 'script', value: input[pos] });
            pos++;
            continue;
        }

        if (input[pos] === ',' || input[pos] === ';') {
            tokens.push({ type: 'separator', value: input[pos] });
            pos++;
            continue;
        }

        tokens.push({ type: 'char', value: input[pos] });
        pos++;
    }

    return tokens;
}

// ─── Parser / Converter ─────────────────────────────────────────────────────

function amToLatex(expr) {
    if (!expr || !expr.trim()) return '';

    const tokens = tokenize(expr.trim());
    let result = '';
    let i = 0;

    const collectGroup = (openChar) => {
        const closeMap = { '(': ')', '[': ']', '{': '}' };
        const close = closeMap[openChar] || openChar;
        let depth = 1;
        let content = '';
        while (i < tokens.length && depth > 0) {
            const t = tokens[i];
            if (t.type === 'group' && t.value === openChar) depth++;
            else if (t.type === 'group' && t.value === close) {
                depth--;
                if (depth === 0) { i++; break; }
            }
            content += t.value;
            i++;
        }
        return content;
    };

    const skipSpaces = () => {
        while (i < tokens.length && tokens[i].type === 'space') i++;
    };

    while (i < tokens.length) {
        const tok = tokens[i];

        if (tok.type === 'space') {
            result += ' ';
            i++;
            continue;
        }

        if (tok.type === 'number') {
            result += tok.value;
            i++;
            continue;
        }

        if (tok.type === 'variable') {
            result += tok.value;
            i++;
            continue;
        }

        if (tok.type === 'text') {
            result += `\\text{${tok.value}}`;
            i++;
            continue;
        }

        if (tok.type === 'separator') {
            result += tok.value === ';' ? '; ' : ', ';
            i++;
            continue;
        }

        if (tok.type === 'script') {
            const scriptChar = tok.value;
            i++;
            skipSpaces();

            if (i < tokens.length) {
                const next = tokens[i];
                if (next.type === 'group' && next.value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `${scriptChar}{${amToLatex(inner)}}`;
                } else if (next.type === 'group' && next.value === '{') {
                    i++;
                    const inner = collectGroup('{');
                    result += `${scriptChar}{${amToLatex(inner)}}`;
                } else {
                    result += `${scriptChar}{${next.latex || next.value}}`;
                    i++;
                }
            }
            continue;
        }

        if (tok.type === 'group') {
            if (tok.value === '(') {
                i++;
                const inner = collectGroup('(');
                if (/^\(.*\)(?:\s*,\s*\(.*\))+$/.test(inner.trim())) {
                    const rows = [];
                    const rowRegex = /\(([^)]*)\)/g;
                    let rm;
                    while ((rm = rowRegex.exec(inner)) !== null) {
                        rows.push(rm[1].split(',').map(c => amToLatex(c.trim())).join(' & '));
                    }
                    result += `\\begin{pmatrix}${rows.join(' \\\\ ')}\\end{pmatrix}`;
                } else {
                    result += `\\left(${amToLatex(inner)}\\right)`;
                }
                continue;
            }

            if (tok.value === '[') {
                i++;
                const inner = collectGroup('[');
                result += `\\left[${amToLatex(inner)}\\right]`;
                continue;
            }

            if (tok.value === '{') {
                i++;
                const inner = collectGroup('{');
                result += `\\left\\{${amToLatex(inner)}\\right\\}`;
                continue;
            }

            if (tok.value === '|') {
                if (i + 1 < tokens.length && tokens[i + 1].value === '|') {
                    i += 2;
                    let inner = '';
                    while (i < tokens.length) {
                        if (tokens[i].value === '|' && i + 1 < tokens.length && tokens[i + 1].value === '|') {
                            i += 2;
                            break;
                        }
                        inner += tokens[i].value;
                        i++;
                    }
                    result += `\\left\\|${amToLatex(inner)}\\right\\|`;
                } else {
                    i++;
                    let inner = '';
                    while (i < tokens.length && tokens[i].value !== '|') {
                        inner += tokens[i].value;
                        i++;
                    }
                    if (i < tokens.length) i++;
                    result += `\\left|${amToLatex(inner)}\\right|`;
                }
                continue;
            }

            i++;
            continue;
        }

        if (tok.type === 'symbol') {
            const kw = tok.value;

            if (kw === 'sqrt') {
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `\\sqrt{${amToLatex(inner)}}`;
                } else {
                    result += '\\sqrt';
                }
                continue;
            }

            if (kw === 'root') {
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const degree = collectGroup('(');
                    skipSpaces();
                    if (i < tokens.length && tokens[i].value === '(') {
                        i++;
                        const radicand = collectGroup('(');
                        result += `\\sqrt[${amToLatex(degree)}]{${amToLatex(radicand)}}`;
                    } else {
                        result += `\\sqrt[${amToLatex(degree)}]{}`;
                    }
                } else {
                    result += '\\sqrt';
                }
                continue;
            }

            if (kw === 'frac') {
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const num = collectGroup('(');
                    skipSpaces();
                    if (i < tokens.length && tokens[i].value === '(') {
                        i++;
                        const den = collectGroup('(');
                        result += `\\frac{${amToLatex(num)}}{${amToLatex(den)}}`;
                    } else {
                        result += `\\frac{${amToLatex(num)}}{}`;
                    }
                } else {
                    result += '\\frac';
                }
                continue;
            }

            if (['hat', 'bar', 'vec', 'tilde', 'dot', 'ddot', 'ul'].includes(kw)) {
                const latexCmd = tok.latex;
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `${latexCmd}{${amToLatex(inner)}}`;
                } else if (i < tokens.length) {
                    result += `${latexCmd}{${tokens[i].latex || tokens[i].value}}`;
                    i++;
                } else {
                    result += latexCmd;
                }
                continue;
            }

            if (['bb', 'bbb', 'cc', 'tt', 'fr', 'sf'].includes(kw)) {
                const latexCmd = tok.latex;
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `${latexCmd}{${amToLatex(inner)}}`;
                } else if (i < tokens.length) {
                    result += `${latexCmd}{${tokens[i].latex || tokens[i].value}}`;
                    i++;
                } else {
                    result += latexCmd;
                }
                continue;
            }

            if (kw === 'abs') {
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `\\left|${amToLatex(inner)}\\right|`;
                } else {
                    result += '\\left|\\right|';
                }
                continue;
            }

            if (kw === 'norm') {
                i++;
                skipSpaces();
                if (i < tokens.length && tokens[i].value === '(') {
                    i++;
                    const inner = collectGroup('(');
                    result += `\\left\\|${amToLatex(inner)}\\right\\|`;
                } else {
                    result += '\\left\\|\\right\\|';
                }
                continue;
            }

            if (['sum', 'prod', 'int', 'iint', 'iiint', 'oint', 'lim', 'limsup', 'liminf', 'max', 'min'].includes(kw)) {
                result += tok.latex;
                i++;
                continue;
            }

            if (['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
                 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'dim', 'gcd', 'mod'].includes(kw)) {
                result += tok.latex;
                i++;
                continue;
            }

            result += tok.latex || tok.value;
            i++;
            continue;
        }

        if (tok.type === 'char') {
            result += tok.value;
            i++;
            continue;
        }

        result += tok.value;
        i++;
    }

    return result;
}

// ─── Main API ───────────────────────────────────────────────────────────────

export function convertAsciiMathToLatex(text) {
    if (!text) return text;

    let result = text.replace(/`([^`\n]+)`/g, (match, content) => {
        if (looksLikeAsciiMath(content)) {
            const latex = amToLatex(content);
            return `$${latex}$`;
        }
        return match;
    });

    result = result.replace(/(?<!\$)\bsqrt\(([^)]+)\)(?!\$)/g, (match, inner) => {
        return `$\\sqrt{${amToLatex(inner)}}$`;
    });

    result = result.replace(/(?<!\$)\b(sum|prod|int|oint)_\(([^)]+)\)\^\(([^)]+)\)/g, (match, op, lower, upper) => {
        const latexOp = AM_SYMBOL_MAP.get(op) || `\\${op}`;
        return `$${latexOp}_{${amToLatex(lower)}}^{${amToLatex(upper)}}$`;
    });

    result = result.replace(/(?<!\$)\blim_\(([^)]+)\)/g, (match, sub) => {
        const latexSub = amToLatex(sub);
        return `$\\lim_{${latexSub}}$`;
    });

    return result;
}

export function containsAsciiMath(text) {
    if (!text) return false;
    const backtickMatch = text.match(/`([^`\n]+)`/g);
    if (backtickMatch) {
        for (const m of backtickMatch) {
            const content = m.slice(1, -1);
            if (looksLikeAsciiMath(content)) return true;
        }
    }
    if (/\bsqrt\([^)]+\)/.test(text)) return true;
    if (/\b(sum|prod|int)_\([^)]+\)\^\([^)]+\)/.test(text)) return true;
    if (/\blim_\([^)]+\)/.test(text)) return true;
    return false;
}
