// Complete rebuild stamp for GitHub Actions: 2026-07-23 v1.0.2
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
} from './utils/soundEffects';
import GameBoard from './components/GameBoard';
import BottomBar from './components/BottomBar';
import Keyboard from './components/Keyboard';
import StatsModal from './components/StatsModal';
import MissionsModal from './components/MissionsModal';
import WelcomeScreen from './components/WelcomeScreen';
import GoldWallet from './components/GoldWallet';
import FriendsModal from './components/FriendsModal';
import SettingsModal, { AppSettings } from './components/SettingsModal';
import AuthScreen from './components/AuthScreen';
import BadgeUnlockedModal from './components/BadgeUnlockedModal';
import ProgressDots from './components/ProgressDots';
import { auth, onAuthStateChanged, fetchUserProfile, saveUserProfileToFirestore, signOutUser, fetchUserProfileByDeviceId, deleteUserProfile, signInAsGuest, clearMatchmakingState, updateUserPresence, db } from './lib/firebase';
import { doc, setDoc, updateDoc, onSnapshot, runTransaction, getDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { UserProfile, GameAttempt, DailyMission, Badge, NetworkLogEntry } from './types';
import { Swords, RotateCcw, AlertCircle, HelpCircle, Trophy, UserCheck, Flame, Hourglass, HelpCircle as HelpIcon, Sparkles, Upload, Trash2, Image, X, ArrowLeft, Info, Play, Home, LogOut, Wifi, WifiOff, Zap, Users } from 'lucide-react';
import { getRandomWord, isWordInCuratedList, getDailyWordAndLength, COMMON_TURKISH_WORDS, CLEANED_TURKISH_WORDS } from './data/wordlist';
import { turkishUpper, turkishLower, validateTurkishLinguistics } from './utils/turkish';
import { getApiUrl, getWsUrl, validateWordClientSide } from './utils/api';
import { calculateDynamicScore, verifyScoringAccuracy, getLevelForScore } from './utils/scoring';
import { getCachedWord, setCachedWord } from './utils/wordCache';
import { scheduleDailyNotifications } from './utils/notifications';

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
    friends: Array.isArray(p.friends) ? p.friends : [],
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
  { id: 'solve_8_150', title: '8 Harfli Efsane', description: '8 harfli modda toplam 150 kelimeyi doğru bil', iconName: 'Crown' },

  // Hızlı Çözücü (Speed Solver) Modu
  { id: 'fast_solve_15', title: 'Hızlı Çözücü ⚡', description: 'Bir oyunu 15 saniye veya daha kısa sürede tamamla', iconName: 'Zap' },
  { id: 'fast_solve_10', title: 'Şimşek Zeka 🌩️', description: 'Bir oyunu 10 saniye veya daha kısa sürede tamamla', iconName: 'Flame' },
  { id: 'fast_solve_5', title: 'Işık Hızı 🚀', description: 'Bir oyunu 5 saniye veya daha kısa sürede tamamla', iconName: 'Sparkles' }
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

const isGenericName = (n?: string) =>
  !n ||
  n === 'Oyuncu' ||
  n === 'Kelime Oyuncusu' ||
  n === 'Oyuncu 1' ||
  n === 'Oyuncu 2' ||
  n.startsWith('Misafir_') ||
  n.startsWith('Savaşçı_');

const getEffectiveSelfName = (
  profile: { name?: string; username?: string; displayName?: string },
  currentAuthUser?: any
): string => {
  const savedUsername = safeLocalStorage.getItem('saved_username');
  const pName = profile?.name || profile?.username || profile?.displayName || currentAuthUser?.displayName;

  if (pName && !isGenericName(pName)) {
    return pName.trim();
  }
  if (savedUsername && !isGenericName(savedUsername)) {
    return savedUsername.trim();
  }
  if (pName && pName.trim()) {
    return pName.trim();
  }
  if (savedUsername && savedUsername.trim()) {
    return savedUsername.trim();
  }
  return 'Oyuncu';
};

const resolveDuelPlayers = (rawP1: any, rawP2: any, profile: { id?: string; name?: string; username?: string; displayName?: string; avatarUrl?: string } | null, rawPlayers?: any) => {
  const currentAuthUser = auth.currentUser;
  const selfId = currentAuthUser?.uid || profile?.id || '';
  const selfName = getEffectiveSelfName(profile, currentAuthUser);

  const p1 = rawP1 || {};
  const p2 = rawP2 || {};

  let p1Id = p1.id || p1.uid || p1.playerId;
  let p2Id = p2.id || p2.uid || p2.playerId;

  if (!p1Id && rawPlayers && typeof rawPlayers === 'object') {
    const keys = Object.keys(rawPlayers);
    if (keys[0]) p1Id = keys[0];
  }
  if (!p2Id && rawPlayers && typeof rawPlayers === 'object') {
    const keys = Object.keys(rawPlayers);
    if (keys[1]) p2Id = keys[1];
  }

  // Real-time dynamic updates for players from rawPlayers map
  const p1Dynamic = (rawPlayers && p1Id && rawPlayers[p1Id]) || {};
  const p2Dynamic = (rawPlayers && p2Id && rawPlayers[p2Id]) || {};

  const mergedP1 = { ...p1, ...p1Dynamic };
  const mergedP2 = { ...p2, ...p2Dynamic };

  let p1Name = mergedP1.name || mergedP1.username || mergedP1.displayName || p1.name || p1.username || p1.displayName;
  let p2Name = mergedP2.name || mergedP2.username || mergedP2.displayName || p2.name || p2.username || p2.displayName;

  let p1Avatar = mergedP1.avatarUrl || mergedP1.avatar || p1.avatarUrl || p1.avatar || '';
  let p2Avatar = mergedP2.avatarUrl || mergedP2.avatar || p2.avatarUrl || p2.avatar || '';

  if (!p1Id) p1Id = 'p1';
  if (!p2Id) p2Id = 'p2';

  if (p1Id === selfId || (profile?.id && p1Id === profile.id)) {
    p1Name = selfName;
    if (profile?.avatarUrl) p1Avatar = profile.avatarUrl;
  } else if (!p1Name || isGenericName(p1Name)) {
    p1Name = 'Rakip';
  }

  if (p2Id === selfId || (profile?.id && p2Id === profile.id)) {
    p2Name = selfName;
    if (profile?.avatarUrl) p2Avatar = profile.avatarUrl;
  } else if (!p2Name || isGenericName(p2Name)) {
    p2Name = 'Rakip';
  }

  const finalP1 = {
    ...mergedP1,
    uid: p1Id,
    id: p1Id,
    name: p1Name,
    username: p1Name,
    displayName: p1Name,
    avatarUrl: p1Avatar
  };

  const finalP2 = {
    ...mergedP2,
    uid: p2Id,
    id: p2Id,
    name: p2Name,
    username: p2Name,
    displayName: p2Name,
    avatarUrl: p2Avatar
  };

  const parsedPlayers = {
    ...(rawPlayers || {}),
    [p1Id]: { ...(rawPlayers?.[p1Id] || {}), ...mergedP1, id: p1Id, name: p1Name, avatarUrl: p1Avatar },
    [p2Id]: { ...(rawPlayers?.[p2Id] || {}), ...mergedP2, id: p2Id, name: p2Name, avatarUrl: p2Avatar }
  };

  return {
    player1: finalP1,
    player2: finalP2,
    players: parsedPlayers
  };
};

/**
 * Utility to check if a key or player object represents "self".
 */
const checkIsSelfPlayer = (keyOrObj: any, currentUid: string, profileId?: string): boolean => {
  if (!keyOrObj) return false;
  const uidStr = String(currentUid || '').trim();
  const profStr = String(profileId || '').trim();

  if (typeof keyOrObj === 'string') {
    const k = keyOrObj.trim();
    if (uidStr && k === uidStr) return true;
    if (profStr && k === profStr) return true;
    if (k === 'self' || k === 'me') return true;
    return false;
  }

  const pId = String(keyOrObj.id || keyOrObj.uid || keyOrObj.profileId || '').trim();
  if (uidStr && pId && pId === uidStr) return true;
  if (profStr && pId && pId === profStr) return true;
  return false;
};

/**
 * Robust helper to extract accurate attempt count, attempts array, and win/completed status for any player in activeMatch.
 */
const getPlayerAttemptData = (
  match: any,
  isSelf: boolean,
  currentUid: string,
  profileId: string = '',
  localAttempts: any[] = [],
  fallbackCountState: number = 0
) => {
  let attemptsArray: any[] = isSelf ? [...localAttempts] : [];
  let maxCount = isSelf ? localAttempts.length : fallbackCountState;
  let isWon = false;
  let isCompleted = false;

  if (!match) {
    const localWon = isSelf && attemptsArray.some((a: any) => Array.isArray(a?.feedback) && a.feedback.every((f: string) => f === 'green'));
    return {
      count: Math.min(Math.max(maxCount, 0), 6),
      attempts: attemptsArray,
      isWon: localWon,
      isCompleted: maxCount >= 6 || localWon
    };
  }

  const processEntry = (obj: any, attsFromMatch?: any) => {
    if (!obj) return;

    const candidateAtts = attsFromMatch || obj.attempts || obj.guesses;
    if (Array.isArray(candidateAtts) && candidateAtts.length > 0) {
      if (candidateAtts.length > maxCount) {
        maxCount = candidateAtts.length;
      }
      if (candidateAtts.length > attemptsArray.length) {
        attemptsArray = candidateAtts;
      }
      if (candidateAtts.some((a: any) => Array.isArray(a?.feedback) && a.feedback.every((f: string) => f === 'green'))) {
        isWon = true;
      }
    }

    const countVal = Number(obj.currentAttemptCount ?? obj.attemptsCount ?? obj.attemptCount ?? (Array.isArray(candidateAtts) ? candidateAtts.length : 0)) || 0;
    if (countVal > maxCount) {
      maxCount = countVal;
    }

    if (obj.won === true || obj.isWon === true || obj.hasWon === true) {
      isWon = true;
    }
    if (obj.completed === true || obj.isCompleted === true || countVal >= 6 || isWon) {
      isCompleted = true;
    }
  };

  // 1. Scan match.players map
  if (match.players && typeof match.players === 'object') {
    Object.entries(match.players).forEach(([k, pObj]: [string, any]) => {
      const entryIsSelf = checkIsSelfPlayer(k, currentUid, profileId) || checkIsSelfPlayer(pObj, currentUid, profileId);
      if (entryIsSelf === isSelf) {
        const attsFromMatch = match.attempts?.[k];
        processEntry(pObj, attsFromMatch);
      }
    });
  }

  // 2. Scan match.attempts map
  if (match.attempts && typeof match.attempts === 'object') {
    Object.entries(match.attempts).forEach(([k, atts]: [string, any]) => {
      const entryIsSelf = checkIsSelfPlayer(k, currentUid, profileId);
      if (entryIsSelf === isSelf && Array.isArray(atts)) {
        if (atts.length > maxCount) maxCount = atts.length;
        if (atts.length > attemptsArray.length) attemptsArray = atts;
        if (atts.some((a: any) => Array.isArray(a?.feedback) && a.feedback.every((f: string) => f === 'green'))) {
          isWon = true;
        }
      }
    });
  }

  // 3. Scan top-level player1 / player2
  ['player1', 'player2'].forEach((pKey) => {
    const pObj = match[pKey];
    if (pObj) {
      const entryIsSelf = checkIsSelfPlayer(pObj, currentUid, profileId);
      if (entryIsSelf === isSelf) {
        processEntry(pObj);
      }
    }
  });

  if (isSelf && attemptsArray.some((a: any) => Array.isArray(a?.feedback) && a.feedback.every((f: string) => f === 'green'))) {
    isWon = true;
  }

  if (maxCount >= 6 || isWon) {
    isCompleted = true;
  }

  return {
    count: Math.min(Math.max(maxCount, 0), 6),
    attempts: attemptsArray,
    isWon,
    isCompleted
  };
};

function MatchStartOverlay({
  activeMatch,
  profile,
  onStartGame
}: {
  activeMatch: any;
  profile: any;
  onStartGame: () => void;
}) {
  const [countdown, setCountdown] = useState<number>(3);
  const onStartGameRef = useRef(onStartGame);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    onStartGameRef.current = onStartGame;
  }, [onStartGame]);

  const selfId = profile?.id;
  const activeProfile = { ...profile, id: selfId };
  const resolved = resolveDuelPlayers(activeMatch?.player1, activeMatch?.player2, activeProfile, activeMatch?.players);
  const p1 = resolved.player1 || { name: profile?.name || 'Sen', avatarUrl: profile?.avatarUrl || '🧠' };
  const p2 = resolved.player2 || { name: 'Rakip', avatarUrl: '⚔️' };

  useEffect(() => {
    hasTriggeredRef.current = false;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            setTimeout(() => {
              if (onStartGameRef.current) {
                onStartGameRef.current();
              }
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeMatch?.id || activeMatch?.matchId]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl text-[#FAF6E9] p-4 select-none animate-fade-in">
      {/* Top Banner */}
      <div className="text-center space-y-2 mb-8">
        <span className="px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold uppercase tracking-widest animate-pulse inline-block">
          ⚔️ DÜELLO EŞLEŞTİ — OYUN BAŞLIYOR
        </span>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {activeMatch?.wordLength || 5} Harfli Kelime Düellosu
        </h2>
        <p className="text-xs sm:text-sm text-slate-300">
          İki oyuncu da hazır. Düello başlatılıyor!
        </p>
      </div>

      {/* Versus Cards Container */}
      <div className="flex items-center justify-center gap-3 sm:gap-8 w-full max-w-md my-4">
        {/* Player 1 Card */}
        <div className="flex-1 flex flex-col items-center p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-lg mb-3">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-3xl sm:text-4xl">
              {p1.avatarUrl || '🧠'}
            </div>
          </div>
          <span className="font-bold text-sm sm:text-base text-white text-center truncate max-w-[110px]">
            {p1.name || 'Oyuncu 1'}
          </span>
          <span className="mt-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            HAZIR ✓
          </span>
        </div>

        {/* Center VS & Countdown Badge */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg text-white font-black text-lg sm:text-xl border-2 border-amber-300/40 animate-pulse">
            VS
          </div>
          <div className="mt-4 flex flex-col items-center">
            <span className="text-4xl sm:text-5xl font-black text-amber-400 font-mono tracking-tighter animate-bounce">
              {countdown > 0 ? countdown : '🚀'}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              {countdown > 0 ? 'Saniye' : 'Başlıyor!'}
            </span>
          </div>
        </div>

        {/* Player 2 Card */}
        <div className="flex-1 flex flex-col items-center p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-cyan-300 p-0.5 shadow-lg mb-3">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center text-3xl sm:text-4xl">
              {p2.avatarUrl || '⚔️'}
            </div>
          </div>
          <span className="font-bold text-sm sm:text-base text-white text-center truncate max-w-[110px]">
            {p2.name || 'Rakip'}
          </span>
          <span className="mt-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            HAZIR ✓
          </span>
        </div>
      </div>

      {/* Bottom Status Message */}
      <div className="mt-8 text-center text-xs text-slate-400 font-medium">
        Aynı kelimeyi ilk doğru tahmin eden kazanır!
      </div>
    </div>
  );
}

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
    const allowed = wordList.filter(w => w.length === wordLength && w.toLowerCase() !== targetLower && isLinguisticallyValid(w));
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
        setCurrentAttempt(suggestion.toUpperCase());
        showToast(`Tavsiye Kelime Yazıldı: ${suggestion.toUpperCase()} 💡`, "success");
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
    resumeAudioContext();
    document.body.classList.remove('ad-active');
    try { (window as any).AndroidBridge?.preventAdLayoutLoops?.(); } catch (e) {}

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
  const matchmakingStatusRef = useRef<'idle' | 'queued'>('idle');
  useEffect(() => {
    matchmakingStatusRef.current = matchmakingStatus;
  }, [matchmakingStatus]);

  const duelWordLengthRef = useRef<number>(duelWordLength);
  useEffect(() => {
    duelWordLengthRef.current = duelWordLength;
  }, [duelWordLength]);

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
      fontFamily: 'poppins',
      lowLatencyMode: true
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
        const response = await fetch(getApiUrl(`/api/daily-puzzle?deviceId=${encodeURIComponent(deviceId)}`));
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
        console.warn('Daily puzzle initial status fetch skipped or failed:', e);
      }
    };
    checkDailyStatusOnStart();
  }, [deviceId]);

  // Manage app background / foreground state (visibility change, focus/blur)
  useEffect(() => {
    const handleAppActive = () => {
      setIsAppActive(true);
      resumeAudioContext();
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.log('[App Active] Socket disconnected or closing, triggering reconnect...');
        setReconnectCounter((prev) => prev + 1);
      }
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
  const [showFriendsModal, setShowFriendsModal] = useState<boolean>(false);
  const [showWordHistoryModal, setShowWordHistoryModal] = useState<boolean>(false);
  const [showCongratsModal, setShowCongratsModal] = useState<boolean>(false);
  const handledMatchEndIdsRef = useRef<Set<string>>(new Set());
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
  const [nameInput, setNameInput] = useState<string>(profile?.name || '');
  const [avatarInput, setAvatarInput] = useState<string | undefined>(profile?.avatarUrl);
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
  const [wsLatency, setWsLatency] = useState<number | null>(null);
  const lastPingTimestampRef = useRef<number | null>(null);
  const [reconnectCounter, setReconnectCounter] = useState<number>(0);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any | null>(null);


  const [rematchRequested, setRematchRequested] = useState<boolean>(false);
  const [opponentRematchRequested, setOpponentRematchRequested] = useState<boolean>(false);

  const [selfCurrentAttemptCount, setSelfCurrentAttemptCount] = useState<number>(0);
  const [oppCurrentAttemptCount, setOppCurrentAttemptCount] = useState<number>(0);

  const currentMatchId = activeMatch?.id || activeMatch?.matchId;
  const prevMatchIdForAttemptsRef = useRef<string | null>(null);

  // Read currentAttemptCount from Firestore's players object and pass to ProgressDots props
  useEffect(() => {
    if (!activeMatch) {
      setSelfCurrentAttemptCount(attempts.length);
      setOppCurrentAttemptCount(0);
      prevMatchIdForAttemptsRef.current = null;
      return;
    }

    if (prevMatchIdForAttemptsRef.current !== currentMatchId) {
      prevMatchIdForAttemptsRef.current = currentMatchId;
      setOppCurrentAttemptCount(0);
    }

    const currentAuthUid = auth.currentUser?.uid || profile?.id || '';
    const profileId = profile?.id || '';

    const selfData = getPlayerAttemptData(activeMatch, true, currentAuthUid, profileId, attempts, selfCurrentAttemptCount);
    const oppData = getPlayerAttemptData(activeMatch, false, currentAuthUid, profileId, [], oppCurrentAttemptCount);

    setSelfCurrentAttemptCount(selfData.count);
    setOppCurrentAttemptCount((prev) => Math.max(prev, oppData.count));
  }, [activeMatch, activeMatch?.players, activeMatch?.attempts, attempts.length, profile?.id, currentMatchId]);

  const socketRef = useRef<WebSocket | null>(null);
  const wasOnlineRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const matchUnsubscribeRef = useRef<(() => void) | null>(null);
  const queueUnsubscribeRef = useRef<(() => void) | null>(null);
  const pendingMatchmakingRef = useRef<number | null>(null);
  const justLoggedInUidRef = useRef<string | null>(null);
  const activeMatchRef = useRef(activeMatch);
  const hasEnteredGameRef = useRef(hasEnteredGame);

  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  useEffect(() => {
    hasEnteredGameRef.current = hasEnteredGame;
  }, [hasEnteredGame]);

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

  // Presence heartbeat effect in Firestore
  useEffect(() => {
    if (!profile?.id) return;
    updateUserPresence(profile.id, true);

    const interval = setInterval(() => {
      updateUserPresence(profile.id, true);
    }, 45000);

    const handleUnload = () => {
      updateUserPresence(profile.id, false);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [profile?.id]);

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
                    
                    let finalName = savedUsername || (profile && profile.name) || '';
                    let finalAvatar = (profile && profile.avatarUrl) || '🧠';
                    
                    if (!finalName && savedProfileStr) {
                      try {
                        const parsed = JSON.parse(savedProfileStr);
                        if (parsed && parsed.name) finalName = parsed.name;
                        if (parsed && parsed.avatarUrl) finalAvatar = parsed.avatarUrl;
                      } catch (e) {}
                    }
                    const updatedProfile = ensureProfileFields({
                      ...(profile || {}),
                      id: user.uid,
                      name: finalName,
                      avatarUrl: finalAvatar,
                      deviceId: deviceId,
                      nameSet: !!finalName
                    } as UserProfile);

                    setProfile(updatedProfile);
                    safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
                    if (updatedProfile.name) {
                      safeLocalStorage.setItem('saved_username', updatedProfile.name);
                    }
                    saveUserProfileToFirestore(updatedProfile).catch(err => console.warn(err));
                  }
                } catch (deviceCheckErr) {
                  console.error('Error during automatic device profile recovery after auth:', deviceCheckErr);
                  // Sync current profile state as fallback
                  const savedUsername = safeLocalStorage.getItem('saved_username');
                  const savedProfileStr = safeLocalStorage.getItem('kelimesavasi_profile');
                  
                  let finalName = savedUsername || (profile && profile.name) || '';
                  let finalAvatar = (profile && profile.avatarUrl) || '🧠';
                  
                  if (!finalName && savedProfileStr) {
                    try {
                      const parsed = JSON.parse(savedProfileStr);
                      if (parsed && parsed.name) finalName = parsed.name;
                      if (parsed && parsed.avatarUrl) finalAvatar = parsed.avatarUrl;
                    } catch (e) {}
                  }
                  const updatedProfile = ensureProfileFields({
                    ...(profile || {}),
                    id: user.uid,
                    name: finalName,
                    avatarUrl: finalAvatar,
                    deviceId: deviceId,
                    nameSet: !!finalName
                  } as UserProfile);

                  setProfile(updatedProfile);
                  safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updatedProfile));
                  if (updatedProfile.name) {
                    safeLocalStorage.setItem('saved_username', updatedProfile.name);
                  }
                  saveUserProfileToFirestore(updatedProfile).catch(err => console.warn(err));
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
            setProfile(null as any);
            const justSignedOut = safeLocalStorage.getItem('kelimesavasi_just_signed_out') === 'true';
            if (justSignedOut) {
              console.log('Explicit sign-out detected. Directing cleanly to Login screen...');
              safeLocalStorage.removeItem('kelimesavasi_just_signed_out');
              safeLocalStorage.removeItem('kelimesavasi_profile');
              safeLocalStorage.removeItem('saved_username');
              safeLocalStorage.removeItem('kelimesavasi_is_registered');
              safeLocalStorage.removeItem('kelimesavasi_entered');
              safeLocalStorage.removeItem('kelimesavasi_signing_in');
              safeLocalStorage.removeItem('pending_restoration_profile');
              if (active) {
                resolved = true;
                setAuthLoading(false);
                clearTimeout(timeoutId);
              }
              return;
            }

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
              // Truly new visitor or signed out. Stop loading and show registration/login.
              setProfile(null as any);
              if (active) {
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
              const selfName = getEffectiveSelfName(profile, auth.currentUser);
              ws?.send(JSON.stringify({
                type: 'join',
                id: profile.id,
                name: selfName,
                avatarUrl: profile.avatarUrl || ''
              }));

              if (matchmakingStatusRef.current === 'queued') {
                const targetLen = duelWordLengthRef.current || 5;
                ws?.send(JSON.stringify({
                  type: 'join_matchmaking',
                  wordLength: targetLen,
                  id: profile.id,
                  userId: profile.id,
                  playerId: profile.id,
                  name: selfName,
                  username: selfName,
                  displayName: selfName,
                  avatarUrl: profile.avatarUrl || ''
                }));
              }
            } catch (e) {
              console.error('[WebSocket Manager] Error sending join message:', e);
            }
          }

          // Heartbeat ping (1.5s in Low Latency Mode or active duel, 4s otherwise)
          const sendPing = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              lastPingTimestampRef.current = Date.now();
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          };

          sendPing();
          if (pingInterval) clearInterval(pingInterval);
          const dynamicPingDelay = (settings.lowLatencyMode ?? true) || activeMatch ? 1500 : 4000;
          pingInterval = setInterval(sendPing, dynamicPingDelay);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') {
              if (lastPingTimestampRef.current) {
                const latency = Date.now() - lastPingTimestampRef.current;
                setWsLatency(latency);
              }
              return;
            } else if (data.type === 'lobby' || data.type === 'online_players') {
              setLobbyPlayers(data.players || []);
            } else if (data.type === 'queued') {
              setMatchmakingStatus('queued');
              showToast('Eşleşme sırasına alındınız. Rakip aranıyor...', 'info');
            } else if (data.type === 'match_joined') {
              setMatchmakingStatus('idle');
              setIsMatchmakingLocked(false);
              
              const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(data.player1, data.player2, profile, data.players);

              const target = turkishUpper(data.targetWord || data.correctWord || '');
              const matchLen = Number(data.wordLength) || target.length || 5;
              if (target) setTargetWord(target);
              setActiveMatch({
                id: data.matchId,
                matchId: data.matchId,
                gameState: 'WAITING',
                targetWord: target,
                correctWord: target,
                player1: p1,
                player2: p2,
                players: parsedPlayers,
                wordLength: matchLen
              });
              setWordLength(matchLen);
              setDuelWordLength(matchLen);
              duelWordLengthRef.current = matchLen;
            } else if (data.type === 'match_ready') {
              const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(data.player1, data.player2, profile, data.players);

              const target = turkishUpper(data.targetWord || data.correctWord || '');
              const matchLen = Number(data.wordLength) || target.length || 5;
              if (target) setTargetWord(target);
              setWordLength(matchLen);
              setDuelWordLength(matchLen);
              duelWordLengthRef.current = matchLen;
              isMatchEndedRef.current = false;
              if (data.matchId) handledMatchEndIdsRef.current.delete(data.matchId);
              setRematchRequested(false);
              setOpponentRematchRequested(false);

              const cleanPlayers = { ...parsedPlayers };
              Object.keys(cleanPlayers).forEach(k => {
                cleanPlayers[k] = { ...cleanPlayers[k], attempts: [], completed: false, won: false, isWinner: false };
              });

              setActiveMatch((prev: any) => {
                const isSameMatch = prev && (prev.id === data.matchId || prev.matchId === data.matchId);
                const base = isSameMatch ? prev : {};
                return {
                  ...base,
                  id: data.matchId,
                  matchId: data.matchId,
                  gameState: 'READY',
                  status: 'waiting_ready',
                  isGameOver: false,
                  gameOver: false,
                  winner: null,
                  winnerId: null,
                  winnerUserId: null,
                  winReason: null,
                  ...(target ? { targetWord: target, correctWord: target } : {}),
                  player1: p1,
                  player2: p2,
                  players: cleanPlayers,
                  wordLength: matchLen
                };
              });
              showToast('Rakip bağlandı! Oyun hazırlanıyor... ⚔️', 'info');
            } else if (data.type === 'match_start') {
              console.log('[WebSocket Manager] Match START:', data);
              const target = turkishUpper(data.targetWord || data.correctWord || '');
              const matchLen = Number(data.wordLength) || target.length || 5;
              if (target) {
                setTargetWord(target);
              }
              setWordLength(matchLen);
              setDuelWordLength(matchLen);
              duelWordLengthRef.current = matchLen;
              setAttempts([]);
              setCurrentAttempt('');
              setLetterStatuses({});
              setGameStatus('playing');
              setHasEnteredGame(true);
              setMatchmakingStatus('idle');
              setIsMatchmakingLocked(false);
              setOpponentLeftDuringMatch(false);
              setRematchRequested(false);
              setOpponentRematchRequested(false);
              setShowCongratsModal(false);
              isMatchEndedRef.current = false;
              if (data.matchId) handledMatchEndIdsRef.current.delete(data.matchId);

              const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(data.player1, data.player2, profile, data.players);

              const cleanPlayers = { ...parsedPlayers };
              Object.keys(cleanPlayers).forEach(k => {
                cleanPlayers[k] = { ...cleanPlayers[k], attempts: [], completed: false, won: false, isWinner: false };
              });

              setActiveMatch((prev: any) => {
                const isSameMatch = prev && (prev.id === data.matchId || prev.matchId === data.matchId);
                const base = isSameMatch ? prev : {};
                return {
                  ...base,
                  id: data.matchId,
                  matchId: data.matchId,
                  gameState: 'PLAYING',
                  status: 'playing',
                  isGameOver: false,
                  gameOver: false,
                  winner: null,
                  winnerId: null,
                  winnerUserId: null,
                  winReason: null,
                  targetWord: target || base?.targetWord || base?.correctWord || '',
                  correctWord: target || base?.targetWord || base?.correctWord || '',
                  player1: p1,
                  player2: p2,
                  players: cleanPlayers,
                  wordLength: matchLen
                };
              });

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
              if (!hasEnteredGameRef.current && !activeMatchRef.current) return;
              const currentAuthUid = auth.currentUser?.uid;
              const selfId = currentAuthUid || profile?.id || '';
              if (data.opponentId && (data.opponentId === selfId || (profile?.id && data.opponentId === profile.id))) {
                return;
              }

              const targetCount = Number(data.attemptCount) || 1;
              showToast(`Rakip bir tahmin yaptı! (${targetCount}. deneme)`, 'info');

              setOppCurrentAttemptCount((prev) => Math.max(prev, targetCount));

              setActiveMatch((prev: any) => {
                if (!prev) return null;
                const updatedPlayers = { ...(prev.players || {}) };
                const currentLen = prev.targetWord?.length || prev.wordLength || targetWord?.length || wordLength || 6;

                let updatedAnyOpponent = false;
                Object.keys(updatedPlayers).forEach((key) => {
                  const p = updatedPlayers[key];
                  const isSelfKey = key === selfId || (profile?.id && key === profile.id) || p?.id === selfId || p?.uid === selfId || (profile?.id && (p?.id === profile.id || p?.uid === profile.id));
                  if (!isSelfKey) {
                    updatedAnyOpponent = true;
                    const currentAtts = Array.isArray(p?.attempts) ? p.attempts : [];
                    let newAtts = [...currentAtts];
                    while (newAtts.length < targetCount) {
                      newAtts.push({ word: ' '.repeat(currentLen), feedback: Array(currentLen).fill('grey') });
                    }
                    updatedPlayers[key] = {
                      ...p,
                      attempts: newAtts,
                      attemptsCount: targetCount,
                      currentAttemptCount: targetCount
                    };
                  }
                });

                const oppId = data.opponentId;
                if (oppId && (!updatedPlayers[oppId] || !updatedAnyOpponent) && oppId !== selfId && (!profile?.id || oppId !== profile.id)) {
                  let newAtts = [];
                  while (newAtts.length < targetCount) {
                    newAtts.push({ word: ' '.repeat(currentLen), feedback: Array(currentLen).fill('grey') });
                  }
                  updatedPlayers[oppId] = {
                    id: oppId,
                    name: 'Rakip',
                    attempts: newAtts,
                    attemptsCount: targetCount,
                    currentAttemptCount: targetCount
                  };
                }

                return {
                  ...prev,
                  players: updatedPlayers
                };
              });
            } else if (data.type === 'guess_rejected') {
              setIsValidating(false);
              console.warn('[Duel Server] Guess rejected:', data.reason);
            } else if (data.type === 'match_end' || data.type === 'GAME_OVER' || data.action === 'GAME_OVER') {
              console.log('[WebSocket Manager] GAME_OVER / Match END received:', data);
              setIsValidating(false);

              if (!hasEnteredGameRef.current || !activeMatchRef.current) {
                console.warn('[WebSocket] Discarded GAME_OVER because user is on home screen');
                return;
              }

              // Filter out stale messages from past matches
              const eventMatchId = data.matchId || data.id;
              const currentMatchId = activeMatchRef.current?.id || activeMatchRef.current?.matchId;
              if (eventMatchId && currentMatchId && eventMatchId !== currentMatchId) {
                console.warn(`[WebSocket] Discarded GAME_OVER for old match ${eventMatchId} (active: ${currentMatchId})`);
                return;
              }

              const target = data.correctWord || activeMatchRef.current?.targetWord || activeMatchRef.current?.correctWord || targetWord || '';
              if (target) {
                setTargetWord(target);
              }

              const serverWinnerUserId = data.winnerUserId || data.winnerId || data.winner;
              const isOpponentLeft = data.winReason === 'opponent_left';
              if (isOpponentLeft) {
                setOpponentLeftDuringMatch(true);
              }

              handleInstantMatchEndRef.current(serverWinnerUserId, data);
            } else if (data.type === 'opponent_left') {
              if (!hasEnteredGameRef.current || !activeMatchRef.current) {
                console.warn('[WebSocket] Discarded opponent_left because user is on home screen');
                return;
              }
              setOpponentLeftDuringMatch(true);
              const selfId = auth.currentUser?.uid || profile?.id || '';
              const winnerId = data.winner || data.winnerUserId || data.winnerId || selfId;
              showToast('Rakip oyundan ayrıldı! Zafer senin!', 'success');
              handleInstantMatchEndRef.current(winnerId, {
                ...data,
                winner: winnerId,
                winnerUserId: winnerId,
                winnerId: winnerId,
                winReason: 'opponent_left',
                isGameOver: true,
                status: 'finished',
                gameState: 'finished'
              });
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
          setWsLatency(null);
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          console.log(`[WebSocket Manager] Connection closed (code: ${event.code})`);
          setIsOnline(false);
          setWsLatency(null);
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
  }, [profile?.id, reconnectCounter]);

  const syncMatchState = useCallback((
    updatedAttempts: GameAttempt[],
    attemptsCount: number,
    completed: boolean,
    won: boolean,
    score: number = 0,
    _finishTimestamp?: number
  ) => {
    if (!activeMatch) return;
    const matchId = activeMatch.matchId || activeMatch.id;
    if (!matchId) return;

    const currentAuthUser = auth.currentUser;
    const currentUid = currentAuthUser?.uid || profile?.id || '';
    const selfName = getEffectiveSelfName(profile, currentAuthUser);
    const selfAvatar = profile?.avatarUrl || currentAuthUser?.photoURL || '';

    const playerState = {
      uid: currentUid,
      id: currentUid,
      profileId: profile?.id || currentUid,
      name: selfName,
      username: selfName,
      displayName: selfName,
      avatarUrl: selfAvatar,
      attempts: updatedAttempts,
      attemptsCount,
      currentAttemptCount: attemptsCount,
      completed,
      won,
      score,
      status: completed ? (won ? 'won' : 'lost') : 'playing',
      gameState: completed ? 'FINISHED' : 'PLAYING',
      roomId: matchId,
      updatedAt: new Date().toISOString()
    };

    const payload: any = {
      roomId: matchId,
      [`players.${currentUid}`]: playerState,
      [`attempts.${currentUid}`]: updatedAttempts
    };

    if (profile?.id && profile.id !== currentUid) {
      payload[`players.${profile.id}`] = playerState;
      payload[`attempts.${profile.id}`] = updatedAttempts;
    }

    const matchRef = doc(db, 'matches', matchId);
    const roomRef = doc(db, 'rooms', matchId);

    setDoc(matchRef, payload, { merge: true }).catch((err) => console.warn('syncMatchState matches error:', err));
    setDoc(roomRef, payload, { merge: true }).catch((err) => console.warn('syncMatchState rooms error:', err));
  }, [activeMatch, profile]);


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
      const isLevel1 = getLevelForScore(profile?.dailyScore || 0) === 1;
      picked = getRandomWord(length, isLevel1);
    }

    setTargetWord(picked);
    setGameStatus('playing');
    setSecondsLeft(20);
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

  const handleSignOut = async () => {
    try {
      safeLocalStorage.removeItem('kelimesavasi_profile');
      safeLocalStorage.removeItem('saved_username');
      safeLocalStorage.removeItem('kelimesavasi_is_registered');
      safeLocalStorage.removeItem('kelimesavasi_entered');
      safeLocalStorage.removeItem('kelimesavasi_signing_in');
      safeLocalStorage.removeItem('pending_restoration_profile');
      safeLocalStorage.setItem('kelimesavasi_just_signed_out', 'true');

      setShowSettingsModal(false);
      setShowStatsModal(false);
      setShowMissionsModal(false);
      setShowLobbyModal(false);
      setShowCongratsModal(false);

      setHasEnteredGame(false);
      setGameStatus('idle');
      setActiveMatch(null);
      setActiveChallenges([]);

      const currentUid = profile?.id;
      setProfile(null as any);
      setFirebaseUser(null);

      if (currentUid) {
        clearMatchmakingState(currentUid).catch(() => {});
        updateUserPresence(currentUid, false).catch(() => {});
      }

      await signOutUser();
      showToast('Hesabınızdan başarıyla çıkış yapıldı.', 'info');
    } catch (err) {
      console.error('Sign out error:', err);
      showToast('Çıkış yapılırken bir hata oluştu.', 'error');
    }
  };

  // Synchronously launch the active 1v1 match after ready check / countdown
  const handleStartMatchedGame = useCallback(() => {
    const matchObj = activeMatchRef.current || activeMatch;
    if (!matchObj) return;

    const matchId = matchObj.matchId || matchObj.id;
    const matchLen = Number(matchObj.wordLength || wordLength || 5);
    const target = turkishUpper(matchObj.targetWord || matchObj.correctWord || targetWord || '');

    isMatchEndedRef.current = false;
    if (matchId) handledMatchEndIdsRef.current.delete(matchId);

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
    setRematchRequested(false);
    setOpponentRematchRequested(false);

    setActiveMatch((prev: any) => {
      const isSameMatch = prev && (prev.id === matchId || prev.matchId === matchId);
      const base = isSameMatch ? prev : (matchObj || {});

      const cleanedPlayers = { ...(base.players || matchObj.players || {}) };
      Object.keys(cleanedPlayers).forEach(pKey => {
        cleanedPlayers[pKey] = {
          ...cleanedPlayers[pKey],
          attempts: [],
          completed: false,
          won: false,
          isWinner: false
        };
      });

      return {
        ...base,
        id: matchId,
        matchId,
        gameState: 'PLAYING',
        status: 'playing',
        isGameOver: false,
        gameOver: false,
        won: false,
        winner: null,
        winnerId: null,
        winnerUserId: null,
        winReason: null,
        targetWord: target || base?.targetWord || base?.correctWord || '',
        correctWord: target || base?.targetWord || base?.correctWord || '',
        player1: base.player1 || matchObj.player1,
        player2: base.player2 || matchObj.player2,
        players: cleanedPlayers
      };
    });

    if (matchId) {
      const matchUpdate = {
        gameState: 'PLAYING',
        status: 'playing',
        targetWord: target || matchObj.targetWord || matchObj.correctWord || '',
        correctWord: target || matchObj.targetWord || matchObj.correctWord || ''
      };
      setDoc(doc(db, 'matches', matchId), matchUpdate, { merge: true }).catch((err) => console.warn('Error updating match start in matches:', err));
      setDoc(doc(db, 'rooms', matchId), matchUpdate, { merge: true }).catch((err) => console.warn('Error updating match start in rooms:', err));
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && matchId) {
      socketRef.current.send(JSON.stringify({
        type: 'match_start',
        matchId,
        gameState: 'PLAYING'
      }));
    }

    playEnterSound(settings.soundEnabled);
  }, [wordLength, targetWord, settings.soundEnabled, activeMatch]);

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

  // Instant/synchronous duel completion handler based on Firestore real-time snapshot or WebSocket
  const handleInstantMatchEnd = useCallback((winnerId: string, matchData?: any) => {
    if (!hasEnteredGameRef.current || !activeMatchRef.current) {
      console.log('[handleInstantMatchEnd] Ignored match end trigger because user is on home screen');
      return;
    }

    const currentMatchId = matchData?.id || matchData?.matchId || activeMatch?.id || activeMatch?.matchId || 'active_match_session';
    if (handledMatchEndIdsRef.current.has(currentMatchId)) {
      return; // Already processed match end for this match ID! Prevent repeating audio / toast / score loop.
    }
    handledMatchEndIdsRef.current.add(currentMatchId);

    // Force navigation to game result screen and close all modals regardless of current screen
    setHasEnteredGame(true);
    setShowLobbyModal(false);
    setShowMissionsModal(false);
    setShowSettingsModal(false);
    setShowStatsModal(false);
    setShowCongratsModal(false);
    setMatchmakingStatus('idle');
    setIsMatchmakingLocked(false);

    // Call Native Android Bridge if present
    if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
      try {
        if ((window as any).AndroidBridge.redirectToResultActivity) {
          (window as any).AndroidBridge.redirectToResultActivity();
        }
      } catch (e) {
        console.error("Error calling redirectToResultActivity via AndroidBridge:", e);
      }
    }

    // Force clear any active timers/intervals immediately to prevent ticking, flashing, or layout changes
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Unsubscribe snapshot listener to prevent further polling triggers
    if (matchUnsubscribeRef.current) {
      matchUnsubscribeRef.current();
      matchUnsubscribeRef.current = null;
    }

    // Lock keypress / input listener
    isMatchEndedRef.current = true;
    setGameStatus('idle');

    const serverWinnerUserId = String(
      winnerId || matchData?.winnerUserId || matchData?.winnerId || matchData?.winner || ''
    ).trim();

    const currentUserId = String(profile?.id || '').trim();
    const currentAuthUid = String(auth.currentUser?.uid || '').trim();

    const isSelfWinner = Boolean(
      serverWinnerUserId &&
      serverWinnerUserId !== 'draw' &&
      ((currentUserId !== '' && serverWinnerUserId === currentUserId) ||
       (currentAuthUid !== '' && serverWinnerUserId === currentAuthUid))
    );

    setActiveMatch((prev) => {
      const selfId = currentAuthUid || profile?.id || '';
      const oppId = matchData?.loser || matchData?.loserId || 'opponent';

      const base = prev || {
        id: currentMatchId || 'match_ended',
        matchId: currentMatchId || 'match_ended',
        wordLength: matchData?.wordLength || 5,
        targetWord: matchData?.correctWord || matchData?.targetWord || '',
        correctWord: matchData?.correctWord || matchData?.targetWord || '',
        players: {
          [selfId]: { id: selfId, name: profile?.name || 'Sen', attempts: attempts },
          [oppId]: { id: oppId, name: 'Rakip', attempts: [] }
        }
      };
      
      const updatedPlayers = { ...(base.players || {}), ...(matchData?.players || {}) };
      
      // Synchronize the final states of players
      Object.keys(updatedPlayers).forEach((pId) => {
        const isThisWinner = pId === serverWinnerUserId;
        const playerCurrentAttempts = (pId === selfId && attempts.length > 0)
          ? attempts
          : (updatedPlayers[pId]?.attempts || matchData?.players?.[pId]?.attempts || matchData?.attempts?.[pId] || []);

        updatedPlayers[pId] = {
          ...updatedPlayers[pId],
          completed: true,
          won: isThisWinner,
          attempts: playerCurrentAttempts
        };
      });

      const target = matchData?.targetWord || matchData?.correctWord || base.targetWord || base.correctWord;

      return {
        ...base,
        ...matchData,
        status: 'ended',
        gameState: 'FINISHED',
        isGameOver: true,
        winnerUserId: serverWinnerUserId,
        winner: serverWinnerUserId,
        winnerId: serverWinnerUserId,
        targetWord: target || base.targetWord,
        correctWord: target || base.correctWord,
        players: updatedPlayers
      };
    });

    const wordToUse = matchData?.targetWord || matchData?.correctWord || targetWord || activeMatch?.targetWord || activeMatch?.correctWord || '';
    if (wordToUse) {
      setTargetWord(wordToUse);
    }

    if (isSelfWinner) {
      showToast('TEBRİKLER! Savaşı Kazandın!', 'success');
      unlockBadge('gladiator');
      // Live duel win (no daily score points awarded for duel matches)
      triggerVictoryCelebration(settings.soundEnabled);
    } else if (serverWinnerUserId === 'draw') {
      showToast('Düello berabere sona erdi!', 'info');
    } else {
      showToast('Maçı rakibin kazandı. Daha hızlı olmalısın!', 'error');
      playDefeatSound(settings.soundEnabled);
    }

    // Trigger FCM High Priority Push Notification for background/sleeping devices via backend
    if (currentMatchId) {
      const playersMap = activeMatch?.players || matchData?.players || {};
      const oppEntry = Object.values(playersMap).find((p: any) => p && p.id && (!profile?.id || p.id !== profile.id)) as any;
      const oppId = oppEntry?.id || '';
      const oppName = oppEntry?.name || 'Rakip';

      fetch(getApiUrl('/api/trigger-match-end-push'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: currentMatchId,
          winnerId,
          loserId: winnerId === profile?.id ? oppId : (profile?.id || ''),
          winnerName: winnerId === profile?.id ? (profile?.name || '') : oppName,
          loserName: winnerId === profile?.id ? oppName : (profile?.name || ''),
          winReason: matchData?.winReason || 'correct_word',
          correctWord: wordToUse
        })
      }).catch((e) => {
        console.warn('Non-critical FCM trigger note:', e);
      });
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
  }, [profile?.id, profile?.name, targetWord, settings.soundEnabled, attempts, activeMatch?.id, activeMatch?.matchId, activeMatch?.targetWord, activeMatch?.correctWord, activeMatch?.players]);

  const handleInstantMatchEndRef = useRef(handleInstantMatchEnd);
  useEffect(() => {
    handleInstantMatchEndRef.current = handleInstantMatchEnd;
  }, [handleInstantMatchEnd]);

  // Firebase Cloud Messaging (FCM) & Push Notification Listener / Registration
  useEffect(() => {
    if (!profile || !profile.id) return;

    const saveTokenToServer = async (token: string) => {
      if (!token) return;
      try {
        await saveUserProfileToFirestore({ ...profile, fcmToken: token });
        await fetch(getApiUrl('/api/save-fcm-token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: profile.id, fcmToken: token })
        }).catch(() => {});
      } catch (e) {
        console.warn('FCM Token sync error:', e);
      }
    };

    // 1. Android Native Bridge FCM Token Sync
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.getFcmToken) {
      try {
        const nativeToken = (window as any).AndroidBridge.getFcmToken();
        if (nativeToken) {
          saveTokenToServer(nativeToken);
        }
      } catch (e) {}
    }

    // 2. Global listener for Native Push Notifications or FCM Message Events passed via Android Bridge or Window Event
    const handlePushMessage = (event: any) => {
      const payload = event.detail || event.data || event;
      if (payload && (payload.type === 'match_end' || payload.dataType === 'match_end' || payload.action === 'match_end')) {
        const winnerId = payload.winner || payload.winnerId;
        console.log('[FCM High Priority Listener] Match end push received:', payload);
        if (winnerId) {
          handleInstantMatchEndRef.current(winnerId, payload);
        }
      } else if (payload && (payload.type === 'challenge_received' || payload.dataType === 'challenge_received')) {
        console.log('[FCM Challenge Push Listener] Challenge received:', payload);
        const challengeId = payload.challengeId || payload.id;
        if (challengeId) {
          setActiveChallenges((prev) => {
            if (prev.some((c) => c.id === challengeId)) return prev;
            return [...prev, {
              id: challengeId,
              challengeId,
              challengerName: payload.challengerName || 'Bir Arkadaşın',
              wordLength: Number(payload.wordLength) || 5
            }];
          });
          playEnterSound(settings.soundEnabled);
          showToast(`⚔️ ${payload.challengerName || 'Bir arkadaşın'} sana meydan okudu!`, 'info');
        }
      }
    };

    window.addEventListener('fcm_message', handlePushMessage as any);
    window.addEventListener('push_notification', handlePushMessage as any);
    if (typeof window !== 'undefined') {
      (window as any).onFcmMessageReceived = (dataJson: string | object) => {
        try {
          const parsed = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson;
          handlePushMessage(parsed);
        } catch (e) {}
      };
    }

    return () => {
      window.removeEventListener('fcm_message', handlePushMessage as any);
      window.removeEventListener('push_notification', handlePushMessage as any);
    };
  }, [profile?.id, settings.soundEnabled]);

  // Real-time Firestore listener for incoming challenges (where challengedId == profile.id & status == 'pending')
  useEffect(() => {
    if (!profile?.id) return;

    const q = query(
      collection(db, 'challenges'),
      where('challengedId', '==', profile.id),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const pending: any[] = [];
      snapshot.forEach((docSnap) => {
        pending.push({ id: docSnap.id, ...docSnap.data() });
      });

      setActiveChallenges((prev) => {
        const newItems = pending.filter((p) => !prev.some((old) => old.id === p.id));
        if (newItems.length > 0) {
          playEnterSound(settings.soundEnabled);
          const firstNew = newItems[0];
          showToast(`⚔️ ${firstNew.challengerName || 'Bir arkadaşın'} sana meydan okudu!`, 'info');
        }
        return pending;
      });
    }, (err) => {
      console.warn('[Firestore Incoming Challenge Listener Warning]:', err);
    });

    return () => unsub();
  }, [profile?.id, settings.soundEnabled]);

  // Real-time Firestore listener for sent challenges (where challengerId == profile.id)
  useEffect(() => {
    if (!profile?.id) return;

    const q = query(
      collection(db, 'challenges'),
      where('challengerId', '==', profile.id)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.forEach(async (docSnap) => {
        const data = docSnap.data();
        if (data.status === 'accepted' && data.matchId) {
          showToast(`🎉 Meydan okuma kabul edildi! Düello başlıyor...`, 'success');
          playEnterSound(settings.soundEnabled);

          const matchId = data.matchId;
          const defaultLen = Number(data.wordLength || 5);

          let matchPayload = data.matchPayload;
          if (!matchPayload) {
            try {
              const matchSnap = await getDoc(doc(db, 'matches', matchId));
              if (matchSnap.exists()) {
                matchPayload = matchSnap.data();
              }
            } catch (e) {
              console.warn('[Sent Challenge Listener] Error fetching match doc:', e);
            }
          }

          const target = turkishUpper(matchPayload?.targetWord || matchPayload?.correctWord || data.targetWord || data.correctWord || '');
          const matchLen = Number(matchPayload?.wordLength || defaultLen);

          isMatchEndedRef.current = false;
          if (matchId) handledMatchEndIdsRef.current.delete(matchId);

          if (target) {
            setTargetWord(target);
          }
          setWordLength(matchLen);
          setAttempts([]);
          setCurrentAttempt('');
          setLetterStatuses({});
          setHasEnteredGame(true);
          setMatchmakingStatus('idle');
          setIsMatchmakingLocked(false);
          setOpponentLeftDuringMatch(false);
          setShowCongratsModal(false);
          setRematchRequested(false);
          setOpponentRematchRequested(false);

          const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(
            matchPayload?.player1,
            matchPayload?.player2,
            profile,
            matchPayload?.players
          );

          const cleanPlayers = { ...parsedPlayers };
          Object.keys(cleanPlayers).forEach((k) => {
            cleanPlayers[k] = { ...cleanPlayers[k], attempts: [], completed: false, won: false, isWinner: false };
          });

          setActiveMatch({
            ...(matchPayload || {}),
            id: matchId,
            matchId: matchId,
            gameState: 'READY',
            status: 'waiting_ready',
            isGameOver: false,
            gameOver: false,
            winner: null,
            winnerId: null,
            winnerUserId: null,
            winReason: null,
            targetWord: target,
            correctWord: target,
            wordLength: matchLen,
            player1: p1,
            player2: p2,
            players: cleanPlayers
          });

          deleteDoc(doc(db, 'challenges', docSnap.id)).catch(() => {});
        } else if (data.status === 'declined') {
          showToast(`❌ ${data.challengedName || 'Rakip'} meydan okumayı reddetti.`, 'error');
          deleteDoc(doc(db, 'challenges', docSnap.id)).catch(() => {});
        }
      });
    }, (err) => {
      console.warn('[Firestore Sent Challenge Listener Warning]:', err);
    });

    return () => unsub();
  }, [profile?.id, settings.soundEnabled]);

  // Dynamically synchronize opponent's real profile (username & avatar) from Firestore via Real-Time Listener throughout the game
  useEffect(() => {
    if (!activeMatch) return;
    const oppEntry = Object.values(activeMatch.players || {}).find((p: any) => p && p.id && (!profile?.id || p.id !== profile.id)) as any ||
                     (profile?.id && activeMatch.player1?.id !== profile.id ? activeMatch.player1 : activeMatch.player2);
    
    const oppId = oppEntry?.id;

    if (!oppId || (profile?.id && oppId === profile.id) || oppId === 'opponent' || oppId === 'p1' || oppId === 'p2') {
      return;
    }

    const oppDocRef = doc(db, 'users', oppId);
    const unsubscribe = onSnapshot(oppDocRef, (userSnap) => {
      if (userSnap.exists()) {
        const uData = userSnap.data();
        const realName = uData.name || uData.username || uData.displayName;
        const realAvatar = uData.avatarUrl || uData.photoURL || uData.avatar || uData.profileImage || '';

        setActiveMatch((prev: any) => {
          if (!prev) return null;

          const currentOppPlayer = prev.players?.[oppId] || (prev.player1?.id === oppId ? prev.player1 : prev.player2);
          const currentName = currentOppPlayer?.name;
          const currentAvatar = currentOppPlayer?.avatarUrl || '';

          const nameToSet = (realName && realName !== 'Oyuncu 1' && realName !== 'Oyuncu 2') ? realName : currentName;
          const avatarToSet = realAvatar || currentAvatar;

          if (currentName === nameToSet && currentAvatar === avatarToSet) {
            return prev;
          }

          console.log(`[Opponent Real-time Sync] Profile updated for opponent ${oppId}: Name="${nameToSet}", Avatar="${avatarToSet}"`);

          const updatedPlayers = { ...prev.players };
          if (updatedPlayers[oppId]) {
            updatedPlayers[oppId] = {
              ...updatedPlayers[oppId],
              ...(nameToSet ? { name: nameToSet } : {}),
              ...(avatarToSet ? { avatarUrl: avatarToSet } : {})
            };
          } else {
            updatedPlayers[oppId] = {
              id: oppId,
              name: nameToSet || 'Rakip',
              avatarUrl: avatarToSet
            };
          }

          const updatedP1 = prev.player1?.id === oppId
            ? { ...prev.player1, ...(nameToSet ? { name: nameToSet } : {}), ...(avatarToSet ? { avatarUrl: avatarToSet } : {}) }
            : prev.player1;

          const updatedP2 = prev.player2?.id === oppId
            ? { ...prev.player2, ...(nameToSet ? { name: nameToSet } : {}), ...(avatarToSet ? { avatarUrl: avatarToSet } : {}) }
            : prev.player2;

          return {
            ...prev,
            player1: updatedP1,
            player2: updatedP2,
            players: updatedPlayers
          };
        });
      }
    }, (error) => {
      console.warn(`[Opponent Real-time Sync] Listener warning for user ${oppId}:`, error);
    });

    return () => {
      unsubscribe();
    };
  }, [activeMatch?.id, activeMatch?.matchId, profile?.id]);

  // Helper function to inspect match/room document and trigger immediate match end on victory/defeat
  const checkAndTriggerMatchEnd = useCallback((matchData: any) => {
    if (!matchData) return false;
    if (!hasEnteredGameRef.current || !activeMatchRef.current) return false;

    const matchIdKey = matchData.id || matchData.matchId || activeMatchRef.current?.id || activeMatchRef.current?.matchId;
    if (matchIdKey && handledMatchEndIdsRef.current.has(matchIdKey)) {
      return true; // Match end was already processed for this match
    }

    let serverWinnerUserId = String(
      matchData.winnerUserId || matchData.winnerId || matchData.winner || matchData.finishedBy || ''
    ).trim();

    if (!serverWinnerUserId && matchData.players) {
      Object.entries(matchData.players).forEach(([pId, pData]: [string, any]) => {
        if (pData?.won === true || pData?.isWinner === true) {
          serverWinnerUserId = pId;
        }
      });
    }

    if (!serverWinnerUserId && matchData.winReason === 'opponent_left') {
      const currentUid = auth.currentUser?.uid || profile?.id || '';
      const loserUid = matchData.loser || matchData.loserId;
      if (loserUid && (loserUid === currentUid || (profile?.id && loserUid === profile.id))) {
        const oppEntry = Object.values(matchData.players || {}).find((p: any) => p && p.id && p.id !== currentUid && (!profile?.id || p.id !== profile.id)) as any;
        serverWinnerUserId = matchData.winner || matchData.winnerId || oppEntry?.id || 'opponent';
      } else {
        serverWinnerUserId = currentUid;
      }
    }

    const isFinished = 
      matchData.isGameOver === true || 
      matchData.gameOver === true ||
      matchData.status === 'finished' || 
      matchData.status === 'ended' ||
      matchData.status === 'completed' ||
      matchData.gameState === 'finished' ||
      matchData.gameState === 'FINISHED' ||
      matchData.gameState === 'RESULT' ||
      serverWinnerUserId !== '';

    if (isFinished) {
      if (matchData.winReason === 'opponent_left') {
        setOpponentLeftDuringMatch(true);
      }
      const finalWinner = serverWinnerUserId || 'draw';
      console.log(`[Real-time Match Sync] Server match end confirmed! Winner: ${finalWinner}`);
      handleInstantMatchEndRef.current(finalWinner, matchData);
      return true;
    }
    return false;
  }, []);

  // Real-time Firestore subscription + fast polling backup (800ms) for room and match document
  useEffect(() => {
    const matchId = activeMatch?.matchId || activeMatch?.id;
    if (!matchId) return;

    if (matchUnsubscribeRef.current) {
      matchUnsubscribeRef.current();
      matchUnsubscribeRef.current = null;
    }

    const matchRef = doc(db, 'matches', matchId);
    const roomRef = doc(db, 'rooms', matchId);

    console.log(`Subscribing to real-time Firestore listeners for match/room document: ${matchId}`);
    
    const processRoomSnapshotData = (data: any) => {
      if (!data) return;
      if (!activeMatchRef.current) return;

      setActiveMatch((prev: any) => {
        const snapshotMatchId = data.matchId || data.id || matchId;
        const isSameMatch = prev && (prev.id === snapshotMatchId || prev.matchId === snapshotMatchId);

        const base = isSameMatch ? prev : {
          id: snapshotMatchId,
          matchId: snapshotMatchId,
          targetWord: data.targetWord || data.correctWord || '',
          correctWord: data.targetWord || data.correctWord || '',
          wordLength: data.wordLength || 5,
          gameState: data.gameState || 'PLAYING',
          status: data.status || 'playing'
        };
        const currentPlayers = isSameMatch ? (base.players || {}) : {};
        const incomingPlayers = data.players || {};
        const mergedPlayers = { ...currentPlayers };

        Object.keys(incomingPlayers).forEach((pId) => {
          mergedPlayers[pId] = {
            ...(currentPlayers[pId] || {}),
            ...(incomingPlayers[pId] || {})
          };
        });

        const currentAuthUid = auth.currentUser?.uid;
        const selfId = currentAuthUid || profile?.id || '';
        const activeProfile = profile ? { ...profile, id: selfId } : { id: selfId, name: 'Sen' };
        const resolved = resolveDuelPlayers(
          data.player1 || base.player1,
          data.player2 || base.player2,
          activeProfile,
          data.players || mergedPlayers || base.players
        );

        // Prevent reverting from PLAYING back to WAITING or READY due to stale incoming snapshot
        const effectiveGameState = (prev?.gameState === 'PLAYING' && (data.gameState === 'READY' || data.gameState === 'WAITING'))
          ? 'PLAYING'
          : (data.gameState || base.gameState || 'PLAYING');
        const effectiveStatus = (prev?.status === 'playing' && (data.status === 'waiting_ready' || data.status === 'waiting'))
          ? 'playing'
          : (data.status || base.status || 'playing');

        const isExplicitlyOver = 
          data.isGameOver === true || 
          data.status === 'ended' || 
          data.status === 'finished' || 
          data.status === 'completed' || 
          data.gameState === 'FINISHED';

        const cleanWinnerFields = isExplicitlyOver ? {} : {
          winner: null,
          winnerId: null,
          winnerUserId: null,
          winReason: null,
          isGameOver: false,
          gameOver: false
        };

        const newMatch = {
          ...base,
          ...cleanWinnerFields,
          ...data,
          ...(isExplicitlyOver ? {} : cleanWinnerFields),
          gameState: effectiveGameState,
          status: effectiveStatus,
          player1: resolved.player1,
          player2: resolved.player2,
          players: {
            ...resolved.players,
            ...mergedPlayers
          }
        };

        if (
          prev &&
          prev.id === newMatch.id &&
          prev.gameState === newMatch.gameState &&
          prev.status === newMatch.status &&
          prev.targetWord === newMatch.targetWord &&
          prev.isGameOver === newMatch.isGameOver &&
          prev.winner === newMatch.winner &&
          JSON.stringify(prev.player1) === JSON.stringify(newMatch.player1) &&
          JSON.stringify(prev.player2) === JSON.stringify(newMatch.player2) &&
          JSON.stringify(prev.players) === JSON.stringify(newMatch.players)
        ) {
          return prev;
        }

        return newMatch;
      });

      if (data.gameState === 'PLAYING' || data.status === 'playing') {
        setHasEnteredGame((prev) => (prev ? prev : true));
        setGameStatus('playing');
        if (data.targetWord || data.correctWord) {
          const newTarget = turkishUpper(data.targetWord || data.correctWord);
          setTargetWord((prev) => (prev === newTarget ? prev : newTarget));
        }
        if (data.wordLength) {
          const newLen = data.wordLength;
          setWordLength((prev) => (prev === newLen ? prev : newLen));
        }
      }

      checkAndTriggerMatchEnd(data);
    };

    const unsubMatch = onSnapshot(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        processRoomSnapshotData(snapshot.data());
      }
    }, (error) => {
      console.warn(`Firestore snapshot subscription notice for matches/${matchId}:`, error);
    });

    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        processRoomSnapshotData(snapshot.data());
      }
    }, (error) => {
      console.warn(`Firestore snapshot subscription notice for rooms/${matchId}:`, error);
    });

    matchUnsubscribeRef.current = () => {
      try { unsubMatch(); } catch (e) {}
      try { unsubRoom(); } catch (e) {}
      clearInterval(pollInterval);
    };

    // Low Latency Mode Algorithm:
    // Dynamically calculate polling frequency based on Low Latency Mode setting, real-time WebSocket ping, and network status.
    // When lowLatencyMode is active OR latency is high (> 150ms) OR network/socket drops, boost polling frequency to 350ms for ultra-fast sync.
    const isLowLatencyActive = (settings.lowLatencyMode ?? true) || (wsLatency !== null && wsLatency > 150) || !isOnline;
    const dynamicPollInterval = isLowLatencyActive ? 350 : 800;

    const pollInterval = setInterval(async () => {
      try {
        // Direct HTTPS REST API poll to Render Node server (100% immune to WebSocket / Firestore stream drops on mobile)
        const restRes = await fetch(getApiUrl(`/api/match-status?matchId=${matchId}`));
        if (restRes.ok) {
          const matchStatusData = await restRes.json();
          if (matchStatusData && !matchStatusData.error) {
            processRoomSnapshotData(matchStatusData);
            return;
          }
        }
      } catch (e) {
        // Fall back to Firestore SDK getDoc if REST endpoint network blips
      }

      try {
        const matchSnap = await getDoc(matchRef);
        if (matchSnap.exists()) {
          processRoomSnapshotData(matchSnap.data());
        }
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          processRoomSnapshotData(roomSnap.data());
        }
      } catch (e) {
        // Silently ignore polling network blips
      }
    }, dynamicPollInterval);

    return () => {
      if (matchUnsubscribeRef.current) {
        matchUnsubscribeRef.current();
        matchUnsubscribeRef.current = null;
      }
      clearInterval(pollInterval);
    };
  }, [activeMatch?.id, activeMatch?.matchId, checkAndTriggerMatchEnd, settings.lowLatencyMode, wsLatency, isOnline]);

  const handleLeaveMatchToMenu = useCallback(async () => {
    console.log('Centralized cleanup: returning to main menu');

    if (activeMatch) {
      const matchId = activeMatch.matchId || activeMatch.id;
      const currentUid = auth.currentUser?.uid || profile?.id || '';
      let oppId = '';

      const p1Id = activeMatch.player1?.id || activeMatch.player1?.uid;
      const p2Id = activeMatch.player2?.id || activeMatch.player2?.uid;
      if (p1Id && p1Id !== currentUid && (!profile?.id || p1Id !== profile.id)) {
        oppId = p1Id;
      } else if (p2Id && p2Id !== currentUid && (!profile?.id || p2Id !== profile.id)) {
        oppId = p2Id;
      }

      if (!oppId && activeMatch.players) {
        const oppObj = Object.values(activeMatch.players).find((p: any) => p?.id && p?.id !== currentUid && (!profile?.id || p?.id !== profile.id)) as any;
        if (oppObj?.id) {
          oppId = oppObj.id;
        } else {
          const oppKey = Object.keys(activeMatch.players).find(k => k !== currentUid && (!profile?.id || k !== profile.id));
          if (oppKey) oppId = oppKey;
        }
      }
      if (!oppId) oppId = 'opponent';

      if (matchId) {
        const leavePayload = {
          isGameOver: true,
          gameOver: true,
          status: 'finished',
          gameState: 'finished',
          winReason: 'opponent_left',
          winner: oppId,
          winnerUserId: oppId,
          winnerId: oppId,
          finishedBy: oppId,
          loser: currentUid,
          loserId: currentUid,
          updatedAt: new Date().toISOString()
        };
        setDoc(doc(db, 'matches', matchId), leavePayload, { merge: true }).catch(() => {});
        setDoc(doc(db, 'rooms', matchId), leavePayload, { merge: true }).catch(() => {});
      }
    }

    hasEnteredGameRef.current = false;
    activeMatchRef.current = null;
    isMatchEndedRef.current = false;

    if (matchUnsubscribeRef.current) {
      try { matchUnsubscribeRef.current(); } catch (e) {}
      matchUnsubscribeRef.current = null;
    }
    if (queueUnsubscribeRef.current) {
      try { queueUnsubscribeRef.current(); } catch (e) {}
      queueUnsubscribeRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    handledMatchEndIdsRef.current.clear();
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
    setRematchRequested(false);
    setOpponentRematchRequested(false);
    pendingMatchmakingRef.current = null;
    setSelfCurrentAttemptCount(0);
    setOppCurrentAttemptCount(0);

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
  }, [profile?.id, opponentLeftDuringMatch]);

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
          if (activeMatchRef.current) {
            setGameStatus('idle'); // Freeze input and state while waiting for opponent or round sync
            showToast(`Süre bitti! Rakibin tamamlaması bekleniyor...`, 'error');
            syncMatchState(attempts, attempts.length, true, false, 0);
            return 0;
          } else {
            if (gameStatusRef.current === 'playing') {
              handleGameLoss('Süre Sınırı Aşıldı');
            }
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

    if (!profile) return;

    // Calculate updated profile state first, completely outside setProfile, to avoid side-effect triggers in render phase
    const currentStats = profile.stats || { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, winDistribution: [0,0,0,0,0,0] };
    const newStats = {
      ...currentStats,
      gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
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
    const isSelfCompleted = (activeMatch && profile?.id) 
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

    const guess = turkishUpper(currentAttempt.trim());

    // --- KELİME GEÇMİŞİ (WORD HISTORY) TEKRAR KONTROLÜ ---
    const usedWords = new Set<string>();
    attempts.forEach((a) => {
      if (a?.word) usedWords.add(turkishUpper(a.word.trim()));
    });

    if (activeMatch) {
      const selfUid = auth.currentUser?.uid || profile?.id;
      const selfData = selfUid ? (activeMatch.players?.[selfUid] || activeMatch.players?.[profile?.id]) : null;
      const selfAttempts = selfData?.attempts || (activeMatch.attempts && selfUid ? activeMatch.attempts[selfUid] : null);
      if (Array.isArray(selfAttempts)) {
        selfAttempts.forEach((a: any) => {
          const w = typeof a === 'string' ? a : a?.word;
          if (w) usedWords.add(turkishUpper(w.trim()));
        });
      }
    }

    if (usedWords.has(guess)) {
      showToast('⚠️ Bu kelimeyi zaten denediniz! Farklı bir kelime girin.', 'error');
      playErrorSound(settings.soundEnabled);
      return;
    }

    setIsValidating(true);

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

      // Server Authoritative / Hybrid Duel & Solo Guess Submission (WebSocket + REST Fallback)
      if (activeMatch) {
        const targetMatchId = activeMatch.matchId || activeMatch.id;
        
        // 1. WebSocket Channel
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          try {
            socketRef.current.send(JSON.stringify({
              type: 'submit_guess',
              matchId: targetMatchId,
              word: guess,
              playerId: profile.id
            }));
          } catch (e) {
            console.warn('[WebSocket] Error sending submit_guess:', e);
          }
        }

        // 2. Dual REST API Channel (ensures delivery even if WebSocket connection drops in background/native)
        try {
          void fetch(getApiUrl('/api/submit-guess'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matchId: targetMatchId,
              playerId: profile.id,
              word: guess,
              guess
            })
          }).catch((err) => console.warn('[REST Submit Guess] Network warning:', err));
        } catch (e) {
          console.warn('[REST Submit Guess] Error firing HTTP guess request:', e);
        }

        // 3. Low Latency Mode Trigger: Instant poll trigger for ultra-fast match sync
        if ((settings.lowLatencyMode ?? true) || (wsLatency !== null && wsLatency > 150)) {
          setTimeout(() => {
            fetch(getApiUrl(`/api/match-status?matchId=${targetMatchId}`))
              .then(res => res.ok ? res.json() : null)
              .then(data => {
                if (data && !data.error) {
                  // Direct snapshot update trigger
                  const matchRef = doc(db, 'matches', targetMatchId);
                  getDoc(matchRef).then(snap => {
                    if (snap.exists()) {
                      setActiveMatch((prev: any) => prev ? { ...prev, ...snap.data() } : prev);
                    }
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }, 120);
        }
      }

      // Process guess locally for instant UI responsiveness & board/row updating
      let target = turkishUpper(
        (activeMatch ? (activeMatch.targetWord || activeMatch.correctWord || targetWord) : targetWord) || ''
      );

      // Robust fallback if target word is missing or mismatched in length
      const matchWordLen = Number(activeMatch?.wordLength || wordLength || target?.length || 5);
      if (!target || target.length !== matchWordLen) {
        target = turkishUpper(getRandomWord(matchWordLen, true));
        setTargetWord(target);
        setWordLength(matchWordLen);
        setDuelWordLength(matchWordLen);
        duelWordLengthRef.current = matchWordLen;
        if (activeMatch) {
          const matchId = activeMatch.matchId || activeMatch.id;
          setActiveMatch((prev: any) => prev ? { ...prev, targetWord: target, correctWord: target, wordLength: matchWordLen } : prev);
          if (matchId) {
            updateDoc(doc(db, 'matches', matchId), { targetWord: target, correctWord: target, wordLength: matchWordLen }).catch(() => {});
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
      setSelfCurrentAttemptCount(updatedAttempts.length);

      if (activeMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const targetMatchId = activeMatch.matchId || activeMatch.id;
        try {
          socketRef.current.send(JSON.stringify({
            type: 'player_attempt',
            matchId: targetMatchId,
            playerId: profile?.id || auth.currentUser?.uid,
            attemptCount: updatedAttempts.length,
            attemptsCount: updatedAttempts.length,
            attempts: updatedAttempts,
            word: guess,
            feedback
          }));
        } catch (e) {
          console.warn('[WebSocket] Error sending player_attempt:', e);
        }
      }

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
            console.warn(`Scoring verification failed for calculated score: ${scoreAwarded}. Defaulting to 1.`);
            scoreAwarded = Math.min(Math.max(scoreAwarded || 1, 1), 5);
          }
        }
      }

      if (activeMatch) {
        const matchId = activeMatch.matchId || activeMatch.id;
        if (matchId) {
          const currentAuthUid = auth.currentUser?.uid || profile?.id || '';
          const matchRef = doc(db, 'matches', matchId);
          const roomRef = doc(db, 'rooms', matchId);
          const playerUpdate: any = {
            [`players.${currentAuthUid}.attempts`]: updatedAttempts,
            [`players.${currentAuthUid}.attemptsCount`]: updatedAttempts.length,
            [`players.${currentAuthUid}.currentAttemptCount`]: updatedAttempts.length,
            [`players.${currentAuthUid}.completed`]: (hasWon || updatedAttempts.length >= 6),
            [`players.${currentAuthUid}.won`]: hasWon,
            [`attempts.${currentAuthUid}`]: updatedAttempts,
            updatedAt: new Date().toISOString()
          };
          if (profile?.id && profile.id !== currentAuthUid) {
            playerUpdate[`players.${profile.id}.attempts`] = updatedAttempts;
            playerUpdate[`players.${profile.id}.attemptsCount`] = updatedAttempts.length;
            playerUpdate[`players.${profile.id}.currentAttemptCount`] = updatedAttempts.length;
            playerUpdate[`players.${profile.id}.completed`] = (hasWon || updatedAttempts.length >= 6);
            playerUpdate[`players.${profile.id}.won`] = hasWon;
            playerUpdate[`attempts.${profile.id}`] = updatedAttempts;
          }
          setDoc(matchRef, playerUpdate, { merge: true }).catch(err => console.warn('Non-blocking Firestore update error:', err));
          setDoc(roomRef, playerUpdate, { merge: true }).catch(() => {});
        }

        if (hasWon) {
          playEnterSound(settings.soundEnabled);
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          const currentAuthUid = auth.currentUser?.uid || profile?.id || '';
          const matchId = activeMatch.matchId || activeMatch.id;
          const oppEntry = Object.values(activeMatch.players || {}).find((p: any) => p && p.id !== currentAuthUid) as any;
          const oppId = oppEntry?.id || (activeMatch.player1?.id !== currentAuthUid ? activeMatch.player1?.id : activeMatch.player2?.id) || 'opponent';

          const winMatchData = {
            id: matchId,
            matchId: matchId,
            isGameOver: true,
            gameOver: true,
            status: 'finished',
            gameState: 'finished',
            winner: currentAuthUid,
            winnerId: currentAuthUid,
            winnerUserId: currentAuthUid,
            finishedBy: currentAuthUid,
            loser: oppId,
            loserUserId: oppId,
            winReason: 'correct_word',
            correctWord: targetWord,
            targetWord: targetWord,
            attempts: {
              ...(activeMatch.attempts || {}),
              [currentAuthUid]: updatedAttempts
            },
            players: {
              ...(activeMatch.players || {}),
              [currentAuthUid]: {
                ...(activeMatch.players?.[currentAuthUid] || {}),
                id: currentAuthUid,
                name: profile.name || 'Sen',
                attempts: updatedAttempts,
                attemptsCount: updatedAttempts.length,
                completed: true,
                won: true
              },
              [oppId]: {
                ...(activeMatch.players?.[oppId] || {}),
                id: oppId,
                completed: true,
                won: false
              }
            }
          };

          if (matchId) {
            const matchRef = doc(db, 'matches', matchId);
            const roomRef = doc(db, 'rooms', matchId);
            setDoc(matchRef, winMatchData, { merge: true }).catch(err => console.warn('Non-blocking Firestore update error:', err));
            setDoc(roomRef, winMatchData, { merge: true }).catch(() => {});
          }

          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'submit_guess',
              matchId: matchId,
              guess: currentAttempt,
              word: currentAttempt,
              attempts: updatedAttempts,
              won: true,
              completed: true,
              hasWon: true
            }));
          }

          handleInstantMatchEndRef.current(currentAuthUid, winMatchData);
        } else if (updatedAttempts.length >= 6) {
          const currentAuthUid = auth.currentUser?.uid || profile.id;
          const matchId = activeMatch.matchId || activeMatch.id;
          const oppEntry = Object.values(activeMatch.players || {}).find((p: any) => p && p.id !== currentAuthUid) as any;
          const oppId = oppEntry?.id || 'opponent';
          const oppCompleted = activeMatch.players?.[oppId]?.completed;
          const oppWon = activeMatch.players?.[oppId]?.won;

          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          if (oppWon) {
            const finishData = {
              id: matchId,
              matchId: matchId,
              isGameOver: true,
              gameOver: true,
              status: 'finished',
              gameState: 'finished',
              winner: oppId,
              winnerId: oppId,
              winnerUserId: oppId,
              loser: currentAuthUid,
              winReason: 'correct_word',
              correctWord: targetWord
            };
            if (matchId) {
              setDoc(doc(db, 'matches', matchId), finishData, { merge: true }).catch(() => {});
              setDoc(doc(db, 'rooms', matchId), finishData, { merge: true }).catch(() => {});
            }
            handleInstantMatchEndRef.current(oppId, finishData);
          } else if (oppCompleted) {
            const finishData = {
              id: matchId,
              matchId: matchId,
              isGameOver: true,
              gameOver: true,
              status: 'finished',
              gameState: 'finished',
              winner: 'draw',
              winnerId: 'draw',
              winnerUserId: 'draw',
              winReason: 'max_attempts',
              correctWord: targetWord
            };
            if (matchId) {
              setDoc(doc(db, 'matches', matchId), finishData, { merge: true }).catch(() => {});
              setDoc(doc(db, 'rooms', matchId), finishData, { merge: true }).catch(() => {});
            }
            handleInstantMatchEndRef.current('draw', finishData);
          } else {
            showToast(`6 tahmin hakkınız tükendi! Diğer oyuncunun tamamlaması bekleniyor... Doğru kelime: ${targetWord}`, 'info');
            playDefeatSound(settings.soundEnabled);
            setGameStatus('idle');
            syncMatchState(updatedAttempts, updatedAttempts.length, true, false, 0);
          }
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

    if (!profile) return;

    const currentStats = profile.stats || { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, winDistribution: [0,0,0,0,0,0] };

    // 1. Calculate stats updates
    const newPlayed = (currentStats.gamesPlayed || 0) + 1;
    const newWon = (currentStats.gamesWon || 0) + 1;
    const newStreak = (currentStats.currentStreak || 0) + 1;
    const newMaxStreak = Math.max(newStreak, currentStats.maxStreak || 0);
    const newDistribution = [...(currentStats.winDistribution || [0,0,0,0,0,0])];
    
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
    const cappedScoreAwarded = scoreAwarded > 0 ? Math.min(Math.max(scoreAwarded, 1), 5) : 0;
    const newScore = (profile.dailyScore || 0) + cappedScoreAwarded;
    
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

    // Determine which badges should be unlocked based on new progressive word length stats and speed
    const badgesToUnlock = new Set<string>();

    // Speed Solver badges check (timer is 20s total; secondsLeft remaining determines completion speed)
    if (secondsLeft >= 5) {
      badgesToUnlock.add('fast_solve_15');
    }
    if (secondsLeft >= 10) {
      badgesToUnlock.add('fast_solve_10');
    }
    if (secondsLeft >= 15) {
      badgesToUnlock.add('fast_solve_5');
    }

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
    const cappedScore = Math.min(Math.max(score, 1), 5);
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
  const onChar = useCallback((char: string) => {
    const isSelfCompleted = (activeMatchRef.current && profile?.id) ? (activeMatchRef.current.players[profile.id]?.completed || activeMatchRef.current.status === 'ended' || isMatchEndedRef.current) : false;
    const isPlaying = activeMatchRef.current ? (activeMatchRef.current.status === 'playing' || activeMatchRef.current.gameState === 'PLAYING') : (gameStatusRef.current === 'playing');
    if (!isPlaying || isValidatingRef.current || isSelfCompleted) return;
    const normalized = turkishUpper(char);
    if (currentAttemptRef.current.length < wordLengthRef.current && /^[A-ZÇĞİÖŞÜ]$/i.test(normalized)) {
      setCurrentAttempt((prev) => prev + normalized);
      playClickSound(settings.soundEnabled);
    }
  }, [profile?.id, settings.soundEnabled]);

  // Handle Backspace
  const onDelete = useCallback(() => {
    const isSelfCompleted = (activeMatchRef.current && profile?.id) ? (activeMatchRef.current.players[profile.id]?.completed || activeMatchRef.current.status === 'ended' || isMatchEndedRef.current) : false;
    const isPlaying = activeMatchRef.current ? (activeMatchRef.current.status === 'playing' || activeMatchRef.current.gameState === 'PLAYING') : (gameStatusRef.current === 'playing');
    if (!isPlaying || isValidatingRef.current || isSelfCompleted) return;
    if (currentAttemptRef.current.length > 0) {
      playDeleteSound(settings.soundEnabled);
    }
    setCurrentAttempt((prev) => prev.slice(0, -1));
  }, [profile?.id, settings.soundEnabled]);

  // References to keep the physical keyboard listener persistent and prevent listener duplication/conflicts
  const currentAttemptRef = useRef(currentAttempt);
  const gameStatusRef = useRef(gameStatus);
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
      if (!profile || !profile.id) return;
      const currentMatch = activeMatchRef.current;
      const isSelfCompleted = currentMatch?.players?.[profile.id]?.completed || currentMatch?.status === 'ended' || isMatchEndedRef.current;
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
  const handleChallengePlayer = async (player: any, length: number) => {
    if (!profile?.id) {
      showToast('Meydan okumak için giriş yapmış olmalısınız.', 'error');
      return;
    }

    const isOpponentOnline = Boolean(
      player.isOnline === true ||
      (player.lastSeen && (Date.now() - (typeof player.lastSeen === 'number' ? player.lastSeen : new Date(player.lastSeen).getTime()) < 180000)) ||
      (lobbyPlayers && Array.isArray(lobbyPlayers) && lobbyPlayers.some((lp: any) => String(lp.id) === String(player.id)))
    );

    const challengeId = 'chal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const challengeData = {
      id: challengeId,
      challengeId,
      challengerId: profile.id,
      challengerName: profile.name || 'Savaşçı',
      challengerAvatar: profile.avatarUrl || '🧠',
      challengedId: player.id,
      challengedName: player.name || 'Oyuncu',
      wordLength: length,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Write challenge document to Firestore
      await setDoc(doc(db, 'challenges', challengeId), challengeData);

      // Save notification to target user's notifications subcollection
      try {
        await setDoc(doc(db, 'users', player.id, 'notifications', challengeId), {
          id: challengeId,
          type: 'challenge',
          challengerId: profile.id,
          challengerName: profile.name || 'Savaşçı',
          challengerAvatar: profile.avatarUrl || '🧠',
          wordLength: length,
          status: 'pending',
          read: false,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Error saving notification doc:', err);
      }

      // 2. Send via WebSocket if connected
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'challenge',
          ...challengeData
        }));
      }

      // 3. Trigger FCM Push Notification (informing backend if opponent is offline)
      fetch(getApiUrl('/api/send-challenge-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengedId: player.id,
          challengerName: profile.name || 'Bir arkadaşın',
          wordLength: length,
          challengeId,
          isOffline: !isOpponentOnline
        })
      }).catch(() => {});

      if (!isOpponentOnline) {
        showToast(`📲 ${player.name || 'Oyuncu'} şu an oyunda değil. Meydan okuma bildirimi gönderildi! 🔔`, 'info');
      } else {
        showToast(`⚔️ ${player.name || 'Oyuncu'} oyuncusuna meydan okundu! Yanıt bekleniyor...`, 'info');
      }
    } catch (err) {
      console.error('[Challenge Error]:', err);
      showToast('Meydan okuma gönderilemedi.', 'error');
    }
  };

  const handleAcceptChallenge = async (challengeId: string, challengeObj?: any) => {
    try {
      const targetData = challengeObj || activeChallenges.find(c => c.id === challengeId);
      const targetLength = Number(targetData?.wordLength || duelWordLength || 5);

      const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const correctWord = turkishUpper(getRandomWord(targetLength, true));

      const challengerId = targetData?.challengerId || 'p1';
      const challengerName = targetData?.challengerName || 'Savaşçı';
      const challengerAvatar = targetData?.challengerAvatar || '';

      const currentUid = auth.currentUser?.uid || profile?.id || '';
      const currentName = profile?.name || auth.currentUser?.displayName || 'Savaşçı';
      const currentAvatar = profile?.avatarUrl || auth.currentUser?.photoURL || '';

      const initialFirestoreMatch = {
        id: matchId,
        matchId,
        wordLength: targetLength,
        targetWord: correctWord,
        correctWord,
        gameState: 'READY',
        status: 'waiting_ready',
        createdAt: new Date().toISOString(),
        player1: { id: challengerId, name: challengerName, avatarUrl: challengerAvatar },
        player2: { id: currentUid, name: currentName, avatarUrl: currentAvatar },
        players: {
          [challengerId]: { id: challengerId, name: challengerName, avatarUrl: challengerAvatar, attempts: [], completed: false, won: false },
          [currentUid]: { id: currentUid, name: currentName, avatarUrl: currentAvatar, attempts: [], completed: false, won: false }
        },
        isGameOver: false,
        winner: null
      };

      // 1. Create match documents in Firestore first
      await setDoc(doc(db, 'matches', matchId), initialFirestoreMatch, { merge: true });
      await setDoc(doc(db, 'rooms', matchId), initialFirestoreMatch, { merge: true });
      await setDoc(doc(db, 'challenges', challengeId), {
        status: 'accepted',
        matchId,
        wordLength: targetLength,
        targetWord: correctWord,
        correctWord,
        matchPayload: initialFirestoreMatch
      }, { merge: true });

      // 2. Send WebSocket response
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'challenge_respond',
          challengeId,
          accept: true,
          matchId,
          wordLength: targetLength,
          correctWord,
          targetWord: correctWord,
          challenge: targetData,
          matchPayload: initialFirestoreMatch
        }));
      }

      setActiveChallenges((prev) => prev.filter((c) => c.id !== challengeId));

      isMatchEndedRef.current = false;
      if (matchId) handledMatchEndIdsRef.current.delete(matchId);

      setTargetWord(correctWord);
      setWordLength(targetLength);
      setAttempts([]);
      setCurrentAttempt('');
      setLetterStatuses({});
      setHasEnteredGame(true);
      setMatchmakingStatus('idle');
      setIsMatchmakingLocked(false);
      setOpponentLeftDuringMatch(false);
      setShowCongratsModal(false);
      setRematchRequested(false);
      setOpponentRematchRequested(false);

      const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(
        initialFirestoreMatch.player1,
        initialFirestoreMatch.player2,
        profile,
        initialFirestoreMatch.players
      );

      const cleanPlayers = { ...parsedPlayers };
      Object.keys(cleanPlayers).forEach((k) => {
        cleanPlayers[k] = { ...cleanPlayers[k], attempts: [], completed: false, won: false, isWinner: false };
      });

      setActiveMatch({
        ...initialFirestoreMatch,
        isGameOver: false,
        gameOver: false,
        winner: null,
        winnerId: null,
        winnerUserId: null,
        winReason: null,
        player1: p1,
        player2: p2,
        players: cleanPlayers
      });

      showToast('Meydan okuma kabul edildi! Düello hazırlanıyor...', 'success');
    } catch (err) {
      console.error('[Accept Challenge Error]:', err);
    }
  };

  const handleDeclineChallenge = async (challengeId: string) => {
    try {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'challenge_respond',
          challengeId,
          accept: false
        }));
      }
      await setDoc(doc(db, 'challenges', challengeId), { status: 'declined' }, { merge: true });
      setActiveChallenges((prev) => prev.filter((c) => c.id !== challengeId));
      showToast('Meydan okuma reddedildi.', 'info');
    } catch (err) {
      console.error('[Decline Challenge Error]:', err);
    }
  };

  const handleLeaveMatch = async () => {
    if (activeMatch && !isMatchEndedRef.current && (activeMatch.status === 'playing' || activeMatch.gameState === 'PLAYING' || gameStatus === 'playing')) {
      showConfirm(
        'Düellodan Çık',
        'Düellodan çıkmak istediğinize emin misiniz? Çıkarsanız rakibiniz oyunu kazanacaktır.',
        async () => {
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'leave_match',
              matchId: activeMatch.id || activeMatch.matchId
            }));
          }
          await handleLeaveMatchToMenu();
        }
      );
    } else {
      if (activeMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'leave_match',
          matchId: activeMatch.id || activeMatch.matchId
        }));
      }
      await handleLeaveMatchToMenu();
    }
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

    const currentAuthUser = auth.currentUser;
    const currentUid = currentAuthUser?.uid || profile?.id || '';
    const selfName = getEffectiveSelfName(profile, currentAuthUser);
    const selfAvatar = profile?.avatarUrl || currentAuthUser?.photoURL || '';

    if (currentUid) {
      clearMatchmakingState(currentUid).catch((err) => {
        console.warn('Database cleanup failed in handleStartMatchmaking join:', err);
      });
      if (profile?.id && currentUid !== profile.id) {
        clearMatchmakingState(profile.id).catch(() => {});
      }
    }

    const targetLen = Math.max(3, Math.min(10, parseInt(String(matchWordsCount || duelWordLength || 5), 10) || 5));
    setDuelWordLength(targetLen);
    setWordLength(targetLen);
    duelWordLengthRef.current = targetLen;

    const queueCollectionName = 'matchmaking_queue_' + targetLen;

    // Send WebSocket join if available
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({
          type: 'join_matchmaking',
          wordLength: targetLen,
          id: currentUid,
          userId: currentUid,
          playerId: currentUid,
          name: selfName,
          username: selfName,
          displayName: selfName,
          avatarUrl: selfAvatar
        }));
      } catch (e) {
        console.warn("WebSocket join attempt failed:", e);
      }
    } else {
      // Reconnect WebSocket in background
      setReconnectCounter((prev) => prev + 1);
    }

    // Firestore Real-time Matchmaking Queue (strictly isolated by word length)
    try {
      const myQueueRef = doc(db, queueCollectionName, currentUid);
      const queueData = {
        id: currentUid,
        playerId: currentUid,
        uid: currentUid,
        name: selfName,
        username: selfName,
        displayName: selfName,
        avatarUrl: selfAvatar,
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
            const matchLen = Number(data.wordLength || targetLen);
            const word = data.correctWord || data.targetWord;
            
            const activeProfile = { ...profile, id: currentUid, name: selfName };
            const { player1: p1, player2: p2, players: parsedPlayers } = resolveDuelPlayers(
              data.player1,
              data.player2 || data.opponent,
              activeProfile,
              data.players
            );

            setActiveMatch({
              id: data.matchId,
              matchId: data.matchId,
              gameState: 'READY',
              status: 'waiting_ready',
              targetWord: word,
              correctWord: word,
              player1: p1,
              player2: p2,
              players: parsedPlayers,
              wordLength: matchLen
            });
            setTargetWord(word);
            setWordLength(matchLen);
            setDuelWordLength(matchLen);
            duelWordLengthRef.current = matchLen;
            setAttempts([]);
            setCurrentAttempt('');
            setLetterStatuses({});
            setMatchmakingStatus('idle');
            setIsMatchmakingLocked(false);
            showToast('Eşleşme bulundu! Düello hazırlanıyor... ⚡', 'success');

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

      // Search Firestore queue for waiting opponents in the isolated word length collection
      let querySnap;
      try {
        const qStrict = query(
          collection(db, queueCollectionName),
          where('status', '==', 'waiting')
        );
        querySnap = await getDocs(qStrict);
      } catch (err) {
        console.warn("[Firestore Queue Search Notice]:", err);
      }

      const waitingDocs = querySnap ? querySnap.docs.filter(d => {
        if (d.id === currentUid || (profile?.id && d.id === profile.id)) return false;
        return true;
      }) : [];

      if (waitingDocs.length > 0) {
        const oppDoc = waitingDocs[0];
        const oppData = oppDoc.data();
        const oppId = oppData.playerId || oppData.uid || oppData.id || oppDoc.id;
        const oppName = oppData.name || oppData.username || oppData.displayName || 'Oyuncu';

        const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const word = turkishUpper(getRandomWord(targetLen, true));

        console.log(`[Firestore Matchmaking] Match found in queue (${targetLen} letters)! Opponent: ${oppName}. Creating match ${matchId} with word ${word}`);

        const matchPayload = {
          id: matchId,
          matchId,
          wordLength: targetLen,
          targetWord: word,
          correctWord: word,
          gameState: 'PLAYING',
          status: 'playing',
          createdAt: new Date().toISOString(),
          player1: { id: oppId, uid: oppId, name: oppName, username: oppName, displayName: oppName, avatarUrl: oppData.avatarUrl || '' },
          player2: { id: currentUid, uid: currentUid, name: selfName, username: selfName, displayName: selfName, avatarUrl: selfAvatar },
          players: {
            [oppId]: { id: oppId, uid: oppId, name: oppName, username: oppName, displayName: oppName, avatarUrl: oppData.avatarUrl || '', attempts: [], completed: false, won: false },
            [currentUid]: { id: currentUid, uid: currentUid, name: selfName, username: selfName, displayName: selfName, avatarUrl: selfAvatar, attempts: [], completed: false, won: false }
          },
          isGameOver: false,
          winner: null
        };

        // Create match documents in Firestore
        await setDoc(doc(db, 'matches', matchId), matchPayload);
        await setDoc(doc(db, 'rooms', matchId), matchPayload);

        // Notify opponent via their queue document in the same isolated queue collection
        await setDoc(doc(db, queueCollectionName, oppId), {
          status: 'matched',
          matchId,
          correctWord: word,
          targetWord: word,
          wordLength: targetLen,
          player1: matchPayload.player1,
          player2: matchPayload.player2,
          players: matchPayload.players,
          opponent: { id: currentUid, uid: currentUid, name: selfName, username: selfName, displayName: selfName, avatarUrl: selfAvatar }
        }, { merge: true }).catch((err) => {
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
      await fetch(getApiUrl('/api/daily-puzzle'), {
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
      const response = await fetch(getApiUrl(`/api/daily-puzzle?deviceId=${encodeURIComponent(deviceId)}`));
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
    setProfile(prev => {
      const updated = {
        ...prev,
        name: cleanName,
        ...(avatarUrl ? { avatarUrl } : {}),
        nameSet: true
      };
      safeLocalStorage.setItem('kelimesavasi_profile', JSON.stringify(updated));
      safeLocalStorage.setItem('saved_username', cleanName);
      saveUserProfileToFirestore(updated).catch((err) => {
        console.warn('Non-blocking profile save during handleUpdateProfile failed:', err);
      });
      return updated;
    });
    setNameInput(cleanName);
    if (avatarUrl) setAvatarInput(avatarUrl);
    showToast('Profiliniz güncellendi.', 'success');
  };

  const handleUpdateFriends = useCallback((newFriends: string[]) => {
    setProfile(prev => {
      if (!prev) return prev;
      const current = prev.friends || [];
      if (current.length === newFriends.length && current.every((f, i) => f === newFriends[i])) {
        return prev;
      }
      const updated = {
        ...prev,
        friends: newFriends
      };
      saveUserProfileToFirestore(updated).catch((err) => {
        console.warn('Non-blocking friends save during handleUpdateFriends failed:', err);
      });
      return updated;
    });
  }, []);

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

  const opponent = activeMatch ? Object.values(activeMatch.players || {}).find(p => (p as any)?.id && (!profile?.id || (p as any)?.id !== profile.id)) as any : null;
  const isMatchEnded = !!(
    activeMatch && (
      activeMatch.status === 'ended' ||
      activeMatch.status === 'finished' ||
      activeMatch.status === 'completed' ||
      activeMatch.status === 'won' ||
      activeMatch.isGameOver === true ||
      activeMatch.gameOver === true ||
      activeMatch.won === true ||
      activeMatch.gameState === 'FINISHED' ||
      activeMatch.gameState === 'finished' ||
      Boolean(activeMatch.winner || activeMatch.winnerId) ||
      Object.values(activeMatch.players || {}).some((p: any) => p?.won === true || (p?.completed === true && p?.won === true))
    )
  );

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

      if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
        try {
          if ((window as any).AndroidBridge.loadAdBackground) {
            (window as any).AndroidBridge.loadAdBackground();
          }
          if ((window as any).AndroidBridge.preventAdLayoutLoops) {
            (window as any).AndroidBridge.preventAdLayoutLoops();
          }
        } catch (e) {
          console.error("Error calling native AndroidBridge:", e);
        }
      }
    }
  }, [isMatchEnded, activeMatch, targetWord]);



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

        {/* Match Start Overlay */}
        {activeMatch && (activeMatch.gameState === 'WAITING' || activeMatch.gameState === 'READY') && (
          <MatchStartOverlay
            activeMatch={activeMatch}
            profile={profile}
            onStartGame={handleStartMatchedGame}
          />
        )}

        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#FAF6E9] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-[#FAF6E9]/60">Kullanıcı Oturumu Hazırlanıyor...</p>
          </div>
        ) : (!firebaseUser || !profile) ? (
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
            onUpdateFriends={handleUpdateFriends}
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
            lobbyPlayers={lobbyPlayers}
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
            onChallengePlayer={handleChallengePlayer}
            matchmakingStatus={matchmakingStatus}
          />
        ) : (
          <>
            {/* Back to welcome & Compact control panel block */}
            {!activeMatch && (
              <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] flex flex-col gap-2 mb-2 animate-fadeIn">
                {/* Row 1: Back to entry screen, Pes Et & Yenile */}
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-1.5">
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

                    <button
                      onClick={() => setShowFriendsModal(true)}
                      className="px-2.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700 transition duration-150 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider font-mono cursor-pointer shrink-0"
                      title="Arkadaş Listesini Aç"
                    >
                      <Users size={13} className="stroke-[2.5]" />
                      <span className="hidden xs:inline">Arkadaşlar</span>
                    </button>
                  </div>

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

            {/* Canlı Düello Kompakt Skor Tahtası (Live Duel Scoreboard) */}
        {activeMatch && (
          (() => {
            const currentAuthUid = auth.currentUser?.uid || profile?.id || '';
            const selfId = currentAuthUid || profile?.id || '';
            const activeProfile = profile ? { ...profile, id: selfId } : { id: selfId, name: 'Sen' };
            const resolved = resolveDuelPlayers(activeMatch.player1, activeMatch.player2, activeProfile, activeMatch.players);
            
            const p1 = resolved.player1;
            const p2 = resolved.player2;

            const p1IsSelf = checkIsSelfPlayer(p1, currentAuthUid, profile?.id);
            const selfPlayer = p1IsSelf ? p1 : p2;
            const oppPlayer = p1IsSelf ? p2 : p1;

            const oppId = oppPlayer?.id || oppPlayer?.uid || 'opponent';
            const selfKey = selfPlayer?.id || selfPlayer?.uid || selfId;

            let oppDisplayName = oppPlayer?.name || oppPlayer?.username || oppPlayer?.displayName || '';
            if (!oppDisplayName || oppDisplayName === 'Oyuncu 1' || oppDisplayName === 'Oyuncu 2' || oppDisplayName === 'Oyuncu') {
              oppDisplayName = (oppId && oppId !== 'opponent') ? 'Misafir_' + oppId.substring(0, 5) : 'Rakip';
            }

            const selfData = getPlayerAttemptData(activeMatch, true, currentAuthUid, profile?.id || '', attempts, selfCurrentAttemptCount);
            const oppData = getPlayerAttemptData(activeMatch, false, currentAuthUid, profile?.id || '', [], oppCurrentAttemptCount);

            const selfScore = activeMatch.scores?.[selfKey] ?? activeMatch.scores?.[profile?.id || ''] ?? 0;
            const oppScore = activeMatch.scores?.[oppId] ?? 0;

            return (
              <div className="w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto bg-slate-900/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-2.5 sm:p-3 mb-2.5 shadow-2xl text-white relative overflow-hidden" id="canli-duello-skor-tahtasi">
                {/* Animated Accent Line */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" />

                {/* Top Header Row */}
                <div className="flex justify-between items-center mb-2 px-0.5 pb-1.5 border-b border-white/10">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] sm:text-xs font-black font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <Swords size={14} className="text-amber-400 shrink-0 animate-pulse" />
                      CANLI DÜELLO SKOR TAHTASI
                    </span>
                    <span className="text-[9px] font-bold font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {targetWord?.length || duelWordLength || 5} HARFLİ
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Minimal, uncluttered connection indicator dot */}
                    <div 
                      onClick={handleManualReconnect}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold select-none transition-all cursor-pointer ${
                        isOnline 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                          : 'bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse'
                      }`}
                      title={isOnline ? "Sunucu Bağlantısı Aktif" : "İnternet Kopuk! Yeniden bağlanmak için tıklayın."}
                    >
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      </span>
                      <span>{isOnline ? 'CANLI' : 'ÇEVRİMDIŞI'}</span>
                    </div>

                    <button
                      onClick={handleLeaveMatch}
                      className="flex items-center gap-1 text-[10px] font-extrabold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-lg transition active:scale-95 cursor-pointer"
                      title="Düellodan Çık"
                    >
                      <LogOut size={12} />
                      <span>Çık</span>
                    </button>
                  </div>
                </div>

                {/* Scoreboard Players Grid */}
                <div className="grid grid-cols-11 items-center gap-1 sm:gap-2">
                  {/* Player 1: SEN */}
                  <div className="col-span-5 bg-black/40 border border-emerald-500/30 rounded-xl p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center font-black text-xs text-emerald-300 shrink-0 overflow-hidden">
                          {profile?.avatarUrl ? (
                            <img src={profile?.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            profile?.name?.[0]?.toUpperCase() || 'S'
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] text-emerald-400 font-bold block leading-none font-mono">SEN</span>
                          <span className="text-xs font-black text-white truncate block leading-tight">{profile?.name || 'Sen'}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[8px] text-gray-400 block leading-none font-mono">SKOR</span>
                        <span className="text-xs font-black text-emerald-400 font-mono">{selfScore} P</span>
                      </div>
                    </div>

                    {/* Attempt Tracker Dots & Label for Self */}
                    <ProgressDots
                      currentAttemptCount={selfData.count}
                      isCompleted={selfData.isCompleted}
                      isWon={selfData.isWon}
                      colorScheme="emerald"
                    />
                  </div>

                  {/* Center VS Divider */}
                  <div className="col-span-1 flex flex-col items-center justify-center">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black text-xs font-mono flex items-center justify-center shadow-lg border border-amber-300 animate-pulse">
                      VS
                    </div>
                  </div>

                  {/* Player 2: RAKİP */}
                  <div className="col-span-5 bg-black/40 border border-amber-500/30 rounded-xl p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center font-black text-xs text-amber-300 shrink-0 overflow-hidden">
                          {oppPlayer?.avatarUrl ? (
                            <img src={oppPlayer.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            oppDisplayName?.[0]?.toUpperCase() || 'R'
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] text-amber-400 font-bold block leading-none font-mono">RAKİP</span>
                          <span className="text-xs font-black text-white truncate block leading-tight">{oppDisplayName}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[8px] text-gray-400 block leading-none font-mono">SKOR</span>
                        <span className="text-xs font-black text-amber-400 font-mono">{oppScore} P</span>
                      </div>
                    </div>

                    {/* Attempt Tracker Dots & Label for Opponent */}
                    <ProgressDots
                      currentAttemptCount={oppData.count}
                      isCompleted={oppData.isCompleted}
                      isWon={oppData.isWon}
                      colorScheme="amber"
                    />
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {/* Game Layout Wrapper */}
        <div className="w-full flex-1 min-h-0 flex flex-col items-stretch justify-stretch gap-0.5 sm:gap-1 relative z-10">
          {/* Game Area Card */}
          <div className={`w-full max-w-md md:max-w-[90%] lg:max-w-[85%] xl:max-w-[1000px] mx-auto card-theme rounded-[1.5rem] border border-[#3E485A]/30 p-2 sm:p-3 shadow-2xl flex flex-col items-center ${isMatchEnded || gameStatus === 'won' || gameStatus === 'lost' || Boolean(activeMatch && (activeMatch.status === 'ended' || (profile?.id && activeMatch.players[profile.id]?.completed))) ? 'game-ended justify-center my-auto' : 'justify-between'} flex-1 min-h-0 overflow-hidden gap-y-0.5 transition-all duration-200 relative text-white`} id="game-area-card">
          {/* Subtle atmospheric ambient glow inside the card */}



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
                  <button
                    type="button"
                    onClick={() => setShowWordHistoryModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-amber-500/50 transition cursor-pointer active:scale-95 text-left"
                    title="Kelime Geçmişini İncele"
                  >
                    <Trophy size={15} className="text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-gray-200 font-mono">
                      Deneme: {attempts.length}/6
                    </span>
                    {attempts.length > 0 && (
                      <span className="text-[8.5px] font-black font-mono px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                        Geçmiş 📜
                      </span>
                    )}
                  </button>

                  {/* Shimmering Gold Wallet in playing screen top bar */}
                  <GoldWallet gold={profile?.gold !== undefined ? profile.gold : 20} />

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

          {/* Letter Grid & Duplicate Warning */}
          {!isMatchEnded && (() => {
            const normAttempt = turkishUpper(currentAttempt.trim());
            const isDup = normAttempt.length === wordLength && attempts.some(a => turkishUpper(a.word.trim()) === normAttempt);
            return (
              <>
                {isDup && (
                  <div className="w-full max-w-xs mx-auto mb-1.5 py-1 px-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-center justify-center gap-1.5 text-rose-300 text-[11px] font-extrabold shadow-lg shadow-rose-500/10 animate-pulse select-none">
                    <AlertCircle size={13} className="text-rose-400 shrink-0" />
                    <span>Kelime Geçmişi: Bu kelimeyi zaten denediniz!</span>
                  </div>
                )}
                <GameBoard
                  attempts={attempts}
                  currentAttempt={currentAttempt}
                  wordLength={wordLength}
                  boardTheme={settings.boardTheme}
                  isGameOver={gameStatus !== 'playing'}
                  revealedHints={revealedHints}
                  isDuplicateAttempt={isDup}
                />
              </>
            );
          })()}

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
                      suspendAudioContext();
                      document.body.classList.add('ad-active');
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
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && profile?.id && activeMatch.players[profile.id]?.completed) && (
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
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && profile?.id && activeMatch.players[profile.id]?.completed) && (
            <div className="flex-1 min-h-[0.25rem] sm:min-h-[0.5rem]" />
          )}

          {/* Virtual Keyboard */}
          {!isMatchEnded && (gameStatus === 'playing' || Boolean(activeMatch)) && !(activeMatch && profile?.id && activeMatch.players[profile.id]?.completed) && (
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
          {!isMatchEnded && activeMatch && profile?.id && activeMatch.players[profile.id]?.completed && (
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
                const isOpponent = pId !== profile?.id;
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
          {activeMatch && isMatchEnded && (
            <div className="w-full max-w-sm sm:max-w-md mx-auto bg-slate-900/95 border-2 border-amber-500/30 rounded-3xl p-4 sm:p-5 text-center shadow-2xl animate-scale-up flex flex-col justify-between max-h-[85vh] overflow-hidden" id="multiplayer-results-container">
              {(() => {
                const serverWinnerId = String(
                  activeMatch.winnerUserId || activeMatch.winnerId || activeMatch.winner || ''
                ).trim();
                const currentUserId = String(profile?.id || '').trim();
                const currentAuthUid = String(auth.currentUser?.uid || '').trim();

                const isWinner = Boolean(
                  serverWinnerId &&
                  serverWinnerId !== 'draw' &&
                  ((currentUserId !== '' && serverWinnerId === currentUserId) ||
                   (currentAuthUid !== '' && serverWinnerId === currentAuthUid))
                );
                const isDraw = serverWinnerId === 'draw';

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

                    {/* Target Word Display Section inside Results Card */}
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3 my-2 text-left shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono">ARANAN SÖZCÜK</span>
                        <span className="text-[9px] font-mono text-amber-400 font-bold">{targetWord.length} Harfli</span>
                      </div>
                      <div className="flex items-center gap-1.5 my-0.5">
                        <strong className="text-xl font-black tracking-widest text-[#FAF6E9] uppercase leading-none">{targetWord}</strong>
                      </div>
                    </div>

                    {/* Player Round Statistics */}
                    <div className="bg-black/25 rounded-2xl border border-white/5 p-3 mb-2 space-y-1.5 shrink-0">
                      <h4 className="text-[9px] font-black text-amber-300/80 tracking-widest uppercase font-mono text-left font-bold">OYUNCU DETAYLARI</h4>
                      {(() => {
                        const currentAuthUid = auth.currentUser?.uid || profile?.id || '';
                        const selfId = currentAuthUid || profile?.id || '';
                        const activeProfile = profile ? { ...profile, id: selfId } : { id: selfId, name: 'Sen' };
                        const { player1: resolvedP1, player2: resolvedP2 } = resolveDuelPlayers(activeMatch.player1, activeMatch.player2, activeProfile, activeMatch.players);
                        const duelPlayers = [resolvedP1, resolvedP2].filter(Boolean);

                        return duelPlayers.map((p: any, index: number) => {
                          const pId = p.id || p.uid || (index === 0 ? 'p1' : 'p2');
                          const isSelf = checkIsSelfPlayer(p, currentAuthUid, profile?.id);

                          // Determine clean display name
                          let displayName = '';
                          if (isSelf) {
                            displayName = `${profile?.name || profile?.username || profile?.displayName || 'Oyuncu'} (Sen)`;
                          } else {
                            displayName = p.name || p.username || p.displayName || 'Rakip';
                          }

                          const pData = getPlayerAttemptData(
                            activeMatch,
                            isSelf,
                            currentAuthUid,
                            profile?.id || '',
                            isSelf ? attempts : [],
                            isSelf ? selfCurrentAttemptCount : oppCurrentAttemptCount
                          );

                          const attemptCount = pData.count;

                          // Determine win status
                          const isWonPlayer = pData.isWon || Boolean(
                            serverWinnerId &&
                            serverWinnerId !== 'draw' &&
                            (pId === serverWinnerId || (isSelf && isWinner))
                          );

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
                            <div key={pId + '_' + index} className="flex justify-between items-center text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${isWonPlayer ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <span className={`font-black uppercase tracking-wider ${isSelf ? 'text-amber-400' : 'text-gray-300'}`}>
                                  {displayName}
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
                        });
                      })()}
                    </div>
                  </>
                );
              })()}

              {/* Buttons Block */}
              <div className="space-y-2 mt-auto shrink-0 pt-1">
                {(() => {
                  const currentAuthUid = auth.currentUser?.uid;
                  const selfId = currentAuthUid || profile?.id || '';
                  const activeProfile = profile ? { ...profile, id: selfId } : { id: selfId, name: 'Sen' };
                  const { player1: resolvedP1, player2: resolvedP2 } = resolveDuelPlayers(activeMatch.player1, activeMatch.player2, activeProfile, activeMatch.players);
                  const opponentPlayer = [resolvedP1, resolvedP2].find(
                    (p: any) => p && p.id && p.id !== selfId && (!profile?.id || p.id !== profile.id)
                  ) || (resolvedP1?.id && resolvedP1.id !== selfId ? resolvedP1 : resolvedP2);

                  return opponentPlayer && opponentPlayer.id ? (
                    <button
                      onClick={async () => {
                        if (rematchRequested) return;
                        playClickSound(settings.soundEnabled);
                        setRematchRequested(true);
                        const targetLength = activeMatch.wordLength || wordLength || 5;
                        await handleChallengePlayer(opponentPlayer, targetLength);
                      }}
                      disabled={rematchRequested}
                      className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 border border-amber-400/50 cursor-pointer ${
                        rematchRequested
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-not-allowed opacity-80'
                          : 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-600 hover:to-yellow-600 active:scale-[0.98] text-slate-950 shadow-amber-500/20'
                      }`}
                      id="match-rematch-btn"
                    >
                      <Swords size={16} className={`stroke-[2.5] ${rematchRequested ? 'animate-spin' : ''}`} />
                      <span>{rematchRequested ? 'RÖVANŞ İSTEĞİ GÖNDERİLDİ ⏳' : 'RÖVANŞ İSTE'}</span>
                    </button>
                  ) : null;
                })()}

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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#161D2B] text-white rounded-2xl p-6 w-full max-w-md border border-amber-500/20 shadow-2xl space-y-5 overflow-y-auto max-h-[90vh]" id="edit-profile-modal">
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
      {showStatsModal && profile && (
        <StatsModal
          profile={profile}
          onClose={() => setShowStatsModal(false)}
          onResetStats={resetStats}
        />
      )}

      {/* Missions Modal */}
      {showMissionsModal && profile && (
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

      {/* Congrats / Victory Modal */}
      {showCongratsModal && !activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" id="congrats-modal-container">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-200 cursor-pointer"
            onClick={() => {
              playClickSound(settings.soundEnabled);
              startNewGame(wordLength);
              setShowCongratsModal(false);
            }}
          />
          
          {/* Modal Container */}
          <div className="bg-[#161D2B] border-2 border-emerald-500/30 rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden text-white animate-scale-up text-center space-y-4" id="congrats-modal-card">
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

      {/* Word History Modal (Kelime Geçmişi İnceleme) */}
      {showWordHistoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn" id="word-history-modal">
          <div className="w-full max-w-sm bg-[#161D2B] border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4 text-left relative text-[#FAF6E9] animate-scaleUp">
            <button
              type="button"
              onClick={() => setShowWordHistoryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 border border-slate-700 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-slate-700/60 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-lg">
                📜
              </div>
              <div>
                <h3 className="text-base font-black text-amber-300 tracking-wide uppercase">Kelime Geçmişi</h3>
                <p className="text-[11px] text-slate-400">Bu turda denediğiniz tüm kelimeler ({attempts.length}/6)</p>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {attempts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-900/40 rounded-2xl border border-slate-800/80">
                  Henüz bir kelime denemediniz.
                </div>
              ) : (
                attempts.map((att, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-700/60 font-mono text-xs">
                    <span className="text-amber-400 font-bold text-[10px] w-6">#{idx + 1}</span>
                    <div className="flex gap-1">
                      {att.word.split('').map((char, cIdx) => {
                        const fb = att.feedback?.[cIdx];
                        const bg = fb === 'green' 
                          ? 'bg-emerald-500 text-white font-black shadow-sm' 
                          : fb === 'orange' 
                          ? 'bg-amber-500 text-white font-black shadow-sm' 
                          : 'bg-slate-700 text-slate-300 font-bold';
                        return (
                          <span key={cIdx} className={`w-6 h-6 rounded flex items-center justify-center text-xs uppercase ${bg}`}>
                            {char}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-200/90 leading-relaxed space-y-1">
              <p className="font-extrabold text-amber-300 flex items-center gap-1.5">
                <Info size={13} className="shrink-0 text-amber-400" />
                Tekrar Kelime Engeli
              </p>
              <p className="text-[10.5px]">
                Aynı kelimelerin tekrar yazılması engellenmektedir. Böylece deneme haklarınız boşa harcanmaz.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowWordHistoryModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-amber-500/20"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* Friends Modal */}
      {showFriendsModal && profile && (
        <FriendsModal
          profile={profile}
          onClose={() => setShowFriendsModal(false)}
          onUpdateFriends={handleUpdateFriends}
          isOnline={isOnline}
          lobbyPlayers={lobbyPlayers}
          onChallengePlayer={(player, wLen) => {
            setShowFriendsModal(false);
            handleChallengePlayer(player, wLen);
          }}
          duelWordLength={duelWordLength}
          wordLength={wordLength}
          showToast={showToast}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && profile && (
        <SettingsModal
          settings={settings}
          onChangeSettings={setSettings}
          onClose={() => setShowSettingsModal(false)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onOpenStats={() => setShowStatsModal(true)}
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          networkLogs={networkLogs}
          onReconnect={handleManualReconnect}
          onSignOut={handleSignOut}
        />
      )}

      {/* Offline Red Dot Floating Indicator */}
      {!isOnline && (
        <div 
          onClick={handleManualReconnect}
          className="fixed top-3 right-3 z-[200] flex items-center gap-2 bg-rose-950/95 border border-rose-500/60 text-rose-200 px-3 py-1.5 rounded-full text-xs font-black shadow-2xl animate-pulse backdrop-blur-md cursor-pointer hover:bg-rose-900 transition active:scale-95"
          title="İnternet bağlantısı koptu. Yeniden bağlanmak için tıklayın."
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span>İnternet Kopuk</span>
        </div>
      )}

      {/* Badge Unlocked Popup Animation */}
      <BadgeUnlockedModal
        badge={unlockedBadgeToShow}
        onClose={() => setUnlockedBadgeToShow(null)}
        soundEnabled={settings.soundEnabled}
      />

      {/* Live Incoming Challenge Popup Modal */}
      {activeChallenges && activeChallenges.length > 0 && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fadeIn">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-200" />
          
          {/* Modal Container */}
          <div className="bg-[#161D2B] border-2 border-amber-500/50 rounded-3xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(245,158,11,0.3)] relative z-10 overflow-hidden text-white animate-scaleUp">
            {/* Atmospheric glows */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* Content */}
            <div className="relative z-10 text-center space-y-4">
              {/* Badge Icon */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 p-0.5 mx-auto shadow-xl shadow-amber-500/30 animate-pulse">
                <div className="w-full h-full bg-[#161D2B] rounded-[14px] flex items-center justify-center text-amber-400">
                  <Swords size={32} className="stroke-[2.5]" />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full font-mono">
                  ⚔️ YENİ MEYDAN OKUMA!
                </span>
                
                <h3 className="text-lg font-black text-white tracking-wide mt-2">
                  {activeChallenges[0].challengerName || 'Bir Oyuncu'}
                </h3>
                
                <p className="text-xs text-gray-300 leading-relaxed font-medium">
                  Seni <span className="text-amber-400 font-black font-mono">{activeChallenges[0].wordLength || 5} Harfli</span> kelime düellosuna davet ediyor!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleDeclineChallenge(activeChallenges[0].id)}
                  className="flex-1 py-3 px-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-black uppercase tracking-wider transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <X size={16} />
                  Reddet
                </button>
                
                <button
                  onClick={() => handleAcceptChallenge(activeChallenges[0].id, activeChallenges[0])}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white text-xs font-black uppercase tracking-wider border border-emerald-400/50 shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Swords size={16} />
                  Kabul Et
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Premium Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-200"
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
          
          {/* Modal Container */}
          <div className="bg-[#161D2B] border border-amber-500/25 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden text-white">
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
