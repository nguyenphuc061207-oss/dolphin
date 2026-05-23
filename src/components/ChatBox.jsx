import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Minus, Loader2, Sparkles, HelpCircle, Zap } from 'lucide-react';
import { askGemini } from '../utils/aiService';
import RichTextRenderer from './RichTextRenderer';

const SUGGESTED_QUESTIONS = [
  { icon: '📝', text: 'Tạo đề thi thế nào?' },
  { icon: '🎓', text: 'Làm sao để vào thi?' },
  { icon: '🛡️', text: 'Anti-cheat là gì?' },
  { icon: '👥', text: 'Cách kết bạn trên Dolphin?' },
];

export default function ChatBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
    if (typeof window !== 'undefined' && window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      setTimeout(() => {
        window.MathJax.typesetPromise().catch(e => console.warn(e));
      }, 50);
    }
  }, [messages, isOpen, isMinimized]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const formatText = (text) => {
    if (!text) return text;
    let res = text.replace(/\\\((.*?)\\\)/gs, '$$$1$$');
    res = res.replace(/\\\[(.*?)\\\]/gs, '$$$$$1$$$$');
    res = res.replace(/\*\*(.*?)\*\*/g, '$1');
    return res;
  };

  const getTimestamp = () => {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage = { sender: 'user', text: messageText, time: getTimestamp() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askGemini(newMessages);
      setMessages(prev => [...prev, { sender: 'ai', text: response, time: getTimestamp() }]);
    } catch (error) {
      console.error("Gemini API Error:", error);
      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: `Xin lỗi, mình gặp sự cố kỹ thuật. Bạn thử lại sau hoặc liên hệ Zalo 0564213425 nhé!`,
        time: getTimestamp()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
  };

  // ── Nút nổi (FAB) ──
  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="fixed bottom-6 left-6 z-[100] flex items-center gap-2.5 pl-4 pr-5 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white rounded-full shadow-2xl hover:shadow-indigo-500/40 hover:scale-[1.03] active:scale-95 transition-all duration-300 group"
        style={{ boxShadow: '0 8px 32px rgba(79, 70, 229, 0.35)' }}
      >
        <div className="relative">
          <Sparkles className="w-5 h-5" />
          <span className="absolute -top-1.5 -right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
          </span>
        </div>
        <span className="text-sm font-semibold tracking-wide">Hỏi Dolphin AI</span>
      </button>
    );
  }

  // ── Giao diện ChatBox ──
  return (
    <div 
      className={`fixed z-[100] left-6 bottom-6 flex flex-col bg-white rounded-2xl border border-gray-200/80 transition-all duration-300 ease-out ${
        isClosing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
      } ${isMinimized ? 'w-72 h-[52px]' : 'w-[360px] md:w-[400px] h-[560px]'}`}
      style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.03)' }}
    >
      {/* ── Header ── */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white rounded-t-2xl cursor-pointer shrink-0 select-none"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <Bot className="w-4.5 h-4.5" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-indigo-600"></span>
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Trợ lý Dolphin</p>
            <p className="text-[10px] text-white/70 font-medium leading-tight">
              {isLoading ? 'Đang trả lời...' : 'Trực tuyến'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50/80 to-white">
            
            {/* Welcome Card (chỉ hiện khi chưa có tin nhắn) */}
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center text-center pt-4 pb-2 animate-in fade-in slide-in-from-bottom-3 duration-500">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">Xin chào! 👋</h3>
                <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed mb-5">
                  Mình là Trợ lý AI của Dolphin. Hãy hỏi mình bất cứ điều gì về hệ thống hoặc bài học nhé!
                </p>
                
                {/* Suggested Questions */}
                <div className="w-full space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-left px-1">Gợi ý cho bạn</p>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q.text)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-white border border-gray-200/80 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all duration-200 group"
                    >
                      <span className="text-base shrink-0">{q.icon}</span>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700 transition-colors">{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* AI Avatar */}
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                <div className="flex flex-col max-w-[80%]">
                  <div 
                    className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-md shadow-sm shadow-blue-500/10' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {msg.sender === 'ai' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 [&_p]:leading-relaxed">
                        <RichTextRenderer content={formatText(msg.text)} mathDict={{}} />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                  {msg.time && (
                    <span className={`text-[10px] text-gray-400 mt-1 ${msg.sender === 'user' ? 'text-right' : 'text-left'} px-1`}>
                      {msg.time}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2 animate-in fade-in duration-300">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Footer ── */}
          <div className="p-3 bg-white border-t border-gray-100 rounded-b-2xl shrink-0">
            <div className="flex items-end gap-2 bg-gray-50/80 rounded-xl border border-gray-200 p-1 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập tin nhắn..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none px-3 py-2 text-[13px] text-gray-700 placeholder-gray-400 outline-none leading-relaxed"
                rows={1}
                style={{ minHeight: '24px', maxHeight: '120px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 shrink-0 mb-0.5 mr-0.5 active:scale-90 shadow-sm disabled:shadow-none"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Zap className="w-3 h-3 text-gray-300" />
              <p className="text-[10px] text-gray-400 font-medium">
                Gemini AI · Dolphin Platform
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
