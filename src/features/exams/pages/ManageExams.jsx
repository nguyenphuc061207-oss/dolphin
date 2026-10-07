import useDocumentTitle from '@/shared/hooks/useDocumentTitle';
import AccountMenu from '@/shared/components/AccountMenu';
import { securityLevel } from '../utils/examSecurity';
import { withTimeout } from '@/shared/utils/runtimeSafety';
import TeacherSidebar from '../components/TeacherSidebar';
import ExamSecurityOptions from '../components/ExamSecurityOptions';
import { useState, useEffect } from "react";
import { db, auth } from "@/shared/config/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { ChevronLeft,
    LayoutDashboard, BookOpen, LogOut,
    Search, BarChart3, Copy, Trash2, Clock, FileText, Shield, KeyRound, X, UserPlus, Plus, Users, Eye, MoreVertical
} from 'lucide-react';

export default function ManageExams() {
    useDocumentTitle('Dolphin | Đề thi của tôi');
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

    // Các state liên quan đến cấu hình Xem lại bài thi
    const [selectedExamForReview, setSelectedExamForReview] = useState(null);
    const [securityExam, setSecurityExam] = useState(null);
    const [securityChoice, setSecurityChoice] = useState('strict');
    const [savingSecurity, setSavingSecurity] = useState(false);
    const [securityError, setSecurityError] = useState('');

    const saveSecurity = async () => {
        if (!securityExam || savingSecurity) return;
        setSavingSecurity(true); setSecurityError('');
        try {
            await withTimeout(updateDoc(doc(db, 'exams', securityExam.id), { securityLevel: securityChoice, isAntiCheat: securityChoice === 'strict' }));
            setExamsList(prev => prev.map(exam => exam.id === securityExam.id ? { ...exam, securityLevel: securityChoice, isAntiCheat: securityChoice === 'strict' } : exam));
            setSecurityExam(null);
        } catch (error) { console.error(error); setSecurityError('Chưa xác nhận được thay đổi đã lưu. Hãy giữ lựa chọn và thử lưu lại.'); }
        finally { setSavingSecurity(false); }
    };
    const [modalReviewMode, setModalReviewMode] = useState('always');
    const [modalReviewTime, setModalReviewTime] = useState('');
    const [isSavingReview, setIsSavingReview] = useState(false);

    // Các state liên quan đến chỉnh sửa thời gian làm bài trực tiếp
    const [selectedExamForDuration, setSelectedExamForDuration] = useState(null);
    const [modalDuration, setModalDuration] = useState(45);
    const [isSavingDuration, setIsSavingDuration] = useState(false);

    // State điều khiển dropdown tùy chọn đề thi
    const [activeDropdownId, setActiveDropdownId] = useState(null);

    useEffect(() => {
        const handleClose = () => setActiveDropdownId(null);
        document.addEventListener("click", handleClose);
        return () => document.removeEventListener("click", handleClose);
    }, []);

    const toggleDropdown = (examId) => {
        setActiveDropdownId(activeDropdownId === examId ? null : examId);
    };

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

    // Điều khiển modal chỉnh sửa chế độ xem lại bài thi
    const handleOpenReviewModal = (exam) => {
        setSelectedExamForReview(exam);
        const mode = exam.reviewSettings?.mode || 'always';
        const time = exam.reviewSettings?.time || '';
        setModalReviewMode(mode);
        setModalReviewTime(time);
    };

    const handleSaveReviewSettings = async () => {
        if (!selectedExamForReview) return;
        setIsSavingReview(true);
        try {
            const examRef = doc(db, "exams", selectedExamForReview.id);
            await updateDoc(examRef, {
                reviewSettings: { 
                    mode: modalReviewMode, 
                    time: modalReviewMode === 'after_time' ? modalReviewTime : null 
                }
            });
            alert("Cập nhật cấu hình xem lại bài thi thành công!");
            setSelectedExamForReview(null);
            fetchExams();
        } catch (e) {
            console.error(e);
            alert("Lỗi khi cập nhật cấu hình.");
        }
        setIsSavingReview(false);
    };

    // Điều khiển modal chỉnh sửa thời gian làm bài trực tiếp
    const handleOpenDurationModal = (exam) => {
        setSelectedExamForDuration(exam);
        setModalDuration(exam.duration || 45);
    };

    const handleSaveDurationSettings = async () => {
        if (!selectedExamForDuration) return;
        const durationNum = parseInt(modalDuration);
        if (isNaN(durationNum) || durationNum <= 0) {
            return alert("Thời gian làm bài phải là một số nguyên dương.");
        }
        setIsSavingDuration(true);
        try {
            const examRef = doc(db, "exams", selectedExamForDuration.id);
            await updateDoc(examRef, {
                duration: durationNum
            });
            alert("Cập nhật thời gian làm bài thành công!");
            setSelectedExamForDuration(null);
            fetchExams();
        } catch (e) {
            console.error(e);
            alert("Lỗi khi cập nhật thời gian làm bài.");
        }
        setIsSavingDuration(false);
    };

    // Thuật toán tìm kiếm Real-time
    const filteredExams = examsList.filter(exam =>
        exam.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="teacher-layout min-h-screen flex w-full">
            {/* Sidebar - Dolphin Style */}
            <TeacherSidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-between items-center">
                    <nav aria-label="Vị trí" className="workspace-crumbs">
                        <Link to="/" className="back-home"><ChevronLeft size={18} aria-hidden="true" />Trang chủ</Link>
                        <span aria-hidden="true">/</span>
                        <span aria-current="page">Đề thi của tôi</span>
                    </nav>

                    <AccountMenu className="workspace-account ml-auto" />
                </header>

                <section className="workspace-main teacher-workspace teacher-manage p-8 w-full max-w-7xl mx-auto">
                    <div className="max-w-7xl mx-auto">
                        <div className="teacher-page-heading">
                            <div>
                                <p className="teacher-eyebrow">Không gian giáo viên</p><h2>Đề thi của tôi</h2>
                                <p className="text-gray-500 font-medium mt-1">Chia sẻ đề, xem bài nộp và điều chỉnh cài đặt tại một nơi.</p>
                            </div>
                            <Link to="/teacher" className="teacher-primary-action">
                                <Plus size={18} /> Tạo đề mới
                            </Link>
                        </div>

                        {/* Thanh Tìm kiếm & Lọc */}
                        <div className="teacher-list-toolbar">
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    aria-label="Tìm đề thi theo tên" placeholder="Tìm tên đề thi…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                />
                            </div>
                        </div>

                        {/* Bảng Dữ liệu (Data Table) */}
                        <div className="teacher-exam-list">
                            <div className="teacher-exam-list-inner">
                                <table className="teacher-exam-table w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tên đề thi</th>
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mã đề thi</th>
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                                            <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Cài đặt đề thi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {isLoading ? (
                                            <tr><td colSpan="4" className="p-8 text-center text-gray-500 font-medium">Đang tải dữ liệu...</td></tr>
                                        ) : filteredExams.length === 0 ? (
                                             <tr><td colSpan="4" className="teacher-list-empty"><FileText size={30} /><strong>{searchTerm ? 'Không tìm thấy đề phù hợp' : 'Bắt đầu với đề thi đầu tiên'}</strong><p>{searchTerm ? 'Thử tên khác hoặc xóa tìm kiếm để xem tất cả đề.' : 'Tạo đề để giao bài và theo dõi kết quả của học sinh.'}</p>{searchTerm ? <button onClick={() => setSearchTerm('')} className="teacher-secondary-action">Xóa tìm kiếm</button> : <Link to="/teacher" className="teacher-primary-action"><Plus size={18} /> Tạo đề mới</Link>}</td></tr>
                                        ) : (
                                            filteredExams.map((exam) => (
                                                <tr key={exam.id} className="teacher-exam-row transition-colors group">
                                                    <td className="p-4">
                                                        <div className="teacher-exam-title flex items-center gap-2 mb-1">
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

                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-xs font-mono font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg select-all cursor-text">{exam.id}</code>
                                                            <button 
                                                                onClick={() => { navigator.clipboard.writeText(exam.id); }}
                                                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded" 
                                                                title="Sao chép mã đề thi"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="p-4 text-sm font-medium text-gray-600">
                                                        {exam.createdAt ? new Date(exam.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Đang cập nhật'}
                                                    </td>
                                                    
                                                    <td className="teacher-exam-actions p-4 text-right relative">
                                                        <Link to={`/teacher/exam/${exam.id}/submissions`} className="teacher-results-link"><BarChart3 size={16} /> Bài nộp</Link>
                                                        <div className="inline-block text-left">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleDropdown(exam.id);
                                                                }}
                                                                className="p-2 hover:bg-gray-150 rounded-xl transition-all cursor-pointer text-gray-500 hover:text-gray-900 border border-gray-200 bg-white shadow-xs"
                                                                title="Cài đặt đề thi" aria-label={`Cài đặt ${exam.title}`} aria-expanded={activeDropdownId === exam.id}
                                                            >
                                                                <MoreVertical className="w-5 h-5" />
                                                            </button>

                                                            {activeDropdownId === exam.id && (
                                                                <div className="absolute right-4 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-150 py-2 overflow-hidden z-50 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(`${window.location.origin}/student/exam/${exam.id}`);
                                                                            alert("Sao chép link bài thi thành công!");
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <Copy className="w-4 h-4 text-gray-400" /> Sao chép liên kết
                                                                    </button>
                                                                    
                                                                    <Link
                                                                        to={`/teacher/exam/${exam.id}/submissions`}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <BarChart3 className="w-4 h-4 text-gray-400" /> Thống kê điểm
                                                                    </Link>

                                                                    <button
                                                                        onClick={() => handleOpenAccessModal(exam)}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <Shield className="w-4 h-4 text-gray-400" /> Quyền truy cập
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleOpenReviewModal(exam)}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <Eye className="w-4 h-4 text-gray-400" /> Chế độ xem lại bài thi
                                                                    </button>

                                                                    <button onClick={() => { setSecurityExam(exam); setSecurityChoice(securityLevel(exam)); setSecurityError(''); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 text-left">
                                                                        <Shield className="w-4 h-4" /> Toàn màn hình & bảo mật
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleOpenDurationModal(exam)}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <Clock className="w-4 h-4 text-gray-400" /> Điều chỉnh thời gian
                                                                    </button>

                                                                    <div className="border-t border-gray-100 my-1"></div>

                                                                    <button
                                                                        onClick={() => handleDeleteExam(exam.id)}
                                                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                                                                    >
                                                                        <Trash2 className="w-4 h-4 text-red-400" /> Xóa đề thi
                                                                    </button>
                                                                </div>
                                                            )}
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
                </section>
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

            {/* Modal chỉnh sửa Cấu hình Xem lại bài thi */}
            {selectedExamForReview && (
                <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 text-left">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-150 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <Eye className="w-5 h-5 text-emerald-600 animate-pulse" />
                                <h3 className="font-extrabold text-gray-900 text-lg">Thiết lập Chế độ xem lại bài thi</h3>
                            </div>
                            <button onClick={() => setSelectedExamForReview(null)} className="p-1.5 hover:bg-gray-150 rounded-lg text-gray-400 hover:text-gray-700 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Đề thi</p>
                                <p className="text-base font-bold text-gray-900">{selectedExamForReview.title}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Chế độ xem lại</label>
                                <select
                                    value={modalReviewMode}
                                    onChange={(e) => setModalReviewMode(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition text-sm font-semibold cursor-pointer"
                                >
                                    <option value="always">Luôn cho phép (Ngay sau khi nộp)</option>
                                    <option value="never">Không bao giờ cho phép</option>
                                    <option value="after_time">Mở sau một thời gian cụ thể</option>
                                </select>
                            </div>

                            {modalReviewMode === 'after_time' && (
                                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                                    <label className="block text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">Thời điểm mở khóa</label>
                                    <input
                                        type="datetime-local"
                                        value={modalReviewTime}
                                        onChange={(e) => setModalReviewTime(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition text-sm font-medium"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                            <button
                                onClick={() => setSelectedExamForReview(null)}
                                className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleSaveReviewSettings}
                                disabled={isSavingReview}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition disabled:opacity-50"
                            >
                                {isSavingReview ? "Đang lưu..." : "Lưu thay đổi"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal chỉnh sửa Thời gian đề thi */}
            {selectedExamForDuration && (
                <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 text-left">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-150 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
                                <h3 className="font-extrabold text-gray-900 text-lg">Điều chỉnh thời gian đề thi</h3>
                            </div>
                            <button onClick={() => setSelectedExamForDuration(null)} className="p-1.5 hover:bg-gray-150 rounded-lg text-gray-400 hover:text-gray-700 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Đề thi</p>
                                <p className="text-base font-bold text-gray-900">{selectedExamForDuration.title}</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Thời gian làm bài (phút)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        value={modalDuration}
                                        onChange={(e) => setModalDuration(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm font-semibold pr-16"
                                        placeholder="Nhập số phút làm bài..."
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">phút</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                            <button
                                onClick={() => setSelectedExamForDuration(null)}
                                className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleSaveDurationSettings}
                                disabled={isSavingDuration}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition disabled:opacity-50"
                            >
                                {isSavingDuration ? "Đang lưu..." : "Lưu thay đổi"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {securityExam && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="security-settings-title">
                <div className="security-settings-dialog bg-white rounded-2xl p-6 max-w-lg w-full space-y-4">
                    <h2 id="security-settings-title" className="text-xl font-bold">Toàn màn hình & bảo mật</h2>
                    <p>{securityExam.title}</p>
                    <ExamSecurityOptions value={securityChoice} onChange={setSecurityChoice} disabled={savingSecurity} existingExam />
                    {securityError && <p role="alert" className="text-red-600">{securityError}</p>}
                    <div className="flex justify-end gap-3"><button disabled={savingSecurity} onClick={() => setSecurityExam(null)} className="border rounded-xl px-4 py-2">Hủy</button><button disabled={savingSecurity} onClick={saveSecurity} className="bg-blue-600 text-white rounded-xl px-4 py-2">{savingSecurity ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
                </div>
            </div>}
        </div>
    );
}
