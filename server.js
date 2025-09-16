// File: server.js
// app/server.js
const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const bodyParser = require("body-parser");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const { ExpressPeerServer } = require("peer");
const helmet = require("helmet"); // For security headers

const app = express();
const server = http.createServer(app);

// PeerJS Server
const peerServer = ExpressPeerServer(server, {
  debug: process.env.NODE_ENV !== "production", // More debug info in dev
  path: "/", // Consistent path
  allow_discovery: true, // Allow peers to discover each other if needed (usually not for simple 1-to-many stream)
  generateClientId: () => {
    // More robust client ID generation if needed
    return uuidv4();
  },
});
app.use("/peerjs", peerServer); // Mount PeerJS server

const io = socketIO(server, {
  cors: {
    origin: "*", // Configure appropriately for production
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET =
  process.env.JWT_SECRET || "fallback_super_secret_key_for_dev_only";
if (
  process.env.NODE_ENV !== "production" &&
  JWT_SECRET === "fallback_super_secret_key_for_dev_only"
) {
  console.warn(
    "\n********************************************************************"
  );
  console.warn(
    "WARNING: Using fallback JWT_SECRET. This is INSECURE for production!"
  );
  console.warn("Set a strong JWT_SECRET in your .env file.");
  console.warn(
    "********************************************************************\n"
  );
}

// Custom middleware to simulate user session (replace with actual auth)
function simulateLogin(req, res, next) {
  // This is a placeholder. In a real app, you'd have a login system.
  // For now, let's assume if a username is in query, they are "logged in"
  if (req.query.simulatedUser) {
    req.user = {
      // This structure should match what your actual login provides
      _id: req.query.simulatedUserId || `sim_${Date.now()}`,
      username: req.query.simulatedUser,
      // Add other relevant user fields if your app uses them (e.g., roles, isPro)
    };
  } else if (
    !req.path.startsWith("/api/") &&
    !req.path.startsWith("/peerjs") &&
    !req.path.includes(".") &&
    req.path !== "/live" &&
    req.path !== "/"
  ) {
    // If no simulatedUser and not an API/static file, redirect to simulate login
    // return res.redirect('/?login_required=true'); // Or show a login page
  }
  next();
}

// Middleware: checkHoctapAuth (from middlewares/checkToken.js)
const { checkHoctapAuth } = require("./middlewares/checkToken.js"); // Assuming it's in middlewares folder

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://unpkg.com",
          "https://gc.kis.v2.scr.kaspersky-labs.com",
          "wss://gc.kis.v2.scr.kaspersky-labs.com",
          `https://${process.env.PROJECT_DOMAIN}`,
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        "img-src": [
          "'self'",
          "blob:",
          "data:",
          "https://cdn.glitch.global",
          "https://gc.kis.v2.scr.kaspersky-labs.com",
        ],
        "font-src": [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        "connect-src": [
          "'self'", // For HTTP/HTTPS to same origin
          "ws://localhost:*",
          "wss://localhost:*",
          "wss://live-hoctapthuduc.onrender.com",
          "https://live-hoctapthuduc.onrender.com",
          "https://*.google-analytics.com",
          "https://*.analytics.google.com",
          "https://*.googletagmanager.com",
          "https://gc.kis.v2.scr.kaspersky-labs.com",
          "wss://gc.kis.v2.scr.kaspersky-labs.com",
          // If you have an external PeerJS TURN server, add its domain here too
          // e.g., "your-turn-server.com", "wss://your-turn-server.com"
          "relay1.expressturn.com", // For the expressturn.com TURN server
        ],
        "frame-src": ["'self'", "blob:", "data:"],
        "media-src": ["'self'", "blob:", "data:"],
        "worker-src": ["'self'", "blob:"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'self'"],
      },
    },
  })
);

app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For form data if needed

app.use(simulateLogin); // Apply simulated login for testing

app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// In-memory store for live rooms (replace with a database in production)
let liveRooms = [];

// Function to find a room by ID
const findRoom = (roomId) => liveRooms.find((r) => r.id === roomId);

/* =============================
    API ROUTES
============================= */

// Generate a token for a logged-in user to access a specific room
// This is a simplified example. In a real app, you'd have user authentication first.
app.post("/api/generateRoomToken", (req, res) => {
  const { userId, username, roomIdToAccess } = req.body;
  if (!userId || !username || !roomIdToAccess) {
    return res
      .status(400)
      .json({ error: "User ID, username, and roomIdToAccess are required." });
  }
  // In a real app, verify user exists and has rights to generate a token for this room if needed.
  const room = findRoom(roomIdToAccess);
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }

  const payload = {
    userId: userId,
    username: username,
    roomId: roomIdToAccess, // Optionally scope token to a room
    // Add other relevant claims like role, permissions etc.
    // isPro: user.isPro // Example
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "6h" });
  res.json({ token });
});

app.post("/api/createStream", (req, res) => {
  // This endpoint should ideally be protected, e.g., require login to create a stream.
  // For now, using simulated user from query or a default if none.
  const roomOwnerId =
    req.body.roomOwnerId || req.user?._id || `defaultOwner_${Date.now()}`;
  const roomOwnerName =
    req.body.roomOwnerName || req.user?.username || "Default Streamer";
  const { title } = req.body;

  if (!roomOwnerId) {
    return res
      .status(400)
      .json({ error: "Thiếu thông tin chủ phòng (roomOwnerId)." });
  }

  const existingRoom = liveRooms.find((room) => room.ownerid === roomOwnerId);
  if (existingRoom) {
    return res.status(409).json({
      // 409 Conflict
      error: "Bạn đã có một phòng live đang hoạt động. Không thể tạo thêm.",
      existingRoomUrl: existingRoom.liveStreamUrl,
      roomId: existingRoom.id,
    });
  }

  const roomId = uuidv4();
  const liveStreamUrl = `https://live-hoctapthuduc.onrender.com/room/${roomId}`; // Relative URL, client can prepend domain
  const newRoom = {
    id: roomId,
    owner: roomOwnerName,
    ownerid: roomOwnerId,
    title: title || `Live Stream của ${roomOwnerName}`,
    liveStreamUrl,
    viewers: 0,
    createdAt: new Date(),
    isLive: false, // Host needs to "start" the stream via socket connection
    bannedViewers: [], // Stores usernames of banned viewers
    viewersList: [], // Stores { username, peerId (optional), canDraw }
    pinnedComment: null,
    isWhiteboardActive: false, // Whiteboard global visibility state
    whiteboardHistory: [], // Store drawing actions for the whiteboard
    quiz: {
      isActive: false,
      currentQuestionId: null,
      currentQuestion: null,
      responses: {},
      results: {},
      showCorrectAnswer: false,
    },
    hostSocketId: null, // To track the current host's socket
    // peerJS server config for clients
    peerConfig: {
      host: process.env.PROJECT_DOMAIN, // Glitch domain
      port: 443, // Glitch uses 443 for WSS
      path: "/peerjs", // Match ExpressPeerServer path
      secure: true,
      debug: process.env.NODE_ENV !== "production" ? 2 : 0, // 0: none, 1: Errors, 2: Self+Errors, 3: All
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.services.mozilla.com" },
          {
            urls: "stun:relay1.expressturn.com:3480",
          },
          {
            urls: "turn:relay1.expressturn.com:3480?transport=tcp",
            username: "000000002064475907",
            credential: "SoqhLiljuT/aNW9D2Rzy49YWM/I=",
          },
          // You can add more public STUN servers
        ],
      },
    },
    glitchProjectUrl: `https://hoctapthuduc.onrender.com`, // For redirects
  };
  liveRooms.push(newRoom);
  console.log("✅ Room created:", {
    id: newRoom.id,
    owner: newRoom.owner,
    title: newRoom.title,
  });
  res.json({
    success: true,
    liveStreamUrl: newRoom.liveStreamUrl,
    roomId: newRoom.id,
  });
});

app.get("/api/rooms", (req, res) => {
  const roomsToDisplay = liveRooms
    .filter((room) => room.isLive) // Only show rooms marked as live
    .map((room) => {
      const now = new Date();
      const diffMs = now - new Date(room.createdAt);
      const seconds = Math.floor(diffMs / 1000) % 60;
      const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const onlineTime = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      return {
        id: room.id,
        owner: room.owner,
        title: room.title,
        viewers: room.viewers,
        liveStreamUrl: room.liveStreamUrl,
        createdAt: room.createdAt,
        onlineTime,
        isLive: room.isLive,
      };
    });
  res.json(roomsToDisplay);
});

/* =============================
    PAGE RENDERING ROUTES
============================= */
app.get("/room/:id", checkHoctapAuth, async (req, res) => {
  // Make it async if fetching room details
  try {
    const roomId = req.params.id;
    const userMakingRequest = req.user; // User object from checkHoctapAuth middleware

    if (!userMakingRequest || !userMakingRequest.userId) {
      // This case should ideally be handled by checkHoctapAuth redirecting to login
      console.error(
        "User not authenticated or userId missing for room access."
      );
      // req.flash is not available in this server.js context, send plain error or redirect
      return res.status(401).send("Authentication required to access room.");
    }

    const room = findRoom(roomId);
    if (!room) {
      return res.status(404).render("errorPage", {
        // Assuming you have an errorPage.ejs
        message: "Phòng live không tồn tại hoặc đã kết thúc.",
        projectUrl: `https://hoctapthuduc.onrender.com`,
        user: userMakingRequest, // Pass user if your error page uses it
      });
    }

    if (room.bannedViewers.includes(userMakingRequest.username)) {
      return res.status(403).render("errorPage", {
        message: "Bạn đã bị chặn khỏi phòng live này.",
        projectUrl: room.glitchProjectUrl,
        user: userMakingRequest,
      });
    }

    const isCurrentUserHost =
      room.ownerid.toString() === userMakingRequest.userId.toString();

    // Default initial states for whiteboard (can be overridden by actual room state later)
    let initialWhiteboardVisibleState = false;
    let initialDrawPermissionForViewer = false;

    // In a more robust system, you would fetch the room's current state
    // from a database or your live-hoctap-9a3 service here.
    // For now, we use the `room.isWhiteboardActive` and a default for viewers.
    if (room) {
      initialWhiteboardVisibleState = room.isWhiteboardActive || false;
      // Default viewer permission (can be more dynamic based on room settings)
      const viewerSettings = room.viewersList.find(
        (v) => v.username === userMakingRequest.username
      );
      initialDrawPermissionForViewer = viewerSettings
        ? viewerSettings.canDraw
        : false;
    }

    const templateData = {
      title: `Live: ${room.title}`,
      user: userMakingRequest, // The logged-in user object (ensure it has username, isPro etc.)
      activePage: "live", // For navigation highlighting
      roomId: room.id,
      username: userMakingRequest.username,
      roomTitle: room.title,
      roomOwner: room.owner,
      roomCreatedAt: room.createdAt,
      isHostPresent: room.isLive,
      isHost: isCurrentUserHost, // CRUCIAL: This defines if the current user is the host
      peerConfig: room.peerConfig, // Use the config from the room object
      glitchProjectUrl: room.glitchProjectUrl,
      userIsPro: userMakingRequest.isPro || false, // Pass this if needed by EJS

      // --- FIX: Define and Pass these variables ---
      initialWhiteboardGlobalState: initialWhiteboardVisibleState,
      initialViewerDrawPermission: isCurrentUserHost
        ? true
        : initialDrawPermissionForViewer, // Host can always draw initially
    };

    if (isCurrentUserHost) {
      // Streamer specific logic from original server.js
      room.isLive = true;
      if (
        room.hostSocketId &&
        room.hostSocketId !== userMakingRequest.socketId
      ) {
        const oldHostSocket = io.sockets.sockets.get(room.hostSocketId);
        if (oldHostSocket) {
          oldHostSocket.emit(
            "forceEndStream",
            "Phiên live của bạn đã được bắt đầu từ một thiết bị/tab khác."
          );
          oldHostSocket.disconnect(true);
        }
      }
      console.log(
        `Host ${userMakingRequest.username} is accessing their room ${room.id}.`
      );
      res.render("streamer", templateData); // Render streamer.ejs for host
    } else {
      console.log(
        `Viewer ${userMakingRequest.username} is joining room ${room.id}.`
      );
      res.render("liveRoom", templateData); // Render liveRoom.ejs for viewer
    }
  } catch (error) {
    console.error("Error in /room/:id route:", error);
    // req.flash not available
    res.status(500).send("Lỗi khi tải phòng live. " + error.message);
  }
});

/* =============================
    SOCKET.IO LOGIC
============================= */
io.on("connection", (socket) => {
  console.log(`💡 New client connected: ${socket.id}`);

  socket.on("joinRoom", ({ roomId, username, peerId }) => {
    const room = findRoom(roomId);
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại.");
      socket.disconnect(true);
      return;
    }

    if (room.bannedViewers.includes(username)) {
      socket.emit("banned", "Bạn đã bị chặn khỏi phòng live này.");
      socket.disconnect(true);
      return;
    }

    socket.join(roomId);
    socket.username = username; // Store username on socket object
    socket.roomId = roomId; // Store roomId on socket object
    socket.peerId = peerId; // Store peerId if provided (viewers send this on join or later)

    console.log(
      `${username} (Socket: ${socket.id}, Peer: ${
        peerId || "N/A"
      }) joined room ${roomId}`
    );

    if (username === room.owner) {
      // Host connected
      if (room.hostSocketId && room.hostSocketId !== socket.id) {
        const oldHostSocket = io.sockets.sockets.get(room.hostSocketId);
        if (oldHostSocket) {
          oldHostSocket.emit(
            "forceEndStream",
            "Phiên live của bạn đã được tiếp tục từ một thiết bị/tab khác."
          );
          oldHostSocket.disconnect(true);
          console.log(
            `Disconnected old host socket ${room.hostSocketId} for room ${room.id} as new host ${socket.id} joined.`
          );
        }
      }
      room.hostSocketId = socket.id;
      room.isLive = true;
      io.to(roomId).emit("hostJoined"); // Notify viewers host is present
      console.log(
        `Host ${username} (Socket: ${socket.id}) confirmed for room ${roomId}`
      );

      // Send current whiteboard visibility state to rejoining host
      socket.emit("wb:toggleVisibility", {
        isVisible: room.isWhiteboardActive,
      });
      // Host might also want its own full history if rejoining a session it previously had
      if (room.whiteboardHistory && room.whiteboardHistory.length > 0) {
        socket.emit("wb:initState", { history: room.whiteboardHistory });
      }
      // Quiz state for rejoining host
      socket.emit("quiz:hostState", room.quiz);
    } else {
      // Viewer connected
      const existingViewer = room.viewersList.find(
        (v) => v.username === username
      );
      if (!existingViewer) {
        room.viewersList.push({
          username: username,
          peerId: peerId,
          canDraw: false,
        });
        room.viewers++;
      } else {
        existingViewer.peerId = peerId; // Update peerId if they rejoin
      }

      io.to(roomId).emit("updateViewers", room.viewers);
      io.to(roomId).emit("userJoined", `${username} đã tham gia phòng.`); // Inform everyone

      if (!room.isLive) {
        socket.emit("waiting", "Chờ streamer vào live...");
      } else if (room.hostSocketId && peerId) {
        // If host is live and viewer has a peerId, tell host to call this new viewer
        io.to(room.hostSocketId).emit("newViewer", {
          viewerId: peerId,
          username: username,
        });
      }

      if (room.pinnedComment) {
        socket.emit("commentPinned", { message: room.pinnedComment });
      }
      // Send current whiteboard visibility and viewer's draw permission
      socket.emit("wb:toggleVisibility", {
        isVisible: room.isWhiteboardActive,
      });
      const viewerData = room.viewersList.find((v) => v.username === username);
      if (viewerData) {
        socket.emit("wb:permissionUpdate", {
          viewerUsername: username,
          canDraw: viewerData.canDraw,
        });
      }

      // Send current quiz state to new/rejoining viewer
      if (room.quiz.isActive && room.quiz.currentQuestion) {
        socket.emit("quiz:visibilityChanged", {
          isVisible: room.quiz.isGloballyVisible,
          questionId: room.quiz.currentQuestionId,
        });
        if (room.quiz.isGloballyVisible) {
          // Only send question if globally visible
          socket.emit("quiz:newQuestion", {
            questionId: room.quiz.currentQuestion.id,
            text: room.quiz.currentQuestion.text,
            options: room.quiz.currentQuestion.options,
          });
          if (room.quiz.showCorrectAnswer) {
            socket.emit("quiz:correctAnswer", {
              /* ... */
            });
          }
        }
      } else {
        socket.emit("quiz:visibilityChanged", {
          isVisible: false,
          questionId: null,
        }); // Ensure it's off
      }
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit("updateViewersList", {
          viewers: room.viewersList,
        });
      }
    }
  });

  // This event is for viewers to announce their PeerJS ID if it wasn't ready at joinRoom
  socket.on("newViewer", ({ viewerId, roomId, username }) => {
    const room = findRoom(roomId);
    if (room && username === socket.username) {
      // Ensure it's the correct viewer updating their peerId
      socket.peerId = viewerId; // Update peerId on their socket session
      const viewerInList = room.viewersList.find(
        (v) => v.username === username
      );
      if (viewerInList) {
        viewerInList.peerId = viewerId;
      }
      if (room.hostSocketId && room.isLive) {
        console.log(
          `Viewer ${username} (Peer: ${viewerId}) is ready, notifying host ${room.hostSocketId}`
        );
        io.to(room.hostSocketId).emit("newViewer", {
          viewerId: viewerId,
          username: username,
        });
      }
    }
  });

  socket.on("chatMessage", ({ roomId, message }) => {
    // message contains {username, content, messageType, timestamp}
    const room = findRoom(roomId);
    if (room) {
      // Add server-side timestamp if not present or to override client's
      message.serverTimestamp = new Date().toISOString();
      io.to(roomId).emit("newMessage", { message }); // Broadcast with consistent structure
    }
  });

  socket.on("pinComment", ({ roomId, message }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      message.timestamp = new Date().toISOString(); // Ensure server timestamp for pinned
      room.pinnedComment = message;
      io.to(roomId).emit("commentPinned", { message });
      console.log(`Comment pinned in room ${roomId} by ${socket.username}`);
    }
  });

  socket.on("unpinComment", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      room.pinnedComment = null;
      io.to(roomId).emit("commentUnpinned"); // Send unpin event
      console.log(`Comment unpinned in room ${roomId} by ${socket.username}`);
    }
  });

  socket.on("banViewer", ({ roomId, viewerUsername }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      if (
        !room.bannedViewers.includes(viewerUsername) &&
        viewerUsername !== room.owner
      ) {
        room.bannedViewers.push(viewerUsername);
        // Find the banned viewer's socket(s) and disconnect them
        io.in(roomId)
          .allSockets()
          .then((socketsInRoom) => {
            socketsInRoom.forEach((socketIdInRoom) => {
              const targetSocket = io.sockets.sockets.get(socketIdInRoom);
              if (targetSocket && targetSocket.username === viewerUsername) {
                targetSocket.emit(
                  "banned",
                  "Bạn đã bị ban khỏi phòng live này."
                );
                targetSocket.leave(roomId); // Remove from room's broadcast
                targetSocket.disconnect(true); // Force disconnect
                console.log(
                  `Force disconnected banned viewer ${viewerUsername} (Socket: ${socketIdInRoom}) from room ${roomId}`
                );
              }
            });
          });
        // Update lists
        room.viewersList = room.viewersList.filter(
          (v) => v.username !== viewerUsername
        );
        room.viewers = Math.max(0, room.viewersList.length); // Recalculate viewers
        io.to(roomId).emit("updateViewers", room.viewers);
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit("updateViewersList", {
            viewers: room.viewersList,
          });
          io.to(room.hostSocketId).emit("updateBannedList", {
            banned: room.bannedViewers,
          });
          io.to(room.hostSocketId).emit(
            "viewerBanned",
            `${viewerUsername} đã bị ban.`
          );
        }
        console.log(
          `Viewer ${viewerUsername} banned from room ${roomId} by ${socket.username}`
        );
      }
    }
  });

  socket.on("unbanViewer", ({ roomId, viewerUsername }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      room.bannedViewers = room.bannedViewers.filter(
        (u) => u !== viewerUsername
      );
      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit("updateBannedList", {
          banned: room.bannedViewers,
        });
      }
      console.log(
        `Viewer ${viewerUsername} unbanned from room ${roomId} by ${socket.username}`
      );
    }
  });

  socket.on("getBannedList", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.id === room.hostSocketId) {
      // Only host should request/receive this directly
      socket.emit("updateBannedList", { banned: room.bannedViewers });
    }
  });

  socket.on("getViewersList", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.id === room.hostSocketId) {
      // Only host
      socket.emit("updateViewersList", { viewers: room.viewersList });
    }
  });

  socket.on("streamEnded", ({ roomId }) => {
    // From streamer when they stop stream (not full room end)
    const room = findRoom(roomId);
    if (room && socket.id === room.hostSocketId) {
      io.to(roomId).emit("screenShareEnded"); // Generic event for viewers
      console.log(`Stream stopped (not room ended) in room ${roomId} by host.`);
      // Host might still be in the room, just not streaming video.
      // isLive could be set to false here if "stream ended" means "no video content flowing"
      // room.isLive = false; // If you want to reflect this state for late joiners.
    }
  });

  socket.on("endRoom", async ({ roomId }) => {
    // Make the handler async
    const room = findRoom(roomId);

    if (!room) {
      console.warn(
        `Attempt to end non-existent room ${roomId} by ${
          socket.username || socket.id
        }`
      );
      socket.emit("errorMessage", "Phòng không tồn tại hoặc đã kết thúc.");
      return;
    }

    if (socket.id === room.hostSocketId) {
      console.log(`Host ${socket.username} is ending room ${roomId}.`);

      // 1. Immediately notify all clients in the room that it's ending.
      // This allows their UIs to update promptly.
      io.to(roomId).emit("roomEnded", "Buổi live đã được chủ phòng kết thúc.");
      console.log(`Emitted 'roomEnded' to room ${roomId}`);

      // 2. Proactively disconnect all sockets from the room on the server-side.
      try {
        const socketsInRoom = await io.in(roomId).allSockets(); // Get all socket IDs in the room
        if (socketsInRoom) {
          socketsInRoom.forEach((socketIdInRoom) => {
            const clientSocket = io.sockets.sockets.get(socketIdInRoom);
            if (clientSocket) {
              // clientSocket.emit("forceDisconnect", "Phòng đã kết thúc, bạn sẽ bị ngắt kết nối."); // Optional final message before disconnect
              clientSocket.disconnect(true); // true for 'closeConnection'
              console.log(
                `Server forcefully disconnected socket ${socketIdInRoom} from ended room ${roomId}.`
              );
            }
          });
        }
      } catch (e) {
        console.error(
          `Error during server-side disconnection of sockets from room ${roomId}:`,
          e
        );
      }

      // 3. Remove the room from the active list.
      liveRooms = liveRooms.filter((r) => r.id !== roomId);
      console.log(
        `✅ Room ${roomId} (Owner: ${room.owner}) has been removed from liveRooms.`
      );
    } else {
      console.warn(
        `Attempt to end room ${roomId} by non-host ${socket.username} (Socket ID: ${socket.id}). Host is ${room.hostSocketId}`
      );
      socket.emit(
        "errorMessage",
        "Chỉ chủ phòng mới có thể kết thúc buổi live."
      );
    }
  });

  // --- Whiteboard Socket Handlers ---
  socket.on("wb:draw", ({ roomId, drawData }) => {
    const room = findRoom(roomId);
    if (room) {
      const userCanDraw =
        socket.username === room.owner ||
        room.viewersList.find((v) => v.username === socket.username)?.canDraw;
      if (userCanDraw) {
        // Add to server's history for this room
        room.whiteboardHistory.push(drawData);
        if (room.whiteboardHistory.length > 1000) {
          // Limit history size
          room.whiteboardHistory.splice(
            0,
            room.whiteboardHistory.length - 1000
          );
        }
        // Broadcast to other clients
        socket
          .to(roomId)
          .emit("wb:draw", { username: socket.username, drawData });
      } else {
        console.warn(
          `User ${socket.username} tried to draw without permission in room ${roomId}.`
        );
      }
    }
  });
  socket.on("wb:drawShape", ({ roomId, shapeData }) => {
    const room = findRoom(roomId);
    if (room) {
      const userCanDraw =
        socket.username === room.owner ||
        room.viewersList.find((v) => v.username === socket.username)?.canDraw;
      if (userCanDraw) {
        room.whiteboardHistory.push(shapeData);
        if (room.whiteboardHistory.length > 1000)
          room.whiteboardHistory.splice(
            0,
            room.whiteboardHistory.length - 1000
          );
        socket
          .to(roomId)
          .emit("wb:drawShape", { username: socket.username, shapeData });
      }
    }
  });

  socket.on("wb:clear", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      // Only host can clear for everyone
      room.whiteboardHistory = [
        { type: "clear", timestamp: Date.now(), drawnBy: socket.username },
      ]; // Store clear action
      io.to(roomId).emit("wb:clear"); // Use io.to to include sender (host) for UI update
      console.log(
        `Whiteboard cleared in room ${roomId} by host ${socket.username}`
      );
    }
  });

  socket.on("wb:requestInitialState", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room) {
      // If host is connected, ask host for current state.
      // Otherwise, send server's (potentially stale) history if any.
      // This prioritizes live state from host if available.
      if (room.hostSocketId && io.sockets.sockets.get(room.hostSocketId)) {
        console.log(
          `Relaying wb:requestInitialState from ${socket.id} to host ${room.hostSocketId} for room ${roomId}`
        );
        io.to(room.hostSocketId).emit("wb:viewerRequestState", {
          viewerSocketId: socket.id,
        });
      } else if (room.whiteboardHistory && room.whiteboardHistory.length > 0) {
        console.log(
          `Host not present or unresponsive, sending stored WB history to ${socket.id} for room ${roomId}`
        );
        socket.emit("wb:initState", { history: room.whiteboardHistory });
      } else {
        socket.emit("wb:initState", { history: [] }); // Send empty if no history and no host
      }
    }
  });

  socket.on("wb:syncStateToViewer", ({ targetViewerId, history }) => {
    const room = findRoom(socket.roomId); // roomId stored on socket
    if (room && socket.id === room.hostSocketId) {
      // Only host can sync
      if (targetViewerId) {
        console.log(
          `Server forwarding whiteboard history from host ${socket.username} to viewer ${targetViewerId}`
        );
        io.to(targetViewerId).emit("wb:initState", { history });
      }
    }
  });

  socket.on("wb:toggleGlobalVisibility", ({ roomId, isVisible }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      room.isWhiteboardActive = isVisible;
      io.to(roomId).emit("wb:toggleVisibility", { isVisible }); // Inform all clients
      console.log(
        `Whiteboard global visibility for room ${roomId} set to ${isVisible} by host ${socket.username}`
      );
      if (
        isVisible &&
        (!room.whiteboardHistory || room.whiteboardHistory.length === 0)
      ) {
        // If turning on and history is empty, might send a "fresh start" or rely on host drawing.
      }
    }
  });

  socket.on(
    "wb:toggleViewerDrawPermission",
    ({ roomId, viewerUsername, canDraw }) => {
      const room = findRoom(roomId);
      if (room && socket.username === room.owner) {
        const viewer = room.viewersList.find(
          (v) => v.username === viewerUsername
        );
        if (viewer) {
          viewer.canDraw = canDraw;
          io.to(roomId).emit("wb:permissionUpdate", {
            viewerUsername,
            canDraw,
          }); // Notify all, including the specific viewer
          // Host's own list will be updated via its client-side `updateViewersList` handler after this.
          io.to(room.hostSocketId).emit("updateViewersList", {
            viewers: room.viewersList,
          });
          console.log(
            `Draw permission for ${viewerUsername} in room ${roomId} set to ${canDraw} by host.`
          );
        }
      }
    }
  );
  socket.on("wb:moveElements", ({ roomId, movedItemsData }) => {
    const room = findRoom(roomId);
    if (room) {
      const userCanDraw =
        socket.username === room.owner ||
        room.viewersList.find((v) => v.username === socket.username)?.canDraw;
      if (userCanDraw) {
        // Update server's history
        movedItemsData.forEach((moved) => {
          if (room.whiteboardHistory[moved.index]) {
            Object.assign(
              room.whiteboardHistory[moved.index],
              moved.newItemData
            );
          }
        });
        // Broadcast to other clients
        socket.to(roomId).emit("wb:moveElements", {
          username: socket.username,
          movedItemsData,
        });
      }
    }
  });

  socket.on("wb:deleteElements", ({ roomId, indices }) => {
    const room = findRoom(roomId);
    if (room) {
      const userCanDraw =
        socket.username === room.owner ||
        room.viewersList.find((v) => v.username === socket.username)?.canDraw;
      if (userCanDraw) {
        // Update server's history (delete in reverse order of indices)
        const sortedIndices = [...indices].sort((a, b) => b - a);
        sortedIndices.forEach((index) => {
          if (room.whiteboardHistory[index]) {
            room.whiteboardHistory.splice(index, 1);
          }
        });
        // Broadcast to other clients
        socket
          .to(roomId)
          .emit("wb:deleteElements", { username: socket.username, indices });
      }
    }
  });

  // --- Quiz Socket Handlers (Server-side logic) ---
  socket.on(
    "quiz:start",
    ({ roomId, questionText, options, correctAnswerIndex }) => {
      const room = findRoom(roomId);
      if (room && socket.username === room.owner) {
        if (room.quiz.isActive) {
          socket.emit("quiz:error", "Một trắc nghiệm khác đang diễn ra.");
          return;
        }
        const questionId = uuidv4();
        room.quiz = {
          // Reset quiz state for new question
          isActive: true,
          currentQuestionId: questionId,
          currentQuestion: {
            id: questionId,
            text: questionText,
            options,
            correctAnswerIndex,
          },
          responses: { [questionId]: {} },
          results: {
            [questionId]: options.reduce((acc, _, i) => {
              acc[i] = 0;
              return acc;
            }, {}),
          },
          showCorrectAnswer: false,
        };
        room.quiz.isGloballyVisible = true;
        room.quiz.currentQuestionId = questionId;
        io.to(roomId).emit("quiz:newQuestion", {
          questionId,
          text: questionText,
          options,
        });
        console.log(
          `Quiz started in room ${roomId} by ${socket.username} (QID: ${questionId})`
        );
      } else if (room) {
        socket.emit(
          "quiz:error",
          "Chỉ chủ phòng mới có thể bắt đầu trắc nghiệm."
        );
      }
    }
  );

  socket.on("quiz:toggleVisibility", ({ roomId, isVisible }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      if (room.quiz.isActive && room.quiz.currentQuestionId) {
        // Only toggle if a quiz is active
        room.quiz.isGloballyVisible = isVisible;
        io.to(roomId).emit("quiz:visibilityChanged", {
          isVisible: room.quiz.isGloballyVisible,
          questionId: room.quiz.currentQuestionId,
        });
        console.log(
          `Quiz global visibility for room ${roomId} (QID: ${room.quiz.currentQuestionId}) set to ${room.quiz.isGloballyVisible} by host.`
        );
      } else {
        socket.emit(
          "quiz:error",
          "Không có trắc nghiệm nào đang hoạt động để thay đổi hiển thị."
        );
      }
    }
  });

  socket.on("quiz:submitAnswer", ({ roomId, questionId, answerIndex }) => {
    const room = findRoom(roomId);
    if (
      room &&
      room.quiz.isActive &&
      room.quiz.currentQuestionId === questionId &&
      socket.username
    ) {
      if (room.quiz.showCorrectAnswer) {
        socket.emit(
          "quiz:error",
          "Đã hiển thị đáp án, không thể thay đổi lựa chọn."
        );
        return;
      }
      const userId = socket.username;
      const userResponses = room.quiz.responses[questionId];
      const questionResults = room.quiz.results[questionId];

      if (userResponses && questionResults) {
        const previousAnswer = userResponses[userId];
        if (
          previousAnswer !== undefined &&
          questionResults[previousAnswer] > 0
        ) {
          questionResults[previousAnswer]--; // Decrement old answer count
        }
        userResponses[userId] = answerIndex; // Store new answer
        if (questionResults[answerIndex] !== undefined) {
          questionResults[answerIndex]++;
        } else {
          questionResults[answerIndex] = 1; // Should not happen if initialized correctly
        }

        if (room.hostSocketId) {
          // Update host with live results
          io.to(room.hostSocketId).emit("quiz:resultsUpdate", {
            questionId,
            results: questionResults,
          });
        }
        socket.emit("quiz:answerSubmitted", { questionId, answerIndex }); // Confirm to submitter
      } else {
        socket.emit(
          "quiz:error",
          "Câu hỏi không hợp lệ hoặc trắc nghiệm đã kết thúc."
        );
      }
    } else if (room) {
      socket.emit("quiz:error", "Không thể nộp câu trả lời lúc này.");
    }
  });

  socket.on("quiz:showAnswer", ({ roomId, questionId }) => {
    const room = findRoom(roomId);
    if (
      room &&
      socket.username === room.owner &&
      room.quiz.currentQuestionId === questionId
    ) {
      if (!room.quiz.currentQuestion) {
        socket.emit(
          "quiz:error",
          "Không có câu hỏi nào đang hoạt động để hiển thị đáp án."
        );
        return;
      }
      room.quiz.showCorrectAnswer = true;
      io.to(roomId).emit("quiz:correctAnswer", {
        questionId: questionId,
        correctAnswerIndex: room.quiz.currentQuestion.correctAnswerIndex,
        results: room.quiz.results[questionId] || {},
      });
      console.log(`Correct answer shown for Q ${questionId} in room ${roomId}`);
    }
  });

  socket.on("quiz:nextQuestion", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      // Reset parts of the quiz state for a new question, but keep isActive true
      room.quiz.currentQuestionId = null;
      room.quiz.currentQuestion = null;
      room.quiz.showCorrectAnswer = false;
      // Responses and results for old questions are kept, new ones will use new QID.
      room.quiz.isGloballyVisible = false;
      io.to(roomId).emit("quiz:clearCurrent"); // Tell clients to clear current Q display
      console.log(`Quiz cleared for next question setup in room ${roomId}`);
    }
  });

  socket.on("quiz:end", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.username === room.owner) {
      room.quiz = {
        isActive: false,
        currentQuestionId: null,
        currentQuestion: null,
        responses: {},
        results: {},
        showCorrectAnswer: false,
      }; // Full reset
      room.quiz.isGloballyVisible = false;
      io.to(roomId).emit("quiz:ended");
      console.log(`Quiz ended in room ${roomId}`);
    }
  });
  socket.on("quiz:requestHostState", ({ roomId }) => {
    const room = findRoom(roomId);
    if (room && socket.id === room.hostSocketId) {
      socket.emit("quiz:hostState", room.quiz);
    }
  });

  // Handle client disconnect
  socket.on("disconnecting", () => {
    const currentRoomId = socket.roomId;
    if (currentRoomId) {
      const room = findRoom(currentRoomId); // Check if room still exists
      if (room) {
        // If room still exists, it means 'endRoom' wasn't called by this host for this room yet
        if (socket.id === room.hostSocketId) {
          console.log(
            `Host ${socket.username} (Socket: ${socket.id}) disconnected abruptly from room ${currentRoomId}. Ending room for all.`
          );
          io.to(currentRoomId).emit(
            "roomEnded",
            "Chủ phòng đã ngắt kết nối đột ngột."
          );

          // Proactively disconnect other viewers
          io.in(currentRoomId)
            .allSockets()
            .then((socketsInRoom) => {
              socketsInRoom.forEach((socketIdInRoom) => {
                if (socketIdInRoom !== socket.id) {
                  // Don't try to disconnect self again
                  const clientSocket = io.sockets.sockets.get(socketIdInRoom);
                  if (clientSocket) clientSocket.disconnect(true);
                }
              });
            });
          liveRooms = liveRooms.filter((r) => r.id !== currentRoomId);
          console.log(
            `Room ${currentRoomId} removed due to host abrupt disconnect.`
          );
        } else {
          // Viewer disconnected
          room.viewersList = room.viewersList.filter(
            (v) => v.username !== socket.username
          );
          room.viewers = Math.max(0, room.viewersList.length); // Recalculate
          io.to(currentRoomId).emit("updateViewers", room.viewers);
          socket
            .to(currentRoomId)
            .emit("viewerLeft", `${socket.username} đã thoát phòng.`); // Use socket.to to not send to self
          if (room.hostSocketId) {
            io.to(room.hostSocketId).emit("updateViewersList", {
              viewers: room.viewersList,
            });
            if (socket.peerId) {
              io.to(room.hostSocketId).emit("viewerDisconnected", {
                viewerId: socket.peerId,
                username: socket.username,
              });
            }
          }
          console.log(
            `Viewer ${socket.username} disconnected from room ${currentRoomId}. Remaining viewers: ${room.viewers}`
          );
        }
      } else {
        console.log(
          `Client ${socket.id} (User: ${socket.username}) disconnecting, but their room ${currentRoomId} no longer exists (likely already ended).`
        );
      }
    } else {
      console.log(
        `Client ${socket.id} (User: ${socket.username}) disconnecting, was not in a tracked room.`
      );
    }
  });
  socket.on("disconnect", () => {
    console.log(`Client ${socket.id} fully disconnected.`);
  });
}); // End io.on("connection")

/* =============================
    SERVER CLEANUP & MAIN ROUTE
============================= */
function cleanupInactiveRooms() {
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000; // Example: 2 hours inactivity timeout
  liveRooms = liveRooms.filter((room) => {
    // If host is disconnected and room is old, remove it
    const hostStillConnected =
      room.hostSocketId && io.sockets.sockets.get(room.hostSocketId);
    if (
      !hostStillConnected &&
      now - new Date(room.createdAt).getTime() > twoHours
    ) {
      console.log(
        `Cleaning up inactive/orphaned room: ${room.id} (Owner: ${room.owner})`
      );
      return false;
    }
    return true;
  });
}
setInterval(cleanupInactiveRooms, 60 * 60 * 1000); // Run cleanup every hour

app.get("/", (req, res) => {
  // Simple landing page or redirect to your main app page
  // res.send("Live Streaming App. Go to /live (example) to see rooms or create one.");
  // For Glitch, redirect to the live room list page
  res.redirect(`https://hoctapthuduc.onrender.com/live`);
});

app.get("/live", (req, res) => {
  res.redirect(`https://hoctapthuduc.onrender.com/live`);
});

server.listen(PORT, () => {
  console.log(
    `🚀 Live server running on port ${PORT}. Access at http://localhost:${PORT} or your Glitch URL.`
  );
  console.log(`PeerJS server running at /peerjs/myapp`);
});
