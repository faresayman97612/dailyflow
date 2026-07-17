import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Firebase Console → Project Settings → Your apps → Web app
// Safe to keep public: Firestore access is enforced by firestore.rules, not by hiding this config.
export const firebaseConfig = {
  apiKey: "AIzaSyAhx5SQHLSZSXw8_eAMVYY-CvFJ31UPHVs",
  authDomain: "dailyflow-33fb8.firebaseapp.com",
  projectId: "dailyflow-33fb8",
  storageBucket: "dailyflow-33fb8.firebasestorage.app",
  messagingSenderId: "276971504958",
  appId: "1:276971504958:web:1e49178ccfef5de55e986f",
  measurementId: "G-19NT9M05BT"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
