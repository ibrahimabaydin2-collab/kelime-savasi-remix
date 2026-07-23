// Complete rebuild stamp: 2026-07-23 v1.0.2
import { motion } from 'motion/react';
import { Delete } from 'lucide-react';

interface KeyboardProps {
  onChar: (value: string) => void;
  onDelete: () => void;
  onEnter: () => void;
  letterStatuses: { [key: string]: 'green' | 'orange' | 'grey' };
  keyboardLayout?: 'Q' | 'F';
  boardTheme?: 'classic' | 'ocean' | 'neon' | 'autumn' | 'pastel';
  disabled?: boolean;
}

export default function Keyboard({
  onChar,
  onDelete,
  onEnter,
  letterStatuses,
  keyboardLayout = 'Q',
  boardTheme = 'classic',
  disabled = false
}: KeyboardProps) {
  const qRows = [
    ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
    ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'SIL']
  ];

  const fRows = [
    ['F', 'G', 'Ğ', 'I', 'O', 'D', 'R', 'N', 'H', 'P'],
    ['U', 'A', 'E', 'İ', 'T', 'K', 'M', 'L', 'Y', 'Ş'],
    ['ENTER', 'J', 'Ö', 'V', 'C', 'Z', 'S', 'B', 'Ç', 'SIL']
  ];

  const rows = keyboardLayout === 'F' ? fRows : qRows;

  const getKeyClass = (char: string) => {
    const base = 'flex-1 h-[clamp(2.4rem,5.4vh,4.0rem)] rounded-xl text-base sm:text-lg md:text-xl font-black flex items-center justify-center transition-all duration-150 cursor-pointer select-none active:scale-95 shadow-sm';
    const status = letterStatuses[char.toLocaleUpperCase('tr-TR')];

    if (char === 'ENTER' || char === 'SIL') {
      return `${base} bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 hover:from-slate-300 hover:to-slate-400 dark:hover:from-slate-600 dark:hover:to-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm px-2.5 sm:px-3 border border-slate-300 dark:border-slate-600`;
    }

    // Dynamic styles based on boardTheme
    let greenStyle = 'bg-gradient-to-br from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white shadow-md shadow-emerald-500/20';
    let orangeStyle = 'bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white shadow-md shadow-amber-500/20';
    let greyStyle = 'bg-slate-300 dark:bg-slate-800 text-slate-100 dark:text-slate-500 opacity-50';

    if (boardTheme === 'ocean') {
      greenStyle = 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20';
      orangeStyle = 'bg-gradient-to-br from-sky-400 to-cyan-500 hover:from-sky-500 hover:to-cyan-600 text-white shadow-md shadow-sky-400/20';
      greyStyle = 'bg-slate-400 dark:bg-slate-800 text-slate-200 dark:text-slate-600 opacity-50';
    } else if (boardTheme === 'neon') {
      greenStyle = 'bg-gradient-to-br from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 text-white shadow-md shadow-fuchsia-500/35';
      orangeStyle = 'bg-gradient-to-br from-cyan-400 to-teal-400 hover:from-cyan-500 hover:to-teal-500 text-slate-950 shadow-md shadow-cyan-400/35';
      greyStyle = 'bg-zinc-700 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-500 opacity-50';
    } else if (boardTheme === 'autumn') {
      greenStyle = 'bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md shadow-orange-500/20';
      orangeStyle = 'bg-gradient-to-br from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white shadow-md shadow-amber-500/20';
      greyStyle = 'bg-stone-500 dark:bg-stone-800 text-stone-200 dark:text-stone-500 opacity-50';
    } else if (boardTheme === 'pastel') {
      greenStyle = 'bg-gradient-to-br from-teal-250 to-emerald-300 hover:from-teal-300 hover:to-emerald-400 text-teal-950 shadow-sm shadow-teal-300/10';
      orangeStyle = 'bg-gradient-to-br from-rose-250 to-orange-300 hover:from-rose-300 hover:to-orange-400 text-rose-950 shadow-sm shadow-rose-300/10';
      greyStyle = 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 opacity-50';
    }

    switch (status) {
      case 'green':
        return `${base} ${greenStyle}`;
      case 'orange':
        return `${base} ${orangeStyle}`;
      case 'grey':
        return `${base} ${greyStyle}`;
      default:
        return `${base} bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800`;
    }
  };

  return (
    <div className="w-full max-w-lg sm:max-w-xl md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto px-1 sm:px-1.5 mt-0 mb-5 sm:mb-7 shrink-0">
      <div className="flex flex-col gap-1 sm:gap-1.5">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-1 sm:gap-1.5">
            {row.map((char) => {
              const isAction = char === 'ENTER' || char === 'SIL';
              return (
                <motion.button
                  whileTap={disabled ? undefined : { scale: 0.95 }}
                  key={char}
                  onClick={() => {
                    if (disabled) return;
                    if (char === 'ENTER') {
                      onEnter();
                    } else if (char === 'SIL') {
                      onDelete();
                    } else {
                      onChar(char);
                    }
                  }}
                  className={`${getKeyClass(char)} ${disabled ? 'opacity-70 pointer-events-none select-none touch-none' : ''}`}
                  id={`key-${char}`}
                  disabled={disabled}
                >
                  {char === 'SIL' ? (
                    <div className="flex items-center gap-0.5">
                      <Delete size={16} />
                      <span className="hidden sm:inline">SİL</span>
                    </div>
                  ) : char === 'ENTER' ? (
                    <span className="font-bold">GİRİŞ</span>
                  ) : (
                    char
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
