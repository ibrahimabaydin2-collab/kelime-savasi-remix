// Complete rebuild stamp for GitHub Actions: 2026-07-23 v1.0.2
import express from 'express';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from './src/lib/firebase.js';
import { getRandomWord, isWordInCuratedList, getDailyWordAndLength } from './src/data/wordlist.js';
import { turkishUpper, turkishLower } from './src/utils/turkish.js';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Custom CORS middleware to fully unblock Android WebViews, emulators, and local origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Auto-backup AI Studio auth token to keep mobile APK/AAB connection persistent
app.use((req, res, next) => {
  let token = req.query.___aistudio_auth_token;
  
  // Extract token from cookies if not present in query string
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const cookie of cookies) {
      const [name, val] = cookie.trim().split('=');
      if (name === '__SECURE-aistudio_auth_token' || name === 'aistudio_auth_token') {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  if (token && typeof token === 'string') {
    try {
      const filePath = path.join(process.cwd(), 'src', 'utils', 'tokenBackup.ts');
      let currentContent = '';
      if (fs.existsSync(filePath)) {
        currentContent = fs.readFileSync(filePath, 'utf8');
      }
      const expectedContent = `export const BACKUP_TOKEN = ${JSON.stringify(token)};\n`;
      if (currentContent !== expectedContent) {
        fs.writeFileSync(filePath, expectedContent, 'utf8');
        console.log('Automatically backed up auth token to tokenBackup.ts');
      }
    } catch (e) {
      console.error('Failed to back up auth token:', e);
    }
  }
  next();
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Cache for validated words to avoid redundant API calls
const wordCache: { [key: string]: { valid: boolean; definition: string } } = {};
let geminiCooldownUntil = 0;

// Heuristic linguistic validation to prevent keyboard smashing or repeated consonants (like "rrrrr")
function validateTurkishLinguistics(word: string, length: number): { valid: boolean; reason: string } {
  const normalized = turkishLower(word)
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');

  // 1. Check for valid characters: Turkish letters only (No q, w, x allowed in Turkish)
  const validCharsRegex = /^[abcdefghijklmnoprstuvyz]+$/;
  if (!validCharsRegex.test(normalized)) {
    return { valid: false, reason: 'Kelime Türkçe alfabesinde bulunmayan geçersiz karakterler barındırıyor (q, w, x vb.).' };
  }

  // 1.1 Keyboard smash detector (reject common sequences of keys adjacent on keyboards)
  const keyboardSmashes = [
    // 4+ character sequences
    'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl',
    'qwer', 'wert', 'erty', 'rtyu', 'tyui', 'yuio', 'uiop',
    'zxcv', 'xcvb', 'cvbn', 'vbnm',
    'asda', 'sada', 'dasa', 'fasa', 'ghjg', 'jklj', 'qweq', 'rewr',
    'fsaf', 'dsaf', 'asdfa', 'sadas', 'fdsaf', 'dsafd', 'fdsfd', 'dfgdf',
    'ghjgh', 'hjklh', 'qwewe', 'werty', 'xcvxc', 'cvbnc', 'vbnmv',
    // Common 3-character keyboard smashes (excluding tasdik with 'asd' and dert/sert/mert/ertesi with 'ert')
    'rty', 'tyu', 'yui', 'uio', 'iop', 'dfg', 'fgh', 'ghj', 'hjk', 'jkl',
    'qwe', 'xcv', 'cvb', 'vbn', 'bnm', 'asf', 'dsf', 'sdf', 'fgj', 'ghk', 'mnb'
  ];
  for (const smash of keyboardSmashes) {
    if (normalized.includes(smash)) {
      return { valid: false, reason: 'Anlamsız klavye tuşlaması veya ardışık harf grubu tespit edildi.' };
    }
  }

  // 1.2 No consecutive duplicate consonants that never exist in Turkish
  const rawLower = turkishLower(word);
  const illegalDoubles = ['ğğ', 'jj', 'hh', 'vv', 'çç', 'şş'];
  for (const illegal of illegalDoubles) {
    if (rawLower.includes(illegal)) {
      return { valid: false, reason: 'Türkçe fonetiğine aykırı ardışık çift sessiz harf kullanımı tespit edildi.' };
    }
  }

  // 2. Must contain at least one vowel
  const vowels = /[aeiou]/g;
  const vowelMatches = normalized.match(vowels);
  if (!vowelMatches || vowelMatches.length === 0) {
    return { valid: false, reason: 'Türkçe kelimelerde en az bir sesli harf bulunmalıdır.' };
  }

  // 3. Repeating characters: No character can be repeated 3 or more times consecutively.
  for (let i = 0; i < normalized.length - 2; i++) {
    if (normalized[i] === normalized[i + 1] && normalized[i] === normalized[i + 2]) {
      return { valid: false, reason: 'Aynı harf ardışık 3 veya daha fazla kez tekrarlanamaz.' };
    }
  }

  // 3.1 Repeating 2-letter pairs: (e.g., "asasas", "dfdfdf", "fgfgfg")
  const repeatedPairsRegex = /(..)\1\1/;
  if (repeatedPairsRegex.test(normalized)) {
    return { valid: false, reason: 'Aynı harf çiftinin tekrarlanmasıyla oluşan anlamsız dizilim tespit edildi.' };
  }

  // 4. Consecutive consonants check (maximum 4 consecutive consonants in very rare whitelisted words like "ekspres", "elektrik")
  const has4Consonants = /[^aeiou]{4,}/.test(normalized);
  const consonantWhitelist4 = ['ekspres', 'elektrik'];
  if (has4Consonants && !consonantWhitelist4.includes(normalized)) {
    return { valid: false, reason: 'Türkçe hece ve telaffuz yapısına aykırı ardışık sessiz harf dizilimi.' };
  }
  // 5+ consecutive consonants is unconditionally invalid
  if (/[^aeiou]{5,}/.test(normalized)) {
    return { valid: false, reason: 'Türkçe hece yapısına tamamen aykırı aşırı sessiz harf yığılması.' };
  }

  // 4.1 Word starting with 3 consecutive consonants is invalid unless whitelisted (e.g. "stres", "strateji")
  if (/^[^aeiou]{3,}/.test(normalized)) {
    const starting3ConsonantsWhitelist = ['strateji', 'stres', 'strüktür', 'sprey', 'skleroz', 'sfenks'];
    if (!starting3ConsonantsWhitelist.includes(normalized)) {
      return { valid: false, reason: 'Türkçe kelime başlangıç kurallarına aykırı sessiz harf grubu.' };
    }
  }

  // 4.2 No 3 consecutive vowels (no Turkish word has 3 consecutive vowels like "aia", "uoa", except very rare exclamations)
  if (/[aeiou]{3,}/.test(normalized)) {
    return { valid: false, reason: 'Türkçe fonetiğine aykırı ardışık sesli harf dizilimi.' };
  }

  // 5. Letter diversity ratio checks
  const uniqueChars = new Set(normalized.split(''));
  if (length === 4 && uniqueChars.size < 2) {
    return { valid: false, reason: '4 harfli bir kelimede en az 2 farklı harf bulunmalıdır.' };
  }
  if (length === 5 && uniqueChars.size < 3) {
    return { valid: false, reason: '5 harfli bir kelimede en az 3 farklı harf bulunmalıdır.' };
  }
  if (length === 6 && uniqueChars.size < 3) {
    return { valid: false, reason: '6 harfli bir kelimede en az 3 farklı harf bulunmalıdır.' };
  }
  if (length >= 7 && uniqueChars.size < 4) {
    return { valid: false, reason: '7 veya daha fazla harfli bir kelimede en az 4 farklı harf bulunmalıdır.' };
  }

  // 6. Minimum vowel count: For words of length >= 7, there must be at least 2 vowels (e.g. "ekspres" has 2, "sürpriz" has 2).
  const vowelCount = vowelMatches.length;
  if (length >= 7 && vowelCount < 2) {
    return { valid: false, reason: 'Uzun Türkçe kelimelerde en az 2 sesli harf bulunmalıdır.' };
  }

  return { valid: true, reason: '' };
}



// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint to generate a target word
app.post('/api/random-word', (req, res) => {
  const { length } = req.body;
  const wordLength = Number(length) || 5;
  const word = getRandomWord(wordLength);
  res.json({ word });
});

// GET Daily Puzzle Status
app.get('/api/daily-puzzle', async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const { dateStr } = getDailyWordAndLength();
    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = String(rawIp).replace(/[^a-zA-Z0-9]/g, '_');

    // Look up device-based document
    const deviceDocRef = doc(db, 'daily_puzzles', `${dateStr}_${deviceId}`);
    const deviceDocSnap = await getDoc(deviceDocRef);

    if (deviceDocSnap.exists()) {
      return res.json(deviceDocSnap.data());
    }

    // Fallback: look up IP-based document
    if (ip) {
      const ipDocRef = doc(db, 'daily_puzzles', `${dateStr}_${ip}`);
      const ipDocSnap = await getDoc(ipDocRef);
      if (ipDocSnap.exists()) {
        return res.json(ipDocSnap.data());
      }
    }

    // No existing attempts found, return clean initial state
    return res.json({
      dateStr,
      attempts: [],
      solved: false,
      failed: false
    });
  } catch (error) {
    console.error('Error fetching daily puzzle:', error);
    res.status(500).json({ error: 'Günlük bulmaca verisi alınamadı.' });
  }
});

// POST Save Daily Puzzle Progress
app.post('/api/daily-puzzle', async (req, res) => {
  try {
    const { deviceId, attempts, solved, failed } = req.body;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const { dateStr } = getDailyWordAndLength();
    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = String(rawIp).replace(/[^a-zA-Z0-9]/g, '_');

    const deviceDocRef = doc(db, 'daily_puzzles', `${dateStr}_${deviceId}`);
    
    // Check if a completed document already exists to prevent resets / replay hacks
    const existingSnap = await getDoc(deviceDocRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData.solved || existingData.failed || (existingData.attempts && existingData.attempts.length >= 6)) {
        return res.status(403).json({ error: 'Oyun tamamlandı, tekrar deneme yapılamaz.', dailyState: existingData });
      }
    }

    const dailyState = {
      dateStr,
      deviceId,
      ipAddress: String(rawIp),
      attempts: attempts || [],
      solved: !!solved,
      failed: !!failed,
      updatedAt: new Date().toISOString()
    };

    // Save to deviceId doc
    await setDoc(deviceDocRef, dailyState);

    // Save to IP doc for cheat/exploit protection
    if (ip) {
      const ipDocRef = doc(db, 'daily_puzzles', `${dateStr}_${ip}`);
      await setDoc(ipDocRef, dailyState);
    }

    res.json({ success: true, dailyState });
  } catch (error) {
    console.error('Error saving daily puzzle progress:', error);
    res.status(500).json({ error: 'Günlük bulmaca ilerlemesi kaydedilemedi.' });
  }
});

// Helper to extract a clean definition from Wikisözlük (Wiktionary) wikitext content
function extractWiktionaryDefinition(content: string, word: string): string | null {
  if (!content) return null;
  
  // Find the Turkish section index
  const trIndex = content.indexOf('== Türkçe ==') !== -1 ? content.indexOf('== Türkçe ==') : content.indexOf('==Türkçe==');
  let turkishContent = content;
  if (trIndex !== -1) {
    turkishContent = content.substring(trIndex);
    // Limit content to only the Turkish section, in case there are subsequent language sections
    const nextLangIndex = turkishContent.indexOf('==', 12);
    if (nextLangIndex !== -1) {
      turkishContent = turkishContent.substring(0, nextLangIndex);
    }
  }

  const lines = turkishContent.split('\n');
  for (const line of lines) {
    // Look for lines starting with '#' (definition lines), but skip sub-definitions (##), examples/notes (#* or #:)
    if (line.startsWith('#') && !line.startsWith('##') && !line.startsWith('#*') && !line.startsWith('#:') && line.length > 4) {
      let cleanLine = line.substring(1).trim();
      
      // Remove mediawiki links: [[meyve|meyveler]] -> meyveler, [[elma]] -> elma
      cleanLine = cleanLine.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, p1, p2) => p2 || p1);
      
      // Remove templates: {{belediye|Türkiye}} -> "", {{Sözlük|Türkçe}} -> ""
      cleanLine = cleanLine.replace(/\{\{[^}]+\}\}/g, '');
      
      // Remove triple/double quotes for bold/italic formatting
      cleanLine = cleanLine.replace(/'''?/g, '');
      
      cleanLine = cleanLine.trim();
      if (cleanLine.length > 2) {
        return cleanLine;
      }
    }
  }
  return null;
}

// Core hybrid validation function
async function validateWordHybrid(word: string, skipLocalCheck = false): Promise<{ valid: boolean; definition: string }> {
  try {
    // 1. Türkçe kurallarına göre küçük harfe çevir
    const lowerWord = word.trim().toLocaleLowerCase('tr-TR');
    console.log(`[Hybrid Validation] Validating word: "${word}" (normalized lower: "${lowerWord}")`);

    // 2. İlk olarak bu kelimeyi bizim yerel kelime listemizde ara. Eğer yerel listede varsa doğrudan geçerli say ve internete hiç sorma.
    if (!skipLocalCheck) {
      const inCurated = isWordInCuratedList(lowerWord, lowerWord.length);
      if (inCurated) {
        console.log(`[Hybrid Validation Result] Word "${lowerWord}" found in local list. Directly VALID.`);
        return {
          valid: true,
          definition: 'Yerel kelime listesinde kayıtlı geçerli bir Türkçe sözcüktür.'
        };
      }
    }

    // 3. Eğer yerel listede yoksa, doğrudan Axios kullanarak Wikisözlük API'sine sorgu gönder.
    // Sorgu adresi: https://tr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=kelime
    const url = `https://tr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=${encodeURIComponent(lowerWord)}`;
    
    console.log(`[Wiktionary Query] Sending request for: "${lowerWord}"`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });

    const data = response.data;
    if (!data || !data.query || !data.query.pages) {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is INVALID (No query or pages found in response)`);
      return {
        valid: false,
        definition: 'Kelime Wikisözlük\'te bulunamadı.'
      };
    }

    const pages = data.query.pages;
    const pageKeys = Object.keys(pages);
    if (pageKeys.length === 0 || pageKeys[0] === '-1') {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is INVALID (Page not found / missing)`);
      return {
        valid: false,
        definition: 'Kelime Wikisözlük\'te bulunamadı.'
      };
    }

    const page = pages[pageKeys[0]];
    if (page.missing !== undefined) {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is INVALID (Page has missing property)`);
      return {
        valid: false,
        definition: 'Kelime Wikisözlük\'te bulunamadı.'
      };
    }

    if (!page.revisions || !Array.isArray(page.revisions) || page.revisions.length === 0) {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is INVALID (No revisions found)`);
      return {
        valid: false,
        definition: 'Kelime Wikisözlük\'te bulunamadı.'
      };
    }

    const content = page.revisions[0]['*'] || '';
    
    // Check if Turkish header or template exists in the content:
    // "Gelen içerik içinde dil|tr veya Türkçe kelimeleri geçiyorsa kelimeyi doğrudan geçerli say."
    const hasTurkishHeader = content.includes('dil|tr') || content.includes('Türkçe') || /==\s*Türkçe\s*==/.test(content);
    
    if (hasTurkishHeader) {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is VALID (Found Turkish section)`);
      
      // Try to extract a clean definition from the wikitext content for display
      const definition = extractWiktionaryDefinition(content, lowerWord) || 'Wikisözlük\'te kayıtlı geçerli bir Türkçe sözcüktür.';

      return {
        valid: true,
        definition
      };
    } else {
      console.log(`[Wiktionary Result] Word "${lowerWord}" is INVALID (No Turkish section found in contents)`);
      return {
        valid: false,
        definition: 'Kelime Wikisözlük\'te mevcut fakat Türkçe dilinde değil.'
      };
    }

  } catch (err: any) {
    console.error(`[Hybrid Validation Error] Failed for "${word}":`, err?.message || err);
    return {
      valid: false,
      definition: 'Sözlük doğrulama servisine şu anda erişilemiyor.'
    };
  }
}

// Endpoint to validate if a word is valid
app.post('/api/validate-word', async (req, res) => {
  try {
    const { word, length } = req.body;
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Word is required' });
    }

    // 1. Türkçe kurallarına göre küçük harfe çevir
    const lowerWord = word.trim().toLocaleLowerCase('tr-TR');
    const normalized = turkishUpper(word.trim());
    const wordLength = Number(length) || normalized.length;

    if (normalized.length !== wordLength) {
      return res.json({ valid: false, reason: 'Harf sayısı uyuşmuyor' });
    }

    // 1.1 Heuristic linguistic validation (blocks keyboard smash, repetitive letters like rrrrr before cache or API calls)
    const linguisticCheck = validateTurkishLinguistics(normalized, wordLength);
    if (!linguisticCheck.valid) {
      return res.json({
        valid: false,
        definition: linguisticCheck.reason
      });
    }

    // 2. İlk olarak bu kelimeyi bizim yerel kelime listemizde ara. Eğer yerel listede varsa doğrudan geçerli say ve internete hiç sorma.
    const inCurated = isWordInCuratedList(lowerWord, wordLength);
    if (inCurated) {
      console.log(`[Hybrid Validation - Route] Word "${lowerWord}" found in local list. Directly VALID.`);
      return res.json({
        valid: true,
        definition: 'Yerel kelime listesinde kayıtlı geçerli bir Türkçe sözcüktür.'
      });
    }

    // 3. Eğer yerel listede yoksa, Wikisözlük öncesi Cache / Firestore kontrol et
    const cacheKey = `${normalized}_${wordLength}`;
    if (wordCache[cacheKey]) {
      return res.json(wordCache[cacheKey]);
    }

    // Check Firestore Database
    try {
      const wordDocRef = doc(db, 'dictionary', normalized);
      const wordSnap = await Promise.race([
        getDoc(wordDocRef),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore read timeout')), 2000))
      ]);
      if (wordSnap && wordSnap.exists()) {
        const dbData = wordSnap.data();
        const dbResult = {
          valid: dbData.valid,
          definition: dbData.definition || ''
        };
        wordCache[cacheKey] = dbResult;
        console.log(`[Database Hit] Word "${normalized}" found in database:`, dbResult);
        return res.json(dbResult);
      }
    } catch (dbErr) {
      console.warn('Firestore database read failed/timed out:', dbErr);
    }

    // 4. Wikisözlük (Wiktionary) sorgusu
    const validationResult = await validateWordHybrid(normalized);
    wordCache[cacheKey] = validationResult;

    // Automatically save to database (non-blocking in background)
    try {
      const wordDocRef = doc(db, 'dictionary', normalized);
      setDoc(wordDocRef, {
        word: normalized,
        valid: validationResult.valid,
        definition: validationResult.definition,
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(saveErr => {
        console.error('Failed to save word to Firestore in background:', saveErr);
      });
      console.log(`[Database Save] Queued word "${normalized}" (valid: ${validationResult.valid}) to save in background.`);
    } catch (saveErr) {
      console.error('Failed to save word to Firestore:', saveErr);
    }

    return res.json(validationResult);
  } catch (error: any) {
    console.error('[Word Validation ERROR]:', error?.message || error);
    res.json({
      valid: false,
      definition: 'Sözlük doğrulanamadı ve kelime listenizde bulunamadı!'
    });
  }
});

// Helper function to fetch word definition using TDK API (sozluk.gov.tr)
async function getDefinitionFromTDK(word: string): Promise<string | null> {
  try {
    const cleanWord = word.trim().toLocaleLowerCase('tr-TR');
    const url = `https://sozluk.gov.tr/goster?kemles=${encodeURIComponent(cleanWord)}`;
    console.log(`[TDK Definition] Fetching definition for: "${cleanWord}"`);
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const entry = response.data[0];
      if (entry.anlamlarListe && Array.isArray(entry.anlamlarListe) && entry.anlamlarListe.length > 0) {
        const anlam = entry.anlamlarListe[0].anlam;
        if (anlam) {
          const cleanAnlam = anlam.trim();
          if (cleanAnlam.length > 1) {
            console.log(`[TDK Definition Success] Found meaning for "${word}": ${cleanAnlam}`);
            return cleanAnlam;
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[TDK Definition Error] Failed to get definition for "${word}" from TDK:`, err?.message || err);
  }
  return null;
}

// Helper function to fetch word definition using Gemini API
async function getDefinitionFromGemini(word: string): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Gemini Definition] GEMINI_API_KEY is not defined, skipping.');
    return null;
  }
  try {
    console.log(`[Gemini Definition] Fetching definition for: "${word}"`);
    
    const prompt = `Sen Türkçe dilinde bir kelime oyunu sözlük asistanısın. 
"${word}" Türkçe kelimesinin kısa, net ve tam sözlük tanımını (anlamını) ver.
Sadece kelimenin anlamını içeren tek bir açıklayıcı cümle veya kısa bir cümle grubu dön. 
Örnek cümle ekleme, başka ek açıklama yapma. Yanıt doğrudan kelimenin tanımı olsun.
Eğer kelime argo veya küfür değilse, kesinlikle anlamını açıkla. 
Örnek format: "Bir yerin veya bir şeyin sınırları dışında kalan kısım, dışarı."`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 100
      }
    });

    if (response && response.text) {
      const def = response.text.trim().replace(/^"|"$/g, '');
      if (def && def.length > 3 && !def.toLowerCase().includes('üzgünüm') && !def.toLowerCase().includes('hata')) {
        return def;
      }
    }
  } catch (err: any) {
    console.error(`[Gemini Definition Error] Failed to generate definition for "${word}":`, err?.message || err);
  }
  return null;
}

// Endpoint to fetch direct definition of any target word
app.post('/api/get-definition', async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Word is required' });
    }

    const normalized = turkishUpper(word.trim());
    const lowerWord = word.trim().toLocaleLowerCase('tr-TR');
    const cacheKey = `definition_${normalized}`;

    // Check cache (ignore if cached definition is a generic placeholder or fallback)
    if (wordCache[cacheKey]) {
      const cachedDef = wordCache[cacheKey].definition;
      const isGeneric = !cachedDef ||
                        cachedDef === 'Yerel kelime listesinde kayıtlı geçerli bir Türkçe sözcüktür.' ||
                        cachedDef === 'Wikisözlük\'te kayıtlı geçerli bir Türkçe sözcüktür.' ||
                        cachedDef.includes('yüklenemedi') ||
                        cachedDef.includes('erişilemiyor') ||
                        cachedDef.includes('oyunda yer alan') ||
                        cachedDef.includes('kelime haznenizde yer alan') ||
                        cachedDef.includes('resmi sözlük tanımına şu an ulaşılamıyor');
      if (!isGeneric) {
        return res.json(wordCache[cacheKey]);
      }
    }

    // Check Firestore (ignore if database definition is a generic placeholder or fallback)
    try {
      const wordDocRef = doc(db, 'dictionary', normalized);
      const wordSnap = await Promise.race([
        getDoc(wordDocRef),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore read timeout')), 4000))
      ]);
      if (wordSnap && wordSnap.exists()) {
        const dbData = wordSnap.data();
        if (dbData.definition) {
          const dbDef = dbData.definition;
          const isGeneric = !dbDef ||
                            dbDef === 'Yerel kelime listesinde kayıtlı geçerli bir Türkçe sözcüktür.' ||
                            dbDef === 'Wikisözlük\'te kayıtlı geçerli bir Türkçe sözcüktür.' ||
                            dbDef.includes('yüklenemedi') ||
                            dbDef.includes('erişilemiyor') ||
                            dbDef.includes('oyunda yer alan') ||
                            dbDef.includes('kelime haznenizde yer alan') ||
                            dbDef.includes('resmi sözlük tanımına şu an ulaşılamıyor');
          
          if (!isGeneric) {
            const dbResult = { valid: true, definition: dbDef };
            wordCache[cacheKey] = dbResult;
            console.log(`[Database Hit - Definition] Word "${normalized}" found in database:`, dbResult);
            return res.json(dbResult);
          }
        }
      }
    } catch (dbErr) {
      console.warn('Firestore database read for definition failed/timed out:', dbErr);
    }

    // 1. Try Gemini first if API key is present for fast, accurate dictionary definitions
    if (process.env.GEMINI_API_KEY) {
      console.log(`[Get Definition] Attempting fast Gemini lookup for: "${normalized}"`);
      const geminiDef = await getDefinitionFromGemini(normalized);
      if (geminiDef) {
        const result = { valid: true, definition: geminiDef };
        wordCache[cacheKey] = result;
        
        // Save to Firestore background
        try {
          const wordDocRef = doc(db, 'dictionary', normalized);
          setDoc(wordDocRef, { word: normalized, valid: true, definition: geminiDef, createdAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        } catch (e) {}

        return res.json(result);
      }
    }

    // 2. Fetch definition from Wiktionary/Local validation source as fallback
    console.log(`[Get Definition] Fetching definition from Wiktionary/Local for: "${normalized}"`);
    const validationResult = await validateWordHybrid(normalized, true);
    let definition = validationResult.definition;

    let isGeneric = !definition ||
                    definition === 'Yerel kelime listesinde kayıtlı geçerli bir Türkçe sözcüktür.' ||
                    definition === 'Wikisözlük\'te kayıtlı geçerli bir Türkçe sözcüktür.' ||
                    definition.includes('doğrulandı') ||
                    definition.includes('bulunamadı') ||
                    definition.includes('yüklenemedi') ||
                    definition.includes('erişilemiyor') ||
                    definition.includes('Hata');

    if (isGeneric || !definition) {
      definition = `${normalized} - Kelime Oyunu sözlüğünde yer alan geçerli bir Türkçe sözcüktür.`;
    }

    if (!definition || definition.length < 3) {
      definition = `${normalized} - Kelime Oyunu sözlüğünde yer alan geçerli bir Türkçe sözcüktür.`;
    }

    const finalResult = {
      valid: true,
      definition
    };

    wordCache[cacheKey] = finalResult;

    // Only save to Firestore if it's not the failure fallback
    if (definition !== 'Bu kelimenin resmi sözlük tanımına şu an ulaşılamıyor.') {
      // Save definition back to Firestore dictionary (non-blocking in background)
      try {
        const wordDocRef = doc(db, 'dictionary', normalized);
        setDoc(wordDocRef, {
          word: normalized,
          valid: true,
          definition: finalResult.definition,
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(saveErr => {
          console.error('Failed to save word definition to Firestore in background:', saveErr);
        });
        console.log(`[Database Save - Definition] Queued definition for "${normalized}" to save in background.`);
      } catch (saveErr) {
        console.error('Failed to save word definition to Firestore:', saveErr);
      }
    }

    return res.json(finalResult);
  } catch (error: any) {
    console.error('[Get Definition ERROR]:', error);
    res.json({
      valid: true,
      definition: 'Bu kelimenin resmi sözlük tanımına şu an ulaşılamıyor.'
    });
  }
});

// Endpoint for AI chat/assistant proxy using Gemini
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Call the user's live Render server instead of local Gemini API
    const response = await fetch('https://kelime-sava.onrender.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`Render canlı sunucu bağlantısı başarısız oldu: ${response.status}`);
    }

    const data = (await response.json()) as { response?: string; error?: string };
    
    if (data.error) {
      return res.status(500).json({ error: data.error });
    }

    res.json({ response: data.response || '' });
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

// Endpoint for secure user support messages / contact form (Google Play Compliance)
app.post('/api/support', async (req, res) => {
  try {
    const { email, category, message, username, userId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Mesaj alanı zorunludur.' });
    }

    const ticketId = 'ticket_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const docRef = doc(db, 'support_messages', ticketId);

    const supportPayload = {
      id: ticketId,
      email: email || 'anonymous',
      category: category || 'general',
      message: message,
      username: username || 'Guest',
      userId: userId || 'unknown',
      createdAt: new Date().toISOString(),
      status: 'new'
    };

    await setDoc(docRef, supportPayload);
    console.log(`[Support Message Saved] ID: ${ticketId}, Category: ${category}, Email: ${email}`);

    res.json({ success: true, ticketId });
  } catch (error: any) {
    console.error('Support API Error:', error);
    res.status(500).json({ error: 'Mesaj iletilemedi. Sunucu hatası oluştu.' });
  }
});

// Save FCM Token Endpoint
app.post('/api/save-fcm-token', async (req, res) => {
  try {
    const { userId, fcmToken } = req.body || {};
    if (userId && fcmToken) {
      await setDoc(doc(db, 'users', userId), { fcmToken, fcmTokenUpdatedAt: new Date().toISOString() }, { merge: true });
      console.log(`[FCM API] Saved device token for user ${userId}`);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[FCM API] Error saving token:', error);
    res.status(500).json({ error: error?.message });
  }
});

// Trigger FCM High-Priority Match End Push Notification Endpoint
app.post('/api/trigger-match-end-push', async (req, res) => {
  try {
    const { matchId, winnerId, loserId, winnerName, loserName, winReason, correctWord } = req.body || {};
    if (!matchId) return res.status(400).json({ error: 'matchId is required' });

    void sendFcmHighPriorityMatchEndNotification({
      matchId,
      winnerId: winnerId || '',
      loserId,
      winnerName,
      loserName,
      winReason,
      correctWord
    }).catch(() => {});

    res.json({ success: true, message: 'FCM High Priority Push triggered successfully' });
  } catch (error: any) {
    console.error('[FCM API] Error triggering match end push:', error);
    res.status(500).json({ error: error?.message });
  }
});

// FCM High Priority Push Notification Helper for Match End Events
async function sendFcmHighPriorityMatchEndNotification(opts: {
  matchId: string;
  winnerId: string;
  loserId?: string;
  winnerName?: string;
  loserName?: string;
  winReason?: string;
  correctWord?: string;
}) {
  const { matchId, winnerId, loserId, winnerName, loserName, winReason = 'correct_word', correctWord = '' } = opts;
  console.log(`[FCM High Priority Push] Dispatching match_end notification for match: ${matchId}`);

  try {
    const targetUserIds = [winnerId, loserId].filter(Boolean) as string[];
    const fcmTokens: string[] = [];

    for (const uId of targetUserIds) {
      if (!uId || uId === 'draw') continue;
      try {
        const userSnap = await getDoc(doc(db, 'users', uId));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData?.fcmToken) {
            fcmTokens.push(uData.fcmToken);
          }
        }
      } catch (err) {
        console.warn(`[FCM Push] Failed to fetch token for user ${uId}:`, err);
      }
    }

    if (fcmTokens.length === 0) {
      console.log(`[FCM Push] No registered FCM device tokens found for match ${matchId}.`);
      return;
    }

    let fcmApiKey = process.env.FIREBASE_API_KEY || '';
    if (!fcmApiKey) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          fcmApiKey = parsed.apiKey || '';
        }
      } catch (e) {}
    }

    for (const token of fcmTokens) {
      const payload = {
        to: token,
        priority: 'high',
        content_available: true,
        data: {
          type: 'match_end',
          matchId,
          winner: winnerId,
          winnerId,
          loser: loserId || '',
          winnerName: winnerName || '',
          loserName: loserName || '',
          winReason,
          correctWord,
          timestamp: String(Date.now()),
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        notification: {
          title: 'Düello Bitti! ⚡',
          body: winnerId ? 'Düello sonucu belirlendi!' : 'Canlı düello sona erdi.',
          sound: 'default',
          priority: 'high'
        }
      };

      try {
        await axios.post('https://fcm.googleapis.com/fcm/send', payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${fcmApiKey}`
          },
          timeout: 4000
        });
        console.log(`[FCM Push] High Priority FCM message sent successfully to token ${token.substring(0, 15)}...`);
      } catch (fcmErr: any) {
        console.warn(`[FCM Push] FCM legacy dispatch result for token ${token.substring(0, 15)}...:`, fcmErr?.message || fcmErr);
      }
    }
  } catch (globalFcmErr) {
    console.error('[FCM Push] Unexpected error during FCM push trigger:', globalFcmErr);
  }
}

// Dedicated helper for Wordle guess evaluation in Turkish
function evaluateTurkishGuess(guessWord: string, targetWord: string): Array<'correct' | 'present' | 'absent'> {
  const guess = turkishUpper(guessWord).trim().split('');
  const target = turkishUpper(targetWord).trim().split('');
  const result: Array<'correct' | 'present' | 'absent'> = new Array(guess.length).fill('absent');
  const targetUsed = new Array(target.length).fill(false);

  // 1st pass: exact matches
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      targetUsed[i] = true;
    }
  }

  // 2nd pass: present matches
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < target.length; j++) {
      if (!targetUsed[j] && guess[i] === target[j]) {
        result[i] = 'present';
        targetUsed[j] = true;
        break;
      }
    }
  }

  return result;
}

async function startServer() {
  const server = http.createServer(app);

  // Local WebSocket server on /ws path
  const wss = new WebSocketServer({ server, path: '/ws' });
  const connectedClients = new Map<WebSocket, any>();
  const matchmakingQueue: { ws: WebSocket; player: any; wordLength: number }[] = [];

  interface MatchPlayer {
    id: string;
    name: string;
    avatarUrl: string;
    ws: WebSocket;
    connected: boolean;
    attempts: Array<{ word: string; result: Array<'correct' | 'present' | 'absent'> }>;
  }

  interface ActiveDuelMatch {
    matchId: string;
    wordLength: number;
    correctWord: string;
    gameState: 'WAITING' | 'READY' | 'PLAYING' | 'FINISHED' | 'RESULT';
    player1: MatchPlayer;
    player2: MatchPlayer;
    winner: string | null;
    loser: string | null;
    winReason: 'correct_word' | 'opponent_left' | 'max_attempts' | null;
    createdAt: number;
    startedAt?: number;
    finishedAt?: number;
  }

  const activeDuelMatches = new Map<string, ActiveDuelMatch>();
  const socketToMatchIdMap = new Map<WebSocket, string>();

  // GET /api/match-status for live real-time game state synchronization across physical mobile APKs
  app.get('/api/match-status', async (req, res) => {
    try {
      const matchId = String(req.query.matchId || '').trim();
      if (!matchId) return res.status(400).json({ error: 'matchId is required' });

      // 1. Check in-memory active duel match first
      const match = activeDuelMatches.get(matchId);
      if (match) {
        const isFinished = match.gameState === 'FINISHED';
        return res.json({
          id: match.matchId,
          matchId: match.matchId,
          gameState: match.gameState,
          status: isFinished ? 'finished' : 'playing',
          isGameOver: isFinished,
          gameOver: isFinished,
          winner: match.winner || null,
          winnerId: match.winner || null,
          loser: match.loser || null,
          winReason: match.winReason || null,
          correctWord: match.correctWord,
          targetWord: match.correctWord,
          player1: {
            id: match.player1.id,
            name: match.player1.name,
            avatarUrl: match.player1.avatarUrl,
            attempts: match.player1.attempts
          },
          player2: {
            id: match.player2.id,
            name: match.player2.name,
            avatarUrl: match.player2.avatarUrl,
            attempts: match.player2.attempts
          },
          players: {
            [match.player1.id]: {
              id: match.player1.id,
              name: match.player1.name,
              avatarUrl: match.player1.avatarUrl,
              attempts: match.player1.attempts,
              attemptsCount: match.player1.attempts.length,
              completed: isFinished || match.player1.attempts.length >= 6,
              won: match.winner === match.player1.id
            },
            [match.player2.id]: {
              id: match.player2.id,
              name: match.player2.name,
              avatarUrl: match.player2.avatarUrl,
              attempts: match.player2.attempts,
              attemptsCount: match.player2.attempts.length,
              completed: isFinished || match.player2.attempts.length >= 6,
              won: match.winner === match.player2.id
            }
          }
        });
      }

      // 2. Fallback to Firestore database
      const matchSnap = await getDoc(doc(db, 'matches', matchId));
      if (matchSnap.exists()) {
        return res.json(matchSnap.data());
      }
      const roomSnap = await getDoc(doc(db, 'rooms', matchId));
      if (roomSnap.exists()) {
        return res.json(roomSnap.data());
      }

      return res.status(404).json({ error: 'Match not found' });
    } catch (err) {
      console.error('Error fetching match status:', err);
      return res.status(500).json({ error: 'Failed to fetch match status' });
    }
  });

  // Dual HTTP REST guess submission endpoint for hybrid/mobile APK compatibility
  app.post('/api/submit-guess', async (req, res) => {
    try {
      const { matchId, playerId, word, guess } = req.body || {};
      const targetMatchId = String(matchId || '').trim();
      const targetPlayerId = String(playerId || '').trim();
      const guessWord = turkishUpper(String(word || guess || '').trim());

      if (!targetMatchId || !targetPlayerId || !guessWord) {
        return res.status(400).json({ error: 'matchId, playerId, and word are required' });
      }

      const match = activeDuelMatches.get(targetMatchId);
      let correctWord = match?.correctWord || '';

      if (!correctWord) {
        const matchSnap = await getDoc(doc(db, 'matches', targetMatchId));
        if (matchSnap.exists()) {
          const d = matchSnap.data();
          correctWord = d.targetWord || d.correctWord || '';
        }
      }

      if (!correctWord) {
        return res.status(404).json({ error: 'Match or target word not found' });
      }

      const feedback = evaluateTurkishGuess(guessWord, correctWord);
      const isCorrect = feedback.every(f => f === 'correct');

      if (match) {
        const isP1 = match.player1.id === targetPlayerId;
        const sender = isP1 ? match.player1 : match.player2;
        const opponent = isP1 ? match.player2 : match.player1;

        sender.attempts.push({ word: guessWord, result: feedback });

        if (isCorrect) {
          match.gameState = 'FINISHED';
          match.winner = sender.id;
          match.loser = opponent.id;
          match.winReason = 'correct_word';
          match.finishedAt = Date.now();

          const winFinishData = {
            gameOver: true,
            isGameOver: true,
            won: true,
            status: 'finished',
            gameState: 'finished',
            winner: sender.id,
            winnerId: sender.id,
            finishedBy: sender.id,
            loser: opponent.id,
            winReason: 'correct_word',
            updatedAt: new Date().toISOString()
          };
          setDoc(doc(db, 'matches', targetMatchId), winFinishData, { merge: true }).catch(() => {});
          setDoc(doc(db, 'rooms', targetMatchId), winFinishData, { merge: true }).catch(() => {});

          sendWs(sender.ws, { type: 'guess_result', matchId: targetMatchId, word: guessWord, feedback, isCorrect: true, isGameOver: true });
          const endPayload = {
            type: 'match_end',
            matchId: targetMatchId,
            gameState: 'FINISHED',
            winner: sender.id,
            loser: opponent.id,
            winnerName: sender.name,
            loserName: opponent.name,
            winReason: 'correct_word',
            correctWord,
            attempts: { [match.player1.id]: match.player1.attempts, [match.player2.id]: match.player2.attempts }
          };
          sendWs(match.player1.ws, endPayload);
          sendWs(match.player2.ws, endPayload);
        } else {
          const attemptUpdate = {
            [`players.${sender.id}.attempts`]: sender.attempts,
            [`players.${sender.id}.attemptsCount`]: sender.attempts.length,
            [`players.${sender.id}.completed`]: sender.attempts.length >= 6,
            updatedAt: new Date().toISOString()
          };
          setDoc(doc(db, 'matches', targetMatchId), attemptUpdate, { merge: true }).catch(() => {});
          setDoc(doc(db, 'rooms', targetMatchId), attemptUpdate, { merge: true }).catch(() => {});

          sendWs(sender.ws, { type: 'guess_result', matchId: targetMatchId, word: guessWord, feedback, isCorrect: false, isGameOver: false });
          sendWs(opponent.ws, { type: 'opponent_attempt', matchId: targetMatchId, opponentId: sender.id, attemptCount: sender.attempts.length });
        }
      } else {
        const attemptUpdate = {
          [`players.${targetPlayerId}.attempts`]: [{ word: guessWord, feedback }],
          updatedAt: new Date().toISOString()
        };
        if (isCorrect) {
          Object.assign(attemptUpdate, {
            gameOver: true,
            isGameOver: true,
            status: 'finished',
            gameState: 'finished',
            winner: targetPlayerId,
            winnerId: targetPlayerId,
            finishedBy: targetPlayerId,
            winReason: 'correct_word',
            [`players.${targetPlayerId}.won`]: true,
            [`players.${targetPlayerId}.completed`]: true
          });
        }
        setDoc(doc(db, 'matches', targetMatchId), attemptUpdate, { merge: true }).catch(() => {});
        setDoc(doc(db, 'rooms', targetMatchId), attemptUpdate, { merge: true }).catch(() => {});
      }

      return res.json({ success: true, feedback, isCorrect });
    } catch (err) {
      console.error('Error submitting guess via REST:', err);
      return res.status(500).json({ error: 'Failed to submit guess' });
    }
  });

  function sendWs(ws: WebSocket | null | undefined, dataObj: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(dataObj));
      } catch (e) {
        console.error('[WebSocket Server] Send Error:', e);
      }
    }
  }

  function handlePlayerDisconnect(ws: WebSocket) {
    connectedClients.delete(ws);
    // Remove from queue if present
    const qIdx = matchmakingQueue.findIndex(q => q.ws === ws);
    if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);

    // Check if player was in an active match
    const matchId = socketToMatchIdMap.get(ws);
    if (!matchId) return;

    const match = activeDuelMatches.get(matchId);
    socketToMatchIdMap.delete(ws);

    if (match && (match.gameState === 'PLAYING' || match.gameState === 'READY' || match.gameState === 'WAITING')) {
      // Server Authoritative Disconnect Victory!
      match.gameState = 'FINISHED';
      const isP1Left = match.player1.ws === ws;
      const leftPlayer = isP1Left ? match.player1 : match.player2;
      const remainingPlayer = isP1Left ? match.player2 : match.player1;

      match.winner = remainingPlayer.id;
      match.loser = leftPlayer.id;
      match.winReason = 'opponent_left';
      match.finishedAt = Date.now();

      console.log(`[Duel Server] Match ${matchId}: Player ${leftPlayer.name} disconnected. Player ${remainingPlayer.name} wins by forfeit!`);

      const finishData = {
        gameOver: true,
        isGameOver: true,
        won: true,
        status: 'finished',
        gameState: 'finished',
        winner: remainingPlayer.id,
        winnerId: remainingPlayer.id,
        finishedBy: remainingPlayer.id,
        loser: leftPlayer.id,
        winReason: 'opponent_left',
        updatedAt: new Date().toISOString()
      };
      setDoc(doc(db, 'matches', match.matchId), finishData, { merge: true }).catch(err => {
        console.error('[Duel Server] Error updating Firestore match doc on disconnect:', err);
      });
      setDoc(doc(db, 'rooms', match.matchId), finishData, { merge: true }).catch(err => {
        console.error('[Duel Server] Error updating Firestore room doc on disconnect:', err);
      });

      // Notify remaining player
      sendWs(remainingPlayer.ws, {
        type: 'match_end',
        matchId: match.matchId,
        gameState: 'FINISHED',
        winner: remainingPlayer.id,
        loser: leftPlayer.id,
        winnerName: remainingPlayer.name,
        loserName: leftPlayer.name,
        winReason: 'opponent_left',
        correctWord: match.correctWord,
        attempts: {
          [match.player1.id]: match.player1.attempts,
          [match.player2.id]: match.player2.attempts
        }
      });

      // Trigger FCM High Priority Push Notification for background/sleeping devices
      void sendFcmHighPriorityMatchEndNotification({
        matchId: match.matchId,
        winnerId: remainingPlayer.id,
        loserId: leftPlayer.id,
        winnerName: remainingPlayer.name,
        loserName: leftPlayer.name,
        winReason: 'opponent_left',
        correctWord: match.correctWord
      }).catch(() => {});

      socketToMatchIdMap.delete(remainingPlayer.ws);
      setTimeout(() => activeDuelMatches.delete(matchId), 15000);
    }
  }

  wss.on('connection', (ws) => {
    console.log('[WebSocket Server] New client connected');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'join' || data.type === 'identify') {
          const playerId = data.id || data.userId || data.playerId || data.uid || 'guest_' + Math.random().toString(36).substring(2, 7);
          const playerName = data.name || data.username || data.displayName || 'Oyuncu';
          const clientInfo = {
            id: playerId,
            name: playerName,
            avatarUrl: data.avatarUrl || ''
          };
          connectedClients.set(ws, clientInfo);
          sendWs(ws, { type: 'lobby', players: Array.from(connectedClients.values()) });
        } else if (data.type === 'ping') {
          sendWs(ws, { type: 'pong' });
        } else if (data.type === 'join_matchmaking') {
          const existingClient = connectedClients.get(ws);
          const playerId = data.id || data.userId || data.playerId || data.uid || existingClient?.id || 'p_' + Date.now();
          const playerName = data.name || data.username || data.displayName || existingClient?.name || 'Oyuncu';
          const playerAvatar = data.avatarUrl || existingClient?.avatarUrl || '';

          const player = { id: playerId, name: playerName, avatarUrl: playerAvatar };
          connectedClients.set(ws, player);
          const length = Number(data.wordLength) || 5;

          // Remove old queue entries for this ws if any
          const existingQueueIdx = matchmakingQueue.findIndex(q => q.ws === ws);
          if (existingQueueIdx !== -1) matchmakingQueue.splice(existingQueueIdx, 1);

          // Find waiting opponent
          const matchIndex = matchmakingQueue.findIndex(q => q.wordLength === length && q.ws !== ws && q.ws.readyState === WebSocket.OPEN);
          if (matchIndex !== -1) {
            const opponent = matchmakingQueue.splice(matchIndex, 1)[0];
            const matchId = 'match_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const correctWord = turkishUpper(getRandomWord(length, true));

            const matchObj: ActiveDuelMatch = {
              matchId,
              wordLength: length,
              correctWord,
              gameState: 'WAITING',
              player1: {
                id: opponent.player.id,
                name: opponent.player.name,
                avatarUrl: opponent.player.avatarUrl || '',
                ws: opponent.ws,
                connected: true,
                attempts: []
              },
              player2: {
                id: player.id,
                name: player.name,
                avatarUrl: player.avatarUrl || '',
                ws,
                connected: true,
                attempts: []
              },
              winner: null,
              loser: null,
              winReason: null,
              createdAt: Date.now()
            };

            activeDuelMatches.set(matchId, matchObj);
            socketToMatchIdMap.set(opponent.ws, matchId);
            socketToMatchIdMap.set(ws, matchId);

            console.log(`[Duel Server] Created match ${matchId} for ${matchObj.player1.name} vs ${matchObj.player2.name}. Word: ${correctWord}`);

            // Persist match to Firestore database instantly
            const initialFirestoreMatch = {
              id: matchId,
              matchId,
              wordLength: length,
              targetWord: correctWord,
              correctWord,
              gameState: 'PLAYING',
              status: 'playing',
              createdAt: new Date().toISOString(),
              player1: { id: matchObj.player1.id, name: matchObj.player1.name, avatarUrl: matchObj.player1.avatarUrl },
              player2: { id: matchObj.player2.id, name: matchObj.player2.name, avatarUrl: matchObj.player2.avatarUrl },
              players: {
                [matchObj.player1.id]: { id: matchObj.player1.id, name: matchObj.player1.name, avatarUrl: matchObj.player1.avatarUrl, attempts: [], completed: false, won: false },
                [matchObj.player2.id]: { id: matchObj.player2.id, name: matchObj.player2.name, avatarUrl: matchObj.player2.avatarUrl, attempts: [], completed: false, won: false }
              },
              isGameOver: false,
              winner: null
            };
            setDoc(doc(db, 'matches', matchId), initialFirestoreMatch, { merge: true }).catch(err => {
              console.error('[Duel Server] Failed to save match to Firestore:', err);
            });
            setDoc(doc(db, 'rooms', matchId), initialFirestoreMatch, { merge: true }).catch(err => {
              console.error('[Duel Server] Failed to save room to Firestore:', err);
            });

            // State 1: WAITING
            const waitingPayload = {
              type: 'match_joined',
              matchId,
              gameState: 'WAITING',
              wordLength: length,
              correctWord,
              targetWord: correctWord,
              player1: { id: matchObj.player1.id, name: matchObj.player1.name, avatarUrl: matchObj.player1.avatarUrl },
              player2: { id: matchObj.player2.id, name: matchObj.player2.name, avatarUrl: matchObj.player2.avatarUrl }
            };
            sendWs(matchObj.player1.ws, waitingPayload);
            sendWs(matchObj.player2.ws, waitingPayload);

            // State 2: READY
            matchObj.gameState = 'READY';
            const readyPayload = {
              type: 'match_ready',
              matchId,
              gameState: 'READY',
              wordLength: length,
              correctWord,
              targetWord: correctWord,
              player1: { id: matchObj.player1.id, name: matchObj.player1.name, avatarUrl: matchObj.player1.avatarUrl },
              player2: { id: matchObj.player2.id, name: matchObj.player2.name, avatarUrl: matchObj.player2.avatarUrl }
            };
            sendWs(matchObj.player1.ws, readyPayload);
            sendWs(matchObj.player2.ws, readyPayload);

            // State 3: PLAYING (Synchronized start)
            setTimeout(() => {
              if (matchObj.gameState === 'READY') {
                matchObj.gameState = 'PLAYING';
                matchObj.startedAt = Date.now();
                const startPayload = {
                  type: 'match_start',
                  matchId,
                  gameState: 'PLAYING',
                  wordLength: length,
                  correctWord,
                  targetWord: correctWord,
                  player1: { id: matchObj.player1.id, name: matchObj.player1.name, avatarUrl: matchObj.player1.avatarUrl },
                  player2: { id: matchObj.player2.id, name: matchObj.player2.name, avatarUrl: matchObj.player2.avatarUrl }
                };
                sendWs(matchObj.player1.ws, startPayload);
                sendWs(matchObj.player2.ws, startPayload);
                console.log(`[Duel Server] Match ${matchId} is now PLAYING!`);
              }
            }, 600);
          } else {
            matchmakingQueue.push({ ws, player, wordLength: length });
            sendWs(ws, { type: 'queued', wordLength: length });
          }
        } else if (data.type === 'leave_matchmaking') {
          const idx = matchmakingQueue.findIndex(q => q.ws === ws);
          if (idx !== -1) matchmakingQueue.splice(idx, 1);
        } else if (data.type === 'submit_guess') {
          const matchId = data.matchId || socketToMatchIdMap.get(ws);
          if (!matchId) return;

          const match = activeDuelMatches.get(matchId);
          if (!match) return;

          // CRITICAL SERVER AUTHORITY CHECK
          if (match.gameState !== 'PLAYING') {
            sendWs(ws, { type: 'guess_rejected', reason: 'match_not_in_playing_state', gameState: match.gameState });
            return;
          }

          const isP1 = match.player1.ws === ws || match.player1.id === data.playerId;
          const sender = isP1 ? match.player1 : match.player2;
          const opponent = isP1 ? match.player2 : match.player1;

          const guessStr = turkishUpper(String(data.word || '').trim());
          const feedback = evaluateTurkishGuess(guessStr, match.correctWord);
          const isCorrect = feedback.every(f => f === 'correct');

          if (isCorrect) {
            // SINGLE THREADED ATOMIC WIN CLAIM
            if (match.gameState !== 'PLAYING') {
              // Someone else won 1ms earlier! Reject second guess!
              sendWs(ws, { type: 'guess_rejected', reason: 'match_already_finished', gameState: match.gameState });
              return;
            }

            match.gameState = 'FINISHED';
            match.winner = sender.id;
            match.loser = opponent.id;
            match.winReason = 'correct_word';
            match.finishedAt = Date.now();

            sender.attempts.push({ word: guessStr, result: feedback });

            console.log(`[Duel Server] Match ${matchId} WON by ${sender.name}! Word was ${match.correctWord}`);

            const winFinishData = {
              gameOver: true,
              isGameOver: true,
              won: true,
              status: 'finished',
              gameState: 'finished',
              winner: sender.id,
              winnerId: sender.id,
              finishedBy: sender.id,
              loser: opponent.id,
              winReason: 'correct_word',
              updatedAt: new Date().toISOString()
            };
            setDoc(doc(db, 'matches', match.matchId), winFinishData, { merge: true }).catch(err => {
              console.error('[Duel Server] Error updating Firestore match doc on win:', err);
            });
            setDoc(doc(db, 'rooms', match.matchId), winFinishData, { merge: true }).catch(err => {
              console.error('[Duel Server] Error updating Firestore room doc on win:', err);
            });

            // Send guess result to winning player
            sendWs(sender.ws, {
              type: 'guess_result',
              matchId: match.matchId,
              word: guessStr,
              feedback,
              isCorrect: true,
              isGameOver: true
            });

            // Send match end event to BOTH players simultaneously
            const endPayload = {
              type: 'match_end',
              matchId: match.matchId,
              gameState: 'FINISHED',
              winner: sender.id,
              loser: opponent.id,
              winnerName: sender.name,
              loserName: opponent.name,
              winReason: 'correct_word',
              correctWord: match.correctWord,
              attempts: {
                [match.player1.id]: match.player1.attempts,
                [match.player2.id]: match.player2.attempts
              }
            };

            sendWs(match.player1.ws, endPayload);
            sendWs(match.player2.ws, endPayload);

            // Trigger FCM High Priority Push Notification for background/sleeping devices
            void sendFcmHighPriorityMatchEndNotification({
              matchId: match.matchId,
              winnerId: sender.id,
              loserId: opponent.id,
              winnerName: sender.name,
              loserName: opponent.name,
              winReason: 'correct_word',
              correctWord: match.correctWord
            }).catch(() => {});

            socketToMatchIdMap.delete(match.player1.ws);
            socketToMatchIdMap.delete(match.player2.ws);
            setTimeout(() => activeDuelMatches.delete(matchId), 15000);
          } else {
            sender.attempts.push({ word: guessStr, result: feedback });

            // Persist the updated attempt list & count to Firestore immediately for real-time mobile snapshots and REST polling
            const attemptUpdate = {
              [`players.${sender.id}.attempts`]: sender.attempts,
              [`players.${sender.id}.attemptsCount`]: sender.attempts.length,
              [`players.${sender.id}.completed`]: sender.attempts.length >= 6,
              updatedAt: new Date().toISOString()
            };
            setDoc(doc(db, 'matches', match.matchId), attemptUpdate, { merge: true }).catch(() => {});
            setDoc(doc(db, 'rooms', match.matchId), attemptUpdate, { merge: true }).catch(() => {});

            sendWs(sender.ws, {
              type: 'guess_result',
              matchId: match.matchId,
              word: guessStr,
              feedback,
              isCorrect: false,
              isGameOver: false
            });

            sendWs(opponent.ws, {
              type: 'opponent_attempt',
              matchId: match.matchId,
              opponentId: sender.id,
              attemptCount: sender.attempts.length
            });

            if (sender.attempts.length >= 6 && opponent.attempts.length >= 6) {
              match.gameState = 'FINISHED';
              match.winner = 'draw';
              match.winReason = 'max_attempts';
              match.finishedAt = Date.now();

              const endPayload = {
                type: 'match_end',
                matchId: match.matchId,
                gameState: 'FINISHED',
                winner: 'draw',
                winReason: 'max_attempts',
                correctWord: match.correctWord,
                attempts: {
                  [match.player1.id]: match.player1.attempts,
                  [match.player2.id]: match.player2.attempts
                }
              };

              sendWs(match.player1.ws, endPayload);
              sendWs(match.player2.ws, endPayload);

              // Trigger FCM High Priority Push Notification for background/sleeping devices
              void sendFcmHighPriorityMatchEndNotification({
                matchId: match.matchId,
                winnerId: 'draw',
                loserId: '',
                winReason: 'max_attempts',
                correctWord: match.correctWord
              }).catch(() => {});

              socketToMatchIdMap.delete(match.player1.ws);
              socketToMatchIdMap.delete(match.player2.ws);
              setTimeout(() => activeDuelMatches.delete(matchId), 15000);
            }
          }
        } else if (data.type === 'leave_match') {
          handlePlayerDisconnect(ws);
        }
      } catch (e) {
        console.error('[WebSocket Server] Error parsing message:', e);
      }
    });

    ws.on('close', () => {
      handlePlayerDisconnect(ws);
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
