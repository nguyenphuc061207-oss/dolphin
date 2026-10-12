import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightCode } from '../src/shared/utils/highlightCode.js';
import { isRichHtml, decodeTextEntities, mergeCodeBlocks } from '../src/shared/utils/richText.js';
import { detectCodeLines, looksLikeCode } from '../src/features/exams/parsers/codeDetector.js';
import { convertAsciiMathToLatex, restoreCodeCalls } from '../src/shared/math/asciiMathParser.js';

test('Python floor division is an operator, including inside the screenshot example', () => {
  for (const text of ['print(type(5 // 2.0))', 'x = 5 // 2', 'def f():\n    return 5 // 2 # result']) {
    const tokens = highlightCode(text);
    assert.equal(tokens.map(t => t.text).join(''), text);
    assert.ok(!tokens.some(t => t.type === 'c' && t.text.includes('//')));
  }
});

test('strings and multiline comments keep content intact across languages', () => {
  for (const [text, type, token] of [
    ['console.log("https://example.com"); // result', 'c', '// result'],
    ['/* first\nsecond */\nint n = 0xFF;', 'c', '/* first\nsecond */'],
    ['print("""first\nsecond""") # result', 's', '"""first\nsecond"""'],
    ['SELECT n FROM results -- result', 'c', '-- result'],
  ]) {
    const tokens = highlightCode(text);
    assert.equal(tokens.map(t => t.text).join(''), text);
    assert.ok(tokens.some(t => t.type === type && t.text === token));
  }
});

test('entity-only stored HTML is recognized and decoded exactly once', () => {
  const text = 'from &lt;module&gt; import &lt;tên&gt;';
  assert.equal(isRichHtml(text), true);
  assert.equal(decodeTextEntities(text), 'from <module> import <tên>');
  assert.equal(decodeTextEntities('&#60;x&#x3e; &amp;lt;'), '<x> &lt;');
  assert.equal(decodeTextEntities('&#999999999;'), '&#999999999;');
});

test('block merging preserves inline code and code line order', () => {
  assert.equal(mergeCodeBlocks('<code>inline</code><br><code class="rt-block">block</code>'), '<code>inline</code><br><code class="rt-block">block</code>');
  assert.equal(mergeCodeBlocks('<code class="rt-block">a</code><br><code class="rt-block">  b</code><br><code class="rt-block">c</code>'), '<code class="rt-block">a\n  b\nc</code>');
});

test('code detection keeps prose/math separate and includes indented bodies', () => {
  assert.deepEqual(detectCodeLines(['Kết quả là gì?', 'for i in range(2):', '    print(i)', 'Giải thích: vòng lặp']), [false, true, true, false]);
  assert.equal(looksLikeCode('names = ["Lan", "An"]'), true);
  assert.equal(looksLikeCode('x = 2'), false);
  assert.equal(looksLikeCode('$x = 2$'), false);
});

test('call statements with one-letter names stay inside the listing', () => {
  const lines = ['Đoạn code sau in ra gì?', 'g = 1', 'def f():', '    global g', '    g += 1', 'f()', 'f()', 'print(g)'];
  assert.deepEqual(detectCodeLines(lines), [false, true, true, true, true, true, true, true]);
  assert.equal(looksLikeCode('f()'), true);
  assert.equal(looksLikeCode('stack.pop();'), true);
  assert.equal(looksLikeCode('f(x)'), false);
  assert.equal(looksLikeCode('sqrt(4)'), false);
});

test('saved listings split around short statements are rejoined', () => {
  const saved = '<code class="rt-block">g = 1\ndef f():\n    g += 1</code><br>f()<br>f()<br><code class="rt-block">print(g)</code>';
  assert.equal(mergeCodeBlocks(saved), '<code class="rt-block">g = 1\ndef f():\n    g += 1\nf()\nf()\nprint(g)</code>');
  const prose = '<code class="rt-block">a = 1</code><br>Kết quả là gì?<br><code class="rt-block">print(a)</code>';
  assert.equal(mergeCodeBlocks(prose), prose);
  const inline = '<code>x</code><br>f()<br><code class="rt-block">print(a)</code>';
  assert.equal(mergeCodeBlocks(inline), inline);
});

test('sqrt(...) in programming prose is not turned into a radical', () => {
  assert.equal(convertAsciiMathToLatex('dùng được sqrt(4) mà không cần ghi math. phía trước?'), 'dùng được sqrt(4) mà không cần ghi math. phía trước?');
  assert.equal(convertAsciiMathToLatex('print(math.sqrt(16))'), 'print(math.sqrt(16))');
  assert.equal(convertAsciiMathToLatex('Tính sqrt(16) + 1'), 'Tính $\\sqrt{16}$ + 1');
});

test('questions saved with the old conversion render sqrt(...) again', () => {
  assert.equal(restoreCodeCalls('dùng được $\\sqrt{4}$ mà không cần ghi math. phía trước?'), 'dùng được sqrt(4) mà không cần ghi math. phía trước?');
  assert.equal(restoreCodeCalls('print(math.$\\sqrt{16}$)'), 'print(math.sqrt(16))');
  assert.equal(restoreCodeCalls('Tính $\\sqrt{16}$ + 1'), 'Tính $\\sqrt{16}$ + 1');
  assert.equal(restoreCodeCalls('Tính $\\sqrt{x^{2}+1}$ trong code'), 'Tính $\\sqrt{x^{2}+1}$ trong code');
});
