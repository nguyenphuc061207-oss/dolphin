import React from 'react';
import { cn } from '../../lib/utils';
import DolphinAvatar from './DolphinAvatar';
import RichTextRenderer from '../RichTextRenderer';

const formatText = (text) => {
  if (!text) return text;
  let res = text.replace(/\\\((.*?)\\\)/gs, '$$$1$$');
  res = res.replace(/\\\[(.*?)\\\]/gs, '$$$$$1$$$$');
  res = res.replace(/\*\*(.*?)\*\*/g, '$1');
  return res;
};

export default function MessageBubble({ message }) {
  const isUser = message.sender === 'user';

  return (
    <div 
      className={cn(
        "flex gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300 w-full group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* AI Avatar on left */}
      {!isUser && (
        <div className="mt-1 flex-shrink-0">
          <DolphinAvatar size="sm" />
        </div>
      )}

      {/* Bubble Container */}
      <div className={cn("flex flex-col max-w-[82%]", isUser ? "items-end" : "items-start")}>
        <div 
          className={cn(
            "px-4.5 py-3 text-[14px] leading-relaxed shadow-sm transition-all duration-200",
            isUser 
              ? "bg-gray-100/90 text-gray-800 rounded-[22px] rounded-tr-sm border border-gray-200/30" 
              : "bg-white text-gray-800 border border-blue-50 rounded-[22px] rounded-tl-sm backdrop-blur-sm shadow-[0_3px_14px_rgba(37,99,235,0.02)]"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap font-normal">{message.text}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 [&_p]:leading-relaxed prose-a:text-blue-600 font-normal">
              <RichTextRenderer content={formatText(message.text)} mathDict={{}} />
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        {message.time && (
          <span className={cn(
            "text-[10px] text-gray-400 mt-1.5 px-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-semibold tracking-wider",
            isUser ? "text-right" : "text-left"
          )}>
            {message.time}
          </span>
        )}
      </div>
    </div>
  );
}
