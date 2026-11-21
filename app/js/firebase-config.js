'use strict';
/* =========================================================
   Online database settings (Firebase)

   Paste your Firebase web-app config below to switch Cafe Journal to
   ONLINE mode (data stored in the cloud, nothing kept on devices).
   Firebase console → Project settings → General → Your apps → Web app →
   "SDK setup and configuration" → Config.

   These values are NOT secret — they only identify your project.
   Your data is protected by Firebase Authentication + firestore.rules.
   Leave it as null to keep the old on-device (offline) mode.
   ========================================================= */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCXC7K2IL9CLMIfJ0bCrBPkFP7zYU40rgM',
  authDomain: 'cafe-journal-9ba5e.firebaseapp.com',
  projectId: 'cafe-journal-9ba5e',
  storageBucket: 'cafe-journal-9ba5e.firebasestorage.app',
  messagingSenderId: '935495834232',
  appId: '1:935495834232:web:a4a5d6417b1429b83eeb8d',
};
/* Example:
window.FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
};
*/
