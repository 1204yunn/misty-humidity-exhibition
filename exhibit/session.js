import { firebaseConfig } from '../board/cloud-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
// Separate named app: staff exhibit login never replaces the mobile anonymous session.
const app = getApps().find(app => app.name === 'misty-exhibit') || initializeApp(firebaseConfig, 'misty-exhibit');
const auth = getAuth(app);
export async function getExhibitSession() {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('請展場工作人員先在 exhibit-setup.html 登入並確認裝置授權');
  const token = await auth.currentUser.getIdTokenResult(true);
  if (auth.currentUser.isAnonymous || token.claims.exhibitPublisher !== true
    || Number(token.claims.exhibitUntil) * 1000 <= Date.now()) throw new Error('展場裝置尚未授權或授權已過期，請聯絡工作人員');
  return { token: token.token, uid: auth.currentUser.uid, expires: token.claims.exhibitUntil };
}
export const signInStaff = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutStaff = () => signOut(auth);