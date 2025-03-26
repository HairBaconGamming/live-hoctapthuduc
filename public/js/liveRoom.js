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
  if (data.message.messageType) {
    li.classList.add(`message-${data.message.messageType}`);
  }
  
  // Tạo icon hiển thị kiểu message (như trước)
  const iconSpan = document.createElement("span");
  iconSpan.classList.add("msg-icon");
  
  let contentHtml = marked.parse(data.message.content || "");
  contentHtml = contentHtml.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  
  const contentSpan = document.createElement("span");
  contentSpan.innerHTML = `<strong>${data.message.username}:</strong> ${contentHtml}`;
  
  // Tạo nút Pin nếu người dùng hiện tại là host
  if (user.username === roomOwner) { // biến user và roomOwner được định nghĩa từ EJS
    const pinBtn = document.createElement("button");
    pinBtn.classList.add("pin-btn");
    pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    pinBtn.title = "Pin comment";
    pinBtn.addEventListener("click", () => {
      // Gửi sự kiện pin comment tới server
      socket.emit("pinComment", { roomId, message: data.message });
    });
    li.appendChild(pinBtn);
  }
  
  // Tạo timestamp hiển thị khi hover
  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("msg-timestamp");
  const dateObj = new Date(data.message.timestamp);
  timestampSpan.textContent = dateObj.toLocaleTimeString();
  
  li.appendChild(iconSpan);
  li.appendChild(contentSpan);
  li.appendChild(timestampSpan);
  
  chatMessages.appendChild(li);
});
socket.on("commentPinned", data => {
  const pinnedDiv = document.getElementById("pinnedComment");
  
  // Xóa cũ
  pinnedDiv.innerHTML = "";
  pinnedDiv.classList.remove("fade-in");
  
  // Kiểm tra nếu message rỗng => unpin
  if (!data.message || !data.message.content) {
    return; // Không còn comment ghim
  }

  // Tạo div pinned-box
  const pinnedBox = document.createElement("div");
  pinnedBox.classList.add("pinned-box");

  // Icon ghim
  const pinIcon = document.createElement("span");
  pinIcon.classList.add("pin-icon");
  pinIcon.innerHTML = '<i class="fas fa-thumbt"></i>';

  // Container nội dung
  const pinnedContent = document.createElement("div");
  pinnedContent.classList.add("pinned-content");

  // Username
  const userSpan = document.createElement("span");
  userSpan.classList.add("pinned-user");
  userSpan.textContent = data.message.username;

  // Nội dung text (đã parse Markdown + KaTeX nếu muốn)
  let contentHtml = marked.parse(data.message.content || "");
  contentHtml = contentHtml.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  const textSpan = document.createElement("span");
  textSpan.classList.add("pinned-text");
  textSpan.innerHTML = contentHtml;

  // Timestamp
  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("pinned-timestamp");
  timestampSpan.textContent = new Date(data.message.timestamp).toLocaleTimeString();

  // Gắn các phần tử
  pinnedContent.appendChild(userSpan);
  pinnedContent.appendChild(textSpan);

  pinnedBox.appendChild(pinIcon);
  pinnedBox.appendChild(pinnedContent);
  pinnedBox.appendChild(timestampSpan);

  pinnedDiv.appendChild(pinnedBox);
  
  // Thêm animation fade-in
  pinnedDiv.classList.add("fade-in");
});
function unpinComment() {
  socket.emit("unpinComment", { roomId });
  document.getElementById("pinnedComment").innerHTML = "";
}
socket.on("updateViewers", count => {
  viewerCount.textContent = count;
});
socket.on("hostJoined", () => {
  // Ẩn overlay "chờ"
  const waitingOverlay = document.getElementById("waitingOverlay");
  if (waitingOverlay) waitingOverlay.classList.remove("active");
});
socket.on("waiting", () => {
  const waitingOverlay = document.getElementById("waitingOverlay");
  if (waitingOverlay) waitingOverlay.classList.add("active");
});
// Nếu vẫn sử dụng input cũ (nếu có)
if(sendBtn && messageInput){
  sendBtn.addEventListener("click", () => {
    const message = messageInput.value.trim();
    if (!message) return;
    socket.emit("chatMessage", { roomId, username, message: message });
    messageInput.value = "";
  });
  messageInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });
}
// --- Enhanced Chat Input for Streamer ---
const chatInputArea = document.getElementById("chatInputArea");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatPreview = document.getElementById("chatPreview");

// Cập nhật preview khi người dùng nhập nội dung
chatInputArea.addEventListener("input", () => {
  const rawText = chatInputArea.value || "";
  let html = marked.parse(rawText);
  // Render KaTeX cho công thức được bao quanh bởi $$ ... $$
  html = html.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  chatPreview.innerHTML = html;
});

// Khi nhấn nút gửi từ chat input nâng cao
sendChatBtn.addEventListener("click", () => {
  const messageContent = chatInputArea.value.trim();
  if (!messageContent) return;

  // Xác định loại message: nếu streamer thì loại là "host"
  let messageType = "guest";
  if (user.isPro && username !== roomOwner) {
    messageType = "pro";
  }
  // Tạo đối tượng message
  const messageObj = {
    username: username,
    content: messageContent,
    messageType: messageType,
    timestamp: new Date().toISOString()
  };

  // Gửi message qua Socket.IO
  socket.emit("chatMessage", { roomId, message: messageObj });

  // Reset input và preview
  chatInputArea.value = "";
  chatPreview.innerHTML = "";
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
  const waitingOverlay = document.getElementById("waitingOverlay");
  if (waitingOverlay) waitingOverlay.classList.remove("active");
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

const liveVideo = document.getElementById("liveVideo");

// Sau khi video đã nhận được stream và loaded metadata:
liveVideo.addEventListener("loadedmetadata", () => {
  // Tính toán tỉ lệ của video stream
  const ratio = liveVideo.videoWidth / liveVideo.videoHeight;
  // Áp dụng vào container video-wrapper (hoặc trực tiếp cho video)
  const videoWrapper = document.querySelector(".video-wrapper");
  videoWrapper.style.aspectRatio = `${liveVideo.videoWidth} / ${liveVideo.videoHeight}`;
  console.log("Aspect ratio set to:", videoWrapper.style.aspectRatio);
});
liveVideo.addEventListener('pause', () => {
  console.log("Video bị pause => tự động play lại");
  liveVideo.play().catch(err => {
    console.warn("Không thể play video:", err);
  });
});