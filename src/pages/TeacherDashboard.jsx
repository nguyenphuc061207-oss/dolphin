import { useState, useEffect, useRef } from "react";

import JSZip from 'jszip';
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import { parseQuestionsFromText, parseQuestionsFromHtml } from "../utils/questionParser";
import MathText from "../components/MathText";
import RichTextRenderer from "../components/RichTextRenderer";
import {
    LayoutDashboard,
    BookOpen,
    Settings as SettingsIcon,
    Plus,
    Clock,
    BarChart3,
    Copy,
    Trash2,
    Search,
    Bell,
    LogOut,
    Eye,
    Calendar,
    Zap,
    Shield,
    KeyRound,
    Shuffle,
    Lock,
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    X
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ── Question type metadata ────────────────────────────────────────────
const TYPE_LABELS = {
    single:     { label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    multiple:   { label: 'Chọn nhiều',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
    true_false: { label: 'Đúng/Sai',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
    essay:      { label: 'Tự luận',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const TYPE_OPTIONS = [
    { value: 'single',     label: 'Trắc nghiệm (1 đáp án)' },
    { value: 'multiple',   label: 'Chọn nhiều' },
    { value: 'true_false', label: 'Đúng / Sai' },
    { value: 'essay',      label: 'Tự luận' },
];

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
        <button
            type="button"
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0 ml-4 ${enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
        >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
        </button>
    </div>
);

export default function TeacherDashboard() {
    const { currentUser } = useAuth();

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
    const [isAntiCheat, setIsAntiCheat] = useState(true);
    const [examPassword, setExamPassword] = useState('');
    const [shuffleQuestions, setShuffleQuestions] = useState(true);
    const [shuffleOptions, setShuffleOptions] = useState(false);
    const [attemptLimit, setAttemptLimit] = useState(0);

    // --- SOẠN THẢO CÂU HỎI ---
    const [currentQText, setCurrentQText] = useState("");
    const [options, setOptions] = useState(["", "", "", ""]);
    const [correctAnswer, setCorrectAnswer] = useState(0);
    const [importText, setImportText] = useState("");
    const [isFileProcessing, setIsFileProcessing] = useState(false);
    const [fileError, setFileError] = useState('');
    const [fileName, setFileName] = useState('');
    const [previewQuestions, setPreviewQuestions] = useState([]);
    const [mathDictionary, setMathDictionary] = useState({}); // token → LaTeX map
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);

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

    const handleOptionChange = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleAddQuestion = () => {
        if (!currentQText.trim() || options.some(opt => !opt.trim())) {
            return alert("Vui lòng điền đủ câu hỏi và 4 đáp án!");
        }
        setQuestions([...questions, { content: currentQText, options: options, correctAnswer }]);
        setCurrentQText(""); setOptions(["", "", "", ""]); setCorrectAnswer(0);
    };

    // ─── ADVANCED TEXT PARSING (uses new parser) ───
    const handleProcessImportText = () => {
        if (!importText.trim()) return;
        const parsed = parseQuestionsFromText(importText);
        if (parsed.length === 0) {
            return alert('Không nhận diện được câu hỏi nào. Vui lòng kiểm tra định dạng.');
        }
        setPreviewQuestions(parsed);
    };

    // ─── FILE UPLOAD HANDLER ───
    // ============================================================
    // handleFileUpload — đọc DOCX (kể cả ký hiệu toán học OMML)
    // và PDF, trả về danh sách câu hỏi đã parse.
    // ============================================================
    const handleFileUpload = async (file) => {
        if (!file) return;
        setFileError('');
        setFileName(file.name);
        setIsFileProcessing(true);
        setPreviewQuestions([]);

        // ── Namespace OOXML ──────────────────────────────────────────────────
        const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

        // ── Utility helpers ──────────────────────────────────────────────────
        /** Lấy attribute m:val từ node OMML (hỗ trợ cả namespace-aware lẫn prefix) */
        const getMVal = (node) =>
            node.getAttributeNS(NS_M, 'val') ||
            node.getAttribute('m:val') ||
            node.getAttribute('val') ||
            '';

        /** Con đầu tiên có localName khớp */
        const firstChild = (node, name) =>
            Array.from(node.childNodes).find((n) => n.localName === name) || null;

        /** Tất cả con có localName khớp */
        const allChildren = (node, name) =>
            Array.from(node.childNodes).filter((n) => n.localName === name);

        // ── OMML → LaTeX ─────────────────────────────────────────────────────
        /**
         * Chuyển một node OMML thành chuỗi LaTeX.
         * Hỗ trợ: phân số, căn bậc n, lũy thừa, chỉ số, tích phân/tổng/tích,
         * dấu ngoặc, hàm, accent (mũ/vec/bar), giới hạn, ma trận, …
         */
        const toLatex = (node) => {
            if (!node || node.nodeType === 3) return ''; // bỏ raw text node trong math

            const local = node.localName;
            if (!local) return '';

            // Render toàn bộ con
            const kids = () => Array.from(node.childNodes).map(toLatex).join('');
            // Render toàn bộ con của một node khác
            const childOf = (n) => (n ? Array.from(n.childNodes).map(toLatex).join('') : '');

            switch (local) {
                // ── Khung ngoài ─────────────────────────────────────────────────
                case 'oMathPara':
                    // Một đoạn có thể chứa nhiều oMath (hiển thị block)
                    return allChildren(node, 'oMath').map(toLatex).join('\n');

                case 'oMath':
                    // Công thức inline → bọc $...$
                    return `$${kids()}$`;

                // ── Run văn bản trong toán ───────────────────────────────────────
                case 'r': {
                    // m:rPr chứa định dạng, bỏ qua; m:t chứa text thực
                    const t = firstChild(node, 't');
                    return t ? t.textContent : '';
                }

                // ── Phân số ─────────────────────────────────────────────────────
                case 'f': {
                    const num = firstChild(node, 'num');
                    const den = firstChild(node, 'den');
                    return `\\frac{${childOf(num)}}{${childOf(den)}}`;
                }

                // ── Căn bậc n ───────────────────────────────────────────────────
                case 'rad': {
                    const degNode = firstChild(node, 'deg');
                    const eNode = firstChild(node, 'e');
                    const degTex = degNode ? childOf(degNode).trim() : '';
                    const eTex = childOf(eNode);
                    // Nếu bậc rỗng hoặc = 2 → \sqrt{}, ngược lại → \sqrt[n]{}
                    return degTex && degTex !== '2'
                        ? `\\sqrt[${degTex}]{${eTex}}`
                        : `\\sqrt{${eTex}}`;
                }

                // ── Lũy thừa (superscript) ───────────────────────────────────────
                case 'sSup': {
                    const e = firstChild(node, 'e');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}^{${childOf(sup)}}`;
                }

                // ── Chỉ số (subscript) ───────────────────────────────────────────
                case 'sSub': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    return `${childOf(e)}_{${childOf(sub)}}`;
                }

                // ── Vừa chỉ số vừa lũy thừa ─────────────────────────────────────
                case 'sSubSup': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}_{${childOf(sub)}}^{${childOf(sup)}}`;
                }

                // ── N-ary (∑ ∏ ∫ ∬ ∭ …) ─────────────────────────────────────────
                case 'nary': {
                    const pr = firstChild(node, 'naryPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const chrVal = chrNode ? getMVal(chrNode) : '∫';

                    const opMap = {
                        '∑': '\\sum', '\u2211': '\\sum',
                        '∏': '\\prod', '\u220F': '\\prod',
                        '∫': '\\int', '\u222B': '\\int',
                        '∬': '\\iint', '\u222C': '\\iint',
                        '∭': '\\iiint', '\u222D': '\\iiint',
                        '⋃': '\\bigcup', '⋂': '\\bigcap',
                    };
                    const op = opMap[chrVal] ?? chrVal ?? '\\int';
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    const e = firstChild(node, 'e');
                    return (
                        op +
                        (sub ? `_{${childOf(sub)}}` : '') +
                        (sup ? `^{${childOf(sup)}}` : '') +
                        (e ? ` ${childOf(e)}` : '')
                    );
                }

                // ── Dấu ngoặc (delimiter) ────────────────────────────────────────
                case 'd': {
                    const pr = firstChild(node, 'dPr');
                    let beg = '(', end = ')';
                    if (pr) {
                        const b = firstChild(pr, 'begChr');
                        const en = firstChild(pr, 'endChr');
                        if (b) beg = getMVal(b) || '(';
                        if (en) end = getMVal(en) || ')';
                    }
                    // Nếu cả hai đều rỗng (absolute value dạng || ) thì dùng |
                    if (beg === '' && end === '') { beg = '|'; end = '|'; }

                    const begMap = { '(': '\\left(', '[': '\\left[', '{': '\\left\\{', '|': '\\left|', '⌈': '\\left\\lceil', '⌊': '\\left\\lfloor' };
                    const endMap = { ')': '\\right)', ']': '\\right]', '}': '\\right\\}', '|': '\\right|', '⌉': '\\right\\rceil', '⌋': '\\right\\rfloor' };
                    const lBeg = begMap[beg] ?? `\\left${beg}`;
                    const lEnd = endMap[end] ?? `\\right${end}`;

                    const parts = allChildren(node, 'e').map(childOf);
                    return `${lBeg}${parts.join(', ')}${lEnd}`;
                }

                // ── Hàm số (func) ────────────────────────────────────────────────
                case 'func': {
                    const fName = firstChild(node, 'fName');
                    const e = firstChild(node, 'e');
                    // Hàm lượng giác/log không cần ngoặc bổ sung
                    const funcNames = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'ln', 'log', 'exp', 'lim', 'max', 'min', 'gcd', 'lcm'];
                    const nameText = childOf(fName);
                    const isTrig = funcNames.some(fn => nameText.includes(fn));
                    return isTrig
                        ? `${nameText}\\left(${childOf(e)}\\right)`
                        : `${nameText}\\left(${childOf(e)}\\right)`;
                }

                // ── Accent (mũ, véc-tơ, dấu chấm, …) ───────────────────────────
                case 'acc': {
                    const pr = firstChild(node, 'accPr');
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const accent = chrNode ? getMVal(chrNode) : '\u0302';

                    const accMap = {
                        '\u0302': `\\hat{${eTex}}`,     // ^
                        '\u0303': `\\tilde{${eTex}}`,   // ~
                        '\u0307': `\\dot{${eTex}}`,     // ·
                        '\u0308': `\\ddot{${eTex}}`,    // ¨
                        '\u20D7': `\\vec{${eTex}}`,     // →
                        '\u2192': `\\vec{${eTex}}`,
                        '\u0305': `\\bar{${eTex}}`,     // ‾
                        '\u0306': `\\breve{${eTex}}`,
                        '\u030C': `\\check{${eTex}}`,
                    };
                    return accMap[accent] ?? `\\hat{${eTex}}`;
                }

                // ── Gạch ngang trên/dưới ─────────────────────────────────────────
                case 'bar': {
                    const pr = firstChild(node, 'barPr');
                    const pos = pr ? firstChild(pr, 'pos') : null;
                    const posV = pos ? getMVal(pos) : 'top';
                    const e = firstChild(node, 'e');
                    return posV === 'bot'
                        ? `\\underline{${childOf(e)}}`
                        : `\\overline{${childOf(e)}}`;
                }

                // ── Giới hạn dưới (lim_{x→a}) ───────────────────────────────────
                case 'limLow': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    const eTex = childOf(e);
                    const limTex = childOf(lim);
                    // Nếu biểu thức là "lim" → dùng \lim
                    return /^\\?lim/.test(eTex.trim())
                        ? `\\lim_{${limTex}}`
                        : `${eTex}_{${limTex}}`;
                }

                // ── Giới hạn trên ────────────────────────────────────────────────
                case 'limUpp': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    return `${childOf(e)}^{${childOf(lim)}}`;
                }

                // ── Ma trận ──────────────────────────────────────────────────────
                case 'm': {
                    // Xác định loại ngoặc từ mPr (mặc định là pmatrix)
                    const pr = firstChild(node, 'mPr');
                    const begNode = pr ? firstChild(pr, 'begChr') : null;
                    const endNode = pr ? firstChild(pr, 'endChr') : null;
                    const begChr = begNode ? getMVal(begNode) : '(';
                    const envMap = { '(': 'pmatrix', '[': 'bmatrix', '{': 'Bmatrix', '|': 'vmatrix' };
                    const env = envMap[begChr] ?? 'pmatrix';

                    const rows = allChildren(node, 'mr').map((row) => {
                        return allChildren(row, 'e').map(childOf).join(' & ');
                    });
                    return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`;
                }

                // ── Hệ phương trình (equation array) ────────────────────────────
                case 'eqArr': {
                    const rows = allChildren(node, 'e').map(childOf);
                    return `\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`;
                }

                // ── Nhóm ký hiệu (ví dụ: dấu cung, ngoặc móc) ──────────────────
                case 'groupChr': {
                    const pr = firstChild(node, 'groupChrPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const chr = chrNode ? getMVal(chrNode) : '';
                    const pos = pr ? firstChild(pr, 'pos') : null;
                    const posV = pos ? getMVal(pos) : 'bot';
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);
                    if (chr === '⌣' || chr === '\u2322') return `\\overset{\\frown}{${eTex}}`;
                    if (posV === 'top') return `\\overbrace{${eTex}}`;
                    return `\\underbrace{${eTex}}`;
                }

                // ── Phantom / borderBox (ít dùng) ────────────────────────────────
                case 'phant':
                case 'borderBox':
                    return kids();

                // ── Container pass-through ───────────────────────────────────────
                case 'num': case 'den':
                case 'e': case 'sup': case 'sub':
                case 'fName': case 'lim': case 'deg':
                case 'mr': case 'sPrePr':
                    return kids();

                default:
                    return kids();
            }
        };

        // ── Trích xuất text + math từ cây XML ────────────────────────────────
        /**
         * Duyệt đệ quy toàn bộ node, trả về chuỗi văn bản thuần + LaTeX cho math.
         * Giữ đúng thứ tự inline: "Phương trình $x^2+1=0$ có nghiệm phức."
         */
        const extractText = (node) => {
            if (!node) return '';

            const ns = node.namespaceURI;
            const local = node.localName;

            // ── Math block → LaTeX ──────────────────────────────────────────
            if (ns === NS_M && (local === 'oMath' || local === 'oMathPara')) {
                return toLatex(node);
            }

            // ── Text thuần (bên trong w:r > w:t) ────────────────────────────
            if (ns === NS_W && local === 't') {
                return node.textContent;
            }

            // ── Xuống dòng trong run ─────────────────────────────────────────
            if (ns === NS_W && local === 'br') {
                return '\n';
            }

            // ── Bỏ qua node định dạng / metadata ────────────────────────────
            const SKIP = ['pPr', 'rPr', 'sectPr', 'tblPr', 'trPr', 'tcPr',
                'bookmarkStart', 'bookmarkEnd', 'proofErr',
                'instrText', 'del', 'lastRenderedPageBreak'];
            if (ns === NS_W && SKIP.includes(local)) return '';

            // ── Đệ quy vào tất cả con còn lại ───────────────────────────────
            return Array.from(node.childNodes).map(extractText).join('');
        };

        // ── Xử lý bảng: mỗi hàng thành một dòng, các ô ngăn bằng tab ────────
        const extractTable = (tblNode) => {
            const rows = tblNode.getElementsByTagNameNS(NS_W, 'tr');
            return Array.from(rows).map((row) => {
                const cells = row.getElementsByTagNameNS(NS_W, 'tc');
                return Array.from(cells)
                    .map((cell) =>
                        Array.from(cell.getElementsByTagNameNS(NS_W, 'p'))
                            .map(extractText)
                            .join(' ')
                    )
                    .join('\t');
            }).join('\n');
        };

        // ════════════════════════════════════════════════════════════════════
        try {
            const ext = file.name.split('.').pop().toLowerCase();

            // ── DOCX ──────────────────────────────────────────────────────────
            if (ext === 'docx') {
                const arrayBuffer = await file.arrayBuffer();

                // 1. Giải nén và lấy document.xml
                const zip = await JSZip.loadAsync(arrayBuffer);
                const docXml = await zip.file('word/document.xml')?.async('string');
                if (!docXml) throw new Error('Không đọc được nội dung file DOCX.');

                // 2. Parse XML
                const xmlDoc = new DOMParser().parseFromString(docXml, 'application/xml');
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) throw new Error('File DOCX bị lỗi cấu trúc XML.');

                const body = xmlDoc.getElementsByTagNameNS(NS_W, 'body')[0];
                if (!body) throw new Error('Không tìm thấy nội dung trong file DOCX.');

                // 3. Duyệt body: đoạn văn (w:p) và bảng (w:tbl)
                const lines = [];
                for (const node of body.childNodes) {
                    const local = node.localName;
                    if (local === 'p') {
                        lines.push(extractText(node));
                    } else if (local === 'tbl') {
                        lines.push(extractTable(node));
                    }
                    // Bỏ qua sectPr và các node khác
                }

                // 4. Gộp thành văn bản đầy đủ và parse câu hỏi
                const fullText = lines.join('\n');
                const parsed = parseQuestionsFromText(fullText);
                if (parsed.length === 0)
                    throw new Error('Không tìm thấy câu hỏi nào trong file DOCX.');

                setPreviewQuestions(parsed);

                // ── PDF ───────────────────────────────────────────────────────────
            } else if (ext === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    // Giữ khoảng trắng giữa các item để không dính chữ
                    const pageText = content.items
                        .map((item) => item.str)
                        .join(item => item.hasEOL ? '\n' : ' ');
                    fullText += pageText + '\n';
                }

                const parsed = parseQuestionsFromText(fullText);
                if (parsed.length === 0)
                    throw new Error('Không tìm thấy câu hỏi nào trong file PDF.');

                setPreviewQuestions(parsed);

            } else {
                throw new Error(
                    'Định dạng file không được hỗ trợ. Vui lòng sử dụng .docx hoặc .pdf'
                );
            }
        } catch (err) {
            console.error('File processing error:', err);
            setFileError(err.message || 'Lỗi khi xử lý file.');
        } finally {
            setIsFileProcessing(false);
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
        setPreviewQuestions(prev => prev.map((q, i) => {
            if (i !== idx) return q;
            // Reset correctAnswer to a sensible default for the new type
            let correctAnswer = q.correctAnswer;
            if (newType === 'essay') correctAnswer = '';
            else if (newType === 'multiple') correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer >= 0 ? [q.correctAnswer] : [0]);
            else correctAnswer = Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] ?? 0) : (q.correctAnswer >= 0 ? q.correctAnswer : 0);
            return { ...q, type: newType, correctAnswer };
        }));
    };

    const handleSaveExam = async () => {
        if (!examTitle.trim() || questions.length === 0) return alert("Vui lòng nhập tên đề và câu hỏi!");
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "exams"), {
                teacherId: currentUser.uid,
                teacherName: currentUser.displayName,
                title: examTitle,
                duration: Number(duration),
                questions: questions,
                startDate: startDate || null,
                endDate: endDate || null,
                isAntiCheat,
                password: examPassword.trim() || null,
                shuffleQuestions,
                shuffleOptions,
                attemptLimit: Number(attemptLimit),
                mathDictionary: mathDictionary || {},
                createdAt: serverTimestamp()
            });
            alert("Xuất bản đề thi thành công!");
            setExamTitle(""); setQuestions([]); setExamPassword('');
            setStartDate(''); setEndDate('');
            fetchExams();
        } catch (error) { console.error(error); }
        finally { setIsSubmitting(false); }
    };

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
                    <Link to="/teacher" className="w-full px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center gap-3 transition-all">
                        <LayoutDashboard className="w-5 h-5" /> Dashboard
                    </Link>
                    <Link to="/teacher/exams" className="w-full px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-3 font-semibold transition-all">
                        <BookOpen className="w-5 h-5" /> Quản lý Đề thi
                    </Link>
                </nav>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="border-b border-gray-200 bg-white sticky top-0 z-40 px-8 py-4 flex justify-between items-center">
                    <div className="flex-1 max-w-md relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Tìm kiếm đề thi..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button className="w-10 h-10 rounded-full hover:bg-gray-50 flex items-center justify-center border border-gray-100">
                        <Bell className="w-5 h-5 text-gray-600" />
                    </button>
                </header>

                <main className="p-8 w-full max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-gray-900">Bảng điều khiển</h2>
                        <p className="text-gray-500 font-medium mt-1">Chào mừng quay trở lại, {currentUser?.displayName}!</p>
                    </div>
                    <div className="grid lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            {/* Form tạo đề */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-blue-600" /> Đề thi mới
                                </h3>
                                <div className="space-y-6">
                                    <div>
                                        <input type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none" placeholder="Tên đề thi..." />
                                    </div>

                                    <div className="flex gap-1 border-b border-gray-100">
                                        <button onClick={() => setQuestionTab('manual')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'manual' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"}`}>NHẬP THỦ CÔNG</button>
                                        <button onClick={() => setQuestionTab('text')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'text' ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-600"}`}>NHẬP NHANH</button>
                                        <button onClick={() => setQuestionTab('file')} className={`pb-3 px-4 text-sm font-bold transition-colors ${questionTab === 'file' ? "text-emerald-600 border-b-2 border-emerald-600" : "text-gray-400 hover:text-gray-600"}`}>
                                            <span className="flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> TẢI FILE</span>
                                        </button>
                                    </div>

                                    {questionTab === 'manual' ? (
                                        <div className="space-y-6">
                                            <textarea value={currentQText} onChange={(e) => setCurrentQText(e.target.value)} rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none" placeholder="Nhập câu hỏi..." />
                                            <div className="grid grid-cols-2 gap-4">
                                                {options.map((option, idx) => (
                                                    <label key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${correctAnswer === idx ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-white"}`}>
                                                        <input type="radio" checked={correctAnswer === idx} onChange={() => setCorrectAnswer(idx)} className="w-4 h-4 text-blue-600" />
                                                        <input type="text" value={option} onChange={(e) => handleOptionChange(idx, e.target.value)} placeholder={`Đáp án ${String.fromCharCode(65 + idx)}`} className="bg-transparent outline-none w-full font-medium" />
                                                    </label>
                                                ))}
                                            </div>
                                            <button onClick={handleAddQuestion} className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all">+ THÊM CÂU HỎI</button>
                                        </div>
                                    ) : questionTab === 'text' ? (
                                        <div className="space-y-4">
                                            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} className="w-full p-4 bg-purple-50/30 border border-purple-100 rounded-xl outline-none font-mono text-sm resize-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-shadow" placeholder={`Câu 1: Thủ đô của Việt Nam là gì?\nA. Hà Nội\nB. Hồ Chí Minh\nC. Đà Nẵng\nD. Huế\nĐáp án: A\n\nCâu 2: ...`} />
                                            <div className="flex items-start gap-2 text-[11px] text-gray-400">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                <span>Hỗ trợ: <b>Đáp án: A</b> (1 đáp), <b>Đáp án: A, B</b> (nhiều đáp), <b>[Loại: Tự luận]</b>, <b>[Loại: Đúng/Sai]</b>, <b>[Loại: Chọn nhiều]</b></span>
                                            </div>
                                            <button onClick={handleProcessImportText} className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-200">
                                                <Zap className="w-5 h-5" /> TỰ ĐỘNG NHẬN DIỆN
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
                                                    accept=".docx,.pdf"
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
                                                            <p className="text-xs text-gray-400 mt-1">Hỗ trợ: <b>.docx</b> (Word) và <b>.pdf</b></p>
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
                                            <div className="max-h-80 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                                                {previewQuestions.map((q, idx) => {
                                                    const qType = q.type || 'single';
                                                    const typeInfo = TYPE_LABELS[qType] || TYPE_LABELS.single;
                                                    const isEssay = qType === 'essay';
                                                    return (
                                                        <div key={idx} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                                                            {/* Header row: number + type badge + type selector */}
                                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                                <div className="text-sm font-bold text-gray-800 flex items-baseline gap-1 flex-1 min-w-0">
                                                                    <span className="shrink-0">Câu {idx + 1}:</span>
                                                                    <div className="truncate"><RichTextRenderer content={q.content} mathDict={mathDictionary} /></div>
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
                                                                </div>
                                                            </div>
                                                            {/* Essay: show placeholder */}
                                                            {isEssay ? (
                                                                <div className="text-xs italic text-gray-400 px-2 py-3 bg-white border border-dashed border-gray-200 rounded-lg">
                                                                    (Câu hỏi tự luận — học sinh sẽ điền câu trả lời khi làm bài)
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {q.options.map((opt, oi) => {
                                                                        const isCorrect = qType === 'multiple'
                                                                            ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(oi)
                                                                            : oi === q.correctAnswer;
                                                                        return (
                                                                            <div key={oi} className={`text-xs px-3 py-2 rounded-lg border font-medium ${
                                                                                isCorrect
                                                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                                                    : 'bg-white border-gray-100 text-gray-600'
                                                                            }`}>
                                                                                <span className="font-black mr-1">{String.fromCharCode(65 + oi)}.</span>
                                                                                {opt ? <RichTextRenderer content={opt} mathDict={mathDictionary} /> : <span className="italic text-gray-300">Trống</span>}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <button onClick={handleConfirmPreview} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2">
                                                <CheckCircle2 className="w-5 h-5" /> XÁC NHẬN THÊM {previewQuestions.length} CÂU HỎI
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cài đặt đề thi */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                    <SettingsIcon className="w-5 h-5 text-blue-600" /> Cài đặt đề thi
                                </h3>

                                <div className="space-y-6">
                                    {/* NHÓM 1: THỜI GIAN */}
                                    <div className="p-5 bg-gray-50/70 rounded-xl border border-gray-100">
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> Thời gian
                                        </h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Thời gian làm bài</label>
                                                <div className="relative">
                                                    <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow pr-16" />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">phút</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Thời gian giao đề</label>
                                                <div className="grid sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Từ</p>
                                                        <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Đến</p>
                                                        <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Số lượt làm bài tối đa</label>
                                                <p className="text-xs text-gray-500 mb-1">Nhập 0 nếu muốn cho phép làm bài không giới hạn</p>
                                                <div className="relative">
                                                    <input type="number" min="0" value={attemptLimit} onChange={(e) => setAttemptLimit(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow pr-16" />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">lượt</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* NHÓM 2: BẢO MẬT */}
                                    <div className="p-5 bg-gray-50/70 rounded-xl border border-gray-100">
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Shield className="w-4 h-4" /> Bảo mật
                                        </h4>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu đề thi</label>
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input type="text" value={examPassword} onChange={(e) => setExamPassword(e.target.value)} placeholder="Bỏ trống nếu không dùng" className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
                                                </div>
                                            </div>
                                            <div className="pt-2">
                                                <ToggleSwitch
                                                    enabled={isAntiCheat}
                                                    onChange={setIsAntiCheat}
                                                    label="Giám sát tự động"
                                                    description="Cảnh báo & ghi nhận khi học sinh thoát khỏi màn hình làm bài."
                                                    icon={Eye}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* NHÓM 3: CẤU HÌNH */}
                                    <div className="p-5 bg-gray-50/70 rounded-xl border border-gray-100">
                                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Shuffle className="w-4 h-4" /> Cấu hình
                                        </h4>
                                        <div className="divide-y divide-gray-100">
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
                                        </div>
                                    </div>

                                    {/* NÚT XUẤT BẢN */}
                                    <button onClick={handleSaveExam} disabled={isSubmitting} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isSubmitting ? "ĐANG LƯU..." : `XUẤT BẢN ĐỀ THI (${questions.length} câu)`}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Đề thi gần đây */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tighter">Đề thi gần đây</h3>
                                <Link to="/teacher/exams" className="text-blue-600 text-xs font-bold hover:underline">XEM TẤT CẢ</Link>
                            </div>
                            <div className="space-y-4">
                                {examsList.map((exam) => (
                                    <div key={exam.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                        <h4 className="font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">{exam.title}</h4>
                                        <div className="flex gap-4 text-[11px] text-gray-400 font-bold mb-4">
                                            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {exam.questions?.length || 0} câu</span>
                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.duration}p</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link to={`/teacher/exam/${exam.id}/submissions`} className="flex-1 py-2 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg flex items-center justify-center gap-1 hover:bg-blue-100 transition-colors uppercase"><BarChart3 className="w-3 h-3" /> Thống kê</Link>
                                            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/student/exam/${exam.id}`); alert("Copy link bài thi!"); }} className="flex-1 py-2 bg-gray-50 text-gray-600 text-[10px] font-black rounded-lg flex items-center justify-center gap-1 hover:bg-gray-100 transition-colors uppercase"><Copy className="w-3 h-3" /> Link</button>
                                            <button onClick={() => handleDeleteExam(exam.id)} className="w-10 py-2 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors" title="Xóa đề thi">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}