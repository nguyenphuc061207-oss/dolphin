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
        const cleanText = opt.replace(/<[^>]+>/g, '').replace(/\$[^\$]+\$/g, '');
        return cleanText.trim().length < 25;
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
    const [manualType, setManualType] = useState("single");
    const [options, setOptions] = useState(["", "", "", ""]);
    const [correctAnswer, setCorrectAnswer] = useState(0);
    const [scoringMethod, setScoringMethod] = useState("linear");
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

    // Safe check and trigger MathJax typesetting when questions or preview list changes
    useEffect(() => {
        if (typeof window !== "undefined" && window.MathJax && typeof window.MathJax.typesetPromise === "function") {
            window.MathJax.typesetPromise().catch((err) => console.warn("MathJax typeset error:", err));
        }
    }, [questions, previewQuestions]);

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
        if (!currentQText.trim()) {
            return alert("Vui lòng nhập nội dung câu hỏi!");
        }
        if (manualType !== 'essay' && options.some(opt => !opt.trim())) {
            return alert("Vui lòng điền đầy đủ nội dung cho các đáp án!");
        }
        if (manualType === 'multiple' && (!Array.isArray(correctAnswer) || correctAnswer.length === 0)) {
            return alert("Vui lòng chọn ít nhất một đáp án đúng!");
        }

        setQuestions([
            ...questions,
            {
                content: currentQText,
                options: manualType === 'essay' ? [] : options,
                correctAnswer: correctAnswer,
                type: manualType,
                ...(manualType === 'multi_true_false' && { scoringMethod })
            }
        ]);

        // Reset form
        setCurrentQText("");
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

        const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

        // ── OMML → LaTeX (improved) ───────────────────────────────────────────────────
        //
        // Cải tiến so với bản gốc:
        //  • Bảng SYMBOL_MAP 150+ ký tự Unicode → LaTeX (Greek, toán tử, mũi tên, tập hợp…)
        //  • r-node: áp dụng symbol map + xử lý rPr (bold/italic/plain text)
        //  • f-node: kiểu lin (a/b), noBar (\binom), skw (phân số nghiêng)
        //  • rad-node: đọc degHide để bỏ bậc khi ẩn
        //  • sPre: tiền chỉ số/lũy thừa (tensor notation)  {}_{a}^{b}X
        //  • nary: thêm ∮ ∯ ∰ ∐ ⋁ ⋀ ⊔ + đọc limLoc → \limits
        //  • d-node: thêm ⟨⟩ ‖ + đọc sepChr → \middle| cho |…|…|
        //  • func: thêm arcsin/arccos/arctan, sinh/cosh/tanh, limsup/liminf, det/dim/ker…
        //  • acc: thêm grave/acute/ring/dddot/ddddot và thêm ký tự trực tiếp
        //  • limLow/limUpp: fallback \underset/\overset cho biểu thức tổng quát
        //  • borderBox → \boxed{}
        //  • phant → \phantom / \vphantom
        //  • groupChr: thêm ⏞ ⏟ → ← ↔ cho overbrace/arrow
        //  • m-node (matrix): thêm Vmatrix (‖…‖) và matrix (không ngoặc)
        // ─────────────────────────────────────────────────────────────────────────────

        const toLatex = (() => {
        // Namespace constants
        const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

        // ── Utility helpers ──────────────────────────────────────────────────────

        const getMVal = (node) =>
            node.getAttributeNS(NS_M, 'val') ||
            node.getAttribute('m:val') ||
            node.getAttribute('val') ||
            '';

        const firstChild = (node, name) =>
            Array.from(node.childNodes).find((n) => n.localName === name) || null;

        const allChildren = (node, name) =>
            Array.from(node.childNodes).filter((n) => n.localName === name);

        // ── Unicode → LaTeX symbol map ───────────────────────────────────────────

        const SYMBOL_MAP = {
            // ── Greek lowercase ──────────────────────────────────────────────────
            'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma',
            'δ': '\\delta', 'ε': '\\epsilon', 'ζ': '\\zeta',
            'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota',
            'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
            'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi',
            'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau',
            'υ': '\\upsilon', 'φ': '\\phi', 'χ': '\\chi',
            'ψ': '\\psi', 'ω': '\\omega',
            // Variants
            'ϕ': '\\varphi', 'ϵ': '\\varepsilon', 'ϑ': '\\vartheta',
            'ϰ': '\\varkappa', 'ϱ': '\\varrho', 'ς': '\\varsigma',
            'ϖ': '\\varpi',

            // ── Greek uppercase ──────────────────────────────────────────────────
            'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
            'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Υ': '\\Upsilon',
            'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',

            // ── Arithmetic operators ─────────────────────────────────────────────
            '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div',
            '∗': '\\ast', '⋅': '\\cdot', '∘': '\\circ', '∙': '\\bullet',
            '⊕': '\\oplus', '⊗': '\\otimes', '⊘': '\\oslash', '⊙': '\\odot',
            '⊞': '\\boxplus', '⊟': '\\boxminus', '⊠': '\\boxtimes', '⋊': '\\rtimes',
            '⋉': '\\ltimes', '⋋': '\\leftthreetimes', '⋌': '\\rightthreetimes',

            // ── Comparison & relations ───────────────────────────────────────────
            '≠': '\\neq', '≤': '\\leq', '≥': '\\geq',
            '≪': '\\ll', '≫': '\\gg', '≦': '\\leqq', '≧': '\\geqq',
            '≲': '\\lesssim', '≳': '\\gtrsim', '≶': '\\lessgtr', '≷': '\\gtrless',
            '≈': '\\approx', '≅': '\\cong', '≡': '\\equiv', '∼': '\\sim',
            '≃': '\\simeq', '≐': '\\doteq', '≑': '\\doteqdot',
            '≺': '\\prec', '≻': '\\succ', '≼': '\\preceq', '≽': '\\succeq',
            '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq',
            '⊊': '\\subsetneq', '⊋': '\\supsetneq',
            '∈': '\\in', '∉': '\\notin', '∋': '\\ni',
            '∝': '\\propto', '⊥': '\\perp', '∥': '\\parallel', '∦': '\\nparallel',
            '≮': '\\not<', '≯': '\\not>', '≢': '\\not\\equiv',
            '⊄': '\\not\\subset', '⊅': '\\not\\supset',

            // ── Arrows ──────────────────────────────────────────────────────────
            '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
            '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
            '↑': '\\uparrow', '↓': '\\downarrow', '↕': '\\updownarrow',
            '⇑': '\\Uparrow', '⇓': '\\Downarrow', '⇕': '\\Updownarrow',
            '↦': '\\mapsto', '↪': '\\hookrightarrow', '↩': '\\hookleftarrow',
            '↠': '\\twoheadrightarrow', '↞': '\\twoheadleftarrow',
            '⟹': '\\implies', '⟺': '\\iff',
            '⟶': '\\longrightarrow', '⟵': '\\longleftarrow', '⟷': '\\longleftrightarrow',
            '⟼': '\\longmapsto',
            '⇝': '\\rightsquigarrow', '↝': '\\rightsquigarrow',
            '↗': '\\nearrow', '↘': '\\searrow',
            '↙': '\\swarrow', '↖': '\\nwarrow',
            '⇀': '\\rightharpoonup', '↼': '\\leftharpoonup',
            '⇁': '\\rightharpoondown', '↽': '\\leftharpoondown',
            '⇌': '\\rightleftharpoons', '⇋': '\\leftrightharpoons',

            // ── Set & logic ──────────────────────────────────────────────────────
            '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∖': '\\setminus',
            '△': '\\triangle', '▽': '\\triangledown',
            '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
            '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists',
            '⊢': '\\vdash', '⊣': '\\dashv', '⊨': '\\models', '⊩': '\\Vdash',
            '⊻': '\\veebar', '⊼': '\\barwedge', '⊽': '\\barvee',

            // ── Calculus / Analysis ──────────────────────────────────────────────
            '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty',
            '℘': '\\wp', 'ℑ': '\\Im', 'ℜ': '\\Re',
            '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
            '∮': '\\oint', '∯': '\\oiint', '∰': '\\oiiint',
            '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',

            // ── Dots & ellipsis ──────────────────────────────────────────────────
            '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots', '⋰': '\\iddots',
            '…': '\\ldots', '·': '\\cdot',

            // ── Number sets (blackboard bold) ────────────────────────────────────
            'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}',
            'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}', 'ℍ': '\\mathbb{H}',
            'ℙ': '\\mathbb{P}', '𝔽': '\\mathbb{F}',

            // ── Fraktur ──────────────────────────────────────────────────────────
            '𝔄': '\\mathfrak{A}', '𝔅': '\\mathfrak{B}', 'ℭ': '\\mathfrak{C}',
            '𝔊': '\\mathfrak{G}', '𝔏': '\\mathfrak{L}', '𝔐': '\\mathfrak{M}',
            '𝔑': '\\mathfrak{N}', '𝔓': '\\mathfrak{P}', '𝔔': '\\mathfrak{Q}',
            '𝔖': '\\mathfrak{S}', '𝔗': '\\mathfrak{T}', '𝔘': '\\mathfrak{U}',
            '𝔙': '\\mathfrak{V}', '𝔚': '\\mathfrak{W}', '𝔛': '\\mathfrak{X}',
            '𝔜': '\\mathfrak{Y}', 'ℨ': '\\mathfrak{Z}',

            // ── Geometry / misc ──────────────────────────────────────────────────
            '∠': '\\angle', '∡': '\\measuredangle', '∢': '\\sphericalangle',
            '√': '\\sqrt', '∴': '\\therefore', '∵': '\\because',
            '†': '\\dagger', '‡': '\\ddagger', '|': '|',
            'ℓ': '\\ell', '℧': '\\mho',
            '°': '^{\\circ}', '′': "'", '″': "''", '‴': "'''",

            // ── Fence characters ─────────────────────────────────────────────────
            '⟨': '\\langle', '⟩': '\\rangle',
            '⌈': '\\lceil', '⌉': '\\rceil',
            '⌊': '\\lfloor', '⌋': '\\rfloor',

            // ── Special symbols ──────────────────────────────────────────────────
            '♦': '\\diamond', '♠': '\\spadesuit', '♥': '\\heartsuit', '♣': '\\clubsuit',
            '★': '\\bigstar', '☆': '\\star',
            '©': '\\copyright', '®': '\\circledR', '™': '\\text{\\texttrademark}',
            'Å': '\\text{\r\nÅ}',
        };

        /**
         * Chuyển một chuỗi Unicode thành LaTeX bằng cách thay thế từng ký tự.
         * Ký tự không có trong map thì giữ nguyên.
         */
        const applySymbolMap = (str) =>
            [...str].map((ch) => SYMBOL_MAP[ch] ?? ch).join('');

        // ── Kiểu rPr (math run properties) ──────────────────────────────────────
        const getRPrStyle = (rPr) => {
            if (!rPr) return null;
            // m:sty val: p=plain text, b=bold, i=italic, bi=bold-italic
            const sty = firstChild(rPr, 'sty');
            if (sty) return getMVal(sty); // 'p' | 'b' | 'i' | 'bi'
            if (firstChild(rPr, 'b')) return 'b';
            if (firstChild(rPr, 'i')) return 'i';
            return null;
        };

        // ── Core converter ───────────────────────────────────────────────────────

        const toLatex = (node) => {
            if (!node || node.nodeType === 3) return '';
            const local = node.localName;
            if (!local) return '';

            const kids = () => Array.from(node.childNodes).map(toLatex).join('');
            const childOf = (n) => (n ? Array.from(n.childNodes).map(toLatex).join('') : '');

            switch (local) {

                // ── Outer wrappers ───────────────────────────────────────────────

                case 'oMathPara':
                    // Block display: wrap each oMath as $$...$$
                    return allChildren(node, 'oMath')
                        .map((n) => `$$${Array.from(n.childNodes).map(toLatex).join('')}$$`)
                        .join('\n');

                case 'oMath':
                    return `$${kids()}$`;

                // ── Text run ─────────────────────────────────────────────────────

                case 'r': {
                    // m:rPr → styling; m:t → actual text content
                    const t = firstChild(node, 't');
                    if (!t) return '';

                    const raw = t.textContent;
                    const mapped = applySymbolMap(raw);

                    const rPr = firstChild(node, 'rPr');
                    const style = getRPrStyle(rPr);

                    if (style === 'bi') return `\\boldsymbol{${mapped}}`;
                    if (style === 'b') return `\\mathbf{${mapped}}`;
                    if (style === 'p') return `\\text{${mapped}}`; // plain/roman text
                    // 'i' (italic) is the default math style — no wrapper needed
                    return mapped;
                }

                // ── Fraction ─────────────────────────────────────────────────────

                case 'f': {
                    const fPr = firstChild(node, 'fPr');
                    const typeNode = fPr ? firstChild(fPr, 'type') : null;
                    const typeVal = typeNode ? getMVal(typeNode) : 'bar';
                    const num = firstChild(node, 'num');
                    const den = firstChild(node, 'den');
                    switch (typeVal) {
                        case 'lin': return `${childOf(num)}/${childOf(den)}`;
                        case 'noBar': return `\\binom{${childOf(num)}}{${childOf(den)}}`;
                        case 'skw': return `{}^{${childOf(num)}}\\!\\!/\\!{}_{${childOf(den)}}`;
                        default: return `\\frac{${childOf(num)}}{${childOf(den)}}`;
                    }
                }

                // ── Radical ──────────────────────────────────────────────────────

                case 'rad': {
                    const radPr = firstChild(node, 'radPr');
                    const degHideNode = radPr ? firstChild(radPr, 'degHide') : null;
                    const isHidden = degHideNode
                        ? (getMVal(degHideNode) === '1' || degHideNode.getAttribute('m:val') === '1')
                        : false;
                    const degNode = firstChild(node, 'deg');
                    const eNode = firstChild(node, 'e');
                    const degTex = (!isHidden && degNode) ? childOf(degNode).trim() : '';
                    const eTex = childOf(eNode);
                    return (degTex && degTex !== '2')
                        ? `\\sqrt[${degTex}]{${eTex}}`
                        : `\\sqrt{${eTex}}`;
                }

                // ── Super / Sub / Both ───────────────────────────────────────────

                case 'sSup': {
                    const e = firstChild(node, 'e');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}^{${childOf(sup)}}`;
                }

                case 'sSub': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    return `${childOf(e)}_{${childOf(sub)}}`;
                }

                case 'sSubSup': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    return `${childOf(e)}_{${childOf(sub)}}^{${childOf(sup)}}`;
                }

                // ── Pre-subscript/superscript (tensor notation) ──────────────────
                // e.g. {}_{i}^{j} T  →  \tensor notation

                case 'sPre': {
                    const e = firstChild(node, 'e');
                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    const subTex = sub ? childOf(sub) : '';
                    const supTex = sup ? childOf(sup) : '';
                    // Emit both pre-sub and pre-sup only if present
                    const preSub = subTex ? `{}_{${subTex}}` : '{}';
                    const preSup = supTex ? `^{${supTex}}` : '';
                    return `${preSub}${preSup}${childOf(e)}`;
                }

                // ── N-ary operators (∑ ∏ ∫ ∮ …) ─────────────────────────────────

                case 'nary': {
                    const pr = firstChild(node, 'naryPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const chrVal = chrNode ? getMVal(chrNode) : '∫';
                    const limLocNode = pr ? firstChild(pr, 'limLoc') : null;
                    const limLoc = limLocNode ? getMVal(limLocNode) : 'subSup';
                    const subHideNode = pr ? firstChild(pr, 'subHide') : null;
                    const supHideNode = pr ? firstChild(pr, 'supHide') : null;
                    const subHide = subHideNode
                        ? (getMVal(subHideNode) === '1' || subHideNode.getAttribute('m:val') === '1')
                        : false;
                    const supHide = supHideNode
                        ? (getMVal(supHideNode) === '1' || supHideNode.getAttribute('m:val') === '1')
                        : false;

                    const OP_MAP = {
                        '∑': '\\sum', '\u2211': '\\sum',
                        '∏': '\\prod', '\u220F': '\\prod',
                        '∐': '\\coprod', '\u2210': '\\coprod',
                        '∫': '\\int', '\u222B': '\\int',
                        '∬': '\\iint', '\u222C': '\\iint',
                        '∭': '\\iiint', '\u222D': '\\iiint',
                        '∮': '\\oint', '\u222E': '\\oint',
                        '∯': '\\oiint', '\u222F': '\\oiint',
                        '∰': '\\oiiint', '\u2230': '\\oiiint',
                        '⋃': '\\bigcup', '\u22C3': '\\bigcup',
                        '⋂': '\\bigcap', '\u22C2': '\\bigcap',
                        '⊕': '\\bigoplus',
                        '⊗': '\\bigotimes',
                        '⊙': '\\bigodot',
                        '⊎': '\\biguplus',
                        '⋁': '\\bigvee', '\u22C1': '\\bigvee',
                        '⋀': '\\bigwedge', '\u22C0': '\\bigwedge',
                        '⊔': '\\bigsqcup',
                    };

                    const op = OP_MAP[chrVal]
                        ?? SYMBOL_MAP[chrVal]
                        ?? chrVal
                        ?? '\\int';

                    // \limits forces limits above/below (display-style) rather than inline
                    const limitsFlag = limLoc === 'undOvr' ? '\\limits' : '';

                    const sub = firstChild(node, 'sub');
                    const sup = firstChild(node, 'sup');
                    const e = firstChild(node, 'e');

                    return (
                        op +
                        limitsFlag +
                        (!subHide && sub ? `_{${childOf(sub)}}` : '') +
                        (!supHide && sup ? `^{${childOf(sup)}}` : '') +
                        (e ? ` ${childOf(e)}` : '')
                    );
                }

                // ── Delimiter (brackets, norms, …) ───────────────────────────────

                case 'd': {
                    const pr = firstChild(node, 'dPr');
                    let beg = '(', end = ')';
                    if (pr) {
                        const b = firstChild(pr, 'begChr');
                        const en = firstChild(pr, 'endChr');
                        if (b) beg = getMVal(b) || '(';
                        if (en) end = getMVal(en) || ')';
                    }

                    // Separator character between multiple elements (e.g. | in ⟨…|…⟩)
                    const sepNode = pr ? firstChild(pr, 'sepChr') : null;
                    const sepChr = sepNode ? getMVal(sepNode) : ',';
                    const sepTex = sepChr === '|' ? ' \\middle| ' : `, `;

                    // Plain absolute value: empty beg + end means ||
                    if (beg === '' && end === '') { beg = '|'; end = '|'; }

                    const BEG_MAP = {
                        '(': '\\left(', '[': '\\left[',
                        '{': '\\left\\{', '|': '\\left|',
                        '‖': '\\left\\|', '⌈': '\\left\\lceil',
                        '⌊': '\\left\\lfloor', '⟨': '\\left\\langle',
                        '⌜': '\\left\\ulcorner', '⌞': '\\left\\llcorner',
                    };
                    const END_MAP = {
                        ')': '\\right)', ']': '\\right]',
                        '}': '\\right\\}', '|': '\\right|',
                        '‖': '\\right\\|', '⌉': '\\right\\rceil',
                        '⌋': '\\right\\rfloor', '⟩': '\\right\\rangle',
                        '⌝': '\\right\\urcorner', '⌟': '\\right\\lrcorner',
                    };

                    const lBeg = BEG_MAP[beg] ?? `\\left${beg}`;
                    const lEnd = END_MAP[end] ?? `\\right${end}`;

                    const parts = allChildren(node, 'e').map(childOf);
                    return `${lBeg}${parts.join(sepTex)}${lEnd}`;
                }

                // ── Function (sin, cos, lim, …) ──────────────────────────────────

                case 'func': {
                    const fName = firstChild(node, 'fName');
                    const e = firstChild(node, 'e');

                    // All standard LaTeX function names (no \ prefix in source text)
                    const FUNC_NAMES = new Set([
                        'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
                        'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
                        'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
                        'ln', 'log', 'lg', 'exp',
                        'lim', 'limsup', 'liminf', 'varlimsup', 'varliminf',
                        'max', 'min', 'sup', 'inf', 'arg',
                        'gcd', 'lcm', 'det', 'dim', 'ker', 'deg',
                        'hom', 'Hom', 'Pr', 'tr', 'rank',
                    ]);

                    const nameRaw = childOf(fName).trim();
                    // Strip leading backslash if already present
                    const nameClean = nameRaw.replace(/^\\/, '');
                    const nameTex = FUNC_NAMES.has(nameClean)
                        ? `\\${nameClean}`
                        : nameRaw; // keep as-is (could be a letter or custom operator)

                    return `${nameTex}\\left(${childOf(e)}\\right)`;
                }

                // ── Accent (hat, tilde, vec, …) ──────────────────────────────────

                case 'acc': {
                    const pr = firstChild(node, 'accPr');
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const accent = chrNode ? getMVal(chrNode) : '\u0302';

                    const ACC_MAP = {
                        '\u0300': `\\grave{${eTex}}`,        // grave  `
                        '\u0301': `\\acute{${eTex}}`,        // acute  ´
                        '\u0302': `\\hat{${eTex}}`,          // circumflex ^
                        '\u0303': `\\tilde{${eTex}}`,        // tilde  ~
                        '\u0304': `\\bar{${eTex}}`,          // macron ‾
                        '\u0305': `\\bar{${eTex}}`,          // overline
                        '\u0306': `\\breve{${eTex}}`,        // breve  ˘
                        '\u0307': `\\dot{${eTex}}`,          // dot above ·
                        '\u0308': `\\ddot{${eTex}}`,         // diaeresis ¨
                        '\u030A': `\\mathring{${eTex}}`,     // ring above °
                        '\u030B': `\\H{${eTex}}`,            // double acute
                        '\u030C': `\\check{${eTex}}`,        // caron ˇ
                        '\u0323': `\\underdot{${eTex}}`,     // dot below
                        '\u20D7': `\\vec{${eTex}}`,          // combining right arrow
                        '\u2192': `\\vec{${eTex}}`,          // →
                        '\u20D1': `\\vec{${eTex}}`,          // combining right harpoon
                        '\u20DB': `\\dddot{${eTex}}`,        // triple dot
                        '\u20DC': `\\ddddot{${eTex}}`,       // quadruple dot
                        '^': `\\hat{${eTex}}`,
                        '~': `\\tilde{${eTex}}`,
                        '-': `\\bar{${eTex}}`,
                    };
                    return ACC_MAP[accent] ?? `\\hat{${eTex}}`;
                }

                // ── Over/underline ───────────────────────────────────────────────

                case 'bar': {
                    const pr = firstChild(node, 'barPr');
                    const pos = pr ? firstChild(pr, 'pos') : null;
                    const posV = pos ? getMVal(pos) : 'top';
                    const e = firstChild(node, 'e');
                    return posV === 'bot'
                        ? `\\underline{${childOf(e)}}`
                        : `\\overline{${childOf(e)}}`;
                }

                // ── Limit below/above ────────────────────────────────────────────

                case 'limLow': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    const eTex = childOf(e).trim();
                    const limTex = childOf(lim);
                    // Named operators: use subscript directly; otherwise \underset
                    return /^\\?(lim|max|min|sup|inf|limsup|liminf|varlimsup|varliminf)/.test(eTex)
                        ? `${eTex}_{${limTex}}`
                        : `\\underset{${limTex}}{${eTex}}`;
                }

                case 'limUpp': {
                    const e = firstChild(node, 'e');
                    const lim = firstChild(node, 'lim');
                    const eTex = childOf(e).trim();
                    const limTex = childOf(lim);
                    return /^\\?(lim|max|min|sup|inf)/.test(eTex)
                        ? `${eTex}^{${limTex}}`
                        : `\\overset{${limTex}}{${eTex}}`;
                }

                // ── Matrix ───────────────────────────────────────────────────────

                case 'm': {
                    const pr = firstChild(node, 'mPr');
                    const begNode = pr ? firstChild(pr, 'begChr') : null;
                    const begChr = begNode ? getMVal(begNode) : '(';

                    // Map opening delimiter → LaTeX environment name
                    const ENV_MAP = {
                        '(': 'pmatrix',   // ( … )
                        '[': 'bmatrix',   // [ … ]
                        '{': 'Bmatrix',   // { … }
                        '|': 'vmatrix',   // | … |
                        '‖': 'Vmatrix',   // ‖ … ‖
                        '': 'matrix',    // no delimiters
                    };
                    const env = ENV_MAP[begChr] ?? 'pmatrix';

                    const rows = allChildren(node, 'mr').map((row) =>
                        allChildren(row, 'e').map(childOf).join(' & ')
                    );
                    return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`;
                }

                // ── Equation array (cases, piecewise) ────────────────────────────

                case 'eqArr': {
                    const rows = allChildren(node, 'e').map(childOf);
                    return `\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`;
                }

                // ── Group characters (overbrace, underbrace, arc, arrow) ─────────

                case 'groupChr': {
                    const pr = firstChild(node, 'groupChrPr');
                    const chrNode = pr ? firstChild(pr, 'chr') : null;
                    const posNode = pr ? firstChild(pr, 'pos') : null;
                    const vertNode = pr ? firstChild(pr, 'vertJc') : null;
                    const chr = chrNode ? getMVal(chrNode) : '';
                    const posV = posNode ? getMVal(posNode) : 'bot';
                    const vertJc = vertNode ? getMVal(vertNode) : 'top';
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);

                    // Arc, arrows, overbrace/underbrace
                    const CHR_MAP = {
                        '⌣': `\\overset{\\frown}{${eTex}}`,
                        '\u2322': `\\overset{\\frown}{${eTex}}`,
                        '⌢': `\\overset{\\frown}{${eTex}}`,
                        '⏞': `\\overbrace{${eTex}}`,
                        '⏟': `\\underbrace{${eTex}}`,
                        '⏜': `\\overset{\\frown}{${eTex}}`,
                        '⏝': `\\underset{\\smile}{${eTex}}`,
                        '→': `\\overrightarrow{${eTex}}`,
                        '←': `\\overleftarrow{${eTex}}`,
                        '↔': `\\overleftrightarrow{${eTex}}`,
                        '⇒': `\\overrightarrow{${eTex}}`,
                    };

                    if (CHR_MAP[chr]) return CHR_MAP[chr];

                    // Fallback: position determines over vs under
                    if (posV === 'top' || vertJc === 'top') return `\\overbrace{${eTex}}`;
                    return `\\underbrace{${eTex}}`;
                }

                // ── Box with border ──────────────────────────────────────────────

                case 'borderBox': {
                    const e = firstChild(node, 'e');
                    return `\\boxed{${childOf(e)}}`;
                }

                // ── Phantom ──────────────────────────────────────────────────────

                case 'phant': {
                    const pr = firstChild(node, 'phantPr');
                    const zeroW = pr ? firstChild(pr, 'zeroWid') : null;
                    const zeroH = pr ? firstChild(pr, 'zeroAsc') : null;
                    const showNode = pr ? firstChild(pr, 'show') : null;
                    const e = firstChild(node, 'e');
                    const eTex = childOf(e);

                    const isZeroW = zeroW && (getMVal(zeroW) === '1');
                    const isZeroH = zeroH && (getMVal(zeroH) === '1');
                    const isHidden = showNode && (getMVal(showNode) === '0');

                    if (isHidden) return `\\phantom{${eTex}}`;
                    if (isZeroW && isZeroH) return `\\phantom{${eTex}}`;
                    if (isZeroW) return `\\hphantom{${eTex}}`;
                    if (isZeroH) return `\\vphantom{${eTex}}`;
                    return `\\vphantom{${eTex}}`;
                }

                // ── Stacked elements (overset / underset via ctrl chars) ──────────

                case 'ctrl': // rare — pass through children
                    return kids();

                // ── Pass-through containers ──────────────────────────────────────

                case 'num': case 'den':
                case 'e': case 'sup': case 'sub':
                case 'fName': case 'lim': case 'deg':
                case 'mr': case 'sPrePr':
                    return kids();

                default:
                    return kids();
            }
        };

        return toLatex;
    })();
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
        let correctAnswer = q.correctAnswer;
        if (newType === 'essay') {
            correctAnswer = '';
        } else if (newType === 'multi_true_false') {
            // Convert to an array of booleans matching the options length
            correctAnswer = Array.isArray(q.correctAnswer)
                ? q.correctAnswer.map(v => typeof v === 'boolean' ? v : true)
                : Array(q.options.length || 4).fill(true);
        } else if (newType === 'multiple') {
            // Convert to array of numbers
            correctAnswer = Array.isArray(q.correctAnswer)
                ? q.correctAnswer.filter(v => typeof v === 'number')
                : (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? [q.correctAnswer] : [0]);
        } else {
            // single / true_false
            correctAnswer = Array.isArray(q.correctAnswer)
                ? (typeof q.correctAnswer[0] === 'number' ? q.correctAnswer[0] : 0)
                : (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? q.correctAnswer : 0);
        }
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

                                        <textarea value={currentQText} onChange={(e) => setCurrentQText(e.target.value)} rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none focus:ring-2 focus:ring-blue-500 transition-shadow" placeholder="Nhập nội dung câu hỏi..." />

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
                                                                <input
                                                                    type="text"
                                                                    value={option}
                                                                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                                                                    disabled={manualType === 'true_false'}
                                                                    placeholder={isMultiTF ? `Ý ${idx + 1}` : `Đáp án ${String.fromCharCode(65 + idx)}`}
                                                                    className="bg-transparent outline-none w-full font-semibold text-gray-800 text-sm placeholder-gray-400"
                                                                />
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

                                        <button onClick={handleAddQuestion} className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md">
                                            <Plus className="w-5 h-5" /> THÊM VÀO ĐỀ THI
                                        </button>
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
                                                                            ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(oi)
                                                                            : oi === q.correctAnswer;
                                                                        if (isCorrect) {
                                                                            itemBg = 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold';
                                                                        }
                                                                    }
                                                                    return (
                                                                        <div key={oi} className={`text-xs px-3 py-2 rounded-lg border font-medium ${itemBg} flex items-center justify-between gap-2`}>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="font-black mr-1">{String.fromCharCode(65 + oi)}.</span>
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