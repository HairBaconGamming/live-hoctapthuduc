// public/liveRoom.js
import {
  joinRoom,
  addIceCandidate,
  listenForIceCandidates
} from "./firebase-signaling.js";
import firebase from "firebase/compat/app";  // Nếu cần dùng firebase
import "firebase/compat/firestore";            // để sử dụng firestore

let pc = null;

async function joinStream() {
  const roomId = document.getElementById('roomIdInput').value;
  // Lấy video của viewer để hiển thị remote stream
  const remoteVideo = document.getElementById('remoteVideo');

  pc = new RTCPeerConnection();

  // Khi có track từ remote, hiển thị video
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Lấy room offer từ Firestore
  const roomRef = firebase.firestore().collection('rooms').doc(roomId);
  const roomSnapshot = await roomRef.get();

  if (!roomSnapshot.exists) {
    console.error('Room does not exist!');
    return;
  }

  const roomData = roomSnapshot.data();

  // Set Remote Description với offer
  await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));

  // Tạo answer và set Local Description
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Gửi answer lên Firestore
  await joinRoom(roomId, answer.toJSON());

  // Gửi ICE candidate khi có candidate mới
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addIceCandidate(roomId, event.candidate.toJSON(), false);
    }
  };

  // Lắng nghe ICE candidate từ streamer
  listenForIceCandidates(roomId, false, async (candidate) => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ICE candidate', e);
    }
  });
}

document.getElementById('joinButton').addEventListener('click', joinStream);
