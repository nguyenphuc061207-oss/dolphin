import React from 'react';
import { motion } from 'framer-motion';
import DolphinAvatar from './DolphinAvatar';

const PARTICLES = [
  { top: '20%', left: '25%', size: 'w-2.5 h-2.5 bg-blue-400/40', duration: 5, delay: 0 },
  { top: '15%', left: '70%', size: 'w-3.5 h-3.5 bg-cyan-400/30', duration: 7, delay: 1 },
  { top: '60%', left: '15%', size: 'w-2 h-2 bg-blue-300/40', duration: 6, delay: 0.5 },
  { top: '70%', left: '75%', size: 'w-3 h-3 bg-indigo-400/30', duration: 8, delay: 1.5 },
  { top: '45%', left: '85%', size: 'w-1.5 h-1.5 bg-blue-500/50', duration: 4, delay: 2 },
];

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-center p-6 relative overflow-hidden bg-gradient-to-b from-blue-50/10 via-white to-white">
      {/* Background Soft Glows */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <div className="absolute w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse"></div>
        <div className="absolute w-72 h-72 bg-cyan-300 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Floating Particles */}
      {PARTICLES.map((pt, idx) => (
        <motion.div
          key={idx}
          className={`absolute rounded-full ${pt.size} blur-[0.5px] pointer-events-none`}
          style={{ top: pt.top, left: pt.left }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.1, 1]
          }}
          transition={{
            duration: pt.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: pt.delay
          }}
        />
      ))}

      {/* Central Content */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
          <DolphinAvatar size="lg" className="opacity-90" />
        </div>
        
        <p className="text-[14px] text-gray-500 font-bold tracking-wide">
          Chưa có cuộc trò chuyện nào
        </p>
        <p className="text-[11px] text-gray-400 mt-1 font-medium">
          Hãy bắt đầu đặt câu hỏi cho Dolphin AI nhé!
        </p>
      </motion.div>
    </div>
  );
}
