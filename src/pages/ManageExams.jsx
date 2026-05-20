import { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
    LayoutDashboard, BookOpen, LogOut,
    Search, BarChart3, Copy, Trash2, Clock, FileText, Shield, KeyRound, X, UserPlus, Plus, Users
} from 'lucide-react';

export default function ManageExams() {
    const { currentUser } = useAuth();
    const [examsList, setExamsList] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    // Các state liên quan đến chỉnh sửa quyền truy cập trực tiếp
    const [selectedExamForAccess, setSelectedExamForAccess] = useState(null);
    const [modalAccessType, setModalAccessType] = useState('public');
    const [modalAllowedUsers, setModalAllowedUsers] = useState([]);
    const [modalSelectedFriendId, setModalSelectedFriendId] = useState('');
    const [modalManualName, setModalManualName] = useState('');
    const [modalManualId, setModalManualId] = useState('');
    const [isSavingAccess, setIsSavingAccess] = useState(false);
    const [friendsList, setFriendsList] = useState([]);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Lỗi đăng xuất:", error);
        }
    };

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

    // Fetch danh sách bạn bè để chọn nhanh khi chỉnh sửa quyền truy cập
    useEffect(() => {
        if (!currentUser) return;
        const fetchFriends = async () => {
            try {
                const q = query(collection(db, "friendships"), where("userId", "==", currentUser.uid));
                const snap = await getDocs(q);
                const list = [];
                snap.forEach((docSnap) => {
                    list.push({ id: docSnap.id, ...docSnap.data() });
                });
                setFriendsList(list);
            } catch (err) {
                console.error("Lỗi fetch bạn bè:", err);
            }
        };
        fetchFriends();
    }, [currentUser]);

    const handleDeleteExam = async (id) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này?")) {
            await deleteDoc(doc(db, "exams", id));
            fetchExams();
        }
    };

    // Điều khiển modal chỉnh sửa quyền truy cập
    const handleOpenAccessModal = (exam) => {
        setSelectedExamForAccess(exam);
        setModalAccessType(exam.accessType || 'public');
        setModalAllowedUsers(exam.allowedUsers || []);
        setModalSelectedFriendId('');
        setModalManualName('');
        setModalManualId('');
    };

    const handleAddFriendToModalAllowed = () => {
        if (!modalSelectedFriendId) return alert("Vui lòng chọn một người bạn.");
        const friend = friendsList.find(f => f.id === modalSelectedFriendId);
        if (!friend) return;
        
        const exists = modalAllowedUsers.some(u => u.shortId === friend.friendShortId && u.name.toLowerCase() === friend.friendName.toLowerCase());
        if (exists) return alert("Học sinh này đã có trong danh sách được cho phép.");
        
        setModalAllowedUsers([...modalAllowedUsers, { name: friend.friendName, shortId: friend.friendShortId }]);
        setModalSelectedFriendId('');
    };

    const handleAddManualToModalAllowed = () => {
        if (!modalManualName.trim() || !modalManualId.trim()) {
            return alert("Vui lòng nhập đầy đủ họ tên và ID định danh.");
        }
        if (modalManualId.trim().length !== 4 || isNaN(modalManualId.trim())) {
            return alert("ID định danh phải là mã 4 chữ số.");
        }
        
        const exists = modalAllowedUsers.some(u => u.shortId === modalManualId.trim() && u.name.toLowerCase() === modalManualName.trim().toLowerCase());
        if (exists) return alert("Học sinh này đã có trong danh sách được cho phép.");
        
        setModalAllowedUsers([...modalAllowedUsers, { name: modalManualName.trim(), shortId: modalManualId.trim() }]);
        setModalManualName('');
        setModalManualId('');
    };

    const handleRemoveFromModalAllowed = (idx) => {
        setModalAllowedUsers(modalAllowedUsers.filter((_, i) => i !== idx));
    };

    const handleSaveAccessSettings = async () => {
        if (!selectedExamForAccess) return;
        setIsSavingAccess(true);
        try {
            const examRef = doc(db, "exams", selectedExamForAccess.id);
            await updateDoc(examRef, {
                accessType: modalAccessType,
                allowedUsers: modalAccessType === 'restricted' ? modalAllowedUsers : []
            });
            alert("Cập nhật quyền truy cập đề thi thành công!");
            setSelectedExamForAccess(null);
            fetchExams();
        } catch (e) {
            console.error(e);
            alert("Lỗi khi cập nhật quyền truy cập.");
        }
        setIsSavingAccess(false);
    };

    // Thuật toán tìm kiếm Real-time
    const filteredExams = examsList.filter(exam =>
        exam.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#f8fafc] flex w-full">
            {/* Sidebar - Dolphin Style */}
            <aside className="w-64 border-r border-gray-200 bg-white p-6 hidden lg:flex flex-col sticky top-0 h-screen text-left">
                <div className="flex items-center gap-3 mb-8">
                    <img src="/dolphin-logo.png" alt="Dolphin Logo" className="w-10 h-10 object-contain" />
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
                <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-between items-center">
                    {/* Responsive spacing left */}
                    <div className="flex items-center gap-2">
                        <img src="/dolphin-logo.png" alt="Dolphin" className="w-8 h-8 lg:hidden object-contain" />
                        <span className="font-bold text-gray-800 lg:hidden">Dolphin</span>
                    </div>

                    <div className="relative pl-4 border-l border-gray-150 flex items-center ml-auto">
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className="flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-gray-100 transition-all border border-gray-100 shadow-xs cursor-pointer bg-white"
                        >
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold uppercase text-sm shrink-0">
                                {currentUser?.displayName ? currentUser.displayName.charAt(0).toUpperCase() : "G"}
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-xs font-bold text-gray-900">
                                    {currentUser?.displayName} <span className="text-gray-400 font-medium">#{currentUser?.shortId}</span>
                                </p>
                            </div>
                        </button>

                        {isProfileOpen && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 overflow-hidden z-50 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                                <div className="px-4 py-2 border-b border-gray-100 mb-1">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Tài khoản</p>
                                </div>
                                <Link
                                    to="/"
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition font-semibold animate-in fade-in duration-100"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <BookOpen className="w-4 h-4 text-gray-400" /> Trang chủ
                                </Link>
                                <Link
                                    to='/teacher'
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition font-semibold animate-in fade-in duration-100"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <LayoutDashboard className="w-4 h-4 text-blue-500" /> Khu Giáo viên
                                </Link>
                                <Link
                                    to='/student'
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50 transition font-semibold animate-in fade-in duration-100"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <Users className="w-4 h-4 text-emerald-500" /> Khu học sinh
                                </Link>
                                <Link
                                    to='/friends'
                                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 transition font-semibold animate-in fade-in duration-100"
                                    onClick={() => setIsProfileOpen(false)}
                                >
                                    <UserPlus className="w-4 h-4 text-indigo-500" /> Bạn bè
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition border-t border-gray-100 font-semibold cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4" /> Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <main className="p-8 w-full text-left">
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
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold text-gray-900 text-lg">{exam.title}</p>
                                                            {exam.accessType === 'restricted' ? (
                                                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                    <Shield className="w-3 h-3" /> Hạn chế
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                    Bất kì ai
                                                                </span>
                                                            )}
                                                        </div>
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
                                                            <button 
                                                                onClick={() => handleOpenAccessModal(exam)} 
                                                                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" 
                                                                title="Quyền truy cập"
                                                            >
                                                                <Shield className="w-5 h-5" />
                                                            </button>
                                                            <button 
                                                                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/student/exam/${exam.id}`); alert("Copy link thành công!"); }} 
                                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                                                title="Copy Link"
                                                            >
                                                                <Copy className="w-5 h-5" />
                                                            </button>
                                                            <Link 
                                                                to={`/teacher/exam/${exam.id}/submissions`} 
                                                                className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" 
                                                                title="Xem Thống kê"
                                                            >
                                                                <BarChart3 className="w-5 h-5" />
                                                            </Link>
                                                            <button 
                                                                onClick={() => handleDeleteExam(exam.id)} 
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                                                title="Xóa đề thi"
                                                            >
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

            {/* Modal chỉnh sửa Quyền truy cập */}
            {selectedExamForAccess && (
                <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 text-left">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-150 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-blue-600 animate-pulse" />
                                <h3 className="font-extrabold text-gray-900 text-lg">Quyền truy cập đề thi</h3>
                            </div>
                            <button onClick={() => setSelectedExamForAccess(null)} className="p-1.5 hover:bg-gray-150 rounded-lg text-gray-400 hover:text-gray-700 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tên đề thi chỉnh sửa</p>
                                <p className="text-base font-bold text-gray-900">{selectedExamForAccess.title}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quyền truy cập</label>
                                <select
                                    value={modalAccessType}
                                    onChange={(e) => setModalAccessType(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm font-semibold cursor-pointer"
                                >
                                    <option value="public">Bất kỳ ai có đường liên kết</option>
                                    <option value="restricted">Hạn chế (Chỉ những học sinh được chỉ định)</option>
                                </select>
                            </div>

                            {modalAccessType === 'restricted' && (
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-4">
                                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest leading-none">Cấu hình danh sách học sinh</p>
                                    
                                    {/* Thêm từ bạn bè */}
                                    <div className="space-y-2">
                                        <label className="block text-[11px] font-bold text-gray-500">Thêm từ bạn bè có sẵn:</label>
                                        <div className="flex gap-2">
                                            <select
                                                value={modalSelectedFriendId}
                                                onChange={(e) => setModalSelectedFriendId(e.target.value)}
                                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
                                            >
                                                <option value="">-- Chọn bạn bè --</option>
                                                {friendsList.map(friend => (
                                                    <option key={friend.id} value={friend.id}>
                                                        {friend.friendName} #{friend.friendShortId}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleAddFriendToModalAllowed}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
                                            >
                                                Thêm
                                            </button>
                                        </div>
                                    </div>

                                    {/* Nhập thủ công */}
                                    <div className="space-y-2 pt-3 border-t border-gray-200/60">
                                        <label className="block text-[11px] font-bold text-gray-500">Nhập thủ công học sinh khác:</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                placeholder="Tên học sinh"
                                                value={modalManualName}
                                                onChange={(e) => setModalManualName(e.target.value)}
                                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                            />
                                            <input
                                                type="text"
                                                placeholder="ID (4 chữ số)"
                                                maxLength={4}
                                                value={modalManualId}
                                                onChange={(e) => setModalManualId(e.target.value)}
                                                className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddManualToModalAllowed}
                                            className="w-full py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Thêm học sinh thủ công
                                        </button>
                                    </div>

                                    {/* Danh sách đã thêm */}
                                    <div className="pt-3 border-t border-gray-200/60 text-left">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Đã thêm ({modalAllowedUsers.length}):</p>
                                        {modalAllowedUsers.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic">Chưa có học sinh nào được chỉ định. Đề thi sẽ không thể làm bởi bất kì ai.</p>
                                        ) : (
                                            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                                {modalAllowedUsers.map((user, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200/60 text-xs">
                                                        <span className="font-bold text-gray-700">{user.name} <span className="text-gray-400 font-medium">#{user.shortId}</span></span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFromModalAllowed(idx)}
                                                            className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                            title="Xóa khỏi danh sách"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                            <button
                                onClick={() => setSelectedExamForAccess(null)}
                                className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleSaveAccessSettings}
                                disabled={isSavingAccess}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition disabled:opacity-50"
                            >
                                {isSavingAccess ? "Đang lưu..." : "Lưu thay đổi"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}