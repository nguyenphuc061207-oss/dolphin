import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withTimeout } from '@/shared/utils/runtimeSafety';
import { screenCheck, currentViolation, deviceCapabilities, monitoringProfile, createViolationTracker } from '../utils/examSecurity';

/** `report` receives the violations; see createViolationTracker. */
export default function useExamSecurity(level, started, report) {
  const caps = useMemo(() => deviceCapabilities(), []);
  const profile = useMemo(() => monitoringProfile(level, caps), [level, caps]);
  const detailsRef = useRef(null);
  const permissionRef = useRef(null);
  const verifiedRef = useRef(false);
  const busyRef = useRef(false);
  const [tracker] = useState(() => createViolationTracker());
  const [screenState, setScreenState] = useState('unknown');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => { tracker.setReport(report); }, [tracker, report]);

  // Devices that skip the screen check report 'single' so every caller can treat them alike.
  const inspect = useCallback(() => (profile.screens
    ? screenCheck(detailsRef.current, window.screen,
      verifiedRef.current && (!permissionRef.current || permissionRef.current.state === 'granted'))
    : 'single'), [profile.screens]);

  useEffect(() => { if (!started) tracker.reset(); }, [started, tracker]);

  const state = useCallback((includeHidden) => currentViolation({
    profile, fullscreen: !!document.fullscreenElement, hidden: document.hidden,
    focused: document.hasFocus(), screenState: inspect(), includeHidden,
  }), [profile, inspect]);

  const check = useCallback(() => {
    setScreenState(inspect());
    // When every leave is counted on its own, the visibility handler owns "hidden".
    const violation = state(!profile.countEveryLeave);
    if (started && violation && !tracker.isOpen()) tracker.raise(violation);
    return violation?.message || '';
  }, [inspect, state, profile.countEveryLeave, started, tracker]);

  const prepare = useCallback(async () => {
    if (!profile.screens) return true;
    if (busyRef.current) return false;
    busyRef.current = true; setChecking(true); setError('');
    verifiedRef.current = false;
    try {
      if (!window.isSecureContext || typeof window.getScreenDetails !== 'function') {
        throw new Error('Trình duyệt này không hỗ trợ xác minh màn hình. Hãy mở bài thi bằng Chrome hoặc Edge trên máy tính qua HTTPS hoặc localhost.');
      }
      const details = await withTimeout(window.getScreenDetails(), 20000);
      let permission = null;
      try { permission = await navigator.permissions.query({ name: 'window-management' }); } catch { /* getScreenDetails already obtained permission */ }
      detailsRef.current = details; permissionRef.current = permission; verifiedRef.current = true;
      const screens = inspect(); setScreenState(screens); setVersion(v => v + 1);
      if (screens !== 'single') throw new Error(screens === 'multiple'
        ? 'Phát hiện màn hình phụ. Hãy ngắt kết nối màn hình phụ rồi kiểm tra lại.'
        : 'Không xác minh được một màn hình duy nhất. Không thể bắt đầu bài thi.');
      return true;
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Bạn cần cấp quyền quản lý cửa sổ/màn hình để kiểm tra màn hình phụ. Hãy cấp quyền trong cài đặt trang rồi kiểm tra lại.' : err.message);
      setScreenState(inspect());
      return false;
    } finally { busyRef.current = false; setChecking(false); }
  }, [inspect, profile.screens]);

  useEffect(() => {
    if (!profile.monitored) return;
    const details = detailsRef.current, permission = permissionRef.current;
    const listener = () => check();
    const onVisibility = () => {
      if (!started) return;
      if (document.hidden) { if (!tracker.hidden(profile.countEveryLeave)) check(); return; }
      tracker.visible();
      check();
    };
    const timer = setInterval(listener, 1000);
    details?.addEventListener('screenschange', listener);
    window.screen?.addEventListener('change', listener);
    permission?.addEventListener('change', listener);
    if (started) {
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('fullscreenchange', listener);
      window.addEventListener('blur', listener);
      window.addEventListener('focus', listener);
    }
    return () => {
      clearInterval(timer);
      details?.removeEventListener('screenschange', listener);
      window.screen?.removeEventListener('change', listener);
      permission?.removeEventListener('change', listener);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', listener);
      window.removeEventListener('blur', listener); window.removeEventListener('focus', listener);
    };
  }, [profile.monitored, profile.countEveryLeave, started, check, tracker, version]);

  // Keep a phone screen on: an automatic screen lock would otherwise count as leaving the exam.
  useEffect(() => {
    if (!started || !profile.countEveryLeave || !navigator.wakeLock) return undefined;
    let lock = null, alive = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen')
        .then(l => { if (alive) lock = l; else l.release().catch(() => {}); })
        .catch(() => { /* Not granted (low battery, unsupported): exam still works. */ });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [started, profile.countEveryLeave]);

  const resume = () => {
    const reason = check();
    if (reason || document.hidden) { setError(reason); return false; }
    tracker.resolve(); setError(''); return true;
  };
  /** True while answers must not be accepted. */
  const blocked = () => profile.monitored && !!state(true);
  return { profile, screenState, error, checking, prepare, inspect, resume, blocked };
}
