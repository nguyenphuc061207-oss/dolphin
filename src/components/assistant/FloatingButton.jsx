import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DolphinAvatar from './DolphinAvatar';
import { cn } from '../../lib/utils';

// Sub-component: Floating Glow behind mascot
function FloatingGlow({ isHovered }) {
  return (
    <div 
      className={cn(
        "absolute -inset-2 rounded-full blur-xl bg-gradient-to-r from-blue-400 to-cyan-400 pointer-events-none transition-all duration-500",
        isHovered ? "opacity-50 scale-110" : "opacity-25 scale-100"
      )}
    />
  );
}

export default function FloatingButton({ onClick, isOpen, isHovered, setIsHovered }) {
  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 40 }}
          whileHover={{ y: -4, scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          onClick={onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "fixed bottom-6 right-6 z-[100] flex items-center justify-center",
            "w-16 h-16 sm:w-20 sm:h-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl",
            "border border-white/30 dark:border-slate-800/40 rounded-full",
            "shadow-[0_16px_35px_-8px_rgba(37,99,235,0.18),_0_0_0_1px_rgba(37,99,235,0.03)]",
            "hover:shadow-[0_20px_45px_-4px_rgba(37,99,235,0.3)] hover:border-blue-200 dark:hover:border-slate-700/60",
            "transition-colors duration-300 group cursor-pointer overflow-visible"
          )}
        >
          {/* Background glow pattern */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-50/40 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {/* Mascot Section with Glow behind */}
          <div className="relative w-full h-full flex items-center justify-center z-20">
            <FloatingGlow isHovered={isHovered} />
            
            {/* Mascot Avatar - pops out from the circular container */}
            <motion.div
              animate={isHovered ? { 
                y: [0, -6, 2, -2, 0],
                scale: 1.08
              } : { 
                y: 0,
                scale: 1
              }}
              transition={isHovered ? { 
                duration: 0.6,
                ease: "easeInOut"
              } : { 
                duration: 0.3 
              }}
              className="relative -mt-6 sm:-mt-8 z-20"
            >
              <DolphinAvatar size="xl" />
            </motion.div>
          </div>

          {/* Pulsing Outer Border Ring for idle state */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-blue-400/30 dark:border-blue-400/15 pointer-events-none"
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.6, 0.1, 0.6]
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
