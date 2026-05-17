import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs, deleteDoc, doc, getDoc } from "firebase/firestore";
import { Trash2 } from "lucide-react";

const getAttemptNumber = (sub, allSubs) => {
    if (sub.attemptNumber !== undefined) return sub.attemptNumber;
    
    const getMillis = (ts) => {
        if (!ts) return 0;
        if (typeof ts.toMillis === "function") return ts.toMillis();
        if (typeof ts.toDate === "function") return ts.toDate().getTime();
        return new Date(ts).getTime();
    };

    const studentSubs = allSubs
        .filter(s => (s.studentId && s.studentId === sub.studentId) || s.studentName === sub.studentName)
        .sort((a, b) => getMillis(a.submittedAt) - getMillis(b.submittedAt));
        
    const index = studentSubs.findIndex(s => s.id === sub.id);
    return index !== -1 ? index + 1 : 1;
};

export default function ExamSubmissions() {
    const { examId } = useParams();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [examTitle, setExamTitle] = useState("");
    const [exam, setExam] = useState(null);

    useEffect(() => {
        fetchSubmissions();
    }, [examId]);

    const fetchSubmissions = async () => {
        try {
            // Fetch cấu hình đề thi để kiểm tra tính năng giám sát
            const examSnap = await getDoc(doc(db, "exams", examId));
            if (examSnap.exists()) {
                const examData = examSnap.data();
                setExam(examData);
                setExamTitle(examData.title);
            }

            const q = query(
                collection(db, "submissions"),
                where("examId", "==", examId)
            );

            const querySnapshot = await getDocs(q);
            const subs = [];
            querySnapshot.forEach((doc) => {
                subs.push({ id: doc.id, ...doc.data() });
            });

            if (subs.length > 0 && !examTitle) {
                setExamTitle(subs[0].examTitle);
            }

            // Sắp xếp điểm từ cao xuống thấp
            subs.sort((a, b) => b.score - a.score);
            setSubmissions(subs);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu thống kê:", error);
        } finally {
            setLoading(false);
        }
    };

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
        const headers = ["Hang", "Ten Hoc Sinh", "Lan Thi", "Diem So", "So Cau Dung", "Tong So Cau"];
        if (exam?.isAntiCheat) {
            headers.push("Giam Sat");
        }
        headers.push("Thoi Gian Nop");

        // 2. Chuyển đổi mảng dữ liệu thành các dòng văn bản CSV
        const rows = submissions.map((sub, index) => {
            const time = sub.submittedAt ? new Date(sub.submittedAt.toDate()).toLocaleString("vi-VN") : "Khong xac dinh";
            
            const rowData = [
                index + 1,
                `"${sub.studentName}"`, // Bọc trong dấu ngoặc kép để tránh lỗi nếu tên có dấu phẩy
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
    };

    if (loading) {
        return <div className="text-center mt-10 text-gray-500 font-medium">Đang tải dữ liệu thống kê...</div>;
    }

    return (
        <div className="w-full max-w-5xl bg-white p-8 rounded-xl shadow-sm border border-gray-100 mb-20">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Thống kê kết quả</h2>
                    <p className="text-blue-600 font-medium mt-1">Đề thi: {examTitle || "Chưa có dữ liệu"}</p>
                </div>

                {/* Khu vực các nút chức năng phía trên bên phải */}
                <div className="flex gap-3">
                    {submissions.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition flex items-center gap-2 shadow-sm"
                        >
                            📊 Xuất File Excel (CSV)
                        </button>
                    )}
                    <Link
                        to="/teacher"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition"
                    >
                        &larr; Quay lại
                    </Link>
                </div>
            </div>

            {submissions.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-500 text-lg">Chưa có học sinh nào nộp bài cho đề thi này.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
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
                                    <td className="p-4 font-bold text-gray-500">#{index + 1}</td>
                                    <td className="p-4 font-semibold text-gray-800">{sub.studentName}</td>
                                    <td className="p-4 text-gray-600 font-medium">
                                        Lần {getAttemptNumber(sub, submissions)}
                                    </td>
                                    <td className="p-4">
                                        <span className="px-3 py-1 bg-green-100 text-green-700 font-bold rounded-full">
                                            {sub.score} / 10
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600 font-medium">
                                        {sub.correctCount} / {sub.totalQuestions}
                                    </td>
                                    {exam?.isAntiCheat && (
                                        <td className="p-4">
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
                                    <td className="p-4 text-sm text-gray-500">
                                        {sub.submittedAt ? new Date(sub.submittedAt.toDate()).toLocaleString("vi-VN") : "Không xác định"}
                                    </td>
                                    <td className="p-4 text-right">
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
        </div>
    );
}