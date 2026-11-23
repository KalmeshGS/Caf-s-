// Source for app/vendor/firebase.js (global "FB"). Same exports as before + App Check.
// Rebuild: npm install firebase@13.4.0 esbuild
//          npx esbuild entry.js --bundle --format=iife --global-name=FB --minify --legal-comments=eof --outfile=firebase.js
export { initializeApp, deleteApp } from 'firebase/app';
export {
  initializeAuth, getAuth, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence,
} from 'firebase/auth';
export {
  initializeFirestore, connectFirestoreEmulator, memoryLocalCache, terminate,
  doc, collection, query, where, documentId, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, increment, serverTimestamp,
} from 'firebase/firestore';
// App Check (Google Cloud Fraud Defense / reCAPTCHA Enterprise): proves requests come from the real Cafe Journal website
export { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken } from 'firebase/app-check';
