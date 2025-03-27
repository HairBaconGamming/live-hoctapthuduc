// /public/js/streamer.js

const socket = io();

// Các phần tử giao diện chat cũ (nếu có)
const messageInput = document.getElementById("message"); // Nếu còn dùng input cũ
const sendBtn = document.getElementById("sendBtn");         // Nếu có
const chatMessages = document.getElementById("chatMessages");
const viewerCount = document.getElementById("viewerCount");

let localStream = null;
let currentMode = null;
let currentCall = {}; // Lưu call theo viewerId
const pendingViewers = []; // Viewer join trước khi stream sẵn sàng
const allViewers = new Set(); // Lưu tất cả viewer đã join (để re-call khi chia sẻ mới)

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

  // Tùy chọn: nút unpin nếu user là host
  if (user.username === roomOwner) {
    const unpinBtn = document.createElement("button");
    unpinBtn.classList.add("unpin-btn");
    //unpinBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
    unpinBtn.title = "Unpin comment";
    unpinBtn.addEventListener("click", () => {
      socket.emit("unpinComment", { roomId });
    });
    pinnedBox.appendChild(unpinBtn);
  }

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

peer.on('open', id => {
  console.log('PeerJS streamer open with ID:', id);
});

// Khi có viewer mới từ Socket.IO
socket.on("newViewer", ({ viewerId }) => {
  console.log("New viewer with ID: " + viewerId);
  allViewers.add(viewerId);
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

document.getElementById("shareScreenBtn").addEventListener("click", async () => {
  try {
    // Nếu có stream cũ, tắt nó đi
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
      // Xóa currentCall để làm mới
      currentCall = {};
    }
    // Lấy stream chia sẻ màn hình với video và audio
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    // Lấy stream từ mic (audio) riêng
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

    let mixedAudioStream = null;
    // Nếu cả display và mic đều có audio, trộn chúng lại
    if (displayStream.getAudioTracks().length > 0 && micStream && micStream.getAudioTracks().length > 0) {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      const displayAudioSource = audioContext.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks()));
      displayAudioSource.connect(destination);

      const micAudioSource = audioContext.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
      micAudioSource.connect(destination);

      mixedAudioStream = destination.stream;
    } else if (displayStream.getAudioTracks().length > 0) {
      mixedAudioStream = new MediaStream(displayStream.getAudioTracks());
    } else if (micStream && micStream.getAudioTracks().length > 0) {
      mixedAudioStream = new MediaStream(micStream.getAudioTracks());
    }

    if (!mixedAudioStream) {
      const toggleMicBtn = document.getElementById("toggleMicBtn");
      if (toggleMicBtn) {
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> No Mic';
        toggleMicBtn.disabled = true;
      }
      localStream = new MediaStream([...displayStream.getVideoTracks()]);
    } else {
      localStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...mixedAudioStream.getAudioTracks()
      ]);
    }

    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = localStream;

    const toggleMicBtn = document.getElementById("toggleMicBtn");
    if (toggleMicBtn) {
      if (micStream && micStream.getAudioTracks().length > 0) {
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
    
    // Sau khi tạo localStream mới, gọi lại tất cả các viewer trong allViewers
    allViewers.forEach(viewerId => {
      callViewer(viewerId);
    });
    
    currentMode = "screenShare";
  } catch (err) {
    console.error("Error during screen sharing with mic support:", err);
    alert("Không thể chia sẻ màn hình và mic. Vui lòng kiểm tra quyền hoặc thử trình duyệt khác.");
  }
});

// --- Chế độ Live Cam ---
document.getElementById("liveCamBtn").addEventListener("click", async () => {
  // Nếu đang ở chế độ live cam, nhấn lại sẽ dừng live cam
  if (currentMode === "liveCam" && localStream) {
    console.log("Stopping live cam...");
    localStream.getTracks().forEach(track => track.stop());
    const screenVideo = document.getElementById("screenShareVideo");
    screenVideo.srcObject = null;
    localStream = null;
    currentMode = null;
    socket.emit("screenShareEnded", { roomId });
    for (const viewerId in currentCall) {
      currentCall[viewerId].close();
    }
    const liveCamBtn = document.getElementById("liveCamBtn");
    liveCamBtn.innerHTML = '<i class="fas fa-camera"></i> Live Cam';
    return;
  }
  
  try {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      for (const viewerId in currentCall) {
        currentCall[viewerId].close();
      }
      currentCall = {};
    }
    let camStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log("Live Cam: Đã lấy được video và mic.");
    } catch (err) {
      console.warn("Không lấy được audio cho Live Cam, fallback sang video only.", err);
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
    
    allViewers.forEach(viewerId => {
      callViewer(viewerId);
    });
    
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

// Mở modal danh sách viewers
document.getElementById("viewersListBtn").addEventListener("click", () => {
  socket.emit("getViewersList", { roomId });
  document.getElementById("viewersModal").classList.add("active");
});

// Đóng modal
document.getElementById("closeViewersModal").addEventListener("click", () => {
  document.getElementById("viewersModal").classList.remove("active");
});

// Lắng nghe sự kiện cập nhật danh sách viewers
socket.on("updateViewersList", data => {
  const viewersListEl = document.getElementById("viewersList");
  viewersListEl.innerHTML = "";
  data.viewers.forEach(username => {
    const li = document.createElement("li");
    // Tạo span chứa tên viewer
    const nameSpan = document.createElement("span");
    nameSpan.textContent = username;
    
    // Tạo nút ban cho viewer (chỉ host sẽ thấy nút này)
    const banBtn = document.createElement("button");
    banBtn.classList.add("ban-btn");
    banBtn.textContent = "Ban";
    banBtn.addEventListener("click", () => {
      // Xác nhận ban
      if (confirm(`Bạn có chắc chắn muốn ban viewer "${username}" không?`)) {
        socket.emit("banViewer", { roomId, viewerUsername: username });
      }
    });
    
    li.appendChild(nameSpan);
    li.appendChild(banBtn);
    viewersListEl.appendChild(li);
  });
  // Lưu danh sách viewers vào biến toàn cục (nếu cần cho tìm kiếm)
  window.currentViewersList = data.viewers;
});

// Tìm kiếm trong danh sách viewers
document.getElementById("viewersSearch").addEventListener("input", function() {
  const query = this.value.toLowerCase();
  const liElements = document.querySelectorAll("#viewersList li");
  liElements.forEach(li => {
    if (li.textContent.toLowerCase().includes(query)) {
      li.style.display = "";
    } else {
      li.style.display = "none";
    }
  });
});

// Mở modal banned khi click nút
document.getElementById("bannedListBtn").addEventListener("click", () => {
  // Yêu cầu lấy danh sách banned từ server nếu có (ở đây ta sử dụng dữ liệu có trong room từ server, giả sử host có thể cập nhật thông qua socket)
  // Hoặc nếu bạn lưu danh sách banned cục bộ, bạn có thể hiển thị trực tiếp
  // Ví dụ: giả sử server phát event "updateBannedList" khi banned/unban
  socket.emit("getBannedList", { roomId });
  
  // Hiển thị modal
  document.getElementById("bannedModal").classList.add("active");
});

// Đóng modal banned
document.getElementById("closeBannedModal").addEventListener("click", () => {
  document.getElementById("bannedModal").classList.remove("active");
});

// Lắng nghe event cập nhật danh sách banned
socket.on("updateBannedList", data => {
  // data.banned is an array of viewer usernames banned in this room
  const bannedListEl = document.getElementById("bannedList");
  bannedListEl.innerHTML = "";
  data.banned.forEach(viewerUsername => {
    const li = document.createElement("li");
    li.textContent = viewerUsername;
    // Thêm nút unban cho mỗi viewer
    const unbanBtn = document.createElement("button");
    unbanBtn.textContent = "Unban";
    unbanBtn.addEventListener("click", () => {
      socket.emit("unbanViewer", { roomId, viewerUsername });
    });
    li.appendChild(unbanBtn);
    bannedListEl.appendChild(li);
  });
});

// Lấy canvas và context
const chatCanvas = document.getElementById("chatPipCanvas");
const canvasCtx = chatCanvas.getContext("2d");

// Kích thước canvas (tùy ý)
chatCanvas.width = 500;
chatCanvas.height = 700;

// Tạo video ẩn để gán stream canvas
const pipVideo = document.createElement("video");
pipVideo.style.display = "none";
document.body.appendChild(pipVideo);

// Tạo stream từ canvas (15 fps)
const chatStream = chatCanvas.captureStream(15);
pipVideo.srcObject = chatStream;

// Hàm vẽ background + bo góc
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Hàm cập nhật canvas theo layout “icon user” bên trái, message giữa, timestamp bên phải
function updateChatCanvas() {
  // Vẽ nền gradient full canvas
  const gradient = canvasCtx.createLinearGradient(0, 0, chatCanvas.width, 0);
  gradient.addColorStop(0, "#141e30");
  gradient.addColorStop(1, "#243b55");
  canvasCtx.fillStyle = gradient;
  canvasCtx.fillRect(0, 0, chatCanvas.width, chatCanvas.height);

  // Lấy messages
  const chatContainer = document.getElementById("chatMessages");
  if (!chatContainer) return;
  const messages = chatContainer.querySelectorAll("li");
  
  // Thiết lập font
  canvasCtx.font = "14px 'Poppins', sans-serif";
  canvasCtx.fillStyle = "#fff";
  
  let y = 30; // Vị trí y bắt đầu vẽ
  const lineHeight = 50; // Chiều cao mỗi item
  
  messages.forEach(msg => {
    const textContent = msg.textContent || "";
    // Tách tạm: username + message + timestamp
    // Hoặc parse logic do bạn lưu
    // Ở đây giả sử format: "username: message hh:mm:ss"
    
    // Giả sử username, message, timestamp tách bằng ' '
    // => Cần tách cẩn thận, ví dụ parse logic
    // Ở đây demo: 
    // "truonghoangnam: no 11:48:59 PM"
    // => user: "truonghoangnam", content: "no", time: "11:48:59 PM"

    // Tìm vị trí time => parse
    // Demo: cắt time = 8 ký tự cuối => "hh:mm:ss X"
    const timeStr = textContent.slice(-11); // cắt "11:48:59 PM"
    const mainStr = textContent.slice(0, -11).trim(); // "truonghoangnam: no"
    
    let userName = "User";
    let content = mainStr;
    // Tách userName ra nếu có ':'
    const colonIndex = mainStr.indexOf(":");
    if (colonIndex !== -1) {
      userName = mainStr.slice(0, colonIndex).trim();
      content = mainStr.slice(colonIndex + 1).trim();
    }
    
    // Vẽ 1 "dòng" chat
    // Bối cảnh: 
    //  - icon user: 10, y => 32x32 icon
    //  - userName + content: ~60, y => text
    //  - timestamp: canvas.width - 60, y => text
    // Tạo 1 background bo góc nếu muốn
    canvasCtx.save();
    canvasCtx.fillStyle = "rgba(255,255,255,0.1)";
    drawRoundedRect(canvasCtx, 10, y - 20, chatCanvas.width - 20, 40, 8);
    canvasCtx.fill();
    canvasCtx.restore();

    // Vẽ icon user (demo: 1 rect)
    // Muốn vẽ icon Font, bạn cần "drawImage" icon hoặc sprite
    canvasCtx.save();
    canvasCtx.fillStyle = "#00ffea";
    canvasCtx.fillRect(20, y - 10, 20, 20); // demo icon = ô vuông
    canvasCtx.restore();

    // Vẽ userName + content
    canvasCtx.fillText(`${userName}: ${content}`, 50, y);
    
    // Vẽ timestamp ở góc phải
    const timeWidth = canvasCtx.measureText(timeStr).width;
    canvasCtx.fillText(timeStr, chatCanvas.width - timeWidth - 20, y);
    
    y += lineHeight;
  });
}

// Cập nhật canvas mỗi 0.1s
setInterval(updateChatCanvas, 100);

// Nút kích hoạt PiP
document.getElementById("pipChatBtn").addEventListener("click", async () => {
  try {
    await pipVideo.play();
    await pipVideo.requestPictureInPicture();
    console.log("PiP chat activated!");
  } catch (err) {
    console.error("Error enabling PiP chat:", err);
    alert("Không thể bật chế độ PiP cho chat, vui lòng thử lại.");
  }
});