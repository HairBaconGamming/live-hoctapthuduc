// server.js
const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const bodyParser = require("body-parser");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Middleware: kiểm tra đăng nhập (giả sử có sẵn)
function isLoggedIn(req, res, next) {
  // Ví dụ: nếu có req.user thì đã đăng nhập; nếu không, trả về 401.
  if (req.user) return next();
  return res.status(401).send("Unauthorized: Please log in.");
}

// Middleware: kiểm tra token từ live-hoctap-9a3 (dùng JWT)
function checkHoctapAuth(req, res, next) {
  const token = req.query.token || req.headers["x-hoctap-token"];
  if (!token) {
    return res.status(401).send("Unauthorized: no token provided");
  }
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload; // payload: { userId, username, ... }
    next();
  } catch (err) {
    return res.status(401).send("Unauthorized: invalid token");
  }
}

// Cấu hình middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Tạm lưu các room (trong sản xuất nên dùng database)
let liveRooms = [];

/* =============================
    API TẠO ROOM LIVE STREAM
============================= */
app.post("/api/createStream", (req, res) => {
  const { roomOwnerId, roomOwnerName, title } = req.body;
  if (!roomOwnerId) {
    return res.status(400).json({ error: "Thiếu thông tin chủ phòng (roomOwnerId)." });
  }
  const roomId = uuidv4();
  const liveStreamUrl = `https://live-hoctap-9a3.glitch.me/room/${roomId}`;
  const newRoom = {
    id: roomId,
    owner: roomOwnerName,         // Tên chủ phòng
    ownerid: roomOwnerId,         // ID chủ phòng
    title: title || "Live Stream không tiêu đề",
    liveStreamUrl,
    viewers: 0,
    createdAt: new Date()
  };
  liveRooms.push(newRoom);
  console.log("✅ Room created:", newRoom);
  return res.json({
    success: true,
    liveStreamUrl,
    roomId
  });
});

/* =============================
    API LẤY DANH SÁCH ROOM ĐANG LIVE
============================= */
app.get("/api/rooms", (req, res) => {
  res.json(liveRooms);
});

/* =============================
    API LẤY TOKEN cho live stream
============================= */
app.get("/live/getToken", isLoggedIn, (req, res) => {
  const roomId = req.query.roomId;
  if (!roomId) {
    return res.status(400).json({ error: "RoomId không hợp lệ." });
  }
  const token = jwt.sign(
    { userId: req.user._id, username: req.user.username },
    SECRET_KEY,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

/* =============================
    TRANG XEM LIVE STREAM (STREAMER hoặc KHÁCH)
============================= */
app.get("/room/:id", checkHoctapAuth, (req, res) => {
  const room = liveRooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).send("Room không tồn tại.");
  // Phân biệt chủ phòng / khách
  if (room.ownerid.toString() === req.user.userId.toString()) {
    res.render("streamer", { room, user: req.user });
  } else {
    res.render("liveRoom", { room, user: req.user });
  }
});

/* =============================
    SOCKET.IO CHAT & CONTROL
============================= */
io.on("connection", socket => {
  console.log("💡 New client connected");
  
  // Khi user vào phòng
  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`);
    const room = liveRooms.find(r => r.id === roomId);
    if (room) {
      room.viewers++;
      io.to(roomId).emit("updateViewers", room.viewers);
    }
  });

  // Chat message
  socket.on("chatMessage", ({ roomId, username, message }) => {
    io.to(roomId).emit("newMessage", { username, message });
  });

  // Điều khiển stream (start/stop/end)
  socket.on("controlStream", ({ roomId, action }) => {
    io.to(roomId).emit("streamControl", { action });
    console.log(`Control stream action: ${action} in room ${roomId}`);
  });

  // Xử lý signaling WebRTC
  socket.on("webrtcOffer", ({ roomId, offer }) => {
    // Forward offer đến tất cả user khác trong room (trừ sender)
    socket.to(roomId).emit("webrtcOffer", { roomId, offer });
    console.log("webrtcOffer forwarded to room:", roomId);
  });

  socket.on("webrtcAnswer", ({ roomId, answer }) => {
    // Forward answer
    socket.to(roomId).emit("webrtcAnswer", { roomId, answer });
    console.log("webrtcAnswer forwarded to room:", roomId);
  });

  socket.on("webrtcCandidate", ({ roomId, candidate }) => {
    // Forward ICE candidate
    socket.to(roomId).emit("webrtcCandidate", { roomId, candidate });
    console.log("webrtcCandidate forwarded to room:", roomId);
  });

  // Xử lý user rời phòng
  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomId => {
      const room = liveRooms.find(r => r.id === roomId);
      if (room) {
        room.viewers--;
        io.to(roomId).emit("updateViewers", room.viewers);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("👋 Client disconnected");
  });
});

/* =============================
    Redirect root
============================= */
app.get("/", (req, res) => {
  res.redirect("https://hoctap-9a3.glitch.me/");
});

/* =============================
    START SERVER
============================= */
server.listen(PORT, () => {
  console.log(`🚀 Live server running on port ${PORT}`);
});
