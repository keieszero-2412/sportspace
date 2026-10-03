import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBvLJvPwSAZ2IoG0D_FkCTmwrSe6pJ91Zk",
  authDomain: "sportspace-af6b4.firebaseapp.com",
  projectId: "sportspace-af6b4",
  storageBucket: "sportspace-af6b4.firebasestorage.app",
  messagingSenderId: "490538912999",
  appId: "1:490538912999:web:ab64a9dd6d9e56f20ea642",
  measurementId: "G-R1VKP7KP24",
};

// Initialize Firebase
const useEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
const app = initializeApp(
  useEmulators
    ? {
        ...firebaseConfig,
        projectId: "demo-sportspace",
        apiKey: "demo-api-key",
        authDomain: "demo-sportspace.firebaseapp.com",
        storageBucket: "demo-sportspace.appspot.com",
      }
    : firebaseConfig,
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-southeast1");
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export { signInWithPopup, signInWithRedirect, signOut };
