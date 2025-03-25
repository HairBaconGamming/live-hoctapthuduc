// public/js/streamer.js
const socket = io();
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const chatMessages = document.getElementById("chatMessages");
const viewerCount = document.getElementById("viewerCount");

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
  const message = messageInput.value.trim();
  if (!message) return;
  socket.emit("chatMessage", { roomId, username, message });
  messageInput.value = "";
});
messageInput.addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    sendBtn.click();
  }
});

// Control Panel Toggle
const togglePanelBtn = document.getElementById("togglePanelBtn");
const controlPanel = document.getElementById("controlPanel");
togglePanelBtn.addEventListener("click", () => {
  controlPanel.classList.toggle("collapsed");
  if (controlPanel.classList.contains("collapsed")) {
    togglePanelBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
  } else {
    togglePanelBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  }
});

document.getElementById("endStreamBtn").addEventListener("click", () => {
  socket.emit("endRoom", { roomId });
  alert("Live stream đã kết thúc.");
  window.location.href = "https://hoctap-9a3.glitch.me/";
});

// Realtime Screen Share: Sử dụng WebRTC signaling qua Socket.IO
let localStream = null;
let pc;
const pendingViewers = [];
const pcs = {};

socket.on("newViewer", async ({ viewerSocketId }) => {
  if (!localStream) {
    console.warn("Local stream chưa sẵn sàng, lưu viewer:", viewerSocketId);
    pendingViewers.push(viewerSocketId);
    return;
  }
  createAndSendOffer(viewerSocketId);
});

async function createAndSendOffer(viewerSocketId) {
  const pcForViewer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  pcs[viewerSocketId] = pcForViewer;
  localStream.getTracks().forEach(track => pcForViewer.addTrack(track, localStream));
  pcForViewer.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("webrtcCandidate", {
        roomId,
        candidate: event.candidate,
        targetSocketId: viewerSocketId
      });
    }
  };
  const offer = await pcForViewer.createOffer();
  await pcForViewer.setLocalDescription(offer);
  socket.emit("webrtcOffer", {
    roomId,
    offer,
    targetSocketId: viewerSocketId
  });
}

document.getElementById("shareScreenBtn").addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;
    localStream.getVideoTracks()[0].addEventListener("ended", () => {
      console.log("User stopped screen sharing");
      screenVideo.srcObject = null;
      localStream = null;
      socket.emit("screenShareEnded", { roomId });
    });
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all"
    });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log("New ICE candidate: ", event.candidate);
        socket.emit("webrtcCandidate", { roomId, candidate: event.candidate });
      }
    };
    while (pendingViewers.length) {
      const viewerSocketId = pendingViewers.shift();
      await createAndSendOffer(viewerSocketId);
    }
  } catch (err) {
    console.error("Error during screen sharing:", err);
    alert("Cannot share screen. Please ensure you have the proper permissions or try a different browser.");
  }
});

socket.on("webrtcAnswer", async ({ answer, targetSocketId }) => {
  let pcForViewer = pcs[targetSocketId];
  if (!pcForViewer) {
    console.warn("Không tìm thấy peer connection cho viewer: " + targetSocketId + ". Thiết lập lại kết nối...");
    pcForViewer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcs[targetSocketId] = pcForViewer;
    localStream.getTracks().forEach(track => pcForViewer.addTrack(track, localStream));
    pcForViewer.onicecandidate = event => {
      if (event.candidate) {
        socket.emit("webrtcCandidate", {
          roomId,
          candidate: event.candidate,
          targetSocketId
        });
      }
    };
    const offer = await pcForViewer.createOffer();
    await pcForViewer.setLocalDescription(offer);
    socket.emit("webrtcOffer", { roomId, offer, targetSocketId });
  }
  await pcForViewer.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("webrtcCandidate", async ({ candidate, targetSocketId }) => {
  const pcForViewer = pcs[targetSocketId];
  if (!pcForViewer) return;
  await pcForViewer.addIceCandidate(new RTCIceCandidate(candidate));
});
