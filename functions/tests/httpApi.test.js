import test from 'node:test';
import assert from 'node:assert/strict';
import { createExamHttpHandler, ApiError, METHODS } from '../httpApi.js';
import { ExamError } from '../policy.js';

function setup({ user = 'student-1', appCheckOk = true, service = {} } = {}) {
  const calls = [];
  const handle = createExamHttpHandler({
    service: {
      checkMaintenance: async () => calls.push('maintenance'),
      rateLimit: async uid => calls.push(`rate:${uid}`),
      getExamInfo: async (uid, input) => { calls.push(`getExamInfo:${uid}`); return { ok: true, input }; },
      ...service,
    },
    verifyUser: async header => {
      if (header !== 'Bearer good' || !user) throw new ApiError(401, 'unauthenticated', 'Vui lòng đăng nhập.');
      return user;
    },
    verifyAppCheck: async token => {
      if (!appCheckOk || token !== 'app-ok') throw new ApiError(401, 'unauthenticated', 'Ứng dụng chưa được xác minh.');
    },
  });
  const request = (over = {}) => handle({ method: 'POST', name: 'getExamInfo', headers: { authorization: 'Bearer good', 'x-firebase-appcheck': 'app-ok' }, body: { examId: 'e1' }, ...over });
  return { request, calls };
}

test('a signed-in, verified call reaches the service with the caller uid and the body', async () => {
  const { request, calls } = setup();
  const res = await request();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, input: { examId: 'e1' } });
  assert.deepEqual(calls, ['maintenance', 'rate:student-1', 'getExamInfo:student-1']);
});

test('no login, a bad token or a missing App Check token never touches data', async () => {
  for (const headers of [{}, { authorization: 'Bearer forged', 'x-firebase-appcheck': 'app-ok' }, { authorization: 'Bearer good' }]) {
    const { request, calls } = setup();
    const res = await request({ headers });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthenticated');
    assert.deepEqual(calls, []);
  }
});

test('only POST and only the listed exam methods are accepted', async () => {
  const { request, calls } = setup({ service: { constructor: async () => 'pwned' } });
  assert.equal((await request({ method: 'GET' })).status, 405);
  for (const name of ['constructor', 'toString', 'rateLimit', 'checkMaintenance', '__proto__', undefined]) {
    assert.equal((await request({ name })).status, 404, String(name));
  }
  assert.deepEqual(calls, []);
  assert.ok(METHODS.includes('saveAnswers') && METHODS.includes('submitAttempt'));
});

test('exam rule errors keep their code so the pages behave as with callable functions', async () => {
  const { request } = setup({ service: { getExamInfo: async () => { throw new ExamError('failed-precondition', 'Lượt thi đã nộp hoặc hết giờ.'); } } });
  const res = await request();
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'failed-precondition', message: 'Lượt thi đã nộp hoặc hết giờ.' } });
  const limited = await setup({ service: { rateLimit: async () => { throw new ExamError('resource-exhausted', 'Chậm lại.'); } } }).request();
  assert.equal(limited.status, 429);
});

test('unexpected failures return a generic message without internal details', async () => {
  const { request } = setup({ service: { getExamInfo: async () => { throw new Error('Firestore credentials /secret/path'); } } });
  const res = await request();
  assert.equal(res.status, 500);
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
});

test('a non-object body is treated as empty input', async () => {
  const { request } = setup();
  for (const body of [undefined, null, 'text', [1, 2]]) assert.deepEqual((await request({ body })).body.input, {});
});
