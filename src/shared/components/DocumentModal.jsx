import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function DocumentModal({ isOpen, onClose, title, content }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
    const previousOverflow = document.body.style.overflow;
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);
  return <dialog ref={dialogRef} className="document-dialog" aria-labelledby="document-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if(e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><div className="document-dialog-layout"><header><h2 id="document-title">{title}</h2><button onClick={onClose} aria-label="Đóng tài liệu"><X size={22} /></button></header><div className="document-dialog-content">{content}</div><footer><button className="button-primary" onClick={onClose}>Đóng tài liệu</button></footer></div></dialog>;
}