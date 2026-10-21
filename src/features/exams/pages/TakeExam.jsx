import useExamSecurity from '../hooks/useExamSecurity';
import { securityLevel, allowsMobile, effectiveMode, isMonitoredLevel, normalizeViolations } from '../utils/examSecurity';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import RichTextRenderer from "@/shared/components/RichTextRenderer";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";
import {
  Flag,
  Clock,
  Send,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Lock,
  Route,
  FileText,
  Users,
  ListChecks,
  ZoomIn,
  ZoomOut,
  PenLine,
  LayoutGrid,
  X,
  Shield,
} from "lucide-react";

import { storageOperation } from '@/shared/utils/runtimeSafety';
import { validateQuestions } from '../utils/examSafety';
import { TYPE_LABELS, isTypedType } from '../utils/questionEditing';
import { getExamInfo, startAttempt, saveAnswers, submitAttempt } from '../services/examApi';
import { readExamProgress, removeExamProgress } from '../utils/examProgress';
import { normalizeFlow, pageOf, pageStart, pageEnd, describeFlow } from '../utils/examFlow';

// ── Helpers ──────────────────────────────────────────────
/** Whether a question has been answered (any type) */
function isAnswered(answer, type) {
  if (type === 'essay') return typeof answer === 'string' && answer.trim() !== '';
  if (type === 'short_answer') return typeof answer?.value === 'string' && answer.value.trim() !== '';
  if (type === 'multiple') return Array.isArray(answer) && answer.length > 0;
  if (type === 'multi_true_false') return Array.isArray(answer) && answer.some(v => v !== null && v !== undefined);
  return answer !== undefined && answer !== null;
}

/** Typed answer of a short-answer question: the value plus a unit picked from the question's list. */
function ShortAnswerInput({ id, question, answer, fontSize, onChange }) {
  const value = typeof answer?.value === 'string' ? answer.value : '';
  const unit = Number.isInteger(answer?.unit) ? answer.unit : null;
  const numeric = question.answerKind === 'number';
  const units = question.units || [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-bold text-gray-700">Đáp án:</label>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange({ value: e.target.value })}
          inputMode={numeric ? 'decimal' : undefined}
          autoComplete="off"
          maxLength={500}
          placeholder={numeric ? 'VD: 12,5' : 'Nhập đáp án…'}
          className="flex-1 min-w-[10rem] max-w-md px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent exam-text bg-gray-50 transition-shadow"
          style={{ fontSize: `${fontSize}px` }}
        />
        {units.length > 0 && (
          <select
            value={unit ?? ''}
            onChange={(e) => onChange({ unit: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Đơn vị"
            className="w-32 px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-cyan-400 bg-white text-sm"
          >
            <option value="">Đơn vị…</option>
            {units.map((u, ui) => <option key={ui} value={ui}>{u}</option>)}
          </select>
        )}
      </div>
      {units.length > 0 && value.trim() && unit === null && (
        <p className="mt-2 text-xs font-semibold text-amber-600" role="status">Bạn chưa chọn đơn vị – câu trả lời sẽ bị tính sai nếu thiếu đơn vị.</p>
      )}
    </div>
  );
}

/** Toggle index in a multiple-choice answer array */
function toggleMultiple(prev, idx) {
  idx = Number(idx);
  const arr = Array.isArray(prev) ? [...prev].map(Number) : [];
  const pos = arr.indexOf(idx);
  if (pos >= 0) arr.splice(pos, 1);
  else arr.push(idx);
  return arr;
}

/** Helper to determine if all options are short for grid rendering */
function isShortOptions(options) {
  if (!options || options.length === 0) return false;
  return options.every(opt => {
    if (!opt) return true;
    if (opt.includes('[IMG:') || opt.includes('<img')) return false;
    const cleanText = opt.replace(/<[^>]+>/g, '').replace(/\$/g, '');
    return cleanText.trim().length < 35;
  });
}

export default function TakeExam() {
  const { examId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const [savedProgress, setSavedProgress] = useState(null);
  const [progressError, setProgressError] = useState('');
  const [legacyBackup, setLegacyBackup] = useState(null);
  const [autoSubmitted, setAutoSubmitted] = useState(null); // previous attempt submitted by the server when its time ran out
  const [deadline, setDeadline] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [cheatCount, setCheatCount] = useState(0);
  const [violations, setViolations] = useState([]); // [{ code, at, awayMs }] sent with the attempt
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const [submissionCount, setSubmissionCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [studentManualName, setStudentManualName] = useState(currentUser?.displayName || "");
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [page, setPage] = useState(0);         // current page (examFlow)
  const [maxPage, setMaxPage] = useState(0);    // furthest page reached – locks earlier pages when going back is off
  const [showConfirmNext, setShowConfirmNext] = useState(false);
  const scrollRef = useRef(null);

  useDocumentTitle(hasStarted ? "Dolphin | Đang làm bài thi..." : "Dolphin | Chuẩn bị thi");

  const questionRefs = useRef([]);
  const isSubmittingRef = useRef(false);
  const attemptIdRef = useRef(null);
  const payloadRef = useRef(null);
  const autoSubmittedRef = useRef(false);
  const saveProgressRef = useRef(null);
  const revisionRef = useRef(0);
  const serverOffsetRef = useRef(0);
  const [syncMessage, setSyncMessage] = useState('');

  const level = securityLevel(exam);
  const mode = effectiveMode(level, allowsMobile(exam));
  const monitored = isMonitoredLevel(mode);

  // Violations are written to the device synchronously: a phone may suspend or close
  // the tab right after the page is hidden, before React renders again.
  const violationsRef = useRef([]);
  const violationsKey = `exam_violations_${examId}_${currentUser?.uid || 'anonymous'}`;
  const storeViolations = useCallback((list) => {
    violationsRef.current = list;
    setViolations(list);
    storageOperation('setItem', violationsKey, JSON.stringify({ attemptId: attemptIdRef.current, list }));
  }, [violationsKey]);
  const report = useMemo(() => ({
    violation(record) {
      if (isSubmittingRef.current) return;
      storeViolations([...violationsRef.current, { code: record.code, at: record.at, awayMs: null }]);
      setCheatCount(v => v + 1); setIsInterrupted(true); setSecurityMessage(record.message);
    },
    update(patch) {
      const list = violationsRef.current;
      if (!list.length) return;
      const last = { ...list[list.length - 1] };
      if (patch.code) last.code = patch.code;
      if ('awayMs' in patch) last.awayMs = patch.awayMs;
      storeViolations([...list.slice(0, -1), last]);
      if (patch.message) setSecurityMessage(patch.message);
    },
  }), [storeViolations]);
  const security = useExamSecurity(mode, hasStarted, report);
  const { profile } = security;
  // Cấp 1 always needs fullscreen; the phone level only where the device has it (not iPhone).
  const fullscreenRequired = level === 'normal' || (monitored && profile.fullscreen);
  const screenVerificationRequired = profile.screens;
  const startInFlightRef = useRef(false);

  // Anti-cheat: DevTools Console self-XSS warning
  useEffect(() => {
    if (!monitored) return;
    const warningTitle = "⚠️ DỪNG LẠI!";
    const warningTitleStyle = "color: #ff0000; font-size: 40px; font-weight: 800; font-family: sans-serif; text-shadow: 2px 2px 0px #000; padding: 10px;";
    
    const warningDesc = "Đây là tính năng dành cho nhà phát triển (Developer Tools).\n\nNếu ai đó yêu cầu bạn sao chép và dán bất kỳ đoạn mã (code) nào vào đây để \"HACK ĐÁP ÁN\" hoặc \"XEM ĐÁP ÁN TRƯỚC\", ĐỪNG LÀM THEO! Đó là một trò lừa đảo.\n\nViệc dán code lạ vào Console có thể dẫn đến:\n1. Bị phát hiện gian lận và HỦY BỎ BÀI THI ngay lập tức.\n2. Bị đánh cắp thông tin đăng nhập tài khoản.\n3. Gửi các yêu cầu phá hoại lên hệ thống dưới danh nghĩa của bạn.\n\nHãy tập trung làm bài bằng chính năng lực của mình để đạt kết quả tốt nhất!";
    const warningDescStyle = "color: #1e293b; font-size: 14px; font-weight: 600; font-family: sans-serif; line-height: 1.6; padding: 5px;";
    
    const alertStyle = "color: #b91c1c; font-size: 16px; font-weight: 800; font-family: sans-serif; text-transform: uppercase;";

    console.log(`%c${warningTitle}`, warningTitleStyle);
    console.log(`%c${warningDesc}`, warningDescStyle);
    console.log(`%c👉 MỌI HÀNH VI GIAN LẬN SẼ BỊ HỆ THỐNG GHI LẠI VÀ BÁO CÁO CHO GIÁO VIÊN!`, alertStyle);
  }, [monitored]);

  // Fetch exam
  useEffect(() => {
    let active = true;
    const fetchExam = async () => {
      setLoading(true); setLoadError(''); setExam(null);
      setSavedProgress(null); setProgressError('');
      setLegacyBackup(null);
      setHasStarted(false); setUserAnswers({}); setSubmissionAttempted(false); setSubmitting(false); setPage(0); setMaxPage(0); setShowConfirmNext(false);
      setCheatCount(0); violationsRef.current = []; setViolations([]); setDeadline(null); setSubmissionCount(0); setStorageWarning(''); setAutoSubmitted(null);
      attemptIdRef.current = null; payloadRef.current = null; isSubmittingRef.current = false; autoSubmittedRef.current = false;
      try {
        const data = await getExamInfo({ examId });
        if (!active) return;
        const session = data.activeAttempt;
        setSubmissionCount(data.submissionCount);
        setAutoSubmitted(data.autoSubmitted || null);
        setSavedProgress(session);
        setExam({ ...data, questions: session?.exam.questions || [] });
        setTimeLeft(Number(data.duration) * 60);
        if (session?.studentName) setStudentManualName(session.studentName);
        // Sanitize any legacy local snapshot, retaining answers for recovery.
        try {
          let local = readExamProgress(examId, currentUser.uid, data.duration * 60);
          // The server just submitted this attempt (time ran out): nothing left to recover.
          if (local && data.autoSubmitted && local.attemptId === data.autoSubmitted.submissionId) {
            try { removeExamProgress(examId, currentUser.uid); } catch { /* storage unavailable: nothing to clean */ }
            local = null;
          }
          if (local) {
            storageOperation('setItem', `exam_progress_${examId}_${currentUser.uid}`, JSON.stringify(local));
            if (!session || local.attemptId !== session.attemptId) {
              const backup = { userAnswers: local.userAnswers, examSnapshot: local.examSnapshot };
              const archived = storageOperation('setItem', `exam_legacy_progress_${examId}_${currentUser.uid}`, JSON.stringify(backup));
              if (!archived.ok) throw new Error('Không lưu được bản sao bài cũ.');
              setLegacyBackup(backup);
              storageOperation('removeItem', `exam_progress_${examId}_${currentUser.uid}`);
              setStorageWarning('Bản làm chưa xong cũ đã được giữ lại trên thiết bị. Lượt mới dùng hạn giờ và dữ liệu do máy chủ xác nhận.');
            }
          }
          const legacy = storageOperation('getItem', `exam_legacy_progress_${examId}_${currentUser.uid}`);
          if (legacy.ok && legacy.value) setLegacyBackup(JSON.parse(legacy.value));
        } catch { setProgressError('Không đọc được bản lưu trên thiết bị. Hãy liên hệ giáo viên trước khi bắt đầu lượt mới.'); }
      } catch (e) {
        console.error(e);
        if (active) setLoadError(e.message || 'Không tải được đề thi.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchExam();
    return () => { active = false; };
  }, [examId, navigate, currentUser]);

  // Anti-cheat: Prevent Copy/Paste/ContextMenu/Shortcuts
  useEffect(() => {
    if (!hasStarted || !monitored) return;
    const preventDefault = (e) => e.preventDefault();
    const handleKeyDown = (e) => {
      // F12, Ctrl+Shift+I/J/C, Ctrl+U/S/C/V/X
      if (
        e.keyCode === 123 ||
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) ||
        (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.keyCode === 67 || e.keyCode === 86 || e.keyCode === 88))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", preventDefault);
    document.addEventListener("copy", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("paste", preventDefault);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("contextmenu", preventDefault);
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("paste", preventDefault);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasStarted, monitored]);

  // Fullscreen
  const enterFullScreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!document.fullscreenElement) throw new Error('Toàn màn hình chưa được mở.');
      return true;
    } catch (e) {
      console.warn(e); setSecurityMessage('Không mở được toàn màn hình. Hãy cho phép toàn màn hình rồi thử lại.'); return false;
    }
  }, []);


  // The absolute deadline avoids per-second serialization of the entire exam.
  useEffect(() => {
    if (!hasStarted || !exam || isSubmittingRef.current) return;
    const snapshot = JSON.stringify({
      userAnswers, deadline, cheatCount, examSnapshot: exam.questions,
      attemptId: attemptIdRef.current, submissionAttempted, page, maxPage,
      examId, studentId: currentUser?.uid, examTitle: exam.title, studentName: studentManualName,
      examFlow: exam.examFlow || null, mathDictionary: exam.mathDictionary || {},
      flaggedQuestions: [...flaggedQuestions], savedAt: Date.now(),
    });
    const save = () => {
      if (isSubmittingRef.current) return false;
      const result = storageOperation('setItem', `exam_progress_${examId}_${currentUser?.uid || 'anonymous'}`, snapshot);
      if (!result.ok) setStorageWarning('Không thể lưu bài trên thiết bị này. Không tải lại hoặc đóng trang trước khi nộp bài thành công.');
      return result.ok;
    };
    saveProgressRef.current = save;
    save();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      saveProgressRef.current = null;
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, [userAnswers, deadline, cheatCount, hasStarted, examId, currentUser?.uid, exam, submissionAttempted, submitting, page, maxPage, studentManualName, flaggedQuestions]);

  useEffect(() => {
    if (!hasStarted || !attemptIdRef.current || submissionAttempted || submitting) return;
    const revision = ++revisionRef.current;
    const timer = setTimeout(() => {
      saveAnswers({ attemptId: attemptIdRef.current, answers: userAnswers, revision, page, maxPage, cheatCount, violations })
        .then(() => setSyncMessage('Đã lưu câu trả lời trên máy chủ.'))
        .catch(error => setSyncMessage(error.code === 'functions/failed-precondition'
          ? 'Lượt thi đã hết giờ hoặc đã nộp.' : 'Chưa đồng bộ được câu trả lời. Kiểm tra kết nối rồi thử nộp lại.'));
    }, 600);
    return () => clearTimeout(timer);
  }, [hasStarted, userAnswers, page, maxPage, cheatCount, violations, submissionAttempted, submitting]);

  const handleResume = async () => {
    if (profile.screens && security.inspect() !== 'single') { setSecurityMessage('Hãy ngắt màn hình phụ và kiểm tra lại màn hình trước khi tiếp tục.'); return; }
    if (profile.fullscreen && !await enterFullScreen()) return;
    if (security.resume()) { setIsInterrupted(false); setSecurityMessage(''); }
  };

  const handleSelectAnswer = (qi, oi, type, val) => {
    // Wall-clock reads run only on input events, never during rendering.
    // eslint-disable-next-line react-hooks/purity
    if (isSubmittingRef.current || submissionAttempted || timeLeft <= 0 || Date.now() + serverOffsetRef.current >= deadline || (monitored && (isInterrupted || security.blocked()))) return;
    setUserAnswers((p) => {
      if (type === 'multiple') {
        return { ...p, [qi]: toggleMultiple(p[qi], oi) };
      } else if (type === 'multi_true_false') {
        const arr = Array.isArray(p[qi]) ? [...p[qi]] : Array(exam.questions[qi].options.length).fill(null);
        arr[oi] = val;
        return { ...p, [qi]: arr };
      }
      return { ...p, [qi]: oi };
    });
  };

  const handleEssayChange = (qi, text) => {
    // eslint-disable-next-line react-hooks/purity
    if (isSubmittingRef.current || submissionAttempted || timeLeft <= 0 || Date.now() + serverOffsetRef.current >= deadline || (monitored && (isInterrupted || security.blocked()))) return;
    setUserAnswers((p) => ({ ...p, [qi]: text }));
  };

  const handleShortAnswerChange = (qi, patch) => {
    if (isSubmittingRef.current || submissionAttempted || timeLeft <= 0 || Date.now() + serverOffsetRef.current >= deadline || (monitored && (isInterrupted || security.blocked()))) return;
    setUserAnswers((p) => ({ ...p, [qi]: { value: '', unit: null, ...(p[qi] && typeof p[qi] === 'object' ? p[qi] : {}), ...patch } }));
  };

  const toggleFlag = (i) => setFlaggedQuestions((p) => {
    const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n;
  });

  // ── Exam flow: all questions / one by one / groups of n, with or without going back ──
  const totalQuestions = exam?.questions?.length || 0;
  const flow = useMemo(() => normalizeFlow(exam, totalQuestions), [exam, totalQuestions]);
  const paged = flow.mode !== 'all';
  const visibleStart = paged ? pageStart(page, flow) : 0;
  const visibleEnd = paged ? pageEnd(page, flow, totalQuestions) : totalQuestions;
  const isLastPage = page >= flow.totalPages - 1;
  const canJumpTo = (idx) => {
    if (!paged) return true;
    const target = pageOf(idx, flow);
    return flow.allowBack ? true : target === page;
  };
  const showPage = (next) => {
    const clamped = Math.max(0, Math.min(flow.totalPages - 1, next));
    setPage(clamped);
    setMaxPage((m) => Math.max(m, clamped));
  };
  const unansweredOnPage = () => {
    let n = 0;
    for (let i = visibleStart; i < visibleEnd; i++) if (!isAnswered(userAnswers[i], exam.questions[i].type || 'single')) n++;
    return n;
  };
  const goPrev = () => { if (flow.allowBack && page > 0) showPage(page - 1); };
  const goNext = () => {
    if (isLastPage) return;
    if (!flow.allowBack) setShowConfirmNext(true); // irreversible → confirm
    else showPage(page + 1);
  };
  const confirmNext = () => { setShowConfirmNext(false); showPage(page + 1); };
  const goToQuestion = (idx) => {
    if (!canJumpTo(idx)) return;
    const target = pageOf(idx, flow);
    if (paged && target !== page) {
      showPage(target);
      setTimeout(() => scrollToQuestion(idx), 60); // after the new page has rendered
    } else scrollToQuestion(idx);
  };

  // New page → start at the top of the paper
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [page]);

  // ← / → move between pages (not while typing in an essay box)
  useEffect(() => {
    if (!hasStarted || !paged) return undefined;
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (showConfirmNext || showConfirmSubmit || showConfirmExit || isInterrupted) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const scrollToQuestion = (i) => {
    const el = document.getElementById(`q-${i + 1}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h.toString().padStart(2, "0")} : ${m.toString().padStart(2, "0")} : ${sec.toString().padStart(2, "0")}`;
  };

  const handleSubmitExam = () => {
    if (timeLeft > 0) {
      setShowConfirmSubmit(true);
      return;
    }
    processSubmit();
  };

  const processSubmit = useCallback(async () => {
    setShowConfirmSubmit(false);
    if (isSubmittingRef.current || !exam || !currentUser) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setSubmissionAttempted(true);
    try {
      payloadRef.current ||= { attemptId: attemptIdRef.current, answers: userAnswers };
      const backup = storageOperation('setItem', `exam_progress_${examId}_${currentUser.uid}`, JSON.stringify({
        userAnswers: payloadRef.current.answers, deadline, cheatCount, examSnapshot: exam.questions,
        attemptId: attemptIdRef.current, submissionAttempted: true, examId, studentId: currentUser.uid,
        examTitle: exam.title, studentName: studentManualName, examFlow: exam.examFlow || null,
        mathDictionary: exam.mathDictionary || {}, page, maxPage, flaggedQuestions: [...flaggedQuestions], savedAt: Date.now(),
      }));
      if (!backup.ok) setStorageWarning('Không lưu được bản dự phòng. Hãy giữ trang mở cho đến khi nộp thành công.');
      const result = await submitAttempt({ ...payloadRef.current, cheatCount, violations: violationsRef.current });

      // Xóa tiến trình đã lưu sau khi nộp bài thành công
      const progressKey = `exam_progress_${examId}_${currentUser?.uid || 'anonymous'}`;
      storageOperation('removeItem', progressKey);
      storageOperation('removeItem', violationsKey);

      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      alert(`Nộp bài thành công!\nĐiểm: ${result.score}/10 (${result.correctCount}/${result.gradable} câu đúng)${result.expired ? '\nBài hết giờ: chấm câu trả lời đã lưu trên máy chủ.' : ''}`);
      navigate("/student");
    } catch (e) { 
      isSubmittingRef.current = false;
      console.error(e); 
      alert('Chưa xác nhận được bài đã lưu. Giữ trang này mở và bấm nộp lại; hệ thống sẽ dùng cùng mã bài làm để tránh nộp trùng.');
    } finally { setSubmitting(false); }

  }, [exam, currentUser, examId, userAnswers, studentManualName, cheatCount, deadline, navigate, page, maxPage, flaggedQuestions, violationsKey]);

  // Timer
  useEffect(() => {
    if (!hasStarted || !exam) return;
    if (timeLeft <= 0) {
      if (!autoSubmittedRef.current) { autoSubmittedRef.current = true; processSubmit(); }
      return;
    }
    const t = setInterval(() => setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now() - serverOffsetRef.current) / 1000))), 1000);
    return () => clearInterval(t);
  }, [timeLeft, exam, hasStarted, deadline, processSubmit]);

  const answeredCount = exam?.questions
    ? exam.questions.filter((q, i) => isAnswered(userAnswers[i], q.type || 'single')).length
    : 0;
  const totalQ = exam?.questions?.length || 0;
  const limitReached = !savedProgress && exam?.attemptLimit > 0 && submissionCount >= exam.attemptLimit;
  const isTimeLow = timeLeft <= 120 && timeLeft > 0;

  if (loading) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center select-none">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return <div className="p-8 text-center"><p role="alert">{loadError || 'Không tải được đề thi.'}</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white">Thử lại</button></div>;

  const isRestricted = exam.accessType === 'restricted';
  const isAllowed = true; // The backend checks the actual roster before creating a new attempt.

  // ── PHASE 1: Lobby ──────────────────────────────────────────────────
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4 select-none">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 max-w-md w-full overflow-hidden">
          <div className="bg-blue-600 px-6 py-5">
            <div className="flex items-center gap-3">
              <img src="/dolphin-logo.png" alt="Dolphin Logo" className="w-10 h-10 object-contain rounded-xl" />
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">{exam.title}</h1>
                <p className="text-xs text-blue-200 font-mono mt-0.5">
                  Mã đề: {examId.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            {[
              { icon: Clock, label: "Thời gian làm bài", value: `${exam.duration} phút` },
              { icon: FileText, label: "Số lượng câu hỏi", value: `${exam.questionCount} câu` },
              { icon: ListChecks, label: "Hình thức", value: "Trắc nghiệm" },
              { icon: Route, label: "Cách làm bài", value: describeFlow(normalizeFlow(exam, exam.questionCount)) },
              { icon: Users, label: "Giáo viên", value: exam.teacherName },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2.5 text-gray-500">
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
            {/* Exam attempt status */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2.5 text-gray-500">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Lượt làm bài</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                Bạn đã làm bài {submissionCount}/{exam.attemptLimit === 0 ? "Không giới hạn" : exam.attemptLimit} lần
              </span>
            </div>
            {level !== 'off' && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-bold">{{ strict: 'Cấp 2 — Bảo mật cao nhất', mobile: 'Cấp 2 — Cho phép điện thoại', normal: 'Cấp 1 — Toàn màn hình bình thường' }[mode]}</p>
              {screenVerificationRequired && <p className="text-xs">Chỉ dùng một màn hình. Cần cấp quyền kiểm tra màn hình trước khi vào thi.</p>}
              <p className="text-xs">{level === 'normal'
                ? 'Chỉ mở toàn màn hình lúc bắt đầu. Không kiểm tra màn hình phụ, không giám sát hoặc ghi nhận việc chuyển tab/thoát toàn màn hình.'
                : profile.screens
                  ? 'Rời tab/cửa sổ, thoát toàn màn hình hoặc kết nối thêm màn hình phụ sẽ khóa bài và ghi nhận vi phạm. Đồng hồ vẫn tiếp tục chạy.'
                  : `Rời khỏi trang bài thi (chuyển ứng dụng, chuyển tab, về màn hình chính, khóa màn hình)${profile.fullscreen ? ' hoặc thoát toàn màn hình' : ''} sẽ khóa bài và ghi nhận vi phạm kèm thời gian rời. Màn hình được giữ sáng trong lúc thi. Đồng hồ vẫn tiếp tục chạy.`}</p>
              {screenVerificationRequired && <>
              <button type="button" onClick={security.prepare} disabled={security.checking} className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-sm font-semibold">{security.checking ? 'Đang kiểm tra…' : 'Kiểm tra màn hình'}</button>
              {security.screenState === 'single' && <p className="text-xs text-emerald-700" role="status">Đã xác minh một màn hình.</p>}
              {security.screenState === 'multiple' && <p className="text-xs text-red-700" role="alert">Phát hiện màn hình phụ. Hãy ngắt kết nối và kiểm tra lại.</p>}
              {security.error && <p className="text-xs text-red-700" role="alert">{security.error}</p>}
              </>}
              {securityMessage && <p className="text-xs text-red-700" role="alert">{securityMessage}</p>}
            </div>}
          </div>
          <div className="px-6 pb-6">
            {savedProgress && <div role="status" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-bold">Bạn có bài thi đang làm chưa xong</p>
              <p>Câu trả lời, thứ tự câu hỏi và vị trí đang làm sẽ được khôi phục. Thời gian tiếp tục tính từ lúc bắt đầu, không được đặt lại.</p>
            </div>}
            {securityMessage && <p role="alert" className="mb-4 text-sm text-red-700">{securityMessage}</p>}
            {autoSubmitted && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-bold">Lượt thi trước đã hết giờ và được tự động nộp</p>
              <p>Bài được chấm theo các câu trả lời đã lưu trên máy chủ. Điểm: {autoSubmitted.score}/10 ({autoSubmitted.correctCount}/{autoSubmitted.gradable} câu đúng).</p>
            </div>}
            {storageWarning && <p role="status" className="mb-4 text-sm text-amber-800">{storageWarning}</p>}
            {progressError && <p role="alert" className="mb-4 text-sm text-red-700">{progressError}</p>}
            {legacyBackup && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>Bài làm chưa xong từ phiên bản cũ được giữ riêng. Tải bản sao câu trả lời để gửi giáo viên trước khi bắt đầu lượt mới.</p>
              <button type="button" className="mt-2 font-bold underline" onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(legacyBackup, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = url; link.download = `bai-lam-cu-${examId}.json`; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}>Tải bản sao câu trả lời</button>
            </div>}
            {isRestricted && (
              <div className={`p-4 rounded-xl border ${isAllowed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} mb-4`}>
                <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <Shield className="w-4 h-4 shrink-0" /> Chế độ truy cập: Hạn chế
                </p>
                {isAllowed ? (
                  <p className="text-[11px] font-medium">Quyền tham gia được kiểm tra trên máy chủ khi vào thi. Hãy nhập đúng họ tên của bạn.</p>
                ) : (
                  <p className="text-[11px] font-medium">
                    Bạn <b>chưa có tên</b> trong danh sách học sinh được phép tham gia. Vui lòng nhập đúng Họ và tên (ví dụ: trùng với tên kết bạn) hoặc liên hệ Giáo viên để được cấp quyền với mã định danh <b>#{currentUser?.shortId}</b>.
                  </p>
                )}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Họ và tên của bạn</label>
              <input 
                type="text" 
                value={studentManualName} 
                onChange={(e) => setStudentManualName(e.target.value)}
                placeholder="Nhập họ và tên..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900"
              />
            </div>
            {exam.hasPassword && (
              <div className="mb-4">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Mật khẩu đề thi</label>
                <input 
                  type="password" 
                  value={inputPassword} 
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder="Nhập mật khẩu do giáo viên cung cấp..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900"
                />
              </div>
            )}
            {limitReached && (
              <div className="mb-3 text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Bạn đã đạt giới hạn số lần thực hiện lại cho đề thi này.
              </div>
            )}
            <button
              onClick={async () => { 
                if (startInFlightRef.current || limitReached || progressError) return;
                if (!studentManualName.trim()) return alert("Vui lòng nhập họ tên trước khi bắt đầu!");
                
                if (isRestricted && !isAllowed) {
                  return alert("Bạn không có quyền tham gia đề thi này. Vui lòng nhập đúng họ tên hoặc liên hệ giáo viên!");
                }

                if (screenVerificationRequired && security.inspect() !== 'single') {
                  setSecurityMessage('Hãy kiểm tra màn hình và ngắt màn hình phụ trước khi bắt đầu.'); return;
                }
                startInFlightRef.current = true; setStarting(true);
                try {
                  if (fullscreenRequired && !await enterFullScreen()) return;
                  if (screenVerificationRequired && security.inspect() !== 'single') { setSecurityMessage('Cấu hình màn hình vừa thay đổi. Hãy kiểm tra lại.'); return; }
                  const session = await startAttempt({ examId, password: inputPassword, studentName: studentManualName });
                  validateQuestions(session.exam.questions, false);
                  let local = null;
                  try { local = readExamProgress(examId, currentUser.uid, exam.duration * 60); } catch { /* Server recovery is still available. */ }
                  const sameAttempt = local?.attemptId === session.attemptId;
                  serverOffsetRef.current = session.serverNow - Date.now();
                  revisionRef.current = session.revision || 0;
                  const remaining = Math.max(0, Math.ceil((session.deadline - session.serverNow) / 1000));
                  // Local pending edits can only be submitted while server time remains.
                  setUserAnswers(sameAttempt && remaining > 0 ? local.userAnswers : session.userAnswers);
                  setDeadline(session.deadline); setTimeLeft(remaining);
                  let stored = null;
                  try { stored = JSON.parse(storageOperation('getItem', violationsKey).value || 'null'); } catch { /* unreadable: use the server copy */ }
                  const deviceList = normalizeViolations(stored?.attemptId === session.attemptId ? stored.list : []);
                  const serverList = normalizeViolations(session.violations);
                  const reopenedAt = Date.now();
                  const restored = (deviceList.length >= serverList.length ? deviceList : serverList)
                    .map(v => (v.code === 'hidden' && v.awayMs == null ? { ...v, awayMs: reopenedAt - v.at } : v));
                  attemptIdRef.current = session.attemptId;
                  storeViolations(restored);
                  setCheatCount(Math.max(session.cheatCount, sameAttempt ? local.cheatCount : 0, restored.length));
                  setExam({ ...session.exam, questionCount: session.exam.questions.length });
                  setStudentManualName(session.studentName);
                  const f = normalizeFlow(session.exam, session.exam.questions.length);
                  const p = Math.max(0, Math.min(f.totalPages - 1, sameAttempt ? local.page || 0 : session.page));
                  setPage(p); setMaxPage(Math.max(p, Math.min(f.totalPages - 1, session.maxPage)));
                  setFlaggedQuestions(new Set(sameAttempt && Array.isArray(local.flaggedQuestions) ? local.flaggedQuestions : []));
                  attemptIdRef.current = session.attemptId;
                  setSubmissionAttempted(!!(sameAttempt && local.submissionAttempted));
                  setSecurityMessage(''); setHasStarted(true);
                } catch (error) { setSecurityMessage(error.message || 'Không mở được lượt thi.'); }
                finally { startInFlightRef.current = false; setStarting(false); }
              }}
              disabled={starting || !!progressError || limitReached || (isRestricted && !isAllowed) || (screenVerificationRequired && security.screenState !== 'single')}
              className={`w-full py-3.5 ${limitReached || (isRestricted && !isAllowed) || (screenVerificationRequired && security.screenState !== 'single') ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"} text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md`}
            >
              {starting ? 'Đang mở bài thi…' : progressError ? 'Không đọc được bản lưu' : limitReached ? "Đã hết lượt làm bài" : isRestricted && !isAllowed ? "Bị hạn chế truy cập" : (screenVerificationRequired && security.screenState !== 'single') ? security.screenState === 'multiple' ? 'Tắt màn hình phụ để thi' : 'Kiểm tra màn hình trước' : savedProgress ? "Tiếp tục làm bài" : "Bắt đầu thi"} <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 2: Main Exam ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#f4f5f7] flex flex-col select-none overflow-hidden pb-[env(safe-area-inset-bottom)]">
      {storageWarning && <p role="alert" className="bg-amber-50 text-amber-900 p-3">{storageWarning}</p>}
      {syncMessage && <p role="status" className="bg-blue-50 p-2 text-sm">{syncMessage}</p>}
      {submitting && <p role="status" className="bg-blue-50 p-3">Đang lưu bài làm…</p>}
      {submissionAttempted && !submitting && <div role="alert" className="bg-red-50 p-3">Chưa xác nhận nộp thành công. <button onClick={processSubmit} className="font-bold underline">Nộp lại bài</button></div>}

      {/* Interruption Modal (Force Fullscreen) */}
      {isInterrupted && monitored && (
        <div className="fixed inset-0 z-[9999] bg-gray-900/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">CẢNH BÁO VI PHẠM!</h2>
            <p className="text-gray-500 font-medium mb-8">
              {securityMessage} Vi phạm sẽ được gửi kèm bài nộp cho giáo viên. Đồng hồ vẫn tiếp tục chạy.
            </p>
            <div className="p-4 bg-gray-50 rounded-2xl mb-8 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-400 uppercase">Số lần vi phạm</span>
              <span className="text-2xl font-black text-red-600">{cheatCount}</span>
            </div>
            {profile.screens && <button type="button" onClick={security.prepare} disabled={security.checking} className="mb-3 underline text-blue-700">{security.checking ? 'Đang kiểm tra…' : 'Kiểm tra lại màn hình'}</button>}
            {security.error && <p role="alert" className="text-red-600 mb-3">{security.error}</p>}
            <button
              onClick={handleResume}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
            >
              TIẾP TỤC LÀM BÀI
            </button>
            {timeLeft <= 0 && <button disabled={submitting} onClick={processSubmit} className="mt-4 underline">{submitting ? 'Đang nộp bài…' : 'Nộp bài đã hết giờ'}</button>}

          </div>
        </div>
      )}

      {/* ── STICKY HEADER ── */}
      <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm z-50 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 gap-2 sm:gap-3">
          {/* Left: back */}
          <button
            onClick={() => setShowConfirmExit(true)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Quay lại</span>
          </button>

          {/* Center: student name */}
          <p className="hidden md:block text-sm font-semibold text-gray-800 truncate">
            Thí sinh: <span className="text-blue-700">{studentManualName}</span>
          </p>

          {/* Right: timer + zoom + submit */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {cheatCount > 0 && (
              <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-[11px] font-bold text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {cheatCount}
              </span>
            )}
            {/* Timer */}
            <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border font-mono font-bold text-xs sm:text-sm ${
              isTimeLow ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-gray-50 border-gray-200 text-gray-700"
            }`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
            {/* Zoom */}
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={() => setFontSize((p) => Math.min(p + 1, 20))} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Phóng to">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setFontSize((p) => Math.max(p - 1, 12))} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Thu nhỏ">
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
            {/* Nộp bài */}
            <button
              onClick={handleSubmitExam}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-lg transition-colors shadow-sm"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Nộp bài</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY: 2-column ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Scrollable questions */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-100/50">
          <div className="exam-paper max-w-4xl mx-auto min-h-full bg-white shadow-2xl border-x border-gray-200 py-10">
            {exam.questions.map((question, qi) => {
              if (qi < visibleStart || qi >= visibleEnd) return null; // other pages are not mounted
              const qType = question.type || 'single';
              const typeInfo = TYPE_LABELS[qType] || TYPE_LABELS.single;
              const currentAnswer = userAnswers[qi];

              return (
                <div
                  key={qi}
                  id={`q-${qi + 1}`}
                  ref={(el) => (questionRefs.current[qi] = el)}
                  className="rounded-none border-b border-gray-100 scroll-mt-20 px-10 py-10 last:border-0"
                >
                  {/* Question label + type badge */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[13px] font-bold text-gray-900">Câu&nbsp;{qi + 1}</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </div>
                    <div className="exam-text text-[13px] font-medium mb-3" style={{ fontSize: `${fontSize}px` }}>
                      <RichTextRenderer content={question.content} mathDict={exam?.mathDictionary} />
                    </div>
                    {qType === 'essay' ? (
                      <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                        <PenLine className="w-3 h-3" /> Viết câu trả lời của bạn vào ô bên dưới
                      </p>
                    ) : qType === 'short_answer' ? (
                      <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                        <PenLine className="w-3 h-3" /> {question.answerKind === 'number' ? 'Nhập đáp án là một số (dùng dấu phẩy hoặc dấu chấm cho phần thập phân)' : 'Nhập đáp án ngắn gọn'}{question.units?.length ? ' và chọn đơn vị' : ''}
                      </p>
                    ) : qType === 'multiple' ? (
                      <p className="text-[11px] text-gray-400 text-center mb-3">Chọn tất cả đáp án đúng (có thể chọn nhiều)</p>
                    ) : (
                      <p className="text-[11px] text-gray-400 text-center mb-3">Chọn một đáp án đúng</p>
                    )}
                  </div>

                  {/* ── ESSAY ── */}
                  {qType === 'essay' && (
                    <textarea
                      value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                      onChange={(e) => handleEssayChange(qi, e.target.value)}
                      rows={5}
                      placeholder="Nhập câu trả lời của bạn..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none resize-y focus:ring-2 focus:ring-emerald-400 focus:border-transparent exam-text bg-gray-50 transition-shadow"
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  )}

                  {/* ── SHORT ANSWER: value + optional unit ── */}
                  {qType === 'short_answer' && (
                    <ShortAnswerInput id={`answer-${qi}`} question={question} answer={currentAnswer} fontSize={fontSize} onChange={(patch) => handleShortAnswerChange(qi, patch)} />
                  )}

                  {/* ── SINGLE / TRUE-FALSE / MULTIPLE / MULTI-TRUE-FALSE ── */}
                  {!isTypedType(qType) && (
                    <div className={`grid gap-3 ${isShortOptions(question.options) ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                      {question.options.map((opt, oi) => {
                        if (opt === undefined) return null;
                        const isMulti = qType === 'multiple';
                        const isMultiTF = qType === 'multi_true_false';
                        
                        let selected;
                        if (isMulti) selected = Array.isArray(currentAnswer) && currentAnswer.map(Number).includes(oi);
                        else if (isMultiTF) selected = Array.isArray(currentAnswer) && currentAnswer[oi] !== null && currentAnswer[oi] !== undefined;
                        else selected = currentAnswer === oi;

                        return (
                          <div
                            key={oi}
                            onClick={() => !isMultiTF && handleSelectAnswer(qi, oi, qType)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${!isMultiTF ? 'cursor-pointer' : ''} ${
                              selected
                                ? isMulti
                                  ? "border-purple-500 bg-purple-50/60"
                                  : isMultiTF
                                    ? "border-orange-200 bg-orange-50/30"
                                    : "border-blue-500 bg-blue-50/60"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {/* Indicator: square for multiple, circle for single/tf, True/False toggle for multi_true_false */}
                            {isMultiTF ? (
                                <div className="shrink-0 flex items-center gap-2 bg-white px-2 py-1 rounded border border-orange-200 shadow-sm">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" checked={Array.isArray(currentAnswer) && currentAnswer[oi] === true} onChange={() => handleSelectAnswer(qi, oi, qType, true)} className="w-3.5 h-3.5 accent-orange-600" />
                                        <span className="text-[10px] font-bold text-gray-700">Đ</span>
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" checked={Array.isArray(currentAnswer) && currentAnswer[oi] === false} onChange={() => handleSelectAnswer(qi, oi, qType, false)} className="w-3.5 h-3.5 accent-orange-600" />
                                        <span className="text-[10px] font-bold text-gray-700">S</span>
                                    </label>
                                </div>
                            ) : isMulti ? (
                              <span className={`option-badge shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                                selected ? "border-purple-500 bg-purple-600 text-white" : "border-gray-300 text-gray-500 bg-white"
                              }`}>
                                {selected ? '✓' : String.fromCharCode(65 + oi)}
                              </span>
                            ) : (
                              <span className={`option-badge shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                                selected ? "border-blue-500 bg-blue-600 text-white" : "border-gray-300 text-gray-500 bg-white"
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                            )}
                            <div className="exam-text text-[13px] font-medium flex-1" style={{ fontSize: `${fontSize}px` }}>
                                {isMultiTF && <span className="font-bold mr-1">Ý {oi + 1}.</span>}
                                <RichTextRenderer content={opt} mathDict={exam?.mathDictionary} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Flag button */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => toggleFlag(qi)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                        flaggedQuestions.has(qi)
                          ? "bg-orange-100 text-orange-600"
                          : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                      }`}
                    >
                      <Flag className="w-3.5 h-3.5" fill={flaggedQuestions.has(qi) ? "currentColor" : "none"} />
                      {flaggedQuestions.has(qi) ? "Bỏ cờ" : "Đặt cờ"}
                    </button>
                  </div>
                </div>
              );
            })}

            {paged && (
              <nav className="exam-pager" aria-label="Chuyển trang câu hỏi">
                <button type="button" onClick={goPrev} disabled={!flow.allowBack || page === 0} className="pager-btn" title={flow.allowBack ? 'Trang trước (←)' : 'Không thể quay lại câu trước'}>
                  {flow.allowBack ? <ChevronLeft className="w-4 h-4" /> : <Lock className="w-4 h-4" />} <span>Trước</span>
                </button>
                <div className="pager-status" role="status" aria-live="polite">
                  <strong>{flow.mode === 'single' ? `Câu ${page + 1}/${totalQuestions}` : `Trang ${page + 1}/${flow.totalPages}`}</strong>
                  <span>{flow.mode === 'single' ? `Đã trả lời ${answeredCount}/${totalQuestions}` : `Câu ${visibleStart + 1}–${visibleEnd}`}{!flow.allowBack && ' · không quay lại'}</span>
                </div>
                {isLastPage ? (
                  <button type="button" onClick={handleSubmitExam} className="pager-btn pager-primary"><Send className="w-4 h-4" /> <span>Nộp bài</span></button>
                ) : (
                  <button type="button" onClick={goNext} className="pager-btn pager-primary" title="Trang sau (→)"><span>Tiếp</span> <ChevronRight className="w-4 h-4" /></button>
                )}
              </nav>
            )}
          </div>
        </div>

        {/* RIGHT: Fixed sidebar navigation */}
        <aside className="hidden lg:block shrink-0 w-[260px] bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Danh sách câu hỏi</h3>

            {/* Grid 5 columns */}
            <div className="grid grid-cols-5 gap-1.5">
              {exam.questions.map((q, idx) => {
                const answered = isAnswered(userAnswers[idx], q.type || 'single');
                const flagged = flaggedQuestions.has(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => goToQuestion(idx)}
                    disabled={!canJumpTo(idx)}
                    aria-current={paged && pageOf(idx, flow) === page ? 'true' : undefined}
                    title={!canJumpTo(idx) ? 'Không thể mở câu này (đã khóa quay lại hoặc chưa tới)' : undefined}
                    className={`relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-md border transition-all enabled:hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed ${paged && pageOf(idx, flow) === page ? 'outline outline-2 outline-offset-1 outline-blue-500 ' : ''}${
                      answered
                        ? "bg-blue-600 text-white border-blue-700"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                    } ${flagged ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                  >
                    {String(idx + 1).padStart(2, "0")}
                    {flagged && (
                      <Flag className="absolute -top-1 -right-1 w-2.5 h-2.5 text-red-500 fill-red-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-blue-700 bg-blue-600 inline-block" />
                Đã trả lời ({answeredCount})
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-gray-300 bg-white inline-block" />
                Chưa trả lời ({totalQ - answeredCount})
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-orange-400 ring-2 ring-orange-300 inline-block" />
                Đánh cờ ({flaggedQuestions.size})
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 font-medium mb-1">
                <span>Tiến độ</span>
                <span>{totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalQ > 0 ? (answeredCount / totalQ) * 100 : 0}%` }}
                />
              </div>
            </div>


          </div>
        </aside>

        {/* Mobile Floating Action Button (FAB) */}
        <button
          onClick={() => setIsGridOpen(true)}
          className="lg:hidden fixed bottom-6 left-6 z-40 w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-blue-700 transition-colors"
        >
          <LayoutGrid className="w-6 h-6" />
        </button>
        {isGridOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs lg:hidden transition-opacity duration-300"
            onClick={() => setIsGridOpen(false)}
          />
        )}

        {/* Mobile Drawer Panel */}
        <div
          className={`fixed top-0 right-0 bottom-0 z-50 w-[280px] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col ${
            isGridOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
            <h3 className="text-sm font-bold text-gray-900">Danh sách câu hỏi</h3>
            <button
              onClick={() => setIsGridOpen(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content (Grid) */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-5 gap-1.5">
              {exam.questions.map((q, idx) => {
                const answered = isAnswered(userAnswers[idx], q.type || 'single');
                const flagged = flaggedQuestions.has(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      goToQuestion(idx);
                      setIsGridOpen(false);
                    }}
                    disabled={!canJumpTo(idx)}
                    aria-current={paged && pageOf(idx, flow) === page ? 'true' : undefined}
                    className={`relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-md border transition-all enabled:hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed ${paged && pageOf(idx, flow) === page ? 'outline outline-2 outline-offset-1 outline-blue-500 ' : ''}${
                      answered
                        ? "bg-blue-600 text-white border-blue-700"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                    } ${flagged ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                  >
                    {String(idx + 1).padStart(2, "0")}
                    {flagged && (
                      <Flag className="absolute -top-1 -right-1 w-2.5 h-2.5 text-red-500 fill-red-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-blue-700 bg-blue-600 inline-block" />
                Đã trả lời ({answeredCount})
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-gray-300 bg-white inline-block" />
                Chưa trả lời ({totalQ - answeredCount})
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-4 h-4 rounded border border-orange-400 ring-2 ring-orange-300 inline-block" />
                Đánh cờ ({flaggedQuestions.size})
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 font-medium mb-1">
                <span>Tiến độ</span>
                <span>{totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalQ > 0 ? (answeredCount / totalQ) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm leaving a page when going back is disabled */}
      {showConfirmNext && (
        <div className="fixed inset-0 z-[10000] bg-gray-900/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-next-title">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
            <h3 id="confirm-next-title" className="text-xl font-bold text-gray-900 mb-2">Sang {flow.mode === 'single' ? 'câu' : 'trang'} tiếp theo?</h3>
            <p className="text-sm text-gray-500 mb-2">Đề thi này <b>không cho phép quay lại</b>. Sau khi chuyển, bạn không thể xem hay sửa {flow.mode === 'single' ? 'câu' : 'các câu'} vừa làm.</p>
            {unansweredOnPage() > 0 && <p className="text-sm text-red-600 font-semibold mb-2" role="alert">Còn {unansweredOnPage()} câu chưa trả lời ở {flow.mode === 'single' ? 'câu này' : 'trang này'}.</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowConfirmNext(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Ở lại</button>
              <button onClick={confirmNext} autoFocus className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">Tiếp tục</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[10000] bg-gray-900/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Nộp bài thi?</h3>
            <p className="text-sm text-gray-500 mb-6">Bạn có chắc chắn muốn nộp bài thi ngay bây giờ?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmSubmit(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Hủy</button>
              <button onClick={processSubmit} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">Nộp bài</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Exit Modal */}
      {showConfirmExit && (
        <div className="fixed inset-0 z-[10000] bg-gray-900/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Thoát bài thi?</h3>
            <p className="text-sm text-gray-500 mb-6">Bài làm được lưu trên trình duyệt này. Bạn có thể mở lại từ mục “Bài thi đang làm chưa xong”. Thời gian vẫn tiếp tục chạy khi thoát.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmExit(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">Hủy</button>
              <button disabled={leaving || submitting} onClick={async () => {
                if (leaving || submitting) return;
                if (!saveProgressRef.current?.()) {
                  setShowConfirmExit(false);
                  return;
                }
                setLeaving(true);
                try {
                  await saveAnswers({ attemptId: attemptIdRef.current, answers: userAnswers, revision: ++revisionRef.current, page, maxPage, cheatCount, violations: violationsRef.current });
                  isSubmittingRef.current = true;
                  navigate("/student");
                  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                } catch (error) {
                  if (error.code === 'functions/failed-precondition') await processSubmit();
                  else {
                    setStorageWarning('Chưa lưu được câu trả lời lên máy chủ. Hãy kiểm tra kết nối và thử lưu lại trước khi thoát.');
                    setShowConfirmExit(false);
                  }
                } finally { setLeaving(false); }
              }} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors">{leaving ? 'Đang lưu…' : 'Lưu và thoát'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
