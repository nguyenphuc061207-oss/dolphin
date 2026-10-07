import { MessageCircle } from 'lucide-react';

export default function FloatingButton({ onClick, isOpen }) {
  if (isOpen) return null;
  return (
    <button className="assistant-launcher" onClick={onClick} aria-label="Mở trợ lý Dolphin AI">
      <MessageCircle size={22} aria-hidden="true" />
      <span>Hỏi Dolphin AI</span>
    </button>
  );
}