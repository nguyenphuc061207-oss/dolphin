import React from 'react';
import MathText from './MathText';

/**
 * RichTextRenderer
 * Renders text that contains both plain text and math placeholders like [!m:$mathml_1$]
 */
export default function RichTextRenderer({ content, mathDict = {}, className = '' }) {
  if (!content) return null;

  // Regex to match our custom math placeholders
  const tokenRegex = /\[!m:\$(mathml_\d+)\$\]/g;
  
  // Split content by tokens
  const parts = content.split(tokenRegex);
  
  // The split with capture group returns [text, id, text, id, ...]
  return (
    <div className={`rich-text-content ${className}`} style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, index) => {
        // Even indices are chunks between tokens, odd indices are token IDs
        if (index % 2 === 0) {
          // Render using MathText to catch any manual LaTeX ($...$) in the text
          return <MathText key={index} text={part} />;
        } else {
          const mathId = part;
          const latex = mathDict[mathId];
          
          if (!latex) {
            return <span key={index} className="text-red-500 underline">[{mathId} missing]</span>;
          }
          
          // Render using our existing MathText component (which handles KaTeX)
          // We wrap it in $...$ to ensure it's treated as math by tokenizeMath
          return <MathText key={index} text={`$${latex}$`} />;
        }
      })}
    </div>
  );
}
