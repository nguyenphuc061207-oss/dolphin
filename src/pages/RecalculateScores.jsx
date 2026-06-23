import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  FileText,
} from "lucide-react";

/**
 * Recalculate score for a single submission using the FIXED scoring logic.
 * This mirrors handleSubmitExam from TakeExam.jsx (post-fix version).
 */
function recalculate(examSnapshot, answers) {
  let correct = 0;
  const total = examSnapshot.length;

  examSnapshot.forEach((q, i) => {
    const type = q.type || "single";
    const ans = answers[i] ?? answers[String(i)]; // Firestore keys may be string

    if (type === "essay") {
      // essays are not auto-graded
    } else if (type === "multiple") {
      const ca = Array.isArray(q.correctAnswer)
        ? [...q.correctAnswer]
            .map(Number)
            .sort((a, b) => a - b)
            .join(",")
        : "";
      const sa = Array.isArray(ans)
        ? [...ans]
            .map(Number)
            .sort((a, b) => a - b)
            .join(",")
        : "";
      if (ca === sa && ca !== "") correct++;
    } else if (type === "multi_true_false") {
      const statements = q.options.length;
      let correctStmts = 0;
      for (let j = 0; j < statements; j++) {
        if (Array.isArray(ans) && ans[j] === q.correctAnswer[j]) correctStmts++;
      }
      let points = 0;
      if (q.scoringMethod === "gdpt_2018") {
        const r = correctStmts / statements;
        if (r === 1) points = 1;
        else if (r >= 0.75) points = 0.5;
        else if (r >= 0.5) points = 0.25;
        else if (r >= 0.25) points = 0.1;
      } else {
        points = correctStmts / statements;
      }
      correct += points;
    } else {
      // single / true_false
      if (ans === q.correctAnswer) correct++;
    }
  });

  const gradable = examSnapshot.filter(
    (q) => (q.type || "single") !== "essay"
  ).length;
  const score = gradable > 0 ? Number(((correct / gradable) * 10).toFixed(2)) : 0;

  return { correct, score, gradable, total };
}

export default function RecalculateScores() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState("idle"); // idle | loading | done
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateDone, setUpdateDone] = useState(false);

  // Step 1: Scan all submissions for this teacher's exams
  const handleScan = async () => {
    if (!currentUser) return;
    setStatus("loading");
    setResults([]);
    setSummary(null);
    setUpdateDone(false);

    try {
      // 1. Get all exams by this teacher
      const examsQ = query(
        collection(db, "exams"),
        where("teacherId", "==", currentUser.uid)
      );
      const examsSnap = await getDocs(examsQ);
      const examIds = [];
      examsSnap.forEach((d) => examIds.push(d.id));

      if (examIds.length === 0) {
        setSummary({ total: 0, changed: 0 });
        setStatus("done");
        return;
      }

      // 2. Get all submissions for those exams (batch by 30 for Firestore 'in' limit)
      const allSubmissions = [];
      for (let i = 0; i < examIds.length; i += 30) {
        const batch = examIds.slice(i, i + 30);
        const subQ = query(
          collection(db, "submissions"),
          where("examId", "in", batch)
        );
        const subSnap = await getDocs(subQ);
        subSnap.forEach((d) =>
          allSubmissions.push({ id: d.id, ...d.data() })
        );
      }

      // 3. Recalculate each submission
      const changes = [];
      let totalScanned = 0;

      for (const sub of allSubmissions) {
        if (!sub.examSnapshot || !sub.answers) continue;
        totalScanned++;

        const { correct: newCorrect, score: newScore } = recalculate(
          sub.examSnapshot,
          sub.answers
        );

        const oldScore = sub.score ?? 0;
        const oldCorrect = sub.correctCount ?? 0;

        // Check if there's a meaningful difference
        const scoreDiff = Math.abs(newScore - oldScore) > 0.001;
        const correctDiff = Math.abs(newCorrect - oldCorrect) > 0.001;

        if (scoreDiff || correctDiff) {
          changes.push({
            id: sub.id,
            studentName: sub.studentName || "Ẩn danh",
            examTitle: sub.examTitle || "Không rõ",
            oldScore,
            newScore,
            oldCorrect,
            newCorrect,
            totalQuestions: sub.totalQuestions || sub.examSnapshot.length,
            hasMultiple: sub.examSnapshot.some(
              (q) => (q.type || "single") === "multiple"
            ),
          });
        }
      }

      setResults(changes);
      setSummary({ total: totalScanned, changed: changes.length });
      setStatus("done");
    } catch (err) {
      console.error("Scan error:", err);
      alert("Lỗi khi quét bài nộp: " + (err.message || err));
      setStatus("idle");
    }
  };

  // Step 2: Apply the updates
  const handleUpdate = async () => {
    if (results.length === 0) return;
    if (
      !window.confirm(
        `Bạn có chắc muốn cập nhật điểm cho ${results.length} bài nộp?`
      )
    )
      return;

    setIsUpdating(true);
    let updated = 0;
    let errors = 0;

    for (const r of results) {
      try {
        await updateDoc(doc(db, "submissions", r.id), {
          score: r.newScore,
          correctCount: r.newCorrect,
        });
        updated++;
      } catch (err) {
        console.error(`Error updating ${r.id}:`, err);
        errors++;
      }
    }

    setIsUpdating(false);
    setUpdateDone(true);
    alert(
      `Hoàn tất! Đã cập nhật ${updated} bài nộp.${
        errors > 0 ? ` (${errors} lỗi)` : ""
      }`
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] py-10 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-1 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
              <RefreshCw className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">
                Chấm lại điểm bài kiểm tra
              </h1>
              <p className="text-gray-500 font-medium text-sm mt-1">
                Quét và cập nhật điểm cho các bài nộp bị chấm sai do lỗi câu
                hỏi "Chọn nhiều"
              </p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">Lỗi đã được khắc phục bao gồm:</p>
            <ul className="list-disc ml-4 space-y-1 text-amber-700">
              <li>
                <code className="bg-amber-100 px-1 rounded text-xs">.sort()</code>{" "}
                thiếu numeric comparator gây sai thứ tự khi so sánh đáp án
              </li>
              <li>
                <code className="bg-amber-100 px-1 rounded text-xs">.filter().map()</code>{" "}
                gây lệch index đáp án khi options có phần tử trống
              </li>
              <li>
                Kiểu dữ liệu không nhất quán (string vs number) khi đọc từ
                Firestore
              </li>
            </ul>
          </div>
        </div>

        {/* Scan Button */}
        {status === "idle" && (
          <div className="text-center">
            <button
              onClick={handleScan}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-blue-200 flex items-center gap-3 mx-auto"
            >
              <FileText className="w-5 h-5" />
              Quét tất cả bài nộp
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Hệ thống sẽ quét toàn bộ bài nộp của các đề thi bạn tạo và so
              sánh điểm
            </p>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div className="text-center py-16">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-500 font-bold">
              Đang quét và chấm lại điểm...
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Quá trình này có thể mất vài giây
            </p>
          </div>
        )}

        {/* Results */}
        {status === "done" && summary && (
          <>
            {/* Summary Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-6">
              <div className="flex flex-wrap items-center gap-6 justify-center">
                <div className="text-center px-6 py-4 bg-blue-50 rounded-2xl border border-blue-100 min-w-[140px]">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">
                    Đã quét
                  </p>
                  <p className="text-3xl font-black text-blue-700">
                    {summary.total}
                  </p>
                  <p className="text-[10px] text-blue-400 font-bold">bài nộp</p>
                </div>
                <div
                  className={`text-center px-6 py-4 rounded-2xl border min-w-[140px] ${
                    summary.changed > 0
                      ? "bg-red-50 border-red-100"
                      : "bg-emerald-50 border-emerald-100"
                  }`}
                >
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                      summary.changed > 0 ? "text-red-500" : "text-emerald-500"
                    }`}
                  >
                    Cần cập nhật
                  </p>
                  <p
                    className={`text-3xl font-black ${
                      summary.changed > 0
                        ? "text-red-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {summary.changed}
                  </p>
                  <p
                    className={`text-[10px] font-bold ${
                      summary.changed > 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    bài sai lệch
                  </p>
                </div>
              </div>

              {summary.changed === 0 && (
                <div className="mt-6 text-center flex flex-col items-center gap-2">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                  <p className="text-emerald-700 font-bold text-lg">
                    Tất cả điểm đều chính xác!
                  </p>
                  <p className="text-gray-400 text-sm">
                    Không có bài nộp nào bị ảnh hưởng bởi lỗi trước đó.
                  </p>
                </div>
              )}
            </div>

            {/* Changed Submissions List */}
            {results.length > 0 && (
              <>
                <div className="space-y-3 mb-8">
                  {results.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {r.studentName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {r.examTitle}
                        </p>
                        {r.hasMultiple && (
                          <span className="inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            Có câu "Chọn nhiều"
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Old Score */}
                        <div className="text-center px-3 py-2 bg-red-50 rounded-xl border border-red-100 min-w-[70px]">
                          <p className="text-[8px] font-black text-red-400 uppercase">
                            Điểm cũ
                          </p>
                          <p className="text-lg font-black text-red-600">
                            {r.oldScore}
                          </p>
                          <p className="text-[8px] text-red-400">
                            {typeof r.oldCorrect === 'number' ? r.oldCorrect.toFixed(1) : r.oldCorrect}/{r.totalQuestions} câu
                          </p>
                        </div>
                        {/* Arrow */}
                        <span className="text-gray-300 text-lg font-bold">→</span>
                        {/* New Score */}
                        <div className="text-center px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100 min-w-[70px]">
                          <p className="text-[8px] font-black text-emerald-400 uppercase">
                            Điểm mới
                          </p>
                          <p className="text-lg font-black text-emerald-600">
                            {r.newScore}
                          </p>
                          <p className="text-[8px] text-emerald-400">
                            {typeof r.newCorrect === 'number' ? r.newCorrect.toFixed(1) : r.newCorrect}/{r.totalQuestions} câu
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Update Button */}
                {!updateDone ? (
                  <div className="text-center">
                    <button
                      onClick={handleUpdate}
                      disabled={isUpdating}
                      className={`px-8 py-4 font-black text-lg rounded-2xl transition-all shadow-xl flex items-center gap-3 mx-auto ${
                        isUpdating
                          ? "bg-gray-400 cursor-not-allowed text-white"
                          : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-200"
                      }`}
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Đang cập nhật...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Cập nhật điểm cho {results.length} bài nộp
                        </>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 mt-3">
                      Hành động này sẽ ghi đè điểm cũ trên Firestore
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-emerald-700 font-bold text-lg">
                      Đã cập nhật xong!
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Tất cả điểm đã được chấm lại chính xác.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Rescan button */}
            <div className="text-center mt-8">
              <button
                onClick={() => {
                  setStatus("idle");
                  setResults([]);
                  setSummary(null);
                  setUpdateDone(false);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 font-bold transition-colors"
              >
                ← Quét lại
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
