// Stored levels. Cấp 2 has one switch, allowMobile: when on, phones and tablets may enter and
// the checks follow each device (see effectiveMode). Exams saved as securityLevel 'mobile'
// before this switch existed are read as Cấp 2 with allowMobile on.
export const SECURITY_LEVELS = ['off', 'normal', 'strict'];

export function securityLevel(exam) {
  if (exam?.securityLevel === 'mobile') return 'strict';
  if (SECURITY_LEVELS.includes(exam?.securityLevel)) return exam.securityLevel;
  if (exam?.securityLevel != null) return 'strict';
  return exam?.isAntiCheat ? 'strict' : 'off';
}

export function allowsMobile(exam) {
  return exam?.allowMobile === true || exam?.securityLevel === 'mobile';
}

/** Fields written to the exam document. allowMobile only means something under Cấp 2. */
export function storedSecurity(level, allowMobileChoice) {
  const monitored = isMonitoredLevel(level);
  return {
    securityLevel: level,
    isAntiCheat: monitored,
    allowMobile: level === 'strict' && !!allowMobileChoice,
  };
}

/**
 * The checks actually run: 'mobile' is Cấp 2 with the phone switch on, an internal name only.
 * Never stored, so a teacher's choice is always Cấp 2 in the database.
 */
export function effectiveMode(level, allowMobileChoice) {
  return level === 'strict' && allowMobileChoice ? 'mobile' : level;
}

/** Levels that lock the exam and record violations (shown as "Giám sát" to the teacher). */
export function isMonitoredLevel(level) {
  return level === 'strict' || level === 'mobile';
}

export function screenCheck(details, screen, verified) {
  if (screen?.isExtended === true || (Array.isArray(details?.screens) && details.screens.length > 1)) return 'multiple';
  if (!verified || !Array.isArray(details?.screens) || details.screens.length !== 1) return 'unknown';
  return 'single';
}

export function requiresScreenVerification(level) {
  return level === 'strict';
}

/** What this browser can do, read once from the real window. */
export function deviceCapabilities(win = globalThis.window) {
  return {
    screenApi: !!win?.isSecureContext && typeof win?.getScreenDetails === 'function',
    fullscreenApi: typeof win?.document?.documentElement?.requestFullscreen === 'function',
    touch: !!win?.matchMedia?.('(pointer: coarse)').matches,
  };
}

/**
 * Which checks apply. Decided by what the device supports, never by guessing "is this a phone":
 * a 'mobile' exam on Chrome/Edge desktop is exactly as strict as Cấp 2.
 */
export function monitoringProfile(level, caps) {
  if (level === 'strict') return { monitored: true, screens: true, fullscreen: true, focus: true, countEveryLeave: false };
  if (level === 'mobile') {
    if (caps.screenApi) return { monitored: true, screens: true, fullscreen: true, focus: true, countEveryLeave: false };
    // Phones lose focus to keyboards and system sheets, so only a hidden page counts there.
    return { monitored: true, screens: false, fullscreen: caps.fullscreenApi, focus: !caps.touch, countEveryLeave: true };
  }
  return { monitored: false, screens: false, fullscreen: level === 'normal', focus: false, countEveryLeave: false };
}

const MESSAGES = {
  screens: 'Phát hiện màn hình phụ. Hãy ngắt kết nối màn hình phụ trước khi tiếp tục.',
  unverified: 'Không xác minh được màn hình. Hãy cấp quyền kiểm tra màn hình để tiếp tục.',
  fullscreen: 'Bạn đã thoát toàn màn hình. Hãy mở lại toàn màn hình để tiếp tục.',
  hidden: 'Bạn đã rời tab hoặc cửa sổ bài thi. Hãy quay lại bài thi để tiếp tục.',
};

/** Reason labels for the teacher's view of a submission. */
export const VIOLATION_LABELS = {
  screens: 'Màn hình phụ',
  fullscreen: 'Thoát toàn màn hình',
  focus: 'Rời cửa sổ bài thi',
  hidden: 'Rời trang bài thi',
};

/** { code, message } of the current violation, or null. `hidden` is skipped when every leave is counted separately. */
export function currentViolation({ profile, fullscreen, hidden, focused, screenState, includeHidden = true }) {
  if (!profile?.monitored) return null;
  if (profile.screens && screenState === 'multiple') return { code: 'screens', message: MESSAGES.screens };
  if (profile.screens && screenState !== 'single') return { code: 'screens', message: MESSAGES.unverified };
  if (profile.fullscreen && !fullscreen) return { code: 'fullscreen', message: MESSAGES.fullscreen };
  if (includeHidden && hidden) return { code: 'hidden', message: MESSAGES.hidden };
  if (profile.focus && !focused) return { code: 'focus', message: MESSAGES.hidden };
  return null;
}

export function securityViolation({ level, fullscreen, hidden, focused, screenState }) {
  const profile = monitoringProfile(level, { screenApi: true, fullscreenApi: true, touch: false });
  return level === 'strict' ? currentViolation({ profile, fullscreen, hidden, focused, screenState })?.message || '' : '';
}

export const HIDDEN_MESSAGE = MESSAGES.hidden;

// A leave seen within this window of an open incident is the same event
// (browsers report blur / fullscreen exit just before the page is hidden).
export const SAME_EVENT_MS = 2000;

/**
 * Turns page events into violation records.
 * report.violation({ code, message, at, awayMs }) – a new violation.
 * report.update(patch) – amend the latest one (its reason, or how long the student was away).
 */
export function createViolationTracker(now = Date.now) {
  let incident = null; // { at } while a violation is unresolved
  let hiddenSince = null;
  let report = null;
  const getReport = () => report;
  const raise = (violation) => {
    incident = { at: now() };
    getReport()?.violation({ code: violation.code, message: violation.message, at: incident.at, awayMs: null });
  };
  return {
    setReport(next) { report = next; },
    isOpen: () => !!incident,
    raise,
    resolve() { incident = null; },
    reset() { incident = null; hiddenSince = null; },
    /** Page hidden. Returns true when handled here; otherwise the caller runs its normal check. */
    hidden(countEveryLeave) {
      hiddenSince = now();
      if (!countEveryLeave) return false;
      if (incident && now() - incident.at < SAME_EVENT_MS) getReport()?.update({ code: 'hidden', message: MESSAGES.hidden });
      else raise({ code: 'hidden', message: MESSAGES.hidden });
      return true;
    },
    /** Page visible again: the away time belongs to the violation raised when (or just before) it was hidden. */
    visible() {
      const since = hiddenSince;
      hiddenSince = null;
      if (since != null && incident && incident.at >= since - SAME_EVENT_MS) getReport()?.update({ awayMs: now() - since });
    },
  };
}

/** Keep a violation list well-formed: [{ code, at, awayMs }] ordered by time, at most 200 entries. */
export function normalizeViolations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(v => v && Object.hasOwn(VIOLATION_LABELS, v.code) && Number.isFinite(v.at))
    .slice(0, 200)
    .map(v => ({ code: v.code, at: Math.round(v.at), awayMs: Number.isFinite(v.awayMs) && v.awayMs >= 0 ? Math.round(Math.min(v.awayMs, 86400000)) : null }));
}

/** "45 giây", "2 phút 5 giây" */
export function formatAway(ms) {
  if (!Number.isFinite(ms)) return 'không rõ thời gian';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}
