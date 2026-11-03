// Public web configuration copied from the existing board/firebase.js project.
// These values identify the project; they are not administrator credentials.
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyBUFbhTt5Q4vGjg13ZY-iARh3TCv80ogO4",
  authDomain: "misty-message-board.firebaseapp.com",
  projectId: "misty-message-board",
  storageBucket: "misty-message-board.firebasestorage.app",
  messagingSenderId: "171530262455",
  appId: "1:171530262455:web:ce5ce853e95233bae23a32",
});

export const cloudConfig = Object.freeze({
  cloudName: "zwlt6flv",
  uploadPreset: "misty_stories",
  collection: "stories",
  // Turn on ONLY after the Console checks in docs/CLOUD_SETUP.md are complete.
  // These client switches are NOT security controls: enforce the same tester
  // allowlist and pending-only create policy in reviewed Firestore rules.
  controlledTestEnabled: true,
  firestoreRulesReviewed: true,
  testerUids: ['buYjfribModL3hBDzzXb7R48hwB3'],
});
