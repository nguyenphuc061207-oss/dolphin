import { withTimeout, timestampDate, timestampMillis, mapConcurrent } from '@/shared/utils/runtimeSafety';
import { useState, useEffect } from "react";
import { db } from "@/shared/config/firebase";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Trash2, Search, ArrowRight, BookOpen, ClipboardPaste, FileText, LockKeyhole } from "lucide-react";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";

export default function StudentDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Dolphin | Bảng điều khiển");
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [examConfigs, setExamConfigs] = useState({}); // {examId: {limit, reviewSettings}}
  const [examCode, setExamCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const pasteExamCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setExamCode(text.trim()); setJoinError(''); }
    } catch {
      setJoinError('Trình duyệt không cho phép đọc clipboard. Hãy nhấn Ctrl + V vào ô nhập.');
    }
  };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);

  // Trích xuất examId từ link hoặc mã đề thi
  const extractExamId = (input) => {
    const trimmed = input.trim();
    // Nếu là link dạng .../student/exam/EXAM_ID hoặc .../student/exam/EXAM_ID?...
    const linkMatch = trimmed.match(/\/student\/exam\/([a-zA-Z0-9]+)/);
    if (linkMatch) return linkMatch[1];
    // Nếu chỉ là mã examId thuần (không chứa dấu / hay khoảng trắng)
    if (/^[a-zA-Z0-9]+$/.test(trimmed) && trimmed.length >= 10) return trimmed;
    return null;
  };

  const handleJoinExam = async () => {
    setJoinError("");
    const examId = extractExamId(examCode);
    if (!examId) {
      setJoinError("Mã bài thi hoặc link không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }
    setJoinLoading(true);
    try {
      const examSnap = await withTimeout(getDoc(doc(db, "exams", examId)));
      if (examSnap.exists()) {
        navigate(`/student/exam/${examId}`);
      } else {
        setJoinError("Không tìm thấy bài thi với mã này. Vui lòng kiểm tra lại.");
      }
    } catch (error) {
      console.error("Lỗi khi tìm bài thi:", error);
      setJoinError("Đã xảy ra lỗi khi tìm bài thi. Vui lòng thử lại.");
    } finally {
      setJoinLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      if (!currentUser) return;
      try {
        setLoading(true); setLoadError(''); setSubmissions([]); setExamConfigs({});
        // 1. Fetch submissions
        const q = query(
          collection(db, "submissions"),
          where("studentId", "==", currentUser.uid)
        );
        const querySnapshot = await withTimeout(getDocs(q));
        const rawSubs = [];
        querySnapshot.forEach((doc) => {
          rawSubs.push({ id: doc.id, ...doc.data() });
        });

        const allSubs = rawSubs;
        // Sắp xếp theo thứ tự thời gian tăng dần để tính toán số lần thực hiện chính xác
        allSubs.sort((a, b) => {
          const timeA = timestampMillis(a.submittedAt);
          const timeB = timestampMillis(b.submittedAt);
          return timeA - timeB;
        });

        // Tính toán lần thực hiện cho từng đề thi
        const examCounters = {};
        const processedSubs = allSubs.map((sub) => {
          if (!examCounters[sub.examId]) {
            examCounters[sub.examId] = 0;
          }
          examCounters[sub.examId]++;
          return {
            ...sub,
            computedAttemptNumber: sub.attemptNumber || examCounters[sub.examId]
          };
        });

        // Sắp xếp lại theo thời gian giảm dần (mới nhất lên đầu) để hiển thị
        processedSubs.sort((a, b) => {
          const timeA = timestampMillis(a.submittedAt);
          const timeB = timestampMillis(b.submittedAt);
          return timeB - timeA;
        });

        // Lọc bỏ những bài làm đã bị học sinh xóa (ẩn đi đối với học sinh)
        const visibleSubs = processedSubs.filter(sub => !sub.deletedByStudent);
        if (!active) return;
        setSubmissions(visibleSubs); setLoading(false);
        // 2. Fetch attempt limits, review settings, and questions for unique exams
        const uniqueExamIds = [...new Set(rawSubs.map((s) => s.examId))];
        const configs = {};
        await mapConcurrent(uniqueExamIds.filter(Boolean), async (examId) => {
          try {
            const examSnap = await withTimeout(getDoc(doc(db, 'exams', examId)));
            if (examSnap.exists()) {
              const data = examSnap.data();
              configs[examId] = { limit: data.attemptLimit ?? 0, reviewSettings: data.reviewSettings || { mode: 'always' }, attemptCount: rawSubs.filter(sub => sub.examId === examId).length };
            }
          } catch (error) {
            console.error('Không tải được cấu hình đề:', error);
            if (active) setLoadError('Một số cấu hình đề thi chưa tải được. Điểm đã lưu vẫn được giữ nguyên.');
          }
        });
        if (active) setExamConfigs(configs);


      } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        if (active) setLoadError('Không tải được lịch sử bài làm. Dữ liệu chưa được xác nhận, vui lòng thử lại.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    return () => { active = false; };
  }, [currentUser]);

  const handleDeleteSubmission = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa lịch sử làm bài này? Hành động này không thể hoàn tác.")) {
      try {
        await updateDoc(doc(db, "submissions", id), { deletedByStudent: true });
        // Cập nhật lại state cục bộ thay vì fetch lại toàn bộ
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } catch (error) {
        console.error("Lỗi khi xóa lịch sử:", error);
        alert("Không thể xóa lúc này, vui lòng thử lại sau.");
      }
    }
  };

  const handleDeleteAllSubmissions = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa TẤT CẢ lịch sử làm bài? Hành động này không thể hoàn tác.")) {
      try {
        const outcomes = await Promise.allSettled(submissions.map(sub =>
          withTimeout(updateDoc(doc(db, 'submissions', sub.id), { deletedByStudent: true }))
        ));
        const hidden = new Set(submissions.filter((_, i) => outcomes[i].status === 'fulfilled').map(sub => sub.id));
        setSubmissions(prev => prev.filter(sub => !hidden.has(sub.id)));
        if (outcomes.some(result => result.status === 'rejected')) alert('Một số bài chưa ẩn được. Các bài còn lại vẫn hiển thị để bạn thử lại.');
      } catch (error) {
        console.error("Lỗi khi xóa tất cả lịch sử:", error);
        alert("Không thể xóa lúc này, vui lòng thử lại sau.");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-medium">Đang tải lịch sử học tập...</p>
      </div>
    );
  }

  const visibleHistory = submissions.filter(sub => !historyQuery.trim() || String(sub.examTitle || '').toLowerCase().includes(historyQuery.trim().toLowerCase()));

  return (
    <div className="student-dashboard">
      <header className="student-page-heading">
        <span className="eyebrow">KHÔNG GIAN HỌC SINH</span>
        <h1>Bài thi của bạn</h1>
        <p>Chào {currentUser?.displayName || 'bạn'}. Vào thi bằng mã đề hoặc xem lại bài đã làm.</p>
      </header>
      {loadError && <div role="alert" className="student-data-alert">{loadError} <button onClick={() => window.location.reload()}>Thử lại</button></div>}

      <div className="student-page-grid">
        <aside className="student-join-card" aria-labelledby="join-title">
          <div className="student-join-icon"><ArrowRight size={24} aria-hidden="true" /></div>
          <h2 id="join-title">Tham gia bài thi</h2>
          <p>Nhập mã đề hoặc dán đường dẫn giáo viên đã gửi cho bạn.</p>
          <form onSubmit={event => { event.preventDefault(); if (examCode.trim() && !joinLoading) handleJoinExam(); }}>
            <label htmlFor="exam-code">Mã đề hoặc đường dẫn</label>
            <div className="student-code-field">
              <input id="exam-code" value={examCode} onChange={e => { setExamCode(e.target.value); setJoinError(''); }} placeholder="Nhập mã hoặc dán link…" aria-describedby={joinError ? 'join-error' : 'exam-code-hint'} aria-invalid={!!joinError} autoComplete="off" />
              <button type="button" onClick={pasteExamCode} aria-label="Dán mã đề từ clipboard" title="Dán mã đề"><ClipboardPaste size={18} /></button>
            </div>
            <p id="exam-code-hint" className="student-field-hint">Bạn có thể dán bằng Ctrl + V.</p>
            {joinError && <p id="join-error" role="alert" className="student-join-error">{joinError}</p>}
            <button type="submit" className="student-enter-button" disabled={!examCode.trim() || joinLoading}>
              {joinLoading ? 'Đang tìm bài thi…' : 'Vào thi'}<ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
          <div className="student-join-note"><LockKeyhole size={16} aria-hidden="true" /><span>Kiểm tra thông tin và yêu cầu của đề trước khi bắt đầu.</span></div>
        </aside>

        <section className="student-history-panel" aria-labelledby="history-title">
          <div className="student-history-heading">
            <div><h2 id="history-title">Lịch sử bài làm</h2><p>Bài mới nhất hiển thị trước.</p></div>
            {submissions.length > 0 && <button onClick={handleDeleteAllSubmissions} className="student-clear-history"><Trash2 size={16} aria-hidden="true" />Xóa tất cả</button>}
          </div>
          {submissions.length > 0 && <label className="student-history-filter"><Search size={18} aria-hidden="true" /><input type="search" value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} placeholder="Tìm theo tên đề thi…" aria-label="Tìm trong lịch sử bài làm" /></label>}

          {submissions.length === 0 ? <div className="student-history-empty">
            <BookOpen size={32} aria-hidden="true" /><h3>{loadError ? 'Chưa tải được lịch sử' : 'Chưa có bài làm'}</h3>
            <p>{loadError ? 'Thử tải lại để xem dữ liệu đã lưu.' : 'Sau khi nộp bài, kết quả và bài làm sẽ xuất hiện ở đây.'}</p>
            {!loadError && <button onClick={() => document.getElementById('exam-code')?.focus()}>Nhập mã đề<ArrowRight size={16} /></button>}
          </div> : visibleHistory.length === 0 ? <div className="student-history-empty"><Search size={30} /><h3>Không tìm thấy bài làm</h3><p>Không có đề nào khớp “{historyQuery}”.</p><button onClick={() => setHistoryQuery('')}>Xóa tìm kiếm</button></div> :
            <ul className="student-history-list">
              {visibleHistory.map(sub => {
                const config = examConfigs[sub.examId] || { limit: 1, attemptCount: 1, reviewSettings: { mode: 'never' } };
                const limitReached = config.limit > 0 && config.attemptCount >= config.limit;
                const settings = config.reviewSettings;
                const openTime = timestampMillis(settings.time);
                const reviewLocked = settings.mode === 'never' || (settings.mode === 'after_time' && (!openTime || now < openTime));
                const date = timestampDate(sub.submittedAt);
                return <li key={sub.id} className="student-history-item">
                  <div className="student-result-top">
                    <div className="student-result-icon"><FileText size={21} aria-hidden="true" /></div>
                    <div className="student-result-title"><h3>{sub.examTitle || 'Bài thi'}</h3><p>Lần {sub.computedAttemptNumber} <span aria-hidden="true">·</span> {date?.toLocaleDateString('vi-VN') || 'Chưa có ngày nộp'}{date && `, ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}</p></div>
                    <div className="student-result-score"><span>Điểm</span><strong>{sub.score ?? '—'}<small> / 10</small></strong></div>
                  </div>
                  <div className="student-result-bottom">
                    <span className="student-correct-count">{sub.correctCount ?? '—'} / {sub.totalQuestions ?? '—'} câu đúng</span>
                    <div className="student-result-actions">
                      {reviewLocked ? <span className="student-review-locked"><LockKeyhole size={14} aria-hidden="true" />Đang khóa</span> : <Link to={`/student/review/${sub.id}?from=student`}>Xem bài làm<ArrowRight size={15} aria-hidden="true" /></Link>}
                      <button onClick={() => navigate(`/student/exam/${sub.examId}`)} disabled={limitReached} aria-label={`Làm lại đề ${sub.examTitle}`} title={limitReached ? 'Hết lượt làm bài' : 'Làm lại đề thi'}><RefreshCw size={15} aria-hidden="true" />{limitReached ? 'Hết lượt' : 'Làm lại'}</button>
                      <button onClick={() => handleDeleteSubmission(sub.id)} className="student-remove-result" aria-label={`Xóa bài làm ${sub.examTitle}`} title="Xóa khỏi lịch sử"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </li>;
              })}
            </ul>
          }
        </section>
      </div>
    </div>
  );
}
