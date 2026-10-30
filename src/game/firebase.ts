// ═══════════════════════════════════════════════════════════════
// FIREBASE CONFIG — Realtime Database Multiplayer Backend
// Project: kaka-ca0ff
// ═══════════════════════════════════════════════════════════════

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  onValue,
  onDisconnect,
  remove,
  push,
  query,
  limitToLast,
  serverTimestamp,
  type Database,
  type DatabaseReference,
  type Unsubscribe,
} from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyBAR6HwrGBmwUxVDvIVuGYar82Lozg1Sck",
  authDomain: "kaka-ca0ff.firebaseapp.com",
  databaseURL: "https://kaka-ca0ff-default-rtdb.firebaseio.com",
  projectId: "kaka-ca0ff",
  storageBucket: "kaka-ca0ff.firebasestorage.app",
  messagingSenderId: "803477967370",
  appId: "1:803477967370:web:82554249e02e4450c205f3",
};

let app: FirebaseApp | null = null;
let db: Database | null = null;

/** Lazily initialize Firebase (only when multiplayer is actually used) */
export function initFirebase(): Database | null {
  if (db) return db;
  try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    return db;
  } catch (err) {
    console.warn("[Firebase] init failed:", err);
    return null;
  }
}

export function getFirebaseDb(): Database | null {
  return db ?? initFirebase();
}

// Re-export Firebase primitives so other modules don't import firebase directly
export {
  ref,
  set,
  onValue,
  onDisconnect,
  remove,
  push,
  query,
  limitToLast,
  serverTimestamp,
};
export type { DatabaseReference, Unsubscribe };
