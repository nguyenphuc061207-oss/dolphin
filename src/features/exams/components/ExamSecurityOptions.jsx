import { useId } from 'react';
import ExamSecurityHelp from './ExamSecurityHelp';

const LEVELS = [
    { value: 'off', label: 'Không yêu cầu toàn màn hình' },
    { value: 'normal', label: 'Cấp 1 — Toàn màn hình bình thường' },
    { value: 'strict', label: 'Cấp 2 — Bảo mật cao nhất' },
];

export default function ExamSecurityOptions({ value, onChange, disabled = false, existingExam = false }) {
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
                </div>
            ))}
        </fieldset>
    );
}
