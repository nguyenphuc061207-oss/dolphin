import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightCode, guessLanguage } from '../src/shared/utils/highlightCode.js';
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

test('Python floor division and power are operators, C-family // stays a comment', () => {
  const isComment = (text, piece) => highlightCode(text).some(t => t.type === 'c' && t.text.includes(piece));
  for (const text of ['x //= (5 + 8 > 3**2 % 4 <= 3) * 3', 'n = (a + b) // 2', 'y = total // count', 'z = x // y + 1', 'k = 2 ** 10 // 3']) {
    assert.ok(!isComment(text, '//'), text);
    assert.equal(highlightCode(text).map(t => t.text).join(''), text);
  }
  assert.ok(isComment('x //= 2  # chia lấy nguyên', '# chia'));
  for (const [text, piece] of [
    ['int x = 10; // gán giá trị', '// gán'],
    ['let a = b // set b', '// set'],
    ['x = y // tính y', '// tính'],
    ['System.out.print(x); // in ra', '// in'],
    ['switch (n) {\n  case 1: // một\n}', '// một'],
  ]) assert.ok(isComment(text, piece), text);
});

test('Python operator lines are detected as code when importing files', () => {
  assert.equal(looksLikeCode('x //= (5 + 8 > 3**2 % 4 <= 3) * 3'), true);
  assert.equal(looksLikeCode('x = 5 // 2'), true);
  assert.equal(looksLikeCode('a**2 + b**2 = c**2'), false);
  assert.deepEqual(detectCodeLines(['Cho biết kết quả của x với x = 100:', 'x //= (5 + 8 > 3**2 % 4 <= 3) * 3']), [false, true]);
});

test('language guess picks the right comment syntax for each listing', () => {
  const comments = (text) => highlightCode(text).filter(t => t.type === 'c').map(t => t.text);
  for (const text of ['program Tong;\nbegin\n  a := 10; { gán }\n  b := a div 3; (* chia *)\n  writeln(b);\nend.', 'readln(a, b);\n{ cộng }\nwriteln(a + b);']) {
    assert.equal(guessLanguage(text), 'pascal');
    assert.ok(comments(text).length >= 1 && comments(text).every(c => /^(\{|\(\*)/.test(c)), text);
  }
  // C++ iterators are not Pascal begin/end: { opens a block, // is the comment
  const cpp = 'vector<int> v = {3, 1, 2}; // khai báo\nsort(v.begin(), v.end());';
  assert.equal(guessLanguage(cpp), 'c');
  assert.deepEqual(comments(cpp), ['// khai báo']);
  // Go := with braces stays C-like
  assert.deepEqual(comments('func main() {\n    x := 5 // in x\n}'), ['// in x']);
  // a ; inside a string does not turn Python into C
  assert.equal(guessLanguage('s = "a;b"\nn = len(s) // 2'), 'python');
  assert.deepEqual(comments('s = "a;b"\nn = len(s) // 2'), []);
  assert.deepEqual(comments('SELECT * FROM hs WHERE tuoi > 18; -- lọc'), ['-- lọc']);
});

test('keywords of one language do not colour names in another', () => {
  const kinds = (text) => Object.fromEntries(highlightCode(text).filter(t => /\w/.test(t.text)).map(t => [t.text, t.type]));
  const py = kinds('values = [3, 1]\nvalues.sort()\nprint(type(values))');
  assert.equal(py.values, null);
  assert.equal(py.type, 'f');
  assert.equal(kinds('SELECT ten FROM hs ORDER BY ten').ORDER, 'k');
  assert.equal(kinds('begin\n  x := 1;\nend.').begin, 'k');
});

test('file import recognizes statements that only exist in code, and leaves math alone', () => {
  for (const code of ['x += 1', 'i++', 'a == b', 's = s[-1]', 'print(s[::-1])']) assert.equal(looksLikeCode(code), true, code);
  for (const prose of ['x = 2', '2x + 1', 'f(x) = x^2', 'a^2 + b^2 = c^2', 'A -> B', 'Hà Nội']) assert.equal(looksLikeCode(prose), false, prose);
  assert.deepEqual(detectCodeLines(['Sau khi thực hiện, x bằng bao nhiêu?', 'x = 10', 'x = x * 2 - 3']), [false, true, true]);
  assert.deepEqual(detectCodeLines(['Thẻ nào tạo liên kết?', '<a href="https://example.com">Trang chủ</a>']), [false, true]);
  assert.deepEqual(detectCodeLines(['<?php', '$a = 5;', 'echo $a * 2;', '?>']), [true, true, true, true]);
  assert.deepEqual(detectCodeLines(['Đoạn Pascal:', '{ Tính tổng }', 'readln(a, b);', 'writeln(a + b);']), [false, true, true, true]);
});
