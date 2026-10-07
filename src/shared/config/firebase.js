// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Thay thế block này bằng cấu hình thực tế từ Firebase Console của bạn
const firebaseConfig = {
    apiKey: "AIzaSyBI2OTZW2QC7A6qE0yo9Uewc6Ma4_CWd0o",
    authDomain: "azota-c0e26.firebaseapp.com",
    projectId: "azota-c0e26",
    storageBucket: "azota-c0e26.firebasestorage.app",
    messagingSenderId: "638596469810",
    appId: "1:638596469810:web:0b4f776c199b058b8e582b",
    measurementId: "G-T1C42TDWVY"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Khởi tạo và export các dịch vụ để sử dụng sau này
export const auth = getAuth(app);
export const db = getFirestore(app);