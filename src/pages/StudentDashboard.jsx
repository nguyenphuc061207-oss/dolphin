import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, Trash2 } from "lucide-react";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function StudentDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Dolphin | Bảng điều khiển");
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [examLimits, setExamLimits] = useState({}); // {examId: attemptLimit}

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
        const subs = [];
        querySnapshot.forEach((doc) => {
          subs.push({ id: doc.id, ...doc.data() });
        });

        // Sort newest first
        subs.sort((a, b) => {
          const timeA = a.submittedAt ? a.submittedAt.toMillis() : 0;
          const timeB = b.submittedAt ? b.submittedAt.toMillis() : 0;
          return timeB - timeA;
        });
        setSubmissions(subs);

        // 2. Fetch attempt limits for unique exams
        const uniqueExamIds = [...new Set(subs.map((s) => s.examId))];
        const limits = {};
        for (const examId of uniqueExamIds) {
          const examRef = doc(db, "exams", examId);
          const examSnap = await getDoc(examRef);
          if (examSnap.exists()) {
            limits[examId] = examSnap.data().attemptLimit ?? 0;
          }
        }
        setExamLimits(limits);
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
        await deleteDoc(doc(db, "submissions", id));
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
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Lịch sử học tập</h2>
        <p className="text-gray-500 font-medium mt-1">Chào mừng quay trở lại, {currentUser?.displayName}!</p>
      </div>

      {submissions.length === 0 ? (
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
                  const limit = examLimits[sub.examId] || 0;
                  const userAttemptCount = submissions.filter(s => s.examId === sub.examId).length;
                  const isLimitReached = limit > 0 && userAttemptCount >= limit;

                  return (
                    <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="p-5">
                        <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{sub.examTitle}</p>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Lần thực hiện {
                          submissions.filter(s => s.examId === sub.examId && (s.submittedAt?.toMillis() || 0) <= (sub.submittedAt?.toMillis() || 0)).length
                        }</p>
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
                          <Link
                            to={`/student/review/${sub.id}`}
                            className="text-xs font-black text-blue-600 hover:underline uppercase tracking-wider"
                          >
                            Xem chi tiết
                          </Link>
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
