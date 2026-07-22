import { motion } from 'motion/react';

interface GameBoardProps {
  attempts: { word: string; feedback: ('green' | 'orange' | 'grey')[] }[];
  currentAttempt: string;
  wordLength: number;
  maxAttempts?: number;
  boardTheme?: 'classic' | 'ocean' | 'neon' | 'autumn' | 'pastel';
  isGameOver?: boolean;
  revealedHints?: { [index: number]: string };
}

export default function GameBoard({
  attempts,
  currentAttempt,
  wordLength,
  maxAttempts = 6,
  boardTheme = 'classic',
  isGameOver = false,
  revealedHints = {}
}: GameBoardProps) {
  const rows = [...attempts];
  const isCompleted = rows.length >= maxAttempts;
  
  if (!isGameOver) {
    if (rows.length < maxAttempts) {
      // Add active row
      rows.push({
        word: currentAttempt.padEnd(wordLength, ' '),
        feedback: []
      });
    }
  }
  
  while (rows.length < maxAttempts) {
    rows.push({
      word: ' '.repeat(wordLength),
      feedback: []
    });
  }

  // Determine dynamic cell sizing based on word length to scale perfectly on mobile devices
  const getCellSizeClass = () => {
    if (wordLength === 3) {
      return 'w-[clamp(2.6rem,min(14vw,9vh),5.2rem)] h-[clamp(2.6rem,min(14vw,9vh),5.2rem)] text-2xl sm:text-3xl md:text-4xl border-[2.5px] rounded-2xl';
    }
    if (wordLength === 4) {
      return 'w-[clamp(2.3rem,min(12vw,8.5vh),4.8rem)] h-[clamp(2.3rem,min(12vw,8.5vh),4.8rem)] text-xl sm:text-2xl md:text-3xl border-[2.5px] rounded-xl';
    }
    if (wordLength === 5) {
      return 'w-[clamp(2.0rem,min(10vw,7.8vh),4.4rem)] h-[clamp(2.0rem,min(10vw,7.8vh),4.4rem)] text-lg sm:text-xl md:text-2xl border-[2px] rounded-xl';
    }
    if (wordLength === 6) {
      return 'w-[clamp(1.8rem,min(9vw,7vh),4.0rem)] h-[clamp(1.8rem,min(9vw,7vh),4.0rem)] text-base sm:text-lg md:text-xl border-[2px] rounded-xl';
    }
    if (wordLength === 7) {
      return 'w-[clamp(1.6rem,min(8vw,6.5vh),3.5rem)] h-[clamp(1.6rem,min(8vw,6.5vh),3.5rem)] text-sm sm:text-base md:text-lg border-[1.5px] rounded-lg';
    }
    return 'w-[clamp(1.4rem,min(7vw,6vh),3.1rem)] h-[clamp(1.4rem,min(7vw,6vh),3.1rem)] text-xs sm:text-sm md:text-base border-[1.5px] rounded-md sm:rounded-lg';
  };

  // Determine cell classes based on status
  const getCellClass = (char: string, index: number, isSubmitted: boolean, feedback?: 'green' | 'orange' | 'grey') => {
    const sizeClass = getCellSizeClass();
    const base = `${sizeClass} flex items-center justify-center font-bold uppercase transition-all duration-300 select-none`;
    
    if (!isSubmitted) {
      if (char && char !== ' ') {
        return `${base} border-amber-300/60 text-[#FAF6E9] bg-[#3D4756] scale-105 shadow-sm`;
      }
      return `${base} border-[#3E485A] bg-[#222B3A]/45 text-[#FAF6E9]/30`;
    }

    // Dynamic colors based on boardTheme
    let greenStyle = 'border-emerald-400 bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/20';
    let orangeStyle = 'border-amber-400 bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/20';
    let greyStyle = 'border-[#3E485A] bg-gradient-to-br from-slate-500 to-slate-600 text-slate-100 shadow-sm';

    if (boardTheme === 'ocean') {
      greenStyle = 'border-blue-500 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20';
      orangeStyle = 'border-sky-400 bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-lg shadow-sky-400/20';
      greyStyle = 'border-[#3E485A] bg-gradient-to-br from-slate-500 to-slate-600 text-slate-100 shadow-sm';
    } else if (boardTheme === 'neon') {
      greenStyle = 'border-fuchsia-500 bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-lg shadow-fuchsia-500/30';
      orangeStyle = 'border-cyan-400 bg-gradient-to-br from-cyan-400 to-teal-400 text-slate-950 shadow-lg shadow-cyan-400/30';
      greyStyle = 'border-[#3E485A] bg-gradient-to-br from-zinc-600 to-zinc-700 text-zinc-100 shadow-sm';
    } else if (boardTheme === 'autumn') {
      greenStyle = 'border-orange-500 bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20';
      orangeStyle = 'border-amber-500 bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/20';
      greyStyle = 'border-[#3E485A] bg-gradient-to-br from-stone-550 to-stone-650 text-stone-100 shadow-sm';
    } else if (boardTheme === 'pastel') {
      greenStyle = 'border-teal-300 bg-gradient-to-br from-teal-200 to-emerald-300 text-teal-950 shadow-md shadow-teal-300/20';
      orangeStyle = 'border-rose-300 bg-gradient-to-br from-rose-200 to-orange-300 text-rose-950 shadow-md shadow-rose-300/20';
      greyStyle = 'border-[#3E485A] bg-gradient-to-br from-slate-300 to-slate-400 text-slate-700 shadow-sm';
    }

    switch (feedback) {
      case 'green':
        return `${base} ${greenStyle}`;
      case 'orange':
        return `${base} ${orangeStyle}`;
      case 'grey':
        return `${base} ${greyStyle}`;
      default:
        return `${base} border-[#3E485A] bg-[#222B3A]/45 text-[#FAF6E9]`;
    }
  };

  return (
    <div className="flex flex-col gap-[clamp(0.08rem,0.4vh,0.22rem)] items-center justify-center overflow-x-auto w-full px-2 shrink-0">
      {rows.map((row, rowIndex) => {
        const isSubmitted = rowIndex < attempts.length;
        const isActive = rowIndex === attempts.length && !isCompleted;
        const wordChars = row.word.split('');

        return (
          <div key={rowIndex} className="flex gap-[clamp(0.08rem,0.4vw,0.22rem)]">
            {wordChars.map((char, charIndex) => {
              const feedback = row.feedback?.[charIndex];
              const isHinted = isActive && char === ' ' && revealedHints[charIndex] !== undefined;
              
              let finalClass = getCellClass(char, charIndex, isSubmitted, feedback);
              let displayChar = char !== ' ' ? char : '';
              
              if (isHinted) {
                const sizeClass = getCellSizeClass();
                finalClass = `${sizeClass} flex items-center justify-center font-bold uppercase transition-all duration-350 select-none border-emerald-500/70 bg-emerald-500/10 text-emerald-400 border-dashed animate-pulse scale-[1.02]`;
                displayChar = revealedHints[charIndex];
              }

              if (isGameOver) {
                return (
                  <div
                    key={charIndex}
                    className={finalClass}
                    id={`cell-${rowIndex}-${charIndex}`}
                  >
                    <span className="font-sans font-bold">
                      {displayChar}
                    </span>
                  </div>
                );
              }

              return (
                <motion.div
                  key={charIndex}
                  initial={isSubmitted ? { rotateX: 0 } : false}
                  animate={
                    isSubmitted
                      ? {
                          rotateX: [0, 90, 0],
                          transition: { delay: charIndex * 0.15, duration: 0.5 }
                        }
                      : isActive && char !== ' '
                      ? { scale: [1, 1.1, 1] }
                      : {}
                  }
                  className={finalClass}
                  id={`cell-${rowIndex}-${charIndex}`}
                >
                  <span className="font-sans font-bold">
                    {displayChar}
                  </span>
                </motion.div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
