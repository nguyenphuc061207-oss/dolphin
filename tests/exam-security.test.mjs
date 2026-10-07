import test from 'node:test';
import assert from 'node:assert/strict';
import { screenCheck, securityLevel, securityViolation, requiresScreenVerification } from '../src/features/exams/utils/examSecurity.js';

test('legacy exams retain strict/off behavior and explicit normal has no monitoring', () => {
  assert.equal(securityLevel({ isAntiCheat: true }), 'strict');
  assert.equal(securityLevel({ isAntiCheat: false }), 'off');
  assert.equal(securityLevel({ securityLevel: 'normal', isAntiCheat: true }), 'normal');
  assert.equal(securityLevel({ securityLevel: 'unexpected' }), 'strict');
});
test('only strict requires screen verification; normal/off do not request screen access', () => {
  assert.equal(requiresScreenVerification('normal'), false);
  assert.equal(requiresScreenVerification('off'), false);
  assert.equal(requiresScreenVerification('strict'), true);
  assert.equal(requiresScreenVerification(securityLevel({ isAntiCheat: true })), true);
});
test('unknown/unsupported/denied screens cannot pass strict preflight', () => {
  assert.equal(screenCheck(null, {}, false), 'unknown');
  assert.equal(screenCheck(null, { isExtended: false }, false), 'unknown');
  assert.equal(screenCheck({ screens: [{}] }, { isExtended: false }, false), 'unknown');
  assert.equal(screenCheck({ screens: [] }, {}, true), 'unknown');
  assert.equal(screenCheck({ screens: [{}] }, {}, true), 'single');
});
test('multiple monitors are rejected even when the two signals disagree', () => {
  assert.equal(screenCheck({ screens: [{}] }, { isExtended: true }, true), 'multiple');
  assert.equal(screenCheck({ screens: [{}, {}] }, { isExtended: false }, true), 'multiple');
});
test('strict blocks tab switching, window focus loss, fullscreen exit and attached screens', () => {
  const safe = { level: 'strict', fullscreen: true, hidden: false, focused: true, screenState: 'single' };
  assert.equal(securityViolation(safe), '');
  for (const change of [{ hidden: true }, { focused: false }, { fullscreen: false }, { screenState: 'multiple' }, { screenState: 'unknown' }]) assert.notEqual(securityViolation({ ...safe, ...change }), '');
});
test('normal/off never generate monitoring violations', () => {
  for (const level of ['normal', 'off']) assert.equal(securityViolation({ level, fullscreen: false, hidden: true, focused: false, screenState: 'multiple' }), '');
});
