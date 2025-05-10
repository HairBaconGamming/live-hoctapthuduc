// app/server.js
const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const bodyParser = require("body-parser");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const { ExpressPeerServer } = require("peer"); // Import ExpressPeerServer

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Khởi tạo PeerJS server, ví dụ chạy dưới path "/peerjs"
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: "/myapp",
});

const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Middleware: kiểm tra đăng nhập (giả sử có sẵn)
function isLoggedIn(req, res, next) {
  if (req.user) return next();
  return res.status(401).send("Unauthorized: Please log in.");
}

// Middleware: kiểm tra token (dùng JWT)
function checkHoctapAuth(req, res, next) {
  const token = req.query.token || req.headers["x-hoctap-token"];
  if (!token) {
    return res.status(401).send("Unauthorized: no token provided");
  }
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).send("Unauthorized: invalid token");
  }
}

// Cấu hình middleware
app.use("/peerjs", peerServer);
app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "img-src 'self' https://cdn.glitch.global https://gc.kis.v2.scr.kaspersky-labs.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://gc.kis.v2.scr.kaspersky-labs.com wss://gc.kis.v2.scr.kaspersky-labs.com; " +
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;"
  );
  next();
});
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// Tạm lưu các room (trong production nên dùng database)
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
  // Kiểm tra xem user đã có phòng live chưa
  const existingRoom = liveRooms.find((room) => room.ownerid === roomOwnerId);
  if (existingRoom) {
    return res.json({
      error: "Bạn đã có một phòng live đang hoạt động.",
      existingRoomUrl: existingRoom.liveStreamUrl,
      roomId: existingRoom.id,
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
    isLive: false, // Ban đầu phòng chưa live (chờ host)
    bannedViewers: [],
    viewersList: [],
  };
  liveRooms.push(newRoom);
  console.log("✅ Room created:", newRoom);
  return res.json({ success: true, liveStreamUrl, roomId });
});

/* =============================
    API LẤY DANH SÁCH ROOM ĐANG LIVE
============================= */
app.get("/api/rooms", (req, res) => {
  const roomsWithOnlineTime = liveRooms.map((room) => {
    const now = new Date();
    const diffMs = now - new Date(room.createdAt);
    const seconds = Math.floor(diffMs / 1000) % 60;
    const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const onlineTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return { ...room, onlineTime };
  });
  res.json(roomsWithOnlineTime);
});

/* =============================
    API LẤY TOKEN cho live stream (nếu cần)
============================= */
app.get("/live/getToken", isLoggedIn, (req, res) => {
  const roomId = req.query.roomId;
  if (!roomId) {
    return res.status(400).json({ error: "RoomId không hợp lệ." });
  }
  const token = jwt.sign(
    { userId: req.user._id, username: req.user.username },
    SECRET_KEY,
    { expiresIn: "5h" }
  );
  res.json({ token });
});

/* =============================
    TRANG XEM LIVE STREAM (STREAMER hoặc KHÁCH)
============================= */
app.get("/room/:id", checkHoctapAuth, (req, res) => {
  const room = liveRooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).send("Room không tồn tại.");

  // Nếu người dùng là chủ phòng, cập nhật isLive thành true
  if (room.ownerid.toString() === req.user.userId.toString()) {
    room.isLive = true;
    res.render("streamer", { room, user: req.user });
  } else {
    // Viewer join: Họ có thể thấy trạng thái chờ nếu phòng chưa live
    res.render("liveRoom", { room, user: req.user });
  }
});

/* =============================
    SOCKET.IO CHAT & CONTROL
============================= */
io.on("connection", (socket) => {
  console.log("💡 New client connected");

  socket.on("joinRoom", ({ roomId, username }) => {
    socket.join(roomId);
    socket.username = username;
    const room = liveRooms.find((r) => r.id === roomId);
    if (room) {
      // Kiểm tra nếu viewer bị ban
      if (room.bannedViewers.includes(username)) {
        socket.emit("banned", "Bạn đã bị ban khỏi phòng live này.");
        // Có thể disconnect socket nếu cần
        socket.leave(roomId);
        return;
      }

      if (username === room.owner) {
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
          console.log(`Host reload detected. Ending old room ${roomId}...`);
          io.sockets.sockets.get(room.hostSocketId)?.disconnect(true);
          socket.emit(
            "redirectToLive",
            "Phòng đã kết thúc do reload. Vui lòng quay lại danh sách live."
          );
          return;
        }
        room.hostSocketId = socket.id;
        room.isLive = true;
        io.to(roomId).emit("hostJoined");
        console.log(`Host ${username} joined room ${roomId}`);
      } else {
        room.viewers++;
        // Thêm viewer vào danh sách nếu chưa có
        if (!room.viewersList.some((v) => v.username === username)) {
          room.viewersList.push({ username: username, canDraw: false }); // Default: cannot draw
        }
        io.to(roomId).emit("updateViewers", room.viewers);
        if (!room.isLive) {
          socket.emit("waiting", "Chờ streamer vào live...");
        }
        io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`);
        // Gửi pinned comment nếu có
        if (room.pinnedComment) {
          socket.emit("commentPinned", { message: room.pinnedComment });
        }
        // Cập nhật danh sách viewers cho host (nếu có)
        io.to(room.hostSocketId).emit("updateViewersList", {
          viewers: room.viewersList,
        });
      }
    }
  });

  // Khi viewer gửi thông tin PeerJS ID cho streamer
  socket.on("newViewer", ({ viewerId, roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && room.hostSocketId) {
      io.to(room.hostSocketId).emit("newViewer", { viewerId });
    }
  });

  socket.on("chatMessage", ({ roomId, username, message }) => {
    io.to(roomId).emit("newMessage", { username, message });
  });

  // Xử lý pin comment
  socket.on("pinComment", ({ roomId, message }) => {
    // Chỉ host mới được pin comment, bạn có thể kiểm tra username của socket
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && socket.username === room.owner) {
      // Phát sự kiện commentPinned đến tất cả client trong phòng
      room.pinnedComment = message;
      io.to(roomId).emit("commentPinned", { message });
      console.log(`Comment pinned in room ${roomId}:`, message);
    }
  });

  // Xử lý unpin comment
  socket.on("unpinComment", ({ roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && socket.username === room.owner) {
      room.pinnedComment = null;
      io.to(roomId).emit("commentPinned", { message: {} });
      console.log(`Comment unpinned in room ${roomId}`);
    }
  });

  socket.on("banViewer", ({ roomId, viewerUsername }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && socket.username === room.owner) {
      if (!room.bannedViewers.includes(viewerUsername)) {
        room.bannedViewers.push(viewerUsername);
        io.in(roomId)
          .allSockets()
          .then((sockets) => {
            sockets.forEach((clientId) => {
              const clientSocket = io.sockets.sockets.get(clientId);
              if (clientSocket && clientSocket.username === viewerUsername) {
                clientSocket.emit("banned", "Bạn đã bị ban khỏi phòng live.");
                clientSocket.leave(roomId);
                room.viewers = Math.max(0, room.viewers - 1);
                io.to(roomId).emit("updateViewers", room.viewers);
              }
            });
          })
          .catch((err) => {
            console.error("Lỗi khi lấy danh sách socket:", err);
          });
        // Cập nhật danh sách viewers cho host
        room.viewersList = room.viewersList.filter((u) => u !== viewerUsername);
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit("updateViewersList", {
            viewers: room.viewersList,
          });
          io.to(room.hostSocketId).emit(
            "viewerBanned",
            `${viewerUsername} đã bị ban khỏi phòng.`
          );
        }
        console.log(`Viewer ${viewerUsername} bị ban khỏi phòng ${roomId}`);
      }
    }
  });

  socket.on("unbanViewer", ({ roomId, viewerUsername }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && socket.username === room.owner) {
      // Loại bỏ viewer khỏi danh sách ban
      room.bannedViewers = room.bannedViewers.filter(
        (u) => u !== viewerUsername
      );

      // Phát sự kiện cập nhật danh sách ban
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit("updateBannedList", {
          banned: room.bannedViewers,
        });
      }

      console.log(`Viewer ${viewerUsername} được unban khỏi phòng ${roomId}`);
    }
  });

  socket.on("getBannedList", ({ roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room) {
      socket.emit("updateBannedList", { banned: room.bannedViewers });
    }
  });

  socket.on("getViewersList", ({ roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room) {
      socket.emit("updateViewersList", { viewers: room.viewersList });
    }
  });

  socket.on("endRoom", ({ roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại.");
      console.log(
        `❌ Phòng ${roomId} không tồn tại khi socket ${socket.id} cố gắng kết thúc.`
      );
      return;
    }
    if (socket.id !== room.hostSocketId) {
      socket.emit("errorMessage", "Bạn không có quyền kết thúc phòng này.");
      console.log(
        `❌ Socket ${socket.id} cố gắng kết thúc phòng ${roomId} nhưng không phải chủ phòng.`
      );
      return;
    }
    io.to(roomId).emit("roomEnded");
    liveRooms = liveRooms.filter((r) => r.id !== roomId);
    console.log(`✅ Phòng ${roomId} đã bị kết thúc bởi chủ phòng.`);
  });

  socket.on("screenShareEnded", ({ roomId }) => {
    io.to(roomId).emit("screenShareEnded");
    console.log(`📺 Screen share ended in room: ${roomId}`);
  });

  // Whiteboard events
  socket.on("wb:draw", ({ roomId, drawData }) => {
    // Broadcast to all other clients in the room, including other streamers if any
    socket.to(roomId).emit("wb:draw", { drawData });
  });

  socket.on("wb:clear", ({ roomId }) => {
    socket.to(roomId).emit("wb:clear");
  });

  // Handle request for initial state from a newly joined client (streamer or viewer)
  socket.on("wb:requestInitialState", ({ roomId }) => {
    const room = liveRooms.find((r) => r.id === roomId);
    if (room && room.hostSocketId && room.hostSocketId !== socket.id) {
      // Request from a viewer/another client, ask the current host for state
      console.log(
        `Relaying wb:requestInitialState from ${socket.id} to host ${room.hostSocketId} in room ${roomId}`
      );
      io.to(room.hostSocketId).emit("wb:viewerRequestState", {
        viewerSocketId: socket.id,
      });
    } else if (room && room.hostSocketId === socket.id) {
      // Request from the host itself (e.g., after a refresh), maybe they have local history
      // Or, if we stored history on server, send it. For now, host manages its own state.
      // This case might indicate the host refreshed and lost its local state.
      // They would then need to receive it if another "authoritative" source existed or redraw.
    }
  });

  // Streamer sends its current state to a specific viewer who requested it
  socket.on("wb:syncStateToViewer", ({ targetViewerId, history, dataUrl }) => {
    if (targetViewerId) {
      console.log(
        `Server forwarding whiteboard state from streamer to viewer ${targetViewerId}`
      );
      io.to(targetViewerId).emit("wb:initState", { history, dataUrl }); // Send history or dataUrl
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomId) => {
      const room = liveRooms.find((r) => r.id === roomId);
      if (room) {
        if (socket.username && socket.username === room.owner) {
          io.to(roomId).emit("roomEnded");
          liveRooms = liveRooms.filter((r) => r.id !== roomId);
          console.log(`Room ${roomId} ended because host disconnected.`);
        } else if (socket.username) {
          room.viewers = Math.max(0, room.viewers - 1);
          // Cập nhật danh sách viewers (nếu sử dụng viewersList)
          room.viewersList = room.viewersList.filter(
            (v) => v.username !== socket.username
          );
          io.to(roomId).emit("updateViewers", room.viewers);
          io.to(roomId).emit(
            "viewerLeft",
            `${socket.username} đã thoát phòng.`
          );
          if (room.hostSocketId) {
            io.to(room.hostSocketId).emit("updateViewersList", {
              viewers: room.viewersList.map((v) => ({
                username: v.username,
                canDraw: v.canDraw,
              })),
            });
          }
        }
      }
    });
  });

  socket.on(
    "wb:toggleViewerDrawPermission",
    ({ roomId, viewerUsername, canDraw }) => {
      const room = liveRooms.find((r) => r.id === roomId);
      if (room && socket.username === room.owner) {
        // Only host can change permission
        const viewer = room.viewersList.find(
          (v) => v.username === viewerUsername
        );
        if (viewer) {
          viewer.canDraw = canDraw;
          console.log(
            `Permission to draw for ${viewerUsername} set to ${canDraw} in room ${roomId}`
          );
          // Notify all clients (especially the specific viewer and host) about the permission change
          io.to(roomId).emit("wb:permissionUpdate", {
            viewerUsername,
            canDraw,
          });
          // Update host's viewer list display
          io.to(room.hostSocketId).emit("updateViewersList", {
            viewers: room.viewersList.map((v) => ({
              username: v.username,
              canDraw: v.canDraw,
            })),
          });
        }
      }
    }
  );

  socket.on("disconnect", () => {
    console.log("👋 Client disconnected", socket.id);
  });
});

/* =============================
    Xử lý server reset (phát tín hiệu roomEnded cho tất cả phòng)
============================= */
function resetLiveRooms() {
  liveRooms.forEach((room) => {
    io.to(room.id).emit("roomEnded");
    console.log(`Room ${room.id} ended due to server reset.`);
  });
  liveRooms = [];
}

// Ví dụ: khi server nhận tín hiệu shutdown, phát roomEnded cho tất cả
process.on("SIGTERM", () => {
  console.log("Server shutting down, ending all live rooms...");
  resetLiveRooms();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("Server shutting down (SIGINT), ending all live rooms...");
  resetLiveRooms();
  process.exit(0);
});

/* =============================
    Redirect root
============================= */
app.get("/", (req, res) => {
  res.redirect("https://hoctap-9a3.glitch.me/live");
});

/* =============================
    START SERVER
============================= */
server.listen(PORT, () => {
  console.log(`🚀 Live server running on port ${PORT}`);
});
