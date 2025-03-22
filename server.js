const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const bodyParser = require("body-parser");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const { checkHoctapAuth } = require("./middlewares/checkToken");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.JWT_SECRET;

// Cấu hình middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Tạm lưu các room đã tạo
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
    owner: roomOwnerName, // Lưu tên người dùng làm chủ phòng
    ownerid: roomOwnerId, // Lưu id của chủ phòng (để so sánh)
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
    TRANG XEM LIVE STREAM / ROOM (STREAMER hoặc KHÁCH)
============================= */
app.get("/room/:id", checkHoctapAuth, (req, res) => {
  const room = liveRooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).send("Room không tồn tại.");
  // So sánh: nếu room.ownerid (id của chủ phòng) bằng req.user.userId, thì là chủ phòng
  if (room.ownerid.toString() === req.user.userId.toString()) {
    res.render("streamer", { room, user: req.user });
  } else {
    res.render("liveRoom", { room, user: req.user });
  }
});

/* =============================
    SOCKET.IO CHAT REALTIME
============================= */
io.on("connection", socket => {
  console.log("💡 New client connected");
  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`);
    const room = liveRooms.find(r => r.id === roomId);
    if (room) {
      room.viewers++;
      io.to(roomId).emit("updateViewers", room.viewers);
    }
  });
  socket.on("chatMessage", ({ roomId, username, message }) => {
    io.to(roomId).emit("newMessage", { username, message });
  });
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

// Redirect root
app.get("/", (req, res) => {
  res.redirect("https://hoctap-9a3.glitch.me/");
});

server.listen(PORT, () => {
  console.log(`🚀 Live server running on port ${PORT}`);
});
