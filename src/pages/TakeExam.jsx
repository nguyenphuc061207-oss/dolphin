import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import MathText from "../components/MathText";
import RichTextRenderer from "../components/RichTextRenderer";
import useDocumentTitle from "../hooks/useDocumentTitle";
import {
  Flag,
  Clock,
  Send,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileText,
  Users,
  ListChecks,
  ZoomIn,
  ZoomOut,
  CheckCircle,
  ChevronUp,
  PenLine,
  LayoutGrid,
  X,
  Shield,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────
const TYPE_LABELS = {
  single:           { label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700' },
  multiple:         { label: 'Chọn nhiều',  color: 'bg-purple-100 text-purple-700' },
  true_false:       { label: 'Đúng/Sai',   color: 'bg-amber-100 text-amber-700' },
  multi_true_false: { label: 'Đúng/Sai Nhiều Ý', color: 'bg-orange-100 text-orange-700' },
  essay:            { label: 'Tự luận',    color: 'bg-emerald-100 text-emerald-700' },
};

/** Whether a question has been answered (any type) */
function isAnswered(answer, type) {
  if (type === 'essay') return typeof answer === 'string' && answer.trim() !== '';
  if (type === 'multiple') return Array.isArray(answer) && answer.length > 0;
  if (type === 'multi_true_false') return Array.isArray(answer) && answer.some(v => v !== null && v !== undefined);
  return answer !== undefined && answer !== null;
}

/** Toggle index in a multiple-choice answer array */
function toggleMultiple(prev, idx) {
  const arr = Array.isArray(prev) ? [...prev] : [];
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
  const [userAnswers, setUserAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [cheatCount, setCheatCount] = useState(0);
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const [submissionCount, setSubmissionCount] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [studentManualName, setStudentManualName] = useState(currentUser?.displayName || "");
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [isGridOpen, setIsGridOpen] = useState(false);

  useDocumentTitle(hasStarted ? "Dolphin | Đang làm bài thi..." : "Dolphin | Chuẩn bị thi");

  const questionRefs = useRef([]);

  // Anti-cheat: DevTools Console self-XSS warning
  useEffect(() => {
    const warningTitle = "⚠️ DỪNG LẠI!";
    const warningTitleStyle = "color: #ff0000; font-size: 40px; font-weight: 800; font-family: sans-serif; text-shadow: 2px 2px 0px #000; padding: 10px;";
    
    const warningDesc = "Đây là tính năng dành cho nhà phát triển (Developer Tools).\n\nNếu ai đó yêu cầu bạn sao chép và dán bất kỳ đoạn mã (code) nào vào đây để \"HACK ĐÁP ÁN\" hoặc \"XEM ĐÁP ÁN TRƯỚC\", ĐỪNG LÀM THEO! Đó là một trò lừa đảo.\n\nViệc dán code lạ vào Console có thể dẫn đến:\n1. Bị phát hiện gian lận và HỦY BỎ BÀI THI ngay lập tức.\n2. Bị đánh cắp thông tin đăng nhập tài khoản.\n3. Gửi các yêu cầu phá hoại lên hệ thống dưới danh nghĩa của bạn.\n\nHãy tập trung làm bài bằng chính năng lực của mình để đạt kết quả tốt nhất!";
    const warningDescStyle = "color: #1e293b; font-size: 14px; font-weight: 600; font-family: sans-serif; line-height: 1.6; padding: 5px;";
    
    const alertStyle = "color: #b91c1c; font-size: 16px; font-weight: 800; font-family: sans-serif; text-transform: uppercase;";

    console.log(`%c${warningTitle}`, warningTitleStyle);
    console.log(`%c${warningDesc}`, warningDescStyle);
    console.log(`%c👉 MỌI HÀNH VI GIAN LẬN SẼ BỊ HỆ THỐNG GHI LẠI VÀ BÁO CÁO CHO GIÁO VIÊN!`, alertStyle);
  }, []);

  // Fetch exam
  useEffect(() => {
    const fetchExam = async () => {
      try {
        const docSnap = await getDoc(doc(db, "exams", examId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          let questions = [...data.questions];
          if (data.shuffleQuestions) questions.sort(() => Math.random() - 0.5);
          if (data.shuffleOptions) {
            questions = questions.map((q) => {
              const indexed = q.options.map((opt, i) => ({ text: opt, orig: i }));
              indexed.sort(() => Math.random() - 0.5);
              let newCorrectAnswer;
              if (Array.isArray(q.correctAnswer)) {
                newCorrectAnswer = q.correctAnswer
                  .map(origIdx => indexed.findIndex(o => o.orig === origIdx))
                  .filter(idx => idx >= 0);
              } else {
                newCorrectAnswer = indexed.findIndex((o) => o.orig === q.correctAnswer);
              }
              return {
                ...q,
                options: indexed.map((o) => o.text),
                correctAnswer: newCorrectAnswer,
              };
            });
          }
          setExam({ ...data, questions });
          setTimeLeft(data.duration * 60);
          if (currentUser) {
            const subQuery = query(collection(db, "submissions"), where("examId", "==", examId), where("studentId", "==", currentUser.uid));
            const subSnap = await getDocs(subQuery);
            setSubmissionCount(subSnap.size);
          }
        } else {
          alert("Không tìm thấy đề thi!");
          navigate("/student");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [examId, navigate]);

  // Timer
  useEffect(() => {
    if (!hasStarted || !exam) return;
    if (timeLeft <= 0) { handleSubmitExam(); return; }
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timeLeft, exam, hasStarted]);

  // Anti-cheat: Tab switching
  useEffect(() => {
    if (!hasStarted || !exam?.isAntiCheat) return;
    const h = () => {
      if (document.hidden) {
        setCheatCount((p) => p + 1);
        setIsInterrupted(true);
      }
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [hasStarted, exam]);

  // Anti-cheat: Fullscreen exit detection
  useEffect(() => {
    if (!hasStarted || !exam?.isAntiCheat) return;
    const h = () => {
      if (!document.fullscreenElement && hasStarted) {
        setIsInterrupted(true);
      }
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [hasStarted, exam]);

  // Fullscreen
  const enterFullScreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen(); } catch (e) { console.warn(e); }
  }, []);
  useEffect(() => {
    const h = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Safe check and trigger MathJax typesetting when questions or exam screen changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      window.MathJax.typesetPromise().catch((err) => console.warn("MathJax typeset error:", err));
    }
  }, [exam?.questions, hasStarted]);



  const handleResume = async () => {
    await enterFullScreen();
    setIsInterrupted(false);
  };

  const handleSelectAnswer = (qi, oi, type, val) => {
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
    setUserAnswers((p) => ({ ...p, [qi]: text }));
  };

  const toggleFlag = (i) => setFlaggedQuestions((p) => {
    const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n;
  });

  const scrollToQuestion = (i) => {
    const el = document.getElementById(`q-${i + 1}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h.toString().padStart(2, "0")} : ${m.toString().padStart(2, "0")} : ${sec.toString().padStart(2, "0")}`;
  };

  const handleSubmitExam = async () => {
    if (timeLeft > 0 && !window.confirm("Bạn có chắc muốn nộp bài?")) return;
    let correct = 0;
    const total = exam.questions.length;
    exam.questions.forEach((q, i) => {
      const type = q.type || 'single';
      const ans = userAnswers[i];
      if (type === 'essay') {
        // essays are not auto-graded
      } else if (type === 'multiple') {
        const ca = Array.isArray(q.correctAnswer) ? [...q.correctAnswer].sort().join(',') : '';
        const sa = Array.isArray(ans) ? [...ans].sort().join(',') : '';
        if (ca === sa && ca !== '') correct++;
      } else if (type === 'multi_true_false') {
        const statements = q.options.length;
        let correctStmts = 0;
        for (let j = 0; j < statements; j++) {
          if (Array.isArray(ans) && ans[j] === q.correctAnswer[j]) correctStmts++;
        }
        let points = 0;
        if (q.scoringMethod === 'gdpt_2018') {
          const r = correctStmts / statements;
          if (r === 1) points = 1;
          else if (r >= 0.75) points = 0.5;
          else if (r >= 0.5) points = 0.25;
          else if (r >= 0.25) points = 0.1;
        } else {
          points = correctStmts / statements; // linear default
        }
        correct += points;
      } else {
        if (ans === q.correctAnswer) correct++;
      }
    });
    // Count gradable (non-essay) questions for score
    const gradable = exam.questions.filter(q => (q.type || 'single') !== 'essay').length;
    const score = gradable > 0 ? ((correct / gradable) * 10).toFixed(2) : '0.00';
    try {
      await addDoc(collection(db, "submissions"), {
        examId, examTitle: exam.title, studentId: currentUser.uid,
        studentName: studentManualName || currentUser.displayName || "Thí sinh ẩn danh",
        shortId: currentUser.shortId || "N/A",
        answers: userAnswers,
        score: Number(score), correctCount: correct, totalQuestions: total,
        cheatCount, examSnapshot: exam.questions,
        mathDictionary: exam.mathDictionary || {},
        submittedAt: serverTimestamp(),
        attemptNumber: submissionCount + 1,
      });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      alert(`Nộp bài thành công!\nĐiểm: ${score}/10 (${correct}/${gradable} câu đúng)`);
      navigate("/student");
    } catch (e) { console.error(e); alert("Lỗi khi nộp bài."); }
  };

  const answeredCount = exam?.questions
    ? exam.questions.filter((q, i) => isAnswered(userAnswers[i], q.type || 'single')).length
    : 0;
  const totalQ = exam?.questions?.length || 0;
  const limitReached = exam?.attemptLimit > 0 && submissionCount >= exam.attemptLimit;
  const isTimeLow = timeLeft <= 120 && timeLeft > 0;

  if (loading) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center select-none">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return null;

  const isRestricted = exam.accessType === 'restricted';
  const isAllowed = !isRestricted || (exam.allowedUsers && exam.allowedUsers.some(
    u => u.shortId === currentUser?.shortId && 
    (u.name.toLowerCase().trim() === currentUser?.displayName?.toLowerCase().trim() ||
     u.name.toLowerCase().trim() === studentManualName?.toLowerCase().trim())
  ));

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
              { icon: FileText, label: "Số lượng câu hỏi", value: `${exam.questions.length} câu` },
              { icon: ListChecks, label: "Hình thức", value: "Trắc nghiệm" },
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
            {exam.isAntiCheat && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Bài thi có giám sát tự động. Hệ thống ghi nhận khi bạn rời cửa sổ.
                </p>
              </div>
            )}
          </div>
          <div className="px-6 pb-6">
            {isRestricted && (
              <div className={`p-4 rounded-xl border ${isAllowed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} mb-4`}>
                <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <Shield className="w-4 h-4 shrink-0" /> Chế độ truy cập: Hạn chế
                </p>
                {isAllowed ? (
                  <p className="text-[11px] font-medium">Bạn đã được cấp quyền làm đề thi này. Hãy kiểm tra hoặc nhập đúng Họ và tên của bạn bên dưới.</p>
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
            {exam?.password && exam.password.trim() !== "" && (
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
              onClick={() => { 
                if (!studentManualName.trim()) return alert("Vui lòng nhập họ tên trước khi bắt đầu!");
                
                if (isRestricted && !isAllowed) {
                  return alert("Bạn không có quyền tham gia đề thi này. Vui lòng nhập đúng họ tên hoặc liên hệ giáo viên!");
                }

                // Xác thực mật khẩu đề thi
                if (exam?.password && exam.password.trim() !== "") {
                  if (!inputPassword.trim()) {
                    return alert("Vui lòng nhập mật khẩu đề thi!");
                  }
                  if (inputPassword.trim() !== exam.password.trim()) {
                    return alert("Mật khẩu đề thi không chính xác! Vui lòng thử lại.");
                  }
                }

                setHasStarted(true); 
                if (exam?.isAntiCheat) enterFullScreen(); 
              }}
              disabled={limitReached || (isRestricted && !isAllowed)}
              className={`w-full py-3.5 ${limitReached || (isRestricted && !isAllowed) ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"} text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md`}
            >
              {limitReached ? "Đã hết lượt làm bài" : isRestricted && !isAllowed ? "Bị hạn chế truy cập" : "Bắt đầu thi"} <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 2: Main Exam ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#f4f5f7] flex flex-col select-none overflow-hidden pb-[env(safe-area-inset-bottom)]">
      {/* Interruption Modal (Force Fullscreen) */}
      {isInterrupted && exam.isAntiCheat && (
        <div className="fixed inset-0 z-[9999] bg-gray-900/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">CẢNH BÁO VI PHẠM!</h2>
            <p className="text-gray-500 font-medium mb-8">
              Bạn vừa rời khỏi màn hình làm bài hoặc thoát chế độ toàn màn hình. 
              Hành động này đã được ghi lại.
            </p>
            <div className="p-4 bg-gray-50 rounded-2xl mb-8 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-400 uppercase">Số lần vi phạm</span>
              <span className="text-2xl font-black text-red-600">{cheatCount}</span>
            </div>
            <button
              onClick={handleResume}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
            >
              TIẾP TỤC LÀM BÀI
            </button>
          </div>
        </div>
      )}

      {/* ── STICKY HEADER ── */}
      <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm z-50 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 gap-2 sm:gap-3">
          {/* Left: back */}
          <button
            onClick={() => { if (window.confirm("Thoát? Bài làm sẽ không được lưu.")) navigate("/student"); }}
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
        <div className="flex-1 overflow-y-auto bg-gray-100/50">
          <div className="max-w-4xl mx-auto min-h-full bg-white shadow-2xl border-x border-gray-200 py-10">
            {exam.questions.map((question, qi) => {
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
                    <div className="text-[13px] text-blue-800 font-medium mb-3" style={{ fontSize: `${fontSize}px` }}>
                      <RichTextRenderer content={question.content} mathDict={exam?.mathDictionary} />
                    </div>
                    {qType === 'essay' ? (
                      <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                        <PenLine className="w-3 h-3" /> Viết câu trả lời của bạn vào ô bên dưới
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
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none resize-y focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-gray-800 bg-gray-50 transition-shadow"
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  )}

                  {/* ── SINGLE / TRUE-FALSE / MULTIPLE / MULTI-TRUE-FALSE ── */}
                  {qType !== 'essay' && (
                    <div className={`grid gap-3 ${isShortOptions(question.options) ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                      {question.options.filter(o => o !== undefined).map((opt, oi) => {
                        const isMulti = qType === 'multiple';
                        const isMultiTF = qType === 'multi_true_false';
                        
                        let selected = false;
                        if (isMulti) selected = Array.isArray(currentAnswer) && currentAnswer.includes(oi);
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
                              <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                                selected ? "border-purple-500 bg-purple-600 text-white" : "border-gray-300 text-gray-500 bg-white"
                              }`}>
                                {selected ? '✓' : String.fromCharCode(65 + oi)}
                              </span>
                            ) : (
                              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                                selected ? "border-blue-500 bg-blue-600 text-white" : "border-gray-300 text-gray-500 bg-white"
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                            )}
                            <div className="text-[13px] font-medium text-gray-800 flex-1" style={{ fontSize: `${fontSize}px` }}>
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
                    onClick={() => scrollToQuestion(idx)}
                    className={`relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-md border transition-all hover:scale-105 ${
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
          className="fixed bottom-6 right-6 z-40 lg:hidden flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 font-bold text-sm border border-blue-500/20 shrink-0"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Danh sách câu ({answeredCount}/{totalQ})</span>
        </button>

        {/* Mobile Drawer Overlay */}
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
                      scrollToQuestion(idx);
                      setIsGridOpen(false);
                    }}
                    className={`relative w-full aspect-square flex items-center justify-center text-xs font-semibold rounded-md border transition-all hover:scale-105 ${
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
    </div>
  );
}