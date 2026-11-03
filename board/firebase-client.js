import { firebaseConfig } from "./cloud-config.js";
// Keep the existing project's pinned SDK version. Only import this module after
// explicit public consent (the live wall also uses it for its read-only listener).
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import * as firestore from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

let session;
export function getFirebaseClient() {
  if (!session) {
    session = (async () => {
      const app = getApps().find(item => item.name === "[DEFAULT]") || initializeApp(firebaseConfig);
      if (app.options.projectId !== firebaseConfig.projectId) throw new Error("Firebase project mismatch");
      const auth = getAuth(app);
      await auth.authStateReady();
      const user = auth.currentUser || (await signInAnonymously(auth)).user;
      return { user, db: firestore.getFirestore(app), firestore };
    })().catch(error => { session = null; throw error; });
  }
  return session;
}
