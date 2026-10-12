// Run with: node tests/rich-editor.browser.mjs <absolute path to playwright package>
// Drives RichTextEditor like a teacher would: code block / inline code must always be escapable.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');

const mount = async () => {
  const { default: Editor } = await import('/src/shared/components/RichTextEditor.jsx');
  const { default: React, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  window.values = {};
  function Box({ id, initial, compact }) {
    const [v, setV] = useState(initial || '');
    window.values[id] = v;
    return React.createElement('div', { id }, React.createElement(Editor, { value: v, onChange: setV, compact }));
  }
  createRoot(document.getElementById('root')).render(React.createElement('div', { style: { width: 520 } },
    React.createElement(Box, { id: 'a' }),
    React.createElement(Box, { id: 'b' }),
    React.createElement(Box, { id: 'c', initial: 'Đoạn code:<br><code class="rt-block">x = 1\nprint(x)</code>' }),
    React.createElement(Box, { id: 'd', compact: true }),
  ));
  await new Promise((r) => setTimeout(r, 150));
};

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'rich-editor-regression',
  configureServer(server) {
    server.middlewares.use('/__rich-editor-test', async (_req, res) => {
      const html = '<!doctype html><html><head></head><body><div id="root"></div><script type="module">import "/src/app/styles/index.css"; window.mount = ' + mount.toString() + ';</script></body></html>';
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__rich-editor-test', html));
    });
  },
}] });

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + '__rich-editor-test');
  await page.waitForFunction(() => typeof window.mount === 'function');
  await page.evaluate(() => window.mount());
  const key = page.keyboard;
  const ed = (id) => page.locator(`#${id} .rt-editor`);
  const btn = (id, title) => page.locator(`#${id} button[title^="${title}"]`);
  const val = (id) => page.evaluate((i) => window.values[i], id);

  // Enter twice on the last line leaves the block; the hint shows only while inside
  await ed('a').click();
  await key.type('Cho đoạn code');
  await key.press('Enter');
  await btn('a', 'Khối mã').click();
  await key.type('def f():');
  await key.press('Enter');
  await key.type('    return 1');
  assert.equal(await btn('a', 'Khối mã').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#a').innerText(), /Khối mã · Esc/);
  await key.press('Enter');
  await key.press('Enter');
  await key.type('Sau code');
  assert.equal(await val('a'), 'Cho đoạn code<pre>def f():\n    return 1</pre><p>Sau code</p>');
  assert.doesNotMatch(await page.locator('#a').innerText(), /Khối mã · Esc/);

  // Esc, ↓ leave; the button turns a block back into text; Enter in an empty block = plain line
  await ed('b').click();
  await btn('b', 'Khối mã').click();
  await key.type('x = 1');
  await key.press('Escape');
  await key.type('sau esc');
  await key.press('Enter');
  await btn('b', 'Khối mã').click();
  await key.type('y = 2');
  await key.press('ArrowDown');
  await key.type('sau down');
  await key.press('Enter');
  await btn('b', 'Khối mã').click();
  await key.type('nham');
  await btn('b', 'Khối mã').click();
  await key.type(' bo');
  await key.press('Enter');
  await btn('b', 'Khối mã').click();
  await key.press('Enter');
  await key.type('dong thuong');
  assert.equal(await val('b'), '<pre>x = 1</pre><p>sau esc</p><pre>y = 2</pre><p>sau down</p><p>nham bo</p><p>dong thuong</p>');

  // Imported block code edits as one block and can be turned off without losing lines
  await ed('c').locator('pre').click();
  await key.press('End');
  await key.press('Enter');
  await key.type('print(2)');
  assert.equal(await val('c'), 'Đoạn code:<pre>x = 1\nprint(x)<br>print(2)</pre>');
  await btn('c', 'Khối mã').click();
  assert.equal(await val('c'), 'Đoạn code:<p>x = 1<br>print(x)<br>print(2)</p>');

  // Inline code from a bare caret; leave with the button, → or Esc
  await ed('d').click();
  await key.type('Dùng ');
  await btn('d', 'Mã (inline)').click();
  await key.type('sqrt(4)');
  await btn('d', 'Mã (inline)').click();
  await key.type(' và ');
  await btn('d', 'Mã (inline)').click();
  await key.type('f()');
  await key.press('ArrowRight');
  await key.type(' rồi ');
  await btn('d', 'Mã (inline)').click();
  await key.type('g');
  await key.press('Escape');
  await key.type('!');
  assert.equal(await val('d'), 'Dùng <code>sqrt(4)</code> và <code>f()</code> rồi <code>g</code>!');
  assert.ok(!(await val('d')).includes('​'), 'caret anchors are never stored');

  assert.deepEqual(errors, []);
  console.log('Editor regression checks passed');
} finally {
  await browser?.close();
  await server.close();
}
