import useAppearanceQuality from '../hooks/useAppearanceQuality';

const OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Màu đơn sắc, không hiệu ứng' },
  { value: 'hd', label: 'HD', description: 'Giao diện hiện tại' },
  { value: 'ultra', label: 'Ultra HD', description: 'Ánh nắng và lá nhẹ khi sáng; sao băng và ánh sáng mờ ảo khi tối. Tắt hiệu ứng trên trang thi.' },
];
export default function QualityToggle() {
  const { quality, setQuality } = useAppearanceQuality();
  return <div className="quality-toggle" role="radiogroup" aria-label="Chất lượng giao diện"
    onKeyDown={event => {
      const index = OPTIONS.findIndex(option => option.value === quality);
      const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
      if (step) {
        event.preventDefault();
        const next = (index + step + OPTIONS.length) % OPTIONS.length;
        setQuality(OPTIONS[next].value);
        event.currentTarget.querySelectorAll('button')[next].focus();
      }
    }}>
    {OPTIONS.map(option => <button key={option.value} type="button" role="radio" aria-checked={quality === option.value}
      tabIndex={quality === option.value ? 0 : -1} title={option.description}
      onClick={() => setQuality(option.value)}>{option.label}</button>)}
  </div>;
}
