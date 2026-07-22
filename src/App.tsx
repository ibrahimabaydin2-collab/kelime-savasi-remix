import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  playClickSound,
  playDeleteSound,
  playEnterSound,
  playErrorSound,
  playVictorySound,
  playDefeatSound,
  playCountdownBeepSound,
  suspendAudioContext,
  resumeAudioContext
} from './utils/soundEffects.js';
import GameBoard from './components/GameBoard.js';
import BottomBar from './components/BottomBar.js';
import Keyboard from './components/Keyboard.js';
import StatsModal from './components/StatsModal.js';
import MissionsModal from './components/MissionsModal.js';
import WelcomeScreen from './components/WelcomeScreen.js';
import GoldWallet from './components/GoldWallet.js';
import SettingsModal, { AppSettings } from './components/SettingsModal.js';
import AuthScreen from './components/AuthScreen.js';
import BadgeUnlockedModal from './components/BadgeUnlockedModal.js';
import { auth, onAuthStateChanged, fetchUserProfile, saveUserProfileToFirestore, signOutUser, fetchUserProfileByDeviceId, deleteUserProfile, signInAsGuest, clearMatchmakingState, db } from './lib/firebase.js';
import { doc, setDoc, updateDoc, onSnapshot, runTransaction, getDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { UserProfile, GameAttempt, DailyMission, Badge, NetworkLogEntry } from './types.js';
import { Swords, RotateCcw, AlertCircle, HelpCircle, Trophy, UserCheck, Flame, Hourglass, HelpCircle as HelpIcon, Sparkles, Upload, Trash2, Image, X, ArrowLeft, Info, Play, Home } from 'lucide-react';
import { getRandomWord, isWordInCuratedList, getDailyWordAndLength, COMMON_TURKISH_WORDS, CLEANED_TURKISH_WORDS } from './data/wordlist.js';
import { turkishUpper, turkishLower, validateTurkishLinguistics } from './utils/turkish.js';
import { getApiUrl, getWsUrl, validateWordClientSide } from './utils/api.js';
import { calculateDynamicScore, verifyScoringAccuracy, getLevelForScore } from './utils/scoring.js';
import { getCachedWord, setCachedWord } from './utils/wordCache.js';
import { scheduleDailyNotifications } from './utils/notifications.js';

const INITIAL_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  winDistribution: [0, 0, 0, 0, 0, 0]
};

export const ensureProfileFields = (p: UserProfile): UserProfile => {
  return {
    ...p,
    gold: p.gold !== undefined ? p.gold : 20,
    lastDailyLoginClaim: p.lastDailyLoginClaim !== undefined ? p.lastDailyLoginClaim : '',
    wordLengthStats: p.wordLengthStats || {
      "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0
    },
    missions: p.missions || DEFAULT_MISSIONS,
    badges: p.badges || DEFAULT_BADGES,
    stats: p.stats || INITIAL_STATS
  };
};

const DEFAULT_BADGES: Badge[] = [
  // 3 Harfli Modu
  { id: 'solve_3_10', title: '3 Harfli Çömez', description: '3 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_3_50', title: '3 Harfli Usta', description: '3 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_3_150', title: '3 Harfli Efsane', description: '3 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // 4 Harfli Modu
  { id: 'solve_4_10', title: '4 Harfli Çömez', description: '4 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_4_50', title: '4 Harfli Usta', description: '4 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_4_150', title: '4 Harfli Efsane', description: '4 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // 5 Harfli Modu
  { id: 'solve_5_10', title: '5 Harfli Çömez', description: '5 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_5_50', title: '5 Harfli Usta', description: '5 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_5_150', title: '5 Harfli Efsane', description: '5 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // 6 Harfli Modu
  { id: 'solve_6_10', title: '6 Harfli Çömez', description: '6 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_6_50', title: '6 Harfli Usta', description: '6 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_6_150', title: '6 Harfli Efsane', description: '6 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // 7 Harfli Modu
  { id: 'solve_7_10', title: '7 Harfli Çömez', description: '7 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_7_50', title: '7 Harfli Usta', description: '7 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_7_150', title: '7 Harfli Efsane', description: '7 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // 8 Harfli Modu
  { id: 'solve_8_10', title: '8 Harfli Çömez', description: '8 harfli modda toplam 10 kelimeyi doğru bil', iconName: 'Award' },
  { id: 'solve_8_50', title: '8 Harfli Usta', description: '8 harfli modda toplam 50 kelimeyi doğru bil', iconName: 'Trophy' },
  { id: 'solve_8_150', title: '8 Harfli Efsane', description: '8 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' }
];

const DEFAULT_MISSIONS: DailyMission[] = [
  { id: 'm_play_1', title: 'Kelime Avcısı 🔍', description: 'Bugün en az 1 kelime oyunu oyna', target: 1, current: 0, completed: false, type: 'play' },
  { id: 'm_win_1', title: 'İlk Zafer 🏆', description: 'Bugün en az 1 kelimeyi doğru tahmin et', target: 1, current: 0, completed: false, type: 'win' },
  { id: 'm_fast_1', title: 'Yıldırım Hızı ⚡', description: 'Herhangi bir kelimeyi 10 saniyeden fazla süre kala çöz', target: 1, current: 0, completed: false, type: 'fast_solve' },
  
  // 3-letter words
  { id: 'm_solve_3_1', title: 'Üçgen Formülü 🔺', description: '3 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_3' },
  { id: 'm_solve_3_2', title: 'Üç Harf Seri 🔥', description: '3 harfli 3 kelimeyi başarıyla çöz', target: 3, current: 0, completed: false, type: 'solve_3' },
  { id: 'm_solve_3_3', title: 'Üç Harf Maratonu 🏃', description: '3 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_3' },
  { id: 'm_solve_3_4', title: 'Üç Harf Yarım Dalya 🎖️', description: '3 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_3' },
  { id: 'm_solve_3_5', title: 'Üç Harf Tam Dalya 👑', description: '3 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_3' },
  
  // 4-letter words
  { id: 'm_solve_4_1', title: 'Dört Dörtlük 🟥', description: '4 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_4' },
  { id: 'm_solve_4_2', title: 'Kare Ustası 🧱', description: '4 harfli 3 kelimeyi başarıyla çöz', target: 3, current: 0, completed: false, type: 'solve_4' },
  { id: 'm_solve_4_3', title: 'Kare Maratonu 🚜', description: '4 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_4' },
  { id: 'm_solve_4_4', title: 'Kare Yarım Dalya 🏵️', description: '4 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_4' },
  { id: 'm_solve_4_5', title: 'Kare Tam Dalya 🏰', description: '4 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_4' },
  
  // 5-letter words
  { id: 'm_solve_5_1', title: 'Beşli Yıldız ⭐', description: '5 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_5' },
  { id: 'm_solve_5_2', title: 'Pentagon Seferi 🎯', description: '5 harfli 3 kelimeyi başarıyla çöz', target: 3, current: 0, completed: false, type: 'solve_5' },
  { id: 'm_solve_5_3', title: 'Pentagon Maratonu ✈️', description: '5 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_5' },
  { id: 'm_solve_5_4', title: 'Beşli Yıldız Yarım Dalya 🎖️', description: '5 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_5' },
  { id: 'm_solve_5_5', title: 'Pentagon Tam Dalya 🌌', description: '5 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_5' },
  
  // 6-letter words
  { id: 'm_solve_6_1', title: 'Altıncı His 👁️', description: '6 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_6' },
  { id: 'm_solve_6_2', title: 'Hexagon Muhafızı 🛡️', description: '6 harfli 3 kelimeyi başarıyla çöz', target: 3, current: 0, completed: false, type: 'solve_6' },
  { id: 'm_solve_6_3', title: 'Hexagon Maratonu 🏹', description: '6 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_6' },
  { id: 'm_solve_6_4', title: 'Hexagon Yarım Dalya ⚜️', description: '6 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_6' },
  { id: 'm_solve_6_5', title: 'Hexagon Tam Dalya 🔮', description: '6 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_6' },
  
  // 7-letter words
  { id: 'm_solve_7_1', title: 'Yedi Tepe ⛰️', description: '7 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_7' },
  { id: 'm_solve_7_2', title: 'Gökkuşağı Bandı 🌈', description: '7 harfli 2 kelimeyi başarıyla çöz', target: 2, current: 0, completed: false, type: 'solve_7' },
  { id: 'm_solve_7_3', title: 'Yedi Tepe Maratonu 🗺️', description: '7 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_7' },
  { id: 'm_solve_7_4', title: 'Gökkuşağı Yarım Dalya 🎡', description: '7 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_7' },
  { id: 'm_solve_7_5', title: 'Yedi Cennet Tam Dalya ☀️', description: '7 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_7' },
  
  // 8-letter words
  { id: 'm_solve_8_1', title: 'Sekiz Köşe 🕸️', description: '8 harfli bir kelimeyi başarıyla çöz', target: 1, current: 0, completed: false, type: 'solve_8' },
  { id: 'm_solve_8_2', title: 'Kelimelerin Efendisi 👑', description: '8 harfli 2 kelimeyi başarıyla çöz', target: 2, current: 0, completed: false, type: 'solve_8' },
  { id: 'm_solve_8_3', title: 'Zeka Köşesi Maratonu 🧩', description: '8 harfli 10 kelimeyi başarıyla çöz', target: 10, current: 0, completed: false, type: 'solve_8' },
  { id: 'm_solve_8_4', title: 'Sekiz Köşe Yarım Dalya 💎', description: '8 harfli 50 kelimeyi başarıyla çöz', target: 50, current: 0, completed: false, type: 'solve_8' },
  { id: 'm_solve_8_5', title: 'Zeka Küpü Tam Dalya 🧠', description: '8 harfli 100 kelimeyi başarıyla çöz', target: 100, current: 0, completed: false, type: 'solve_8' },
  
  // Advanced
  { id: 'm_streak_2', title: 'Durdurulamaz 🦾', description: 'Üst üste 2 oyun kazan', target: 2, current: 0, completed: false, type: 'streak' },
  { id: 'm_perfect_1', title: 'Kusursuz Akıl 🧠', description: 'Herhangi bir kelimeyi ilk veya ikinci denemede doğru bil', target: 1, current: 0, completed: false, type: 'perfect' }
];

const triggerVictoryCelebration = (soundEnabled: boolean) => {
  // Play grand synthesized victory chords/arpeggio
  playVictorySound(soundEnabled);

  // Skip canvas-confetti rendering completely inside the Android hybrid webview environment
  // to avoid intensive GPU memory context losses, paint cycle flickering, and WebView crashes (white screens)
  const isAndroidHybrid = typeof window !== 'undefined' && (
    (window as any).AndroidBridge || 
    /android/i.test(navigator.userAgent) ||
    (navigator.userAgent && navigator.userAgent.toLowerCase().includes('android-hybrid')) ||
    (document.documentElement && document.documentElement.classList.contains('android-hybrid'))
  );

  if (isAndroidHybrid) {
    console.log("Android hybrid app environment detected: Skipping canvas-confetti rendering for absolute stability and 0% crash rate.");
    return;
  }

  // Extremely lightweight, single-frame burst of minimal particles to guarantee 0% WebView crashes/reloads
  try {
    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#10b981', '#34d399', '#f59e0b']
    });
  } catch (e) {
    console.error('Confetti failed to trigger safely:', e);
  }
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('localStorage getItem blocked/unavailable:', e);
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn('localStorage setItem blocked/unavailable:', e);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('localStorage removeItem blocked/unavailable:', e);
    }
  }
};

function generateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  const nav = (window.navigator || {}) as any;
  const scr = (window.screen || {}) as any;
  const userAgent = nav.userAgent || '';
  const language = nav.language || '';
  const screenWidth = scr.width || 0;
  const screenHeight = scr.height || 0;
  const colorDepth = scr.colorDepth || 0;
  
  // Combine factors to build a fingerprint
  const rawFingerprint = `${userAgent}|${language}|${screenWidth}x${screenHeight}|${colorDepth}`;
  
  // Deterministic 32-bit hash
  let hash = 0;
  for (let i = 0; i < rawFingerprint.length; i++) {
    const char = rawFingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  
  return 'fp_' + Math.abs(hash).toString(36);
}

export default function App() {
  const [deviceId] = useState<string>(() => {
    let id = safeLocalStorage.getItem('kelimesavasi_device_id');
    if (!id) {
      id = generateDeviceFingerprint();
      safeLocalStorage.setItem('kelimesavasi_device_id', id);
    }
    return id;
  });

  // Theme & Menu State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = safeLocalStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return true; // Default to Gece Modu (Night Mode) for the initial visit
  });

  const [isConnectPage] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname === '/connect';
  });

  // Capacitor Deep Link Listener (Supports both cold-start and warm-start)
  useEffect(() => {
    let isSubscribed = true;
    
    const handleDeepLinkUrl = (urlStr: string) => {
      try {
        console.log('Processing deep link URL:', urlStr);
        // Convert custom scheme to standard HTTPS scheme for seamless and reliable URL parsing
        let cleanUrl = urlStr;
        if (cleanUrl.startsWith('kelimesavasi://')) {
          cleanUrl = cleanUrl.replace('kelimesavasi://', 'https://');
        }
        
        const parsedUrl = new URL(cleanUrl);
        const token = parsedUrl.searchParams.get('token');
        const server = parsedUrl.searchParams.get('server');
        
        if (token) {
          window.localStorage.setItem('aistudio_auth_token', token);
          window.sessionStorage.setItem('aistudio_auth_token', token);
          console.log('Deep link token stored successfully:', token.substring(0, 10) + '...');
        }
        if (server) {
          window.localStorage.setItem('kelimesavasi_server_type', server);
          console.log('Deep link server type stored successfully:', server);
        }
        
        if (token || server) {
          // Force reload to instantly reinitialize connections with new parameters
          setTimeout(() => {
            if (isSubscribed) {
              window.location.reload();
            }
          }, 300);
        }
      } catch (e) {
        console.error('Failed to process deep link URL:', e);
      }
    };

    const setupDeepLink = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        
        // 1. Handle COLD-START deep links (app is opened from completely closed state)
        const launchUrlObj = await CapApp.getLaunchUrl();
        if (launchUrlObj && launchUrlObj.url && isSubscribed) {
          console.log('App launched via cold deep link:', launchUrlObj.url);
          handleDeepLinkUrl(launchUrlObj.url);
        }

        // 2. Handle WARM-START deep links (app is already running in background)
        CapApp.addListener('appUrlOpen', (event: any) => {
          if (!isSubscribed) return;
          console.log('App opened via warm deep link:', event.url);
          if (event.url) {
            handleDeepLinkUrl(event.url);
          }
        });
      } catch (e) {
        console.log('Capacitor App plugin not available:', e);
      }
    };
    
    setupDeepLink();
    
    return () => {
      isSubscribed = false;
    };
  }, []);

  if (isConnectPage) {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token') || '';
    const server = searchParams.get('server') || 'pre';
    const deepLinkUrl = `kelimesavasi://connect?token=${encodeURIComponent(token)}&server=${server}`;
    const webFallbackUrl = `/?___aistudio_auth_token=${encodeURIComponent(token)}`;

    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-800'}`}>
        <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-6 animate-scale-up">
          {/* Header */}
          <div className="space-y-2">
            <div className="mx-auto w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white text-3xl font-black">
              W
            </div>
            <h2 className="text-xl font-black tracking-tight font-sans">Kelime Savaşı Mobil Bağlantı</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans">Telefonunuzdaki yüklü uygulamayı otomatik olarak internete bağlayın</p>
          </div>

          {/* Action Card */}
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 p-5 rounded-2xl space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-left font-sans">
              Bu sayfa, telefonunuzdaki Kelime Savaşı APK/AAB uygulamasının bulut sunucularına güvenli bir şekilde erişmesini sağlar.
            </p>

            <button
              onClick={() => {
                window.location.href = deepLinkUrl;
              }}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer font-sans"
            >
              <Swords size={16} />
              MOBİL UYGULAMADA AÇ VE BAĞLAN
            </button>
          </div>

          {/* Steps */}
          <div className="text-left space-y-3.5 px-1">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Nasıl Bağlanır?</h4>
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-sans">1</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-sans">
                Samsung/Android telefonunuzda Kelime Savaşı uygulamasının yüklü olduğundan emin olun.
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-sans">2</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-sans">
                Yukarıdaki yeşil <strong>"MOBİL UYGULAMADA AÇ VE BAĞLAN"</strong> butonuna tıklayın.
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-sans">3</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-sans">
                Telefonunuz onay istediğinde açılmasına izin verin. Uygulama otomatik açılacak ve internete bağlanacaktır!
              </p>
            </div>
          </div>

          {/* Browser Alternative */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              onClick={() => {
                window.location.href = webFallbackUrl;
              }}
              className="text-xs font-bold text-emerald-500 hover:text-emerald-600 transition flex items-center justify-center gap-1.5 mx-auto cursor-pointer font-sans"
            >
              <span>Veya bu tarayıcıda oynamaya devam et &rarr;</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // User Profile
  const [profile, setProfile] = useState<UserProfile>(() => {
    let saved = safeLocalStorage.getItem('kelimesavasi_profile');
    if (!saved) saved = safeLocalStorage.getItem('lingo_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedUsername = safeLocalStorage.getItem('saved_username');
        if ((!parsed.name || parsed.name === 'Oyuncu' || parsed.name === 'Kelime Oyuncusu') && savedUsername) {
          parsed.name = savedUsername;
        }
        // Ensure missions and badges structures are complete and upgraded if old
        if (!parsed.missions) {
          parsed.missions = DEFAULT_MISSIONS;
        } else {
          // Merge default missions to ensure any newly added missions are present
          const existingIds = parsed.missions.map((m: any) => m.id);
          DEFAULT_MISSIONS.forEach(mission => {
            if (!existingIds.includes(mission.id)) {
              parsed.missions.push({
                ...mission,
                current: 0,
                completed: false
              });
            }
          });
        }
        // Keep only badges that exist in DEFAULT_BADGES. If they were already unlocked, keep the unlocked state.
        const oldBadges = parsed.badges || [];
        parsed.badges = DEFAULT_BADGES.map(defBadge => {
          const matched = oldBadges.find((b: any) => b.id === defBadge.id);
          return matched ? { ...defBadge, unlockedAt: matched.unlockedAt } : defBadge;
        });

        // Backward-compatibility: if user has already entered the game before, assume name is set
        if (parsed.nameSet === undefined) {
          parsed.nameSet = true;
        }
        return ensureProfileFields(parsed);
      } catch (e) {
        console.error('Failed parsing profile', e);
      }
    }
    
    // Default profile
    const randomId = `user_${Math.random().toString(36).substring(2, 11)}`;
    const savedUsername = safeLocalStorage.getItem('saved_username') || "";
    return ensureProfileFields({
      id: randomId,
      name: savedUsername,
      stats: INITIAL_STATS,
      badges: DEFAULT_BADGES,
      missions: DEFAULT_MISSIONS,
      dailyScore: 0,
      wordLengthStats: {
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0
      },
      gold: 20,
      lastDailyLoginClaim: '',
      lastUpdated: new Date().toISOString(),
      nameSet: !!savedUsername
    });
  });

  // Firebase Auth states with fast-path and optimistic rendering optimizations
  const [firebaseUser, setFirebaseUser] = useState<any>(() => {
    try {
      const saved = safeLocalStorage.getItem('kelimesavasi_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          // Return a tentative placeholder user so the Welcome screen renders instantly on mount
          return {
            uid: parsed.id,
            displayName: parsed.name,
            isAnonymous: safeLocalStorage.getItem('kelimesavasi_is_registered') !== 'true',
            photoURL: parsed.avatarUrl
          };
        }
      }
    } catch (e) {
      console.warn('Error reading cached user for optimistic load:', e);
    }
    return null;
  });

  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    try {
      const saved = safeLocalStorage.getItem('kelimesavasi_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          // If we have a local cached profile, skip the loader immediately to prevent any screen flickers
          console.log('Optimistic rendering: local cached profile found, skipping initial loading view.');
          return false;
        }
      }
    } catch (e) {}
    return true;
  });

  // Game Play State
  const [wordLength, setWordLength] = useState<number>(5);
  const [isDailyPuzzle, setIsDailyPuzzle] = useState<boolean>(false);
  const [isDailyPuzzleCompletedToday, setIsDailyPuzzleCompletedToday] = useState<boolean>(() => {
    const todayDateStr = getDailyWordAndLength().dateStr;
    const localCompleted = safeLocalStorage.getItem('kelimesavasi_daily_completed_date') === todayDateStr ||
                           safeLocalStorage.getItem('last_played_date') === todayDateStr;
    
    // Check AndroidBridge SharedPreferences if running in hybrid app
    if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.getDailyPuzzleLastPlayedDate) {
      try {
        const nativeDate = (window as any).AndroidBridge.getDailyPuzzleLastPlayedDate();
        const nativeCompleted = (window as any).AndroidBridge.getDailyPuzzleIsCompleted();
        if (nativeDate === todayDateStr && nativeCompleted) {
          return true;
        }
      } catch (e) {
        console.error("Error reading native SharedPreferences for daily puzzle status:", e);
      }
    }
    return localCompleted;
  });
  const [targetWord, setTargetWord] = useState<string>('');
  const [targetWords, setTargetWords] = useState<string[] | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const [cumulativeScore, setCumulativeScore] = useState<number>(0);
  const [attempts, setAttempts] = useState<GameAttempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState<string>('');
  const [gameStatus, setGameStatus] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [secondsLeft, setSecondsLeft] = useState<number>(20);
  const [isAppActive, setIsAppActive] = useState<boolean>(true);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [wordDefinition, setWordDefinition] = useState<string>('');
  const [letterStatuses, setLetterStatuses] = useState<{ [key: string]: 'green' | 'orange' | 'grey' }>({});
  const [revealedHints, setRevealedHints] = useState<{ [index: number]: string }>({});
  const [hintCount, setHintCount] = useState<number>(0);
  const [activeWordSuggestion, setActiveWordSuggestion] = useState<string | null>(null);

  // Welcome Screen & Dictionary Mode State
  const [hasEnteredGame, setHasEnteredGame] = useState<boolean>(false);

  // Gold economy helper functions
  const addGold = async (amount: number) => {
    const currentGold = profile.gold !== undefined ? profile.gold : 20;
    const updated = {
      ...profile,
      gold: currentGold + amount,
      lastUpdated: new Date().toISOString()
    };
    setProfile(updated);
    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
    saveUserProfileToFirestore(updated).catch((err) => {
      console.warn("Firestore gold update failed:", err);
    });
  };

  const deductGold = async (amount: number): Promise<boolean> => {
    const currentGold = profile.gold !== undefined ? profile.gold : 20;
    if (currentGold < amount) {
      showToast("Yetersiz Altın! Reklam izleyerek altın kazanabilirsin.", "error");
      return false;
    }
    const updated = {
      ...profile,
      gold: currentGold - amount,
      lastUpdated: new Date().toISOString()
    };
    setProfile(updated);
    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
    saveUserProfileToFirestore(updated).catch((err) => {
      console.warn("Firestore gold update failed:", err);
    });
    return true;
  };

  // 💡 WORD SUGGESTION GENERATION (Wordle helper matching current green/orange constraints)
  const generateWordSuggestion = (): string | null => {
    const wordList = CLEANED_TURKISH_WORDS[wordLength];
    if (!wordList || wordList.length === 0) return null;

    // 1. Gather constraints
    const greenLetters: { [idx: number]: string } = {};
    const orangeLetters = new Set<string>();
    const orangeExclusions: { [idx: number]: Set<string> } = {};
    const greyLetters = new Set<string>();
    const confirmedLetters = new Set<string>();

    attempts.forEach(attempt => {
      attempt.feedback.forEach((f, idx) => {
        const char = attempt.word[idx]?.toLowerCase();
        if (!char) return;
        if (f === 'green') {
          greenLetters[idx] = char;
          confirmedLetters.add(char);
        } else if (f === 'orange') {
          orangeLetters.add(char);
          confirmedLetters.add(char);
          if (!orangeExclusions[idx]) orangeExclusions[idx] = new Set();
          orangeExclusions[idx].add(char);
        } else if (f === 'grey') {
          greyLetters.add(char);
        }
      });
    });

    // Clean up grey letters that are actually confirmed (e.g. green in another position)
    confirmedLetters.forEach(char => {
      greyLetters.delete(char);
    });

    const targetLower = targetWord.toLowerCase();

    // Pre-create lowercase sets of clean and common words for O(1) lightning-fast lookups
    const cleanedPool = CLEANED_TURKISH_WORDS[wordLength] || [];
    const commonPool = COMMON_TURKISH_WORDS[wordLength] || [];
    const cleanedSet = new Set(cleanedPool.map(x => turkishLower(x).trim()));
    const commonSet = new Set(commonPool.map(x => turkishLower(x).trim()));

    // Helper to verify a candidate word is linguistically valid and strictly exists in COMMON_TURKISH_WORDS and CLEANED_TURKISH_WORDS pools
    const isLinguisticallyValid = (w: string): boolean => {
      const lower = turkishLower(w).trim();
      return cleanedSet.has(lower) && commonSet.has(lower);
    };

    // 2. Filter words
    const matchingWords = wordList.filter(w => {
      const word = w.toLowerCase();
      if (word.length !== wordLength) return false;
      if (word === targetLower) return false; // don't reveal the exact answer directly!

      // Check greens
      for (let i = 0; i < wordLength; i++) {
        if (greenLetters[i] !== undefined && word[i] !== greenLetters[i]) {
          return false;
        }
      }

      // Check oranges presence
      for (const char of orangeLetters) {
        if (!word.includes(char)) {
          return false;
        }
      }

      // Check orange positions exclusion
      for (let i = 0; i < wordLength; i++) {
        if (orangeExclusions[i] && orangeExclusions[i].has(word[i])) {
          return false;
        }
      }

      // Check greys exclusion
      for (const char of greyLetters) {
        if (word.includes(char)) {
          return false;
        }
      }

      // Ensure the word is linguistically valid
      return isLinguisticallyValid(word);
    });

    if (matchingWords.length > 0) {
      const idx = Math.floor(Math.random() * matchingWords.length);
      return turkishUpper(matchingWords[idx]);
    }

    // Fallback: if no perfect match, find words that match just the green letters and are linguistically valid
    const simpleMatching = wordList.filter(w => {
      const word = w.toLowerCase();
      if (word.length !== wordLength) return false;
      if (word === targetLower) return false;
      for (let i = 0; i < wordLength; i++) {
        if (greenLetters[i] !== undefined && word[i] !== greenLetters[i]) {
          return false;
        }
      }
      return isLinguisticallyValid(word);
    });

    if (simpleMatching.length > 0) {
      const idx = Math.floor(Math.random() * simpleMatching.length);
      return turkishUpper(simpleMatching[idx]);
    }

    // Secondary fallback: just pick a random word of same length that isn't the target word and is linguistically valid
    const allowed = wordList.filter(w => w.toLowerCase() !== targetLower && isLinguisticallyValid(w));
    if (allowed.length > 0) {
      return turkishUpper(allowed[Math.floor(Math.random() * allowed.length)]);
    }

    return null;
  };

  const handleGetWordSuggestion = async () => {
    if (gameStatus !== 'playing') return;
    if (profile.gold < 1) {
      showToast("Yetersiz Altın! Reklam izleyerek altın kazanabilirsiniz.", "error");
      return;
    }
    // Asynchronous non-blocking UI thread release
    await new Promise(resolve => setTimeout(resolve, 10));
    const suggestion = generateWordSuggestion();
    if (suggestion) {
      const success = await deductGold(1);
      if (success) {
        setActiveWordSuggestion(suggestion.toUpperCase());
        showToast(`Kelime Tavsiyesi Alındı: ${suggestion.toUpperCase()} 💡`, "success");
        playClickSound(settings.soundEnabled);
      }
    } else {
      showToast("Uygun bir kelime önerisi bulunamadı.", "info");
    }
  };

  const handleGetHint = async () => {
    if (gameStatus !== 'playing') return;
    if (profile.gold < 1) {
      showToast("Yetersiz Altın! Reklam izleyerek altın kazanabilirsiniz.", "error");
      return;
    }

    // Asynchronous non-blocking UI thread release
    await new Promise(resolve => setTimeout(resolve, 10));

    // Let's find unrevealed indices in targetWord
    const unrevealedIndices: number[] = [];
    const targetWordUpper = targetWord.toUpperCase();
    for (let i = 0; i < wordLength; i++) {
      const isGreenInAttempts = attempts.some(att => att.feedback[i] === 'green' && att.word[i].toUpperCase() === targetWordUpper[i]);
      const isAlreadyHinted = revealedHints[i] !== undefined;
      if (!isGreenInAttempts && !isAlreadyHinted) {
        unrevealedIndices.push(i);
      }
    }

    if (unrevealedIndices.length > 0) {
      // Whisper a correct letter
      const success = await deductGold(1);
      if (success) {
        const randomIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
        const charToReveal = targetWordUpper[randomIdx];
        setRevealedHints(prev => ({ ...prev, [randomIdx]: charToReveal }));
        setHintCount(prev => prev + 1);
        showToast("Doğru harf konumu fısıldandı! 🤫", "success");
        playClickSound(settings.soundEnabled);
      }
      return;
    }

    // Otherwise, delete an unused letter from the keyboard
    const turkishAlphabet = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    const unusedAlphabetKeys = turkishAlphabet.filter(letter => {
      const charLower = letter.toLowerCase();
      const targetLower = targetWord.toLowerCase();
      const isCharInTarget = targetLower.includes(charLower);
      const isCharAlreadyGrey = letterStatuses[letter] === 'grey';
      return !isCharInTarget && !isCharAlreadyGrey;
    });

    if (unusedAlphabetKeys.length > 0) {
      const success = await deductGold(1);
      if (success) {
        const randomKey = unusedAlphabetKeys[Math.floor(Math.random() * unusedAlphabetKeys.length)];
        setLetterStatuses(prev => ({ ...prev, [randomKey]: 'grey' }));
        setHintCount(prev => prev + 1);
        showToast(`Klavyeden kullanılmayan '${randomKey}' harfi silindi! 🧹`, "success");
        playClickSound(settings.soundEnabled);
      }
    } else {
      showToast("Tüm ipuçları zaten açık!", "info");
    }
  };

  const handleClaimDailyReward = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (profile.lastDailyLoginClaim === todayStr) {
      showToast("Bugünkü günlük giriş ödülünüzü zaten aldınız!", "info");
      return;
    }
    const currentGold = profile.gold !== undefined ? profile.gold : 20;
    const updated = {
      ...profile,
      gold: currentGold + 10,
      lastDailyLoginClaim: todayStr,
      lastUpdated: new Date().toISOString()
    };
    setProfile(updated);
    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
    showToast("Günlük giriş ödülü: 10 Altın kazandınız! 🪙", "success");
    await saveUserProfileToFirestore(updated).catch((err) => {
      console.warn("Firestore daily claim failed:", err);
    });
  };

  const handleWatchRewardedAdReward = async () => {
    const currentGold = profile.gold !== undefined ? profile.gold : 20;
    const updated = {
      ...profile,
      gold: currentGold + 10,
      lastUpdated: new Date().toISOString()
    };
    setProfile(updated);
    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
    showToast("Tebrikler! Reklam tamamlandı ve 10 Altın kazandınız! 🪙", "success");
    await saveUserProfileToFirestore(updated).catch((err) => {
      console.warn("Firestore ad reward failed:", err);
    });
  };

  const [dictionaryMode, setDictionaryMode] = useState<'tdk_online' | 'no_validation'>(() => {
    const saved = safeLocalStorage.getItem('kelimesavasi_dict_mode');
    return saved === 'no_validation' ? 'no_validation' : 'tdk_online';
  });
  const [gameMode, setGameMode] = useState<'timed' | 'untimed'>(() => {
    const saved = safeLocalStorage.getItem('kelimesavasi_game_mode');
    return saved === 'untimed' ? 'untimed' : 'timed';
  });

  useEffect(() => {
    safeLocalStorage.setItem('kelimesavasi_game_mode', gameMode);
  }, [gameMode]);

  const [duelWordLength, setDuelWordLength] = useState<number>(() => {
    const saved = safeLocalStorage.getItem('kelimesavasi_duel_word_length');
    return saved ? parseInt(saved, 10) : 5;
  });

  useEffect(() => {
    safeLocalStorage.setItem('kelimesavasi_duel_word_length', duelWordLength.toString());
  }, [duelWordLength]);

  const [matchmakingStatus, setMatchmakingStatus] = useState<'idle' | 'queued'>('idle');

  // Settings state moved up to avoid block scope issues with notification effects
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = safeLocalStorage.getItem('kelimesavasi_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed parsing settings', e);
      }
    }
    return {
      boardTheme: 'classic',
      bgTheme: 'default',
      keyboardLayout: 'Q',
      soundEnabled: true,
      hapticEnabled: true,
      fontFamily: 'poppins'
    };
  });

  useEffect(() => {
    safeLocalStorage.setItem('kelimesavasi_settings', JSON.stringify(settings));
  }, [settings]);

  // Retention notification state
  const [retentionNotification, setRetentionNotification] = useState<{ message: string } | null>(null);

  // Retention notification effect
  useEffect(() => {
    const isNotificationOn = settings.notificationEnabled !== false;
    const lastActiveStr = safeLocalStorage.getItem('kelimesavasi_last_active_time');
    const currentTime = Date.now();
    
    if (lastActiveStr && isNotificationOn) {
      try {
        const lastActiveTime = new Date(lastActiveStr).getTime();
        const diffMs = currentTime - lastActiveTime;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        if (diffDays >= 3) {
          const RETENTION_MESSAGES = [
            'Kelimeler seni özledi, günün bulmacasını kaçırma! 🧩',
            'Zihnini çalıştırmaya ne dersin? Yeni bulmaca hazır! ⚡',
            'Günün gizemli kelimesini çözüp "Günlük Bilge" rozetini kapmaya hazır mısın? 🎖️',
            'Oyuncu! Kelime tahtası boş kaldı, bugün zekanı konuşturma zamanı! ⚔️',
            'Zirvedeki yerini korumak için bugün de kelimeleri avla! 🏆'
          ];
          const randomMsg = RETENTION_MESSAGES[Math.floor(Math.random() * RETENTION_MESSAGES.length)];
          setRetentionNotification({ message: randomMsg });
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Kelime Savaşı', { body: randomMsg, icon: '/favicon.ico' });
          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification('Kelime Savaşı', { body: randomMsg, icon: '/favicon.ico' });
              }
            });
          }
        }
      } catch (e) {
        console.error('Failed checking retention inactivity', e);
      }
    }
    
    safeLocalStorage.setItem('kelimesavasi_last_active_time', new Date().toISOString());
  }, [settings.notificationEnabled]);

  // Load Daily Puzzle completion status from database on app start or when deviceId becomes available
  useEffect(() => {
    if (!deviceId) return;
    const checkDailyStatusOnStart = async () => {
      try {
        const response = await fetch(`/api/daily-puzzle?deviceId=${encodeURIComponent(deviceId)}`);
        if (response.ok) {
          const data = await response.json();
          const todayDateStr = getDailyWordAndLength().dateStr;
          if (data.solved || data.failed) {
            safeLocalStorage.setItem('kelimesavasi_daily_completed_date', todayDateStr);
            safeLocalStorage.setItem('last_played_date', todayDateStr);
            safeLocalStorage.setItem('is_daily_completed', 'true');
            if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.saveDailyPuzzleStatus) {
              try {
                (window as any).AndroidBridge.saveDailyPuzzleStatus(todayDateStr, true);
              } catch (e) {
                console.error(e);
              }
            }
            setIsDailyPuzzleCompletedToday(true);
          }
        }
      } catch (e) {
        console.error('Error fetching initial daily puzzle status:', e);
      }
    };
    checkDailyStatusOnStart();
  }, [deviceId]);

  // Manage app background / foreground state (visibility change, focus/blur)
  useEffect(() => {
    const handleAppActive = () => {
      setIsAppActive(true);
      resumeAudioContext();
    };

    const handleAppInactive = () => {
      setIsAppActive(false);
      suspendAudioContext();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleAppActive();
      } else {
        handleAppInactive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleAppActive);
    window.addEventListener('blur', handleAppInactive);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleAppActive);
      window.removeEventListener('blur', handleAppInactive);
    };
  }, []);

  // Daily Puzzle Morning Notification scheduler effect
  useEffect(() => {
    scheduleDailyNotifications();
  }, [settings.notificationEnabled]);

  // Expose retention notification simulator helper
  useEffect(() => {
    (window as any).__simulateRetentionNotification = () => {
      const RETENTION_MESSAGES = [
        'Kelimeler seni özledi, günün bulmacasını kaçırma! 🧩',
        'Zihnini çalıştırmaya ne dersin? Yeni bulmaca hazır! ⚡',
        'Günün gizemli kelimesini çözüp "Günlük Bilge" rozetini kapmaya hazır mısın? 🎖️',
        'Oyuncu! Kelime tahtası boş kaldı, bugün zekanı konuşturma zamanı! ⚔️',
        'Zirvedeki yerini korumak için bugün de kelimeleri avla! 🏆'
      ];
      const randomMsg = RETENTION_MESSAGES[Math.floor(Math.random() * RETENTION_MESSAGES.length)];
      setRetentionNotification({ message: randomMsg });
      showToast('3 Günlük Hareketsizlik Algılandı! Bildirim Simüle Edildi.', 'info');
    };
    return () => {
      delete (window as any).__simulateRetentionNotification;
    };
  }, []);

  // UI Modals / Alerts
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [showMissionsModal, setShowMissionsModal] = useState<boolean>(false);
  const [showLobbyModal, setShowLobbyModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showDefinitionModal, setShowDefinitionModal] = useState<boolean>(false);
  const [showCongratsModal, setShowCongratsModal] = useState<boolean>(false);
  const [opponentLeftDuringMatch, setOpponentLeftDuringMatch] = useState<boolean>(false);
  const [isMatchmakingLocked, setIsMatchmakingLocked] = useState<boolean>(false);
  const [unlockedBadgeToShow, setUnlockedBadgeToShow] = useState<Badge | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm,
    });
  };

  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>(profile.name);
  const [avatarInput, setAvatarInput] = useState<string | undefined>(profile.avatarUrl);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Sync nameInput and avatarInput when profile changes
  useEffect(() => {
    if (profile?.name) {
      setNameInput(profile.name);
    }
    if (profile?.avatarUrl) {
      setAvatarInput(profile.avatarUrl);
    }
  }, [profile?.name, profile?.avatarUrl]);

  // Real-time Multiplayer State
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);

  const addNetworkLog = useCallback((type: 'info' | 'error' | 'success' | 'sent' | 'received', message: string) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const newEntry: NetworkLogEntry = { timestamp, type, message };
    setNetworkLogs((prev) => {
      const updated = [newEntry, ...prev];
      return updated.slice(0, 10);
    });
  }, []);

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [reconnectCounter, setReconnectCounter] = useState<number>(0);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any | null>(null);


  const [rematchRequested, setRematchRequested] = useState<boolean>(false);
  const [opponentRematchRequested, setOpponentRematchRequested] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const wasOnlineRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const matchUnsubscribeRef = useRef<(() => void) | null>(null);
  const queueUnsubscribeRef = useRef<(() => void) | null>(null);
  const pendingMatchmakingRef = useRef<number | null>(null);
  const justLoggedInUidRef = useRef<string | null>(null);

  const handleManualReconnect = () => {
    addNetworkLog('info', 'Manuel yeniden bağlanma tetiklendi.');
    showToast('Sunucuya yeniden bağlanılıyor...', 'info');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('İnternet bağlantınız kapalı. Lütfen ağınızı kontrol edin.', 'error');
      setIsOnline(false);
      return;
    }
    setReconnectCounter((prev) => prev + 1);
  };

  // Real-time Network & Browser Online / Offline Monitor
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Network Monitor] Browser went ONLINE');
      addNetworkLog('success', 'İnternet bağlantısı sağlandı.');
      showToast('İnternet bağlantısı kuruldu.', 'success');
      setIsOnline(true);
      setReconnectCounter((prev) => prev + 1);
    };

    const handleOffline = () => {
      console.log('[Network Monitor] Browser went OFFLINE');
      addNetworkLog('error', 'İnternet bağlantısı kesildi (Çevrimdışı).');
      showToast('İnternet bağlantısı kesildi! Çevrimdışısınız.', 'error');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addNetworkLog]);

  // Apply dark mode to document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    safeLocalStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  // Listen to Firebase Auth state
  useEffect(() => {
    let active = true;
    let resolved = false;

    // 15-second graceful fallback timeout for the "Oturum Hazırlanıyor..." screen
    const timeoutId = setTimeout(() => {
      if (active && !resolved) {
        resolved = true;
        console.warn('Firebase Auth/Profile initialization timed out (15s). Falling back gracefully in background.');
        setAuthLoading(false);
      }
    }, 15000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      try {
        // Clear previous session states to avoid residual game leaks
        setAttempts([]);
        setCurrentAttempt('');
        setRevealedHints({});
        setActiveWordSuggestion(null);
        setGameStatus('idle');
        setIsValidating(false);

        if (user) {
          setFirebaseUser(user);
          try {
            window.localStorage.setItem('kelimesavasi_is_registered', (!user.isAnonymous).toString());
          } catch (e) {}

          // Check if we just completed login/registration via onAuthComplete to skip redundant heavy fetches
          if (justLoggedInUidRef.current === user.uid) {
            console.log('Skipping onAuthStateChanged sync because user was just logged in via onAuthComplete');
            if (active && !resolved) {
              resolved = true;
              setAuthLoading(false);
              clearTimeout(timeoutId);
            }
            return;
          }

          // Skip if a manual sign-in is in progress via AuthScreen to avoid race condition overwrites
          if (safeLocalStorage.getItem('kelimesavasi_signing_in') === 'true') {
            console.log('Skipping onAuthStateChanged sync because manual sign-in is in progress.');
            if (active && !resolved) {
              resolved = true;
              setAuthLoading(false);
              clearTimeout(timeoutId);
            }
            return;
          }

          // Check if we have a pending restoration profile
          const pendingRestorationJson = safeLocalStorage.getItem('pending_restoration_profile');
          if (pendingRestorationJson) {
            const restoredProfile = JSON.parse(pendingRestorationJson);
            // Move/Create the restored profile to the new authenticated uid
            const updatedProfile = {
              ...restoredProfile,
              id: user.uid,
              deviceId: deviceId, // ensure bound
              nameSet: true
            };
            setProfile(updatedProfile);
            await saveUserProfileToFirestore(updatedProfile);
            // Delete the old profile document to keep usernames unique and avoid duplicate deviceId
            if (restoredProfile.id && restoredProfile.id !== user.uid) {
              await deleteUserProfile(restoredProfile.id);
            }
            safeLocalStorage.removeItem('pending_restoration_profile');
            safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
            if (updatedProfile.name) {
              safeLocalStorage.setItem('saved_username', updatedProfile.name);
            }
            showToast(`Profiliniz başarıyla geri yüklendi: ${updatedProfile.name}! 🎉`, 'success');
            
            if (active && !resolved) {
              resolved = true;
              setAuthLoading(false);
              clearTimeout(timeoutId);
            }
          } else {
            // Standard profile loading path (with Fast-Path optimization)
            const cachedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
            let hasResolvedFast = false;
            
            if (cachedProfileStr) {
              try {
                const cachedProfile = JSON.parse(cachedProfileStr);
                if (cachedProfile && cachedProfile.id === user.uid) {
                  setProfile(cachedProfile);
                  hasResolvedFast = true;
                  if (active && !resolved) {
                    resolved = true;
                    setAuthLoading(false);
                    clearTimeout(timeoutId);
                    console.log('Fast-path optimization: resolved user session instantly using cached profile.');
                  }
                }
              } catch (e) {
                console.warn('Failed parsing cached profile for fast-path:', e);
              }
            }

            // Define the profile sync logic (can be run blocking or in background/SWR mode)
            const syncAndFetchProfile = async () => {
              const dbProfile = await fetchUserProfile(user.uid);
              if (!active) return;

              if (dbProfile) {
                const savedUsername = safeLocalStorage.getItem('saved_username');
                const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
                let finalName = dbProfile.name || '';
                let finalAvatar = dbProfile.avatarUrl || '🧠';

                const isGeneric = (n: string) => !n || n === 'Oyuncu' || n === 'Kelime Oyuncusu' || n.startsWith('Savaşçı_');

                if (savedUsername && (isGeneric(finalName) || !finalName)) {
                  finalName = savedUsername;
                } else if ((isGeneric(finalName) || !finalName) && savedProfileStr) {
                  try {
                    const parsed = JSON.parse(savedProfileStr);
                    if (parsed && parsed.name) {
                      finalName = parsed.name;
                    }
                    if (parsed && parsed.avatarUrl) {
                      finalAvatar = parsed.avatarUrl;
                    }
                  } catch (e) {}
                }

                const finalProfile = ensureProfileFields({
                  ...dbProfile,
                  name: finalName,
                  avatarUrl: finalAvatar,
                  deviceId: deviceId,
                  nameSet: !!finalName
                });

                // If the profile does not have deviceId set, has a different deviceId, or the name/avatar has changed, update Firestore!
                if (
                  !finalProfile.deviceId ||
                  finalProfile.deviceId !== deviceId ||
                  finalProfile.name !== dbProfile.name ||
                  finalProfile.avatarUrl !== dbProfile.avatarUrl
                ) {
                  finalProfile.deviceId = deviceId;
                  await saveUserProfileToFirestore(finalProfile);
                }
                setProfile(finalProfile);
                safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(finalProfile));
                if (finalProfile.name) {
                  safeLocalStorage.setItem('saved_username', finalProfile.name);
                }
              } else {
                // No profile exists for this UID. Let's trigger device profile recovery
                try {
                  const existingProfile = await fetchUserProfileByDeviceId(deviceId);
                  if (existingProfile && existingProfile.id !== user.uid) {
                    console.log('Found existing profile associated with deviceId. Auto-recovering profile...', existingProfile);
                    const savedUsername = safeLocalStorage.getItem('saved_username');
                    const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
                    let finalName = existingProfile.name || '';
                    let finalAvatar = existingProfile.avatarUrl || '🧠';
                    
                    if (!finalName && savedUsername) {
                      finalName = savedUsername;
                    } else if (!finalName && savedProfileStr) {
                      try {
                        const parsed = JSON.parse(savedProfileStr);
                        if (parsed && parsed.name) {
                          finalName = parsed.name;
                        }
                        if (parsed && parsed.avatarUrl) finalAvatar = parsed.avatarUrl;
                      } catch (e) {}
                    }
                    const updatedProfile = ensureProfileFields({
                      ...existingProfile,
                      id: user.uid,
                      name: finalName,
                      avatarUrl: finalAvatar,
                      deviceId: deviceId,
                      nameSet: !!finalName
                    });
                    setProfile(updatedProfile);
                    await saveUserProfileToFirestore(updatedProfile);
                    // Delete the old profile document to keep usernames unique and avoid duplicate deviceId
                    if (existingProfile.id) {
                      await deleteUserProfile(existingProfile.id);
                    }
                    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
                    if (updatedProfile.name) {
                      safeLocalStorage.setItem('saved_username', updatedProfile.name);
                    }
                    showToast(`Profiliniz başarıyla geri yüklendi: ${updatedProfile.name}! 🎉`, 'success');
                  } else {
                    // No existing profile found with this deviceId. Sync current profile state
                    const savedUsername = safeLocalStorage.getItem('saved_username');
                    const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
                    
                    setProfile((prevProfile) => {
                      let finalName = savedUsername || (prevProfile && prevProfile.name) || '';
                      let finalAvatar = (prevProfile && prevProfile.avatarUrl) || '🧠';
                      
                      if (!finalName && savedProfileStr) {
                        try {
                          const parsed = JSON.parse(savedProfileStr);
                          if (parsed && parsed.name) finalName = parsed.name;
                          if (parsed && parsed.avatarUrl) finalAvatar = parsed.avatarUrl;
                        } catch (e) {}
                      }
                      const updatedProfile = ensureProfileFields({
                        ...(prevProfile || {}),
                        id: user.uid,
                        name: finalName,
                        avatarUrl: finalAvatar,
                        deviceId: deviceId,
                        nameSet: !!finalName
                      } as UserProfile);
                      saveUserProfileToFirestore(updatedProfile).catch(err => console.warn(err));
                      safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
                      if (updatedProfile.name) {
                        safeLocalStorage.setItem('saved_username', updatedProfile.name);
                      }
                      return updatedProfile;
                    });
                  }
                } catch (deviceCheckErr) {
                  console.error('Error during automatic device profile recovery after auth:', deviceCheckErr);
                  // Sync current profile state as fallback
                  const savedUsername = safeLocalStorage.getItem('saved_username');
                  const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
                  
                  setProfile((prevProfile) => {
                    let finalName = savedUsername || (prevProfile && prevProfile.name) || '';
                    let finalAvatar = (prevProfile && prevProfile.avatarUrl) || '🧠';
                    
                    if (!finalName && savedProfileStr) {
                      try {
                        const parsed = JSON.parse(savedProfileStr);
                        if (parsed && parsed.name) finalName = parsed.name;
                        if (parsed && parsed.avatarUrl) finalAvatar = parsed.avatarUrl;
                      } catch (e) {}
                    }
                    const updatedProfile = ensureProfileFields({
                      ...(prevProfile || {}),
                      id: user.uid,
                      name: finalName,
                      avatarUrl: finalAvatar,
                      deviceId: deviceId,
                      nameSet: !!finalName
                    } as UserProfile);
                    saveUserProfileToFirestore(updatedProfile).catch(err => console.warn(err));
                    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
                    if (updatedProfile.name) {
                      safeLocalStorage.setItem('saved_username', updatedProfile.name);
                    }
                    return updatedProfile;
                  });
                }
              }

              if (active && !resolved) {
                resolved = true;
                setAuthLoading(false);
                clearTimeout(timeoutId);
              }
            };

            if (hasResolvedFast) {
              // Run profile sync in background so the UI renders immediately without network block!
              syncAndFetchProfile().catch((err) => {
                console.warn('Background profile sync completed with error/warning:', err);
              });
            } else {
              // Blocking path: wait for Firestore to get profile so we don't render empty screen
              await syncAndFetchProfile();
            }
          }
        } else {
          if (active) {
            setFirebaseUser(null);
            const savedUsername = safeLocalStorage.getItem('saved_username');
            const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
            const isRegisteredUser = safeLocalStorage.getItem('kelimesavasi_is_registered') === 'true';
            if (!isRegisteredUser && (savedUsername || savedProfileStr)) {
              console.log('Returning anonymous user session detected. Auto-signing in as guest to prevent AuthScreen flash...');
              try {
                await signInAsGuest();
                console.log('Auto-sign in as guest succeeded inside Auth listener.');
              } catch (guestErr) {
                console.error('Auto guest login failed in Auth listener:', guestErr);
                if (active && !resolved) {
                  resolved = true;
                  setAuthLoading(false);
                  clearTimeout(timeoutId);
                }
              }
            } else {
              // Truly new visitor. Stop loading and show registration/login.
              if (active && !resolved) {
                resolved = true;
                setAuthLoading(false);
                clearTimeout(timeoutId);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error during onAuthStateChanged processing:', err);
        if (active && !resolved) {
          resolved = true;
          setAuthLoading(false);
          clearTimeout(timeoutId);
        }
      }
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  // Persist User Profile
  useEffect(() => {
    if (profile && profile.nameSet) {
      safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(profile));
    }
  }, [profile]);

  useEffect(() => {
    safeLocalStorage.setItem('kelimesavasi_entered', hasEnteredGame.toString());
  }, [hasEnteredGame]);

  useEffect(() => {
    safeLocalStorage.setItem('kelimesavasi_dict_mode', dictionaryMode);
  }, [dictionaryMode]);

  // Toast Helper
  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Force HTTPS on remote servers
  useEffect(() => {
    if (typeof window !== 'undefined' && 
        window.location.protocol === 'http:' && 
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.startsWith('192.168.') &&
        !window.location.hostname.startsWith('10.')) {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  }, []);

  // Real-time WebSocket Connection Manager
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      if (!isMounted) return;
      const wsUrl = getWsUrl();
      console.log(`[WebSocket Manager] Connecting to: ${wsUrl}`);
      addNetworkLog('info', `Sunucuya bağlanılıyor (${wsUrl})...`);

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          console.log('[WebSocket Manager] Connected successfully!');
          setIsOnline(true);
          addNetworkLog('success', 'Sunucu bağlantısı kuruldu.');

          if (profile && profile.id) {
            try {
              ws?.send(JSON.stringify({
                type: 'join',
                id: profile.id,
                name: profile.name || 'Oyuncu',
                avatarUrl: profile.avatarUrl || ''
              }));
            } catch (e) {
              console.error('[WebSocket Manager] Error sending join message:', e);
            }
          }

          // Heartbeat ping every 25s
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'lobby' || data.type === 'online_players') {
              setLobbyPlayers(data.players || []);
            } else if (data.type === 'queued') {
              setMatchmakingStatus('queued');
              showToast('Eşleşme sırasına alındınız. Rakip aranıyor...', 'info');
            } else if (data.type === 'match_joined') {
              setMatchmakingStatus('idle');
              setIsMatchmakingLocked(false);
              const p1 = data.player1 || { id: 'p1', name: 'Oyuncu 1', avatarUrl: '' };
              const p2 = data.player2 || { id: 'p2', name: 'Oyuncu 2', avatarUrl: '' };
              const p1Id = p1.id || 'p1';
              const p2Id = p2.id || 'p2';
              const target = turkishUpper(data.targetWord || data.correctWord || '');
              if (target) setTargetWord(target);
              setActiveMatch({
                id: data.matchId,
                matchId: data.matchId,
                gameState: 'WAITING',
                targetWord: target,
                correctWord: target,
                player1: p1,
                player2: p2,
                players: {
                  [p1Id]: p1,
                  [p2Id]: p2
                },
                wordLength: data.wordLength
              });
              setWordLength(data.wordLength);
            } else if (data.type === 'match_ready') {
              const p1 = data.player1 || { id: 'p1', name: 'Oyuncu 1', avatarUrl: '' };
              const p2 = data.player2 || { id: 'p2', name: 'Oyuncu 2', avatarUrl: '' };
              const target = turkishUpper(data.targetWord || data.correctWord || '');
              if (target) setTargetWord(target);
              setActiveMatch((prev: any) => ({
                ...prev,
                gameState: 'READY',
                ...(target ? { targetWord: target, correctWord: target } : {}),
                player1: p1,
                player2: p2
              }));
              showToast('Rakip bağlandı! Oyun hazırlanıyor... ⚔️', 'info');
            } else if (data.type === 'match_start') {
              console.log('[WebSocket Manager] Match START:', data);
              const matchLen = data.wordLength || 5;
              const target = turkishUpper(data.targetWord || data.correctWord || '');
              if (target) {
                setTargetWord(target);
              }
              setWordLength(matchLen);
              setAttempts([]);
              setCurrentAttempt('');
              setLetterStatuses({});
              setGameStatus('playing');
              setHasEnteredGame(true);
              setMatchmakingStatus('idle');
              setIsMatchmakingLocked(false);
              setOpponentLeftDuringMatch(false);
              setShowCongratsModal(false);

              const p1 = data.player1 || { id: 'p1', name: 'Oyuncu 1', avatarUrl: '' };
              const p2 = data.player2 || { id: 'p2', name: 'Oyuncu 2', avatarUrl: '' };
              const p1Id = p1.id || 'p1';
              const p2Id = p2.id || 'p2';

              setActiveMatch((prev: any) => ({
                ...prev,
                id: data.matchId,
                matchId: data.matchId,
                gameState: 'PLAYING',
                status: 'playing',
                targetWord: target || prev?.targetWord || prev?.correctWord || '',
                correctWord: target || prev?.targetWord || prev?.correctWord || '',
                player1: p1,
                player2: p2,
                players: {
                  [p1Id]: p1,
                  [p2Id]: p2
                },
                wordLength: matchLen
              }));

              playEnterSound(settings.soundEnabled);
              showToast('Düello başladı! Aynı kelimeyi ilk bulan kazanır! ⚡', 'success');
            } else if (data.type === 'guess_result') {
              setIsValidating(false);
              const guessWord = data.word;
              const feedback: Array<'green' | 'orange' | 'grey'> = data.feedback ? data.feedback.map((f: string) => 
                f === 'correct' ? 'green' : f === 'present' ? 'orange' : 'grey'
              ) : [];

              setAttempts(prev => [...prev, { word: guessWord, feedback }]);
              setLetterStatuses(prev => {
                const next = { ...prev };
                guessWord.split('').forEach((letter: string, i: number) => {
                  const status = feedback[i];
                  const current = next[letter];
                  if (status === 'green') next[letter] = 'green';
                  else if (status === 'orange' && current !== 'green') next[letter] = 'orange';
                  else if (status === 'grey' && !current) next[letter] = 'grey';
                });
                return next;
              });
              setCurrentAttempt('');

              playEnterSound(settings.soundEnabled);
            } else if (data.type === 'opponent_attempt') {
              showToast(`Rakip bir tahmin yaptı! (${data.attemptCount}. deneme)`, 'info');
            } else if (data.type === 'guess_rejected') {
              setIsValidating(false);
              console.warn('[Duel Server] Guess rejected:', data.reason);
            } else if (data.type === 'match_end') {
              console.log('[WebSocket Manager] Match END:', data);
              setIsValidating(false);
              const target = data.correctWord || activeMatch?.targetWord || activeMatch?.correctWord || targetWord || '';
              if (target) {
                setTargetWord(target);
                fetchTargetWordDefinition(target);
              }

              const isWinner = Boolean(profile?.id && data.winner === profile.id);
              const isOpponentLeft = data.winReason === 'opponent_left';

              if (isOpponentLeft) {
                setOpponentLeftDuringMatch(true);
              }

              // Freeze gameStatus to idle so solo victory/loss UI is NOT triggered
              setGameStatus('idle');
              setShowCongratsModal(false);

              setActiveMatch((prev: any) => {
                const finalWinnerId = data.winner || data.winnerId || prev?.winnerId || prev?.winner;
                const updatedPlayers = { ...(prev?.players || {}) };
                Object.keys(updatedPlayers).forEach((pId) => {
                  const isThisWinner = pId === finalWinnerId;
                  const playerCurrentAttempts = (pId === profile?.id && attempts.length > 0)
                    ? attempts
                    : (data.attempts?.[pId] || updatedPlayers[pId]?.attempts || []);

                  updatedPlayers[pId] = {
                    ...updatedPlayers[pId],
                    completed: true,
                    won: isThisWinner,
                    attempts: playerCurrentAttempts
                  };
                });

                return {
                  ...prev,
                  gameState: 'FINISHED',
                  status: 'ended',
                  winner: finalWinnerId,
                  winnerId: finalWinnerId,
                  loserId: data.loser,
                  winnerName: data.winnerName,
                  winReason: data.winReason,
                  correctWord: target,
                  players: updatedPlayers
                };
              });

              if (isWinner) {
                playVictorySound(settings.soundEnabled);
                triggerVictoryCelebration(settings.soundEnabled);

                if (isOpponentLeft) {
                  showToast('Rakip oyundan ayrıldı. 🏆 Kazandınız!', 'success');
                } else {
                  showToast('🏆 Tebrikler, Canlı Düelloyu Kazandınız!', 'success');
                }

                addGold(1);
              } else {
                playDefeatSound(settings.soundEnabled);
                if (data.winner === 'draw') {
                  showToast('Berabere! İki oyuncu da kelimeyi bulamadı.', 'info');
                } else {
                  showToast('❌ Kaybettiniz! Rakip kelimeyi önce buldu.', 'error');
                }
              }
            } else if (data.type === 'opponent_left') {
              setOpponentLeftDuringMatch(true);
              showToast('Rakip oyundan ayrıldı.', 'info');
            } else if (data.type === 'challenge_received') {
              if (data.challenge) {
                setActiveChallenges((prev) => {
                  if (prev.some((c) => c.id === data.challenge.id)) return prev;
                  return [...prev, data.challenge];
                });
                showToast(`${data.challenge.challengerName || 'Bir oyuncu'} sana meydan okudu!`, 'info');
              }
            } else if (data.type === 'rematch_requested') {
              setOpponentRematchRequested(true);
              showToast('Rakip tekrar yarışmak istiyor!', 'info');
            }
          } catch (e) {
            console.error('[WebSocket Manager] Error parsing incoming message:', e);
          }
        };

        ws.onerror = (error) => {
          console.warn('[WebSocket Manager] Error event:', error);
          addNetworkLog('error', 'Sunucu bağlantı hatası.');
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          console.log(`[WebSocket Manager] Connection closed (code: ${event.code})`);
          setIsOnline(false);
          socketRef.current = null;
          if (pingInterval) clearInterval(pingInterval);

          reconnectTimeout = setTimeout(() => {
            if (isMounted) connectWebSocket();
          }, 3000);
        };
      } catch (err) {
        console.error('[WebSocket Manager] Connection instantiation failed:', err);
        setIsOnline(false);
        socketRef.current = null;
        reconnectTimeout = setTimeout(() => {
          if (isMounted) connectWebSocket();
        }, 4000);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      socketRef.current = null;
    };
  }, [profile.id, reconnectCounter]);

  const syncMatchState = (..._args: any[]) => {};


  // Yumuşak Sıfırlama (Soft Reset) Fonksiyonu
  // WebView'da sıfırdan reload yapmadan, reklamları etkilemeden ve performansı bozmadan oyunu temizler.
  const softResetGame = (length: number = wordLength, isDaily: boolean = isDailyPuzzle) => {
    if (activeMatch) {
      console.log('softResetGame skipped because activeMatch is active');
      return;
    }
    // Optimize AdMob Banner layouts and pause/resume drawing engines on native Android solo game reset
    // This MUST be called at the absolute beginning before any state or DOM updates to lock the native layouts
    if (!activeMatch && typeof window !== 'undefined' && (window as any).AndroidBridge) {
      try {
        if ((window as any).AndroidBridge.onSoloGameReset) {
          (window as any).AndroidBridge.onSoloGameReset();
        }
      } catch (e) {
        console.error("Error calling onSoloGameReset via AndroidBridge:", e);
      }
    }

    // Stop all timer intervals synchronously first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 1. Deneme sayısı sıfırlansın (attempts array'ini boşaltmak deneme sayısını 0 yapar)
    setAttempts([]);
    setCurrentAttempt('');
    setRevealedHints({});
    setHintCount(0);
    setActiveWordSuggestion(null);
    
    // 2. Ekrandaki harf kutularının içindeki text'leri temizler ve CSS renk sınıflarını (yeşil/sarı/gri) kaldırır
    // (attempts array'i ve currentAttempt temizlendiğinde React GameBoard component'i otomatik olarak her şeyi varsayılana sıfırlar)
    
    // 3. Oyun klavyesindeki harflerin (sarı/yeşil/gri) durumlarını sıfırla
    setLetterStatuses({});
    
    // 4. Listeden veya API'den yeni kelime değişkenini (targetWord) arka planda güncelle
    let picked = '';
    if (isDaily) {
      const dailyInfo = getDailyWordAndLength();
      picked = dailyInfo.word;
      length = dailyInfo.length;
      setWordLength(length);
    } else {
      const isLevel1 = getLevelForScore(profile.dailyScore) === 1;
      picked = getRandomWord(length, isLevel1);
    }

    setTargetWord(picked);
    setGameStatus('playing');
    setSecondsLeft(20);
    setWordDefinition('');
    setActiveMatch(null); // Çoklu oyuncu oda bağlantısını temizle
    setShowCongratsModal(false); // Tebrikler modalını kapat
  };

  // Start a new solo game
  const startNewGame = async (length: number = wordLength, isDaily: boolean = isDailyPuzzle) => {
    if (activeMatch) {
      console.log('startNewGame skipped because activeMatch is active');
      return;
    }
    if (!isDaily) {
      const hasGold = await deductGold(1);
      if (!hasGold) {
        setHasEnteredGame(false);
        return;
      }
    }
    setIsValidating(true);
    softResetGame(length, isDaily);
    setIsValidating(false);
  };

  // Clean up and reset game state when leaving the game screen
  useEffect(() => {
    if (!hasEnteredGame) {
      setGameStatus('idle');
      setAttempts([]);
      setCurrentAttempt('');
      setRevealedHints({});
      setActiveWordSuggestion(null);
      setSecondsLeft(20);
      setShowCongratsModal(false);
    }
  }, [hasEnteredGame]);

  // Trigger game start automatically when word length, gameMode or entering solo game changes
  useEffect(() => {
    if (hasEnteredGame && !activeMatch) {
      startNewGame(wordLength);
    }
  }, [wordLength, gameMode, hasEnteredGame, activeMatch]);

  // Instant/synchronous duel completion handler based on Firestore real-time snapshot
  const handleInstantMatchEnd = useCallback((winnerId: string) => {
    // Unconditionally allow immediate matchmaking re-entry
    setIsMatchmakingLocked(false);

    // Force clear any active timers/intervals immediately to prevent ticking, flashing, or layout changes
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Lock keypress / input listener
    isMatchEndedRef.current = true;
    setGameStatus('idle');

    setActiveMatch((prev) => {
      if (!prev) return prev;
      
      const updatedPlayers = { ...(prev.players || {}) };
      // Synchronize the final states of players
      Object.keys(updatedPlayers).forEach((pId) => {
        const isThisWinner = pId === winnerId;
        const playerCurrentAttempts = (pId === profile.id && attempts.length > 0)
          ? attempts
          : (updatedPlayers[pId]?.attempts || []);

        updatedPlayers[pId] = {
          ...updatedPlayers[pId],
          completed: true,
          won: isThisWinner,
          attempts: playerCurrentAttempts
        };
      });

      return {
        ...prev,
        status: 'ended',
        gameState: 'FINISHED',
        winner: winnerId,
        winnerId: winnerId,
        players: updatedPlayers
      };
    });

    const wordToUse = targetWord || activeMatch?.targetWord || activeMatch?.correctWord || '';
    if (wordToUse) {
      setTargetWord(wordToUse);
      fetchTargetWordDefinition(wordToUse);
    }

    if (winnerId === profile.id) {
      showToast('TEBRİKLER! Savaşı Kazandın!', 'success');
      unlockBadge('gladiator');
      updateDailyScore(200);
      triggerVictoryCelebration(settings.soundEnabled);
    } else {
      showToast('Maçı rakibin kazandı. Daha hızlı olmalısın!', 'error');
      playDefeatSound(settings.soundEnabled);
    }

    // Clean up matchmaking state in Firestore in the background
    if (profile && profile.id) {
      clearMatchmakingState(profile.id).catch((err) => {
        console.warn('Database cleanup failed in handleInstantMatchEnd:', err);
      });
    }

    // Clean up our Firestore snapshot listener
    if (matchUnsubscribeRef.current) {
      matchUnsubscribeRef.current();
      matchUnsubscribeRef.current = null;
    }
  }, [profile.id, targetWord, settings.soundEnabled]);

  const handleInstantMatchEndRef = useRef(handleInstantMatchEnd);
  useEffect(() => {
    handleInstantMatchEndRef.current = handleInstantMatchEnd;
  }, [handleInstantMatchEnd]);

  // Real-time Firestore subscription to match state for instantaneous duel ending
  useEffect(() => {
    if (activeMatch && activeMatch.id) {
      if (matchUnsubscribeRef.current) {
        matchUnsubscribeRef.current();
        matchUnsubscribeRef.current = null;
      }

      const matchRef = doc(db, 'matches', activeMatch.id);

      console.log(`Subscribing to real-time Firestore listener for match document: matches/${activeMatch.id}`);
      matchUnsubscribeRef.current = onSnapshot(matchRef, (snapshot) => {
        if (snapshot.exists()) {
          const matchData = snapshot.data();
          const isFinished = matchData.isGameOver === true || 
                             matchData.status === 'finished' || 
                             matchData.gameState === 'finished';
          const winnerId = matchData.winner || matchData.winnerId || matchData.finishedBy;

          if (isFinished && winnerId) {
            console.log(`Instant match end condition met from Firestore. Winner is: ${winnerId}`);
            handleInstantMatchEndRef.current(winnerId);
          }
        }
      }, (error) => {
        console.error(`Firestore snapshot subscription failed for matches/${activeMatch.id}:`, error);
      });
    }

    return () => {
      if (matchUnsubscribeRef.current) {
        matchUnsubscribeRef.current();
        matchUnsubscribeRef.current = null;
      }
    };
  }, [activeMatch?.id]);

  const handleLeaveMatchToMenu = useCallback(async () => {
    console.log('Centralized cleanup: returning to main menu');
    if (matchUnsubscribeRef.current) {
      matchUnsubscribeRef.current();
      matchUnsubscribeRef.current = null;
    }
    setHasEnteredGame(false);
    setIsDailyPuzzle(false);
    setActiveMatch(null);
    setGameStatus('idle');
    setMatchmakingStatus('idle');
    setAttempts([]);
    setCurrentAttempt('');
    setRevealedHints({});
    setActiveWordSuggestion(null);
    setSecondsLeft(20);
    setShowCongratsModal(false);
    setShowLobbyModal(false);
    setIsMatchmakingLocked(false);
    setOpponentLeftDuringMatch(false);
    pendingMatchmakingRef.current = null;

    // WebSocket cleanup and reconnection block
    if (socketRef.current) {
      try {
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'leave_matchmaking' }));
          socketRef.current.send(JSON.stringify({ type: 'leave_match' }));
        }
      } catch (e) {
        console.error("Error sending leave messages over WebSocket:", e);
      }
      try {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onerror = null;
        socketRef.current.onclose = null;
        socketRef.current.close();
      } catch (e) {
        console.error("Error closing socket in handleLeaveMatchToMenu:", e);
      }
      socketRef.current = null;
    }

    // Force trigger a fresh, clean WebSocket connection on return to menu
    setReconnectCounter((prev) => prev + 1);

    // Clean up matchmaking state in Firestore in the background
    if (profile && profile.id) {
      clearMatchmakingState(profile.id).catch((err) => {
        console.warn('Database cleanup failed in handleLeaveMatchToMenu:', err);
      });
    }
  }, [profile.id, opponentLeftDuringMatch]);

  // Expose yeniKelimeyeBasla globally for Android Native WebView integration
  useEffect(() => {
    (window as any).yeniKelimeyeBasla = () => {
      console.log('Android Native integration triggered: yeniKelimeyeBasla');
      startNewGame(wordLength);
    };
    (window as any).anaMenuyeDon = async () => {
      console.log('Android Native integration triggered: anaMenuyeDon');
      await handleLeaveMatchToMenu();
    };
    return () => {
      delete (window as any).yeniKelimeyeBasla;
      delete (window as any).anaMenuyeDon;
    };
  }, [wordLength, handleLeaveMatchToMenu]);

  // Countdown timer logic
  useEffect(() => {
    // Pause timer if app is not active (backgrounded) or if it is a live match
    if (!isAppActive || gameStatus !== 'playing' || isValidating || !hasEnteredGame || isDailyPuzzle || (gameMode === 'untimed' && !activeMatch) || activeMatch) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalId = setInterval(() => {
      // If the game status changes to anything other than playing, immediately abort and clear
      if (gameStatusRef.current !== 'playing') {
        clearInterval(intervalId);
        if (timerRef.current === intervalId) {
          timerRef.current = null;
        }
        return;
      }
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          if (timerRef.current === intervalId) {
            timerRef.current = null;
          }
          if (activeMatch) {
            setGameStatus('idle'); // Freeze input and state while waiting for opponent or round sync
            showToast(`Süre bitti! Rakibin tamamlaması bekleniyor...`, 'error');
            syncMatchState(attempts, attempts.length, true, false, 0);
            return 0;
          } else {
            handleGameLoss('Süre Sınırı Aşıldı');
            return 0;
          }
        }
        const nextSec = prev - 1;
        if (nextSec <= 5 && nextSec >= 1) {
          playCountdownBeepSound(settings.soundEnabled, nextSec);
        }
        return nextSec;
      });
    }, 1000);

    timerRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      if (timerRef.current === intervalId) {
        timerRef.current = null;
      }
    };
  }, [isAppActive, gameStatus, attempts.length, isValidating, hasEnteredGame, gameMode, activeMatch, isDailyPuzzle, targetWord, currentWordIndex, targetWords, cumulativeScore]); // Resets interval on attempt submission or validation change or exit or gameMode change

  // Fetch direct definition for the target word with multi-layered client-side fallbacks
  const fetchTargetWordDefinition = async (wordToFetch: string) => {
    if (!wordToFetch) return;
    setWordDefinition('loading');
    
    // Step 1: Try fetching from our robust full-stack backend with a strict timeout
    let definitionFound = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      console.log(`[Client Definition] Attempting to fetch from backend for: "${wordToFetch}"`);
      const response = await fetch(getApiUrl('/api/get-definition'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordToFetch }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.definition) {
          const isGeneric = data.definition === 'Bu kelimenin resmi sözlük tanımına şu an ulaşılamıyor.' ||
                            data.definition.includes('tanımına şu an ulaşılamıyor') ||
                            data.definition.includes('Yerel kelime listesinde kayıtlı geçerli');
          
          if (!isGeneric) {
            setWordDefinition(data.definition);
            definitionFound = true;
            return;
          } else {
            console.warn('[Client Definition] Backend returned a generic fallback definition, executing client-side fallbacks.');
          }
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.warn('[Client Definition] Backend fetch failed or timed out:', e?.message || e);
    }

    if (definitionFound) return;

    // Step 2: Fallback - Fetch directly from Wiktionary/validation source using the client-side parsing utility
    try {
      console.log(`[Client Definition Fallback] Attempting direct Wiktionary/validation query for: "${wordToFetch}"`);
      const wikiRes = await validateWordClientSide(wordToFetch, wordToFetch.length);
      if (wikiRes && wikiRes.valid && wikiRes.definition) {
        const isGeneric = wikiRes.definition.includes('bulunamadı') || 
                          wikiRes.definition.includes('Hata') ||
                          wikiRes.definition.includes('yerel sözlükte bulundu') ||
                          wikiRes.definition.includes('Wikisözlük\'te doğrulandı');
                          
        if (!isGeneric && wikiRes.definition.length > 5) {
          console.log(`[Client Definition Fallback Success] Direct Wiktionary found meaning:`, wikiRes.definition);
          setWordDefinition(wikiRes.definition);
          return;
        }
      }
    } catch (wikiErr: any) {
      console.warn('[Client Definition Fallback] Direct Wiktionary utility query failed:', wikiErr?.message || wikiErr);
    }

    // Default ultimate fallback if all layers failed
    setWordDefinition('Bu kelimenin resmi sözlük tanımına şu an ulaşılamıyor.');
  };

  // Prefetch target word definition in the background when the target word is determined (active game)
  useEffect(() => {
    if (targetWord) {
      fetchTargetWordDefinition(targetWord);
    } else {
      setWordDefinition('');
    }
  }, [targetWord]);

  const renderWordDefinition = (themeColor: 'emerald' | 'rose') => {
    if (!wordDefinition) return null;

    if (wordDefinition === 'loading') {
      return (
        <div className="w-full max-w-sm mx-auto p-4 bg-black/10 rounded-2xl border border-[#3E485A] flex items-center justify-center gap-2 animate-pulse py-4 text-center my-2">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-[10px] text-gray-400 font-medium tracking-wide font-sans">
            Kelime anlamı yükleniyor...
          </span>
        </div>
      );
    }

    const titleColorClass = themeColor === 'emerald' ? 'text-emerald-400' : 'text-rose-400';
    const borderColorClass = themeColor === 'emerald' ? 'border-emerald-500/15' : 'border-rose-500/15';

    return (
      <div className={`w-full max-w-sm mx-auto p-4 bg-black/25 rounded-2xl border ${borderColorClass} text-left space-y-1.5 transition-all duration-300 shadow-md my-2`}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-black uppercase tracking-wider ${titleColorClass} font-mono flex items-center gap-1`}>
            📖 KELİME ANLAMI
          </span>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(turkishLower(targetWord) + ' ne demek')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-amber-400 hover:underline flex items-center gap-0.5"
          >
            Google'da Ara ↗
          </a>
        </div>
        <p className="text-[11px] text-gray-300 italic font-serif leading-relaxed">
          "{wordDefinition}"
        </p>
      </div>
    );
  };

  // Handle Game Loss
  const handleGameLoss = async (reason: string = 'Hakkınız Bitti') => {
    // Stabilize AdMob banner views on Android when game is over to prevent recalculation layout loops
    // This MUST be called at the absolute beginning before any state or DOM updates to freeze/prevent layout loop flickering
    if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.preventAdLayoutLoops) {
      try {
        (window as any).AndroidBridge.preventAdLayoutLoops();
      } catch (e) {
        console.error("Error calling preventAdLayoutLoops on loss:", e);
      }
    }

    // Stop all timer intervals synchronously first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setGameStatus('lost');
    
    showToast(`Oyunu Kaybettiniz: ${reason}! Doğru Kelime: ${targetWord}`, 'error');
    playDefeatSound(settings.soundEnabled);
    
    // Fetch definition for targetWord so the user can learn its meaning even on loss!
    if (targetWord) {
      fetchTargetWordDefinition(targetWord);
    }

    if (isDailyPuzzle) {
      const { dateStr } = getDailyWordAndLength();
      safeLocalStorage.setItem('kelimesavasi_daily_completed_date', dateStr);
      safeLocalStorage.setItem('last_played_date', dateStr);
      safeLocalStorage.setItem('is_daily_completed', 'true');
      if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.saveDailyPuzzleStatus) {
        try {
          (window as any).AndroidBridge.saveDailyPuzzleStatus(dateStr, true);
        } catch (e) {
          console.error(e);
        }
      }
      setIsDailyPuzzleCompletedToday(true);
      syncDailyPuzzleProgress(attempts, false, true);
      scheduleDailyNotifications();
    }

    // Calculate updated profile state first, completely outside setProfile, to avoid side-effect triggers in render phase
    const newStats = {
      ...profile.stats,
      gamesPlayed: profile.stats.gamesPlayed + 1,
      currentStreak: 0
    };

    const updatedProfile: UserProfile = {
      ...profile,
      stats: newStats,
      lastUpdated: new Date().toISOString()
    };

    // Update React state cleanly without side effects in the updater function
    setProfile(updatedProfile);

    // Save profile asynchronously to Firestore so stats are safely synchronized
    saveUserProfileToFirestore(updatedProfile).catch((err) => {
      console.warn("Non-blocking profile save after loss failed:", err);
    });

    // Sync if multiplayer
    syncMatchState(attempts, attempts.length, true, false, 0);
  };

  // Wordle/Lingo Feedback generator
  const evaluateGuess = (guess: string, target: string): ('green' | 'orange' | 'grey')[] => {
    const cleanGuess = turkishUpper(guess);
    const cleanTarget = turkishUpper(target);
    const len = cleanGuess.length;
    const targetLetters = cleanTarget.substring(0, len).split('');
    const guessLetters = cleanGuess.split('');
    const feedback: ('green' | 'orange' | 'grey')[] = Array(len).fill('grey');
    const used = Array(len).fill(false);

    // First pass: mark greens
    for (let i = 0; i < len; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        feedback[i] = 'green';
        used[i] = true;
      }
    }

    // Second pass: mark oranges
    for (let i = 0; i < len; i++) {
      if (feedback[i] === 'green') continue;
      for (let j = 0; j < len; j++) {
        if (!used[j] && targetLetters[j] === guessLetters[i]) {
          feedback[i] = 'orange';
          used[j] = true;
          break;
        }
      }
    }

    return feedback;
  };

  // Submit Guessed Word
  const submitGuess = async () => {
    const isSelfCompleted = activeMatch 
      ? (activeMatch.players[profile.id]?.completed || activeMatch.status === 'ended' || isMatchEnded)
      : false;

    const isPlaying = activeMatch 
      ? (activeMatch.status === 'playing' || activeMatch.gameState === 'PLAYING')
      : (gameStatus === 'playing');

    if (isSelfCompleted || !isPlaying) {
      return;
    }

    if (currentAttempt.length !== wordLength) {
      showToast('Lütfen tüm harfleri doldurun!', 'error');
      playErrorSound(settings.soundEnabled);
      return;
    }

    setIsValidating(true);
    const guess = turkishUpper(currentAttempt);

    try {
      let isValid = false;
      let definition = '';
      let isConnectionError = false;

      if (dictionaryMode === 'no_validation') {
        isValid = true;
        definition = 'Doğrulama dışı serbest oyun modu.';
      } else {
        // 1. Check local persistent cache
        const cached = getCachedWord(guess, wordLength);
        if (cached) {
          isValid = cached.valid;
          definition = cached.definition;
        } else {
          // 2. Local heuristic check first (linguistics)
          const linguisticCheck = validateTurkishLinguistics(guess, wordLength);
          if (!linguisticCheck.valid) {
            isValid = false;
            definition = linguisticCheck.reason;
            setCachedWord(guess, wordLength, { valid: false, definition: linguisticCheck.reason });
          } else {
            // 3. Robust client-side validation (Local List + Wikisözlük fallback)
            try {
              const res = await validateWordClientSide(guess, wordLength);
              isValid = res.valid;
              definition = res.definition;
              setCachedWord(guess, wordLength, { valid: res.valid, definition: res.definition });
            } catch (validationErr: any) {
              console.error('[Kelime Doğrulama] Ön yüz doğrulaması başarısız oldu:', validationErr);
              // Fallback if everything is broken - let the user play
              isValid = true;
              definition = 'Kelime anlamı şu anda doğrulanamadı ancak kelime geçerlidir.';
            }
          }
        }
      }

      if (!isValid) {
        if (isConnectionError) {
          showToast('Bağlantı hatası oluştu.', 'error');
        } else {
          showToast('Kelime sözlükte bulunamadı.', 'error');
        }
        playErrorSound(settings.soundEnabled);
        setIsValidating(false);
        return;
      }

      // Server Authoritative / Hybrid Duel & Solo Guess Submission
      if (activeMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({
            type: 'submit_guess',
            matchId: activeMatch.matchId || activeMatch.id,
            word: guess,
            playerId: profile.id
          }));
        } catch (e) {
          console.warn('[WebSocket] Error sending submit_guess:', e);
        }
      }

      // Process guess locally for instant UI responsiveness & board/row updating
      let target = turkishUpper(
        (activeMatch ? (activeMatch.targetWord || activeMatch.correctWord || targetWord) : targetWord) || ''
      );

      // Robust fallback if target word is missing or mismatched in length
      if (!target || target.length !== wordLength) {
        target = turkishUpper(getRandomWord(wordLength, true));
        setTargetWord(target);
        if (activeMatch) {
          const matchId = activeMatch.matchId || activeMatch.id;
          setActiveMatch((prev: any) => prev ? { ...prev, targetWord: target, correctWord: target } : prev);
          if (matchId) {
            updateDoc(doc(db, 'matches', matchId), { targetWord: target, correctWord: target }).catch(() => {});
          }
        }
      }

      const feedback = evaluateGuess(guess, target);
      const newAttempt: GameAttempt = { word: guess, feedback };
      const updatedAttempts = [...attempts, newAttempt];
      
      // Update local keyboard character coloring
      const newLetterStatuses = { ...letterStatuses };
      guess.split('').forEach((char, index) => {
        const color = feedback[index];
        const prevColor = newLetterStatuses[char];
        if (color === 'green') {
          newLetterStatuses[char] = 'green';
        } else if (color === 'orange' && prevColor !== 'green') {
          newLetterStatuses[char] = 'orange';
        } else if (color === 'grey' && !prevColor) {
          newLetterStatuses[char] = 'grey';
        }
      });
      setLetterStatuses(newLetterStatuses);
      setAttempts(updatedAttempts);
      setCurrentAttempt('');

      // Check if won
      const hasWon = feedback.every((f) => f === 'green');

      if (isDailyPuzzle) {
        const solved = hasWon;
        const failed = !hasWon && updatedAttempts.length >= 6;
        syncDailyPuzzleProgress(updatedAttempts, solved, failed);
      }
      let scoreAwarded = 0;
      if (hasWon) {
        if (isDailyPuzzle) {
          scoreAwarded = 5;
        } else {
          const attemptsCount = updatedAttempts.length;
          scoreAwarded = calculateDynamicScore(wordLength, secondsLeft, attemptsCount, isDailyPuzzle);
          
          // Verification function to ensure scoring accuracy and reject invalid edge cases
          if (!verifyScoringAccuracy(scoreAwarded)) {
            console.warn(`Scoring verification failed for calculated score: ${scoreAwarded}. Falling back to 50.`);
            scoreAwarded = 50;
          }
        }
      }

      if (activeMatch) {
        const matchId = activeMatch.matchId || activeMatch.id;
        if (matchId) {
          const matchRef = doc(db, 'matches', matchId);
          updateDoc(matchRef, {
            [`players.${profile.id}.attempts`]: updatedAttempts,
            [`players.${profile.id}.completed`]: (hasWon || updatedAttempts.length >= 6),
            [`players.${profile.id}.won`]: hasWon
          }).catch(err => console.warn('Non-blocking Firestore update error:', err));
        }

        if (hasWon) {
          showToast(`Tebrikler! Kelimeyi doğru bildiniz! 🎉`, 'success');
          playEnterSound(settings.soundEnabled);
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setGameStatus('idle'); // Wait for server state sync (match_round_start or match_end)

          // Update Firestore atomic transaction. This guarantees only the absolute first to finish wins and triggers both instantly.
          const matchRef = doc(db, 'matches', activeMatch.id);
          runTransaction(db, async (transaction) => {
            const matchDoc = await transaction.get(matchRef);
            if (matchDoc.exists()) {
              const data = matchDoc.data();
              const alreadyEnded = data.isGameOver === true || 
                                    data.winner || 
                                    data.winnerId || 
                                    data.finishedBy || 
                                    data.status === 'finished' || 
                                    data.gameState === 'finished';
              if (alreadyEnded) {
                // Someone else already won! Do not overwrite!
                return { success: false, winner: data.winner || data.winnerId || data.finishedBy || 'opponent' };
              }
            }
            // We are the first! Mark game as over, save our ID as the winner, set status as finished
            transaction.set(matchRef, { 
              isGameOver: true, 
              winner: profile.id, 
              winnerId: profile.id, 
              finishedBy: profile.id, 
              status: 'finished', 
              gameState: 'finished' 
            }, { merge: true });
            return { success: true, winner: profile.id };
          }).then((result) => {
            if (result && !result.success) {
              console.log(`Race condition lost. Winner is actually: ${result.winner}`);
              // Fallback: we lost the race condition, so route us to defeat instantly
              handleInstantMatchEnd(result.winner || 'opponent');
            } else {
              console.log('Successfully claimed victory via atomic transaction!');
              handleInstantMatchEnd(profile.id);
            }
          }).catch((err) => {
            console.error('Failed to update Firestore match winner via transaction, falling back:', err);
            // Fallback to standard setDoc
            setDoc(matchRef, { 
              isGameOver: true, 
              winner: profile.id, 
              winnerId: profile.id, 
              finishedBy: profile.id, 
              status: 'finished', 
              gameState: 'finished' 
            }, { merge: true }).then(() => {
              handleInstantMatchEnd(profile.id);
            });
          });

          syncMatchState(updatedAttempts, updatedAttempts.length, true, true, scoreAwarded, Date.now());
        } else if (updatedAttempts.length >= 6) {
          showToast(`6 tahmin hakkınız tükendi! Diğer oyuncunun tamamlaması bekleniyor... Doğru kelime: ${targetWord}`, 'info');
          playDefeatSound(settings.soundEnabled);
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setGameStatus('idle'); // Wait for server state sync (match_round_start or match_end)
          syncMatchState(updatedAttempts, updatedAttempts.length, true, false, 0);
        } else {
          playEnterSound(settings.soundEnabled);
          syncMatchState(updatedAttempts, updatedAttempts.length, false, false, 0);
        }
      } else {
        if (hasWon) {
          setGameStatus('won');
          
          // Stop all timer intervals synchronously first to avoid background ticks or flickering
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          
          // Stabilize AdMob banner views on Android when game is over/won to prevent recalculation layout loops
          if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.preventAdLayoutLoops) {
            try {
              (window as any).AndroidBridge.preventAdLayoutLoops();
            } catch (e) {
              console.error("Error calling preventAdLayoutLoops on win:", e);
            }
          }
          
          setShowCongratsModal(true);
          if (targetWord) {
            fetchTargetWordDefinition(targetWord);
          } else {
            setWordDefinition(definition || 'Kelime başarılı bir şekilde çözüldü.');
          }
          if (isDailyPuzzle) {
            showToast(`☀️ GÜNLÜK BULMACA TAMAMLANDI! +${scoreAwarded} Puan & 'Günlük Bilge' Rozeti!`, 'success');
          } else {
            showToast(`TEBRİKLER! Kelimeyi doğru bildiniz! +${scoreAwarded} Puan`, 'success');
          }
          triggerVictoryCelebration(settings.soundEnabled);
          
          // Update user statistics & milestones
          handleGameWin(updatedAttempts.length, scoreAwarded);
        } else if (updatedAttempts.length >= 6) {
          handleGameLoss();
        } else {
          // Continue playing, reset timer back to 20s
          setSecondsLeft(20);
          if (gameMode === 'timed' && !isDailyPuzzle) {
            showToast('Deneme kabul edildi. Süre sıfırlandı!', 'success');
          }
          playEnterSound(settings.soundEnabled);
        }
      }

    } catch (e) {
      console.error('Failed to validate word', e);
      showToast('Sunucu bağlantı hatası oluştu.', 'error');
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Game Win
  const handleGameWin = (attemptCount: number, scoreAwarded: number) => {
    // Stop all timer intervals synchronously first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 1. Calculate stats updates
    const newPlayed = profile.stats.gamesPlayed + 1;
    const newWon = profile.stats.gamesWon + 1;
    const newStreak = profile.stats.currentStreak + 1;
    const newMaxStreak = Math.max(newStreak, profile.stats.maxStreak);
    const newDistribution = [...profile.stats.winDistribution];
    
    // AttemptCount is 1-indexed (index 0 corresponds to 1st attempt)
    if (attemptCount >= 1 && attemptCount <= 6) {
      newDistribution[attemptCount - 1] += 1;
    }

    const updatedStats = {
      gamesPlayed: newPlayed,
      gamesWon: newWon,
      currentStreak: newStreak,
      maxStreak: newMaxStreak,
      winDistribution: newDistribution
    };

    // Beş puandan fazla ödül hiçbir şekilde verilmesin. Puan silme diye de bir ceza olmasın.
    const cappedScoreAwarded = scoreAwarded > 0 ? Math.min(scoreAwarded, 5) : 0;
    const newScore = profile.dailyScore + cappedScoreAwarded;
    
    // Synchronously update the DOM element to keep responsiveness instant
    const scoreEl = document.getElementById('score');
    if (scoreEl) {
      scoreEl.innerText = `${newScore} Puan`;
    }

    // Missions to update progress
    const missionIncrements: { [key: string]: number } = {
      play: 1,
      win: 1,
      streak: 1,
      [`solve_${wordLength}`]: 1,
    };
    if (secondsLeft > 10) {
      missionIncrements['fast_solve'] = 1;
    }
    if (attemptCount === 1) {
      missionIncrements['perfect'] = 1;
    }

    // Compute updated missions and collect newly completed ones
    const newlyCompletedMissions: typeof profile.missions = [];
    const updatedMissions = profile.missions.map((m) => {
      const inc = missionIncrements[m.type];
      if (inc && !m.completed) {
        const newCurrent = m.current + inc;
        const isCompleted = newCurrent >= m.target;
        const updatedM = {
          ...m,
          current: newCurrent,
          completed: isCompleted
        };
        if (isCompleted) {
          newlyCompletedMissions.push(updatedM);
        }
        return updatedM;
      }
      return m;
    });

    // Increment total correct words count for the current wordLength in wordLengthStats
    const currentWordLengthStats = {
      ...(profile.wordLengthStats || {
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0
      })
    };
    const key = String(wordLength);
    currentWordLengthStats[key] = (currentWordLengthStats[key] || 0) + 1;

    // Determine which badges should be unlocked based on new progressive word length stats
    const badgesToUnlock = new Set<string>();

    const lengths = [3, 4, 5, 6, 7, 8];
    lengths.forEach(len => {
      const count = currentWordLengthStats[String(len)] || 0;
      if (count >= 10) {
        badgesToUnlock.add(`solve_${len}_10`);
      }
      if (count >= 50) {
        badgesToUnlock.add(`solve_${len}_50`);
      }
      if (count >= 150) {
        badgesToUnlock.add(`solve_${len}_150`);
      }
    });

    if (isDailyPuzzle) {
      const { dateStr } = getDailyWordAndLength();
      safeLocalStorage.setItem('kelimesavasi_daily_completed_date', dateStr);
      safeLocalStorage.setItem('last_played_date', dateStr);
      safeLocalStorage.setItem('is_daily_completed', 'true');
      
      if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.saveDailyPuzzleStatus) {
        try {
          (window as any).AndroidBridge.saveDailyPuzzleStatus(dateStr, true);
        } catch (e) {
          console.error(e);
        }
      }
      setIsDailyPuzzleCompletedToday(true);
      scheduleDailyNotifications();
    }

    // Compute updated badges array and collect newly unlocked badges
    const newlyUnlockedBadges: Badge[] = [];
    const updatedBadges = profile.badges.map((b) => {
      if (badgesToUnlock.has(b.id) && !b.unlockedAt) {
        const unlockedBadge = { ...b, unlockedAt: new Date().toISOString() };
        newlyUnlockedBadges.push(unlockedBadge);
        return unlockedBadge;
      }
      return b;
    });

    const updatedProfile: UserProfile = {
      ...profile,
      stats: updatedStats,
      dailyScore: newScore,
      badges: updatedBadges,
      missions: updatedMissions,
      wordLengthStats: currentWordLengthStats,
      lastUpdated: new Date().toISOString()
    };

    // Update React state cleanly without side effects in the updater function
    setProfile(updatedProfile);

    // Save profile asynchronously to Firestore so stats are safely synchronized
    saveUserProfileToFirestore(updatedProfile).catch((err) => {
      console.warn("Non-blocking profile save after win failed:", err);
    });

    // Safely trigger toasts and modals on macro task queue
    let staggerDelay = 100;
    
    // Show newly completed missions
    newlyCompletedMissions.forEach((m) => {
      setTimeout(() => {
        showToast(`🎯 GÜNLÜK GÖREV TAMAMLANDI: ${m.title}!`, 'success');
      }, staggerDelay);
      staggerDelay += 800;
    });

    // Show newly unlocked badges and trigger modal
    newlyUnlockedBadges.forEach((b, idx) => {
      setTimeout(() => {
        showToast(`🏆 YENİ ROZET KAZANILDI: ${b.title}!`, 'success');
        if (idx === 0) {
          setUnlockedBadgeToShow(b);
        }
      }, staggerDelay);
      staggerDelay += 1000;
    });
  };

  // Profile Badges unlocking
  const unlockBadge = (id: string) => {
    let newlyUnlocked: Badge | null = null;
    const badges = profile.badges.map((b) => {
      if (b.id === id && !b.unlockedAt) {
        newlyUnlocked = { ...b, unlockedAt: new Date().toISOString() };
        return newlyUnlocked;
      }
      return b;
    });

    if (newlyUnlocked) {
      const updatedProfile = {
        ...profile,
        badges,
        lastUpdated: new Date().toISOString()
      };
      setProfile(updatedProfile);
      
      saveUserProfileToFirestore(updatedProfile).catch((err) => {
        console.warn("Non-blocking profile save during badge unlock failed:", err);
      });

      const badgeToUnlock = newlyUnlocked;
      setTimeout(() => {
        showToast(`🏆 YENİ ROZET KAZANILDI: ${(badgeToUnlock as Badge).title}!`, 'success');
        setUnlockedBadgeToShow(badgeToUnlock);
      }, 100);
    }
  };

  // Update Mission Progress
  const updateMissionProgress = (type: string, amount: number) => {
    let completedMissionTitle: string | null = null;
    const missions = profile.missions.map((m) => {
      if (m.type === type && !m.completed) {
        const newCurrent = m.current + amount;
        const isCompleted = newCurrent >= m.target;
        if (isCompleted) {
          completedMissionTitle = m.title;
        }
        return {
          ...m,
          current: newCurrent,
          completed: isCompleted
        };
      }
      return m;
    });

    if (completedMissionTitle || missions !== profile.missions) {
      const updatedProfile = {
        ...profile,
        missions,
        lastUpdated: new Date().toISOString()
      };
      setProfile(updatedProfile);
      saveUserProfileToFirestore(updatedProfile).catch((err) => {
        console.warn("Non-blocking profile save during mission update failed:", err);
      });

      if (completedMissionTitle) {
        const title = completedMissionTitle;
        setTimeout(() => {
          showToast(`🎯 GÜNLÜK GÖREV TAMAMLANDI: ${title}!`, 'success');
        }, 100);
      }
    }
  };

  // Update Daily Score
  const updateDailyScore = (score: number) => {
    // Beş puandan fazla ödül hiçbir şekilde verilmesin. Puan silme diye de bir ceza olmasın.
    if (score <= 0) return;
    const cappedScore = Math.min(score, 5);
    const newScore = profile.dailyScore + cappedScore;

    const updatedProfile = {
      ...profile,
      dailyScore: newScore,
      lastUpdated: new Date().toISOString()
    };
    setProfile(updatedProfile);
    saveUserProfileToFirestore(updatedProfile).catch((err) => {
      console.warn("Non-blocking profile save during score update failed:", err);
    });

    const scoreEl = document.getElementById('score');
    if (scoreEl) {
      scoreEl.innerText = `${newScore} Puan`;
    }
  };

  // Reset User stats
  const resetStats = () => {
    showConfirm(
      'İstatistikleri Sıfırla',
      'Tüm ilerleme ve istatistiklerinizi sıfırlamak istediğinize emin misiniz? Bu işlem geri alınamaz.',
      () => {
        const updatedProfile = {
          ...profile,
          stats: INITIAL_STATS,
          badges: DEFAULT_BADGES,
          missions: DEFAULT_MISSIONS,
          dailyScore: 0,
          wordLengthStats: {
            "3": 0,
            "4": 0,
            "5": 0,
            "6": 0,
            "7": 0,
            "8": 0
          },
          lastUpdated: new Date().toISOString()
        };
        setProfile(updatedProfile);
        saveUserProfileToFirestore(updatedProfile).catch((err) => {
          console.warn("Non-blocking profile save during stats reset failed:", err);
        });

        const scoreEl = document.getElementById('score');
        if (scoreEl) {
          scoreEl.innerText = '0 Puan';
        }
        showToast('Tüm istatistikler sıfırlandı.', 'info');
      }
    );
  };

  // Handle Character keys typed on physical or virtual keyboard
  const onChar = (char: string) => {
    const isSelfCompleted = activeMatch?.players[profile.id]?.completed || activeMatch?.status === 'ended' || isMatchEnded;
    const isPlaying = activeMatch ? (activeMatch.status === 'playing' || activeMatch.gameState === 'PLAYING') : (gameStatus === 'playing');
    if (!isPlaying || isValidating || isSelfCompleted) return;
    const normalized = turkishUpper(char);
    if (currentAttempt.length < wordLength && /^[A-ZÇĞİÖŞÜ]$/i.test(normalized)) {
      setCurrentAttempt((prev) => prev + normalized);
      playClickSound(settings.soundEnabled);
    }
  };

  // Handle Backspace
  const onDelete = () => {
    const isSelfCompleted = activeMatch?.players[profile.id]?.completed || activeMatch?.status === 'ended' || isMatchEnded;
    const isPlaying = activeMatch ? (activeMatch.status === 'playing' || activeMatch.gameState === 'PLAYING') : (gameStatus === 'playing');
    if (!isPlaying || isValidating || isSelfCompleted) return;
    if (currentAttempt.length > 0) {
      playDeleteSound(settings.soundEnabled);
    }
    setCurrentAttempt((prev) => prev.slice(0, -1));
  };

  // References to keep the physical keyboard listener persistent and prevent listener duplication/conflicts
  const currentAttemptRef = useRef(currentAttempt);
  const gameStatusRef = useRef(gameStatus);
  const activeMatchRef = useRef(activeMatch);
  const isValidatingRef = useRef(isValidating);
  const isEditingNameRef = useRef(isEditingName);
  const showStatsModalRef = useRef(showStatsModal);
  const showLobbyModalRef = useRef(showLobbyModal);
  const showCongratsModalRef = useRef(showCongratsModal);
  const wordLengthRef = useRef(wordLength);
  const onCharRef = useRef(onChar);
  const onDeleteRef = useRef(onDelete);
  const submitGuessRef = useRef(submitGuess);
  const isMatchEndedRef = useRef(false);

  useEffect(() => {
    currentAttemptRef.current = currentAttempt;
    gameStatusRef.current = gameStatus;
    activeMatchRef.current = activeMatch;
    isValidatingRef.current = isValidating;
    isEditingNameRef.current = isEditingName;
    showStatsModalRef.current = showStatsModal;
    showLobbyModalRef.current = showLobbyModal;
    showCongratsModalRef.current = showCongratsModal;
    wordLengthRef.current = wordLength;
    onCharRef.current = onChar;
    onDeleteRef.current = onDelete;
    submitGuessRef.current = submitGuess;
    isMatchEndedRef.current = isMatchEnded;
  });

  // Bind physical keyboard listeners exactly once on mount to prevent double keypresses and WebView input lag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentMatch = activeMatchRef.current;
      const isSelfCompleted = currentMatch?.players[profile.id]?.completed || currentMatch?.status === 'ended' || isMatchEndedRef.current;
      const isPlaying = currentMatch ? (currentMatch.status === 'playing' || currentMatch.gameState === 'PLAYING') : (gameStatusRef.current === 'playing');

      if (
        e.metaKey || 
        e.ctrlKey || 
        e.altKey || 
        isEditingNameRef.current || 
        showStatsModalRef.current || 
        showLobbyModalRef.current ||
        showCongratsModalRef.current ||
        !isPlaying ||
        isValidatingRef.current ||
        isSelfCompleted
      ) {
        return;
      }

      if (e.key === 'Enter') {
        submitGuessRef.current();
      } else if (e.key === 'Backspace') {
        onDeleteRef.current();
      } else {
        const key = turkishUpper(e.key);
        if (key.length === 1 && /^[A-ZÇĞİÖŞÜ]$/i.test(key)) {
          onCharRef.current(key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle profile change
  const saveProfile = () => {
    if (nameInput.trim().length === 0) return;
    const updatedName = nameInput.trim();
    const updatedAvatar = avatarInput;
    
    setProfile((prev) => {
      const updated = {
        ...prev,
        name: updatedName,
        avatarUrl: updatedAvatar,
        nameSet: true
      };
      
      // Persist to local storage
      try {
        safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
        safeLocalStorage.setItem('saved_username', updatedName);
      } catch (e) {
        console.warn('Error saving profile to local storage:', e);
      }
      
      // Persist to Firestore database
      saveUserProfileToFirestore(updated).catch((err) => {
        console.warn("Error saving profile to Firestore database:", err);
      });
      
      // Inform websocket if connection is alive so matchmaking/challenges instantly reflect the new name!
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'join',
          id: updated.id,
          name: updatedName,
          avatarUrl: updatedAvatar
        }));
      }
      
      return updated;
    });
    
    setIsEditingName(false);
    showToast('Profiliniz başarıyla güncellendi.', 'success');
  };

  // Handle Multiplayer Challenge Actions
  const handleChallengePlayer = (player: any, length: number) => {
    if (!isOnline || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      showToast('Meydan okumak için sunucuya bağlı olmalısınız.', 'error');
      return;
    }
    socketRef.current.send(JSON.stringify({
      type: 'challenge',
      challengedId: player.id,
      wordLength: length
    }));
    showToast(`${player.name} oyuncusuna meydan okundu, yanıt bekleniyor...`, 'info');
  };

  const handleAcceptChallenge = (challengeId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'challenge_respond',
        challengeId,
        accept: true
      }));
      setActiveChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
  };

  const handleDeclineChallenge = (challengeId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'challenge_respond',
        challengeId,
        accept: false
      }));
      setActiveChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
  };

  const handleLeaveMatch = async () => {
    if (activeMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'leave_match',
        matchId: activeMatch.id
      }));
    }
    await handleLeaveMatchToMenu();
  };



  const handleStartMatchmaking = async (matchWordsCount?: number) => {
    if (isMatchmakingLocked) {
      showToast('Eşleşme kuyruğuna giriş geçici olarak kilitlendi. Lütfen birkaç saniye bekleyin.', 'info');
      return;
    }

    if (matchmakingStatus === 'queued') {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ type: 'leave_matchmaking' }));
        } catch (e) {
          console.error("Error sending leave_matchmaking over WS:", e);
        }
      }
      setMatchmakingStatus('idle');
      if (queueUnsubscribeRef.current) {
        queueUnsubscribeRef.current();
        queueUnsubscribeRef.current = null;
      }
      if (profile && profile.id) {
        deleteDoc(doc(db, 'matchmaking_queue', profile.id)).catch(() => {});
        clearMatchmakingState(profile.id).catch((err) => {
          console.warn('Database cleanup failed in handleStartMatchmaking leave:', err);
        });
      }
      showToast('Eşleşme araması iptal edildi.', 'info');
      return;
    }

    // Deduct 1 gold entry fee for Canlı Oyun
    const hasGold = await deductGold(1);
    if (!hasGold) return;

    // RADICAL CLEANUP BEFORE STARTING MATCHMAKING
    console.log("Radical matchmaking starting: performing complete database and socket cleanup first...");
    setMatchmakingStatus('queued');
    setActiveMatch(null);
    setGameStatus('idle');
    setAttempts([]);
    setCurrentAttempt('');
    setRevealedHints({});
    setActiveWordSuggestion(null);
    
    if (queueUnsubscribeRef.current) {
      queueUnsubscribeRef.current();
      queueUnsubscribeRef.current = null;
    }

    if (profile && profile.id) {
      clearMatchmakingState(profile.id).catch((err) => {
        console.warn('Database cleanup failed in handleStartMatchmaking join:', err);
      });
    }

    const targetLen = matchWordsCount || duelWordLength || 5;

    // Send WebSocket join if available
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({
          type: 'join_matchmaking',
          wordLength: targetLen,
          id: profile.id,
          name: profile.name || 'Oyuncu',
          avatarUrl: profile.avatarUrl || ''
        }));
      } catch (e) {
        console.warn("WebSocket join attempt failed:", e);
      }
    } else {
      // Reconnect WebSocket in background
      setReconnectCounter((prev) => prev + 1);
    }

    // Firestore Real-time Matchmaking Queue
    try {
      const myQueueRef = doc(db, 'matchmaking_queue', profile.id);
      const queueData = {
        id: profile.id,
        playerId: profile.id,
        name: profile.name || 'Oyuncu',
        avatarUrl: profile.avatarUrl || '',
        wordLength: targetLen,
        status: 'waiting',
        createdAt: serverTimestamp(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(myQueueRef, queueData);

      // Listen to our queue document for matchmaking results
      queueUnsubscribeRef.current = onSnapshot(myQueueRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === 'matched' && data.matchId) {
            console.log("[Firestore Matchmaking] Matched via Firestore snapshot! Match ID:", data.matchId);
            const matchLen = data.wordLength || targetLen;
            const word = data.correctWord || data.targetWord;
            
            setActiveMatch({
              id: data.matchId,
              matchId: data.matchId,
              gameState: 'PLAYING',
              status: 'playing',
              targetWord: word,
              correctWord: word,
              player1: data.player1 || { id: profile.id, name: profile.name || 'Oyuncu', avatarUrl: profile.avatarUrl || '' },
              player2: data.player2 || data.opponent || { id: 'opponent', name: 'Rakip', avatarUrl: '' },
              players: data.players || {
                [profile.id]: { id: profile.id, name: profile.name || 'Oyuncu', avatarUrl: profile.avatarUrl || '' },
                [(data.opponent?.id || 'opponent')]: data.opponent || { id: 'opponent', name: 'Rakip' }
              },
              wordLength: matchLen
            });
            setTargetWord(word);
            setWordLength(matchLen);
            setAttempts([]);
            setCurrentAttempt('');
            setLetterStatuses({});
            setGameStatus('playing');
            setHasEnteredGame(true);
            setMatchmakingStatus('idle');
            setIsMatchmakingLocked(false);
            showToast('Düello başladı! Aynı kelimeyi ilk bulan kazanır! ⚡', 'success');

            deleteDoc(myQueueRef).catch(() => {});
            if (queueUnsubscribeRef.current) {
              queueUnsubscribeRef.current();
              queueUnsubscribeRef.current = null;
            }
          }
        }
      }, (error) => {
        console.warn("[Firestore Queue Listener] Snapshot stream notification:", error?.message || error);
      });

      // Search Firestore queue for waiting opponents
      const q = query(
        collection(db, 'matchmaking_queue'),
        where('wordLength', '==', targetLen),
        where('status', '==', 'waiting')
      );

      const querySnap = await getDocs(q);
      const waitingDocs = querySnap.docs.filter(d => d.id !== profile.id);

      if (waitingDocs.length > 0) {
        const oppDoc = waitingDocs[0];
        const oppData = oppDoc.data();
        const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const word = turkishUpper(getRandomWord(targetLen, true));

        console.log(`[Firestore Matchmaking] Match found in queue! Opponent: ${oppData.name}. Creating match ${matchId} with word ${word}`);

        const matchPayload = {
          id: matchId,
          matchId,
          wordLength: targetLen,
          targetWord: word,
          correctWord: word,
          gameState: 'PLAYING',
          status: 'playing',
          createdAt: new Date().toISOString(),
          player1: { id: oppData.playerId, name: oppData.name || 'Oyuncu', avatarUrl: oppData.avatarUrl || '' },
          player2: { id: profile.id, name: profile.name || 'Oyuncu', avatarUrl: profile.avatarUrl || '' },
          players: {
            [oppData.playerId]: { id: oppData.playerId, name: oppData.name || 'Oyuncu', avatarUrl: oppData.avatarUrl || '', attempts: [], completed: false, won: false },
            [profile.id]: { id: profile.id, name: profile.name || 'Oyuncu', avatarUrl: profile.avatarUrl || '', attempts: [], completed: false, won: false }
          },
          isGameOver: false,
          winner: null
        };

        // Create match documents in Firestore
        await setDoc(doc(db, 'matches', matchId), matchPayload);
        await setDoc(doc(db, 'rooms', matchId), matchPayload);

        // Notify opponent via their queue document
        await updateDoc(doc(db, 'matchmaking_queue', oppData.playerId), {
          status: 'matched',
          matchId,
          correctWord: word,
          targetWord: word,
          wordLength: targetLen,
          player1: matchPayload.player1,
          player2: matchPayload.player2,
          players: matchPayload.players,
          opponent: { id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl }
        }).catch((err) => {
          console.warn("[Firestore Matchmaking] Failed updating opponent queue doc:", err);
        });

        // Launch match for ourselves
        setActiveMatch(matchPayload);
        setTargetWord(word);
        setWordLength(targetLen);
        setAttempts([]);
        setCurrentAttempt('');
        setLetterStatuses({});
        setGameStatus('playing');
        setHasEnteredGame(true);
        setMatchmakingStatus('idle');
        setIsMatchmakingLocked(false);
        showToast('Rakip bulundu! Düello başladı! ⚡', 'success');

        deleteDoc(myQueueRef).catch(() => {});
        if (queueUnsubscribeRef.current) {
          queueUnsubscribeRef.current();
          queueUnsubscribeRef.current = null;
        }
      }
    } catch (err) {
      console.error("[Firestore Matchmaking] Error during queueing:", err);
    }
  };

  const syncDailyPuzzleProgress = async (updatedAttempts: GameAttempt[], solved: boolean, failed: boolean) => {
    try {
      await fetch('/api/daily-puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          attempts: updatedAttempts,
          solved,
          failed
        })
      });
    } catch (e) {
      console.error('Error syncing daily puzzle progress:', e);
    }
  };

  const todayDateStr = getDailyWordAndLength().dateStr;

  const handleStartDailyPuzzle = async () => {
    if (isDailyPuzzleCompletedToday) {
      showToast('Bugünkü hakkınızı doldurdunuz, yeni kelime yarın gelecek!', 'info');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch(`/api/daily-puzzle?deviceId=${encodeURIComponent(deviceId)}`);
      if (!response.ok) {
        throw new Error('Could not fetch daily puzzle status');
      }
      const data = await response.json();
      const dailyInfo = getDailyWordAndLength();

      if (data.solved || data.failed) {
        showToast('Bugünkü hakkınızı doldurdunuz, yeni kelime yarın gelecek!', 'info');
        safeLocalStorage.setItem('kelimesavasi_daily_completed_date', dailyInfo.dateStr);
        safeLocalStorage.setItem('last_played_date', dailyInfo.dateStr);
        safeLocalStorage.setItem('is_daily_completed', 'true');
        if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.saveDailyPuzzleStatus) {
          try {
            (window as any).AndroidBridge.saveDailyPuzzleStatus(dailyInfo.dateStr, true);
          } catch (e) {
            console.error(e);
          }
        }
        setIsDailyPuzzleCompletedToday(true);
        scheduleDailyNotifications();
        setIsValidating(false);
        return;
      }

      setIsDailyPuzzle(true);
      setHasEnteredGame(true);
      
      setWordLength(dailyInfo.length);
      setTargetWord(dailyInfo.word);
      setRevealedHints({});
      setActiveWordSuggestion(null);
      setSecondsLeft(20);
      setWordDefinition('');
      setLetterStatuses({});
      setActiveMatch(null);

      if (data.attempts && data.attempts.length > 0) {
        setAttempts(data.attempts);
        setCurrentAttempt('');
        
        const letterStatusesMap: { [key: string]: 'green' | 'orange' | 'grey' } = {};
        data.attempts.forEach((attempt: GameAttempt) => {
          attempt.feedback.forEach((feedbackItem, index) => {
            const letter = attempt.word[index];
            const status = feedbackItem;
            const currentStatus = letterStatusesMap[letter];
            if (status === 'green') {
              letterStatusesMap[letter] = 'green';
            } else if (status === 'orange' && currentStatus !== 'green') {
              letterStatusesMap[letter] = 'orange';
            } else if (status === 'grey' && !currentStatus) {
              letterStatusesMap[letter] = 'grey';
            }
          });
        });
        setLetterStatuses(letterStatusesMap);
        showToast('Kaldığınız yerden devam ediyorsunuz!', 'success');
      } else {
        setAttempts([]);
        setCurrentAttempt('');
      }

      setGameStatus('playing');
    } catch (error) {
      console.error('Error loading daily puzzle:', error);
      setIsDailyPuzzle(true);
      setHasEnteredGame(true);
      const dailyInfo = getDailyWordAndLength();
      startNewGame(dailyInfo.length, true);
    } finally {
      setIsValidating(false);
    }
  };

  const handleUpdateProfile = async (name: string, avatarUrl?: string) => {
    const cleanName = name.trim();
    const updated = {
      ...profile,
      name: cleanName,
      ...(avatarUrl ? { avatarUrl } : {}),
      nameSet: true
    };
    setProfile(updated);
    setNameInput(cleanName);
    if (avatarUrl) setAvatarInput(avatarUrl);
    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
    safeLocalStorage.setItem('saved_username', cleanName);
    saveUserProfileToFirestore(updated).catch((err) => {
      console.warn('Non-blocking profile save during handleUpdateProfile failed:', err);
    });
    showToast('Profiliniz güncellendi.', 'success');
  };

  const getBgThemeClass = () => {
    switch (settings.bgTheme) {
      case 'sapphire':
        return 'bg-app-sapphire text-theme-primary';
      case 'forest':
        return 'bg-app-forest text-theme-primary';
      case 'amethyst':
        return 'bg-app-amethyst text-theme-primary';
      case 'nord':
        return 'bg-app-nord text-theme-primary';
      case 'default':
      default:
        return 'bg-app-default text-theme-primary';
    }
  };

  const getFontFamilyClass = () => {
    switch (settings.fontFamily) {
      case 'montserrat':
        return 'font-montserrat';
      case 'fredoka':
        return 'font-fredoka';
      case 'inter':
        return 'font-inter';
      case 'pacifico':
        return 'font-pacifico';
      case 'roboto-mono':
        return 'font-roboto-mono';
      case 'poppins':
      default:
        return 'font-poppins';
    }
  };

  const opponent = activeMatch ? Object.values(activeMatch.players).find(p => (p as any).name !== profile.name) as any : null;
  const isMatchEnded = !!(activeMatch && activeMatch.status === 'ended');

  // Triggers when 1v1 match ends (isMatchEnded turns true) or when user exits a match, loading AdMob asynchronously in the background and freeing layout calculations
  useEffect(() => {
    if (isMatchEnded && activeMatch) {
      console.log("1v1 Match ended. Executing layout freeze and scheduling background AdMob banner load.");
      
      // Force block game input states immediately
      setGameStatus('idle');

      // Stop all timer intervals
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Force set isMatchEndedRef.current to true so keyboard listener ignores any events
      isMatchEndedRef.current = true;

      // Identify Winner & Loser
      const playersList = Object.entries(activeMatch.players);
      let winnerId = '';
      let winnerName = 'Bilinmeyen Oyuncu';
      let winnerScore = 0;
      let loserId = '';
      let loserName = 'Bilinmeyen Oyuncu';
      let loserScore = 0;

      const winnerEntry = playersList.find(([_, pState]: [string, any]) => pState.won);
      const bothCompleted = playersList.length === 2 && playersList.every(([_, pState]: [string, any]) => pState.completed);
      const neitherWon = playersList.every(([_, pState]: [string, any]) => !pState.won);

      if (activeMatch.winnerId === 'draw' || (bothCompleted && neitherWon)) {
        winnerId = 'draw';
        winnerName = 'Berabere';
        winnerScore = 0;
        loserId = 'draw';
        loserName = 'Berabere';
        loserScore = 0;
      } else if (winnerEntry) {
        winnerId = winnerEntry[0];
        winnerName = (winnerEntry[1] as any).name || 'Oyuncu';
        winnerScore = (winnerEntry[1] as any).score || 0;

        const loserEntry = playersList.find(([pId, _]: [string, any]) => pId !== winnerId);
        if (loserEntry) {
          loserId = loserEntry[0];
          loserName = (loserEntry[1] as any).name || 'Oyuncu';
          loserScore = (loserEntry[1] as any).score || 0;
        }
      } else if (activeMatch.winnerId && activeMatch.winnerId !== 'draw') {
        winnerId = activeMatch.winnerId;
        const winnerPlayer = activeMatch.players[winnerId];
        if (winnerPlayer) {
          winnerName = (winnerPlayer as any).name || 'Oyuncu';
          winnerScore = (winnerPlayer as any).score || 0;
        }

        const loserEntry = playersList.find(([pId, _]: [string, any]) => pId !== winnerId);
        if (loserEntry) {
          loserId = loserEntry[0];
          loserName = (loserEntry[1] as any).name || 'Oyuncu';
          loserScore = (loserEntry[1] as any).score || 0;
        }
      } else {
        // Fallback or Tie
        const sorted = [...playersList].sort((a: any, b: any) => (b[1].score || 0) - (a[1].score || 0));
        if (sorted[0]) {
          winnerId = sorted[0][0];
          winnerName = (sorted[0][1] as any).name || 'Oyuncu';
          winnerScore = (sorted[0][1] as any).score || 0;
        }
        if (sorted[1]) {
          loserId = sorted[1][0];
          loserName = (sorted[1][1] as any).name || 'Oyuncu';
          loserScore = (sorted[1][1] as any).score || 0;
        }
      }

      if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
        try {
          (window as any).AndroidBridge.loadAdBackground();
          if ((window as any).AndroidBridge.redirectToResultActivity) {
            console.log("Directing both players to native ResultActivity...");
            (window as any).AndroidBridge.redirectToResultActivity(
              winnerId,
              winnerName,
              winnerScore,
              loserId,
              loserName,
              loserScore,
              activeMatch.targetWord || '',
              winnerId === profile.id // isWinner
            );
          }
        } catch (e) {
          console.error("Error calling native AndroidBridge:", e);
        }
      }
    }
  }, [isMatchEnded, activeMatch]);



  const isAndroidApp = typeof window !== 'undefined' && !!(window as any).AndroidBridge;

  return (
    <div className={`h-screen max-h-screen overflow-hidden flex flex-col transition-all duration-300 ${getBgThemeClass()} ${getFontFamilyClass()} ${isAndroidApp ? 'android-hybrid' : ''}`}>
      {/* Safe Space for Future Top Banner Ad */}
      <div className="h-[50px] w-full shrink-0 flex items-center justify-center border-b border-[#3E485A]/15 bg-black/35 text-[#FAF6E9]/40 font-mono text-[9px] tracking-widest select-none uppercase" id="top-ad-placeholder">
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-stretch justify-stretch w-full max-w-full relative overflow-hidden">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-20 z-50 left-1/2 transform -translate-x-1/2 px-4 py-2.5 rounded-xl border flex items-center gap-2.5 text-xs sm:text-sm font-semibold shadow-lg transition duration-200 animate-slide-in ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-300'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-300'
              : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/90 dark:border-blue-800 dark:text-blue-300'
          }`}>
            <AlertCircle size={16} />
            <span>{toast.message}</span>
          </div>
        )}

        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#FAF6E9] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-[#FAF6E9]/60">Kullanıcı Oturumu Hazırlanıyor...</p>
          </div>
        ) : !firebaseUser ? (
          <AuthScreen
            onAuthComplete={(updatedProfile, fUser) => {
              safeLocalStorage.removeItem('kelimesavasi_signing_in');
              if (fUser && fUser.uid) {
                justLoggedInUidRef.current = fUser.uid;
              }
              // Always ensure deviceId and nameSet are saved
              updatedProfile.deviceId = deviceId;
              updatedProfile.nameSet = true;

              setProfile(updatedProfile);
              setNameInput(updatedProfile.name || '');
              setAvatarInput(updatedProfile.avatarUrl || '🧠');
              setFirebaseUser(fUser);

              safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
              if (updatedProfile.name) {
                safeLocalStorage.setItem('saved_username', updatedProfile.name);
              }

              // Always persist the newly authenticated profile to Firestore
              saveUserProfileToFirestore(updatedProfile).catch((err) => {
                console.warn('Non-blocking profile save during onAuthComplete failed:', err);
              });
              
              // Inform websocket if connection is alive
              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                  type: 'join',
                  id: updatedProfile.id,
                  name: updatedProfile.name,
                  avatarUrl: updatedProfile.avatarUrl
                }));
              }
              showToast('Başarıyla giriş yapıldı!', 'success');
            }}
          />
        ) : !hasEnteredGame ? (
          <WelcomeScreen
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            onUpdateFriends={async (newFriends: string[]) => {
              const updated = {
                ...profile,
                friends: newFriends
              };
              setProfile(updated);
              await saveUserProfileToFirestore(updated);
            }}
            dictionaryMode={dictionaryMode}
            onChangeDictionaryMode={setDictionaryMode}
            gameMode={gameMode}
            onChangeGameMode={setGameMode}
            wordLength={wordLength}
            onChangeWordLength={setWordLength}
            duelWordLength={duelWordLength}
            onChangeDuelWordLength={setDuelWordLength}
            onStartSoloGame={() => {
              setHasEnteredGame(true);
            }}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenMissions={() => setShowMissionsModal(true)}
            onOpenStats={() => setShowStatsModal(true)}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
            isOnline={isOnline}
            onReconnect={handleManualReconnect}
            onStartDailyPuzzle={handleStartDailyPuzzle}
            isDailyPuzzleCompletedToday={isDailyPuzzleCompletedToday}
            onAddGold={addGold}
            onDeductGold={deductGold}
            onClaimDailyReward={handleClaimDailyReward}
            onWatchRewardedAdReward={handleWatchRewardedAdReward}
            onStartMatchmaking={async (wordsCount) => {
              await handleStartMatchmaking(wordsCount);
            }}
            matchmakingStatus={matchmakingStatus}
          />
        ) : (
          <>
            {/* Back to welcome & Compact control panel block */}
            {!activeMatch && (
              <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] flex flex-col gap-2 mb-2 animate-fadeIn">
                {/* Row 1: Back to entry screen, Pes Et & Yenile */}
                <div className="flex justify-between items-center w-full">
                  <button
                    onClick={() => {
                      if (gameStatus === 'playing' && attempts.length > 0 && !isDailyPuzzle) {
                        showConfirm(
                          'Oyundan Çık',
                          'Mevcut oyundan çıkıp giriş ekranına dönmek istiyor musunuz? İlerlemeniz sıfırlanacaktır.',
                          () => {
                            setHasEnteredGame(false);
                            setIsDailyPuzzle(false);
                          }
                        );
                      } else {
                        setHasEnteredGame(false);
                        setIsDailyPuzzle(false);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-2 text-[11px] font-black uppercase tracking-wider bg-[#FAF6E9] hover:bg-[#F3EFE0] text-[#2E3748] border border-[#EBE6D5] rounded-xl shadow-md transition duration-150 active:scale-[0.97] cursor-pointer"
                  >
                    <span>Giriş Ekranı</span>
                  </button>

                  {!isDailyPuzzle && !activeMatch && (
                    <div className="flex items-center gap-1.5">
                      {gameStatus === 'playing' && (
                        <button
                          onClick={() => {
                            showConfirm(
                              'Pes Et',
                              'Pes etmek ve doğru kelimeyi görmek istediğinize emin misiniz?',
                              () => {
                                handleGameLoss('Pes Ettiniz');
                              }
                            );
                          }}
                          className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/20 transition duration-150 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider font-mono cursor-pointer shrink-0"
                          title="Pes Et ve Kelimeyi Gör"
                        >
                          <AlertCircle size={12} className="stroke-[2.5]" />
                          Pes Et
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (gameStatus === 'playing' && attempts.length > 0) {
                            showConfirm(
                              'Oyunu Yeniden Başlat',
                              'Oyunu yeniden başlatmak istiyor musunuz? Mevcut ilerleme sıfırlanacaktır.',
                              () => {
                                startNewGame(wordLength);
                              }
                            );
                          } else {
                            startNewGame(wordLength);
                          }
                        }}
                        className="px-2.5 py-2 rounded-xl bg-[#FAF6E9] hover:bg-[#F3EFE0] text-[#2E3748] border border-[#EBE6D5] font-black transition duration-150 flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono cursor-pointer shrink-0"
                        title="Yeni Kelime Al"
                      >
                        <RotateCcw size={12} className="stroke-[2.5]" />
                        Yenile
                      </button>
                    </div>
                  )}
                </div>

                {/* Row 2: Harf Sayısı Selector & Mode tag */}
                {!isDailyPuzzle && !activeMatch && (
                  <div className="flex justify-between items-center w-full bg-[#3D4756]/85 backdrop-blur-md border border-[#3E485A] rounded-xl px-2.5 py-1.5 shadow-sm text-white">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider font-mono">Harf:</span>
                      <div className="flex gap-0.5 bg-black/30 p-0.5 rounded-lg">
                        {[3, 4, 5, 6, 7, 8].map((len) => (
                          <button
                            key={len}
                            onClick={() => {
                              if (gameStatus === 'playing' && attempts.length > 0) {
                                showConfirm(
                                  'Harf Sayısını Değiştir',
                                  'Mevcut oyunu sıfırlayıp harf sayısını değiştirmek istediğinize emin misiniz?',
                                  () => {
                                    setWordLength(len);
                                  }
                                );
                              } else {
                                setWordLength(len);
                              }
                            }}
                            className={`w-6.5 h-6.5 rounded-md text-[10px] font-black transition-all duration-150 flex items-center justify-center cursor-pointer ${
                              wordLength === len
                                ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 shadow-xs scale-105'
                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {len}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] font-bold text-gray-300 flex items-center gap-1 font-mono uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      <span>{gameMode === 'timed' ? 'Süreli' : 'Süresiz'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Real-time Match Split View Banner */}
        {activeMatch && (
          <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-2.5 mb-2.5 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Swords size={20} className="text-emerald-500 shrink-0" />
              <div className="text-left">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-bold text-xs text-gray-800 dark:text-white">Kelime Savaşı Sürüyor!</h4>
                  {activeMatch.matchWordsCount && (
                    <span className="text-[9px] font-black font-mono bg-emerald-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      Canlı Düello ⚡
                    </span>
                  )}
                </div>
                {activeMatch.roundsWon && (
                  <div className="flex gap-2.5 mt-0.5 text-[10px] font-bold font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400">SEN: {activeMatch.roundsWon[profile.id] || 0}</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-amber-500">RAKİP: {activeMatch.roundsWon[opponent?.id || ''] || 0}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Scoreboard Split */}
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 px-2 py-1 rounded-lg shadow-xs border border-gray-100 dark:border-gray-800">
                <div className="text-left">
                  <span className="text-[9px] text-gray-400 font-bold block leading-none">SEN</span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{attempts.length} Dn</span>
                </div>
              </div>

              <div className="text-xs font-bold text-gray-300 font-mono">VS</div>

              <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 px-2 py-1 rounded-lg shadow-xs border border-gray-100 dark:border-gray-800">
                <div className="text-left">
                  <span className="text-[9px] text-gray-400 font-bold block truncate max-w-[50px] leading-none">{opponent?.name?.toUpperCase() || 'RAKİP'}</span>
                  <span className="text-[11px] font-bold text-amber-500">
                    {opponent?.attempts?.length || 0} Dn
                  </span>
                </div>
              </div>

              <button
                onClick={handleLeaveMatch}
                className="text-[10px] bg-rose-500 hover:bg-rose-600 text-white font-extrabold px-2 py-1 rounded-lg cursor-pointer"
              >
                Çık
              </button>
            </div>
          </div>
        )}

        {/* Game Layout Wrapper */}
        <div className="w-full flex-1 min-h-0 flex flex-col items-stretch justify-stretch gap-0.5 sm:gap-1 relative z-10">
          {/* Game Area Card */}
          <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto card-theme rounded-[1.5rem] border border-[#3E485A]/30 p-2 sm:p-3 shadow-2xl flex flex-col items-center justify-between flex-1 min-h-0 overflow-hidden gap-y-0.5 transition-all duration-200 relative text-white" id="game-area-card">
          {/* Subtle atmospheric ambient glow inside the card */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

          {isMatchEnded && isAndroidApp && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
              <h2 className="text-xl font-black text-white tracking-wide mb-2 uppercase">DÜELLO TAMAMLANDI!</h2>
              <p className="text-xs text-slate-400">Sonuç ekranına güvenli bir şekilde yönlendiriliyorsunuz...</p>
            </div>
          )}

          {/* Matchmaking Searching Queue Card */}
          {matchmakingStatus === 'queued' && !activeMatch && (
            <div className="w-full max-w-sm mx-auto bg-slate-900/95 border-2 border-amber-500/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-scale-up my-4" id="matchmaking-queue-container">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-amber-400/20 border-t-amber-400 animate-spin flex items-center justify-center">
                    <Swords size={28} className="text-amber-400 animate-pulse" />
                  </div>
                </div>
                <span className="text-[10px] font-black text-amber-400 font-mono tracking-widest uppercase mt-3">CANLI 1v1 DÜELLO</span>
                <h3 className="text-lg font-black text-[#FAF6E9] tracking-wide uppercase mt-0.5">RAKİP ARANIYOR...</h3>
                <p className="text-xs text-gray-300 mt-1 leading-normal">
                  {duelWordLength} harfli canlı düello için rakip bekleniyor. Odaya girildiği an yarış başlayacak!
                </p>
              </div>

              <button
                onClick={() => handleStartMatchmaking(duelWordLength)}
                className="w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95"
              >
                Aramayı İptal Et
              </button>
            </div>
          )}

          {/* Top Timer & Attempts Tracker */}
          {!isMatchEnded && (
            <div className="w-full flex justify-between items-center mb-2 px-1 border-b border-[#3E485A]/40 pb-2 relative z-10">
              {gameStatus === 'playing' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-500" />
                    <span className="text-xs font-bold text-gray-300 font-mono">
                      Deneme: {attempts.length}/6
                    </span>
                  </div>

                  {/* Shimmering Gold Wallet in playing screen top bar */}
                  <GoldWallet gold={profile.gold !== undefined ? profile.gold : 20} />

                  <div className="flex items-center gap-2">
                    {activeMatch ? (
                      <div className="text-xs font-extrabold font-mono px-2 py-0.5 rounded-lg border bg-amber-500/15 border-amber-500/30 text-amber-400 flex items-center gap-1">
                        <Swords size={12} className="animate-pulse text-amber-400" />
                        <span>CANLI DÜELLO</span>
                      </div>
                    ) : gameMode === 'timed' && !isDailyPuzzle ? (
                      <>
                        <Hourglass size={16} className={`animate-spin ${secondsLeft <= 5 ? 'text-rose-500' : 'text-emerald-500'}`} />
                        <div className={`text-sm font-bold font-mono px-2 py-0.5 rounded-lg border ${
                          secondsLeft <= 5
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 animate-pulse'
                            : 'bg-black/25 border-[#3E485A] text-emerald-400'
                        }`}>
                          {secondsLeft} sn
                        </div>
                      </>
                    ) : (
                      <>
                        <Hourglass size={16} className="text-emerald-500 animate-pulse" />
                        <div className="text-xs font-extrabold font-mono px-2 py-0.5 rounded-lg border bg-black/25 border-[#3E485A] text-emerald-400">
                          Süresiz ♾️
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full flex justify-center py-0.5 animate-scale-up">
                  <span className={`text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border ${
                    gameStatus === 'won'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : gameStatus === 'lost'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'bg-[#3D4756] border-[#3E485A] text-gray-300'
                  }`}>
                    {gameStatus === 'won' ? '🎉 TEBRİKLER! KAZANDINIZ' : gameStatus === 'lost' ? '💥 SÜRE BİTTİ / ELENDİNİZ' : 'HAZIR'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Spacer A */}
          {gameStatus === 'playing' && !isMatchEnded && (
            <div className="flex-1 min-h-[0.25rem] sm:min-h-[0.5rem]" />
          )}

          {/* Letter Grid */}
          {!isMatchEnded && (
            <GameBoard
              attempts={attempts}
              currentAttempt={currentAttempt}
              wordLength={wordLength}
              boardTheme={settings.boardTheme}
              isGameOver={gameStatus !== 'playing'}
              revealedHints={revealedHints}
            />
          )}

          {/* 💡 ACTIVE WORD SUGGESTION DRAWER */}
          {activeWordSuggestion && gameStatus === 'playing' && !isMatchEnded && (
            <div className="w-full max-w-sm mx-auto bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center mb-1 mt-1 animate-scale-up flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <div className="text-left">
                  <span className="text-[9px] text-gray-400 font-mono block uppercase">Önerilen Kelime</span>
                  <strong className="text-sm font-black text-emerald-400 tracking-wider uppercase font-mono leading-none">{activeWordSuggestion}</strong>
                </div>
              </div>
              <button
                onClick={() => {
                  setCurrentAttempt(activeWordSuggestion.slice(0, wordLength));
                  playClickSound(settings.soundEnabled);
                }}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-md"
              >
                Doldur
              </button>
            </div>
          )}

          {/* 🤫 HINT, SUGGESTION & AD REWARD CONTROLS ROW */}
          {!isMatchEnded && gameStatus === 'playing' && !activeMatch && (
            <div className="w-full max-w-sm mx-auto flex gap-1.5 justify-center py-1.5 px-1 shrink-0">
              {/* HINT BUTTON */}
              <button
                onClick={handleGetHint}
                disabled={attempts.length >= 6}
                className="flex-1 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 hover:from-amber-500/20 hover:to-yellow-500/20 active:scale-95 border border-amber-500/20 text-[#FAF6E9] py-2 px-2 sm:px-3 rounded-2xl transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                title="Doğru Harf Fısılda veya Klavye Temizle"
              >
                <span className="text-sm leading-none">🤫</span>
                <div className="text-left leading-tight">
                  <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-wide">İpucu</span>
                  <span className="block text-[8px] text-amber-400 font-mono font-bold leading-none">1 Altın</span>
                </div>
              </button>

              {/* WORD SUGGESTION BUTTON */}
              <button
                onClick={handleGetWordSuggestion}
                disabled={attempts.length >= 6}
                className="flex-1 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 hover:from-teal-500/20 hover:to-emerald-500/20 active:scale-95 border border-teal-500/20 text-[#FAF6E9] py-2 px-2 sm:px-3 rounded-2xl transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                title="Kurallara Uyan Kelime Öner"
              >
                <span className="text-sm leading-none">💡</span>
                <div className="text-left leading-tight">
                  <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-wide">Tavsiye</span>
                  <span className="block text-[8px] text-teal-400 font-mono font-bold leading-none">1 Altın</span>
                </div>
              </button>

              {/* WATCH AD REWARD BUTTON */}
              <button
                onClick={async () => {
                  if (typeof window !== 'undefined' && (window as any).AndroidBridge && (window as any).AndroidBridge.showRewardedAd) {
                    try {
                      (window as any).AndroidBridge.showRewardedAd();
                    } catch (e) {
                      await handleWatchRewardedAdReward();
                    }
                  } else {
                    await handleWatchRewardedAdReward();
                  }
                }}
                className="flex-1 bg-gradient-to-r from-amber-400/15 to-yellow-500/15 hover:from-amber-400/25 hover:to-yellow-500/25 active:scale-95 border border-amber-400/30 text-amber-300 py-2 px-2 sm:px-3 rounded-2xl transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                title="Reklam İzleyerek +10 Altın Kazan"
                id="in-game-watch-ad-btn"
              >
                <span className="text-sm leading-none">📺</span>
                <div className="text-left leading-tight">
                  <span className="block text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-amber-200">Reklam İzle</span>
                  <span className="block text-[8px] text-amber-400 font-mono font-black leading-none">+10 🪙</span>
                </div>
              </button>
            </div>
          )}

          {/* Victory Celebration is now handled via the lightweight showCongratsModal popup to prevent layout shifts, lag and WebView/AdMob crashes */}

          {/* Standard Game Over (Loss) Screen */}
          {gameStatus === 'lost' && !activeMatch && !isDailyPuzzle && (
            <div className="w-full text-center py-2 space-y-2.5 max-w-sm animate-scale-up" id="game-over-loss-container">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-xl space-y-1">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest font-mono">DENEME HAKKI VEYA SÜRE BİTTİ</p>
                <h4 className="text-xs font-bold text-gray-900 dark:text-white">Aradığınız kelime şuydu:</h4>
                <div className="flex items-center justify-center gap-1.5">
                  <strong className="text-xl text-rose-500 tracking-wider font-extrabold uppercase leading-none">{targetWord}</strong>
                  <button
                    onClick={() => {
                      setShowDefinitionModal(true);
                      playClickSound(settings.soundEnabled);
                    }}
                    className="p-1 rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition active:scale-95 cursor-pointer flex items-center justify-center"
                    title="Kelime Anlamı"
                    id="info-definition-btn-loss"
                  >
                    <Info size={16} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
                <button
                  onClick={() => startNewGame(wordLength)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2.5 px-5 rounded-xl shadow-md shadow-emerald-500/15 text-[11px] uppercase tracking-wider active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                  id="loss-retry-button"
                >
                  <RotateCcw size={12} className="stroke-[2.5]" />
                  <span>Yeni Kelime ile Başla</span>
                </button>

                <button
                  onClick={() => {
                    playClickSound(settings.soundEnabled);
                    setHasEnteredGame(false);
                    setIsDailyPuzzle(false);
                  }}
                  className="bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold py-2.5 px-5 rounded-xl border border-[#3E485A] text-[11px] uppercase tracking-wider active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                  id="loss-back-to-lobby-button"
                >
                  <ArrowLeft size={12} className="stroke-[2.5]" />
                  <span>Ana Sayfaya Dön</span>
                </button>
              </div>
            </div>
          )}

          {/* Daily Puzzle Completion Board */}
          {isDailyPuzzle && (gameStatus === 'won' || gameStatus === 'lost') && (
            <div className="w-full text-center py-4 px-5 bg-[#2E3748] border border-[#3E485A] rounded-2xl space-y-3.5 max-w-sm animate-scale-up" id="daily-puzzle-completion-board">
              <div className="space-y-1.5">
                {gameStatus === 'won' ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider font-mono">
                      🎉 BAŞARIYLA ÇÖZÜLDÜ
                    </div>
                    <h4 className="text-sm font-extrabold text-[#FAF6E9] mt-1">Günün Bulmacasını Tamamladınız!</h4>
                    <p className="text-[11px] text-gray-300">Tebrikler, hanenize +5 Puan eklendi!</p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-wider font-mono">
                      💥 DENEME HAKKINIZ BİTTİ
                    </div>
                    <h4 className="text-sm font-extrabold text-[#FAF6E9] mt-1">Günün Kelimesini Bulamadınız!</h4>
                    <p className="text-[11px] text-gray-300 font-medium">Üzülmeyin, yarın yeni bir kelime ile tekrar deneyebilirsiniz.</p>
                  </>
                )}
              </div>

              <div className="p-3 bg-black/20 rounded-xl border border-white/5 space-y-1 text-white">
                <span className="text-[9px] text-gray-400 uppercase font-mono tracking-widest block">GÜNÜN KELİMESİ</span>
                <strong className="text-xl text-amber-500 tracking-widest font-black uppercase block leading-none">{targetWord}</strong>
                {wordDefinition && wordDefinition !== 'loading' ? (
                  <p className="text-[11px] text-gray-300 italic font-serif leading-relaxed line-clamp-3 mt-1.5">
                    "{wordDefinition}"
                  </p>
                ) : wordDefinition === 'loading' ? (
                  <p className="text-[10px] text-gray-400 italic animate-pulse mt-1.5">Anlamı yükleniyor...</p>
                ) : null}
              </div>

              <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  handleLeaveMatchToMenu();
                }}
                className="w-full bg-slate-700 hover:bg-slate-650 text-slate-100 font-extrabold py-3 px-4 rounded-xl border border-[#3E485A] text-xs uppercase tracking-wider active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                id="daily-ended-back-to-lobby-button"
              >
                <ArrowLeft size={14} className="stroke-[2.5]" />
                <span>Ana Sayfaya Dön</span>
              </button>
            </div>
          )}

          {/* Spacer B */}
          {gameStatus === 'playing' && (
            <div className="flex-1 min-h-[0.25rem] sm:min-h-[0.5rem]" />
          )}

          {/* Loading validation block */}
          {isValidating && (
            <div className="text-xs text-gray-400 dark:text-gray-500 animate-pulse font-mono flex items-center gap-1.5 py-1 shrink-0">
              <RotateCcw className="animate-spin" size={12} />
              Sözlük doğrulaması yapılıyor...
            </div>
          )}

          {/* Action Buttons Above Keyboard */}
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && activeMatch.players[profile.id]?.completed) && (
            <BottomBar
              currentGuess={currentAttempt}
              wordLength={wordLength}
              isValidating={isValidating}
              onClear={() => {
                if (currentAttempt.length > 0) {
                  setCurrentAttempt('');
                  playDeleteSound(settings.soundEnabled);
                }
              }}
              onSubmit={submitGuess}
              disabled={activeMatch ? (activeMatch.status !== 'playing' && activeMatch.gameState !== 'PLAYING') : gameStatus !== 'playing'}
            />
          )}

          {/* Spacer C */}
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && activeMatch.players[profile.id]?.completed) && (
            <div className="flex-1 min-h-[0.25rem] sm:min-h-[0.5rem]" />
          )}

          {/* Virtual Keyboard */}
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && activeMatch.players[profile.id]?.completed) && (
            <Keyboard
              onChar={onChar}
              onDelete={onDelete}
              onEnter={submitGuess}
              letterStatuses={letterStatuses}
              keyboardLayout={settings.keyboardLayout}
              boardTheme={settings.boardTheme}
              disabled={activeMatch ? (activeMatch.status !== 'playing' && activeMatch.gameState !== 'PLAYING') : gameStatus !== 'playing'}
            />
          )}

          {/* Waiting for Opponent Card */}
          {!isMatchEnded && activeMatch && activeMatch.players[profile.id]?.completed && activeMatch.status !== 'ended' && (
            <div className="w-full max-w-sm mx-auto bg-slate-900/95 border border-amber-500/25 rounded-3xl p-5 text-center space-y-4 shadow-xl animate-scale-up" id="opponent-waiting-container">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-amber-400/20 border-t-amber-400 animate-spin flex items-center justify-center">
                    <Hourglass size={18} className="text-amber-400 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-sm font-black text-[#FAF6E9] tracking-wide mt-3 uppercase">RAKİP BEKLENİYOR...</h3>
                <p className="text-[10px] text-gray-400 mt-1 max-w-xs leading-normal">
                  Siz kelimeyi tamamladınız. Rakibinizin de kelimeyi bitirmesi bekleniyor. Lütfen bekleyin.
                </p>
              </div>

              {/* Opponent Status Display */}
              {Object.entries(activeMatch.players).map(([pId, pState]: [string, any]) => {
                const isOpponent = pId !== profile.id;
                if (!isOpponent) return null;
                return (
                  <div key={pId} className="bg-black/25 rounded-2xl border border-white/5 p-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-300 uppercase tracking-wide">{pState.name}</span>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-amber-400 font-bold uppercase">Tahmin Yapıyor...</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Multiplayer Results Card (Tek Tur Sonuç Ekranı) */}
          {activeMatch && activeMatch.status === 'ended' && (
            <div className="w-full max-w-sm sm:max-w-md mx-auto bg-slate-900/95 border-2 border-amber-500/30 rounded-3xl p-4 sm:p-5 text-center shadow-2xl animate-scale-up flex flex-col justify-between max-h-[85vh] overflow-hidden" id="multiplayer-results-container">
              {(() => {
                const matchWinnerId = activeMatch.winnerId || activeMatch.winner || (
                  Object.entries(activeMatch.players || {}).find(([_, pState]: [string, any]) => pState?.won)?.[0]
                );
                const isWinner = matchWinnerId === profile.id;
                const isDraw = matchWinnerId === 'draw';

                return (
                  <>
                    <div className="flex justify-center shrink-0">
                      {isWinner ? (
                        <div className="relative flex flex-col items-center">
                          <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-full flex items-center justify-center border border-yellow-300 shadow-lg animate-bounce">
                            <Trophy size={24} className="text-slate-950 stroke-[2.5]" />
                          </div>
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-1.5 font-mono">DÜELLO GALİBİ</span>
                          <h2 className="text-xl font-black text-[#FAF6E9] uppercase tracking-wide leading-none mt-0.5">ZAFER SENİN!</h2>
                          {opponentLeftDuringMatch && (
                            <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 mt-1.5 inline-block">
                              Rakip oyundan çıktı!
                            </span>
                          )}
                        </div>
                      ) : isDraw ? (
                        <div className="relative flex flex-col items-center">
                          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border border-white/10 shadow-lg">
                            <Swords size={24} className="text-amber-400 stroke-[2.5]" />
                          </div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5 font-mono font-bold">DURUM</span>
                          <h2 className="text-xl font-black text-amber-300 uppercase tracking-wide leading-none mt-0.5">BERABERE!</h2>
                        </div>
                      ) : (
                        <div className="relative flex flex-col items-center">
                          <div className="w-12 h-12 bg-[#1E1E1E] rounded-full flex items-center justify-center border border-rose-500/25 shadow-lg">
                            <X size={24} className="text-rose-500 stroke-[2.5]" />
                          </div>
                          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1.5 font-mono">DÜELLO MAĞLUBU</span>
                          <h2 className="text-xl font-black text-rose-500 uppercase tracking-wide leading-none mt-0.5">KAYBETTİNİZ</h2>
                        </div>
                      )}
                    </div>

                    {/* Word Definition Section inside Results Card */}
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3 my-2 text-left shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono">ARANAN SÖZCÜK</span>
                        <span className="text-[9px] font-mono text-amber-400 font-bold">{targetWord.length} Harfli</span>
                      </div>
                      <div className="flex items-center gap-1.5 my-0.5">
                        <strong className="text-xl font-black tracking-widest text-[#FAF6E9] uppercase leading-none">{targetWord}</strong>
                        <button
                          onClick={() => {
                            setShowDefinitionModal(true);
                            playClickSound(settings.soundEnabled);
                          }}
                          className="p-1 rounded-full text-amber-400 hover:bg-amber-400/10 transition active:scale-95"
                          title="Anlamını Gör"
                        >
                          <Info size={14} className="stroke-[2.5]" />
                        </button>
                      </div>
                      {wordDefinition && wordDefinition !== 'loading' ? (
                        <p className="text-[10px] text-gray-300 italic font-serif leading-relaxed line-clamp-2">
                          "{wordDefinition}"
                        </p>
                      ) : wordDefinition === 'loading' ? (
                        <p className="text-[10px] text-gray-400 italic animate-pulse">Sözlük anlamı yükleniyor...</p>
                      ) : null}
                    </div>

                    {/* Player Round Statistics */}
                    <div className="bg-black/25 rounded-2xl border border-white/5 p-3 mb-2 space-y-1.5 shrink-0">
                      <h4 className="text-[9px] font-black text-amber-300/80 tracking-widest uppercase font-mono text-left font-bold">OYUNCU DETAYLARI</h4>
                      {Object.entries(activeMatch.players || {}).map(([pId, playerState]: [string, any]) => {
                        const isSelf = pId === profile.id;
                        const isWonPlayer = pId === matchWinnerId || 
                                            Boolean(playerState?.won) || 
                                            (isSelf && isWinner);
                        const pAttempts = (isSelf && attempts.length > 0) 
                          ? attempts 
                          : (activeMatch.attempts?.[pId] || playerState?.attempts || []);
                        
                        const attemptCount = pAttempts.length;

                        let statusText = '';
                        if (isWonPlayer) {
                          const count = attemptCount > 0 ? attemptCount : 1;
                          statusText = `${count}. Denemede BİLDİ (KAZANDI)`;
                        } else if (attemptCount > 0) {
                          statusText = `${attemptCount} Denemede BİLEMEDİ`;
                        } else {
                          statusText = 'BİLEMEDİ';
                        }

                        return (
                          <div key={pId} className="flex justify-between items-center text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${isWonPlayer ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                              <span className={`font-black uppercase tracking-wider ${isSelf ? 'text-amber-400' : 'text-gray-300'}`}>
                                {playerState.name || (isSelf ? profile.name : 'Rakip')} {isSelf ? '(Sen)' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono font-bold">
                              <span className="text-gray-400">Durum:</span>
                              <span className={isWonPlayer ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-medium'}>
                                {statusText}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* Buttons Block */}
              <div className="space-y-2 mt-auto shrink-0 pt-1">
                {/* Main Home Button */}
                <button
                  onClick={() => {
                    playClickSound(settings.soundEnabled);
                    handleLeaveMatchToMenu();
                  }}
                  className="w-full bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.98] text-[#2E3748] font-black text-xs py-3 px-4 rounded-xl shadow-lg transition-all uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2 border border-white/10"
                  id="match-home-btn"
                >
                  <Home size={16} className="stroke-[2.5]" />
                  <span>ANA SAYFAYA DÖN</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      </>
    )}
  </main>

      {/* Name/Profile Editing Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-100 dark:border-gray-800 shadow-2xl space-y-5 overflow-y-auto max-h-[90vh]" id="edit-profile-modal">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Profilini Düzenle</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Arkadaşlarının seni rekabet listesinde görebilmesi için ismini ve profil resmini güncelle.
                </p>
              </div>
              <button
                onClick={() => setIsEditingName(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Profile Avatar Preview & Reset */}
            <div className="flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-950/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800/60">
              <div className="relative">
                {avatarInput ? (
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-emerald-500 bg-white dark:bg-gray-800 flex items-center justify-center shadow-lg">
                    {avatarInput.length < 4 ? (
                      <span className="text-4xl select-none">{avatarInput}</span>
                    ) : (
                      <img src={avatarInput} alt="Avatar önizleme" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    )}
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-emerald-500 text-white font-bold text-3xl flex items-center justify-center shadow-lg">
                    {nameInput ? nameInput.charAt(0).toUpperCase() : 'O'}
                  </div>
                )}
                {avatarInput && (
                  <button
                    onClick={() => setAvatarInput(undefined)}
                    className="absolute -top-1 -right-1 bg-rose-500 hover:bg-rose-600 text-white p-1.5 rounded-full shadow-md hover:scale-105 active:scale-95 transition"
                    title="Resmi Kaldır"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">Profil Resmi Önizlemesi</span>
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Takma Adınız</label>
              <input
                type="text"
                maxLength={15}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="Takma adınızı girin..."
              />
            </div>

            {/* Preset Avatar Emojis */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Hızlı Emoji Seç</label>
              <div className="grid grid-cols-6 gap-2">
                {['🐱', '🦊', '🐼', '🦁', '🐸', '🐨', '🦄', '🦉', '🦖', '🐝', '🎨', '🚀'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setAvatarInput(emoji)}
                    className={`text-2xl p-2 rounded-xl transition duration-150 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      avatarInput === emoji ? 'bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500' : 'bg-gray-50 dark:bg-gray-950/30'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom File Upload with Drag & Drop */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Kendi Resmini Yükle</label>
              
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        if (ev.target?.result && typeof ev.target.result === 'string') {
                          setAvatarInput(ev.target.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    } else {
                      showToast('Lütfen geçerli bir resim dosyası sürükleyin.', 'error');
                    }
                  }
                }}
                onClick={() => document.getElementById('avatar-file-upload')?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition duration-150 flex flex-col items-center justify-center gap-1.5 ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-950/10 hover:bg-gray-50 dark:hover:bg-gray-950/20'
                }`}
              >
                <input
                  type="file"
                  id="avatar-file-upload"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result && typeof ev.target.result === 'string') {
                            setAvatarInput(ev.target.result);
                          }
                        };
                        reader.readAsDataURL(file);
                      } else {
                        showToast('Lütfen geçerli bir resim dosyası seçin.', 'error');
                      }
                    }
                  }}
                  className="hidden"
                />
                <Upload size={20} className={isDragging ? 'text-emerald-500 animate-bounce' : 'text-gray-400 dark:text-gray-500'} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Resim seçmek için tıkla veya sürükle</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">PNG, JPG veya GIF desteklenir</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setIsEditingName(false)}
                className="px-4 py-2.5 rounded-xl text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition font-semibold"
              >
                İptal
              </button>
              <button
                onClick={saveProfile}
                disabled={nameInput.trim().length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md ${
                  nameInput.trim().length > 0
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-emerald-500/10'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none'
                }`}
              >
                Profili Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && (
        <StatsModal
          profile={profile}
          onClose={() => setShowStatsModal(false)}
          onResetStats={resetStats}
        />
      )}

      {/* Missions Modal */}
      {showMissionsModal && (
        <MissionsModal
          profile={profile}
          onClose={() => setShowMissionsModal(false)}
          onStartWordGame={(length) => {
            setWordLength(length);
            setHasEnteredGame(true);
            startNewGame(length);
            setShowMissionsModal(false);
          }}
        />
      )}

      {/* Word Definition Modal */}
      {showDefinitionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" id="definition-modal-container">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-gray-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setShowDefinitionModal(false)}
          />
          
          {/* Modal Container */}
          <div className="bg-[#2E3748] border border-[#3E485A] rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden text-white animate-scale-up" id="definition-modal-card">
            {/* Atmospheric light glows */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Close Button in Upper-Right */}
            <button
              onClick={() => {
                setShowDefinitionModal(false);
                playClickSound(settings.soundEnabled);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition duration-200 cursor-pointer"
              id="close-definition-modal-button"
            >
              <X size={18} />
            </button>

            {/* Content */}
            <div className="relative z-10 text-left space-y-4">
              <div className="flex items-center gap-2 border-b border-[#3E485A] pb-3 mr-6">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1">
                  📖 SÖZLÜK ANLAMI
                </span>
              </div>

              <div className="p-3 bg-black/20 rounded-2xl border border-[#3E485A]/50 text-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-mono block mb-1">
                  Aranan Kelime
                </span>
                <strong className="text-lg font-black tracking-widest uppercase text-[#FAF6E9]">{targetWord}</strong>
              </div>

              {wordDefinition === 'loading' ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                  <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-gray-400 font-medium tracking-wide">
                    Anlamı yükleniyor...
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-200 italic font-serif leading-relaxed px-1">
                    "{wordDefinition || 'Bu kelimenin resmi sözlük tanımına şu an ulaşılamıyor.'}"
                  </p>
                  
                  {/* If there was an error, show a retry button */}
                  {(wordDefinition.includes('hata') || wordDefinition.includes('yüklenemedi') || wordDefinition.includes('bağlantı') || wordDefinition.includes('ulaşılamıyor')) && (
                    <button
                      onClick={() => fetchTargetWordDefinition(targetWord)}
                      className="w-full mt-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 py-2 px-4 rounded-xl text-xs font-bold transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw size={12} />
                      <span>Tekrar Yüklemeyi Dene</span>
                    </button>
                  )}
                  
                  <div className="pt-2 border-t border-[#3E485A]/30 flex justify-end">
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(turkishLower(targetWord) + ' ne demek')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      Google'da Ara ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Congrats / Victory Modal */}
      {showCongratsModal && !activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" id="congrats-modal-container">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200 cursor-pointer"
            onClick={() => {
              playClickSound(settings.soundEnabled);
              startNewGame(wordLength);
              setShowCongratsModal(false);
            }}
          />
          
          {/* Modal Container */}
          <div className="bg-[#2E3748] border-2 border-emerald-500/30 rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden text-white animate-scale-up text-center space-y-4" id="congrats-modal-card">
            {/* Soft decorative glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col items-center relative z-10">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/20 shadow-lg mb-3">
                <Trophy size={24} className="animate-bounce" />
              </div>
              <h3 className="text-base font-black text-emerald-400 uppercase tracking-widest font-mono">Tebrikler! Doğru Bildiniz</h3>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">Kelimelerin Efendisi!</p>
            </div>

            {/* Found Word Display */}
            <div className="p-3.5 bg-black/30 rounded-2xl border border-white/5 space-y-1 text-center relative z-10">
              <span className="text-[9px] text-gray-400 uppercase font-mono tracking-widest block">BULUNAN KELİME</span>
              <strong className="text-2xl font-black tracking-widest text-[#FAF6E9] uppercase block leading-none">{targetWord}</strong>
              
              {/* Word Definition */}
              {wordDefinition && wordDefinition !== 'loading' ? (
                <p className="text-[11px] text-gray-300 italic font-serif leading-relaxed line-clamp-3 mt-1.5">
                  "{wordDefinition}"
                </p>
              ) : wordDefinition === 'loading' ? (
                <p className="text-[10px] text-gray-400 italic animate-pulse mt-1.5">Anlamı yükleniyor...</p>
              ) : null}
            </div>

            {/* Action buttons matching the loss restart button but themed in emerald */}
            <div className="flex flex-col gap-2 relative z-10">
              {!isDailyPuzzle && (
                <button
                  onClick={() => {
                    playClickSound(settings.soundEnabled);
                    startNewGame(wordLength);
                    setShowCongratsModal(false);
                  }}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                  id="congrats-new-game-button"
                >
                  <RotateCcw size={14} />
                  <span>Yeni Kelimeye Başla</span>
                </button>
              )}

               <button
                onClick={() => {
                  playClickSound(settings.soundEnabled);
                  handleLeaveMatchToMenu();
                  setShowCongratsModal(false);
                }}
                className="w-full bg-slate-700/80 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs py-2.5 px-4 rounded-xl border border-[#3E485A] transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                id="congrats-back-to-lobby-button"
              >
                <ArrowLeft size={14} />
                <span>Ana Sayfaya Dön</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retention / "Seni Özledik" Notification Modal */}
      {retentionNotification && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-[#252D45] border-2 border-amber-500/50 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20 mx-auto mb-4.5 shadow-lg shadow-amber-500/5">
              <Sparkles size={32} className="animate-pulse" />
            </div>

            <h3 className="text-xl font-black text-[#FAF6E9] tracking-tight">Seni Özledik! ☀️</h3>
            
            <p className="text-sm text-gray-300 mt-3 leading-relaxed">
              {retentionNotification.message}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => {
                  setRetentionNotification(null);
                  handleStartDailyPuzzle();
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg transition-all duration-150 active:scale-[0.98] uppercase tracking-wider text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={14} className="fill-current" />
                Günün Bulmacasını Çöz
              </button>

              <button
                onClick={() => setRetentionNotification(null)}
                className="w-full bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-150 cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onChangeSettings={setSettings}
          onClose={() => {
            setShowSettingsModal(false);
            handleManualReconnect();
          }}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onOpenStats={() => setShowStatsModal(true)}
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          networkLogs={networkLogs}
          onReconnect={handleManualReconnect}
        />
      )}

      {/* Badge Unlocked Popup Animation */}
      <BadgeUnlockedModal
        badge={unlockedBadgeToShow}
        onClose={() => setUnlockedBadgeToShow(null)}
        soundEnabled={settings.soundEnabled}
      />

      {/* Custom Premium Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-gray-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
          
          {/* Modal Container */}
          <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden">
            {/* Atmospheric light glows */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            {/* Content */}
            <div className="relative z-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-200/50 dark:border-amber-900/30">
                <AlertCircle size={24} className="stroke-[2.5]" />
              </div>
              
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-gray-950 dark:text-white uppercase tracking-wider font-mono">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
              
              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-850 transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  onClick={() => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    confirmModal.onConfirm();
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-black uppercase tracking-wider border border-emerald-400 shadow-md hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
                >
                  Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Safe Space for Future Bottom Banner Ad */}
      <div className="h-[50px] w-full shrink-0 flex items-center justify-center border-t border-[#3E485A]/15 bg-black/35 text-[#FAF6E9]/40 font-mono text-[9px] tracking-widest select-none uppercase mt-auto" id="bottom-ad-placeholder">
      </div>
    </div>
  );
}
