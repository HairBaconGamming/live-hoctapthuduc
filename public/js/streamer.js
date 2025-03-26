// /public/js/streamer.js

const socket = io();

// Các phần tử giao diện chat cũ (nếu có)
const messageInput = document.getElementById("message"); // Nếu còn dùng input cũ
const sendBtn = document.getElementById("sendBtn");         // Nếu có
const chatMessages = document.getElementById("chatMessages");
const viewerCount = document.getElementById("viewerCount");

// Gửi thông tin tham gia phòng qua Socket.IO
socket.emit("joinRoom", { roomId, username });

// Sự kiện socket
socket.on("redirectToLive", msg => {
  alert(msg);
  window.location.href = "https://hoctap-9a3.glitch.me/live";
});
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
  // Tạo icon cho tin nhắn
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

  // Tạo timestamp (hiển thị khi hover)
  const timestampSpan = document.createElement("span");
  timestampSpan.classList.add("msg-timestamp");
  const dateObj = new Date(data.message.timestamp);
  timestampSpan.textContent = dateObj.toLocaleTimeString();

  li.appendChild(iconSpan);
  li.appendChild(contentSpan);
  li.appendChild(timestampSpan);

  chatMessages.appendChild(li);
});
socket.on("updateViewers", count => {
  viewerCount.textContent = count;
});

// Nếu còn sử dụng input cũ (dự phòng)
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

// --- Enhanced Chat Input ---
// Sử dụng textarea và preview
const chatInputArea = document.getElementById("chatInputArea");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatPreview = document.getElementById("chatPreview");

chatInputArea.addEventListener("input", () => {
  const rawText = chatInputArea.value || "";
  let html = marked.parse(rawText);
  html = html.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  chatPreview.innerHTML = html;
});

sendChatBtn.addEventListener("click", () => {
  const messageContent = chatInputArea.value.trim();
  if (!messageContent) return;

  // Xác định loại message: chủ phòng => "host", nếu là PRO và không phải host thì "pro"
  let messageType = "host";
  if (user.isPro && username !== roomOwner) {
    messageType = "pro";
  }
  const messageObj = {
    username: username,
    content: messageContent,
    messageType: messageType,
    timestamp: new Date().toISOString()
  };
  socket.emit("chatMessage", { roomId, message: messageObj });
  chatInputArea.value = "";
  chatPreview.innerHTML = "";
});

// --- Control Panel & Modal Confirm ---
const togglePanelBtn = document.getElementById("togglePanelBtn");
const controlPanel = document.getElementById("controlPanel");
togglePanelBtn.addEventListener("click", () => {
  controlPanel.classList.toggle("collapsed");
  togglePanelBtn.innerHTML = controlPanel.classList.contains("collapsed")
    ? '<i class="fas fa-chevron-down"></i>'
    : '<i class="fas fa-chevron-up"></i>';
});

function showCustomConfirm(message, onConfirm, onCancel) {
  let confirmModal = document.getElementById("customConfirmModal");
  if (!confirmModal) {
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
    confirmModal.querySelector(".btn-yes").addEventListener("click", () => {
      if (onConfirm) onConfirm();
      closeCustomConfirm();
    });
    confirmModal.querySelector(".btn-no").addEventListener("click", () => {
      if (onCancel) onCancel();
      closeCustomConfirm();
    });
  }
  confirmModal.querySelector(".confirm-message").textContent = message;
  confirmModal.classList.add("active");
}

function closeCustomConfirm() {
  const confirmModal = document.getElementById("customConfirmModal");
  if (confirmModal) {
    confirmModal.classList.remove("active");
  }
}

document.getElementById("endStreamBtn").addEventListener("click", () => {
  showCustomConfirm("Bạn có chắc muốn kết thúc live stream không?", () => {
    socket.emit("endRoom", { roomId });
    window.location.href = "https://hoctap-9a3.glitch.me/live";
  }, () => {
    console.log("Kết thúc live stream đã bị hủy");
  });
});

// --- Phần PeerJS & Streaming ---
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
let currentCall = {}; // Lưu call theo viewerId
const pendingViewers = [];

peer.on('open', id => {
  console.log('PeerJS streamer open with ID:', id);
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

// Hàm gọi đến viewer
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

// --- Toggle Mic ---
async function checkMicAvailability() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === "audioinput");
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    if (audioInputs.length === 0) {
      toggleMicBtn.disabled = true;
      toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
      console.log("Không có mic được phát hiện.");
    } else {
      toggleMicBtn.disabled = false;
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra mic:", err);
  }
}
async function checkCameraAvailabilityAndRequestPermission() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === "videoinput");
    const liveCamBtn = document.getElementById("liveCamBtn");
    if (videoInputs.length === 0) {
      liveCamBtn.disabled = true;
      liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> No Camera';
      console.log("Không có camera được phát hiện.");
      return;
    }
    // Thử yêu cầu truy cập camera để kích hoạt quyền (nếu chưa được cấp)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      // Nếu thành công, ngay lập tức dừng tất cả các track để giải phóng camera
      stream.getTracks().forEach(track => track.stop());
      liveCamBtn.disabled = false;
      liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> Live Cam';
    } catch (err) {
      console.error("Chưa được cấp quyền camera:", err);
      // Nếu chưa được cấp quyền, thông báo cho người dùng
      liveCamBtn.disabled = true;
      liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> Grant Camera Permission';
      alert("Vui lòng cấp quyền truy cập camera để sử dụng Live Cam.");
    }
  } catch (err) {
    console.error("Lỗi khi kiểm tra camera:", err);
  }
}
checkCameraAvailabilityAndRequestPermission();
checkMicAvailability();

// --- Chế độ Share Screen ---
document.getElementById("shareScreenBtn").addEventListener("click", async () => {
  try {
    // Nếu có stream cũ, tắt nó đi
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
    }
    // Lấy stream chia sẻ màn hình (video)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    // Lấy stream mic (audio), cố gắng lấy nhưng nếu không có thì fallback
    let micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });
    } catch (micErr) {
      console.warn("Không lấy được mic: ", micErr);
      micStream = null;
    }
    if (micStream) {
      localStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...micStream.getAudioTracks()
      ]);
    } else {
      localStream = new MediaStream([...displayStream.getVideoTracks()]);
      const toggleMicBtn = document.getElementById("toggleMicBtn");
      if (toggleMicBtn) {
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
      }
    }
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;

    // Cập nhật nút toggle mic dựa trên mic có hay không
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    if (toggleMicBtn) {
      if (micStream) {
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i> Mic On';
        toggleMicBtn.disabled = false;
      } else {
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
        toggleMicBtn.disabled = true;
      }
    }
    
    localStream.getVideoTracks()[0].addEventListener("ended", () => {
      console.log("User stopped screen sharing");
      screenVideo.srcObject = null;
      localStream = null;
      socket.emit("screenShareEnded", { roomId });
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
    });
    
    while (pendingViewers.length) {
      const viewerId = pendingViewers.shift();
      callViewer(viewerId);
    }
  } catch (err) {
    console.error("Error during screen sharing with mic support:", err);
    alert("Không thể chia sẻ màn hình và mic. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});

// Global variable to track current streaming mode ("liveCam", "screenShare", or null)
let currentMode = null;

document.getElementById("liveCamBtn").addEventListener("click", async () => {
  // Nếu đang ở chế độ live cam, nhấn lại sẽ dừng live cam
  if (currentMode === "liveCam" && localStream) {
    console.log("Stopping live cam...");
    // Dừng tất cả các track trong localStream
    localStream.getTracks().forEach(track => track.stop());
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = null;
    localStream = null;
    currentMode = null;
    // Phát sự kiện để thông báo cho viewer
    socket.emit("screenShareEnded", { roomId });
    // Cập nhật giao diện nút live cam về trạng thái "Live Cam"
    const liveCamBtn = document.getElementById("liveCamBtn");
    liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> Live Cam';
    return;
  }
  
  // Nếu chưa live cam, bắt đầu live cam
  try {
    // Nếu có stream cũ, dừng nó
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
    }
    let camStream;
    try {
      // Thử lấy stream với cả video và audio
      camStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log("Live Cam: Đã lấy được video và mic.");
    } catch (err) {
      console.warn("Không lấy được audio cho Live Cam, fallback sang video only.", err);
      // Nếu không lấy được audio, fallback sang chỉ lấy video
      camStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      const toggleMicBtn = document.getElementById("toggleMicBtn");
      if (toggleMicBtn) {
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
        toggleMicBtn.disabled = true;
      }
    }
    
    localStream = camStream;
    currentMode = "liveCam";
    
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;
    
    // Khi người dùng dừng live cam (ví dụ: thông qua giao diện của thiết bị)
    localStream.getVideoTracks()[0].addEventListener("ended", () => {
      console.log("User stopped live cam");
      screenVideo.srcObject = null;
      localStream = null;
      currentMode = null;
      socket.emit("screenShareEnded", { roomId });
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
      const liveCamBtn = document.getElementById("liveCamBtn");
      liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> Live Cam';
    });
    
    // Nếu có viewer pending, gọi chúng ngay
    while (pendingViewers.length) {
      const viewerId = pendingViewers.shift();
      callViewer(viewerId);
    }
    
    // Cập nhật nút hiển thị "Stop Live Cam"
    const liveCamBtn = document.getElementById("liveCamBtn");
    liveCamBtn.innerHTML = '<i class="fas fa-stop"></i> Dừng Live Cam';
  } catch (err) {
    console.error("Error during live cam:", err);
    alert("Không thể bật Live Cam. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});

document.getElementById("toggleMicBtn").addEventListener("click", () => {
  if (!localStream) {
    alert("Chưa có stream, vui lòng chia sẻ màn hình hoặc live cam trước.");
    return;
  }
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    alert("Bạn không có mic!");
    const toggleMicBtn = document.getElementById("toggleMicBtn");
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
    toggleMicBtn.disabled = true;
    return;
  }
  audioTracks.forEach(track => {
    track.enabled = !track.enabled;
    console.log(`Mic ${track.enabled ? "On" : "Off"}`);
  });
  const toggleMicBtn = document.getElementById("toggleMicBtn");
  if (audioTracks[0].enabled) {
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i> Mic On';
  } else {
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Mic Off';
  }
});

// Gửi event hostJoined (có thể dùng khi host vào phòng)
socket.emit("hostJoined", { roomId });
