// public/firebase-signaling.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js";

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

// Khởi tạo Firebase App và Realtime Database
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Gửi tín hiệu signaling (offer, answer, ICE candidate)
 * @param {string} roomId - Mã phòng (có thể sử dụng room.id)
 * @param {Object} signalData - Dữ liệu tín hiệu (type, sdp, candidate,...)
 */
export function sendSignal(roomId, signalData) {
  const signalsRef = ref(database, `rooms/${roomId}/signals`);
  push(signalsRef, signalData);
}

/**
 * Lắng nghe tín hiệu mới từ Firebase
 * @param {string} roomId - Mã phòng
 * @param {function} callback - Hàm callback nhận tín hiệu mới
 */
export function onNewSignal(roomId, callback) {
  const signalsRef = ref(database, `rooms/${roomId}/signals`);
  onChildAdded(signalsRef, (data) => {
    const signal = data.val();
    callback(signal);
  });
}
