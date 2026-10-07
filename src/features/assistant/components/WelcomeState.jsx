import React from 'react';
import { motion } from 'framer-motion';
import DolphinAvatar from './DolphinAvatar';

const QUICK_ACTIONS = [
  { icon: '📝', title: 'Cách tạo đề thi?', desc: 'Hướng dẫn import từ file Word/Text' },
  { icon: '✍️', title: 'Làm sao để làm bài?', desc: 'Cách học sinh vào phòng thi' },
  { icon: '📊', title: 'Xem điểm ở đâu?', desc: 'Xem kết quả & phân tích phổ điểm' },
  { icon: '👥', title: 'Tính năng Bạn bè là gì?', desc: 'Kết bạn & theo dõi tiến độ học' },
];

export default function WelcomeState({ onSuggestionClick }) {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[480px] px-4 py-6 text-center">
      {/* Central Mascot with gentle float */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: 'spring', 
          stiffness: 260, 
          damping: 20, 
          delay: 0.1 
        }}
        className="mb-5 drop-shadow-xl"
      >
        <DolphinAvatar size="xl" />
      </motion.div>

      {/* Greeting Title */}
      <motion.h3 
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-1"
      >
        Xin chào! 👋
      </motion.h3>
      
      {/* Subtitle description */}
      <motion.p 
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.28, duration: 0.4 }}
        className="text-[13px] text-gray-500 font-medium mb-6 max-w-[280px] leading-relaxed"
      >
        Mình là Dolphin AI — trợ lý thông minh của hệ thống Dolphin. Mình có thể giúp gì cho bạn hôm nay?
      </motion.p>

      {/* Quick Action Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 w-full max-w-[340px]"
      >
        {QUICK_ACTIONS.map((action, idx) => (
          <motion.button
            key={idx}
            variants={itemVariants}
            whileHover={{ 
              y: -4, 
              boxShadow: "0 8px 24px rgba(37,99,235,0.08)",
              borderColor: "#60A5FA"
            }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSuggestionClick(action.title)}
            className="flex flex-col items-start p-3.5 bg-white border border-gray-100/80 rounded-2xl transition-all duration-300 group text-left cursor-pointer"
          >
            <span className="text-lg mb-1.5 group-hover:scale-115 transition-transform duration-300">
              {action.icon}
            </span>
            <span className="text-[12.5px] font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
              {action.title}
            </span>
            <span className="text-[10px] text-gray-400 font-medium mt-0.5 leading-snug">
              {action.desc}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
