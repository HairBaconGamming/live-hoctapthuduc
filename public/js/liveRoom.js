// public/js/liveRoom.js
const socket = io();
const viewerCount = document.getElementById("viewerCount");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

socket.emit("joinRoom", { roomId, username });

socket.on("userJoined", msg => {
  const li = document.createElement("li");
  li.innerHTML = `<i>${msg}</i>`;
  chatMessages.appendChild(li);
});
socket.on("newMessage", data => {
  const li = document.createElement("li");
  li.textContent = `${data.username}: ${data.message}`;
  chatMessages.appendChild(li);
});
socket.on("updateViewers", count => {
  viewerCount.textContent = count;
});
sendBtn.addEventListener("click", () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  socket.emit("chatMessage", { roomId, username, message: msg });
  messageInput.value = "";
});
messageInput.addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    sendBtn.click();
  }
});

// WebRTC Setup for Viewer
let pc;
let remoteStream = new MediaStream();
const liveVideo = document.getElementById("liveVideo");
liveVideo.srcObject = remoteStream;

socket.on("webrtcOffer", async ({ offer, roomId: offerRoomId, streamerSocketId }) => {
  if (offerRoomId !== roomId) return;
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    iceTransportPolicy: 'all'
  });
  pc.ontrack = event => {
    if (event.streams && event.streams[0]) {
      liveVideo.srcObject = event.streams[0];
    } else {
      remoteStream.addTrack(event.track);
      liveVideo.srcObject = remoteStream;
    }
    document.getElementById("placeholder").style.display = "none";
    liveVideo.play().catch(err => console.error("Error playing remote video:", err));
  };
  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("webrtcCandidate", { roomId, candidate: event.candidate });
    }
  };
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtcAnswer", { roomId, answer, targetSocketId: streamerSocketId });
  } catch (error) {
    console.error("Error handling WebRTC offer:", error);
  }
});
socket.on("webrtcCandidate", async ({ candidate, roomId: candidateRoomId }) => {
  if (candidateRoomId !== roomId || !pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("Error adding ICE candidate", e);
  }
});
socket.on("screenShareEnded", () => {
  remoteStream.getTracks().forEach(track => track.stop());
  remoteStream = new MediaStream();
  liveVideo.srcObject = remoteStream;
  document.getElementById("placeholder").style.display = "flex";
});
socket.on("roomEnded", () => {
  const overlay = document.getElementById('roomEndedOverlay');
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = 'none';
  overlay.classList.remove('active');
  void overlay.offsetWidth;
  overlay.classList.add('active');
  setTimeout(() => {
    window.location.href = "https://hoctap-9a3.glitch.me/live";
  }, 15000);
});
setInterval(() => {
  if (socket && roomId) {
    socket.emit("keepAlive", { roomId });
    console.log("Keep-alive sent for room:", roomId);
  }
}, 15000);
