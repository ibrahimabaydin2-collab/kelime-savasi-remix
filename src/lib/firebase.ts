import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously as firebaseSignInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  sendEmailVerification as firebaseSendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  PhoneAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDocFromCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  collection,
  query,
  where,
  getDocs,
  limit,
  getDocFromServer,
  updateDoc,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the custom firestore database ID from firebase-applet-config.json if specified
const dbId = firebaseConfig.firestoreDatabaseId || '(default)';

// Check if localStorage is supported and accessible
let usePersistentCache = false;
try {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem('__fs_test_key', 'test');
    window.localStorage.removeItem('__fs_test_key');
    usePersistentCache = true;
  }
} catch (e) {
  usePersistentCache = false;
}

// Silence harmless gRPC idle stream warnings in WebViews / APKs
try {
  setLogLevel('error');
} catch (e) {
  // ignore
}

// Helper to safely initialize Firestore across physical mobile APKs, WebViews, and Web
function createSafeFirestore() {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const isMobileOrHybrid = typeof window !== 'undefined' && (
    /android/i.test(ua) ||
    /iphone|ipad|ipod/i.test(ua) ||
    !!(window as any).Capacitor ||
    !!(window as any).AndroidBridge ||
    window.location.protocol === 'file:' ||
    window.location.protocol.startsWith('capacitor') ||
    window.location.protocol.startsWith('ionic')
  );

  let cacheConfig;
  try {
    // Only use persistent multi-tab cache on standard desktop browsers.
    // On physical Android APKs and WebViews, IndexedDB / WebLocks can cause SecurityError / DOMException or hang connection.
    if (usePersistentCache && !isMobileOrHybrid) {
      cacheConfig = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
    } else {
      cacheConfig = memoryLocalCache();
    }
  } catch (e) {
    console.warn('[Firebase] Fallback to memoryLocalCache due to cache init warning:', e);
    cacheConfig = memoryLocalCache();
  }

  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: isMobileOrHybrid ? true : undefined,
      experimentalAutoDetectLongPolling: isMobileOrHybrid ? undefined : true,
      localCache: cacheConfig
    }, dbId);
  } catch (err) {
    console.warn('[Firebase] Primary initializeFirestore failed, trying resilient fallback:', err);
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: memoryLocalCache()
    }, dbId);
  }
}

export const db = createSafeFirestore();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore on startup as required by the Firebase Integration skill
async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
    console.log('Successfully checked Cloud Firestore connection (cached or online).');
  } catch (error) {
    console.warn("Firestore connection check:", error);
  }
}
testConnection();

/**
 * Signs in anonymously (Guest Mode)
 */
export async function signInAsGuest(): Promise<User> {
  const result = await firebaseSignInAnonymously(auth);
  return result.user;
}

/**
 * Registers a new user with Email and Password
 */
export async function registerWithEmailAndPassword(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // Send email verification automatically
  await firebaseSendEmailVerification(result.user);
  return result.user;
}

/**
 * Logs in with Email and Password
 */
export async function loginWithEmailAndPassword(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Links an anonymous guest account to an Email & Password
 */
export async function linkGuestToEmailAndPassword(email: string, password: string): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Giriş yapmış aktif bir misafir oturumu bulunamadı.');
  }
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(currentUser, credential);
  // Send verification email automatically
  await firebaseSendEmailVerification(result.user);
  return result.user;
}

/**
 * Sends a verification email to the current user
 */
export async function sendVerificationEmail(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Giriş yapmış aktif bir kullanıcı bulunamadı.');
  }
  await firebaseSendEmailVerification(currentUser);
}

/**
 * Signs out the current user
 */
export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Fetches the user profile from Firestore matching a specific Device ID
 */
export async function fetchUserProfileByDeviceId(deviceId: string): Promise<UserProfile | null> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('deviceId', '==', deviceId), limit(1));
    const querySnapshot = await Promise.race([
      getDocs(q),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore Fetch Timeout')), 4000))
    ]) as any;

    if (querySnapshot && !querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return docSnap.data() as UserProfile;
    }
  } catch (error) {
    console.warn('Failed to fetch user profile by deviceId:', error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    }
  }
  return null;
}

/**
 * Deletes a user profile document from Firestore
 */
export async function deleteUserProfile(uid: string): Promise<void> {
  try {
    if (auth.currentUser && uid !== auth.currentUser.uid) {
      console.warn(`Skipping deleteUserProfile for ${uid} because it does not match current authenticated user ID ${auth.currentUser.uid}`);
      return;
    }
    const userDocRef = doc(db, 'users', uid);
    await deleteDoc(userDocRef);
  } catch (error) {
    console.warn('Failed to delete old user profile (expected/non-fatal):', error);
  }
}

/**
 * Fetches the user profile from Firestore
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const userDocRef = doc(db, 'users', uid);
  try {
    // 1. Try to fetch from server with a timeout
    const userSnap = await Promise.race([
      getDoc(userDocRef),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore Fetch Timeout')), 4000))
    ]) as any;
    
    if (userSnap && userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      return { ...data, id: data.id || userSnap.id };
    }
  } catch (error) {
    console.warn('Failed to fetch user profile from server, trying offline cache:', error);
    if (error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission'))) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
    try {
      // 2. Try to fetch from local Firestore cache
      const userSnap = await getDocFromCache(userDocRef);
      if (userSnap && userSnap.exists()) {
        console.log('Successfully fetched user profile from Firestore offline cache.');
        const data = userSnap.data() as UserProfile;
        return { ...data, id: data.id || userSnap.id };
      }
    } catch (cacheError) {
      console.warn('Failed to fetch from Firestore offline cache:', cacheError);
    }
  }
  
  // 3. Fallback to localStorage if Firestore is completely unreachable and cache is empty
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const localSaved = window.localStorage.getItem('kelimesavasi_profile');
      const savedUsername = window.localStorage.getItem('saved_username');
      if (localSaved) {
        const parsed = JSON.parse(localSaved);
        if (parsed && (parsed.id === uid || parsed.uid === uid || parsed.id)) {
          console.log('Restored user profile from localStorage fallback.');
          if ((!parsed.name || parsed.name === 'Oyuncu' || parsed.name === 'Kelime Oyuncusu') && savedUsername) {
            parsed.name = savedUsername;
          }
          return parsed as UserProfile;
        }
      }
    }
  } catch (localError) {
    console.warn('Failed to restore from localStorage:', localError);
  }

  return null;
}

/**
 * Normalizes Turkish letters to English counterparts for fuzzy case-insensitive matching
 */
export function turkishToEnglishFriendly(str: string): string {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .toLowerCase();
}

/**
 * Checks if a username matches a search term in any case/Turkish-locale variation
 */
export function matchesSearchTerm(userName: string, searchTerm: string): boolean {
  if (!userName || !searchTerm) return false;
  const term = searchTerm.trim().toLowerCase();
  if (!term) return false;

  const uName = userName.trim().toLowerCase();
  const uNameTr = userName.trim().toLocaleLowerCase('tr-TR');
  const termTr = searchTerm.trim().toLocaleLowerCase('tr-TR');
  const uNameClean = turkishToEnglishFriendly(userName);
  const termClean = turkishToEnglishFriendly(searchTerm);

  return (
    uName.includes(term) ||
    uNameTr.includes(termTr) ||
    uNameClean.includes(termClean) ||
    term.includes(uName) ||
    termTr.includes(uNameTr) ||
    termClean.includes(uNameClean)
  );
}

/**
 * Saves or updates the user profile in Firestore
 */
export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  try {
    // Update browser local storage immediately FIRST so client-side state is always perfectly synchronized even offline/on mobile APK
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('kelimesavasi_profile', JSON.stringify(profile));
        if (profile.name) {
          window.localStorage.setItem('saved_username', profile.name.trim());
        }
      }
    } catch (lsErr) {
      console.warn('LocalStorage save error in saveUserProfileToFirestore:', lsErr);
    }

    if (auth.currentUser && profile.id !== auth.currentUser.uid) {
      console.warn(`Skipping saveUserProfileToFirestore for profile ID ${profile.id} because it is different from currently authenticated user UID ${auth.currentUser.uid}`);
      return;
    }

    const userDocRef = doc(db, 'users', profile.id);
    
    const cleanName = profile.name ? profile.name.trim() : '';
    const termLower = cleanName.toLowerCase();
    const termLowerTr = cleanName.toLocaleLowerCase('tr-TR');
    const termClean = turkishToEnglishFriendly(cleanName);

    const dataToSave = {
      ...profile,
      name: cleanName,
      name_lowercase: termLower,
      name_lowercase_tr: termLowerTr,
      name_clean: termClean,
      lastUpdated: new Date().toISOString(),
      updatedAt: serverTimestamp()
    };

    // We await setDoc so we are 100% sure the write is committed to local cache/network
    await setDoc(userDocRef, dataToSave, { merge: true });
    console.log(`Successfully saved user profile to Firestore for UID ${profile.id} (${cleanName})`);
  } catch (error) {
    console.error('Failed to save user profile:', error);
    handleFirestoreError(error, OperationType.WRITE, `users/${profile.id}`);
  }
}

/**
 * Resets/Clears user matchmaking and room statuses in Firestore cleanly
 */
export async function clearMatchmakingState(uid: string): Promise<void> {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  try {
    await updateDoc(userDocRef, {
      roomId: null,
      activeRoomId: null,
      isPlaying: false,
      isInRoom: false,
      isSearching: false,
      matchmakingStatus: 'idle',
      lastUpdated: new Date().toISOString()
    });
    console.log('Successfully cleared matchmaking state in Firestore for:', uid);
  } catch (error) {
    console.warn('Failed to clear matchmaking state in Firestore via updateDoc, trying merge:', error);
    try {
      await setDoc(userDocRef, {
        roomId: null,
        activeRoomId: null,
        isPlaying: false,
        isInRoom: false,
        isSearching: false,
        matchmakingStatus: 'idle',
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      console.log('Successfully cleared matchmaking state in Firestore via setDoc merge for:', uid);
    } catch (fallbackError) {
      console.error('Fallback clear matchmaking state failed:', fallbackError);
    }
  }
}

/**
 * Google Auth Provider Instance
 */
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

/**
 * Signs in with Google
 */
export async function signInWithGoogle(): Promise<{ user: User; credential?: any }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user };
  } catch (error: any) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      const credential = GoogleAuthProvider.credentialFromError(error);
      return { user: null as any, credential };
    }
    throw error;
  }
}

/**
 * Links current guest account to Google
 */
export async function linkGuestWithGoogle(): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Aktif bir oturum bulunamadı.');
  const result = await linkWithPopup(currentUser, googleProvider);
  return result.user;
}

/**
 * Fetches user profiles of users who have added the current user to their friends list
 */
export async function fetchUsersWhoAddedMe(uid: string): Promise<UserProfile[]> {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('friends', 'array-contains', uid));
    const querySnapshot = await getDocs(q);
    const results: UserProfile[] = [];
    querySnapshot.forEach((docSnap) => {
      results.push(docSnap.data() as UserProfile);
    });
    return results;
  } catch (error) {
    console.error('Failed to fetch users who added me:', error);
    return [];
  }
}

/**
 * Searches for user profiles matching a specific username exactly or by prefix (case-insensitive and Turkish-aware)
 */
export async function searchUserByName(name: string): Promise<UserProfile[]> {
  try {
    const term = name.trim();
    if (!term) return [];

    const usersCollection = collection(db, 'users');
    const termLower = term.toLowerCase();
    const termLowerTr = term.toLocaleLowerCase('tr-TR');
    const termClean = turkishToEnglishFriendly(term);

    // Query 1: Case-insensitive prefix search using name_lowercase
    const q1 = query(
      usersCollection,
      where('name_lowercase', '>=', termLower),
      where('name_lowercase', '<=', termLower + '\uf8ff'),
      limit(50)
    );

    // Query 2: Case-insensitive prefix search using name_lowercase_tr
    const q2 = query(
      usersCollection,
      where('name_lowercase_tr', '>=', termLowerTr),
      where('name_lowercase_tr', '<=', termLowerTr + '\uf8ff'),
      limit(50)
    );

    // Query 3: English friendly prefix search using name_clean
    const q3 = query(
      usersCollection,
      where('name_clean', '>=', termClean),
      where('name_clean', '<=', termClean + '\uf8ff'),
      limit(50)
    );

    // Query 4: Case-sensitive exact match
    const qExact1 = query(
      usersCollection,
      where('name', '==', term),
      limit(20)
    );

    // Query 5: Case-insensitive exact match on name_lowercase
    const qExact2 = query(
      usersCollection,
      where('name_lowercase', '==', termLower),
      limit(20)
    );

    // Query 6: Robust fallback querying the first 300 users for perfect offline/sync client-side search
    const qFallback = query(
      usersCollection,
      limit(300)
    );

    const [snap1, snap2, snap3, snapE1, snapE2, snapFallback] = await Promise.all([
      getDocs(q1).catch((err) => {
        console.warn('q1 search error:', err);
        return null;
      }),
      getDocs(q2).catch((err) => {
        console.warn('q2 search error:', err);
        return null;
      }),
      getDocs(q3).catch((err) => {
        console.warn('q3 search error:', err);
        return null;
      }),
      getDocs(qExact1).catch((err) => {
        console.warn('qExact1 search error:', err);
        return null;
      }),
      getDocs(qExact2).catch((err) => {
        console.warn('qExact2 search error:', err);
        return null;
      }),
      getDocs(qFallback).catch((err) => {
        console.warn('qFallback search error:', err);
        return null;
      })
    ]);

    const resultMap = new Map<string, UserProfile>();

    const processSnap = (snap: any) => {
      if (snap && !snap.empty) {
        snap.forEach((docSnap: any) => {
          const data = docSnap.data() as UserProfile;
          if (data) {
            const userId = data.id || docSnap.id;
            if (userId) {
              resultMap.set(userId, { ...data, id: userId });
            }
          }
        });
      }
    };

    processSnap(snap1);
    processSnap(snap2);
    processSnap(snap3);
    processSnap(snapE1);
    processSnap(snapE2);
    processSnap(snapFallback);

    const allUsers = Array.from(resultMap.values());

    // Filter client-side: case-insensitive/Turkish-aware match anywhere in the name
    const filtered = allUsers.filter(user => {
      if (!user.name) return false;
      return matchesSearchTerm(user.name, term);
    });

    // Sort: exact match first, then starts with, then locale compare
    filtered.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      
      const aLower = aName.toLowerCase();
      const bLower = bName.toLowerCase();
      const aLowerTr = aName.toLocaleLowerCase('tr-TR');
      const bLowerTr = bName.toLocaleLowerCase('tr-TR');
      const aClean = turkishToEnglishFriendly(aName);
      
      const isExactA = aLower === termLower || aLowerTr === termLowerTr || aClean === termClean;
      const isExactB = bLower === termLower || bLowerTr === termLowerTr || turkishToEnglishFriendly(bName) === termClean;
      
      if (isExactA && !isExactB) return -1;
      if (!isExactA && isExactB) return 1;
      
      const startsA = aLower.startsWith(termLower) || aLowerTr.startsWith(termLowerTr) || aClean.startsWith(termClean);
      const startsB = bLower.startsWith(termLower) || bLowerTr.startsWith(termLowerTr) || turkishToEnglishFriendly(bName).startsWith(termClean);
      
      if (startsA && !startsB) return -1;
      if (!startsA && startsB) return 1;
      
      return aName.localeCompare(bName, 'tr');
    });

    return filtered.slice(0, 30);
  } catch (error) {
    console.error('Failed to search user by name:', error);
    return [];
  }
}

/**
 * Checks if a username is already taken by another user in the database (case-insensitive and Turkish-aware)
 */
export async function checkUsernameExists(username: string, currentUserId?: string): Promise<boolean> {
  try {
    const term = username.trim();
    if (!term) return false;
    
    const termLower = term.toLowerCase();
    const termLowerTr = term.toLocaleLowerCase('tr-TR');
    const termClean = turkishToEnglishFriendly(term);
    const usersCollection = collection(db, 'users');

    const queries = [
      query(usersCollection, where('name_lowercase', '==', termLower)),
      query(usersCollection, where('name_lowercase_tr', '==', termLowerTr)),
      query(usersCollection, where('name_clean', '==', termClean)),
      query(usersCollection, where('name', '==', term))
    ];

    const snapshots = await Promise.all(
      queries.map(q => getDocs(q).catch(err => {
        console.warn('Username check query failed:', err);
        return null;
      }))
    );

    for (const snap of snapshots) {
      if (snap && !snap.empty) {
        let isTaken = false;
        snap.forEach(docSnap => {
          if (!currentUserId || docSnap.id !== currentUserId) {
            isTaken = true;
          }
        });
        if (isTaken) return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Failed to check if username exists:', error);
    return false;
  }
}

export { onAuthStateChanged, signInWithCredential, GoogleAuthProvider, linkWithCredential, PhoneAuthProvider, RecaptchaVerifier, signInWithPhoneNumber };
