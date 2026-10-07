import React from 'react';
import { motion } from 'framer-motion';
import DolphinAvatar from './DolphinAvatar';

export default function ThinkingAnimation() {
  return (
    <div className="flex gap-3 items-center animate-in fade-in slide-in-from-bottom-2 duration-300 px-1 py-0.5">
      {/* Dolphin Mascot in active thinking state */}
      <DolphinAvatar size="md" isThinking={true} />
      
      {/* Minimalist thinking bubble containing only typing dots */}
      <div className="rounded-[18px] rounded-tl-sm px-4 py-3 bg-white/90 border border-blue-100/30 shadow-[0_2px_10px_rgba(37,99,235,0.02)] backdrop-blur-sm flex items-center justify-center">
        <div className="flex gap-1.5 items-center h-1.5">
          <motion.div
            className="w-1.5 h-1.5 bg-blue-500 rounded-full"
            animate={{ y: [0, -3.5, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0 }}
          />
          <motion.div
            className="w-1.5 h-1.5 bg-blue-500/80 rounded-full"
            animate={{ y: [0, -3.5, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          />
          <motion.div
            className="w-1.5 h-1.5 bg-blue-500/60 rounded-full"
            animate={{ y: [0, -3.5, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
        </div>
      </div>
    </div>
  );
}
