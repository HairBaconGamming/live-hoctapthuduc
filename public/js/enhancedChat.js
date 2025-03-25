// /public/js/enhancedChat.js

// Giả sử biến roomId, username, và user (object với thông tin người dùng) đã được định nghĩa toàn cục từ EJS
// Và socket đã được khởi tạo từ file chat gốc

// Lấy các phần tử
const chatInputArea = document.getElementById("chatInputArea");
const chatPreview = document.getElementById("chatPreview");
const sendChatBtn = document.getElementById("sendChatBtn");

// Cập nhật preview khi người dùng nhập nội dung
chatInputArea.addEventListener("input", () => {
  const rawText = chatInputArea.value;
  if (rawText !== undefined && rawText !== null) {
    let html = marked.parse(rawText);
    // xử lý html
    chatPreview.innerHTML = html;
  } else {
    chatPreview.innerHTML = "";
  }
  // Chuyển đổi Markdown sang HTML (sử dụng marked)
  let html = marked.parse(rawText);
  // Xử lý KaTeX: giả sử công thức được bao quanh bởi $$ ... $$
  html = html.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { throwOnError: false });
    } catch (e) {
      return `<span class="katex-error">${formula}</span>`;
    }
  });
  chatPreview.innerHTML = html;
});

// Khi nhấn nút gửi
sendChatBtn.addEventListener("click", () => {
  const messageContent = chatInputArea.value.trim();
  if (!messageContent) return;

  // Xác định loại message dựa trên vai trò của người dùng
  let messageType = "guest";
  if (user.username === room.owner) {  // giả sử room.owner chứa username của host
    messageType = "host";
  } else if (user.isPro) {
    messageType = "pro";
  }
  // Tùy chọn: các message hệ thống có thể được gửi riêng (ví dụ: từ server)

  // Tạo đối tượng message
  const messageObj = {
    username: user.username,
    content: messageContent,
    messageType: messageType,
    timestamp: new Date().toISOString()
  };

  // Gửi message qua socket (đảm bảo server xử lý và phát lại message kèm thông tin messageType)
  socket.emit("chatMessage", { roomId, message: messageObj });

  // Reset input và preview
  chatInputArea.value = "";
  chatPreview.innerHTML = "";
});
