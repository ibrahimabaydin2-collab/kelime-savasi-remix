import React, { memo } from 'react';

export interface ProgressDotsProps {
  currentAttemptCount: number;
  maxAttempts?: number;
  isCompleted?: boolean;
  isWon?: boolean;
  colorScheme?: 'emerald' | 'amber';
  showLabel?: boolean;
  className?: string;
}

function ProgressDots({
  currentAttemptCount,
  maxAttempts = 6,
  isCompleted = false,
  isWon = false,
  colorScheme = 'amber',
  showLabel = true,
  className = ''
}: ProgressDotsProps) {
  const safeCount = Math.min(Math.max(Number(currentAttemptCount) || 0, 0), maxAttempts);
  const isEmerald = colorScheme === 'emerald';

  const filledColor = isEmerald
    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]';

  const activeColor = isEmerald
    ? 'bg-emerald-400 animate-pulse ring-2 ring-emerald-400/40'
    : 'bg-amber-400/80 animate-ping ring-2 ring-amber-400/30';

  const textColor = isEmerald ? 'text-emerald-300' : 'text-amber-300';

  return (
    <div className={`mt-1 pt-1 border-t border-white/5 flex items-center justify-between ${className}`}>
      <div className="flex gap-1 items-center">
        {Array.from({ length: maxAttempts }).map((_, idx) => {
          const isFilled = idx < safeCount;
          const isCurrent = idx === safeCount && !isCompleted;
          return (
            <span
              key={idx}
              className={`w-2 h-2 rounded-full transition-all ${
                isFilled
                  ? filledColor
                  : isCurrent
                  ? activeColor
                  : 'bg-gray-700/60'
              }`}
            />
          );
        })}
      </div>
      {showLabel && (
        <span className={`text-[10px] font-bold font-mono ${textColor}`}>
          {isCompleted
            ? isWon
              ? 'Bildi ✓'
              : 'Bitti'
            : `Deneme ${safeCount}/${maxAttempts}`}
        </span>
      )}
    </div>
  );
}

export default memo(ProgressDots);
