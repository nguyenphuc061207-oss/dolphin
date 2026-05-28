import React from 'react';
import { cn } from '../../lib/utils';

export default function DolphinAvatar({ className, size = 'md', isThinking = false }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  return (
    <div className={cn("relative flex items-center justify-center shrink-0", sizeClasses[size], className)}>
      {/* Background soft glow for AI vibe */}
      <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-md animate-pulse"></div>
      
      {/* Refined Vector Chibi Dolphin Mascot (Clean geometry & premium gradients) */}
      <svg 
        viewBox="0 0 100 100" 
        className="w-full h-full object-contain relative z-10 drop-shadow-md overflow-visible"
      >
        <defs>
          {/* Main body blue gradient */}
          <linearGradient id="bodyBlueGrad" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="60%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          
          {/* Soft belly white gradient */}
          <linearGradient id="bellyWhiteGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F1F5F9" />
          </linearGradient>
          
          {/* Headset blue parts */}
          <linearGradient id="headsetBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          
          {/* Inner drop shadow for high depth */}
          <filter id="mascotSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#2563EB" floodOpacity="0.22" />
          </filter>
        </defs>

        <style>{`
          .mascot-head-body {
            animation: mascot-float 3s ease-in-out infinite;
            transform-origin: 50px 50px;
          }
          .mascot-head-body.thinking {
            animation: mascot-float 1.2s ease-in-out infinite;
          }
          .mascot-tail-fin {
            animation: mascot-wag 2.5s ease-in-out infinite;
          }
          .mascot-tail-fin.thinking {
            animation: mascot-wag-fast 0.6s ease-in-out infinite;
          }
          .mascot-left-fin {
            animation: fin-wave 2s ease-in-out infinite;
          }
          .mascot-left-fin.thinking {
            animation: fin-wave 0.8s ease-in-out infinite;
          }
          
          @keyframes mascot-float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3.5px); }
          }
          @keyframes mascot-blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.12); }
          }
          @keyframes mascot-wag {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-5deg); }
          }
          @keyframes mascot-wag-fast {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-12deg); }
          }
          @keyframes fin-wave {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(8deg); }
          }
          @keyframes shadow-scale {
            0%, 100% { transform: scale(1); opacity: 0.08; }
            50% { transform: scale(0.85); opacity: 0.04; }
          }
        `}</style>

        {/* Dynamic Floor Shadow */}
        <ellipse 
          cx="50" 
          cy="92" 
          rx="18" 
          ry="2.5" 
          fill="#2563EB" 
          style={{
            transformOrigin: '50px 92px',
            animation: `shadow-scale ${isThinking ? '1.2s' : '3s'} ease-in-out infinite`
          }}
        />

        {/* Floating Mascot Group */}
        <g className={cn("mascot-head-body", isThinking && "thinking")} filter="url(#mascotSoftShadow)">
          
          {/* Animated Tail Fin */}
          <path 
            className={cn("mascot-tail-fin", isThinking && "thinking")}
            d="M 45 80 C 36 90, 42 98, 58 98 C 64 98, 68 94, 70 91 C 72 94, 76 96, 78 93 C 75 87, 65 86, 56 87 C 50 86, 47 82, 45 80 Z" 
            fill="url(#bodyBlueGrad)" 
            style={{ transformOrigin: '45px 80px' }}
          />
          
          {/* Back Fin */}
          <path d="M 52 20 C 58 10, 68 8, 68 14 C 68 20, 60 25, 54 28 Z" fill="url(#bodyBlueGrad)" />
          
          {/* Arm Right (rest/side arm) */}
          <path d="M 72 65 C 78 68, 82 74, 78 77 C 74 80, 70 73, 69 68 Z" fill="url(#bodyBlueGrad)" />
          
          {/* Head & Main Body (Clean smooth circle structure) */}
          <circle cx="50" cy="50" r="26" fill="url(#bodyBlueGrad)" />
          <path d="M 24 50 C 24 72, 34 82, 50 82 C 66 82, 76 72, 76 50 Z" fill="url(#bodyBlueGrad)" />
          
          {/* White Belly */}
          <ellipse cx="50" cy="66" rx="16" ry="13" fill="url(#bellyWhiteGrad)" />
          
          {/* Arm Left (Waving arm) */}
          <path 
            className={cn("mascot-left-fin", isThinking && "thinking")}
            d="M 28 65 C 18 63, 12 58, 12 65 C 12 70, 20 74, 27 68 Z" 
            fill="url(#bodyBlueGrad)" 
            style={{ transformOrigin: '28px 66px' }}
          />
          
          {/* Round Cute Snout (overlays between eyes) */}
          <ellipse cx="50" cy="50" rx="10" ry="4.5" fill="url(#bodyBlueGrad)" />

          {/* Big Chibi Eyes with clean highlights */}
          {/* Left Eye */}
          <g style={{ transformOrigin: '38px 44px', animation: 'mascot-blink 4.5s infinite' }}>
            <circle cx="38" cy="44" r="5" fill="#1E293B" />
            <circle cx="39.5" cy="42.2" r="1.8" fill="#FFFFFF" />
            <circle cx="36.5" cy="46" r="0.7" fill="#FFFFFF" />
          </g>
          {/* Right Eye */}
          <g style={{ transformOrigin: '62px 44px', animation: 'mascot-blink 4.5s infinite' }}>
            <circle cx="62" cy="44" r="5" fill="#1E293B" />
            <circle cx="63.5" cy="42.2" r="1.8" fill="#FFFFFF" />
            <circle cx="60.5" cy="46" r="0.7" fill="#FFFFFF" />
          </g>

          {/* Rosy Cheeks */}
          <ellipse cx="30" cy="50" rx="3.5" ry="1.8" fill="#F472B6" opacity="0.4" />
          <ellipse cx="70" cy="50" rx="3.5" ry="1.8" fill="#F472B6" opacity="0.4" />

          {/* Smiling Mouth and Pink Tongue */}
          <path d="M 45 52 Q 50 61 55 52 Z" fill="#F87171" stroke="#1E293B" strokeWidth="1.2" />
          <path d="M 48 56 Q 50 59 52 56 Q 50 54 48 56 Z" fill="#FCA5A5" />

          {/* White Headset Band */}
          <path d="M 38 24 A 28 28 0 0 1 72 38" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          
          {/* Headset Ear Cup & Mic */}
          <g>
            {/* Ear Cup Backing */}
            <circle cx="75" cy="41" r="6" fill="#FFFFFF" filter="drop-shadow(0 1.5px 3px rgba(0,0,0,0.1))" />
            {/* Inner Ring (Blue Grad) */}
            <circle cx="75" cy="41" r="4" fill="url(#headsetBlueGrad)" />
            {/* Center Cap */}
            <circle cx="75" cy="41" r="2" fill="#FFFFFF" />
            
            {/* Microphone Arm */}
            <path d="M 75 45 Q 72 52, 66 52" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            {/* Microphone Tip */}
            <circle cx="65" cy="52" r="1.8" fill="#60A5FA" />
          </g>

          {/* Collar & AI Badge */}
          <g>
            {/* Collar Strap */}
            <path d="M 36 70 Q 50 78, 64 70" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
            {/* AI Badge Housing */}
            <rect x="42" y="68" width="16" height="11" rx="3.5" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="1" />
            {/* Badge Inner Screen */}
            <rect x="43.5" y="69.5" width="13" height="8" rx="2.5" fill="#2563EB" opacity="0.9" />
            {/* "AI" Lettering */}
            <text 
              x="50" 
              y="76.2" 
              textAnchor="middle" 
              fill="#FFFFFF" 
              fontSize="6" 
              fontWeight="bold" 
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              AI
            </text>
          </g>

          {/* Tiny Cute Sparkle Star */}
          <path d="M 24 34 Q 24 30, 21 30 Q 24 30, 24 26 Q 24 30, 27 30 Q 24 30, 24 34 Z" fill="#60A5FA" opacity="0.85" />
        </g>
      </svg>

      {/* Online indicator badge (hidden during thinking state to prevent overlap) */}
      {!isThinking && size !== 'sm' && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full z-20 shadow-sm animate-pulse"></span>
      )}
    </div>
  );
}
