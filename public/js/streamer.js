// /public/js/streamer.js
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

// --- Phần tích hợp PeerJS cho Streamer ---
// Tạo PeerJS client cho streamer sử dụng roomId làm ID
const peer = new Peer(undefined, {
  host: '/',      // Thay đổi host/port/path tùy theo cấu hình PeerJS server của bạn
  port: '3001',     // Ví dụ: cổng của PeerJS serverp
});

let localStream = null;
const pendingViewers = [];

// Khi kết nối PeerJS mở thành công
peer.on('open', id => {
  console.log('PeerJS streamer open with ID:', id);
});

// Lắng nghe cuộc gọi đến từ viewer (nếu viewer gọi trực tiếp)
peer.on('call', call => {
  if (localStream) {
    call.answer(localStream);
  } else {
    console.error('Local stream chưa sẵn sàng để trả lời cuộc gọi.');
  }
});

// Nhận thông báo viewer mới từ Socket.IO (chứa viewerId)
socket.on("newViewer", ({ viewerId }) => {
  console.log("khach moi voi id "+viewerId);
  if (!localStream) {
    console.warn("Local stream chưa sẵn sàng, lưu viewer:", viewerId);
    pendingViewers.push(viewerId);
  } else {
    const call = peer.call(viewerId, localStream);
    call.on('error', err => console.error('Call error:', err));
  }
});

// Bắt đầu chia sẻ màn hình qua PeerJS
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
    });
    // Gọi đến các viewer đang chờ
    while (pendingViewers.length) {
      const viewerId = pendingViewers.shift();
      const call = peer.call(viewerId, localStream);
      call.on('error', err => console.error('Call error:', err));
    }
  } catch (err) {
    console.error("Error during screen sharing:", err);
    alert("Không thể chia sẻ màn hình. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});
