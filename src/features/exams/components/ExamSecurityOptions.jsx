import { useId } from 'react';
import { Smartphone } from 'lucide-react';
import ExamSecurityHelp from './ExamSecurityHelp';

const LEVELS = [
    { value: 'off', label: 'Không yêu cầu toàn màn hình' },
    { value: 'normal', label: 'Cấp 1 — Toàn màn hình bình thường' },
    { value: 'strict', label: 'Cấp 2 — Bảo mật cao nhất' },
];

export default function ExamSecurityOptions({ value, onChange, allowMobile = false, onAllowMobileChange, disabled = false, existingExam = false }) {
    const id = useId();
    return (
        <fieldset className="exam-security-options">
            <legend>Toàn màn hình & cấp bảo mật</legend>
            {LEVELS.map(level => (
                <div key={level.value} className="exam-security-option" data-selected={value === level.value}>
                    <input id={`${id}-${level.value}`} name={id} type="radio" value={level.value}
                        checked={value === level.value} disabled={disabled} onChange={() => onChange(level.value)} />
                    {level.value === 'off'
                        ? <label htmlFor={`${id}-${level.value}`}>{level.label}</label>
                        : <ExamSecurityHelp htmlFor={`${id}-${level.value}`} label={level.label} level={level.value} existingExam={existingExam} />}
                    {level.value === 'strict' && value === 'strict' && onAllowMobileChange && (
                        <div className="exam-security-mobile" data-on={allowMobile}>
                            <Smartphone size={18} aria-hidden="true" className="exam-security-mobile-icon" />
                            <div className="exam-security-mobile-text">
                                <span id={`${id}-mobile`}>Cho phép điện thoại và máy tính bảng</span>
                                <small id={`${id}-mobile-desc`}>
                                    {allowMobile
                                        ? 'Đang bật: không kiểm tra màn hình phụ. Rời trang bài thi (kể cả khi có cuộc gọi đến) sẽ khóa bài và ghi nhận vi phạm kèm thời gian rời.'
                                        : 'Đang tắt: học sinh chỉ vào thi được bằng Chrome hoặc Edge trên máy tính.'}
                                </small>
                            </div>
                            <button type="button" role="switch" aria-checked={allowMobile} aria-labelledby={`${id}-mobile`} aria-describedby={`${id}-mobile-desc`}
                                disabled={disabled} onClick={() => onAllowMobileChange(!allowMobile)} className="toggle-control" data-on={allowMobile}>
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </fieldset>
    );
}
