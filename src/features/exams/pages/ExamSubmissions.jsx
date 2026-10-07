import { withTimeout, timestampDate, timestampMillis } from '@/shared/utils/runtimeSafety';
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "@/shared/config/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, getDoc } from "firebase/firestore";
import { Trash2, Eye, Download, ChevronLeft } from "lucide-react";
import TeacherSidebar from '../components/TeacherSidebar';
import AccountMenu from '@/shared/components/AccountMenu';

const getAttemptNumber = (sub, allSubs) => {
    if (sub.attemptNumber !== undefined) return sub.attemptNumber;
    
    const studentSubs = allSubs
        .filter(s => sub.studentId ? s.studentId === sub.studentId : !s.studentId && s.studentName === sub.studentName)
        .sort((a, b) => timestampMillis(a.submittedAt) - timestampMillis(b.submittedAt));
        
    const index = studentSubs.findIndex(s => s.id === sub.id);
    return index !== -1 ? index + 1 : 1;
};

export default function ExamSubmissions() {
    const { examId } = useParams();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
    const [examTitle, setExamTitle] = useState("");
    const [exam, setExam] = useState(null);
    const fetchGeneration = useRef(0);

    const fetchSubmissions = useCallback(async () => {
        const request = ++fetchGeneration.current;
        setLoading(true); setLoadError(''); setExam(null); setExamTitle(''); setSubmissions([]);
        try {
            // Fetch cấu hình đề thi để kiểm tra tính năng giám sát
            let examData = null;
            try {
                const examSnap = await withTimeout(getDoc(doc(db, "exams", examId)));
                if (request !== fetchGeneration.current) return;
                if (examSnap.exists()) {
                    examData = examSnap.data();
                    setExam(examData);
                    setExamTitle(examData.title);
                }
            } catch (error) {
                console.error('Không tải được cấu hình đề:', error);
                if (request !== fetchGeneration.current) return;
                setLoadError('Chưa tải được cấu hình đề thi. Danh sách bên dưới giữ nguyên điểm đã lưu.');
            }

            const q = query(
                collection(db, "submissions"),
                where("examId", "==", examId)
            );

            const querySnapshot = await withTimeout(getDocs(q));
            if (request !== fetchGeneration.current) return;
            const subs = [];
            for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data();
                const subId = docSnap.id;
                
                subs.push({ id: subId, ...data });
            }

            if (subs.length > 0 && !examData) {
                setExamTitle(subs[0].examTitle);
            }

            // Sắp xếp điểm từ cao xuống thấp
            subs.sort((a, b) => b.score - a.score);
            setSubmissions(subs);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu thống kê:", error);
            if (request === fetchGeneration.current) setLoadError('Không tải được danh sách bài nộp. Vui lòng thử lại.');
        } finally {
            if (request === fetchGeneration.current) setLoading(false);
        }
    }, [examId]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(() => { if (active) fetchSubmissions(); });
        return () => { active = false; fetchGeneration.current++; };
    }, [fetchSubmissions]);

    const handleDeleteSubmission = async (id) => {
        if (window.confirm("Bạn có chắc muốn xóa kết quả của học sinh này?")) {
            try {
                await deleteDoc(doc(db, "submissions", id));
                fetchSubmissions();
            } catch (e) {
                console.error(e);
                alert("Lỗi khi xóa kết quả.");
            }
        }
    };

    // --- THUẬT TOÁN XUẤT FILE EXCEL (CSV) CHUẨN TIẾNG VIỆT ---
    const handleExportCSV = () => {
        if (submissions.length === 0) return alert("Không có dữ liệu để xuất!");

        // 1. Định nghĩa tiêu đề các cột (Header)
        const headers = ["Hang", "ID Dinh Danh", "Ten Hoc Sinh", "Lan Thi", "Diem So", "So Cau Dung", "Tong So Cau"];
        if (exam?.isAntiCheat) {
            headers.push("Giam Sat");
        }
        headers.push("Thoi Gian Nop");

        // 2. Chuyển đổi mảng dữ liệu thành các dòng văn bản CSV
        const rows = submissions.map((sub, index) => {
            const time = timestampDate(sub.submittedAt)?.toLocaleString("vi-VN") || "Khong xac dinh";
            
            const rowData = [
                index + 1,
                `"${String(sub.shortId || 'N/A').replace(/"/g, '""')}"`,
                `"${String(sub.studentName || '').replace(/"/g, '""')}"`,
                getAttemptNumber(sub, submissions),
                sub.score,
                sub.correctCount,
                sub.totalQuestions
            ];

            if (exam?.isAntiCheat) {
                const status = sub.cheatCount > 0 ? `Vi pham thoat tab ${sub.cheatCount} lan` : "Hop le";
                rowData.push(`"${status}"`);
            }

            rowData.push(`"${time}"`);
            return rowData;
        });

        // 3. Gộp Header và Rows lại với nhau bằng dấu phẩy và dấu xuống dòng
        const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

        // 4. BIẾN QUYẾT: Thêm ký tự BOM (\uFEFF) để Excel không bị lỗi font tiếng Việt
        const bom = "\uFEFF";
        const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });

        // 5. Tạo đường link ngầm định để trình duyệt tự động tải file về máy
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Thong_Ke_Diem_${examTitle.replace(/\s+/g, "_")}.csv`);
        document.body.appendChild(link);

        link.click(); // Kích hoạt lệnh tải xuống
        document.body.removeChild(link); // Dọn dẹp thẻ link sau khi dùng xong
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return <div className="text-center mt-10 text-gray-500 font-medium">Đang tải dữ liệu thống kê...</div>;
    }

    return (
        <div className="teacher-layout min-h-screen flex w-full">
            <TeacherSidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-between items-center gap-4">
                    <nav aria-label="Vị trí" className="workspace-crumbs"><Link to="/teacher/exams" className="flex items-center gap-1 text-blue-600"><ChevronLeft size={16} /> Đề thi của tôi</Link></nav>
                    <AccountMenu className="workspace-account" />
                </header>
                <section className="workspace-main teacher-workspace teacher-submissions w-full mx-auto">
          {loadError && <p role="alert">{loadError} <button className="underline" onClick={fetchSubmissions}>Thử lại</button></p>}
            <div className="teacher-page-heading">
                <div>
                    <p className="teacher-eyebrow">Kết quả học sinh</p><h2>Bài nộp</h2>
                    <p className="text-blue-600 font-medium mt-1">Đề thi: {examTitle || "Chưa có dữ liệu"}</p>
                </div>

                {/* Khu vực các nút chức năng phía trên bên phải */}
                <div className="teacher-report-actions flex gap-3">
                    {submissions.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            className="teacher-primary-action"
                        >
                            <Download size={18} /> Xuất bảng điểm (CSV)
                        </button>
                    )}
                    <Link
                        to="/teacher/exams"
                        className="teacher-secondary-action"
                    >
                        Quản lý đề
                    </Link>
                </div>
            </div>

            {submissions.length === 0 && !loadError ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-500 text-lg">Chưa có học sinh nào nộp bài cho đề thi này.</p>
                </div>
            ) : (
                <div className="teacher-submission-list">
                    <table className="teacher-submission-table w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-blue-50 text-blue-800 border-b-2 border-blue-200">
                                <th className="p-4 font-bold">Hạng</th>
                                <th className="p-4 font-bold">Tên học sinh</th>
                                <th className="p-4 font-bold">Lần thi</th>
                                <th className="p-4 font-bold">Điểm số</th>
                                <th className="p-4 font-bold">Câu đúng</th>
                                {exam?.isAntiCheat && <th className="p-4 font-bold">Giám sát</th>}
                                <th className="p-4 font-bold">Thời gian nộp</th>
                                <th className="p-4 font-bold text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {submissions.map((sub, index) => (
                                <tr key={sub.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td data-label="Hạng" className="p-4 font-bold text-gray-500">#{index + 1}</td>
                                    <td data-label="Học sinh" className="p-4 font-semibold text-gray-800">
                                        {sub.studentName} {sub.shortId && <span className="text-gray-400 font-normal ml-1 text-sm">#{sub.shortId}</span>}
                                    </td>
                                    <td data-label="Lần thi" className="p-4 text-gray-600 font-medium">
                                        Lần {getAttemptNumber(sub, submissions)}
                                    </td>
                                    <td data-label="Điểm số" className="p-4">
                                        <span className="px-3 py-1 bg-green-100 text-green-700 font-bold rounded-full">
                                            {sub.score} / 10
                                        </span>
                                    </td>
                                    <td data-label="Câu đúng" className="p-4 text-gray-600 font-medium">
                                        {sub.correctCount} / {sub.totalQuestions}
                                    </td>
                                    {exam?.isAntiCheat && (
                                        <td data-label="Giám sát" className="p-4">
                                            {sub.cheatCount > 0 ? (
                                                <span className="px-2 py-1 bg-red-100 text-red-700 font-semibold rounded text-sm whitespace-nowrap">
                                                    ⚠️ Thoát tab {sub.cheatCount} lần
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-green-100 text-green-700 font-semibold rounded text-sm">
                                                    ✅ Hợp lệ
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    <td data-label="Thời gian nộp" className="p-4 text-sm text-gray-500">
                                        {timestampDate(sub.submittedAt)?.toLocaleString("vi-VN") || "Không xác định"}
                                    </td>
                                    <td data-label="Thao tác" className="p-4 text-right flex items-center justify-end gap-2">
                                        <Link 
                                            to={`/student/review/${sub.id}?from=teacher`}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-block"
                                            title="Xem chi tiết bài làm"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Link>
                                        <button 
                                            onClick={() => handleDeleteSubmission(sub.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Xóa kết quả"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
                </section>
            </div>
        </div>
    );
}
