// public/streamer.js
import {
  createRoom,
  listenForAnswer,
  addIceCandidate,
  listenForIceCandidates
} from "./firebase-signaling.js";

// Giả sử roomId được lấy từ input hoặc tạo ngẫu nhiên
const roomId = document.getElementById('roomIdInput').value;

let pc = null;

async function startStream() {
  // Lấy local stream (video & audio)
  const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById('localVideo').srcObject = localStream;
  
  // Tạo RTCPeerConnection
  pc = new RTCPeerConnection();
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Tạo offer và set Local Description
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Lưu offer lên Firestore, tạo room
  await createRoom(roomId, offer.toJSON());

  // Lắng nghe answer từ viewer
  listenForAnswer(roomId, async (answer) => {
    const rtcAnswer = new RTCSessionDescription(answer);
    await pc.setRemoteDescription(rtcAnswer);
  });

  // Khi có ICE candidate, gửi lên Firestore
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addIceCandidate(roomId, event.candidate.toJSON(), true);
    }
  };

  // Lắng nghe ICE candidate từ viewer
  listenForIceCandidates(roomId, true, async (candidate) => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ICE candidate', e);
    }
  });
}

document.getElementById('startButton').addEventListener('click', startStream);
