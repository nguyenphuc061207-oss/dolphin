import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import MathText from "../components/MathText";
import RichTextRenderer from "../components/RichTextRenderer";
import {
  Flag,
  Clock,
  Send,
  AlertTriangle,
  Maximize,
  ArrowLeft,
  ArrowRight,
  FileText,
  Users,
  ListChecks,
  ZoomIn,
  ZoomOut,
  CheckCircle,
  ChevronUp,
} from "lucide-react";

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

  const questionRefs = useRef([]);

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
              return {
                ...q,
                options: indexed.map((o) => o.text),
                correctAnswer: indexed.findIndex((o) => o.orig === q.correctAnswer),
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

  const handleResume = async () => {
    await enterFullScreen();
    setIsInterrupted(false);
  };

  const handleSelectAnswer = (qi, oi) => setUserAnswers((p) => ({ ...p, [qi]: oi }));

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
    exam.questions.forEach((q, i) => { if (userAnswers[i] === q.correctAnswer) correct++; });
    const score = ((correct / total) * 10).toFixed(2);
    try {
      await addDoc(collection(db, "submissions"), {
        examId, examTitle: exam.title, studentId: currentUser.uid,
        studentName: studentManualName || currentUser.displayName || "Thí sinh ẩn danh", 
        answers: userAnswers,
        score: Number(score), correctCount: correct, totalQuestions: total,
        cheatCount, examSnapshot: exam.questions, 
        mathDictionary: exam.mathDictionary || {},
        submittedAt: serverTimestamp(),
      });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      alert(`Nộp bài thành công!\nĐiểm: ${score}/10 (${correct}/${total} câu đúng)`);
      navigate("/student");
    } catch (e) { console.error(e); alert("Lỗi khi nộp bài."); }
  };

  const answeredCount = Object.keys(userAnswers).length;
  const totalQ = exam?.questions?.length || 0;
  const limitReached = exam?.attemptLimit > 0 && submissionCount >= exam.attemptLimit;
  const isTimeLow = timeLeft <= 120 && timeLeft > 0;

  if (loading) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center select-none">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return null;

  // ── PHASE 1: Lobby ──────────────────────────────────────────────────
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4 select-none">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 max-w-md w-full overflow-hidden">
          <div className="bg-blue-600 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
                <span className="font-bold text-lg">D</span>
              </div>
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
            {limitReached && (
              <div className="mb-3 text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Bạn đã đạt giới hạn số lần thực hiện lại cho đề thi này.
              </div>
            )}
            <button
              onClick={() => { 
                if (!studentManualName.trim()) return alert("Vui lòng nhập họ tên trước khi bắt đầu!");
                setHasStarted(true); 
                if (exam?.isAntiCheat) enterFullScreen(); 
              }}
              disabled={limitReached}
              className={`w-full py-3.5 ${limitReached ? "bg-gray-400 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"} text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md`}
            >
              {limitReached ? "Đã hết lượt làm bài" : "Bắt đầu thi"} <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 2: Main Exam ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col select-none overflow-hidden h-screen">
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
      <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm z-50">
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          {/* Left: back */}
          <button
            onClick={() => { if (window.confirm("Thoát? Bài làm sẽ không được lưu.")) navigate("/student"); }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </button>

          {/* Center: student name */}
          <p className="text-sm font-semibold text-gray-800 truncate">
            Thí sinh: <span className="text-blue-700">{studentManualName}</span>
          </p>

          {/* Right: timer + zoom + submit */}
          <div className="flex items-center gap-2 shrink-0">
            {cheatCount > 0 && (
              <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-[11px] font-bold text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {cheatCount}
              </span>
            )}
            {/* Timer */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm ${
              isTimeLow ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-gray-50 border-gray-200 text-gray-700"
            }`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
            {/* Zoom */}
            <button onClick={() => setFontSize((p) => Math.min(p + 1, 20))} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Phóng to">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setFontSize((p) => Math.max(p - 1, 12))} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Thu nhỏ">
              <ZoomOut className="w-4 h-4" />
            </button>
            {/* Nộp bài */}
            <button
              onClick={handleSubmitExam}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-lg transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" /> Nộp bài
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY: 2-column ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Scrollable questions */}
        <div className="flex-1 overflow-y-auto bg-gray-100/50">
          <div className="max-w-4xl mx-auto min-h-full bg-white shadow-2xl border-x border-gray-200 py-10">
            {exam.questions.map((question, qi) => (
              <div
                key={qi}
                id={`q-${qi + 1}`}
                ref={(el) => (questionRefs.current[qi] = el)}
                className="rounded-none border-b border-gray-100 scroll-mt-20 px-10 py-10 last:border-0"
              >
                {/* Question label + text */}
                <div className="mb-3">
                  <p className="text-[13px] font-bold text-gray-900 mb-1">
                    Câu &nbsp;{qi + 1}
                  </p>
                  <div className="text-[13px] text-blue-800 font-medium mb-3" style={{ fontSize: `${fontSize}px` }}>
                    <RichTextRenderer content={question.content} mathDict={exam?.mathDictionary} />
                  </div>
                  {/* Divider label */}
                  <p className="text-[11px] text-gray-400 text-center mb-3">Chọn một đáp án đúng</p>
                </div>

                {/* Options */}
                <div className="space-y-2">
                  {question.options.map((opt, oi) => (
                    <div
                      key={oi}
                      onClick={() => handleSelectAnswer(qi, oi)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                        userAnswers[qi] === oi
                          ? "border-blue-500 bg-blue-50/60"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                        userAnswers[qi] === oi
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-gray-300 text-gray-500 bg-white"
                      }`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <div className="text-[13px] font-medium text-gray-800" style={{ fontSize: `${fontSize}px` }}>
                        <RichTextRenderer content={opt} mathDict={exam?.mathDictionary} />
                      </div>
                    </div>
                  ))}
                </div>

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
            ))}


          </div>
        </div>

        {/* RIGHT: Fixed sidebar navigation */}
        <aside className="shrink-0 w-[260px] bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Danh sách câu hỏi</h3>

            {/* Grid 5 columns */}
            <div className="grid grid-cols-5 gap-1.5">
              {exam.questions.map((_, idx) => {
                const answered = userAnswers[idx] !== undefined;
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
      </div>
    </div>
  );
}