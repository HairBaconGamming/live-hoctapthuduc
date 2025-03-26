// /public/js/streamer.js

const socket = io();
const messageInput = document.getElementById("message"); // Nếu còn dùng input cũ (nếu không, sẽ sử dụng textarea)
const sendBtn = document.getElementById("sendBtn");         // Nếu có
const chatMessages = document.getElementById("chatMessages");
const viewerCount = document.getElementById("viewerCount");

// Gửi thông tin tham gia phòng qua Socket.IO
socket.emit("joinRoom", { roomId, username });

// Các sự kiện chat từ Socket.IO
socket.on("userJoined", msg => {
  const li = document.createElement("li");
  li.innerHTML = `<i>${msg}</i>`;
  chatMessages.appendChild(li);
});
socket.on("newMessage", data => {
  const li = document.createElement("li");
  // Thêm class dựa trên messageType
  if (data.message.messageType) {
    li.classList.add(`message-${data.message.messageType}`);
  }
  
  // Tạo phần tử icon
  const iconSpan = document.createElement("span");
  iconSpan.classList.add("msg-icon");
  
  // Tạo phần tử chứa nội dung tin nhắn
  let contentHtml = marked.parse(data.message.content || "");
  contentHtml = contentHtml.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  
  const contentSpan = document.createElement("span");
  // In đậm username và sau đó nội dung tin nhắn
  contentSpan.innerHTML = `<strong>${data.message.username}:</strong> ${contentHtml}`;
  
  // Tạo phần tử timestamp (hiển thị khi hover)
  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("msg-timestamp");
  // Định dạng timestamp (bạn có thể tùy chỉnh)
  const dateObj = new Date(data.message.timestamp);
  timestampSpan.textContent = dateObj.toLocaleTimeString();
  
  // Ghép các phần tử lại thành tin nhắn
  li.appendChild(iconSpan);
  li.appendChild(contentSpan);
  li.appendChild(timestampSpan);
  
  chatMessages.appendChild(li);
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
  let messageType = "host";
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

// --- Control Panel & Screen Sharing ---
const togglePanelBtn = document.getElementById("togglePanelBtn");
const controlPanel = document.getElementById("controlPanel");
togglePanelBtn.addEventListener("click", () => {
  controlPanel.classList.toggle("collapsed");
  togglePanelBtn.innerHTML = controlPanel.classList.contains("collapsed")
    ? '<i class="fas fa-chevron-down"></i>'
    : '<i class="fas fa-chevron-up"></i>';
});

// Hàm tạo và hiển thị modal confirm
function showCustomConfirm(message, onConfirm, onCancel) {
  let confirmModal = document.getElementById("customConfirmModal");
  if (!confirmModal) {
    // Nếu modal chưa có, tạo mới
    confirmModal = document.createElement("div");
    confirmModal.id = "customConfirmModal";
    confirmModal.className = "custom-confirm-modal";
    confirmModal.innerHTML = `
      <div class="confirm-overlay">
        <div class="confirm-box">
          <p class="confirm-message">${message}</p>
          <div class="confirm-buttons">
            <button class="confirm-btn btn-yes">Có</button>
            <button class="confirm-btn btn-no">Không</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
    
    // Gán sự kiện cho nút "Có"
    confirmModal.querySelector(".btn-yes").addEventListener("click", () => {
      if (onConfirm) onConfirm();
      closeCustomConfirm();
    });
    // Gán sự kiện cho nút "Không"
    confirmModal.querySelector(".btn-no").addEventListener("click", () => {
      if (onCancel) onCancel();
      closeCustomConfirm();
    });
  }
  // Cập nhật message nếu cần
  confirmModal.querySelector(".confirm-message").textContent = message;
  confirmModal.classList.add("active");
}

function closeCustomConfirm() {
  const confirmModal = document.getElementById("customConfirmModal");
  if (confirmModal) {
    confirmModal.classList.remove("active");
  }
}

// Xử lý nút "Kết thúc live"
document.getElementById("endStreamBtn").addEventListener("click", () => {
  showCustomConfirm("Bạn có chắc muốn kết thúc live stream không?", () => {
    // Khi người dùng xác nhận: gửi tín hiệu kết thúc và chuyển hướng
    socket.emit("endRoom", { roomId });
    window.location.href = "https://hoctap-9a3.glitch.me/live";
  }, () => {
    // Khi người dùng hủy
    console.log("Kết thúc live stream đã bị hủy");
  });
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

// Lắng nghe cuộc gọi đến từ viewer (nếu viewer gọi trực tiếp)
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

// Hàm gọi đến viewer (đóng call cũ nếu có)
function callViewer(viewerId) {
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

document.getElementById("shareScreenBtn").addEventListener("click", async () => {
  try {
    // Lấy stream chia sẻ màn hình (chỉ video)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true   // không lấy âm thanh từ màn hình
    });
    // Lấy stream từ mic (chỉ audio)
    const micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    });
    
    // Gộp các track video và audio thành một MediaStream duy nhất
    const combinedStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...micStream.getAudioTracks()
    ]);
    
    localStream = combinedStream;
    
    // Gán stream vào phần tử video hiển thị preview
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;
    
    // Cập nhật trạng thái nút toggle mic (bật mặc định)
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i> Mic On';
    
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
    console.error("Error during screen sharing with mic support:", err);
    alert("Không thể chia sẻ màn hình và mic. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});

// Thêm xử lý toggle mic
document.getElementById("toggleMicBtn").addEventListener("click", () => {
  if (!localStream) {
    alert("Chưa có stream, vui lòng chia sẻ màn hình trước.");
    return;
  }
  // Lấy các audio track trong localStream
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    alert("Không tìm thấy mic trong stream.");
    return;
  }
  // Toggle thuộc tính enabled của các track
  audioTracks.forEach(track => {
    track.enabled = !track.enabled;
    console.log(`Mic ${track.enabled ? "On" : "Off"}`);
  });
  // Cập nhật giao diện nút
  const toggleMicBtn = document.getElementById("toggleMicBtn");
  if (audioTracks[0].enabled) {
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i> Mic On';
  } else {
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Mic Off';
  }
});