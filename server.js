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

// Middleware: kiểm tra token từ live-hoctap-9a3
function checkHoctapAuth(req, res, next) {
  const token = req.query.token || req.headers["x-hoctap-token"];
  if (!token) {
    return res.status(401).send("Unauthorized: no token provided");
  }
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload; // payload chứa userId, username, ...
    next();
  } catch (err) {
    return res.status(401).send("Unauthorized: invalid token");
  }
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

// Tạm lưu các room (trong production dùng DB)
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
    owner: roomOwnerName,    // Lưu tên chủ phòng
    ownerid: roomOwnerId,     // Lưu id của chủ phòng (để so sánh)
    title: title || "Live Stream không tiêu đề",
    liveStreamUrl,
    viewers: 0,
    createdAt: new Date()
  };
  liveRooms.push(newRoom);
  console.log("✅ Room created:", newRoom);
  return res.json({ success: true, liveStreamUrl, roomId });
});

/* =============================
    API LẤY DS ROOM LIVE STREAM
============================= */
app.get("/api/rooms", (req, res) => {
  res.json(liveRooms);
});

/* =============================
    API LẤY TOKEN cho live stream
============================= */
app.get("/live/getToken", (req, res) => {
  // Giả sử hệ thống hoctap-9a3 đã kiểm tra đăng nhập và gán req.user
  if (!req.user) {
    return res.status(401).json({ error: "Chưa đăng nhập." });
  }
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
  // Nếu ownerid của room bằng userId từ token, thì là chủ phòng
  if (room.ownerid.toString() === req.user.userId.toString()) {
    res.render("streamer", { room, user: req.user });
  } else {
    res.render("liveRoom", { room, user: req.user });
  }
});

/* =============================
    SIGNALING với WebRTC qua Socket.IO
============================= */
// Dùng để lưu các peerConnection của broadcaster cho từng watcher
const peerConnections = {};

io.on("connection", socket => {
  console.log("💡 New client connected:", socket.id);
  
  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`);
    const room = liveRooms.find(r => r.id === roomId);
    if (room) {
      room.viewers++;
      io.to(roomId).emit("updateViewers", room.viewers);
    }
  });

  // Dành cho broadcaster: khi có watcher mới, server thông báo cho broadcaster
  socket.on("broadcaster", (roomId) => {
    socket.broadcast.to(roomId).emit("watcher", socket.id);
  });

  // Chuyển tiếp signaling offer từ broadcaster đến watcher
  socket.on("offer", ({ offer, roomId, to }) => {
    io.to(to).emit("offer", { offer, from: socket.id });
  });
  
  // Chuyển tiếp signaling answer từ watcher đến broadcaster
  socket.on("answer", ({ answer, roomId, to }) => {
    io.to(to).emit("answer", { answer, watcherId: socket.id });
  });
  
  // Chuyển tiếp ICE candidate
  socket.on("candidate", ({ candidate, roomId, to }) => {
    io.to(to).emit("candidate", { candidate, from: socket.id });
  });
  
  socket.on("controlStream", ({ roomId, action }) => {
    io.to(roomId).emit("streamControl", { action });
    console.log(`Control stream action: ${action} in room ${roomId}`);
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
    console.log("👋 Client disconnected:", socket.id);
  });
});

/* =============================
    REDIRECT ROOT
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
