// public/firebase-signaling.js
import { firestore } from "../firebaseConfig.js";

/**
 * Tạo room (cho streamer) với offer ban đầu.
 * @param {string} roomId 
 * @param {Object} offer 
 */
export async function createRoom(roomId, offer) {
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.set({ offer });
  console.log(`Room ${roomId} created with offer`);
}

/**
 * Viewer gửi answer khi đã tạo.
 * @param {string} roomId 
 * @param {Object} answer 
 */
export async function joinRoom(roomId, answer) {
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.update({ answer });
  console.log(`Joined room ${roomId} with answer`);
}

/**
 * Streamer lắng nghe answer từ viewer.
 * @param {string} roomId 
 * @param {function} callback 
 * @returns {function} unsubscribe
 */
export function listenForAnswer(roomId, callback) {
  const roomRef = firestore.collection('rooms').doc(roomId);
  return roomRef.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (data?.answer) {
      callback(data.answer);
    }
  });
}

/**
 * Lưu ICE candidate vào subcollection.
 * @param {string} roomId 
 * @param {Object} candidate 
 * @param {boolean} isCaller  true nếu caller (streamer)
 */
export async function addIceCandidate(roomId, candidate, isCaller) {
  const candidatesCollection = firestore
    .collection('rooms')
    .doc(roomId)
    .collection(isCaller ? 'callerCandidates' : 'calleeCandidates');
  await candidatesCollection.add(candidate);
}

/**
 * Lắng nghe ICE candidate từ bên kia.
 * @param {string} roomId 
 * @param {boolean} isCaller  true nếu caller (streamer) muốn nhận candidate của viewer
 * @param {function} callback 
 * @returns {function} unsubscribe
 */
export function listenForIceCandidates(roomId, isCaller, callback) {
  const candidatesCollection = firestore
    .collection('rooms')
    .doc(roomId)
    .collection(isCaller ? 'calleeCandidates' : 'callerCandidates');
  return candidatesCollection.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        callback(change.doc.data());
      }
    });
  });
}
