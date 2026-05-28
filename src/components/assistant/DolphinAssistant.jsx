import React, { useState } from 'react';
import FloatingButton from './FloatingButton';
import ChatPanel from './ChatPanel';
import { askGemini } from '../../utils/aiService';

export default function DolphinAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getTimestamp = () => {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSend = async (forcedInput = null) => {
    const textToSend = forcedInput || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage = { sender: 'user', text: textToSend, time: getTimestamp() };
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

  return (
    <>
      <FloatingButton 
        isOpen={isOpen} 
        onClick={() => setIsOpen(true)}
        isHovered={isHovered}
        setIsHovered={setIsHovered}
      />
      
      <ChatPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        isLoading={isLoading}
      />
    </>
  );
}
