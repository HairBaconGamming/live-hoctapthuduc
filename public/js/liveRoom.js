// /public/js/liveRoom.js

const socket = io();
const viewerCount = document.getElementById("viewerCount");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// Gửi thông tin tham gia phòng
socket.emit("joinRoom", { roomId, username });

// Các sự kiện chat
socket.on("userJoined", msg => {
  const li = document.createElement("li");
  li.innerHTML = `<i>${msg}</i>`;
  chatMessages.appendChild(li);
});
socket.on("newMessage", data => {
  const li = document.createElement("li");
  // data.message được giả sử là object chứa: username, content, messageType
  li.innerHTML = `<strong>${data.message.username}:</strong> ${marked.parse(data.message.content)}`;
  // Gán class cho message theo messageType
  if (data.message.messageType) {
    li.classList.add(`message-${data.message.messageType}`);
  }
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

// Hiển thị overlay khi phòng kết thúc
socket.on("roomEnded", () => {
  console.log("Room has ended.");
  const overlay = document.getElementById("roomEndedOverlay");
  if (overlay) {
    overlay.classList.remove("active");
    // Force reflow để kích hoạt transition nếu có CSS animation
    void overlay.offsetWidth;
    overlay.classList.add("active");
  }
  // Tùy chọn: chuyển hướng sau 60 giây
  setTimeout(() => {
    window.location.href = "https://hoctap-9a3.glitch.me/live";
  }, 60000);
});

// Khi nhận tín hiệu tắt chia sẻ từ streamer, reset video
socket.on("screenShareEnded", () => {
  console.log("Screen share ended signal received.");
  const liveVideo = document.getElementById("liveVideo");
  if (liveVideo.srcObject) {
    liveVideo.srcObject.getTracks().forEach(track => track.stop());
  }
  liveVideo.srcObject = null;
  document.getElementById("placeholder").style.display = "flex";
});

// --- Phần PeerJS cho Viewer ---
// Tạo PeerJS client với ID tự động
const viewerPeer = new Peer(undefined, {
  host: 'live-hoctap-9a3.glitch.me',
  port: 443,
  path: '/peerjs/myapp',
  secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:relay1.expressturn.com:3478',
        username: 'efENPNJI04ST2ENN3C',
        credential: 'udPrjk4AqDfSh8SY'
      }
    ]
  }
});

viewerPeer.on('open', id => {
  console.log('Viewer PeerJS open with ID:', id);
  // Gửi ID viewer cho server để streamer gọi đến
  socket.emit("newViewer", { viewerId: id, roomId });
});

viewerPeer.on('call', call => {
  console.log("Viewer received call");
  // Viewer trả lời call (không cần gửi stream)
  call.answer();
  call.on('stream', stream => {
    console.log("Viewer received stream");
    const liveVideo = document.getElementById("liveVideo");
    liveVideo.srcObject = stream;
    document.getElementById("placeholder").style.display = "none";
    liveVideo.play().catch(err => console.error("Error playing remote video:", err));
  });
  call.on('close', () => {
    console.log("Call closed on viewer side");
    const liveVideo = document.getElementById("liveVideo");
    if (liveVideo.srcObject) {
      liveVideo.srcObject.getTracks().forEach(track => track.stop());
    }
    liveVideo.srcObject = null;
    document.getElementById("placeholder").style.display = "flex";
  });
});
