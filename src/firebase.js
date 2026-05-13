import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

// Paste your Firebase config from the Firebase console here
const firebaseConfig = {
  apiKey: "AIzaSyAmVQ0K-hCJLKS42QPm39Q7B_QlgdaZ-vA",
  authDomain: "yoga-playlist-planner.firebaseapp.com",
  projectId: "yoga-playlist-planner",
  storageBucket: "yoga-playlist-planner.firebasestorage.app",
  messagingSenderId: "497405748492",
  appId: "1:497405748492:web:81313a80deb6eec413d529",
  measurementId: "G-0MXFSC03G2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function cloudLoad(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    const { index } = snap.data();
    if (!index?.length) return null;

    const playlists = {};
    await Promise.all(
      index.map(async ({ id }) => {
        const plSnap = await getDoc(doc(db, 'users', userId, 'playlists', id));
        if (plSnap.exists()) playlists[id] = plSnap.data();
      })
    );
    return { index, playlists };
  } catch (e) {
    console.warn('Cloud load failed:', e);
    return null;
  }
}

export async function cloudSavePlaylist(userId, playlistId, data) {
  try {
    await setDoc(doc(db, 'users', userId, 'playlists', playlistId), data);
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
}

export async function cloudSaveIndex(userId, index) {
  try {
    await setDoc(doc(db, 'users', userId), { index }, { merge: true });
  } catch (e) {
    console.warn('Cloud index save failed:', e);
  }
}

export async function cloudDeletePlaylist(userId, playlistId) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'playlists', playlistId));
  } catch (e) {
    console.warn('Cloud delete failed:', e);
  }
}
