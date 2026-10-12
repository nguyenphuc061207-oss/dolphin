// node tests/exam-progress.browser.mjs <path to playwright package>
// Uses local Firestore fixtures; never connects to the production project.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');

const firestore = `
export const db = {};
export const collection = (_, name) => ({name});
export const doc = (_, name, id) => ({name: name || _.name, id: id || 'attempt-fixture'});
export const where = (field, op, value) => ({field, op, value});
export const query = (ref, ...filters) => ({...ref, filters});
export const serverTimestamp = () => new Date();
const all = () => JSON.parse(localStorage.getItem('test-submissions') || '[]');
const snap = data => ({id: data.id, data: () => data, exists: () => true});
export const getDocs = async ref => {
  const docs = all().filter(s => (ref.filters || []).every(f => s[f.field] === f.value)).map(snap);
  return {docs, size: docs.length, forEach: fn => docs.forEach(fn)};
};
export const getDoc = async () => snap({
 title: 'Recovery exam', teacherId: 'teacher', teacherName: 'Teacher', duration: 5,
 attemptLimit: 1, securityLevel: 'off', accessType: 'public', examFlow: {mode:'single', allowBack:true},
 questions: [{type:'essay', content:'First question'}, {type:'essay', content:'Second question'}]
});
export const setDoc = async (ref, data) => localStorage.setItem('test-submissions', JSON.stringify([...all().filter(s=>s.id!==ref.id), {...data,id:ref.id}]));
export const updateDoc = async () => {};
`;
const mount = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import {AuthContext} from '/src/features/auth/context/AuthContext.js';
import TakeExam from '/src/features/exams/pages/TakeExam.jsx';
import StudentDashboard from '/src/features/exams/pages/StudentDashboard.jsx';
import '/src/app/styles/index.css';
const route = new URLSearchParams(location.search).get('route') || '/student';
const uid = new URLSearchParams(location.search).get('uid') || 'student-a';
createRoot(document.getElementById('root')).render(
 React.createElement(AuthContext.Provider, {value:{currentUser:{uid,displayName:'Student A',shortId:'1234'}}},
 React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(Routes,null,
 React.createElement(Route,{path:'/student',element:React.createElement(StudentDashboard)}),
 React.createElement(Route,{path:'/student/exam/:examId',element:React.createElement(TakeExam)})))))
`;
const server = await createServer({ server: {host:'127.0.0.1',port:0}, plugins:[{
  name: 'exam-progress-fixtures', enforce: 'pre',
  resolveId(id) { if (id === 'firebase/firestore' || /\/src\/shared\/config\/firebase(?:\.js)?$/.test(id.replaceAll('\\', '/'))) return '\0exam-fixtures'; },
  load(id) { if (id === '\0exam-fixtures') return firestore; },
  configureServer(server) {
    server.middlewares.use('/__exam-progress', async (_req,res) => {
      res.setHeader('Content-Type','text/html');
      res.end(await server.transformIndexHtml('/__exam-progress', `<!doctype html><html><body><div id="root"></div><script type="module">${mount}</script></body></html>`));
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({channel:'msedge',headless:true});
  const context = await browser.newContext();
  const errors = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
  });
  const base = server.resolvedUrls.local[0] + '__exam-progress';
  let page = await context.newPage();
  await page.goto(base + '?route=/student/exam/exam-a');
  await page.getByRole('button',{name:'Bắt đầu thi',exact:true}).click();
  await page.getByPlaceholder('Nhập câu trả lời của bạn...').fill('First saved answer');
  await page.getByRole('button',{name:'Tiếp',exact:true}).click();
  await page.getByPlaceholder('Nhập câu trả lời của bạn...').fill('Second saved answer');
  const key = 'exam_progress_exam-a_student-a';
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.userAnswers[1] === 'Second saved answer',key);
  const original = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await page.close();
  page = await context.newPage();
  await page.goto(base);
  await page.getByRole('link',{name:'Tiếp tục làm bài',exact:true}).click();
  await page.getByRole('button',{name:'Tiếp tục làm bài',exact:true}).click();
  assert.equal(await page.getByPlaceholder('Nhập câu trả lời của bạn...').inputValue(),'Second saved answer');
  const restored = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.deepEqual(restored.userAnswers,original.userAnswers);
  assert.equal(restored.deadline,original.deadline);
  assert.equal(restored.attemptId,original.attemptId);
  assert.equal(restored.page,1);
  await page.getByRole('button',{name:'Quay lại',exact:true}).click();
  await page.getByRole('button',{name:'Lưu và thoát',exact:true}).click();
  await page.getByRole('link',{name:'Tiếp tục làm bài',exact:true}).waitFor();
  await page.goto(base + '?uid=student-b');
  await page.getByRole('heading',{name:'Bài thi của bạn'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Tiếp tục làm bài',exact:true}).count(),0);
  // Closed-tab time is not restored: an expired draft submits its saved answers.
  await page.evaluate(key => {
    const saved=JSON.parse(localStorage.getItem(key));
    saved.deadline=Date.now()-1000;
    localStorage.setItem(key,JSON.stringify(saved));
  },key);
  await page.goto(base + '?route=/student/exam/exam-a');
  await page.getByRole('button',{name:'Tiếp tục làm bài',exact:true}).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('test-submissions') || '[]').length === 1);
  const submitted = await page.evaluate(()=>JSON.parse(localStorage.getItem('test-submissions'))[0]);
  assert.equal(submitted.id,original.attemptId);
  assert.deepEqual(submitted.answers,original.userAnswers);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: close/reopen, restore answers/page/deadline/attempt, save and exit, account isolation, expired auto-submit');
} finally {
  await browser?.close();
  await server.close();
}
