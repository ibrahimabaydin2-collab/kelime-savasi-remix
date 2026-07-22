import React, { useState, useEffect, useRef } from 'react';
import { 
  Swords, Play, Globe, ShieldAlert, Sparkles, 
  Trophy, Users, HelpCircle, ChevronDown, ChevronUp, 
  Copy, Check, Flame, Zap, Target, Edit2, User, Award, CheckCircle2, TrendingUp,
  Sun, Moon, Sliders, BarChart2, X, ArrowLeft, UserPlus, UserMinus, Clock, Puzzle,
  Bot
} from 'lucide-react';
import { UserProfile } from '../types.js';
import { getBaseUrl } from '../utils/api.js';
import { validateUsername } from '../utils/usernameValidation.js';
import { getDailyWordAndLength } from '../data/wordlist.js';
import { getXPForLevel, getLevelForScore } from '../utils/scoring.js';
import { fetchUsersWhoAddedMe, searchUserByName, checkUsernameExists } from '../lib/firebase.js';
import GoldWallet from './GoldWallet.js';

interface WelcomeScreenProps {
  profile: UserProfile;
  onUpdateProfile: (name: string, avatarUrl?: string) => void;
  dictionaryMode: 'tdk_online' | 'no_validation';
  onChangeDictionaryMode: (mode: 'tdk_online' | 'no_validation') => void;
  gameMode: 'timed' | 'untimed';
  onChangeGameMode: (mode: 'timed' | 'untimed') => void;
  wordLength: number;
  onChangeWordLength: (length: number) => void;
  duelWordLength?: number;
  onChangeDuelWordLength?: (length: number) => void;
  onStartSoloGame: () => void;
  onOpenSettings: () => void;
  onOpenMissions?: () => void;
  isOnline: boolean;
  
  // New Header integration props
  onOpenStats?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  
  // Dynamic Integrated Dashboard Props
  onReconnect?: () => void;
  onStartDailyPuzzle?: () => void;
  isDailyPuzzleCompletedToday?: boolean;
  onUpdateFriends?: (friends: string[]) => void;
  onAddGold?: (amount: number) => Promise<void>;
  onDeductGold?: (amount: number) => Promise<boolean>;
  onClaimDailyReward?: () => Promise<void>;
  onWatchRewardedAdReward?: () => Promise<void>;
  onStartMatchmaking?: (wordsCount?: number) => void;
  matchmakingStatus?: 'idle' | 'queued';
}

export default function WelcomeScreen({
  profile,
  onUpdateProfile,
  dictionaryMode,
  onChangeDictionaryMode,
  gameMode,
  onChangeGameMode,
  wordLength,
  onChangeWordLength,
  duelWordLength,
  onChangeDuelWordLength,
  onStartSoloGame,
  onOpenSettings,
  onOpenMissions,
  isOnline,
  onReconnect,
  onOpenStats,
  darkMode,
  onToggleDarkMode,
  onStartDailyPuzzle,
  isDailyPuzzleCompletedToday = false,
  onUpdateFriends,
  onAddGold,
  onDeductGold,
  onClaimDailyReward,
  onWatchRewardedAdReward,
  onStartMatchmaking,
  matchmakingStatus = 'idle'
}: WelcomeScreenProps) {
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [showMissions, setShowMissions] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showFriendsModal, setShowFriendsModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const isDailyClaimed = profile.lastDailyLoginClaim === todayStr;
  
  // Game setup states
  const [showGameSetup, setShowGameSetup] = useState<boolean>(false);
  const [selectedGameModeTab, setSelectedGameModeTab] = useState<'solo' | 'duel'>('solo');

  // Independent Duel Word Length State
  const [localDuelWordLength, setLocalDuelWordLength] = useState<number>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('kelimesavasi_duel_word_length') : null;
      return saved ? parseInt(saved, 10) : 5;
    } catch (e) {
      return 5;
    }
  });

  const currentDuelWordLength = duelWordLength !== undefined ? duelWordLength : localDuelWordLength;

  const handleDuelWordLengthChange = (len: number) => {
    if (onChangeDuelWordLength) {
      onChangeDuelWordLength(len);
    } else {
      setLocalDuelWordLength(len);
      try {
        localStorage.setItem('kelimesavasi_duel_word_length', len.toString());
      } catch (e) {}
    }
  };

  // Real-time bidirectional friends and requests from Firestore
  const [confirmedFriends, setConfirmedFriends] = useState<{ id: string; name: string; avatarUrl?: string }[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<{ id: string; name: string; avatarUrl?: string }[]>([]);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(false);

  // Search states for "Oyuncu Bul"
  const [searchedPlayers, setSearchedPlayers] = useState<{ id: string; name: string; avatarUrl?: string }[]>([]);
  const [searchHasRun, setSearchHasRun] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);

  const [friendsTab, setFriendsTab] = useState<'friends' | 'find'>('friends');
  const [friendsSearchTerm, setFriendsSearchTerm] = useState<string>('');
  
  // Rewarded Ad and Daily Claim States
  const adRequestActiveRef = useRef<boolean>(false);
  const [isWatchingAd, setIsWatchingAd] = useState<boolean>(false);
  const [adCountdown, setAdCountdown] = useState<number>(5);
  const [showAdSuccess, setShowAdSuccess] = useState<boolean>(false);
  const [isAdLoading, setIsAdLoading] = useState<boolean>(false);
  
  // Daily Puzzle reset countdown timer state
  const [timeLeftToReset, setTimeLeftToReset] = useState<string>('');
  
  // Live Clock and Turkish Date states for the mock status bar
  const [liveTime, setLiveTime] = useState<string>('');
  const [liveDate, setLiveDate] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setLiveTime(`${hh}:${mm}`);

      const day = now.getDate();
      const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const weekDayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
      
      const monStr = monthNames[now.getMonth()];
      const dayStr = weekDayNames[now.getDay()];
      setLiveDate(`${day} ${monStr} ${dayStr}`);
    };
    updateClock();
    const intervalId = setInterval(updateClock, 10000); // update every 10 seconds
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0); // Next midnight
      const diffMs = nextMidnight.getTime() - now.getTime();
      
      const hours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
      const minutes = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
      const seconds = Math.max(0, Math.floor((diffMs % (1000 * 60)) / 1000));
      
      const pad = (num: number) => String(num).padStart(2, '0');
      setTimeLeftToReset(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    calculateTimeLeft();
    const timerId = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timerId);
  }, []);

  const isFriend = (playerId: string) => (profile.friends || []).includes(playerId);

  const addFriend = async (playerOrId: any) => {
    const targetId = typeof playerOrId === 'string' ? playerOrId : playerOrId.id;
    const currentFriends = profile.friends || [];
    if (currentFriends.includes(targetId)) return;
    
    const updated = [...currentFriends, targetId];
    if (onUpdateFriends) {
      onUpdateFriends(updated);
    }
  };

  const removeFriend = async (targetId: string) => {
    const currentFriends = profile.friends || [];
    const updated = currentFriends.filter(id => id !== targetId);
    if (onUpdateFriends) {
      onUpdateFriends(updated);
    }
  };

  const refreshFriendsList = async () => {
    if (!isOnline || !profile?.id) return;
    setLoadingFriends(true);
    try {
      const usersWhoAddedMe = await fetchUsersWhoAddedMe(profile.id);
      const usersWhoAddedMeIds = usersWhoAddedMe.map(u => u.id);
      const myFriends = profile.friends || [];

      // Mutual friends (Onaylı Arkadaşlar): users I added and who also added me
      const mutualIds = myFriends.filter(id => usersWhoAddedMeIds.includes(id));
      const mutualList = mutualIds.map(id => {
        const p = usersWhoAddedMe.find(u => u.id === id);
        return {
          id,
          name: p?.name || 'Bilinmeyen Oyuncu',
          avatarUrl: p?.avatarUrl
        };
      });

      // Incoming requests (Gelen İstekler): users who added me, but I have not added them yet
      const incomingIds = usersWhoAddedMeIds.filter(id => !myFriends.includes(id));
      const incomingList = incomingIds.map(id => {
        const p = usersWhoAddedMe.find(u => u.id === id);
        return {
          id,
          name: p?.name || 'Bilinmeyen Oyuncu',
          avatarUrl: p?.avatarUrl
        };
      });

      setConfirmedFriends(mutualList);
      setIncomingRequests(incomingList);
    } catch (err) {
      console.error('Error refreshing friends list:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleSearchPlayers = async () => {
    const term = friendsSearchTerm.trim();
    if (!term) {
      setSearchedPlayers([]);
      setSearchHasRun(false);
      return;
    }
    setSearching(true);
    setSearchHasRun(true);
    try {
      const results = await searchUserByName(term);
      // Filter out ourself from search results
      setSearchedPlayers(results.filter(u => u.id !== profile.id));
    } catch (err) {
      console.error('Failed searching players:', err);
    } finally {
      setSearching(false);
    }
  };

  const onRewardRef = useRef(onWatchRewardedAdReward);
  useEffect(() => {
    onRewardRef.current = onWatchRewardedAdReward;
  }, [onWatchRewardedAdReward]);

  const clearAdRequestFlags = () => {
    adRequestActiveRef.current = false;
    if (typeof window !== 'undefined') {
      (window as any).userExplicitAdRequested = false;
    }
    try {
      sessionStorage.removeItem('user_explicit_ad_requested');
    } catch (e) {}
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).onAndroidAdRewarded = () => {
        clearAdRequestFlags();
        setIsWatchingAd(false);
        setIsAdLoading(false);
        onRewardRef.current?.();
        setShowAdSuccess(true);
      };

      (window as any).onAndroidAdDismissed = () => {
        clearAdRequestFlags();
        setIsWatchingAd(false);
        setIsAdLoading(false);
      };

      (window as any).onAndroidAdFailedToShow = (err: string) => {
        clearAdRequestFlags();
        setIsWatchingAd(false);
        setIsAdLoading(false);
        alert("Reklam gösterilemedi: " + err);
      };

      (window as any).onAndroidAdFailedToLoad = (err: string) => {
        clearAdRequestFlags();
        setIsAdLoading(false);
        alert("Reklam yüklenemedi: " + err);
      };

      (window as any).onAndroidAdLoaded = () => {
        const hasExplicitRequest = adRequestActiveRef.current || 
          (typeof window !== 'undefined' && (window as any).userExplicitAdRequested === true) ||
          (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('user_explicit_ad_requested') === 'true');

        if (!hasExplicitRequest) {
          console.log("onAndroidAdLoaded triggered, but no active user request. Skipping auto-show.");
          clearAdRequestFlags();
          setIsAdLoading(false);
          return;
        }

        // Reset all flags first to prevent any back-to-back triggers!
        clearAdRequestFlags();
        setIsAdLoading(false);
        try {
          if ((window as any).AndroidBridge && (window as any).AndroidBridge.showRewardedAd) {
            (window as any).AndroidBridge.showRewardedAd();
          }
        } catch (e) {
          console.error("Error showing ad after load:", e);
        }
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).onAndroidAdRewarded;
        delete (window as any).onAndroidAdDismissed;
        delete (window as any).onAndroidAdFailedToShow;
        delete (window as any).onAndroidAdFailedToLoad;
        delete (window as any).onAndroidAdLoaded;
      }
    };
  }, []);

  const startRewardedAdWatch = () => {
    if (isAdLoading || isWatchingAd) return; // Prevent double-clicking
    if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
      adRequestActiveRef.current = true; // Set active request flag
      (window as any).userExplicitAdRequested = true;
      try {
        sessionStorage.setItem('user_explicit_ad_requested', 'true');
      } catch (e) {}
      setIsAdLoading(true);
      try {
        if ((window as any).AndroidBridge.isRewardedAdLoaded && (window as any).AndroidBridge.isRewardedAdLoaded()) {
          if ((window as any).AndroidBridge.showRewardedAd) {
            clearAdRequestFlags(); // Will be shown immediately, reset the flag
            (window as any).AndroidBridge.showRewardedAd();
          }
        } else {
          if ((window as any).AndroidBridge.loadRewardedAd) {
            (window as any).AndroidBridge.loadRewardedAd();
          }
          // Fallback timer: if it doesn't load in 2.5 seconds, try showing or notify
          setTimeout(() => {
            setIsAdLoading(curr => {
              if (curr) {
                const hasExplicitRequest = adRequestActiveRef.current || 
                  (typeof window !== 'undefined' && (window as any).userExplicitAdRequested === true) ||
                  (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('user_explicit_ad_requested') === 'true');

                if (hasExplicitRequest && (window as any).AndroidBridge && (window as any).AndroidBridge.showRewardedAd) {
                  clearAdRequestFlags(); // Reset flag before showing
                  (window as any).AndroidBridge.showRewardedAd();
                }
              }
              return curr;
            });
          }, 2500);
        }
      } catch (e) {
        console.error("Error triggering native ad:", e);
        adRequestActiveRef.current = false;
        setIsAdLoading(false);
      }
    } else {
      // Browser simulation
      setIsWatchingAd(true);
      setAdCountdown(5);

      const interval = setInterval(() => {
        setAdCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsWatchingAd(false);
            onWatchRewardedAdReward?.();
            setShowAdSuccess(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    if (showFriendsModal) {
      refreshFriendsList();
      // Clear search results upon opening modal
      setFriendsSearchTerm('');
      setSearchedPlayers([]);
      setSearchHasRun(false);
    }
  }, [showFriendsModal, profile.friends]);

  // Profile Inline Editor State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>(profile.name);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(profile.avatarUrl || '🧠');
  const [isTouched, setIsTouched] = useState<boolean>(false);
  const [dbUsernameError, setDbUsernameError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState<boolean>(false);
  const error = (isTouched || editName !== profile.name ? validateUsername(editName, [], profile.id) : null) || dbUsernameError;

  React.useEffect(() => {
    setEditName(profile.name);
  }, [profile.name]);

  const AVATAR_PRESETS = ['⚔️', '🧠', '🐺', '🦁', '🧙‍♂️', '🦊', '👾', '🦄', '⚡', '👑', '🎯', '🚀', '🔥', '🐉', '🐼', '🛡️', '🏆', '🦉'];

  const handleCopyLink = () => {
    const baseUrl = getBaseUrl();
    const shareLink = baseUrl ? baseUrl : (window.location.origin || window.location.href);
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProfile = async () => {
    setIsTouched(true);
    setDbUsernameError(null);
    const validationError = validateUsername(editName, [], profile.id);
    if (validationError) return;

    if (editName.trim() && editName.trim() !== profile.name) {
      setIsCheckingName(true);
      try {
        const exists = await checkUsernameExists(editName.trim(), profile.id);
        if (exists) {
          setDbUsernameError('Bu kullanıcı adı daha önce alınmıştır, lütfen başka bir tane seçin.');
          setIsCheckingName(false);
          return;
        }
      } catch (err) {
        console.error('Error checking unique username:', err);
      } finally {
        setIsCheckingName(false);
      }
    }

    onUpdateProfile(editName.trim(), selectedAvatar);
    setIsEditing(false);
    setIsTouched(false);
  };

  // Determine dynamic inclusive player title based on dailyScore
  const getWarriorTitle = (score: number) => {
    const level = getLevelForScore(score);
    let title = 'Kelime Kaşifi 🔍';
    if (level === 1) title = 'Kelime Kaşifi 🔍';
    else if (level === 2) title = 'Hece Gezgini 🗺️';
    else if (level === 3) title = 'Sözcük Mimarı 🧱';
    else if (level === 4) title = 'Dil Sanatçısı 🎨';
    else if (level < 10) title = 'Usta Sözlükçü 📚';
    else if (level < 20) title = 'Kelime Savaşçısı ⚔️';
    else if (level < 50) title = 'Cümle Muhafızı 🛡️';
    else if (level < 100) title = 'Edebiyat Şövalyesi 🎖️';
    else if (level < 250) title = 'Leksikograf Şefi 🎓';
    else if (level < 500) title = 'Dil Bilimci Profesör 🧠';
    else title = 'Efsanevi Kelime Bilgesi 👑';

    return `${level}. Seviye: ${title}`;
  };

  // Calculate detailed progress towards the next level
  const getLevelProgress = (score: number) => {
    const level = getLevelForScore(score);
    const currentLevelScore = getXPForLevel(level);
    const nextLevelScore = getXPForLevel(level + 1);
    const range = nextLevelScore - currentLevelScore;
    const progressInLevel = score - currentLevelScore;
    const percent = range > 0 ? Math.min(100, Math.max(0, (progressInLevel / range) * 100)) : 100;

    // Derive title
    let title = 'Kelime Kaşifi 🔍';
    if (level === 1) title = 'Kelime Kaşifi 🔍';
    else if (level === 2) title = 'Hece Gezgini 🗺️';
    else if (level === 3) title = 'Sözcük Mimarı 🧱';
    else if (level === 4) title = 'Dil Sanatçısı 🎨';
    else if (level < 10) title = 'Usta Sözlükçü 📚';
    else if (level < 20) title = 'Kelime Savaşçısı ⚔️';
    else if (level < 50) title = 'Cümle Muhafızı 🛡️';
    else if (level < 100) title = 'Edebiyat Şövalyesi 🎖️';
    else if (level < 250) title = 'Leksikograf Şefi 🎓';
    else if (level < 500) title = 'Dil Bilimci Profesör 🧠';
    else title = 'Efsanevi Kelime Bilgesi 👑';

    return {
      level,
      title,
      currentLevelScore: Math.round(currentLevelScore),
      nextLevelScore: Math.round(nextLevelScore),
      percent,
      progressInLevel: Math.round(progressInLevel),
      range: Math.round(range)
    };
  };

  // Get all friends with status
  const friendsWithStatus = confirmedFriends.map(friend => {
    return {
      ...friend,
      isOnline: false,
      status: 'offline',
      avatarUrl: friend.avatarUrl
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

  const winRate = profile.stats && profile.stats.gamesPlayed > 0 
    ? Math.round((profile.stats.gamesWon / profile.stats.gamesPlayed) * 100) 
    : 0;

  if (showGameSetup) {
    return (
      <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto card-theme rounded-[2rem] border border-[#3E485A]/30 p-4 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between gap-y-3 h-full max-h-full transition-all duration-200 text-white animate-scale-up" id="welcome-setup-page">
        {/* Decorative ambient glowing background rings */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header section with back button and centered title */}
        <div className="w-full flex flex-col md:grid md:grid-cols-5 items-center gap-2 border-b border-[#3E485A]/40 pb-2.5 relative z-10" id="setup-header-section">
          <div className="md:col-span-1 w-full flex justify-start">
            <button
              onClick={() => setShowGameSetup(false)}
              className="flex items-center gap-1 text-xs font-black uppercase bg-[#FAF6E9] hover:bg-[#F3EFE0] active:bg-[#EBE6D5] text-[#2E3748] px-3 py-1.5 rounded-xl border border-[#EBE6D5] shadow-md transition-all active:scale-95 cursor-pointer"
              id="setup-back-btn"
            >
              <ArrowLeft size={12} className="stroke-[2.5]" />
              <span>Geri Dön</span>
            </button>
          </div>
          
          <div className="md:col-span-3 flex flex-col items-center justify-center gap-0.5 text-center">
            <div className="flex items-center justify-center gap-2">
              <Swords className="w-5 h-5 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)] animate-pulse" />
              <h1 className="text-lg sm:text-xl font-light font-serif tracking-[0.2em] text-[#FAF6E9] uppercase drop-shadow-md leading-none">
                KELİME SAVAŞI
              </h1>
            </div>
            <div className="h-0.5 w-12 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent mt-1" />
            <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-amber-200/50 uppercase mt-0.5">OYUN MODU VE AYARLARI</span>
          </div>

          <div className="hidden md:block md:col-span-1" />
        </div>

        {/* MODE TABS HEADER INSIDE GAME SETUP SCREEN */}
        <div className="w-full bg-[#1A212D]/95 border-2 border-[#3E485A]/70 p-1.5 rounded-2xl shadow-xl flex items-center gap-1.5 relative z-10" id="setup-game-mode-tab-bar">
          <button
            onClick={() => setSelectedGameModeTab('solo')}
            className={`flex-1 py-3 px-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
              selectedGameModeTab === 'solo'
                ? 'bg-[#FAF6E9] text-[#2E3748] shadow-[0_3px_0_#D9D4C3] scale-[1.01]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            id="tab-btn-solo-mode"
          >
            <Puzzle size={18} className={selectedGameModeTab === 'solo' ? 'text-emerald-700 stroke-[2.5]' : 'text-gray-400'} />
            <div className="text-left leading-none">
              <span className="block font-black text-xs sm:text-sm">Solo Oyun</span>
              <span className="block text-[8px] opacity-75 font-sans mt-0.5 font-bold">Tek Oyunculu Mod</span>
            </div>
          </button>

          <button
            onClick={() => setSelectedGameModeTab('duel')}
            className={`flex-1 py-3 px-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
              selectedGameModeTab === 'duel'
                ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_3px_0_#D97706] scale-[1.01]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            id="tab-btn-duel-mode"
          >
            <Swords size={18} className={selectedGameModeTab === 'duel' ? 'text-slate-950 stroke-[2.5]' : 'text-gray-400'} />
            <div className="text-left leading-none">
              <div className="flex items-center gap-1">
                <span className="font-black text-xs sm:text-sm">Canlı Oyna</span>
                <span className="text-[7.5px] bg-slate-950 text-amber-300 font-mono font-black px-1.5 py-0.2 rounded-full uppercase">1v1</span>
              </div>
              <span className="block text-[8px] opacity-80 font-sans mt-0.5 font-bold">Online Düello</span>
            </div>
          </button>
        </div>

        {/* Setup Content Based on Active Tab */}
        <div className="space-y-3 relative z-10 flex-1 flex flex-col justify-between min-h-0" id="action-settings-card">
          {selectedGameModeTab === 'solo' ? (
            /* SOLO OYUN TAB CONTENT */
            <div className="space-y-3 flex-1 flex flex-col justify-between min-h-0 animate-fade-in" id="solo-setup-panel">
              <div className="space-y-3 bg-[#3D4756]/30 p-4 sm:p-4.5 rounded-[1.5rem] border border-white/5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Word Length Selector */}
                  <div className="space-y-1.5 text-left">
                    <span className="text-[9px] font-black text-amber-300/80 font-mono tracking-wider uppercase block">HARF SAYISI SEÇİMİ</span>
                    <div className="grid grid-cols-6 gap-1 p-0.5 bg-black/35 rounded-xl border border-white/5">
                      {[3, 4, 5, 6, 7, 8].map((len) => (
                        <button
                          key={len}
                          onClick={() => onChangeWordLength(len)}
                          className={`py-1.5 rounded-lg text-xs font-black transition-all duration-200 active:scale-90 cursor-pointer ${
                            wordLength === len
                              ? 'bg-[#FAF6E9] text-[#2E3748] shadow-sm ring-2 ring-amber-400/20'
                              : 'text-[#FAF6E9]/75 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {len}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dictionary Mode Selector */}
                  <div className="space-y-1.5 text-left">
                    <span className="text-[9px] font-black text-amber-300/80 font-mono tracking-wider uppercase block">SÖZLÜK MODU</span>
                    <div className="grid grid-cols-2 gap-1 bg-black/35 p-0.5 rounded-xl border border-white/5">
                      <button
                        onClick={() => onChangeDictionaryMode('tdk_online')}
                        className={`py-1.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                          dictionaryMode === 'tdk_online'
                            ? 'bg-[#FAF6E9] text-[#2E3748] shadow-sm ring-2 ring-amber-400/20'
                            : 'text-[#FAF6E9]/75 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Globe size={11} className="stroke-[2.5]" />
                        <span>Sözlük Modu</span>
                      </button>
                      <button
                        onClick={() => onChangeDictionaryMode('no_validation')}
                        className={`py-1.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                          dictionaryMode === 'no_validation'
                            ? 'bg-[#FAF6E9] text-[#2E3748] shadow-sm ring-2 ring-amber-400/20'
                            : 'text-[#FAF6E9]/75 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <ShieldAlert size={11} className="stroke-[2.5]" />
                        <span>Serbest</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Time Rule */}
                <div className="space-y-1.5 text-left border-t border-white/5 pt-2">
                  <span className="text-[9px] font-black text-amber-300/80 font-mono tracking-wider uppercase flex items-center gap-1">
                    <Zap size={10} className="text-amber-400 animate-pulse fill-amber-400/20" /> SÜRE VE ZAMAN KURALI
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onChangeGameMode('timed')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-black transition-all duration-200 flex items-center justify-center gap-1.5 border active:scale-95 cursor-pointer ${
                        gameMode === 'timed'
                          ? 'bg-[#FAF6E9] border-[#FAF6E9] text-[#2E3748] shadow-sm ring-2 ring-amber-400/20'
                          : 'bg-black/20 text-[#FAF6E9]/75 border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <span>⏱️ Süreli (20 sn)</span>
                    </button>
                    <button
                      onClick={() => onChangeGameMode('untimed')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-black transition-all duration-200 flex items-center justify-center gap-1.5 border active:scale-95 cursor-pointer ${
                        gameMode === 'untimed'
                          ? 'bg-[#FAF6E9] border-[#FAF6E9] text-[#2E3748] shadow-sm ring-2 ring-amber-400/20'
                          : 'bg-black/20 text-[#FAF6E9]/75 border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <span>♾️ Süresiz</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Info Panel */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-3 text-left space-y-0.5 relative overflow-hidden" id="solo-info-panel">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-black text-emerald-300 uppercase tracking-widest font-mono">
                    SOLO PRATİK MODU
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 leading-snug font-sans">
                  Kendi başınıza pratik yapıp kendinizi test edin! Süreli veya süresiz oynayarak kelime haznenizi genişletin.
                </p>
              </div>

              {/* Solo Launch Button */}
              <button
                onClick={() => {
                  onStartSoloGame();
                  setShowGameSetup(false);
                }}
                className="w-full bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.98] text-[#2E3748] font-black text-sm py-3.5 px-4 rounded-2xl shadow-[0_4px_0_#D9D4C3,0_5px_10px_rgba(0,0,0,0.15)] transition-all flex items-center justify-between uppercase tracking-wider cursor-pointer border border-[#EBE6D5]"
                id="start-solo-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 border border-emerald-500/20">
                    <Puzzle size={20} className="text-emerald-700 stroke-[2.5]" />
                  </div>
                  <div className="text-left leading-tight">
                    <span className="font-black text-[#2E3748] text-sm tracking-wide block">SOLO OYUNA BAŞLA</span>
                    <span className="block text-[9.5px] font-bold text-gray-500 font-sans normal-case mt-0.5">Tek oyunculu kelime oyunu</span>
                  </div>
                </div>
                <div className="px-3 py-1.5 bg-[#2E3748] text-[#FAF6E9] text-[10px] font-black rounded-xl uppercase tracking-widest flex items-center gap-1">
                  <span>BAŞLAT</span>
                  <Play size={10} className="fill-current" />
                </div>
              </button>
            </div>
          ) : (
            /* CANLI OYNA / DÜELLO TAB CONTENT */
            <div className="space-y-3 flex-1 flex flex-col justify-between min-h-0 animate-fade-in" id="duel-setup-panel">
              <div className="space-y-3 bg-[#3D4756]/30 p-4 sm:p-4.5 rounded-[1.5rem] border border-white/5 text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[9px] font-black text-amber-300 font-mono tracking-wider uppercase block">CANLI DÜELLO AYARLARI</span>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono font-black text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isOnline ? 'ONLINE CANLI' : 'BAĞLANIYOR'}</span>
                  </div>
                </div>

                {/* Word Length Selector for Duels */}
                <div className="space-y-1.5 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-amber-300/80 font-mono tracking-wider uppercase block">DÜELLO HARF SAYISI</span>
                    <span className="text-[10px] font-mono text-amber-400 font-bold">{currentDuelWordLength} Harf</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1 p-0.5 bg-black/35 rounded-xl border border-white/5">
                    {[3, 4, 5, 6, 7, 8].map((len) => (
                      <button
                        key={len}
                        onClick={() => handleDuelWordLengthChange(len)}
                        className={`py-1.5 rounded-lg text-xs font-black transition-all duration-200 active:scale-90 cursor-pointer ${
                          currentDuelWordLength === len
                            ? 'bg-amber-400 text-slate-950 shadow-sm font-black'
                            : 'text-[#FAF6E9]/75 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {len}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Duel Mode Info Box */}
              <div className="bg-black/35 border border-white/5 rounded-2xl p-3 text-left space-y-0.5 relative overflow-hidden" id="duel-info-panel">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] font-black text-amber-300 uppercase tracking-widest font-mono">
                    CANLI 1v1 DÜELLO KURALLARI
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 leading-snug font-sans">
                  Gerçek zamanlı bir rakiple aynı gizli kelimeyi en az denemede ve en hızlı şekilde tahmin etmek için yarışın. Kazanan +100 Savaş Puanı kazanır!
                </p>
              </div>

              {/* Queued or Start Matchmaking Button */}
              {matchmakingStatus === 'queued' ? (
                <div className="w-full bg-amber-950/60 border border-amber-500/50 rounded-2xl p-4 flex flex-col items-center gap-2 text-center shadow-lg">
                  <div className="flex items-center gap-2 text-amber-300 font-black text-xs sm:text-sm uppercase tracking-wider">
                    <Swords size={20} className="animate-spin text-amber-400" />
                    <span>RAKİP ARANIYOR ({currentDuelWordLength} HARF)...</span>
                  </div>
                  <p className="text-[10px] text-amber-200/80 font-bold">Lütfen bekleyin, uygun bir rakip eşleştiriliyor.</p>
                  <button
                    onClick={() => onStartMatchmaking && onStartMatchmaking(currentDuelWordLength)}
                    className="mt-1 text-xs font-black text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 px-4 py-2 rounded-xl uppercase tracking-wider transition cursor-pointer active:scale-95 shadow-sm"
                    id="cancel-matchmaking-setup-btn"
                  >
                    Aramayı İptal Et
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (onStartMatchmaking) {
                      onStartMatchmaking(currentDuelWordLength);
                    }
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 py-3.5 px-4 rounded-2xl shadow-[0_4px_0_#D97706,0_8px_20px_rgba(245,158,11,0.35)] transition-all flex items-center justify-between uppercase tracking-wider cursor-pointer border border-amber-200/40"
                  id="start-duel-setup-btn"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-950/15 flex items-center justify-center shrink-0 border border-slate-900/10">
                      <Swords size={20} className="text-slate-950 stroke-[2.5]" />
                    </div>
                    <div className="text-left leading-tight">
                      <span className="font-black text-slate-950 text-sm tracking-wide block">CANLI DÜELLO ARA</span>
                      <span className="block text-[9.5px] font-bold text-slate-900/80 font-sans normal-case mt-0.5">Online 1v1 Rakip Bul</span>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 bg-slate-950 text-amber-300 text-[10px] font-black rounded-xl uppercase tracking-widest flex items-center gap-1 shadow-sm">
                    <span>1 Altın 🪙</span>
                    <Play size={10} className="fill-current" />
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return isEditing ? (
    <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto card-theme rounded-[2.5rem] border p-5 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between gap-y-[3.5vh] sm:gap-5 min-h-[82vh] md:min-h-0 animate-scale-up" id="welcome-screen-root">
      {/* Sparkles / Title */}
      <div className="flex justify-between items-center pb-2 border-b border-white/10">
        <span className="text-sm font-bold font-mono text-amber-200 uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles size={14} className="animate-pulse" /> Profilini Düzenle
        </span>
        <button 
          onClick={() => setIsEditing(false)}
          className="text-xs text-[#FAF6E9]/70 hover:text-white transition"
        >
          Kapat
        </button>
      </div>

      {/* Avatar Selector Grid */}
      <div className="space-y-3 text-left">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-bold text-amber-100/60 uppercase tracking-wider block font-sans">BİR AVATAR SEÇİN</label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              id="custom-avatar-upload"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      const MAX_WIDTH = 128;
                      const MAX_HEIGHT = 128;
                      let width = img.width;
                      let height = img.height;

                      if (width > height) {
                        if (width > MAX_WIDTH) {
                          height *= MAX_WIDTH / width;
                          width = MAX_WIDTH;
                        }
                      } else {
                        if (height > MAX_HEIGHT) {
                          width *= MAX_HEIGHT / height;
                          height = MAX_HEIGHT;
                        }
                      }

                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        setSelectedAvatar(dataUrl);
                      }
                    };
                    img.src = reader.result as string;
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            <label
              htmlFor="custom-avatar-upload"
              className="text-[9.5px] bg-[#FAF6E9] hover:bg-[#F3EFE0] text-slate-900 font-black px-3 py-1.5 rounded-xl transition duration-150 cursor-pointer uppercase tracking-wider flex items-center gap-1 shadow-sm"
            >
              <span>Fotoğraf Yükle 📸</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 p-2.5 bg-black/30 rounded-2xl border border-white/5 max-h-32 overflow-y-auto">
          {selectedAvatar && selectedAvatar.length >= 4 && (
            <button
              type="button"
              onClick={() => setSelectedAvatar(selectedAvatar)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition duration-150 active:scale-90 relative overflow-hidden ring-2 ring-amber-400 scale-105 shadow"
            >
              <img src={selectedAvatar} alt="Custom Avatar" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
            </button>
          )}
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSelectedAvatar(preset)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl transition duration-150 active:scale-90 hover:bg-white/10 ${
                selectedAvatar === preset 
                  ? 'bg-gradient-to-tr from-amber-400 to-amber-200 text-slate-900 scale-105 shadow' 
                  : ''
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Edit Name Input */}
      <div className="space-y-2 text-left">
        <label className="text-[10px] font-bold text-amber-100/60 uppercase tracking-wider block font-sans">TAKMA ADINIZ</label>
        <input
          type="text"
          maxLength={26}
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value);
            setIsTouched(true);
            setDbUsernameError(null);
          }}
          placeholder="Takma adınızı yazın..."
          className={`w-full bg-[#2E3748]/55 border ${error ? 'border-rose-500 focus:ring-rose-400/40' : 'border-white/5 focus:ring-amber-200/40'} rounded-xl px-4 py-2.5 text-sm font-bold text-[#FAF6E9] focus:outline-none focus:ring-2`}
        />
        {error && (
          <p className="text-xs text-rose-400 font-semibold px-1 mt-1 animate-fade-in">
            ⚠️ {error}
          </p>
        )}
      </div>

      {/* Save / Cancel buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => {
            setIsEditing(false);
            setIsTouched(false);
          }}
          className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:bg-white/5 transition"
        >
          Vazgeç
        </button>
        <button
          onClick={handleSaveProfile}
          disabled={!editName.trim() || !!error || isCheckingName}
          className="flex-1 py-3 px-4 rounded-xl bg-[#FAF6E9] hover:bg-[#F3EFE0] disabled:opacity-50 text-[#2E3748] text-xs font-black transition shadow-md flex items-center justify-center gap-1.5"
        >
          {isCheckingName ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-[#2E3748] border-t-transparent rounded-full animate-spin" />
              <span>Kontrol ediliyor...</span>
            </>
          ) : (
            <span>Onayla</span>
          )}
        </button>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto bg-[#1E2532] rounded-[2.5rem] p-5 sm:p-7 shadow-2xl relative overflow-hidden flex flex-col justify-between gap-y-4 sm:gap-y-5 min-h-[82vh] md:min-h-0 md:max-h-none md:h-auto transition-all duration-200 text-white animate-scale-up" id="welcome-screen-root">
      
      {/* App Title Header with AKTİF status */}
      <div className="flex items-center justify-between w-full relative z-10 gap-2" id="welcome-header-title">
        {/* Shimmering Gold Wallet in welcome header with Daily Bonus Status Indicator */}
        <div className="flex flex-col items-start gap-1 shrink-0">
          <GoldWallet gold={profile.gold !== undefined ? profile.gold : 20} />
          <button
            onClick={() => {
              if (!isDailyClaimed && onClaimDailyReward) {
                onClaimDailyReward();
              }
            }}
            disabled={isDailyClaimed}
            className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded-full border transition-all ${
              isDailyClaimed
                ? "bg-slate-800/40 border-white/5 text-gray-500 cursor-default"
                : "bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 border-amber-500/30 text-amber-300 cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.2)]"
            }`}
            title={isDailyClaimed ? "Bugünkü günlük giriş ödülü alındı" : "Günlük bonusun hazır! Almak için tıkla."}
          >
            <span className={`w-1 h-1 rounded-full ${isDailyClaimed ? "bg-gray-500" : "bg-amber-400 animate-pulse"}`} />
            <span>Bonus: {isDailyClaimed ? "ALINDI" : "HAZIR!"}</span>
          </button>
        </div>
        
        <div className="flex items-center justify-center gap-2 flex-1 md:flex-initial">
          {/* Stylized Golden Emblem */}
          <div className="w-5 h-5 flex items-center justify-center text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
              <polygon points="5 3 19 12 5 21 5 3" fill="rgba(245, 158, 11, 0.2)" />
              <line x1="12" y1="5" x2="12" y2="19" strokeWidth="1.5" />
            </svg>
          </div>
          <h1 className="text-sm xs:text-base sm:text-xl font-serif tracking-[0.1em] sm:tracking-[0.15em] text-[#F3EFE0] uppercase font-semibold text-center truncate">
            KELİME SAVAŞI
          </h1>
        </div>

        {/* Active connection status */}
        <div className="flex items-center gap-1 bg-[#1F2633] border border-white/5 rounded-full px-2.5 py-0.5 text-[8.5px] font-extrabold text-emerald-400 shadow-sm shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>AKTİF</span>
        </div>
      </div>

      {/* Unified Level, Profile Photo, Name Card (Requirement 5) */}
      {(() => {
        const progress = getLevelProgress(profile.dailyScore);
        return (
          <div className="w-full bg-[#FAF6E9] border-2 border-[#EBE6D5] rounded-3xl p-4 sm:p-5 shadow-[0_5px_0_#D9D4C3,0_8px_16px_rgba(0,0,0,0.15)] flex flex-col gap-4 text-left relative z-10 overflow-hidden" id="unified-level-profile-card">
            
            {/* Elegant Vintage Double Border & Corner Ornaments */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#E2DCBF]/85 fill-none p-1" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="2" y="2" width="96" height="96" rx="8" strokeWidth="0.75" />
              <rect x="3.5" y="3.5" width="93" height="93" rx="6" strokeWidth="0.5" strokeDasharray="1 1.5" />
              <path d="M 3.5 8 Q 8 8 8 3.5" strokeWidth="0.75" />
              <path d="M 96.5 8 Q 92 8 92 3.5" strokeWidth="0.75" />
              <path d="M 3.5 92 Q 8 92 8 96.5" strokeWidth="0.75" />
              <path d="M 96.5 92 Q 92 92 92 96.5" strokeWidth="0.75" />
            </svg>

            {/* Row 1: Brain Medallion + Name & Level + Trophy cup */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-3.5">
                {/* Clickable Avatar with a simple, elegant circular frame */}
                <div 
                  className="relative w-16 h-16 rounded-full bg-[#1A212D] border-2 border-amber-500/50 flex items-center justify-center overflow-hidden shrink-0 transition-transform duration-300 hover:scale-105 cursor-pointer"
                  onClick={() => setIsEditing(true)}
                >
                  {profile.avatarUrl && profile.avatarUrl.length > 3 ? (
                     <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                     <span className="text-3xl select-none">🧠</span>
                  )}
                </div>

                <div className="flex flex-col">
                  {/* Name: "Art" */}
                  <span className="text-2xl sm:text-3xl font-serif tracking-wide text-[#2E3748] font-bold leading-tight">{profile.name || 'Oyuncu'}</span>
                  {/* Level: "1. SEVİYE" */}
                  <span className="text-[11px] sm:text-xs font-black text-[#C59B27] font-mono tracking-wider uppercase mt-1">
                    {progress.level}. SEVİYE
                  </span>
                </div>
              </div>

              {/* Trophy Cup Badge in golden rounded rect */}
              <div className="w-10 h-10 rounded-xl bg-[#FEF9E6] border border-[#E2DCBF] flex items-center justify-center shrink-0 shadow-sm">
                <Trophy size={20} className="text-[#C59B27] stroke-[2.5]" />
              </div>
            </div>

            {/* Progress Bar with 0 P and 25 P limits */}
            <div className="w-full relative z-10 mt-1">
              <div className="w-full bg-slate-200/60 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300/30">
                <div 
                  style={{ width: `${progress.percent}%` }}
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_4px_rgba(245,158,11,0.2)]"
                />
              </div>
              <div className="flex justify-between text-[9px] font-black text-gray-500 font-mono mt-1.5 px-0.5 leading-none">
                <span>0 P</span>
                <span>{progress.level < 500 ? `${progress.range} P` : '∞'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ALTIN & ÖDÜL MERKEZİ CARD */}
      <div className="w-full bg-[#FAF6E9] border-2 border-[#EBE6D5] rounded-3xl p-4 sm:p-5 shadow-[0_5px_0_#D9D4C3,0_8px_16px_rgba(0,0,0,0.15)] flex flex-col gap-3.5 text-left relative z-10 overflow-hidden animate-fade-in" id="gold-rewards-card">
        {/* Elegant Vintage Double Border & Corner Ornaments */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#E2DCBF]/85 fill-none p-1" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="2" y="2" width="96" height="96" rx="8" strokeWidth="0.75" />
          <rect x="3.5" y="3.5" width="93" height="93" rx="6" strokeWidth="0.5" strokeDasharray="1 1.5" />
          <path d="M 3.5 8 Q 8 8 8 3.5" strokeWidth="0.75" />
          <path d="M 96.5 8 Q 92 8 92 3.5" strokeWidth="0.75" />
          <path d="M 3.5 92 Q 8 92 8 96.5" strokeWidth="0.75" />
          <path d="M 96.5 92 Q 92 92 92 96.5" strokeWidth="0.75" />
        </svg>

        <div className="flex items-center justify-between gap-3 relative z-10 border-b border-[#E2DCBF] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <span className="font-serif tracking-wide text-[#2E3748] font-bold text-base sm:text-lg">Cüzdanım & Ödüller</span>
          </div>
          <div className="bg-[#FEF9E6] px-2.5 py-1 rounded-xl border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
            <span className="text-xs sm:text-sm font-black text-[#C59B27] font-mono leading-none">{profile.gold !== undefined ? profile.gold : 20}</span>
            <span className="text-[10px] sm:text-xs font-black text-[#C59B27] font-mono leading-none">ALTIN</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-10">
          {/* Daily Login Button */}
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isDailyClaimed = profile.lastDailyLoginClaim === todayStr;
            return (
              <button
                disabled={isDailyClaimed}
                onClick={onClaimDailyReward}
                className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs flex items-center justify-between transition-all duration-150 active:scale-95 border uppercase tracking-wider ${
                  isDailyClaimed
                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border-emerald-200 text-emerald-800 shadow-sm cursor-pointer'
                }`}
                title={isDailyClaimed ? 'Günlük giriş ödülü zaten alındı' : 'Günlük 10 altın kazan'}
              >
                <div className="flex items-center gap-2">
                  <span>🎁</span>
                  <div className="text-left">
                    <span className="block font-black text-[10px] leading-tight text-emerald-900/80">GÜNLÜK GİRİŞ</span>
                    <span className="block text-[8px] font-mono text-gray-500 leading-none mt-0.5">RESET 00:00</span>
                  </div>
                </div>
                <span className="font-mono text-xs font-black text-emerald-600">{isDailyClaimed ? '✓ ALINDI' : '+10🪙'}</span>
              </button>
            );
          })()}

          {/* Rewarded Ad Button */}
          <button
            onClick={startRewardedAdWatch}
            disabled={isAdLoading || isWatchingAd}
            className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs flex items-center justify-between transition-all duration-150 active:scale-95 shadow-sm uppercase tracking-wider ${
              isAdLoading || isWatchingAd
                ? "bg-gray-100 border-gray-200 text-gray-450 cursor-not-allowed opacity-75"
                : "bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 border-amber-200 text-amber-850 cursor-pointer"
            }`}
            title="Reklam izleyerek 10 altın kazan"
          >
            <div className="flex items-center gap-2">
              <span>{isAdLoading ? "⏳" : "📺"}</span>
              <div className="text-left">
                <span className="block font-black text-[10px] leading-tight text-amber-900/80">
                  {isAdLoading ? "REKLAM HAZIRLANIYOR..." : isWatchingAd ? "REKLAM OYNATILIYOR..." : "REKLAM İZLE"}
                </span>
                {isAdLoading && (
                  <span className="block text-[8px] font-mono text-gray-500 leading-none mt-0.5">
                    LÜTFEN BEKLEYİN
                  </span>
                )}
              </div>
            </div>
            <span className="font-mono text-xs font-black text-amber-600">+10🪙</span>
          </button>
        </div>
      </div>

      {/* CARD 1: Single Main Action Button - OYUN OYNA */}
      <div className="w-full flex flex-col gap-2 relative z-10" id="main-play-section">
        <button
          onClick={() => setShowGameSetup(true)}
          className="w-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 py-4 px-5 rounded-3xl shadow-[0_5px_0_#D97706,0_8px_20px_rgba(245,158,11,0.35)] transition-all flex items-center justify-between uppercase tracking-wider cursor-pointer relative overflow-hidden border border-amber-200/50"
          id="main-start-game-btn"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-950/15 flex items-center justify-center shrink-0 border border-slate-900/10">
              <Swords size={24} className="text-slate-950 stroke-[2.5]" />
            </div>
            <div className="text-left leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-950 text-base sm:text-lg tracking-wide">OYUN OYNA</span>
                <span className="text-[8px] font-black bg-slate-950 text-amber-300 px-2 py-0.5 rounded-full uppercase tracking-widest font-mono">1v1 & SOLO ⚡</span>
              </div>
              <span className="block text-[10px] font-bold text-slate-900/80 font-sans normal-case mt-0.5">Solo Pratik veya Canlı 1v1 Düello Başlat</span>
            </div>
          </div>
          <div className="px-3.5 py-2 bg-slate-950 text-amber-300 text-[11px] font-black rounded-2xl uppercase tracking-widest shadow-sm flex items-center gap-1.5 shrink-0">
            <span>GİRİŞ</span>
            <Play size={12} className="fill-current" />
          </div>
        </button>
      </div>

      {/* CARD 3: Günün Bulmacası (Daily Puzzle) Card */}
      <div className="w-full relative z-10">
        {isDailyPuzzleCompletedToday ? (
          <div className="w-full relative overflow-hidden bg-[#FAF6E9] border-2 border-[#EBE6D5] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 shadow-[0_3px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.1)] text-left animate-fade-in">
            {/* Antique ornaments inside card */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#E2DCBF]/50 fill-none p-0.5" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="2.5" y="2.5" width="95" height="95" rx="6" strokeWidth="0.5" />
            </svg>

            <div className="flex items-center gap-3 min-w-0 z-10">
              {/* Golden Trophy Icon Badge */}
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 text-white rounded-xl flex items-center justify-center border border-amber-300 shadow-sm shrink-0">
                <Trophy size={18} className="stroke-[2.5]" />
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[7.5px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider font-mono">TAMAMLANDI</span>
                  <span className="text-[9px] font-black tracking-widest text-amber-800/80 uppercase font-sans">GÜNÜN BULMACASI</span>
                </div>
                <h4 className="text-xs font-black text-[#2E3748] truncate mt-1">Bugünün kelimesini çözdün! 🎉</h4>
                <p className="text-[9px] text-amber-700 font-bold mt-0.5 flex items-center gap-1">
                  <span>Sıfırlanma:</span>
                  <span className="font-mono text-amber-600">{timeLeftToReset || "09:06-31"}</span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => onStartDailyPuzzle?.()}
            className="w-full relative overflow-hidden bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.98] border-2 border-[#EBE6D5] rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left transition-all duration-300 shadow-[0_3px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.1)] cursor-pointer"
          >
            {/* Antique ornaments inside card */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#E2DCBF]/50 fill-none p-0.5" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="2.5" y="2.5" width="95" height="95" rx="6" strokeWidth="0.5" />
            </svg>

            <div className="flex items-center gap-3 min-w-0 z-10">
              {/* Daily Puzzle Puzzle Icon Badge */}
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 text-white rounded-xl flex items-center justify-center border border-amber-300 shadow-sm shrink-0">
                <Puzzle size={18} className="stroke-[2.5]" />
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[7.5px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider font-mono">YENİ</span>
                  <span className="text-[9px] font-black tracking-widest text-amber-800/80 uppercase font-sans">GÜNÜN BULMACASI</span>
                </div>
                <h4 className="text-xs font-black text-[#2E3748] truncate mt-1">{getDailyWordAndLength().length} Harfli Gizemli Kelime</h4>
                <p className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1">
                  <span>Kalan:</span>
                  <span className="font-mono text-amber-700 font-bold">{timeLeftToReset}</span>
                </p>
              </div>
            </div>
            
            {/* OYNA Action Button */}
            <div className="px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-extrabold text-[10px] uppercase tracking-widest rounded-lg transition-all shadow-sm flex items-center gap-1 shrink-0 z-10">
              <span>OYNA</span>
              <Play size={8} className="fill-current" />
            </div>
          </button>
        )}
      </div>

      {/* Beautiful Cream Action Grid */}
      <div className="grid grid-cols-4 gap-2.5 w-full relative z-10" id="bottom-buttons-grid">
        {/* Button 1: REKABET */}
        <button
          onClick={onOpenStats}
          className="bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.97] text-[#2E3748] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_4px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.15)] border border-[#EBE6D5] transition duration-150 cursor-pointer"
        >
          <Trophy size={20} className="text-[#2E3748] stroke-[2.5]" />
          <span className="text-[9px] font-black uppercase tracking-wider">REKABET</span>
        </button>

        {/* Button 2: ARKADAŞLAR */}
        <button
          onClick={() => setShowFriendsModal(true)}
          className="bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.97] text-[#2E3748] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_4px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.15)] border border-[#EBE6D5] transition duration-150 cursor-pointer relative"
        >
          <Users size={20} className="text-[#2E3748] stroke-[2.5]" />
          <span className="text-[9px] font-black uppercase tracking-wider">ARKADAŞ</span>
        </button>

        {/* Button 3: AYARLAR */}
        <button
          onClick={onOpenSettings}
          className="bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.97] text-[#2E3748] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_4px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.15)] border border-[#EBE6D5] transition duration-150 cursor-pointer"
        >
          <Sliders size={20} className="text-[#2E3748] stroke-[2.5]" />
          <span className="text-[9px] font-black uppercase tracking-wider">AYARLAR</span>
        </button>

        {/* Button 4: KURALLAR */}
        <button
          onClick={() => setShowRulesModal(true)}
          className="bg-[#FAF6E9] hover:bg-[#F3EFE0] active:scale-[0.97] text-[#2E3748] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_4px_0_#D9D4C3,0_4px_8px_rgba(0,0,0,0.15)] border border-[#EBE6D5] transition duration-150 cursor-pointer"
        >
          <HelpCircle size={18} className="stroke-[2.5]" />
          <span className="text-[9px] font-black uppercase tracking-wider">KURALLAR</span>
        </button>
      </div>

      {/* Beautiful 4-Point Star ornament background element (Requirement 8) */}
      <div className="absolute bottom-4 right-6 text-white/5 animate-pulse select-none pointer-events-none z-0">
        <svg className="w-14 h-14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c.5 6.5 5.5 11.5 12 12-.5 6.5-5.5 11.5-12 12-.5-6.5-5.5-11.5-12-12 .5-6.5 5.5-11.5 12-12z" />
        </svg>
      </div>

      {/* Rules Detail Popup Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-theme rounded-[2rem] p-6 w-full max-w-lg shadow-2xl space-y-4 animate-scale-up text-left relative overflow-hidden">
            {/* Glowing 4-point star accent in bottom right */}
            <div className="absolute bottom-6 right-8 text-amber-100/15 animate-pulse select-none pointer-events-none">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c.5 6.5 5.5 11.5 12 12-.5 6.5-5.5 11.5-12 12-.5-6.5-5.5-11.5-12-12 .5-6.5 5.5-11.5 12-12z" />
              </svg>
            </div>

            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-[#FAF6E9] uppercase tracking-wide flex items-center gap-2">
                  <HelpCircle size={18} className="text-amber-400" />
                  Nasıl Oynanır & Kurallar
                </h3>
                <p className="text-[10px] text-amber-100/50 font-mono font-bold uppercase mt-0.5">
                  YAPAY ZEKA DESTEKLİ KELİME SAVAŞI REHBERİ & PUANLAMA SİSTEMİ
                </p>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed text-[#FAF6E9]/90 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {/* Rule 1: Harf Renkleri */}
              <div className="bg-[#3D4756]/40 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Sparkles size={14} />
                  <span>1. Harf Renkleri & İpuçları</span>
                </div>
                <p className="text-[11px] leading-normal text-gray-300">
                  Tahmin ettiğiniz kelimedeki harfler size gizli kelimeye giden yolu gösterir:
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-1.5 text-center">
                    <span className="text-emerald-400 font-black block text-[11px]">YEŞİL</span>
                    <span className="text-[9px] text-gray-300 block">Doğru harf, doğru yer</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-1.5 text-center">
                    <span className="text-amber-400 font-black block text-[11px]">TURUNCU</span>
                    <span className="text-[9px] text-gray-300 block">Harf var, yeri yanlış</span>
                  </div>
                  <div className="bg-gray-500/10 border border-gray-500/25 rounded-lg p-1.5 text-center">
                    <span className="text-gray-400 font-black block text-[11px]">GRİ</span>
                    <span className="text-[9px] text-gray-300 block">Harf kelimede yok</span>
                  </div>
                </div>
              </div>

              {/* Rule 2: Puanlama Sistemi */}
              <div className="bg-[#3D4756]/40 p-3.5 rounded-xl border border-white/5 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Award size={14} />
                  <span>2. Yeni Puanlama Sistemi</span>
                </div>
                <p className="text-[11px] leading-normal text-gray-300">
                  Kelimeyi çözdüğünüz deneme sayısına göre alacağınız puanlar şu şekildedir:
                </p>
                <div className="space-y-1.5 text-[11px] bg-black/20 p-2.5 rounded-lg text-gray-300 font-mono">
                  <div className="flex justify-between">
                    <span>🥇 1. Denemede Bilmek:</span>
                    <span className="text-emerald-400 font-bold">+5 Puan</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1">
                    <span>🥈 2. Denemede Bilmek:</span>
                    <span className="text-teal-400 font-bold">+4 Puan</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1">
                    <span>🥉 3. Denemede Bilmek:</span>
                    <span className="text-amber-400 font-bold">+3 Puan</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1">
                    <span>🧱 4. Denemede Bilmek:</span>
                    <span className="text-orange-400 font-bold">+2 Puan</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1">
                    <span>👾 5 veya 6. Denemede Bilmek:</span>
                    <span className="text-rose-400 font-bold">+1 Puan</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1 text-[10px] text-amber-300/80">
                    <span>🛡️ Maksimum Limit:</span>
                    <span>Bir kelimeden en fazla 5 Puan kazanılabilir!</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1 text-[10px] text-yellow-400/90 font-bold">
                    <span>☀️ Günlük Bulmaca Ödülü:</span>
                    <span>Sabit 5 Savaş Puanı & Bilge Rozeti!</span>
                  </div>
                </div>
              </div>

              {/* Rule 3: Süre Kuralları */}
              <div className="bg-[#3D4756]/40 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Clock size={14} />
                  <span>3. Süre Kuralları (⏱️ Süreli Oyun)</span>
                </div>
                <p className="text-[11px] leading-normal text-gray-300">
                  Süreli oyun modunda her geçerli tahmin girdikten sonra süre sayacı tekrar <strong className="text-white">20 saniyeye</strong> sıfırlanır. Bu sayede hızlı düşünen ve kelimeleri seri bilen oyuncular devasa zaman bonusları toplayabilirler!
                </p>
              </div>

              {/* Rule 4: Sözlük Modu Doğrulaması */}
              <div className="bg-[#3D4756]/40 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldAlert size={14} />
                  <span>4. Sözlük Modu Doğrulaması</span>
                </div>
                <p className="text-[11px] leading-normal text-gray-300">
                  Rastgele harf tuşlanmasını veya anlamsız girişleri önlemek için tüm kelimeler Sözlük Modu tarafından anlık doğrulanır. 
                  İnternet kesildiğinde ise akıllı <strong className="text-white">Türkçe Hece ve Harf Uyumu Koruması</strong> devreye girerek geçerli Türkçe kelimeleri oynamaya devam etmenizi sağlar.
                </p>
              </div>

              {/* Rule 5: Çok Oyunculu Düellolar */}
              <div className="bg-[#3D4756]/40 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Swords size={14} />
                  <span>5. Canlı Düellolar</span>
                </div>
                <p className="text-[11px] leading-normal text-gray-300">
                  Arkadaşlarınızla lobide buluşarak veya rastgele eşleşme ile canlı düello başlatabilirsiniz. İki taraf da aynı gizli kelimeyi çözmeye çalışır. Kelimeyi en az denemede ve en kısa sürede çözen taraf düelloyu kazanır ve hanesine devasa <strong className="text-amber-400">+100 Savaş Puanı</strong> yazdırır!
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-between items-center">
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 bg-[#3D4756]/30 hover:bg-[#3D4756]/60 text-gray-300 px-3 py-2 rounded-xl text-[10px] font-bold transition border border-white/5 cursor-pointer"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copied ? 'Kopyalandı!' : 'Arkadaş Davet Et'}</span>
              </button>

              <button
                onClick={() => setShowRulesModal(false)}
                className="bg-[#FAF6E9] hover:bg-[#F3EFE0] text-[#2E3748] font-black text-xs px-4 py-2 rounded-xl shadow-md transition cursor-pointer"
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Friends Modal (Aktif Arkadaşlar) */}
      {showFriendsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-theme rounded-[2rem] p-6 w-full max-w-md shadow-2xl space-y-4 animate-scale-up text-left relative overflow-hidden">
            {/* Glowing 4-point star accent in bottom right */}
            <div className="absolute bottom-6 right-8 text-amber-100/15 animate-pulse select-none pointer-events-none">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c.5 6.5 5.5 11.5 12 12-.5 6.5-5.5 11.5-12 12-.5-6.5-5.5-11.5-12-12 .5-6.5 5.5-11.5 12-12z" />
              </svg>
            </div>

            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-[#FAF6E9] uppercase tracking-wide flex items-center gap-2">
                  <Users size={18} className="text-amber-400" />
                  Arkadaşlık Merkezi
                </h3>
                <p className="text-[10px] text-amber-100/50 font-mono font-bold uppercase mt-0.5">
                  ARKADAŞ LİSTESİ
                </p>
              </div>
              <button
                onClick={() => setShowFriendsModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Custom Tab Selection inside Friends modal */}
            <div className="flex bg-black/20 p-1 rounded-xl">
              <button
                onClick={() => setFriendsTab('friends')}
                className={`flex-1 py-1.5 text-[10.5px] font-black uppercase rounded-lg transition-all text-center cursor-pointer ${
                  friendsTab === 'friends'
                    ? 'bg-[#FAF6E9] text-[#2E3748] shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Arkadaşlarım ({confirmedFriends.length})
              </button>
              <button
                onClick={() => setFriendsTab('find')}
                className={`flex-1 py-1.5 text-[10.5px] font-black uppercase rounded-lg transition-all text-center cursor-pointer ${
                  friendsTab === 'find'
                    ? 'bg-[#FAF6E9] text-[#2E3748] shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Oyuncu Bul
              </button>
            </div>

            {/* Search input for adding friends tab */}
            {friendsTab === 'find' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Oyuncu adı ile ara..."
                  value={friendsSearchTerm}
                  onChange={(e) => setFriendsSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchPlayers();
                    }
                  }}
                  className="flex-1 bg-black/25 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <button
                  disabled={searching}
                  onClick={handleSearchPlayers}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black uppercase transition shrink-0 cursor-pointer disabled:opacity-55"
                >
                  {searching ? 'Aranıyor...' : 'Ara'}
                </button>
              </div>
            )}

            <div className="space-y-2 text-xs leading-relaxed text-gray-300 max-h-[40vh] overflow-y-auto pr-1">
              {!isOnline ? (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-xs font-bold font-mono text-rose-450">ÇEVRİMDIŞI MOD</p>
                  <p className="text-[10px] mt-1 text-gray-400/85">Arkadaşlarını görebilmek ve savaş açabilmek için internet bağlantısı gerekir.</p>
                </div>
              ) : friendsTab === 'friends' ? (
                loadingFriends ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-mono uppercase tracking-wider">Arkadaşlar yükleniyor...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Gelen İstekler Section */}
                    {incomingRequests.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-left py-1 text-emerald-400 font-black uppercase text-[9px] tracking-wider font-mono">
                          📥 Gelen Arkadaşlık İstekleri ({incomingRequests.length})
                        </div>
                        {incomingRequests.map((request) => (
                          <div key={request.id} className="p-2.5 bg-[#3D4756]/45 rounded-xl border border-white/5 flex items-center justify-between text-left animate-scale-up">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#3D4756] flex items-center justify-center font-bold text-xs border border-white/10 shrink-0">
                                {request.avatarUrl ? (
                                  request.avatarUrl.length < 4 ? (
                                    <span className="text-sm select-none">{request.avatarUrl}</span>
                                  ) : (
                                    <img src={request.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                                  )
                                ) : (
                                  <span className="text-gray-400">{request.name.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div>
                                <span className="text-xs font-black text-[#FAF6E9] block leading-none">{request.name}</span>
                                <span className="text-[8.5px] text-emerald-400 block font-mono mt-0.5 uppercase tracking-wide">
                                  Sana İstek Gönderdi
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => addFriend(request.id)}
                              className="text-[9.5px] px-2.5 py-1 rounded-lg font-black uppercase transition duration-150 flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm cursor-pointer"
                            >
                              <UserPlus size={10} />
                              <span>Kabul Et</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Onaylı Arkadaşlar Section */}
                    <div className="space-y-1.5">
                      <div className="text-left py-1 text-amber-200/85 font-black uppercase text-[9px] tracking-wider font-mono">
                        Onaylı Arkadaşlarım ({friendsWithStatus.length})
                      </div>
                      
                      {friendsWithStatus.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-black/10 rounded-2xl p-4 border border-white/5">
                          <p className="text-xs font-black font-mono text-amber-450">HENÜZ ONAYLI ARKADAŞIN YOK 🏜️</p>
                          <p className="text-[10px] mt-1 text-gray-400/85">
                            Burada sadece senin eklediğin ve seni geri ekleyen onaylı arkadaşların listelenir. Oyuncu bulmak için yan sekmeyi kullanabilirsin!
                          </p>
                        </div>
                      ) : (
                        friendsWithStatus.map((friend) => (
                          <div key={friend.id} className="p-2.5 bg-[#3D4756]/45 rounded-xl border border-white/5 flex items-center justify-between text-left animate-scale-up">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-[#3D4756] flex items-center justify-center font-bold text-xs border border-white/10 shrink-0 relative">
                                {friend.avatarUrl ? (
                                  friend.avatarUrl.length < 4 ? (
                                    <span className="text-sm select-none">{friend.avatarUrl}</span>
                                  ) : (
                                    <img src={friend.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                                  )
                                ) : (
                                  <span className="text-gray-400">{friend.name.charAt(0).toUpperCase()}</span>
                                )}
                                <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[#2E3748] ${
                                  friend.isOnline ? 'bg-emerald-500' : 'bg-gray-500'
                                }`} />
                              </div>
                              <div>
                                <span className="text-xs font-black text-[#FAF6E9] block leading-none">{friend.name}</span>
                                <span className="text-[8.5px] text-gray-400 block font-mono mt-0.5 uppercase tracking-wide">
                                  {friend.isOnline ? (
                                    friend.status === 'playing' ? '🎮 Oyunda' : friend.status === 'challenging' ? '⚔️ Sırada' : '🟢 Boşta'
                                  ) : (
                                    '⚪ Çevrimdışı'
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => removeFriend(friend.id)}
                                className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                title="Arkadaşı Sil"
                              >
                                <UserMinus size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              ) : (
                /* Find Players Tab (Oyuncu Bul) */
                searching ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-mono uppercase tracking-wider">Oyuncu aranıyor...</p>
                  </div>
                ) : !searchHasRun ? (
                  /* Empty state before searching is performed */
                  null
                ) : searchedPlayers.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-xs font-black font-mono text-amber-450">OYUNCU BULUNAMADI 🔍</p>
                    <p className="text-[10px] mt-1 text-gray-400/85">
                      Girdiğiniz kullanıcı adıyla eşleşen bir oyuncu bulunamadı. Lütfen tam adını doğru yazdığınızdan emin olun.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {searchedPlayers.map((player) => {
                      const isAlreadyFriend = (profile.friends || []).includes(player.id);
                      const hasAddedMe = incomingRequests.some(r => r.id === player.id);
                      const isMutual = confirmedFriends.some(f => f.id === player.id);
                      
                      return (
                        <div key={player.id} className="p-2.5 bg-[#3D4756]/45 rounded-xl border border-white/5 flex items-center justify-between text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#3D4756] flex items-center justify-center font-bold text-xs border border-white/10 shrink-0">
                              {player.avatarUrl ? (
                                player.avatarUrl.length < 4 ? (
                                  <span className="text-sm select-none">{player.avatarUrl}</span>
                                ) : (
                                  <img src={player.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                                )
                              ) : (
                                <span className="text-gray-400">{player.name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div>
                              <span className="text-xs font-black text-[#FAF6E9] block leading-none">{player.name}</span>
                              <span className="text-[8.5px] text-gray-400 block font-mono mt-0.5 uppercase tracking-wide">
                                {isMutual ? '🟢 ARKADAŞINIZ' : '👤 OYUNCU'}
                              </span>
                            </div>
                          </div>

                          {isMutual ? (
                            <span className="text-[9.5px] text-emerald-400 font-bold uppercase">✓ Arkadaşsınız</span>
                          ) : isAlreadyFriend ? (
                            <span className="text-[9.5px] text-amber-400 font-bold uppercase">✓ İstek Gönderildi</span>
                          ) : (
                            <button
                              onClick={() => addFriend(player.id)}
                              className="text-[9.5px] px-2.5 py-1 rounded-lg font-black uppercase transition duration-150 flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm cursor-pointer"
                            >
                              <UserPlus size={10} />
                              <span>{hasAddedMe ? 'Kabul Et' : 'Arkadaş Ekle'}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-between items-center">
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 bg-[#3D4756]/30 hover:bg-[#3D4756]/60 text-gray-300 px-3 py-2 rounded-xl text-[10px] font-bold transition border border-white/5 cursor-pointer"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copied ? 'Kopyalandı!' : 'Arkadaş Davet Et'}</span>
              </button>

              <button
                onClick={() => setShowFriendsModal(false)}
                className="bg-[#FAF6E9] hover:bg-[#F3EFE0] text-[#2E3748] font-black text-xs px-4 py-2 rounded-xl shadow-md transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📺 AD-WATCHING OVERLAY */}
      {isWatchingAd && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <div className="absolute inset-0 rounded-3xl border border-dashed border-amber-500/20 animate-spin [animation-duration:40s]" />
            <span className="text-4xl block mb-4 animate-bounce">📺</span>
            <h3 className="text-[#FAF6E9] font-serif text-lg sm:text-xl font-bold uppercase tracking-wide leading-tight mb-2">
              Ödüllü Reklam Oynatılıyor
            </h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-6">
              Lütfen bekleyin, altın ödülünüz yükleniyor. Bu ekranı kapatmayınız...
            </p>

            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-white/5 mb-4">
              <div 
                style={{ width: `${(adCountdown / 5) * 100}%` }}
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              />
            </div>

            <div className="text-xs font-black text-amber-400 font-mono tracking-widest leading-none">
              REKLAM SÜRESİ: {adCountdown} saniye
            </div>
          </div>
        </div>
      )}

      {/* ⏳ AD-LOADING OVERLAY */}
      {isAdLoading && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <div className="absolute inset-0 rounded-3xl border border-dashed border-amber-500/20 animate-spin [animation-duration:15s]" />
            <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-[#FAF6E9] font-serif text-lg sm:text-xl font-bold uppercase tracking-wide leading-tight mb-2">
              Reklam Yükleniyor...
            </h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              AdMob reklamı güvenli şekilde hazırlanıyor. Lütfen bekleyin...
            </p>
          </div>
        </div>
      )}

      {/* 🎉 AD SUCCESS CELEBRATION POPUP */}
      {showAdSuccess && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 text-center animate-fade-in">
          <div className="w-full max-w-sm bg-[#FAF6E9] border-2 border-amber-500 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-scale-up">
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#E2DCBF] fill-none p-1" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="2" y="2" width="96" height="96" rx="8" strokeWidth="0.75" />
              <rect x="3.5" y="3.5" width="93" height="93" rx="6" strokeWidth="0.5" strokeDasharray="1 1.5" />
            </svg>

            <div className="text-5xl block mb-4 animate-bounce">🪙✨</div>
            <h3 className="text-[#2E3748] font-serif text-lg sm:text-xl font-black uppercase tracking-wide leading-tight mb-2">
              Tebrikler!
            </h3>
            <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-6">
              Ödüllü reklam başarıyla tamamlandı! Hesabınıza <span className="font-bold text-amber-600">10 Altın</span> eklendi.
            </p>

            <button
              onClick={() => setShowAdSuccess(false)}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition cursor-pointer"
            >
              Altınları Al!
            </button>
          </div>
        </div>
      )}

      {/* ⚔️ SEARCHING OPPONENT FULLSCREEN OVERLAY */}
      {matchmakingStatus === 'queued' && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-auto">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.25)] relative overflow-hidden animate-scale-up">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin flex items-center justify-center mx-auto">
                <Swords size={32} className="text-amber-400 animate-pulse" />
              </div>
            </div>

            <span className="text-xs font-black text-amber-400 font-mono tracking-widest uppercase block mb-1">CANLI 1v1 DÜELLO</span>
            <h3 className="text-xl font-black text-[#FAF6E9] tracking-wide uppercase mb-2">
              RAKİP ARANIYOR...
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              {wordLength} harfli canlı düello için rakip bekleniyor. Rakip eşleştiği anda oyun iki oyuncu için de aynı anda başlayacaktır.
            </p>

            <button
              onClick={() => onStartMatchmaking && onStartMatchmaking(wordLength)}
              className="w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 shadow-md"
              id="cancel-matchmaking-overlay-btn"
            >
              Aramayı İptal Et
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
