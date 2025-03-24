// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Cấu hình Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyADpJJiUYPpVja8IymC6OTtIDT0N-B3NoE",
  authDomain: "live-hoctap-9a3.firebaseapp.com",
  projectId: "live-hoctap-9a3",
  storageBucket: "live-hoctap-9a3.firebasestorage.app",
  messagingSenderId: "243471149211",
  appId: "1:243471149211:web:499a4585954ff09462fe3e",
  measurementId: "G-3D6H3FCF9W"
};

// Khởi tạo Firebase và Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
