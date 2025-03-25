// /public/js/streamer.js

const socket = io();
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const chatMessages = document.getElementById("chatMessages");
const viewerCount = document.getElementById("viewerCount");

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
  togglePanelBtn.innerHTML = controlPanel.classList.contains("collapsed")
    ? '<i class="fas fa-chevron-down"></i>'
    : '<i class="fas fa-chevron-up"></i>';
});

// Xử lý kết thúc live stream
document.getElementById("endStreamBtn").addEventListener("click", () => {
  socket.emit("endRoom", { roomId });
  alert("Live stream đã kết thúc.");
  window.location.href = "https://hoctap-9a3.glitch.me/live";
});

// --- Phần PeerJS cho Streamer ---
// Sử dụng roomId làm Peer ID cho streamer
const peer = new Peer(roomId, {
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

let localStream = null;
let currentCall = {}; // Lưu các call đang hoạt động theo viewerId
const pendingViewers = [];

peer.on('open', id => {
  console.log('PeerJS streamer open with ID:', id);
});

// Lắng nghe cuộc gọi đến (nếu viewer gọi trực tiếp)
peer.on('call', call => {
  if (localStream) {
    call.answer(localStream);
  } else {
    console.error('Local stream chưa sẵn sàng để trả lời cuộc gọi.');
  }
});

// Khi có viewer mới từ Socket.IO
socket.on("newViewer", ({ viewerId }) => {
  console.log("New viewer with ID: " + viewerId);
  if (!localStream) {
    console.warn("Local stream chưa sẵn sàng, thêm viewer vào pending.");
    pendingViewers.push(viewerId);
  } else {
    callViewer(viewerId);
  }
});

// Hàm gọi đến viewer (đóng call cũ nếu cần)
function callViewer(viewerId) {
  // Nếu đã có call cũ, đóng nó đi
  if (currentCall[viewerId]) {
    currentCall[viewerId].close();
  }
  console.log("Gọi đến viewer: " + viewerId);
  const call = peer.call(viewerId, localStream);
  currentCall[viewerId] = call;
  call.on('error', err => console.error('Call error:', err));
  call.on('close', () => {
    console.log("Call đóng với viewer: " + viewerId);
    delete currentCall[viewerId];
  });
}

// Bắt đầu chia sẻ màn hình
document.getElementById("shareScreenBtn").addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;

    // Khi người dùng dừng chia sẻ màn hình
    localStream.getVideoTracks()[0].addEventListener("ended", () => {
      console.log("User stopped screen sharing");
      screenVideo.srcObject = null;
      localStream = null;
      socket.emit("screenShareEnded", { roomId });
      // Đóng tất cả các call đang hoạt động
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
    });

    // Nếu có viewer pending, gọi chúng ngay
    while (pendingViewers.length) {
      const viewerId = pendingViewers.shift();
      callViewer(viewerId);
    }
  } catch (err) {
    console.error("Error during screen sharing:", err);
    alert("Không thể chia sẻ màn hình. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});
