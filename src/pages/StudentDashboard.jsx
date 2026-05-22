import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Trash2, Search, ArrowRight, Lock } from "lucide-react";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function StudentDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Dolphin | Bảng điều khiển");
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [examConfigs, setExamConfigs] = useState({}); // {examId: {limit, reviewSettings}}
  const [examCode, setExamCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

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
      const examSnap = await getDoc(doc(db, "exams", examId));
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

  // Fetch submissions and exam limits
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;
      try {
        setLoading(true);
        // 1. Fetch submissions
        const q = query(
          collection(db, "submissions"),
          where("studentId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const allSubs = [];
        querySnapshot.forEach((doc) => {
          allSubs.push({ id: doc.id, ...doc.data() });
        });

        // Sắp xếp theo thứ tự thời gian tăng dần để tính toán số lần thực hiện chính xác
        allSubs.sort((a, b) => {
          const timeA = a.submittedAt ? a.submittedAt.toMillis() : 0;
          const timeB = b.submittedAt ? b.submittedAt.toMillis() : 0;
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
          const timeA = a.submittedAt ? a.submittedAt.toMillis() : 0;
          const timeB = b.submittedAt ? b.submittedAt.toMillis() : 0;
          return timeB - timeA;
        });

        // Lọc bỏ những bài làm đã bị học sinh xóa (ẩn đi đối với học sinh)
        const visibleSubs = processedSubs.filter(sub => !sub.deletedByStudent);
        setSubmissions(visibleSubs);

        // 2. Fetch attempt limits and review settings for unique exams
        const uniqueExamIds = [...new Set(visibleSubs.map((s) => s.examId))];
        const configs = {};
        for (const examId of uniqueExamIds) {
          const examRef = doc(db, "exams", examId);
          const examSnap = await getDoc(examRef);
          if (examSnap.exists()) {
            const data = examSnap.data();
            configs[examId] = {
              limit: data.attemptLimit ?? 0,
              reviewSettings: data.reviewSettings || { mode: 'always' }
            };
          }
        }
        setExamConfigs(configs);
      } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser?.uid]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-medium">Đang tải lịch sử học tập...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Bảng điều khiển</h2>
        <p className="text-gray-500 font-medium mt-1">Chào mừng quay trở lại, {currentUser?.displayName}!</p>
      </div>

      {/* Phần tham gia bài thi */}
      <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Tham gia bài thi</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Dán link bài thi hoặc nhập mã đề thi mà giáo viên đã gửi cho bạn.</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={examCode}
            onChange={(e) => { setExamCode(e.target.value); setJoinError(""); }}
            onKeyDown={(e) => e.key === "Enter" && examCode.trim() && handleJoinExam()}
            placeholder="Dán link bài thi hoặc nhập mã đề thi..."
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 shadow-sm"
          />
          <button
            onClick={handleJoinExam}
            disabled={!examCode.trim() || joinLoading}
            className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm ${
              !examCode.trim() || joinLoading
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-95 text-white"
            }`}
          >
            {joinLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {joinLoading ? "Đang tìm..." : "Vào thi"}
          </button>
        </div>
        {joinError && (
          <p className="mt-3 text-sm text-red-600 font-medium">{joinError}</p>
        )}
      </div>

      {/* Lịch sử học tập */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900">Lịch sử học tập</h3>
      </div>      {submissions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
             <RefreshCw className="w-10 h-10 text-gray-300" />
          </div>
          <p className="text-gray-400 text-lg font-medium">Bạn chưa hoàn thành bài thi nào.</p>
          <Link to="/" className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
            Khám phá ngay
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="p-5 text-xs font-black text-gray-400 uppercase tracking-wider">Đề thi</th>
                  <th className="p-5 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Kết quả</th>
                  <th className="p-5 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Câu đúng</th>
                  <th className="p-5 text-xs font-black text-gray-400 uppercase tracking-wider text-center">Ngày nộp</th>
                  <th className="p-5 text-xs font-black text-gray-400 uppercase tracking-wider text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {submissions.map((sub) => {
                  const config = examConfigs[sub.examId] || { limit: 0, reviewSettings: { mode: 'always' } };
                  const limit = config.limit;
                  const reviewSettings = config.reviewSettings;
                  const userAttemptCount = submissions.filter(s => s.examId === sub.examId).length;
                  const isLimitReached = limit > 0 && userAttemptCount >= limit;

                  let isReviewLocked = false;
                  if (reviewSettings.mode === 'never') {
                      isReviewLocked = true;
                  } else if (reviewSettings.mode === 'after_time' && reviewSettings.time) {
                      const openTime = new Date(reviewSettings.time).getTime();
                      if (Date.now() < openTime) {
                          isReviewLocked = true;
                      }
                  }

                  return (
                    <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="p-5">
                        <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{sub.examTitle}</p>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5">
                          Lần thực hiện {sub.computedAttemptNumber}
                        </p>
                      </td>
                      <td className="p-5 text-center">
                        <span className={`inline-flex items-center justify-center px-4 py-1 rounded-full text-sm font-black ${
                          sub.score >= 5 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        }`}>
                          {sub.score} / 10
                        </span>
                      </td>
                      <td className="p-5 text-center">
                        <span className="text-sm font-bold text-gray-600">{sub.correctCount} / {sub.totalQuestions}</span>
                      </td>
                      <td className="p-5 text-center">
                        <p className="text-sm font-medium text-gray-500">
                          {sub.submittedAt ? new Date(sub.submittedAt.toDate()).toLocaleDateString("vi-VN") : "---"}
                        </p>
                        <p className="text-[10px] text-gray-300 font-bold">
                           {sub.submittedAt ? new Date(sub.submittedAt.toDate()).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) : ""}
                        </p>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end items-center gap-3">
                          {isReviewLocked ? (
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 cursor-not-allowed" title="Chưa đến thời gian xem lại hoặc giáo viên không cho phép">
                                  Đang khóa
                              </span>
                          ) : (
                              <Link
                                to={`/student/review/${sub.id}`}
                                className="text-xs font-black text-blue-600 hover:underline uppercase tracking-wider"
                              >
                                Xem chi tiết
                              </Link>
                          )}
                          <button
                            onClick={() => navigate(`/student/exam/${sub.examId}`)}
                            disabled={isLimitReached}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                isLimitReached
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                            }`}
                            title={isLimitReached ? "Hết lượt làm bài" : "Làm lại đề thi"}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isLimitReached ? "Hết lượt" : "Làm lại"}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSubmission(sub.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa lịch sử"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
