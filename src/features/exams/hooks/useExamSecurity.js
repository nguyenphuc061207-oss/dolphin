import { useCallback, useEffect, useRef, useState } from 'react';
import { withTimeout } from '@/shared/utils/runtimeSafety';
import { screenCheck, securityViolation, requiresScreenVerification } from '../utils/examSecurity';

export default function useExamSecurity(level, started, onViolation) {
  const detailsRef = useRef(null);
  const permissionRef = useRef(null);
  const verifiedRef = useRef(false);
  const incidentRef = useRef(false);
  const busyRef = useRef(false);
  const [screenState, setScreenState] = useState('unknown');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState(0);

  const inspect = useCallback(() => screenCheck(detailsRef.current, window.screen,
    verifiedRef.current && (!permissionRef.current || permissionRef.current.state === 'granted')), []);

  useEffect(() => { if (!started) incidentRef.current = false; }, [started]);

  const check = useCallback(() => {
    const state = inspect();
    setScreenState(state);
    const reason = securityViolation({ level, fullscreen: !!document.fullscreenElement,
      hidden: document.hidden, focused: document.hasFocus(), screenState: state });
    if (started && reason && !incidentRef.current) {
      incidentRef.current = true;
      onViolation(reason);
    }
    return reason;
  }, [inspect, level, started, onViolation]);

  const prepare = useCallback(async () => {
    if (!requiresScreenVerification(level)) return true;
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
      const state = inspect(); setScreenState(state); setVersion(v => v + 1);
      if (state !== 'single') throw new Error(state === 'multiple'
        ? 'Phát hiện màn hình phụ. Hãy ngắt kết nối màn hình phụ rồi kiểm tra lại.'
        : 'Không xác minh được một màn hình duy nhất. Không thể bắt đầu bài thi.');
      return true;
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Bạn cần cấp quyền quản lý cửa sổ/màn hình để kiểm tra màn hình phụ. Hãy cấp quyền trong cài đặt trang rồi kiểm tra lại.' : err.message);
      setScreenState(inspect());
      return false;
    } finally { busyRef.current = false; setChecking(false); }
  }, [inspect, level]);

  useEffect(() => {
    if (!requiresScreenVerification(level)) return;
    const details = detailsRef.current, permission = permissionRef.current;
    const listener = () => check();
    const timer = setInterval(listener, 1000);
    details?.addEventListener('screenschange', listener);
    window.screen?.addEventListener('change', listener);
    permission?.addEventListener('change', listener);
    if (started) {
      document.addEventListener('visibilitychange', listener);
      document.addEventListener('fullscreenchange', listener);
      window.addEventListener('blur', listener);
      window.addEventListener('focus', listener);
    }
    return () => {
      clearInterval(timer);
      details?.removeEventListener('screenschange', listener);
      window.screen?.removeEventListener('change', listener);
      permission?.removeEventListener('change', listener);
      document.removeEventListener('visibilitychange', listener);
      document.removeEventListener('fullscreenchange', listener);
      window.removeEventListener('blur', listener); window.removeEventListener('focus', listener);
    };
  }, [level, started, check, version]);

  const resume = () => {
    const reason = check();
    if (reason) { setError(reason); return false; }
    incidentRef.current = false; setError(''); return true;
  };
  return { screenState, error, checking, prepare, inspect, resume };
}
