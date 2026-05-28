import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Minus, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import DolphinAvatar from './DolphinAvatar';
import MessageBubble from './MessageBubble';
import WelcomeState from './WelcomeState';
import ThinkingAnimation from './ThinkingAnimation';

export default function ChatPanel({ 
  isOpen, 
  onClose, 
  messages, 
  input, 
  setInput, 
  onSend, 
  isLoading 
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend();
      }
    }
  };

  const panelVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: "spring", stiffness: 350, damping: 28 }
    },
    exit: { 
      opacity: 0, 
      y: 30, 
      scale: 0.95,
      transition: { duration: 0.25, ease: "easeOut" }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn(
          "fixed z-[100] right-6 bottom-6 flex flex-col bg-white/90 backdrop-blur-xl border border-white/20 rounded-3xl overflow-hidden",
          "shadow-[0_20px_50px_-12px_rgba(37,99,235,0.15),_0_0_0_1px_rgba(37,99,235,0.02)]",
          isMinimized ? "w-72 h-[64px]" : "w-[360px] md:w-[410px] h-[610px] max-h-[82vh]",
          "transition-all duration-300 ease-out"
        )}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-blue-50/70 to-cyan-50/70 border-b border-blue-100/30 cursor-pointer shrink-0"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-3">
            <DolphinAvatar size="md" />
            <div className="flex flex-col">
              <span className="font-bold text-[15px] text-gray-800 leading-tight tracking-tight">Dolphin AI</span>
              <span className="text-[11px] text-blue-600 font-semibold leading-tight tracking-wide mt-0.5">
                Trợ lý học tập thông minh
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
              className="p-1.5 hover:bg-blue-100/40 hover:text-blue-600 rounded-xl transition-all text-gray-500 cursor-pointer"
              title={isMinimized ? "Phóng to" : "Thu nhỏ"}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-gray-500 cursor-pointer"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body & Input */}
        {!isMinimized && (
          <>
            {/* Message Area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gradient-to-b from-blue-50/10 via-white to-white scrollbar-thin scrollbar-thumb-gray-200">
              {messages.length === 0 && !isLoading ? (
                <WelcomeState onSuggestionClick={(text) => {
                  onSend(text);
                }} />
              ) : (
                messages.map((msg, idx) => (
                  <MessageBubble key={idx} message={msg} />
                ))
              )}

              {isLoading && <ThinkingAnimation />}
              <div ref={messagesEndRef} className="h-2" />
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-white/70 backdrop-blur-md border-t border-blue-100/20 shrink-0">
              <div className="flex items-end gap-2 bg-gray-50/60 rounded-3xl border border-gray-200/60 p-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 focus-within:bg-white transition-all duration-300 shadow-inner">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Hỏi bài, tạo đề, giải thích kiến thức..."
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none px-3 py-2.5 text-[14px] text-gray-700 placeholder-gray-400 outline-none leading-relaxed"
                  rows={1}
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSend()}
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-2xl transition-all duration-200 shrink-0 mb-0.5 mr-0.5 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 disabled:shadow-none cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
              
              {/* Powered Badge */}
              <div className="flex items-center justify-center gap-1.5 mt-2.5 opacity-50">
                <Zap className="w-3 h-3 text-blue-500 fill-blue-500" />
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  Powered by Dolphin AI
                </p>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
