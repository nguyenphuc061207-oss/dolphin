import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screenCheck, securityLevel, securityViolation, requiresScreenVerification, isMonitoredLevel, monitoringProfile,
  allowsMobile, effectiveMode, storedSecurity,
  currentViolation, createViolationTracker, normalizeViolations, formatAway, deviceCapabilities,
} from '../src/features/exams/utils/examSecurity.js';

const IPHONE = { screenApi: false, fullscreenApi: false, touch: true };
const ANDROID = { screenApi: false, fullscreenApi: true, touch: true };
const FIREFOX_DESKTOP = { screenApi: false, fullscreenApi: true, touch: false };
const CHROME_DESKTOP = { screenApi: true, fullscreenApi: true, touch: false };

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

test('the phone switch lives inside Cấp 2: stored level stays strict, mobile is only the derived mode', () => {
  assert.equal(securityLevel({ securityLevel: 'strict', allowMobile: true }), 'strict');
  assert.equal(allowsMobile({ securityLevel: 'strict', allowMobile: true }), true);
  assert.equal(allowsMobile({ securityLevel: 'strict' }), false);
  assert.equal(effectiveMode('strict', true), 'mobile');
  assert.equal(effectiveMode('strict', false), 'strict');
  assert.equal(effectiveMode('normal', true), 'normal');
  assert.equal(effectiveMode('off', true), 'off');
  assert.equal(isMonitoredLevel('mobile'), true);
  assert.equal(isMonitoredLevel('strict'), true);
  assert.equal(isMonitoredLevel('normal'), false);
  for (const caps of [IPHONE, ANDROID, FIREFOX_DESKTOP]) assert.equal(monitoringProfile('strict', caps).screens, true);
});

test('legacy exams saved as mobile are read as Cấp 2 with the switch on', () => {
  assert.equal(securityLevel({ securityLevel: 'mobile', isAntiCheat: true }), 'strict');
  assert.equal(allowsMobile({ securityLevel: 'mobile' }), true);
  assert.equal(effectiveMode(securityLevel({ securityLevel: 'mobile' }), allowsMobile({ securityLevel: 'mobile' })), 'mobile');
});

test('the switch is only ever stored under Cấp 2', () => {
  assert.deepEqual(storedSecurity('strict', true), { securityLevel: 'strict', isAntiCheat: true, allowMobile: true });
  assert.deepEqual(storedSecurity('strict', false), { securityLevel: 'strict', isAntiCheat: true, allowMobile: false });
  assert.deepEqual(storedSecurity('normal', true), { securityLevel: 'normal', isAntiCheat: false, allowMobile: false });
  assert.deepEqual(storedSecurity('off', true), { securityLevel: 'off', isAntiCheat: false, allowMobile: false });
});

test('phone level: checks follow what the device can do, never weaker than Cấp 2 on Chrome desktop', () => {
  assert.deepEqual(monitoringProfile('mobile', CHROME_DESKTOP), monitoringProfile('strict', CHROME_DESKTOP));
  assert.deepEqual(monitoringProfile('mobile', IPHONE), { monitored: true, screens: false, fullscreen: false, focus: false, countEveryLeave: true });
  assert.equal(monitoringProfile('mobile', ANDROID).fullscreen, true);
  assert.equal(monitoringProfile('mobile', ANDROID).focus, false); // keyboards and system sheets steal focus on phones
  assert.equal(monitoringProfile('mobile', FIREFOX_DESKTOP).focus, true);
});

test('phone level: an iPhone without fullscreen is not blocked, a hidden page is', () => {
  const profile = monitoringProfile('mobile', IPHONE);
  const base = { profile, fullscreen: false, hidden: false, focused: false, screenState: 'single' };
  assert.equal(currentViolation(base), null);
  assert.equal(currentViolation({ ...base, hidden: true }).code, 'hidden');
  assert.equal(currentViolation({ ...base, hidden: true, includeHidden: false }), null);
  const android = monitoringProfile('mobile', ANDROID);
  assert.equal(currentViolation({ ...base, profile: android }).code, 'fullscreen');
});

test('capabilities are read from the browser, not guessed from the device name', () => {
  const win = (extra) => ({ isSecureContext: true, document: { documentElement: {} }, matchMedia: () => ({ matches: true }), ...extra });
  assert.deepEqual(deviceCapabilities(win({})), IPHONE);
  assert.equal(deviceCapabilities(win({ getScreenDetails() {} })).screenApi, true);
  assert.equal(deviceCapabilities(win({ isSecureContext: false, getScreenDetails() {} })).screenApi, false);
});

function trackerHarness() {
  let clock = 1000;
  const records = [];
  const tracker = createViolationTracker(() => clock);
  tracker.setReport({
    violation: (v) => records.push({ code: v.code, at: v.at, awayMs: v.awayMs }),
    update: (patch) => {
      const last = records[records.length - 1];
      if (patch.code) last.code = patch.code;
      if ('awayMs' in patch) last.awayMs = patch.awayMs;
    },
  });
  return { tracker, records, wait: (ms) => { clock += ms; } };
}

test('every leave on a phone is one violation, with how long the student was away', () => {
  const { tracker, records, wait } = trackerHarness();
  assert.equal(tracker.hidden(true), true);
  wait(45000); tracker.visible();
  assert.deepEqual(records, [{ code: 'hidden', at: 1000, awayMs: 45000 }]);
  // still locked, leaves again: counted again
  wait(5000); tracker.hidden(true); wait(3000); tracker.visible();
  assert.equal(records.length, 2);
  assert.equal(records[1].awayMs, 3000);
});

test('blur or fullscreen exit just before the page hides is the same leave, not two', () => {
  const { tracker, records, wait } = trackerHarness();
  tracker.raise({ code: 'fullscreen', message: '' }); // Android exits fullscreen while switching apps
  wait(300); tracker.hidden(true);
  wait(10000); tracker.visible();
  assert.deepEqual(records, [{ code: 'hidden', at: 1000, awayMs: 10300 - 300 }]);
});

test('Cấp 2 on a computer keeps one violation per incident until the student resumes', () => {
  const { tracker, records, wait } = trackerHarness();
  assert.equal(tracker.hidden(false), false); // the caller runs its normal check
  tracker.raise({ code: 'hidden', message: '' });
  wait(8000); tracker.visible();
  assert.equal(records[0].awayMs, 8000);
  wait(60000); tracker.hidden(false); wait(1000); tracker.visible(); // locked: no second record, away time untouched
  assert.equal(records.length, 1);
  assert.equal(records[0].awayMs, 8000);
});

test('violation lists from storage or the server are cleaned before use', () => {
  assert.deepEqual(normalizeViolations([{ code: 'hidden', at: 5.4, awayMs: 2.6 }, { code: 'hack', at: 1 }, null, { code: 'focus', at: 'x' }, { code: 'screens', at: 9, awayMs: -1 }]),
    [{ code: 'hidden', at: 5, awayMs: 3 }, { code: 'screens', at: 9, awayMs: null }]);
  assert.deepEqual(normalizeViolations('junk'), []);
  assert.equal(formatAway(45000), '45 giây');
  assert.equal(formatAway(125000), '2 phút 5 giây');
  assert.equal(formatAway(null), 'không rõ thời gian');
});
