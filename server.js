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
    return res
      .status(400)
      .json({ error: "Thiếu thông tin chủ phòng (roomOwnerId)." });
  }

  // Kiểm tra nếu user đã có 1 phòng live
  const existingRoom = liveRooms.find(room => room.ownerid === roomOwnerId);
  if (existingRoom) {
    return res.status(400).json({
      error: "Bạn đã có một phòng live đang hoạt động.",
      existingRoomUrl: existingRoom.liveStreamUrl,
      roomId: existingRoom.id
    });
  }

  const roomId = uuidv4();
  const liveStreamUrl = `https://live-hoctap-9a3.glitch.me/room/${roomId}`;
  const newRoom = {
    id: roomId,
    owner: roomOwnerName,
    ownerid: roomOwnerId,
    title: title || "Live Stream không tiêu đề",
    liveStreamUrl,
    viewers: 0,
    createdAt: new Date(),
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
  const roomsWithOnlineTime = liveRooms.map(room => {
    const now = new Date();
    const diffMs = now - new Date(room.createdAt); // hiệu chênh theo milliseconds
    const seconds = Math.floor(diffMs / 1000) % 60;
    const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const onlineTime = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return { ...room, onlineTime };
  });
  res.json(roomsWithOnlineTime);
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
    { expiresIn: "4h" }
  );
  res.json({ token });
});

/* =============================
    TRANG XEM LIVE STREAM (STREAMER hoặc KHÁCH)
============================= */
app.get("/room/:id", checkHoctapAuth, (req, res) => {
  const room = liveRooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).send("Room không tồn tại.");
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
    socket.username = username;
    const room = liveRooms.find(r => r.id === roomId);
    if (room) {
      if (username === room.owner) {
        room.hostSocketId = socket.id;
        console.log(`✅ Chủ phòng ${username} đã vào với socketId: ${socket.id}`);
      } else {
        room.viewers++;
        io.to(roomId).emit("updateViewers", room.viewers);
        io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`);
        // Thông báo cho chủ phòng có viewer mới
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit("newViewer", { viewerSocketId: socket.id });
        }
      }
    }
  });

  socket.on("keepAlive", ({ roomId }) => {
    console.log(`Keep-alive received for room ${roomId} from socket ${socket.id}`);
  });

  // Chat message
  socket.on("chatMessage", ({ roomId, username, message }) => {
    io.to(roomId).emit("newMessage", { username, message });
  });

  // Xử lý kết thúc phòng chỉ dành cho chủ phòng
  socket.on("endRoom", ({ roomId }) => {
    const room = liveRooms.find(r => r.id === roomId);
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại.");
      console.log(`❌ Phòng ${roomId} không tồn tại khi socket ${socket.id} cố gắng kết thúc.`);
      return;
    }
    if (socket.id !== room.hostSocketId) {
      socket.emit("errorMessage", "Bạn không có quyền kết thúc phòng này.");
      console.log(`❌ Socket ${socket.id} cố gắng kết thúc phòng ${roomId} nhưng không phải chủ phòng (${room.hostSocketId}).`);
      return;
    }
    io.to(roomId).emit("roomEnded");
    liveRooms = liveRooms.filter(r => r.id !== roomId);
    console.log(`✅ Phòng ${roomId} đã bị kết thúc bởi chủ phòng (socketId: ${socket.id}).`);
  });

  socket.on("screenShareEnded", ({ roomId }) => {
    io.to(roomId).emit("screenShareEnded");
    console.log(`📺 Screen share ended in room: ${roomId}`);
  });

  // Lưu ý: Firebase signaling được xử lý hoàn toàn ở client,
  // do đó ta không cần các sự kiện webrtcOffer, webrtcAnswer, webrtcCandidate từ socket.io.
  // Nếu cần dự phòng, bạn có thể giữ lại hoặc comment bỏ.
  // socket.on("webrtcOffer", ...);
  // socket.on("webrtcAnswer", ...);
  // socket.on("webrtcCandidate", ...);

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomId => {
      const room = liveRooms.find(r => r.id === roomId);
      if (room && socket.username && socket.username !== room.owner) {
        room.viewers = Math.max(0, room.viewers - 1);
        io.to(roomId).emit("updateViewers", room.viewers);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("👋 Client disconnected", socket.id);
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
