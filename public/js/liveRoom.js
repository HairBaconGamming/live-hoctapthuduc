// /public/js/liveRoom.js
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
socket.on("roomEnded", () => {
  console.log("Room has ended.");
  // Ẩn phần nội dung chính
  const mainContent = document.getElementById("mainContent");
  if (mainContent) mainContent.style.display = "none";
  // Hiển thị overlay thông báo phòng đã kết thúc
  const overlay = document.getElementById("roomEndedOverlay");
  if (overlay) {
    overlay.classList.remove("active");
    // Force reflow để kích hoạt transition nếu có CSS animation
    void overlay.offsetWidth;
    overlay.classList.add("active");
  }
  // Tùy chọn: chuyển hướng về trang danh sách phòng sau vài giây
  setTimeout(() => {
    window.location.href = "https://hoctap-9a3.glitch.me/live";
  }, 15000);
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

// Đối với liveRoom, người xem sử dụng PeerJS client để nhận stream từ streamer
// Sử dụng new Peer() để tạo ID ngẫu nhiên cho viewer
const viewerPeer = new Peer();

viewerPeer.on('open', id => {
  console.log('Viewer PeerJS open with ID:', id);
  // Thông báo cho server (và từ đó cho streamer) rằng viewer này có ID là id
  socket.emit("newViewer", { viewerId: id, roomId });
});

viewerPeer.on('call', call => {
  console.log("meet call");
  call.answer(); // Viewer chỉ nhận stream
  console.log("ready call");
  call.on('stream', stream => {
    const liveVideo = document.getElementById("liveVideo");
    liveVideo.srcObject = stream;
    document.getElementById("placeholder").style.display = "none";
    liveVideo.play().catch(err => console.error("Error playing remote video:", err));
  });
});
