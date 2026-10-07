import { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';

export default function ExamSecurityHelp({ htmlFor, label, level, existingExam = false }) {
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const container = useRef(null);
    const helpId = useId();

    const close = () => { setOpen(false); setPinned(false); };

    useEffect(() => {
        if (!open) return;
        const dismissOutside = (event) => {
            if (!container.current?.contains(event.target)) { setOpen(false); setPinned(false); }
        };
        const dismissEscape = (event) => {
            if (event.key === 'Escape') { setOpen(false); setPinned(false); event.stopPropagation(); }
        };
        document.addEventListener('pointerdown', dismissOutside);
        document.addEventListener('keydown', dismissEscape);
        return () => {
            document.removeEventListener('pointerdown', dismissOutside);
            document.removeEventListener('keydown', dismissEscape);
        };
    }, [open]);

    return (
        <div className="exam-security-help" ref={container}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => { if (!pinned) setOpen(false); }}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
            <div className="exam-security-help-label">
                <label htmlFor={htmlFor}>{label}</label>
                <button type="button" aria-label={`Chú giải ${label}`} aria-expanded={open}
                    aria-controls={helpId} aria-describedby={open ? helpId : undefined}
                    onFocus={() => setOpen(true)}
                    onClick={() => { setPinned(!pinned); setOpen(!pinned); }}>
                    <CircleHelp size={17} aria-hidden="true" />
                </button>
            </div>
            {open && <div id={helpId} role="tooltip" className="exam-security-help-content">
                <strong>{label}</strong>
                <p>{level === 'normal'
                    ? 'Chỉ yêu cầu mở toàn màn hình lúc bắt đầu. Không kiểm tra màn hình phụ, không giám sát hoặc ghi nhận việc chuyển tab hay thoát toàn màn hình trong lúc làm bài.'
                    : 'Yêu cầu toàn màn hình và chặn màn hình phụ trước khi vào thi. Trong lúc làm bài, hệ thống khóa bài và ghi nhận khi rời tab/cửa sổ, thoát toàn màn hình hoặc kết nối thêm màn hình phụ.'}</p>
                {existingExam && <p>Thay đổi áp dụng khi học sinh tải lại hoặc mở bài thi.</p>}
            </div>}
        </div>
    );
}
