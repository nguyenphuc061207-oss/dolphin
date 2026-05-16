import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import {
    LayoutDashboard, BookOpen, LogOut,
    Search, BarChart3, Copy, Trash2, Clock, FileText, Shield, KeyRound
} from 'lucide-react';

export default function ManageExams() {
    const { currentUser } = useAuth();
    const [examsList, setExamsList] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const fetchExams = async () => {
        if (!currentUser) return;
        try {
            const q = query(collection(db, "exams"), where("teacherId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            const exams = [];
            querySnapshot.forEach((doc) => exams.push({ id: doc.id, ...doc.data() }));
            // Sắp xếp mới nhất lên đầu
            exams.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setExamsList(exams);
        } catch (error) {
            console.error("Lỗi fetch:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchExams(); }, [currentUser]);

    const handleDeleteExam = async (id) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này?")) {
            await deleteDoc(doc(db, "exams", id));
            fetchExams();
        }
    };

    // Thuật toán tìm kiếm Real-time
    const filteredExams = examsList.filter(exam =>
        exam.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#f8fafc] flex w-full">
            {/* Sidebar - Dolphin Style */}
            <aside className="w-64 border-r border-gray-200 bg-white p-6 hidden lg:flex flex-col sticky top-0 h-screen">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <span className="font-bold text-xl">D</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Dolphin</h1>
                </div>
                <nav className="space-y-1 flex-1">
                    <Link to="/teacher" className="w-full px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-3 font-semibold transition-all">
                        <LayoutDashboard className="w-5 h-5" /> Dashboard
                    </Link>
                    <Link to="/teacher/exams" className="w-full px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center gap-3 transition-all">
                        <BookOpen className="w-5 h-5" /> Quản lý Đề thi
                    </Link>
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-end">
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">{currentUser?.displayName}</p>
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Giáo viên</p>
                        </div>
                    </div>
                </header>

                <main className="p-8 w-full">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h2 className="text-3xl font-black text-gray-900">Quản lý Đề thi</h2>
                                <p className="text-gray-500 font-medium mt-1">Danh sách toàn bộ đề thi bạn đã tạo trên hệ thống</p>
                            </div>
                            <Link to="/teacher" className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors">
                                + Tạo đề thi mới
                            </Link>
                        </div>

                        {/* Thanh Tìm kiếm & Lọc */}
                        <div className="bg-white p-4 rounded-t-2xl border border-gray-200 border-b-0 flex items-center gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm theo tên bài kiểm tra..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                />
                            </div>
                        </div>

                        {/* Bảng Dữ liệu (Data Table) */}
                        <div className="bg-white rounded-b-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tên đề thi</th>

                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {isLoading ? (
                                            <tr><td colSpan="3" className="p-8 text-center text-gray-500 font-medium">Đang tải dữ liệu...</td></tr>
                                        ) : filteredExams.length === 0 ? (
                                             <tr><td colSpan="3" className="p-8 text-center text-gray-500 font-medium">Không tìm thấy đề thi nào.</td></tr>
                                        ) : (
                                            filteredExams.map((exam) => (
                                                <tr key={exam.id} className="hover:bg-blue-50/50 transition-colors group">
                                                    <td className="p-4">
                                                        <p className="font-bold text-gray-900 text-lg mb-1">{exam.title}</p>
                                                        <div className="flex gap-4 text-xs text-gray-500 font-medium">
                                                            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {exam.questions?.length || 0} câu</span>
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.duration} phút</span>
                                                        </div>
                                                    </td>

                                                    <td className="p-4 text-sm font-medium text-gray-600">
                                                        {exam.createdAt ? new Date(exam.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Đang cập nhật'}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex justify-end gap-2 transition-opacity">
                                                            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/student/exam/${exam.id}`); alert("Copy link thành công!"); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Copy Link">
                                                                <Copy className="w-5 h-5" />
                                                            </button>
                                                            <Link to={`/teacher/exam/${exam.id}/submissions`} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Xem Thống kê">
                                                                <BarChart3 className="w-5 h-5" />
                                                            </Link>
                                                            <button onClick={() => handleDeleteExam(exam.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa đề thi">
                                                                <Trash2 className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}