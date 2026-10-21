// Run with: node tests/question-types-import.browser.mjs <absolute path to playwright package>
// Imports [Loại: Điền] and [Loại: Chọn] questions from pasted text the way a teacher writes them.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const checks = async () => {
  const { parseQuestionsFromHtml } = await import('/src/features/exams/parsers/questionParser.js');
  const { plainTextToHtml } = await import('/src/features/exams/parsers/txtExtractor.js');
  const { getQuestionIssues } = await import('/src/features/exams/utils/questionEditing.js');
  const { validateQuestions, scoreQuestion } = await import('/src/features/exams/utils/examSafety.js');
  const parse = (lines) => parseQuestionsFromHtml(plainTextToHtml(lines.join('\n')));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let checkCount = 0;
  const expect = (value, message) => { if (!value) throw new Error(message); checkCount++; };

  // Short answer: number + unit, an extra unit list, tolerance and an explanation after the key.
  const [disk, capital, pi] = parse([
    'Câu 1: Consider a magnetic disk drive with 8 surfaces, 512 tracks per surface, and 64 sectors per track. Sector size is 1 kB. What is the disk capacity [Loại: Điền]',
    'Đơn vị: KB, MB, GB',
    'Đáp án: 4096 KB',
    'Giải thích: 8 × 512 × 64 × 1 kB = 4096 KB.',
    'Câu 2: Thủ đô của Việt Nam? [Loại: Trả lời ngắn]',
    'Đáp án: Hà Nội | Ha Noi',
    'Câu 3: Số pi làm tròn? [Loại: Điền đáp án]',
    'Đáp án: 3,14',
    'Sai số: 0,01',
    'Lấy hai chữ số thập phân.',
  ]);
  expect(disk.type === 'short_answer' && !disk.content.includes('Loại'), 'short answer type, tag removed');
  expect(disk.answerKind === 'number' && same(disk.acceptedAnswers, ['4096']), 'numeric key without its unit');
  expect(same(disk.units, ['KB', 'MB', 'GB']) && disk.correctUnit === 0, 'unit list and right unit');
  expect(disk.explanation?.includes('4096 KB') && !('correctAnswer' in disk), 'explanation kept, no option key');
  expect(scoreQuestion(disk, { value: '4096', unit: 0 }) === 1 && scoreQuestion(disk, { value: '4096', unit: 1 }) === 0, 'imported key grades');
  expect(capital.answerKind === 'text' && same(capital.acceptedAnswers, ['Hà Nội', 'Ha Noi']) && !capital.units, 'text answers split on |');
  expect(pi.answerKind === 'number' && same(pi.acceptedAnswers, ['3,14']) && pi.tolerance === 0.01, 'decimal comma and tolerance');
  expect(pi.explanation?.includes('hai chữ số') && !pi.content.includes('hai chữ số'), 'lines after the key are the explanation');

  // Dropdown: arrows on each row, extra wrong choice, and the "Đáp án:" list form.
  const [dl, ordered] = parse([
    'Câu 4: Cho biết giá trị DL sau mỗi lệnh [Loại: Chọn]',
    'Lựa chọn: 38h | 41h | 55h | 0FFh | 10h',
    'A. DL=10 → 38h',
    'B. DL=8 -> 41h',
    'C. DL=55h => 55h',
    'D. DL=0FFh → 0FFh',
    'Câu 5: Ghép thủ đô [Loại: Chọn từ danh sách]',
    'A. Pháp',
    'B. Nhật',
    'Đáp án: B: Tokyo, A: Paris',
  ]);
  expect(dl.type === 'dropdown' && same(dl.options, ['DL=10', 'DL=8', 'DL=55h', 'DL=0FFh']), 'rows without their arrows');
  expect(same(dl.choices, ['38h', '41h', '55h', '0FFh', '10h']) && same(dl.correctAnswer, [0, 1, 2, 3]), 'choice list keeps order and distractor');
  expect(scoreQuestion(dl, [0, 1, 2, 0]) === 0.75, 'imported dropdown grades per row');
  expect(same(ordered.choices, ['Paris', 'Tokyo']) && same(ordered.correctAnswer, [0, 1]), 'lettered key line fills each row by its letter');

  // "Lựa chọn: A, B, C" must not be read as an answer introduced by "chọn"; a row without a key stays unset.
  const [letters] = parse(['Câu 6: Chọn nhóm [Loại: Chọn]', 'Lựa chọn: A, B, C', 'A. Sắt → B', 'B. Nhôm']);
  expect(same(letters.choices, ['A', 'B', 'C']) && same(letters.correctAnswer, [1, null]), 'single-letter choices and unset row');
  expect(getQuestionIssues(letters).some((m) => m.includes('dòng 2')), 'teacher is told which row lacks a key');

  // Choices that hold an arrow themselves: the row ends at the arrow before a known choice.
  const [widen] = parse(['Câu 9: Ghép lệnh mở rộng dấu [Loại: Chọn]', 'Lựa chọn: AL → AX | AX → DX:AX | AX → EAX', 'A. CBW → AL → AX', 'B. CWD → AX → DX:AX',
    'Đáp án: A-AL → AX, B-AX → DX:AX']);
  expect(same(widen.options, ['CBW', 'CWD']) && same(widen.choices, ['AL → AX', 'AX → DX:AX', 'AX → EAX']) && same(widen.correctAnswer, [0, 1]),
    'arrow inside a choice is not the row separator');

  // Existing types are untouched by the new tags.
  const [multi, single] = parse(['Câu 7: Chọn các số chẵn [Loại: Chọn nhiều]', 'A. 2', 'B. 3', 'C. 4', 'Đáp án: A, C', 'Câu 8: 1 + 1 = ?', 'A. 2', 'B. 3', 'Đáp án: A']);
  expect(multi.type === 'multiple' && same(multi.correctAnswer, [0, 2]), 'Chọn nhiều still multiple choice');
  expect(single.type === 'single' && single.correctAnswer === 0, 'untagged question still single choice');
  expect(!!validateQuestions([disk, capital, pi, dl, ordered, multi, single]), 'complete imports pass validation');
  return { checks: checkCount };
};

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'question-types-import',
  configureServer(server) {
    server.middlewares.use('/__question-types-test', async (_req, res) => {
      const html = '<!doctype html><html><head></head><body><script type="module">window.runChecks = ' + checks.toString().replace(/<\/script/gi, '<\\/script') + ';</script></body></html>';
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__question-types-test', html));
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0] + '__question-types-test');
  await page.waitForFunction(() => typeof window.runChecks === 'function');
  const result = await page.evaluate(() => window.runChecks());
  assert.equal(result.checks, 17);
  console.log('Question type import checks passed:', result);
} finally {
  await browser?.close();
  await server.close();
}
