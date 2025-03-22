// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API: Xác minh tài khoản và tạo phòng live stream
app.post("/livestream/create", async (req, res) => {
  const { verificationToken } = req.body;
  if (!verificationToken) {
    return res.status(400).json({ error: "Không có token xác minh." });
  }
  
  try {
    // Gửi yêu cầu xác minh tới API của hoctap-9a3
    const verificationResponse = await axios.post("https://hoctap-9a3.glitch.me/api/verifyAccount", {
      token: verificationToken,
      userId: req.user._id  // bạn có thể gửi thêm thông tin user nếu cần
    });
    
    if (!verificationResponse.data.verified) {
      return res.status(403).json({ error: "Xác minh tài khoản thất bại." });
    }
    
    // Nếu xác minh thành công, tạo room live stream mới (ví dụ sử dụng UUID)
    const roomId = uuidv4();
    liveRooms[roomId] = { createdBy: req.user._id, createdAt: new Date() };
    
    res.json({ success: true, roomId });
  } catch (error) {
    console.error("Error verifying account:", error);
    return res.status(500).json({ error: "Lỗi xác minh tài khoản, hãy thử lại sau." });
  }
});

// Một đối tượng để lưu trữ thông tin phòng (ví dụ đơn giản, sử dụng memory)
const liveRooms = {};

// Xử lý kết nối Socket.IO
io.on('connection', (socket) => {
  console.log("Client connected:", socket.id);

  // Client tham gia phòng live stream
  socket.on('joinRoom', (roomId) => {
    if (liveRooms[roomId]) {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
      // Thông báo cho các client trong room
      io.to(roomId).emit('userJoined', { socketId: socket.id });
    } else {
      socket.emit('error', { message: "Phòng không tồn tại." });
    }
  });

  // Xử lý tín hiệu (signaling) nếu bạn triển khai WebRTC
  socket.on('signal', (data) => {
    // data should include: roomId, signal info
    io.to(data.roomId).emit('signal', data);
  });

  socket.on('disconnect', () => {
    console.log("Client disconnected:", socket.id);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Server is running on port", port);
});
