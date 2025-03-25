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
const viewerPeer = new Peer(roomId); // ID tự động cấp
viewerPeer.on('open', id => {
  console.log('Viewer PeerJS open with ID:', id);
  // Thông báo cho server (và từ đó cho streamer) rằng viewer này có ID là id
  socket.emit("newViewer", { viewerId: id, roomId });
});
viewerPeer.on('call', call => {
  call.answer(); // Viewer chỉ nhận stream
  call.on('stream', stream => {
    const liveVideo = document.getElementById("liveVideo");
    liveVideo.srcObject = stream;
    document.getElementById("placeholder").style.display = "none";
    liveVideo.play().catch(err => console.error("Error playing remote video:", err));
  });
});
