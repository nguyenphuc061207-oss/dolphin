import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, PenLine } from "lucide-react";
import RichTextRenderer from "../components/RichTextRenderer";

const TYPE_LABELS = {
    single:     { label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700' },
    multiple:   { label: 'Chọn nhiều',  color: 'bg-purple-100 text-purple-700' },
    true_false: { label: 'Đúng/Sai',   color: 'bg-amber-100 text-amber-700' },
    essay:      { label: 'Tự luận',    color: 'bg-emerald-100 text-emerald-700' },
};

/** Check correctness for any question type */
function checkCorrect(q, studentAns) {
    const type = q.type || 'single';
    if (type === 'essay') return null; // not auto-gradable
    if (type === 'multiple') {
        const ca = Array.isArray(q.correctAnswer) ? [...q.correctAnswer].sort().join(',') : '';
        const sa = Array.isArray(studentAns) ? [...studentAns].sort().join(',') : '';
        return ca === sa && ca !== '';
    }
    return studentAns === q.correctAnswer;
}

export default function ReviewExam() {
    const navigate = useNavigate();
    const { submissionId } = useParams();
    const [submission, setSubmission] = useState(null);
    const [loading, setLoading] = useState(true);
    const [examInfo, setExamInfo] = useState(null);
    const [submissionCount, setSubmissionCount] = useState(0);
    const [filter, setFilter] = useState("all"); // all, correct, incorrect

    useEffect(() => {
        const fetchReviewData = async () => {
            try {
                const subRef = doc(db, "submissions", submissionId);
                const subSnap = await getDoc(subRef);

                if (subSnap.exists()) {
                    setSubmission(subSnap.data());
                } else {
                    alert("Không tìm thấy bài làm!");
                }
            } catch (error) {
                console.error("Lỗi khi tải chi tiết:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReviewData();
    }, [submissionId]);

    useEffect(() => {
        if (!submission) return;
        const fetchExamInfo = async () => {
            try {
                const examRef = doc(db, "exams", submission.examId);
                const examSnap = await getDoc(examRef);
                if (examSnap.exists()) setExamInfo(examSnap.data());
                
                const subQuery = query(
                    collection(db, "submissions"),
                    where("examId", "==", submission.examId),
                    where("studentId", "==", submission.studentId)
                );
                const subSnap = await getDocs(subQuery);
                setSubmissionCount(subSnap.size);
            } catch (e) { console.error(e); }
        };
        fetchExamInfo();
    }, [submission]);

    if (loading) return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!submission || !submission.examSnapshot) return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">Không hỗ trợ xem chi tiết</h2>
            <p className="text-gray-500 max-w-md mt-2">Bài làm này thuộc phiên bản cũ hoặc dữ liệu không đầy đủ, không hỗ trợ xem chi tiết từng câu.</p>
            <Link to="/student" className="mt-6 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
                Quay lại bảng điểm
            </Link>
        </div>
    );

    const filteredQuestions = submission.examSnapshot
        .map((q, i) => ({ ...q, originalIndex: i }))
        .filter(q => {
            if (filter === "all") return true;
            const result = checkCorrect(q, submission.answers[q.originalIndex]);
            if (result === null) return filter === "all"; // essays only in 'all'
            return filter === "correct" ? result : !result;
        });

    return (
        <div className="min-h-screen bg-[#f8fafc] py-10 px-6">
            <div className="max-w-4xl mx-auto">
                {/* Header Card */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Link to="/student" className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-1 transition-colors">
                                    &larr; Bảng điểm
                                </Link>
                                <span className="text-gray-300">/</span>
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Chi tiết bài làm</span>
                            </div>
                            <h1 className="text-3xl font-black text-gray-900 leading-tight">{submission.examTitle}</h1>
                            <p className="text-gray-500 font-medium mt-1">Học sinh: <span className="text-gray-900 font-bold">{submission.studentName}</span></p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="px-6 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center min-w-[120px]">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Điểm số</p>
                                <p className="text-3xl font-black text-emerald-700">{submission.score}</p>
                            </div>
                            {examInfo && (
                                <button
                                    onClick={() => navigate(`/student/exam/${submission.examId}`)}
                                    disabled={examInfo.attemptLimit > 0 && submissionCount >= examInfo.attemptLimit}
                                    className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-lg ${
                                        examInfo.attemptLimit > 0 && submissionCount >= examInfo.attemptLimit
                                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 active:scale-95"
                                    }`}
                                >
                                    <RefreshCw className="w-5 h-5" />
                                    {examInfo.attemptLimit > 0 && submissionCount >= examInfo.attemptLimit ? "HẾT LƯỢT" : "LÀM LẠI"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-gray-100 sticky top-4 z-40">
                    <button 
                        onClick={() => setFilter("all")}
                        className={`flex-1 py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Tất cả ({submission.examSnapshot.length})
                    </button>
                    <button 
                        onClick={() => setFilter("correct")}
                        className={`flex-1 py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all ${filter === 'correct' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Câu đúng ({submission.correctCount})
                    </button>
                    <button 
                        onClick={() => setFilter("incorrect")}
                        className={`flex-1 py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all ${filter === 'incorrect' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Câu sai ({submission.examSnapshot.length - submission.correctCount})
                    </button>
                </div>

                {/* Question List */}
                <div className="space-y-6">
                    {filteredQuestions.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                            <CheckCircle2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold text-lg">Không có câu hỏi nào trong danh mục này.</p>
                        </div>
                    ) : (
                        filteredQuestions.map((question) => {
                            const qIndex = question.originalIndex;
                            const studentChoice = submission.answers[qIndex];
                            const qType = question.type || 'single';
                            const typeInfo = TYPE_LABELS[qType] || TYPE_LABELS.single;
                            const isEssay = qType === 'essay';
                            const isMulti = qType === 'multiple';
                            const result = checkCorrect(question, studentChoice);
                            // Border/bg by result (essay = neutral)
                            const cardBorder = result === null
                                ? 'border-gray-100'
                                : result ? 'border-emerald-100 shadow-emerald-50/50' : 'border-red-100 shadow-red-50/50';

                            return (
                                <div key={qIndex} className={`bg-white rounded-3xl p-8 shadow-sm border transition-all ${cardBorder}`}>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="font-bold text-gray-900 flex items-baseline gap-3 text-lg leading-relaxed flex-1 min-w-0">
                                            <span className="shrink-0 text-blue-600 font-black">Câu {qIndex + 1}:</span>
                                            <div className="flex-1">
                                                <RichTextRenderer content={question.content} mathDict={submission.mathDictionary} />
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2 ml-3">
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                                            {result === null ? (
                                                <div className="flex items-center gap-1.5 text-gray-500 font-black bg-gray-50 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border border-gray-200">
                                                    <PenLine className="w-3.5 h-3.5" /> Tự luận
                                                </div>
                                            ) : result ? (
                                                <div className="flex items-center gap-1.5 text-emerald-600 font-black bg-emerald-50 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border border-emerald-100">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Đúng
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-red-600 font-black bg-red-50 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider border border-red-100">
                                                    <XCircle className="w-3.5 h-3.5" /> Sai
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── ESSAY: show written answer ── */}
                                    {isEssay && (
                                        <div className="bg-gray-50 rounded-2xl p-5 border border-dashed border-gray-200">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <PenLine className="w-3 h-3" /> Câu trả lời của bạn
                                            </p>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                                {typeof studentChoice === 'string' && studentChoice.trim()
                                                    ? studentChoice
                                                    : <span className="italic text-gray-400">(Không có câu trả lời)</span>
                                                }
                                            </p>
                                        </div>
                                    )}

                                    {/* ── SINGLE / MULTIPLE / TRUE-FALSE: options grid ── */}
                                    {!isEssay && (
                                        <div className="grid grid-cols-1 gap-3">
                                            {question.options.map((option, oIndex) => {
                                                const isAnswered = isMulti
                                                    ? Array.isArray(studentChoice) && studentChoice.includes(oIndex)
                                                    : oIndex === studentChoice;
                                                const isCorrectOpt = isMulti
                                                    ? Array.isArray(question.correctAnswer) && question.correctAnswer.includes(oIndex)
                                                    : oIndex === question.correctAnswer;

                                                let cardClass = "bg-gray-50 border-gray-100 text-gray-600";
                                                let circleClass = "border-gray-300 text-gray-400 bg-white";

                                                if (isCorrectOpt) {
                                                    cardClass = "bg-emerald-50 border-emerald-500 text-emerald-900 font-bold ring-1 ring-emerald-500 shadow-sm shadow-emerald-100";
                                                    circleClass = "bg-emerald-500 border-emerald-500 text-white";
                                                } else if (isAnswered) {
                                                    cardClass = "bg-red-50 border-red-500 text-red-900 font-bold ring-1 ring-red-500 shadow-sm shadow-red-100";
                                                    circleClass = "bg-red-500 border-red-500 text-white";
                                                }

                                                return (
                                                    <div key={oIndex} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${cardClass}`}>
                                                        <div className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-${isMulti ? 'md' : 'full'} border text-xs font-black transition-colors ${circleClass}`}>
                                                            {String.fromCharCode(65 + oIndex)}
                                                        </div>
                                                        <div className="text-sm font-medium flex-1">
                                                            <RichTextRenderer content={option} mathDict={submission.mathDictionary} />
                                                        </div>
                                                        {isCorrectOpt && isAnswered && (
                                                            <span className="ml-auto flex items-center gap-1 text-emerald-600 text-[9px] font-black uppercase tracking-tighter">
                                                                <CheckCircle2 className="w-3 h-3" /> Chính xác
                                                            </span>
                                                        )}
                                                        {!isCorrectOpt && isAnswered && (
                                                            <span className="ml-auto flex items-center gap-1 text-red-600 text-[9px] font-black uppercase tracking-tighter">
                                                                <XCircle className="w-3 h-3" /> Bạn đã chọn
                                                            </span>
                                                        )}
                                                        {isCorrectOpt && !isAnswered && (
                                                            <span className="ml-auto flex items-center gap-1 text-emerald-600 text-[9px] font-black uppercase tracking-tighter">
                                                                <CheckCircle2 className="w-3 h-3" /> Đáp án đúng
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}