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
window.FIREBASE_CONFIG = null;
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
