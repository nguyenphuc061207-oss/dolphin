import QuestionExplanation from '../components/QuestionExplanation';
import { mapConcurrent, storageOperation } from '@/shared/utils/runtimeSafety';
import AccountMenu from '@/shared/components/AccountMenu';
import { validateQuestions } from '../utils/examSafety';
import { validateFlowSettings, MAX_PAGE_SIZE } from '../utils/examFlow';
import TeacherSidebar from '../components/TeacherSidebar';
import ExamSecurityOptions from '../components/ExamSecurityOptions';
import { useState, useEffect, useRef, useMemo } from "react";

import { db } from "@/shared/config/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router-dom";
import { parseQuestionsFromHtml } from "../parsers/questionParser";
import { extractTxtToHtml, plainTextToHtml } from "../parsers/txtExtractor";
import QuestionEditorCard, { MoveButtons, convertQuestionType, getQuestionIssues } from "../components/QuestionEditorCard";
import RichTextEditor from "@/shared/components/RichTextEditor";
import { htmlToPlain, normalizeQuestionExplanation, normalizeExplanation } from "@/shared/utils/richText";
import RichTextRenderer from "@/shared/components/RichTextRenderer";
import useDocumentTitle from "@/shared/hooks/useDocumentTitle";
import {
    BookOpen,
    Settings as SettingsIcon,
    Plus,
    Clock,
    BarChart3,
    Copy,
    Trash2,
    Bell,
    Eye,
    Zap,
    Shield,
    Shuffle,
    Lock,
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    X,
    MoreVertical,
    Undo2,
    ChevronLeft,
    History,
    TriangleAlert
} from 'lucide-react';

// Configure PDF.js worker
// pdf.js (~1 MB) and JSZip are only downloaded when a teacher actually imports a file.
const loadPdfjs = async () => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    return pdfjsLib;
};

// ── Question type metadata ────────────────────────────────────────────
const TYPE_LABELS = {
    single: { label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    multiple: { label: 'Chọn nhiều', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    true_false: { label: 'Đúng/Sai', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    multi_true_false: { label: 'Đúng/Sai Nhiều Ý', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    essay: { label: 'Tự luận', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const TYPE_OPTIONS = [
    { value: 'single', label: 'Trắc nghiệm (1 đáp án)' },
    { value: 'multiple', label: 'Chọn nhiều' },
    { value: 'true_false', label: 'Đúng / Sai' },
    { value: 'multi_true_false', label: 'Đúng / Sai Nhiều Ý' },
    { value: 'essay', label: 'Tự luận' },
];

const isShortOptions = (options) => {
    if (!options || options.length === 0) return false;
    return options.every(opt => {
        if (!opt) return true;
        if (opt.includes('[IMG:') || opt.includes('<img')) return false;
        const cleanText = opt.replace(/<[^>]+>/g, '').replace(/\$/g, '');
        return cleanText.trim().length < 35;
    });
};

// --- TOGGLE SWITCH COMPONENT ---
const ToggleSwitch = ({ enabled, onChange, label, description, icon: Icon }) => (
    <div className="flex items-center justify-between py-3">
        <div className="flex items-start gap-3">
            {Icon && <Icon className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />}
            <div>
                <p className="font-semibold text-gray-800 text-sm">{label}</p>
                {description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>}
            </div>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={() => onChange(!enabled)} className="toggle-control" data-on={enabled}>
            <span className="toggle-track"><span className="toggle-thumb" /></span>
        </button>
    </div>
);

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    useDocumentTitle("Dolphin | Tạo đề thi");

    // --- DỮ LIỆU ĐỀ THI ---
    const [examTitle, setExamTitle] = useState("");
    const [duration, setDuration] = useState(45);
    const [questions, setQuestions] = useState([]);
    const [examsList, setExamsList] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- CÀI ĐẶT NÂNG CAO ---
    const [questionTab, setQuestionTab] = useState('manual');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [examSecurityLevel, setExamSecurityLevel] = useState('strict');
    const [examPassword, setExamPassword] = useState('');
    const [shuffleQuestions, setShuffleQuestions] = useState(true);
    const [shuffleOptions, setShuffleOptions] = useState(false);
    const [attemptLimit, setAttemptLimit] = useState(0);
    const [displayMode, setDisplayMode] = useState('all'); // 'all' | 'single' | 'group'
    const [pageSize, setPageSize] = useState(5);
    const [allowBack, setAllowBack] = useState(true);
    const [reviewMode, setReviewMode] = useState('always'); // 'always', 'never', 'after_time'
    const [reviewTime, setReviewTime] = useState('');

    // --- QUẢN LÝ QUYỀN TRUY CẬP ---
    const [accessType, setAccessType] = useState('public'); // 'public' | 'restricted'
    const [allowedUsers, setAllowedUsers] = useState([]); // array of { name, shortId }
    const [friendsList, setFriendsList] = useState([]);
    const [selectedFriendId, setSelectedFriendId] = useState('');
    const [manualAllowedName, setManualAllowedName] = useState('');
    const [manualAllowedId, setManualAllowedId] = useState('');

    // --- CHỈNH SỬA QUYỀN TRUY CẬP ĐÃ TẠO ---
    const [selectedExamForAccess, setSelectedExamForAccess] = useState(null);
    const [modalAccessType, setModalAccessType] = useState('public');
    const [modalAllowedUsers, setModalAllowedUsers] = useState([]);
    const [modalSelectedFriendId, setModalSelectedFriendId] = useState('');
    const [modalManualName, setModalManualName] = useState('');
    const [modalManualId, setModalManualId] = useState('');
    const [isSavingAccess, setIsSavingAccess] = useState(false);

    // --- CHỈNH SỬA THỜI GIAN ĐỀ THI ĐÃ TẠO ---
    const [selectedExamForDuration, setSelectedExamForDuration] = useState(null);
    const [modalDuration, setModalDuration] = useState(45);
    const [isSavingDuration, setIsSavingDuration] = useState(false);

    // --- QUẢN LÝ THÔNG BÁO ---
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifications, setShowNotifications] = useState(false);

    // --- SOẠN THẢO CÂU HỎI ---
    const [currentQText, setCurrentQText] = useState("");
    const [manualType, setManualType] = useState("single");
    const [options, setOptions] = useState(["", "", "", ""]);
    const [correctAnswer, setCorrectAnswer] = useState(0);
    const [manualExplanation, setManualExplanation] = useState("");
    const [scoringMethod, setScoringMethod] = useState("linear");
    const [importText, setImportText] = useState("");
    const [isFileProcessing, setIsFileProcessing] = useState(false);
    const [fileError, setFileError] = useState('');
    const [fileName, setFileName] = useState('');
    const [previewQuestions, setPreviewQuestions] = useState([]);
    const [editingPreviewIdx, setEditingPreviewIdx] = useState(null);
    const [editingQuestionIdx, setEditingQuestionIdx] = useState(null);
    const [mathDictionary, setMathDictionary] = useState({}); // token → LaTeX map
    const fileInputRef = useRef(null);
    const fileRequestRef = useRef(0);
    const saveInFlightRef = useRef(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Kiểm tra lỗi từng câu – tính lại chỉ khi danh sách đổi (không phải mỗi lần gõ phím)
    const questionIssues = useMemo(() => questions.map(getQuestionIssues), [questions]);
    const previewIssues = useMemo(() => previewQuestions.map(getQuestionIssues), [previewQuestions]);
    const issueCount = useMemo(() => questionIssues.filter((x) => x.length > 0).length, [questionIssues]);

    // --- BẢN NHÁP TỰ LƯU (localStorage, theo từng giáo viên) ---
    const draftKey = currentUser?.uid ? `dolphin-exam-draft-${currentUser.uid}` : null;
    const [draftOffer, setDraftOffer] = useState(() => {
        try {
            const raw = draftKey && localStorage.getItem(draftKey);
            const d = raw ? JSON.parse(raw) : null;
            return d && (d.questions?.length || d.examTitle) ? d : null;
        } catch { return null; }
    });
    const [draftSavedAt, setDraftSavedAt] = useState(null);

    useEffect(() => {
        if (!draftKey || draftOffer) return; // chưa ghi đè khi người dùng chưa chọn khôi phục / bỏ qua
        if (questions.length === 0 && !examTitle.trim()) return;
        const t = setTimeout(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify({ examTitle, duration, questions, securityLevel: examSecurityLevel, savedAt: Date.now() }));
                setDraftSavedAt(Date.now());
            } catch { setDraftSavedAt(null); } // quá dung lượng (ảnh base64) → bỏ qua
        }, 800);
        return () => clearTimeout(t);
    }, [draftKey, draftOffer, examTitle, duration, questions, examSecurityLevel]);

    const restoreDraft = () => {
        if (!draftOffer) return;
        setExamTitle(draftOffer.examTitle || '');
        setDuration(draftOffer.duration || 45);
        setQuestions(Array.isArray(draftOffer.questions) ? draftOffer.questions : []);
        setExamSecurityLevel(['off', 'normal', 'strict'].includes(draftOffer.securityLevel) ? draftOffer.securityLevel : 'strict');
        setDraftOffer(null);
    };
    const discardDraft = () => {
        try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* ignore */ }
        setDraftOffer(null);
    };

    // Cảnh báo khi rời trang mà đề chưa xuất bản
    useEffect(() => {
        if (questions.length === 0) return;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [questions.length]);

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

    const handleDeleteExam = async (id) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa đề thi này?")) {
            try {
                await deleteDoc(doc(db, "exams", id));
                fetchExams();
            } catch (error) {
                console.error("Lỗi khi xóa đề thi:", error);
                alert("Không thể xóa đề thi lúc này.");
            }
        }
    };

    const fetchExams = async () => {
        if (!currentUser) return;
        try {
            const q = query(collection(db, "exams"), where("teacherId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            const exams = [];
            querySnapshot.forEach((doc) => exams.push({ id: doc.id, ...doc.data() }));
            exams.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setExamsList(exams.slice(0, 4)); // Chỉ hiện 4 đề gần nhất ở Dashboard
        } catch (error) { console.error("Lỗi fetch:", error); }
    };

    useEffect(() => { fetchExams(); }, [currentUser]);

    // Fetch danh sách bạn bè để quản lý quyền truy cập
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

    // Fetch thông báo nộp bài cho giáo viên
    const fetchNotifications = async () => {
        if (!currentUser) return;
        try {
            const examsQ = query(collection(db, "exams"), where("teacherId", "==", currentUser.uid));
            const examsSnap = await getDocs(examsQ);
            const myExamIds = [];
            examsSnap.forEach((doc) => {
                myExamIds.push(doc.id);
            });

            if (myExamIds.length === 0) {
                setNotifications([]);
                setUnreadCount(0);
                return;
            }

            const limitExamIds = myExamIds.slice(0, 30);
            const subQ = query(
                collection(db, "submissions"),
                where("examId", "in", limitExamIds)
            );
            const subSnap = await getDocs(subQ);
            const list = [];
            subSnap.forEach((docSnap) => {
                const data = docSnap.data();
                list.push({
                    id: docSnap.id,
                    ...data,
                });
            });

            list.sort((a, b) => {
                const aTime = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt).getTime();
                const bTime = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt).getTime();
                return bTime - aTime;
            });

            setNotifications(list.slice(0, 10));
            
            const lastSeenTime = storageOperation('getItem', `notifications_last_seen_${currentUser.uid}`).value || 0;
            const unread = list.filter(item => {
                const itemTime = item.submittedAt?.toMillis ? item.submittedAt.toMillis() : new Date(item.submittedAt).getTime();
                return itemTime > Number(lastSeenTime);
            }).length;
            
            setUnreadCount(unread);
        } catch (err) {
            console.error("Lỗi fetch thông báo:", err);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [currentUser]);

    const handleToggleNotifications = () => {
        setShowNotifications(!showNotifications);
        if (!showNotifications) {
            setUnreadCount(0);
            storageOperation('setItem', `notifications_last_seen_${currentUser.uid}`, Date.now().toString());
        }
    };

    const handleAddFriendToAllowed = () => {
        if (!selectedFriendId) return alert("Vui lòng chọn một người bạn.");
        const friend = friendsList.find(f => f.id === selectedFriendId);
        if (!friend) return;
        
        const exists = allowedUsers.some(u => u.shortId === friend.friendShortId && u.name.toLowerCase() === friend.friendName.toLowerCase());
        if (exists) return alert("Học sinh này đã có trong danh sách được cho phép.");
        
        setAllowedUsers([...allowedUsers, { name: friend.friendName, shortId: friend.friendShortId }]);
        setSelectedFriendId('');
    };

    const handleAddManualToAllowed = () => {
        if (!manualAllowedName.trim() || !manualAllowedId.trim()) {
            return alert("Vui lòng nhập đầy đủ họ tên và ID định danh.");
        }
        if (manualAllowedId.trim().length !== 4 || isNaN(manualAllowedId.trim())) {
            return alert("ID định danh phải là mã 4 chữ số.");
        }
        
        const exists = allowedUsers.some(u => u.shortId === manualAllowedId.trim() && u.name.toLowerCase() === manualAllowedName.trim().toLowerCase());
        if (exists) return alert("Học sinh này đã có trong danh sách được cho phép.");
        
        setAllowedUsers([...allowedUsers, { name: manualAllowedName.trim(), shortId: manualAllowedId.trim() }]);
        setManualAllowedName('');
        setManualAllowedId('');
    };

    const handleRemoveFromAllowed = (idx) => {
        setAllowedUsers(allowedUsers.filter((_, i) => i !== idx));
    };

    // Điều khiển modal chỉnh sửa quyền truy cập trực tiếp
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


    const handleOptionChange = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleAddOption = () => {
        setOptions([...options, ""]);
    };

    const handleRemoveOption = (index) => {
        if (options.length <= 1) {
            return alert("Câu hỏi cần ít nhất 1 đáp án!");
        }
        const newOptions = options.filter((_, idx) => idx !== index);
        setOptions(newOptions);

        // Cập nhật correctAnswer sau khi xóa option
        if (manualType === 'multiple') {
            const arr = Array.isArray(correctAnswer) ? correctAnswer : [];
            const filtered = arr
                .filter(idx => idx !== index)
                .map(idx => (idx > index ? idx - 1 : idx));
            setCorrectAnswer(filtered);
        } else if (manualType === 'multi_true_false') {
            const arr = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
            arr.splice(index, 1);
            setCorrectAnswer(arr);
        } else {
            if (correctAnswer === index) {
                setCorrectAnswer(0);
            } else if (correctAnswer > index) {
                setCorrectAnswer(correctAnswer - 1);
            }
        }
    };

    const handleManualTypeChange = (newType) => {
        setManualType(newType);
        if (newType === 'essay') {
            setOptions([]);
            setCorrectAnswer('');
        } else if (newType === 'true_false') {
            setOptions(["Đúng", "Sai"]);
            setCorrectAnswer(0);
        } else if (newType === 'multi_true_false') {
            setOptions(["", "", "", ""]);
            setCorrectAnswer([true, true, true, true]);
        } else if (newType === 'multiple') {
            setOptions(["", "", "", ""]);
            setCorrectAnswer([]);
        } else { // single
            setOptions(["", "", "", ""]);
            setCorrectAnswer(0);
        }
    };

    const handleToggleMultiTrueFalse = (index, value) => {
        const arr = Array.isArray(correctAnswer) ? [...correctAnswer] : Array(options.length).fill(true);
        arr[index] = value;
        setCorrectAnswer(arr);
    };

    const toggleCorrectAnswerMultiple = (idx) => {
        const arr = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
        const pos = arr.indexOf(idx);
        if (pos >= 0) {
            arr.splice(pos, 1);
        } else {
            arr.push(idx);
        }
        setCorrectAnswer(arr);
    };

    const handleAddQuestion = () => {
        if (!htmlToPlain(currentQText).trim() && !currentQText.includes('[IMG:')) {
            return alert("Vui lòng nhập nội dung câu hỏi!");
        }
        if (manualType !== 'essay' && options.some(opt => !htmlToPlain(opt).trim() && !opt.includes('[IMG:'))) {
            return alert("Vui lòng điền đầy đủ nội dung cho các đáp án!");
        }
        if (manualType === 'multiple' && (!Array.isArray(correctAnswer) || correctAnswer.length === 0)) {
            return alert("Vui lòng chọn ít nhất một đáp án đúng!");
        }

        const explanation = normalizeExplanation(manualExplanation);
        setQuestions([
            ...questions,
            {
                content: currentQText,
                options: manualType === 'essay' ? [] : options,
                correctAnswer: correctAnswer,
                type: manualType,
                ...(manualType === 'multi_true_false' && { scoringMethod }),
                ...(explanation && { explanation })
            }
        ]);

        // Reset form
        setCurrentQText("");
        setManualExplanation("");
        if (manualType === 'essay') {
            setOptions([]);
            setCorrectAnswer('');
        } else if (manualType === 'true_false') {
            setOptions(["Đúng", "Sai"]);
            setCorrectAnswer(0);
        } else if (manualType === 'multi_true_false') {
            setOptions(["", "", "", ""]);
            setCorrectAnswer([true, true, true, true]);
        } else if (manualType === 'multiple') {
            setOptions(["", "", "", ""]);
            setCorrectAnswer([]);
        } else {
            setOptions(["", "", "", ""]);
            setCorrectAnswer(0);
        }
    };

    // ─── ADVANCED TEXT PARSING (uses new parser) ───
    const handleProcessImportText = () => {
        if (!importText.trim()) return;
        // AsciiMath → LaTeX now happens inside the parser, outside code blocks only
        const parsed = parseQuestionsFromHtml(plainTextToHtml(importText));
        if (parsed.length === 0) {
            return alert('Không nhận diện được câu hỏi nào. Vui lòng kiểm tra định dạng.');
        }
        setPreviewQuestions(parsed);
    };

// ─── FILE UPLOAD HANDLER ───
    // .docx → docxExtractor (giữ đậm/nghiêng/gạch chân/chỉ số/code/tab/xuống dòng, toán OMML → LaTeX)
    // .txt  → txtExtractor (tự nhận UTF-8 / UTF-16 / ANSI tiếng Việt, giữ tab & thụt lề)
    // .pdf  → pdfExtractor (văn bản theo dòng + font đậm/nghiêng/mono)
    // Cả hai trả về HTML, đi qua parseQuestionsFromHtml.
    const handleFileUpload = async (file) => {
        if (!file) return;
        const requestId = ++fileRequestRef.current;
        setFileError('');
        setFileName(file.name);
        setIsFileProcessing(true);
        setPreviewQuestions([]);
        setEditingPreviewIdx(null);

        try {
            if (file.size > 20 * 1024 * 1024) throw new Error('File vượt 20 MB. Vui lòng chia nhỏ trước khi nhập.');
            const ext = file.name.split('.').pop().toLowerCase();
            const arrayBuffer = await file.arrayBuffer();
            let html;
            if (ext === 'docx') {
                const { extractDocxToHtml } = await import("../parsers/docxExtractor");
                html = await extractDocxToHtml(arrayBuffer);
            } else if (ext === 'txt') {
                html = extractTxtToHtml(arrayBuffer);
            } else if (ext === 'pdf') {
                const [pdfjsLib, { extractPdfToHtml }] = await Promise.all([loadPdfjs(), import("../parsers/pdfExtractor")]);
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                try {
                    if (pdf.numPages > 200) throw new Error('PDF vượt 200 trang. Vui lòng chia nhỏ trước khi nhập.');
                    html = await extractPdfToHtml(pdf);
                } finally { await pdf.destroy(); }
            } else {
                throw new Error('Định dạng file không được hỗ trợ. Vui lòng sử dụng .docx, .pdf hoặc .txt');
            }

            const parsed = parseQuestionsFromHtml(html);
            if (parsed.length === 0) {
                throw new Error(`Không tìm thấy câu hỏi nào trong file ${ext.toUpperCase()}.`);
            }
            if (requestId === fileRequestRef.current) setPreviewQuestions(parsed);
        } catch (err) {
            console.error('File processing error:', err);
            if (requestId === fileRequestRef.current) setFileError(err.message || 'Lỗi khi xử lý file.');
        } finally {
            if (requestId === fileRequestRef.current) setIsFileProcessing(false);
        }
    };


const handleDropFile = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
};

const handleConfirmPreview = () => {
    if (previewQuestions.length === 0) return;
    setQuestions([...questions, ...previewQuestions]);
    setPreviewQuestions([]);
    setImportText('');
    setFileName('');
    setQuestionTab('manual');
};

/** Change type of a single question in the preview list */
const handlePreviewTypeChange = (idx, newType) => {
    setPreviewQuestions(prev => prev.map((q, i) => (i === idx ? convertQuestionType(q, newType) : q)));
};

const updatePreview = (idx, q) => setPreviewQuestions(prev => prev.map((x, i) => (i === idx ? q : x)));
const deletePreview = (idx) => {
    setPreviewQuestions(prev => prev.filter((_, i) => i !== idx));
    setEditingPreviewIdx(null);
};
const updateQuestion = (idx, q) => setQuestions(prev => prev.map((x, i) => (i === idx ? q : x)));
const deleteQuestion = (idx) => {
    if (!window.confirm('Xóa câu hỏi này khỏi đề?')) return;
    setQuestions(prev => prev.filter((_, i) => i !== idx));
    setEditingQuestionIdx(null);
};
const moveQuestion = (from, to) => {
    setQuestions(prev => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
    });
    setEditingQuestionIdx(null);
};

    // Upload base64 image to ImgBB and return public URL
    const uploadBase64ImageToImgBB = async (base64String) => {
        const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
        if (!apiKey) {
            throw new Error("Chưa cấu hình VITE_IMGBB_API_KEY. Vui lòng thêm khóa VITE_IMGBB_API_KEY vào file .env trong thư mục gốc dự án của bạn để tải ảnh.");
        }

        const matches = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        const rawBase64 = matches ? matches[2] : base64String;

        const formData = new FormData();
        formData.append("image", rawBase64);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "Lỗi khi upload lên ImgBB");
        }

        const data = await response.json();
        if (!data.data?.url || typeof data.data.url !== 'string') throw new Error('Máy chủ ảnh không trả về đường dẫn hợp lệ.');
        return data.data.url;
    };

    // Scan all questions and options for base64 images, upload them in parallel, and replace them with URL
    const uploadAllImagesInQuestions = async (qs) => {
        const updatedQs = JSON.parse(JSON.stringify(qs));
        const imgRegex = /\[IMG:\s*(data:image\/[a-zA-Z0-9+.-]+;base64,[^\]]+)\]/g;
        
        // Bước 1: Thu thập tất cả các chuỗi base64 duy nhất
        const base64Set = new Set();
        
        for (const q of updatedQs) {
            for (const field of ['content', 'explanation']) {
                if (!q[field]) continue;
                let match;
                imgRegex.lastIndex = 0;
                while ((match = imgRegex.exec(q[field])) !== null) {
                    base64Set.add(match[1]);
                }
            }
            if (q.options && Array.isArray(q.options)) {
                for (const opt of q.options) {
                    if (opt) {
                        let match;
                        imgRegex.lastIndex = 0;
                        while ((match = imgRegex.exec(opt)) !== null) {
                            base64Set.add(match[1]);
                        }
                    }
                }
            }
        }
        
        const base64List = Array.from(base64Set);
        if (base64List.length === 0) return updatedQs; // Không có ảnh nào để tải lên
        
        // Bước 2: Tải lên tất cả các ảnh đồng thời (song song)
        const urls = await mapConcurrent(base64List, uploadBase64ImageToImgBB, 3);
        
        // Bước 3: Tạo bản đồ ánh xạ từ base64 -> URL đã upload
        const base64ToUrlMap = new Map();
        for (let idx = 0; idx < base64List.length; idx++) {
            base64ToUrlMap.set(base64List[idx], urls[idx]);
        }
        
        // Bước 4: Thay thế các chuỗi base64 bằng URL thật trong đề thi
        for (const q of updatedQs) {
            for (const field of ['content', 'explanation']) {
                if (!q[field]) continue;
                for (const [b64, url] of base64ToUrlMap.entries()) {
                    q[field] = q[field].split(b64).join(url);
                }
            }
            if (q.options && Array.isArray(q.options)) {
                for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
                    const opt = q.options[optIdx];
                    if (opt) {
                        for (const [b64, url] of base64ToUrlMap.entries()) {
                            q.options[optIdx] = q.options[optIdx].split(b64).join(url);
                        }
                    }
                }
            }
        }
        
        return updatedQs;
    };

const handleSaveExam = async () => {
    if (saveInFlightRef.current) return;
    if (!examTitle.trim() || questions.length === 0) return alert("Vui lòng nhập tên đề và câu hỏi!");
    if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) return alert('Thời lượng phải là số phút lớn hơn 0.');
    if (!Number.isInteger(Number(attemptLimit)) || Number(attemptLimit) < 0) return alert('Số lượt thi phải là số nguyên không âm.');
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) return alert('Ngày kết thúc phải sau ngày bắt đầu.');
    { const flowError = validateFlowSettings({ mode: displayMode, pageSize }, questions.length); if (flowError) return alert(flowError); }
    if (reviewMode === 'after_time' && !Number.isFinite(new Date(reviewTime).getTime())) return alert('Vui lòng chọn thời điểm công bố đáp án.');
    saveInFlightRef.current = true;
    setIsSubmitting(true);
    try {
        validateQuestions(questions);
        const finalQuestions = await uploadAllImagesInQuestions(questions.map(normalizeQuestionExplanation));

        await addDoc(collection(db, "exams"), {
            teacherId: currentUser.uid,
            teacherName: currentUser.displayName || "Giáo viên",
            title: examTitle,
            duration: Number(duration),
            questions: finalQuestions,
            startDate: startDate || null,
            endDate: endDate || null,
            securityLevel: examSecurityLevel,
            isAntiCheat: examSecurityLevel === 'strict',
            password: examPassword.trim() || null,
            shuffleQuestions,
            shuffleOptions,
            attemptLimit: Number(attemptLimit),
            examFlow: {
                mode: displayMode,
                pageSize: displayMode === 'single' ? 1 : displayMode === 'group' ? Number(pageSize) : 0,
                allowBack: displayMode === 'all' ? true : allowBack,
            },
            mathDictionary: mathDictionary || {},
            accessType,
            allowedUsers: accessType === 'restricted' ? allowedUsers : [],
            reviewSettings: { mode: reviewMode, time: reviewMode === 'after_time' ? reviewTime : null },
            createdAt: serverTimestamp()
        });
        alert("Xuất bản đề thi thành công!");
        setExamTitle(""); setQuestions([]); setExamPassword('');
        try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* ignore */ }
        setDraftSavedAt(null);
        setStartDate(''); setEndDate('');
        setReviewMode('always'); setReviewTime('');
        setAccessType('public');
        setAllowedUsers([]);
        fetchExams();
    } catch (error) { 
        console.error(error); 
        alert("Lỗi khi lưu đề thi: " + (error.message || error));
    }
    finally { saveInFlightRef.current = false; setIsSubmitting(false); }
};

return (
    <div className="teacher-layout min-h-screen flex w-full">
        {/* Sidebar - Dolphin Style */}
        <TeacherSidebar />

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
            <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-between items-center">
                <nav aria-label="Vị trí" className="workspace-crumbs">
                    <Link to="/" className="back-home"><ChevronLeft size={18} aria-hidden="true" />Trang chủ</Link>
                    <span aria-hidden="true">/</span>
                    <span aria-current="page">Tạo đề thi</span>
                </nav>

                <div className="flex items-center gap-4">
                    {/* Hộp chứa Chuông thông báo */}
                    <div className="relative">
                        <button 
                            aria-label="Thông báo bài nộp" aria-expanded={showNotifications} onClick={handleToggleNotifications}
                            className="w-10 h-10 rounded-full hover:bg-gray-50 flex items-center justify-center border border-gray-100 relative cursor-pointer animate-in fade-in duration-200"
                        >
                            <Bell className="w-5 h-5 text-gray-600" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        {showNotifications && (
                            <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl border border-gray-200 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <span className="font-extrabold text-sm text-gray-800 flex items-center gap-1.5">
                                        <Bell className="w-4 h-4 text-blue-600" /> Thông báo gần đây
                                    </span>
                                    {unreadCount > 0 && (
                                        <button 
                                            onClick={() => {
                                                setUnreadCount(0);
                                                storageOperation('setItem', `notifications_last_seen_${currentUser.uid}`, Date.now().toString());
                                            }}
                                            className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                                        >
                                            Đánh dấu đã đọc
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 text-xs">
                                            <p className="font-medium">Chưa có thông báo nào.</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Khi có học sinh nộp bài thi, thông báo sẽ xuất hiện ở đây.</p>
                                        </div>
                                    ) : (
                                        notifications.map((notif) => {
                                            const notifTime = notif.submittedAt?.toDate 
                                                ? notif.submittedAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                                                : new Date(notif.submittedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                            
                                            const notifDate = notif.submittedAt?.toDate
                                                ? notif.submittedAt.toDate().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
                                                : new Date(notif.submittedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

                                            return (
                                                <div key={notif.id} className="p-4 hover:bg-blue-50/30 transition-colors text-xs text-gray-600 text-left">
                                                    <p className="leading-relaxed">
                                                        Học sinh <span className="font-extrabold text-gray-900">{notif.studentName}</span> đã nộp bài thi <span className="font-bold text-blue-600">{notif.examTitle}</span>.
                                                    </p>
                                                    <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-gray-400">
                                                        <span>Điểm số: <span className="text-emerald-600 font-extrabold">{notif.score}/10</span></span>
                                                        <span>{notifTime} - {notifDate}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Nút hiển thị thông tin tên giáo viên giống ở ngoài */}
                    <AccountMenu className="workspace-account" />
                </div>
            </header>

            <section
                className="workspace-main teacher-workspace teacher-create p-8 w-full max-w-7xl mx-auto"
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && questionTab === 'manual') {
                        e.preventDefault();
                        handleAddQuestion();
                    }
                }}
            >
                <div className="teacher-page-heading">
                    <div><p className="teacher-eyebrow">Không gian giáo viên</p>
                    <h2>Tạo đề thi</h2>
                    <p>Soạn câu hỏi, chọn cài đặt và chia sẻ đề với học sinh.</p></div>
                    <a href="#exam-settings" className="teacher-secondary-action"><SettingsIcon size={18} /> Cài đặt & xuất bản</a>
                </div>
                {draftOffer && (
                    <div className="draft-banner" role="status">
                        <History size={20} aria-hidden="true" />
                        <div>
                            <strong>Bạn có một đề đang soạn dở</strong>
                            <span>
                                {draftOffer.examTitle ? `“${draftOffer.examTitle}” · ` : ''}
                                {draftOffer.questions?.length || 0} câu hỏi · lưu lúc {new Date(draftOffer.savedAt || Date.now()).toLocaleString('vi-VN')}
                            </span>
                        </div>
                        <button type="button" onClick={restoreDraft} className="button-primary">Khôi phục</button>
                        <button type="button" onClick={discardDraft} className="button-secondary">Bỏ qua</button>
                    </div>
                )}
                <div className="teacher-create-flow">
                    <div className="teacher-compose-stack">
                        {/* Form tạo đề */}
                        <div className="teacher-compose-panel bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" /> Nội dung đề thi
                            </h3>
                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="exam-title" className="block text-sm font-semibold mb-2">Tên đề thi</label><input id="exam-title" type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none" placeholder="Tên đề thi..." />
                                </div>

                                <div className="teacher-input-tabs flex gap-1 border-b border-gray-100">
                                    <button aria-pressed={questionTab === 'manual'} onClick={() => setQuestionTab('manual')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'manual' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"}`}>Soạn câu hỏi</button>
                                    <button aria-pressed={questionTab === 'text'} onClick={() => setQuestionTab('text')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'text' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"}`}>Dán văn bản</button>
                                    <button aria-pressed={questionTab === 'file'} onClick={() => setQuestionTab('file')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'file' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"}`}>
                                        <span className="flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Nhập tài liệu</span>
                                    </button>
                                </div>

                                {questionTab === 'manual' ? (
                                    <div className="space-y-6">
                                        {/* Chọn loại câu hỏi */}
                                        <div className="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                            <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 px-2">Loại câu hỏi:</span>
                                            {[
                                                { value: 'single', label: 'Trắc nghiệm' },
                                                { value: 'multiple', label: 'Chọn nhiều' },
                                                { value: 'true_false', label: 'Đúng / Sai' },
                                                { value: 'multi_true_false', label: 'Đúng / Sai Nhiều Ý' },
                                                { value: 'essay', label: 'Tự luận' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => handleManualTypeChange(opt.value)}
                                                    className={`text-xs px-3 py-2 rounded-lg font-bold transition-all ${manualType === opt.value
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>

                                        {manualType === 'multi_true_false' && (
                                            <div className="flex items-center gap-3 p-4 bg-orange-50/50 border border-orange-200 rounded-xl">
                                                <span className="text-sm font-bold text-orange-800 shrink-0">Cấu hình chấm điểm:</span>
                                                <select
                                                    value={scoringMethod}
                                                    onChange={(e) => setScoringMethod(e.target.value)}
                                                    className="flex-1 bg-white border border-orange-300 rounded-lg px-3 py-2 text-sm font-medium text-orange-900 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                                                >
                                                    <option value="linear">Điểm chia đều (VD: 4 ý = 0.25đ/ý)</option>
                                                    <option value="gdpt_2018">Quy chuẩn GDPT 2018 (0.1, 0.25, 0.5, 1.0)</option>
                                                </select>
                                            </div>
                                        )}

                                        <RichTextEditor value={currentQText} onChange={setCurrentQText} minHeight={80} placeholder="Nhập nội dung câu hỏi..." />

                                        {/* Câu hỏi Tự luận */}
                                        {manualType === 'essay' && (
                                            <div className="p-6 bg-emerald-50/50 border border-dashed border-emerald-200 rounded-xl text-center">
                                                <p className="text-sm font-bold text-emerald-800">Câu hỏi tự luận</p>
                                                <p className="text-xs text-emerald-600/80 mt-1">Học sinh sẽ điền câu trả lời trực tiếp bằng văn bản khi làm bài thi.</p>
                                            </div>
                                        )}

                                        {/* Câu hỏi có đáp án lựa chọn */}
                                        {manualType !== 'essay' && (
                                            <div className="space-y-4">
                                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                                                    Danh sách đáp án (Tick chọn đáp án đúng):
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {options.map((option, idx) => {
                                                        const isMulti = manualType === 'multiple';
                                                        const isCorrect = isMulti
                                                            ? Array.isArray(correctAnswer) && correctAnswer.includes(idx)
                                                            : correctAnswer === idx;

                                                        const isMultiTF = manualType === 'multi_true_false';

                                                        const cardStyle = isMultiTF
                                                            ? "border-orange-200 bg-orange-50/30"
                                                            : isCorrect
                                                                ? isMulti
                                                                    ? "border-purple-500 bg-purple-50/60 ring-1 ring-purple-500"
                                                                    : "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
                                                                : "border-gray-100 bg-white hover:border-gray-200";

                                                        return (
                                                            <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${cardStyle}`}>
                                                                <div className="flex items-center justify-center shrink-0">
                                                                    {isMultiTF ? (
                                                                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-orange-200 shadow-sm">
                                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                                <input type="radio" checked={correctAnswer[idx] === true} onChange={() => handleToggleMultiTrueFalse(idx, true)} className="w-3.5 h-3.5 accent-orange-600" />
                                                                                <span className="text-[10px] font-bold text-gray-700">Đ</span>
                                                                            </label>
                                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                                <input type="radio" checked={correctAnswer[idx] === false} onChange={() => handleToggleMultiTrueFalse(idx, false)} className="w-3.5 h-3.5 accent-orange-600" />
                                                                                <span className="text-[10px] font-bold text-gray-700">S</span>
                                                                            </label>
                                                                        </div>
                                                                    ) : isMulti ? (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isCorrect}
                                                                            onChange={() => toggleCorrectAnswerMultiple(idx)}
                                                                            className="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600 focus:ring-0"
                                                                        />
                                                                    ) : (
                                                                        <input
                                                                            type="radio"
                                                                            checked={isCorrect}
                                                                            onChange={() => setCorrectAnswer(idx)}
                                                                            className="w-4 h-4 text-blue-600 cursor-pointer accent-blue-600 focus:ring-0"
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div className="w-full min-w-0">
                                                                    <RichTextEditor
                                                                        value={option}
                                                                        onChange={(v) => handleOptionChange(idx, v)}
                                                                        disabled={manualType === 'true_false'}
                                                                        compact
                                                                        placeholder={isMultiTF ? `Ý ${idx + 1}` : `Đáp án ${String.fromCharCode(65 + idx)}`}
                                                                    />
                                                                </div>
                                                                {(manualType === 'single' || manualType === 'multiple' || manualType === 'multi_true_false') && options.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveOption(idx)}
                                                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                                                                        title="Xóa đáp án"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {(manualType === 'single' || manualType === 'multiple' || manualType === 'multi_true_false') && (
                                                    <button
                                                        type="button"
                                                        onClick={handleAddOption}
                                                        className={`w-full py-2.5 border-2 border-dashed rounded-xl font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${manualType === 'multi_true_false'
                                                                ? "border-orange-200 hover:border-orange-500 text-orange-600 hover:bg-orange-50"
                                                                : "border-blue-200 hover:border-blue-500 text-blue-600 hover:bg-blue-50"
                                                            }`}
                                                    >
                                                        <Plus className="w-3.5 h-3.5" /> Thêm {manualType === 'multi_true_false' ? 'ý / phát biểu' : 'đáp án lựa chọn'}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <details defaultOpen={!!normalizeExplanation(manualExplanation)} className="text-xs">
                                            <summary className="cursor-pointer text-gray-500 font-bold select-none">Giải thích (không bắt buộc)</summary>
                                            <div className="mt-2">
                                                <p className="text-gray-500 mb-2">Chỉ hiển thị khi có nội dung và học sinh được phép xem lại bài.</p>
                                                <RichTextEditor value={manualExplanation} onChange={setManualExplanation} placeholder="Nhập giải thích, công thức hoặc hình minh họa…" minHeight={56} />
                                            </div>
                                        </details>

                                        <button onClick={handleAddQuestion} className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md">
                                            <Plus className="w-5 h-5" /> Thêm vào đề thi <kbd className="kbd-hint">Ctrl + Enter</kbd>
                                        </button>
                                    </div>
                                ) : questionTab === 'text' ? (
                                    <div className="space-y-4">
                                        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} className="w-full p-4 bg-purple-50/30 border border-purple-100 rounded-xl outline-none font-mono text-sm resize-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-shadow" placeholder={`Câu 1: Thủ đô của Việt Nam là gì?\nA. Hà Nội\nB. Hồ Chí Minh\nC. Đà Nẵng\nD. Huế\nĐáp án: A\nGiải thích: Hà Nội là thủ đô của Việt Nam.\n\nCâu 2: ...`} />
                                        <div className="flex items-start gap-2 text-[11px] text-gray-400">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span>Hỗ trợ: <b>Đáp án: A</b> (1 đáp), <b>Đáp án: A, B</b> (nhiều đáp), <b>Giải thích:</b> (lời giải), <b>[Loại: Tự luận]</b>, <b>[Loại: Đúng/Sai]</b>, <b>[Loại: Chọn nhiều]</b></span>
                                        </div>
                                        <button onClick={handleProcessImportText} className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-200">
                                            <Zap className="w-5 h-5" /> Nhận diện câu hỏi
                                        </button>
                                    </div>
                                ) : (
                                    /* ─── FILE UPLOAD TAB ─── */
                                    <div className="space-y-4">
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                            onDragLeave={() => setIsDragOver(false)}
                                            onDrop={handleDropFile}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${isDragOver
                                                ? 'border-emerald-400 bg-emerald-50 scale-[1.01]'
                                                : 'border-gray-200 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30'
                                                }`}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".docx,.pdf,.txt,text/plain"
                                                className="hidden"
                                                onChange={(e) => handleFileUpload(e.target.files?.[0])}
                                            />
                                            {isFileProcessing ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="text-sm font-bold text-gray-600">Đang phân tích file...</p>
                                                    <p className="text-xs text-gray-400">{fileName}</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200/50">
                                                        <Upload className="w-8 h-8 text-white" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-700">Kéo thả file vào đây hoặc <span className="text-blue-600">bấm để chọn</span></p>
                                                        <p className="text-xs text-gray-400 mt-1">Hỗ trợ: <b>.docx</b> (Word), <b>.pdf</b> và <b>.txt</b></p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {fileName && !isFileProcessing && !fileError && (
                                            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-emerald-800 truncate">{fileName}</p>
                                                    <p className="text-[10px] text-emerald-600 font-medium uppercase">Đã xử lý thành công</p>
                                                </div>
                                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                            </div>
                                        )}

                                        {fileError && (
                                            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                                <p className="text-sm font-medium text-red-700 flex-1">{fileError}</p>
                                                <button onClick={() => { setFileError(''); setFileName(''); }} className="p-1 hover:bg-red-100 rounded-lg transition"><X className="w-4 h-4 text-red-400" /></button>
                                            </div>
                                        )}

                                        <div className="flex items-start gap-2 text-[11px] text-gray-400">
                                            <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                                            <span>Nhận diện tự động: <b>đáp án in đậm/gạch chân</b> trong Word, <b>Đáp án: A</b> sau mỗi câu, hoặc <b>bảng đáp án</b> cuối tài liệu.</span>
                                        </div>
                                    </div>
                                )}

                                {/* ─── PREVIEW PANEL: shows parsed questions before confirming ─── */}
                                {previewQuestions.length > 0 && (
                                    <div className="mt-4 border-t border-gray-100 pt-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                Xem trước ({previewQuestions.length} câu nhận diện)
                                            </h4>
                                            <button onClick={() => setPreviewQuestions([])} className="text-xs text-gray-400 hover:text-red-500 transition font-bold">Xóa tất cả</button>
                                        </div>
                                        <div className="max-h-[32rem] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                                            {previewQuestions.map((q, idx) => {
                                                const qType = q.type || 'single';
                                                const typeInfo = TYPE_LABELS[qType] || TYPE_LABELS.single;
                                                const isEssay = qType === 'essay';
                                                if (editingPreviewIdx === idx) {
                                                    return (
                                                        <QuestionEditorCard
                                                            key={idx}
                                                            question={q}
                                                            onChange={(nq) => updatePreview(idx, nq)}
                                                            onDone={() => setEditingPreviewIdx(null)}
                                                            onDelete={() => deletePreview(idx)}
                                                        />
                                                    );
                                                }
                                                return (
                                                    <div key={idx} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                                                        {/* Header row: number + type badge + type selector */}
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="text-sm font-bold text-gray-800 flex items-baseline gap-1 flex-1 min-w-0">
                                                                <span className="shrink-0">Câu {idx + 1}:</span>
                                                                {previewIssues[idx]?.length > 0 && <span className="issue-badge shrink-0" title={previewIssues[idx].join('\n')}><TriangleAlert size={12} aria-hidden="true" /></span>}
                                                                <div className="min-w-0 font-semibold"><RichTextRenderer content={q.content} mathDict={mathDictionary} /></div>
                                                            </div>
                                                            {/* Type selector */}
                                                            <div className="shrink-0 flex items-center gap-1.5">
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                                                                    {typeInfo.label}
                                                                </span>
                                                                <select
                                                                    value={qType}
                                                                    onChange={(e) => handlePreviewTypeChange(idx, e.target.value)}
                                                                    className="text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                                                                    title="Đổi loại câu hỏi"
                                                                >
                                                                    {TYPE_OPTIONS.map(opt => (
                                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                                <button type="button" onClick={() => setEditingPreviewIdx(idx)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Sửa</button>
                                                                <button type="button" onClick={() => deletePreview(idx)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Xóa câu này"><Trash2 className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        </div>
                                                        {/* Essay: show placeholder */}
                                                        {isEssay ? (
                                                            <div className="text-xs italic text-gray-400 px-2 py-3 bg-white border border-dashed border-gray-200 rounded-lg">
                                                                (Câu hỏi tự luận — học sinh sẽ điền câu trả lời khi làm bài)
                                                            </div>
                                                        ) : (
                                                            <div className={`grid gap-2 ${isShortOptions(q.options) ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                                                                {q.options.map((opt, oi) => {
                                                                    let isCorrect = false;
                                                                    let labelSuffix = '';
                                                                    let itemBg = 'bg-white border-gray-100 text-gray-600';
                                                                    
                                                                    if (qType === 'multi_true_false') {
                                                                        const corAns = Array.isArray(q.correctAnswer) ? q.correctAnswer[oi] : false;
                                                                        labelSuffix = corAns ? 'Đúng' : 'Sai';
                                                                        itemBg = corAns 
                                                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                                                            : 'bg-rose-50 border-rose-300 text-rose-800 font-bold';
                                                                    } else {
                                                                        isCorrect = qType === 'multiple'
                                                                            ? Array.isArray(q.correctAnswer) && q.correctAnswer.map(Number).includes(oi)
                                                                            : oi === q.correctAnswer;
                                                                        if (isCorrect) {
                                                                            itemBg = 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold';
                                                                        }
                                                                    }
                                                                    return (
                                                                        <div key={oi} className={`text-xs px-3 py-2 rounded-lg border font-medium ${itemBg} flex items-center justify-between gap-2`}>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="option-letter mr-1">{String.fromCharCode(65 + oi)}.</span>
                                                                                {opt ? <RichTextRenderer content={opt} mathDict={mathDictionary} /> : <span className="italic text-gray-300">Trống</span>}
                                                                            </div>
                                                                            {labelSuffix && (
                                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 border ${
                                                                                    labelSuffix === 'Đúng' 
                                                                                        ? 'bg-emerald-100 border-emerald-200 text-emerald-700' 
                                                                                        : 'bg-rose-100 border-rose-200 text-rose-700'
                                                                                }`}>
                                                                                    {labelSuffix}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <QuestionExplanation content={q.explanation} mathDict={mathDictionary} compact />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button onClick={handleConfirmPreview} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2">
                                            <CheckCircle2 className="w-5 h-5" /> XÁC NHẬN THÊM {previewQuestions.length} CÂU HỎI
                                        </button>
                                    </div>
                                )}

                                {/* ─── DANH SÁCH CÂU HỎI TRONG ĐỀ: xem / sửa / xóa / đổi thứ tự ─── */}
                                {questions.length > 0 && (
                                    <div className="mt-4 border-t border-gray-100 pt-6 space-y-3">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider">
                                                Danh sách câu hỏi trong đề ({questions.length})
                                            </h4>
                                            <span className="text-xs text-gray-500">
                                                {(() => {
                                                    const n = issueCount;
                                                    return n > 0 ? <span className="issue-badge"><TriangleAlert size={13} aria-hidden="true" />{n} câu cần kiểm tra</span> : 'Tất cả câu hỏi hợp lệ';
                                                })()}
                                                {draftSavedAt && <> · Đã tự lưu nháp lúc {new Date(draftSavedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</>}
                                            </span>
                                        </div>
                                        <div className="max-h-[36rem] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                                            {questions.map((q, idx) => {
                                                if (editingQuestionIdx === idx) {
                                                    return (
                                                        <QuestionEditorCard
                                                            key={idx}
                                                            question={q}
                                                            onChange={(nq) => updateQuestion(idx, nq)}
                                                            onDone={() => setEditingQuestionIdx(null)}
                                                            onDelete={() => deleteQuestion(idx)}
                                                        />
                                                    );
                                                }
                                                const qType = q.type || 'single';
                                                const typeInfo = TYPE_LABELS[qType] || TYPE_LABELS.single;
                                                return (
                                                    <div key={idx} className="p-3 bg-white border border-gray-200 rounded-xl flex items-start gap-3">
                                                        <MoveButtons index={idx} total={questions.length} onMove={moveQuestion} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-black text-gray-500 shrink-0">Câu {idx + 1}</span>
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${typeInfo.color}`}>{typeInfo.label}</span>
                                                                {questionIssues[idx]?.length > 0 && (
                                                                    <span className="issue-badge" title={questionIssues[idx].join('\n')}><TriangleAlert size={12} aria-hidden="true" />{questionIssues[idx][0]}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-sm font-semibold text-gray-800 max-h-28 overflow-hidden">
                                                                <RichTextRenderer content={q.content} mathDict={mathDictionary} />
                                                            </div>
                                                            {qType !== 'essay' && (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {(q.options || []).map((opt, oi) => {
                                                                        const ok = qType === 'multi_true_false'
                                                                            ? q.correctAnswer?.[oi] === true
                                                                            : qType === 'multiple'
                                                                                ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(oi)
                                                                                : q.correctAnswer === oi;
                                                                        return (
                                                                            <span key={oi} className={`text-[11px] px-2 py-0.5 rounded-md border flex items-baseline gap-1 ${ok ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                                                                <span className="option-letter">{String.fromCharCode(65 + oi)}.</span>
                                                                                {opt ? <RichTextRenderer content={opt} mathDict={mathDictionary} /> : <i className="text-gray-300">Trống</i>}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                            <QuestionExplanation content={q.explanation} mathDict={mathDictionary} compact />
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button type="button" onClick={() => setEditingQuestionIdx(idx)} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Sửa</button>
                                                            <button type="button" onClick={() => deleteQuestion(idx)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Xóa câu hỏi"><Trash2 className="w-3.5 h-3.5" /></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cài đặt đề thi */}
                        <div id="exam-settings" className="teacher-settings-panel bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <SettingsIcon className="w-5 h-5 text-blue-600" /> Cài đặt đề thi
                            </h3>

                            <div className="teacher-settings-grid">
                                {/* NHÓM 1: THỜI GIAN */}
                                <details className="teacher-setting-group" open>
                                    <summary><Clock size={18} /> Thời gian</summary>
                                    <div className="space-y-4">
                                        <div>
                                            <label htmlFor="exam-duration" className="block text-sm font-semibold text-gray-700 mb-1.5">Thời gian làm bài</label>
                                            <div className="relative">
                                                <input id="exam-duration" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow pr-16" />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">phút</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="exam-start" className="block text-sm font-semibold text-gray-700 mb-1.5">Thời gian giao đề</label>
                                            <div className="grid sm:grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Từ</p>
                                                    <input id="exam-start" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm" />
                                                </div>
                                                <div>
                                                    <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Đến</p>
                                                    <input aria-label="Thời gian kết thúc giao đề" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm" />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="exam-attempt-limit" className="block text-sm font-semibold text-gray-700 mb-1.5">Số lượt làm bài tối đa</label>
                                            <p className="text-xs text-gray-500 mb-1">Nhập 0 nếu muốn cho phép làm bài không giới hạn</p>
                                            <div className="relative">
                                                <input id="exam-attempt-limit" type="number" min="0" value={attemptLimit} onChange={(e) => setAttemptLimit(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow pr-16" />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">lượt</span>
                                            </div>
                                        </div>
                                    </div>
                                </details>

                                {/* NHÓM 2: BẢO MẬT */}
                                <details className="teacher-setting-group">
                                    <summary><Shield size={18} /> Bảo mật & Quyền truy cập</summary>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Quyền truy cập đề thi</label>
                                            <select aria-label="Quyền truy cập đề thi"
                                                value={accessType}
                                                onChange={(e) => setAccessType(e.target.value)}
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm font-medium cursor-pointer"
                                            >
                                                <option value="public">Bất kỳ ai có đường liên kết</option>
                                                <option value="restricted">Hạn chế (Chỉ học sinh được chỉ định)</option>
                                            </select>
                                        </div>

                                        {accessType === 'restricted' && (
                                            <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-4">
                                                <p className="text-xs font-bold text-gray-500 uppercase">Danh sách học sinh được phép làm bài:</p>
                                                
                                                {/* Add from friends list */}
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-600">Thêm từ bạn bè có sẵn:</label>
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={selectedFriendId}
                                                            onChange={(e) => setSelectedFriendId(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
                                                            onClick={handleAddFriendToAllowed}
                                                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                                                        >
                                                            Thêm
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Add manually by name and ID */}
                                                <div className="space-y-2 pt-2 border-t border-gray-100">
                                                    <label className="block text-xs font-semibold text-gray-600">Nhập thủ công học sinh khác:</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="text"
                                                            aria-label="Tên học sinh được phép làm bài" placeholder="Tên học sinh"
                                                            value={manualAllowedName}
                                                            onChange={(e) => setManualAllowedName(e.target.value)}
                                                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                        />
                                                        <input
                                                            type="text"
                                                            aria-label="ID học sinh được phép làm bài" placeholder="ID (4 chữ số)"
                                                            maxLength={4}
                                                            value={manualAllowedId}
                                                            onChange={(e) => setManualAllowedId(e.target.value)}
                                                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAddManualToAllowed}
                                                        className="w-full mt-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black transition"
                                                    >
                                                        Thêm học sinh thủ công
                                                    </button>
                                                </div>

                                                {/* Display allowed list */}
                                                <div className="pt-2 border-t border-gray-100">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Đã thêm ({allowedUsers.length}):</p>
                                                    {allowedUsers.length === 0 ? (
                                                        <p className="text-[11px] text-gray-400 italic">Chưa có học sinh nào được chỉ định. Đề thi sẽ không thể làm bởi bất kì ai.</p>
                                                    ) : (
                                                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                                            {allowedUsers.map((user, idx) => (
                                                                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                                                                    <span className="font-semibold text-gray-700">{user.name} <span className="text-gray-400">#{user.shortId}</span></span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveFromAllowed(idx)}
                                                                        className="p-1 text-red-500 hover:bg-red-50 rounded"
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

                                        <div>
                                            <label htmlFor="exam-password" className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu đề thi</label>
                                            <div className="relative">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input id="exam-password" type="text" value={examPassword} onChange={(e) => setExamPassword(e.target.value)} placeholder="Bỏ trống nếu không dùng" className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
                                            </div>
                                        </div>
                                        <div className="pt-2">
                                            <ExamSecurityOptions value={examSecurityLevel} onChange={setExamSecurityLevel} />
                                        </div>
                                    </div>
                                </details>

                                {/* NHÓM 3: CẤU HÌNH */}
                                <details className="teacher-setting-group">
                                    <summary><Shuffle size={18} /> Cấu hình</summary>
                                    <div className="divide-y divide-gray-100">
                                        <div className="py-3" role="group" aria-labelledby="flow-title">
                                            <p id="flow-title" className="text-sm font-semibold text-gray-700 mb-1">Cách hiển thị khi làm bài</p>
                                            <p className="text-xs text-gray-400 leading-relaxed mb-3">Học sinh thấy toàn bộ đề, từng câu một, hoặc từng nhóm câu.</p>
                                            <div className="flow-choices" role="radiogroup" aria-labelledby="flow-title">
                                                {[
                                                    { value: 'all', title: 'Tất cả câu', hint: 'Cuộn trên một trang' },
                                                    { value: 'single', title: 'Từng câu', hint: 'Mỗi trang một câu' },
                                                    { value: 'group', title: 'Theo nhóm', hint: 'Mỗi trang n câu' },
                                                ].map((o) => (
                                                    <button key={o.value} type="button" role="radio" aria-checked={displayMode === o.value} data-active={displayMode === o.value} onClick={() => setDisplayMode(o.value)}>
                                                        <strong>{o.title}</strong><span>{o.hint}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {displayMode === 'group' && (
                                                <div className="mt-3 flex items-center gap-3">
                                                    <label htmlFor="exam-page-size" className="text-sm font-medium text-gray-700">Số câu mỗi trang</label>
                                                    <input id="exam-page-size" type="number" min="2" max={MAX_PAGE_SIZE} value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold" />
                                                    {questions.length > 0 && Number(pageSize) >= 2 && <span className="text-xs text-gray-400">≈ {Math.ceil(questions.length / Number(pageSize))} trang</span>}
                                                </div>
                                            )}
                                        </div>
                                        {displayMode !== 'all' && (
                                            <ToggleSwitch
                                                enabled={allowBack}
                                                onChange={setAllowBack}
                                                label="Cho phép quay lại câu trước"
                                                description={allowBack ? 'Học sinh có thể xem và sửa các câu đã làm.' : 'Đã sang trang tiếp theo là khóa trang trước – không thể xem hay sửa lại.'}
                                                icon={Undo2}
                                            />
                                        )}
                                        <ToggleSwitch
                                            enabled={shuffleQuestions}
                                            onChange={setShuffleQuestions}
                                            label="Đảo câu hỏi"
                                            description="Xáo trộn thứ tự câu hỏi cho mỗi học sinh."
                                            icon={Shuffle}
                                        />
                                        <ToggleSwitch
                                            enabled={shuffleOptions}
                                            onChange={setShuffleOptions}
                                            label="Đảo đáp án"
                                            description="Xáo trộn vị trí các đáp án A, B, C, D."
                                            icon={Shuffle}
                                        />
                                        <div className="py-3">
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                                                <Eye className="w-4 h-4 text-gray-400" /> Chế độ xem lại bài thi
                                            </label>
                                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed mb-3">Quyết định khi nào học sinh có thể xem lại chi tiết đáp án.</p>
                                            <select aria-label="Chế độ xem lại bài thi"
                                                value={reviewMode}
                                                onChange={(e) => setReviewMode(e.target.value)}
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm cursor-pointer font-medium"
                                            >
                                                <option value="always">Luôn cho phép (Ngay sau khi nộp)</option>
                                                <option value="never">Không bao giờ cho phép</option>
                                                <option value="after_time">Mở sau một thời gian cụ thể</option>
                                            </select>
                                            {reviewMode === 'after_time' && (
                                                <div className="mt-3 pl-3 border-l-2 border-blue-200 animate-in slide-in-from-top-2 duration-200">
                                                    <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Thời điểm mở khóa xem lại</p>
                                                    <input
                                                        type="datetime-local"
                                                        value={reviewTime}
                                                        onChange={(e) => setReviewTime(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm font-medium"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </details>

                                </div>
                            <div className="teacher-publish-row">
                                <div><strong>{questions.length} câu hỏi trong đề</strong><p>Kiểm tra nội dung và cài đặt trước khi xuất bản.</p></div>
                                {/* NÚT XUẤT BẢN */}
                                <button onClick={handleSaveExam} disabled={isSubmitting} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isSubmitting ? "ĐANG LƯU..." : `Xuất bản đề thi (${questions.length} câu)`}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Đề thi gần đây */}
                    <div className="teacher-recent space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-lg font-bold text-gray-900">Đề thi gần đây</h3>
                            <Link to="/teacher/exams" className="text-blue-600 text-xs font-bold hover:underline">Xem tất cả</Link>
                        </div>
                        <div className="teacher-recent-grid">
                            {examsList.length === 0 && <p className="teacher-recent-empty">Đề thi đã xuất bản sẽ xuất hiện ở đây.</p>}
                            {examsList.map((exam) => (
                                <div key={exam.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition group relative">
                                    <div className="flex justify-between items-start gap-3">
                                        <h4 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors line-clamp-2 flex-1 text-left">{exam.title}</h4>
                                        
                                        <div className="relative shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleDropdown(exam.id);
                                                }}
                                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition cursor-pointer"
                                                title="Tùy chọn"
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                            
                                            {activeDropdownId === exam.id && (
                                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 overflow-hidden z-50 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`${window.location.origin}/student/exam/${exam.id}`);
                                                            alert("Sao chép link bài thi thành công!");
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Copy className="w-3.5 h-3.5 text-gray-400" /> Sao chép liên kết
                                                    </button>
                                                    <Link
                                                        to={`/teacher/exam/${exam.id}/submissions`}
                                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left cursor-pointer"
                                                    >
                                                        <BarChart3 className="w-3.5 h-3.5 text-gray-400" /> Thống kê điểm
                                                    </Link>
                                                    <button
                                                        onClick={() => handleOpenAccessModal(exam)}
                                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Shield className="w-3.5 h-3.5 text-gray-400" /> Quyền truy cập
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenDurationModal(exam)}
                                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Clock className="w-3.5 h-3.5 text-gray-400" /> Điều chỉnh thời gian
                                                    </button>
                                                    <div className="border-t border-gray-100 my-1"></div>
                                                    <button
                                                        onClick={() => handleDeleteExam(exam.id)}
                                                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 text-red-400" /> Xóa đề thi
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md select-all cursor-text" title="Mã đề thi">{exam.id}</span>
                                        <button onClick={() => { navigator.clipboard.writeText(exam.id); }} className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors" title="Sao chép mã đề thi">
                                            <Copy className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="flex gap-4 text-[11px] text-gray-400 font-bold">
                                        <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {exam.questions?.length || 0} câu</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.duration}p</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Modal chỉnh sửa Quyền truy cập trực tiếp */}
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
        </div>
    </div>
);
}
