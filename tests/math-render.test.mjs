// Every math path must produce LaTeX that KaTeX can draw: typed text, Word equations (OMML),
// Insert → Symbol characters, MathType (MathML) and AsciiMath in backticks.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const katex = require('katex');
const { DOMParser: XmlDOMParser, XMLSerializer } = require('@xmldom/xmldom');

let server, mu, dx, mathml, am;
before(async () => {
  // The extractors run in the browser; xmldom stands in for DOMParser here.
  globalThis.XMLSerializer = XMLSerializer;
  // Browser collections are iterable with for…of; xmldom's are not.
  const probe = new XmlDOMParser().parseFromString('<a/>', 'text/xml');
  for (const proto of [Object.getPrototypeOf(probe), Object.getPrototypeOf(probe.documentElement)]) {
    for (const name of ['getElementsByTagNameNS', 'getElementsByTagName']) {
      const original = proto[name];
      proto[name] = function (...args) { return Array.from(original.apply(this, args)); };
    }
  }
  globalThis.DOMParser = class {
    parseFromString(s, type) {
      const d = new XmlDOMParser({ onError: () => {} }).parseFromString(s, type);
      d.querySelector = () => null;
      return d;
    }
  };
  server = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'expose-internals', transform: (code, id) => (id.endsWith('docxExtractor.js') ? `${code}\nexport { toLatex as __toLatex, symToChar as __symToChar };` : undefined) }],
  });
  mu = await server.ssrLoadModule('/src/shared/math/mathUtils.js');
  dx = await server.ssrLoadModule('/src/features/exams/parsers/docxExtractor.js');
  mathml = await server.ssrLoadModule('/src/shared/math/mathmlParser.js');
  am = await server.ssrLoadModule('/src/shared/math/asciiMathParser.js');
});
after(() => server?.close());

/** Display pipeline of MathText; returns the math pieces after asserting KaTeX can draw each one. */
function renders(text) {
  const tokens = mu.tokenizeMath(mu.normalizeUnicodeToLatex(mu.normalizeWordMangledMath(text)));
  const math = tokens.filter((t) => t.type === 'inline' || t.type === 'block').map((t) => t.content);
  for (const latex of math) {
    assert.doesNotThrow(() => katex.renderToString(latex, { throwOnError: true, strict: 'ignore' }), `KaTeX cannot draw: ${latex}`);
  }
  return math;
}

const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const omml = (inner) => dx.__toLatex(new XmlDOMParser().parseFromString(`<m:oMath ${M}>${inner}</m:oMath>`, 'text/xml').documentElement);
const run = (t, sty = '') => `<m:r>${sty ? `<m:rPr><m:sty m:val="${sty}"/></m:rPr>` : ''}<m:t>${t}</m:t></m:r>`;

test('typed symbols: primes, cube roots, slanted ≤, vectors and overlines render', () => {
  assert.deepEqual(renders('f′(x) và f″(x)'), ['^{\\prime}', '^{\\prime\\prime}']);
  assert.deepEqual(renders('∛8 + ∜(x+1)'), ['\\sqrt[3]{8}', '\\sqrt[4]{x+1}']);
  assert.deepEqual(renders('x ⩽ 3 ⩾ y'), ['\\leqslant', '\\geqslant']);
  assert.deepEqual(renders('AB⃗ và x̄'), ['\\overrightarrow{AB}', '\\overline{x}']);
});

test('Word equations: a symbol before a letter, LaTeX specials and Vietnamese text all render', () => {
  for (const sty of ['', 'p']) {
    for (const ch of [...'αβπΔΣ≤≥≠∈∉⊂∀∃→⇒∞∫∑√±×÷°%&#{}_^~\\$']) renders(omml(run(`x${ch.replace('&', '&amp;')}y`, sty)));
  }
  assert.equal(omml(run('2π') + run('r')), '$2\\pi r$');
  assert.equal(omml(run('với x≤2')), '$\\text{với }x\\leq 2$');
  assert.equal(omml('<m:f><m:num>' + run('50%') + '</m:num><m:den>' + run('2') + '</m:den></m:f>'), '$\\frac{50\\%}{2}$');
  renders(omml(run('Δ≥0 khi và chỉ khi m≤1', 'p')));
});

test('Word equations: systems, matrices and functions keep Word’s brackets', () => {
  const system = omml('<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>' + run('x+y&amp;=1') + '</m:e><m:e>' + run('x−y&amp;=3') + '</m:e></m:eqArr></m:e></m:d>');
  assert.equal(system, '$\\left\\{\\begin{aligned}x+y&=1 \\\\ x-y&=3\\end{aligned}\\right.$');
  renders(system);
  const matrix = omml('<m:d><m:e><m:m><m:mr><m:e>' + run('1') + '</m:e><m:e>' + run('2') + '</m:e></m:mr></m:m></m:e></m:d>');
  assert.equal(matrix, '$\\left(\\begin{matrix}1 & 2\\end{matrix}\\right)$');
  const sin = omml('<m:func><m:fName>' + run('sin', 'p') + '</m:fName><m:e><m:d><m:e>' + run('x') + '</m:e></m:d></m:e></m:func>');
  assert.equal(sin, '$\\operatorname{sin}{\\left(x\\right)}$');
  renders(omml('<m:func><m:fName>' + run('tg', 'p') + '</m:fName><m:e>' + run('x') + '</m:e></m:func>'));
  const lim = omml('<m:func><m:fName><m:limLow><m:e>' + run('lim', 'p') + '</m:e><m:lim>' + run('x→0') + '</m:lim></m:limLow></m:fName><m:e>' + run('x') + '</m:e></m:func>');
  assert.match(lim, /^\$\\lim_\{x\\rightarrow 0\}/);
  renders(lim);
});

test('Insert → Symbol characters become the symbol, never the ASCII letter at that position', () => {
  const sym = (code) => dx.__symToChar(new XmlDOMParser().parseFromString(`<w:sym xmlns:w="w" w:font="Symbol" w:char="${code}"/>`, 'text/xml').documentElement);
  assert.deepEqual(['F024', 'F022', 'F063', 'F079', 'F0A2', 'F0B2', 'F0C6', 'F0CC', 'F0F2', 'F0B3'].map(sym), ['∃', '∀', 'χ', 'ψ', '′', '″', '∅', '⊂', '∫', '≥']);
});

test('MathType MathML: specials are escaped and systems get one stretched brace', () => {
  for (const [mml, latex] of [
    ['<math><mn>50</mn><mo>%</mo></math>', '50\\%'],
    ['<math><mi>a</mi><mo>&amp;</mo><mi>b</mi></math>', 'a\\&b'],
    ['<math><mi>α</mi><mi>x</mi></math>', '\\alpha x'],
    ['<math><mfenced open="{" close=""><mtable columnalign="left"><mtr><mtd><mi>x</mi></mtd></mtr><mtr><mtd><mi>y</mi></mtd></mtr></mtable></mfenced></math>', '\\left\\{\\begin{array}{l}x \\\\ y\\end{array}\\right.'],
  ]) {
    assert.equal(mathml.convertMathMLToLatex(mml), latex);
    renders(`$${latex}$`);
  }
});

test('AsciiMath in backticks: absolute value, powers in brackets, degrees and Greek names', () => {
  for (const [input, latex] of [['|x - 1|', '\\left|x - 1\\right|'], ['x^(n+1)', 'x^{n+1}'], ['30^@', '30^{\\circ}'], ['Delta ABC', '\\Delta \\text{ABC}']]) {
    assert.deepEqual(renders(am.convertAsciiMathToLatex(`Tính \`${input}\``)), [latex]);
  }
});

test('a Word file with MathType (WMF) formulas is flagged instead of showing broken images', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" ${M}><w:body>
    <w:p><w:r><w:t xml:space="preserve">Câu 1. Tính diện tích </w:t></w:r><m:oMath>${run('S=π')}${run('r')}</m:oMath><w:r><w:sym w:font="Symbol" w:char="F024"/></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Câu 2. Công thức </w:t></w:r><w:r><w:object><v:shape><v:imagedata r:id="rId9"/></v:shape></w:object></w:r></w:p>
  </w:body></w:document>`);
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Target="media/image1.wmf"/></Relationships>');
  zip.file('word/media/image1.wmf', Buffer.from([0xd7, 0xcd, 0xc6, 0x9a]));
  const html = await dx.extractDocxToHtml(await zip.generateAsync({ type: 'arraybuffer' }));
  assert.match(html, /\$S=\\pi r\$/);
  assert.match(html, /∃/);
  assert.match(html, /\[IMG: data:image\/x-wmf;base64,/);
  assert.match(html, dx.UNDISPLAYABLE_IMAGE);
});

test('LaTeX whose backslash escapes were eaten by a JSON/JS string still renders', () => {
  for (const [broken, latex] of [['$\rightarrow$', '\\rightarrow'], ['$4 \times 3$', '4 \\times 3'], ['$\frac{1}{2}$', '\\frac{1}{2}'], ['$\beta + \vec{v}$', '\\beta + \\vec{v}'], ['$\\\times$', '\\times']]) {
    const [token] = mu.tokenizeMath(mu.normalizeWordMangledMath(broken));
    assert.equal(token.content, latex);
    assert.doesNotThrow(() => katex.renderToString(token.content));
  }
  // Prose outside math keeps its tabs and line breaks.
  assert.equal(mu.normalizeWordMangledMath('a\tb\r\nc'), 'a\tb\r\nc');
});

test('a command cut after its first letter is joined again, real single-letter commands stay', () => {
  for (const [broken, latex] of [['$\\t imes$', '\\times'], ['$AL \\l\u200Beftarrow$', 'AL \\leftarrow'], ['$\\f\u00ADrac{1}{2}$', '\\frac{1}{2}'], ['$\\S ection$', '\\S ection'], ['$a \\le b$', 'a \\le b']]) {
    const [token] = mu.tokenizeMath(mu.normalizeWordMangledMath(broken)).filter((t) => t.type === 'inline');
    assert.equal(token.content, latex);
    assert.doesNotThrow(() => katex.renderToString(token.content));
  }
});

test('pictures uploaded when the exam was saved render as images, not text', () => {
  const tokens = mu.tokenizeMath(mu.normalizeUnicodeToLatex('Hình 4:<br>[IMG: https://i.ibb.co/a_b/fig^4.png]'));
  assert.deepEqual(tokens.filter((t) => t.type === 'image').map((t) => t.content), ['https://i.ibb.co/a_b/fig^4.png']);
  assert.equal(mu.tokenizeMath('[IMG: javascript:alert(1)]')[0].type, 'text');
});
