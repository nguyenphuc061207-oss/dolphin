import { Sun, Moon, Monitor } from 'lucide-react';
import useTheme from '@/shared/hooks/useTheme';

const OPTIONS = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'system', label: 'Tự động', Icon: Monitor },
  { value: 'dark', label: 'Tối', Icon: Moon },
];

/** Segmented control (Apple style): Sáng / Tự động / Tối. */
export default function ThemeToggle({ className = '', showLabels = false }) {
  const { preference, setPreference } = useTheme();

  const onKeyDown = (e) => {
    const i = OPTIONS.findIndex((o) => o.value === preference);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setPreference(OPTIONS[(i + 1) % OPTIONS.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPreference(OPTIONS[(i + OPTIONS.length - 1) % OPTIONS.length].value);
    }
  };

  return (
    <div role="radiogroup" aria-label="Giao diện" className={`theme-toggle ${className}`} onKeyDown={onKeyDown}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            tabIndex={active ? 0 : -1}
            data-active={active}
            onClick={() => setPreference(value)}
          >
            <Icon size={17} aria-hidden="true" />
            {showLabels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
