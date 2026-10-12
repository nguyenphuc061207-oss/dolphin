// Run with: node tests/rich-code.browser.mjs <absolute path to playwright package>
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const checks = async () => {
  const { parseQuestionsFromHtml } = await import('/src/features/exams/parsers/questionParser.js');
  const { plainTextToHtml } = await import('/src/features/exams/parsers/txtExtractor.js');
  const { sanitizeRichHtml } = await import('/src/shared/utils/richText.js');
  const { default: Renderer } = await import('/src/shared/components/RichTextRenderer.jsx');
  const { default: React } = await import('react');
  const { createRoot } = await import('react-dom/client');
  let checkCount = 0;
  const expect = (value, message) => { if (!value) throw new Error(message); checkCount++; };
  const fixture = ['Câu 2. Kết quả của đoạn code sau là gì?', 'print(type(5 // 2.0))', 'A. float', 'B. int', 'Đáp án: A', 'Giải thích: Cú pháp đúng là from <module> import <tên>.'].join('\n');
  const [question] = parseQuestionsFromHtml(plainTextToHtml(fixture));
  expect(question.correctAnswer === 0 && question.options.length === 2, 'question structure');
  expect(question.content.includes('rt-block'), 'Python auto detection');
  const code = 'def example():\n    print("$x$ <module> & tên")\n\n    return 5 // 2';
  const [fenced] = parseQuestionsFromHtml(plainTextToHtml(['Câu 1. Đọc code', '```python', code, '```', 'A. 2', 'B. 3', 'Đáp án: A'].join('\n')));
  expect(fenced.content.includes('<pre>') && fenced.content.includes('\n\n    return'), 'fences preserve whitespace');
  const structuralCode = 'A. source text\nAnswer: B\n1. source text';
  const [literal] = parseQuestionsFromHtml(plainTextToHtml(['Câu 1. Code', '```', structuralCode, '```', 'A. yes', 'B. no', 'Đáp án: A'].join('\n')));
  expect(literal.options.length === 2 && literal.content.includes('Answer: B'), 'code cannot create answers/options');
  const listed = parseQuestionsFromHtml(plainTextToHtml(['Câu 44. Có bao nhiêu biểu thức lôgic sau đúng?', '1) s1 in s.   2) s2 in s.   3) s3 in s.', 'A. 1', 'B. 2', 'Đáp án: B', 'Câu 45. Tiếp?', 'A. x', 'B. y', 'Đáp án: A'].join('\n')));
  expect(listed.length === 2 && listed[0].type === 'single' && listed[0].correctAnswer === 1 && listed[0].content.includes('2) s2 in s.'), 'numbered statements stay in the stem');
  const root = createRoot(document.getElementById('root'));
  root.render(React.createElement('div', { style: { maxWidth: 420, padding: 20 } },
    React.createElement(Renderer, { content: question.content }),
    React.createElement(Renderer, { content: question.explanation }),
    React.createElement(Renderer, { content: fenced.content }),
    React.createElement(Renderer, { content: '<pre><b>print</b>("""first<br>second""")</pre>' }),
    React.createElement(Renderer, { content: '<pre>' + 'print(123); '.repeat(100) + '</pre>' }),
    React.createElement(Renderer, { content: '&lt;img src=x onerror=alert(1)&gt;' }),
    React.createElement(Renderer, { content: 'Công thức $x^2$ vẫn hiển thị bình thường.' }),
  ));
  await new Promise(resolve => setTimeout(resolve, 150));
  const blocks = document.querySelectorAll('pre, code.rt-block');
  expect(blocks[0].textContent === 'print(type(5 // 2.0))', 'screenshot source unchanged');
  expect(!blocks[0].querySelector('.tok-c'), 'floor division not a comment');
  expect(document.body.textContent.includes('from <module> import <tên>.'), 'explanation entities decode');
  expect(blocks[1].textContent === code, 'code indent and blank lines unchanged');
  expect(!blocks[1].querySelector('.katex'), 'code strings never become math');
  expect(blocks[2].querySelector('.tok-s').textContent === '"""first\nsecond"""', 'Word runs and br keep multiline string context');
  expect(blocks[3].scrollWidth > blocks[3].clientWidth, 'long code scrolls within its box');
  expect(!document.querySelector('img'), 'decoded markup stays inert text');
  expect(!!document.querySelector('.katex'), 'prose math still renders');
  expect(!sanitizeRichHtml('<script>alert(1)</script><code onclick="alert(1)">safe</code>').includes('alert'), 'sanitizer preserved');
  return { checks: checkCount, code: blocks[0].textContent, explanation: question.explanation };
};

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'rich-code-regression',
  configureServer(server) {
    server.middlewares.use('/__rich-code-test', async (_req, res) => {
      const html = '<!doctype html><html><head></head><body><div id="root"></div><script type="module">import "/src/app/styles/index.css"; window.runChecks = ' + checks.toString().replace(/<\/script/gi, '<\\/script') + ';</script></body></html>';
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__rich-code-test', html));
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
  await page.goto(server.resolvedUrls.local[0] + '__rich-code-test');
  await page.waitForFunction(() => typeof window.runChecks === 'function');
  const result = await page.evaluate(() => window.runChecks());
  assert.equal(result.checks, 15);
  console.log('Browser regression checks passed:', result);
} finally {
  await browser?.close();
  await server.close();
}
