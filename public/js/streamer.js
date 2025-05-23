// /public/js/streamer-masterpiece.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Lib Checks & Config ---
  if (
    typeof gsap === "undefined" ||
    typeof io === "undefined" ||
    typeof Peer === "undefined" ||
    typeof tsParticles === "undefined"
  ) {
    console.error(
      "Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles) not loaded!"
    );
    document.body.innerHTML =
      '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên cần thiết. Không thể bắt đầu stream.</p>';
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // --- Element Refs ---
  const elements = {
    header: document.querySelector(".streamer-main-header"),
    sidebar: document.querySelector(".streamer-sidebar"),
    chatArea: document.querySelector(".streamer-chat-area"),
    viewerCount: document.getElementById("viewerCountV2"),
    streamDuration: document.getElementById("streamDuration"),
    controlPanel: document.getElementById("controlPanelV2"),
    togglePanelBtn: document.getElementById("togglePanelBtnV2"),
    panelContent: document.querySelector(".panel-content-collapsible"),
    previewContainer: document.getElementById("streamPreviewContainer"),
    previewVideo: document.getElementById("streamPreviewVideo"),
    noStreamOverlay: document.querySelector(".no-stream-overlay"),
    streamStatusIndicator: document.getElementById("streamStatusIndicator"),
    shareScreenBtn: document.getElementById("shareScreenBtnV2"),
    liveCamBtn: document.getElementById("liveCamBtnV2"),
    toggleMicBtn: document.getElementById("toggleMicBtnV2"),
    endStreamBtn: document.getElementById("endStreamBtnV2"),
    viewersListBtn: document.getElementById("viewersListBtnV2"),
    bannedListBtn: document.getElementById("bannedListBtnV2"),
    pipChatBtn: document.getElementById("pipChatBtnV2"),
    pinnedCommentContainer: document.getElementById("pinnedCommentV2"),
    chatMessagesList: document.getElementById("chatMessagesV2"),
    chatInputArea: document.getElementById("chatInputAreaV2"),
    sendChatBtn: document.getElementById("sendChatBtnV2"),
    chatPreview: document.getElementById("chatPreviewV2"),
    viewersModal: document.getElementById("viewersModalV2"),
    viewersModalList: document.getElementById("viewersListV2"),
    viewersSearchInput: document.getElementById("viewersSearchV2"),
    closeViewersModalBtn: document.querySelector(
      "#viewersModalV2 .modal-close-btn"
    ),
    bannedModal: document.getElementById("bannedModalV2"),
    bannedModalList: document.getElementById("bannedListV2"),
    closeBannedModalBtn: document.querySelector(
      "#bannedModalV2 .modal-close-btn"
    ),
    controlPanelHeader: document.querySelector("#controlPanelV2 .panel-header"),
    controlButtons: gsap.utils.toArray("#controlPanelV2 .control-btn"),
    panelInternalHeader: document.querySelector(
      "#controlPanelV2 .panel-header h3"
    ),
    // --- Whiteboard Elements ---
    toggleWhiteboardBtn: document.getElementById(
      "toggleWhiteboardBtnStreamerV2"
    ),
    whiteboardOverlay: document.getElementById("whiteboardContainerOverlayV2"),
    whiteboardCanvas: document.getElementById("whiteboardCanvasV2"),
    whiteboardToolbar: document.getElementById("whiteboardToolbarV2"),
    closeWhiteboardBtn: document.getElementById("closeWhiteboardBtnV2"),
    wbClearBtn: document.getElementById("wbClearBtnV2"),
    wbColorPicker: document.getElementById("wbColorPickerV2"),
    wbLineWidthRange: document.getElementById("wbLineWidthRangeV2"),
    wbLineWidthValueDisplay: document.getElementById("wbLineWidthValueV2"),
    wbEraserModeBtn: document.getElementById("wbEraserModeBtnV2"),
    pipChatVideoPlayer: document.getElementById("pipChatVideoPlayer"),
    // ---- Start: Quiz Elements Streamer ----
    toggleQuizPanelBtn: document.getElementById("toggleQuizPanelBtn"),
    streamerQuizPanel: document.getElementById("streamerQuizPanel"),
    quizQuestionText: document.getElementById("quizQuestionText"),
    quizOptionsContainer: document.getElementById("quizOptionsContainer"),
    addQuizOptionBtn: document.getElementById("addQuizOptionBtn"),
    quizCorrectAnswerSelect: document.getElementById("quizCorrectAnswerSelect"),
    startQuizBtn: document.getElementById("startQuizBtn"),
    showQuizAnswerBtn: document.getElementById("showQuizAnswerBtn"),
    nextQuizQuestionBtn: document.getElementById("nextQuizQuestionBtn"),
    endQuizBtn: document.getElementById("endQuizBtn"),
    quizStreamerStatus: document.getElementById("quizStreamerStatus"),
    quizStreamerResults: document.getElementById("quizStreamerResults"),
    // ---- End: Quiz Elements Streamer ----
  };

  // --- State Variables ---
  let localStream = null;
  let currentMode = null;
  let peerInstance = null;
  let currentCalls = {};
  let viewerDrawPermissions = {};
  let pendingViewers = [];
  let allJoinedViewers = new Set();
  let isMicEnabled = true;
  let isPanelCollapsed = false;
  let streamStartTime = streamerConfig.roomCreatedAt;
  let durationInterval = null;

  // --- Whiteboard State ---
  let whiteboardCtx = null;
  let isWhiteboardActive = false; // Whether the WB overlay is globally visible/interactive
  let isDrawingOnWhiteboard = false;
  let wbDrawingHistory = []; // Stores draw actions {type, x0,y0,x1,y1,color,lineWidth,isEraser} in world coordinates
  let wbEventThrottleTimer = null;

  // Drawing tool state
  let wbCurrentColor = "#FFFFFF";
  let wbCurrentLineWidth = 3;
  let wbIsEraserMode = false;
  const WB_ERASER_COLOR_STREAMER = "#222639"; // Canvas background from CSS
  const WB_THROTTLE_INTERVAL = 16; // ms

  // Camera/Viewport state for the whiteboard (World Coordinates)
  const WB_MAX_WIDTH = 2048 * 2; // Virtual canvas size
  const WB_MAX_HEIGHT = 2048 * 2;
  let wbCamera = {
    x: WB_MAX_WIDTH / 4, // Initial pan X (world coord at top-left of viewport)
    y: WB_MAX_HEIGHT / 4, // Initial pan Y
    scale: 0.5, // Initial zoom level
    isPanning: false,
    lastPanMouseX: 0, // Screen coordinates for panning
    lastPanMouseY: 0,
    isPanToolActive: false, // True if pan tool is selected
    // Pinch zoom state
    lastPinchDistance: 0,
    isPinching: false,
  };
  const WB_MIN_SCALE = 0.1;
  const WB_MAX_SCALE = 4.0;
  // --- End Whiteboard State ---

  let pipChatNeedsUpdate = false;
  let pipChatCanvas = null;
  let pipChatCtx = null;
  let pipChatStream = null;
  let pipChatUpdateRequestId = null;
  let isPipChatActive = false;
  const PIP_CANVAS_WIDTH = 400;
  const PIP_CANVAS_HEIGHT = 600;
  const PIP_FONT_SIZE_USER = 14;
  const PIP_FONT_SIZE_MSG = 13;
  const PIP_LINE_HEIGHT = 18;
  const PIP_PADDING = 10;
  const PIP_MSG_MAX_LINES = 3;

  let quizOptionsStreamer = [];
  let currentQuizQuestionIdStreamer = null;
  let isQuizActiveStreamer = false;

  let socket = null;

  // ==================================
  // INITIALIZATION FUNCTION
  // ==================================
  function initializeStreamer() {
    console.log("Initializing Streamer UI & Connections...");
    initSocket();
    initPeer();
    initAnimations();
    initWhiteboard();
    initPipChatCanvas();
    initUIEventListeners();
    updateStreamDuration();
    if (durationInterval) clearInterval(durationInterval);
    durationInterval = setInterval(updateStreamDuration, 1000);
    checkMediaPermissions();
    isPanelCollapsed =
      elements.controlPanel?.classList.contains("collapsed") || false;

    resetQuizUIStreamer();

    console.log(
      "Streamer Initialization Complete. Panel collapsed:",
      isPanelCollapsed
    );
  }

  // ==================================
  // SOCKET.IO LOGIC
  // ==================================
  function initSocket() {
    if (socket && socket.connected) {
      console.log("Socket already connected.");
      return;
    }
    socket = io();
    socket.on("connect_error", (err) => {
      console.error("Socket Connection Error:", err.message);
      alert(`Lỗi kết nối server: ${err.message}`);
      window.location.href = "https://hoctap-9a3.glitch.me/live";
    });
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("joinRoom", {
        roomId: streamerConfig.roomId,
        username: streamerConfig.username,
      });
      if (peerInstance && peerInstance.id && !peerInstance.disconnected) {
        socket.emit("streamerReady", {
          roomId: streamerConfig.roomId,
          peerId: peerInstance.id,
        });
      } else {
        console.warn(
          "Socket connected, but peer not ready to send streamerReady."
        );
      }
      socket.emit("wb:requestInitialState", { roomId: streamerConfig.roomId });
    });
    socket.on("disconnect", (reason) => {
      console.warn("Socket disconnected:", reason);
      alert("Mất kết nối tới server chat.");
      window.location.href = "https://hoctap-9a3.glitch.me/live";
    });
    socket.on("userJoined", (msg) => addChatMessage(msg, "system"));
    socket.on("viewerLeft", (msg) => addChatMessage(msg, "system", "left"));
    socket.on("newMessage", (data) => {
      if (data?.message?.content)
        addChatMessage(
          data.message.content,
          data.message.messageType || "guest",
          data.message.username || "Anonymous",
          new Date(data.message.timestamp || Date.now()),
          data.message
        );
      else console.warn("Received invalid message data:", data);
    });
    socket.on("updateViewers", (count) => {
      if (elements.viewerCount) elements.viewerCount.textContent = count ?? 0;
    });
    socket.on("commentPinned", (data) => displayPinnedComment(data?.message));
    socket.on("commentUnpinned", () => displayPinnedComment(null));
    socket.on("newViewer", ({ viewerId }) => {
      if (!viewerId) return;
      console.log("Socket received new viewer:", viewerId);
      allJoinedViewers.add(viewerId);
      callViewer(viewerId);
    });
    socket.on("viewerDisconnected", ({ viewerId }) => {
      if (!viewerId) return;
      console.log("Viewer disconnected:", viewerId);
      allJoinedViewers.delete(viewerId);
      if (currentCalls[viewerId]) {
        currentCalls[viewerId].close();
        delete currentCalls[viewerId];
      }
    });
    socket.on("updateViewersList", (data) => {
      const viewers = data?.viewers || [];
      viewers.forEach((viewer) => {
        if (typeof viewer === "object" && viewer.username) {
          viewerDrawPermissions[viewer.username] = viewer.canDraw || false;
        }
      });
      renderListModal(elements.viewersModalList, viewers, false);
    });
    socket.on("updateBannedList", (data) =>
      renderListModal(elements.bannedModalList, data?.banned || [], true)
    );
    socket.on("forceEndStream", (message) => {
      alert(message || "Stream đã bị kết thúc bởi quản trị viên.");
      stopLocalStream();
      if (socket) socket.disconnect();
      window.location.href = "https://hoctap-9a3.glitch.me/live";
    });
    socket.on("viewerBanned", (msg) => addChatMessage(msg, "system", "ban"));

    socket.on("wb:draw", (data) => {
      if (data && data.drawData) {
        drawOnWhiteboard(
          data.drawData.x0,
          data.drawData.y0,
          data.drawData.x1,
          data.drawData.y1,
          data.drawData.color,
          data.drawData.lineWidth,
          false,
          true,
          data.drawData.isEraser || false
        );
      }
    });
    socket.on("wb:clear", () => {
      clearWhiteboard(false);
    });
    socket.on("wb:initState", (state) => {
      console.log(
        "Streamer received initial whiteboard state (e.g., on rejoin)",
        state
      );
      if (!elements.whiteboardCanvas || !whiteboardCtx) {
        console.warn("Whiteboard not ready to init state.");
        return;
      }

      // Ensure whiteboard UI is active if we are receiving state
      if (!isWhiteboardActive) {
        showWhiteboard(); // This will call resize and initial redraw (which will be empty initially)
      } else {
        resizeWhiteboardCanvas(); // Ensure canvas is sized correctly before drawing history
      }

      wbDrawingHistory = []; // Clear local history before applying server's state

      if (state && state.history && Array.isArray(state.history)) {
        wbDrawingHistory = state.history.map((item) => ({ ...item })); // Deep copy
        console.log(
          `Whiteboard state restored from history. Items: ${wbDrawingHistory.length}. Redrawing...`
        );
      } else if (state && state.dataUrl) {
        // dataUrl restoration is more complex with a large virtual canvas and pan/zoom.
        // The dataUrl would represent the *entire* virtual canvas, which could be huge.
        // For simplicity, this example will prioritize history.
        // If you need dataUrl, it should ideally be of a "snapshot" view, or
        // you'd need to rethink how it's applied to a panned/zoomed canvas.
        console.warn(
          "Whiteboard state from Data URL is not fully supported with pan/zoom in this example. Prioritizing history if available."
        );
        if (!wbDrawingHistory.length) {
          // Only if no history
          // Potentially add a single image item to history representing the dataUrl at 0,0 of world.
          // This won't be perfectly accurate if the dataUrl was a snapshot of a panned/zoomed view.
          // wbDrawingHistory.push({ type: 'image', dataUrl: state.dataUrl, x: 0, y: 0, width: WB_MAX_WIDTH, height: WB_MAX_HEIGHT });
          console.log("Attempting to use dataUrl, but this is limited.");
        }
      } else {
        console.log(
          "Received empty or invalid initial whiteboard state. Whiteboard remains/is cleared."
        );
      }
      redrawWhiteboardFull(); // Redraw with the new (or empty) history and current camera
    });
    socket.on("wb:viewerRequestState", ({ viewerSocketId }) => {
      if (
        isWhiteboardActive &&
        elements.whiteboardCanvas &&
        wbDrawingHistory.length > 0
      ) {
        console.log(
          `Streamer sending whiteboard history to viewer ${viewerSocketId}`
        );
        socket.emit("wb:syncStateToViewer", {
          targetViewerId: viewerSocketId,
          history: wbDrawingHistory,
        });
      }
    });
    socket.on("wb:permissionUpdate", ({ viewerUsername, canDraw }) => {
      viewerDrawPermissions[viewerUsername] = canDraw;
      console.log(
        `Client: Permission to draw for ${viewerUsername} updated to ${canDraw}`
      );
      if (
        elements.viewersModal &&
        elements.viewersModal.style.display === "flex"
      ) {
        socket.emit("getViewersList", { roomId: streamerConfig.roomId });
      }
    });
    socket.on("wb:toggleVisibility", ({ isVisible }) => {
      if (isVisible) {
        if (!isWhiteboardActive) showWhiteboard();
      } else {
        if (isWhiteboardActive) hideWhiteboard();
      }
    });
    // ---- Start: Streamer Quiz Socket Listeners ----
    socket.on("quiz:newQuestion", ({ questionId }) => {
      currentQuizQuestionIdStreamer = questionId;
      if (elements.showQuizAnswerBtn)
        elements.showQuizAnswerBtn.disabled = false;
      if (elements.nextQuizQuestionBtn)
        elements.nextQuizQuestionBtn.disabled = false;
      if (elements.endQuizBtn) elements.endQuizBtn.disabled = false;
      if (elements.startQuizBtn) elements.startQuizBtn.disabled = true;
      if (elements.quizStreamerStatus) {
        const qText = elements.quizQuestionText.value.trim();
        elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đang hỏi: "${qText.substring(
          0,
          50
        )}..." (ID: ${questionId.substring(0, 6)})</p>`;
      }
    });

    socket.on("quiz:resultsUpdate", ({ questionId, results }) => {
      if (
        elements.quizStreamerResults &&
        questionId === currentQuizQuestionIdStreamer
      ) {
        let resultsHtml = "<h4>Kết quả hiện tại:</h4><ul>";
        const options = quizOptionsStreamer.map((opt) =>
          opt.inputElement.value.trim()
        );
        let totalVotes = 0;
        Object.values(results).forEach((count) => (totalVotes += count));

        for (const optionIndex in results) {
          const count = results[optionIndex];
          const percentage =
            totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
          const optionText =
            options[optionIndex] || `Lựa chọn ${parseInt(optionIndex) + 1}`;
          resultsHtml += `<li>${optionText}: ${count} (${percentage}%)</li>`;
        }
        resultsHtml += `</ul><p>Tổng số phiếu: ${totalVotes}</p>`;
        elements.quizStreamerResults.innerHTML = resultsHtml;
      }
    });

    socket.on(
      "quiz:correctAnswer",
      ({ questionId, correctAnswerIndex, results }) => {
        if (questionId === currentQuizQuestionIdStreamer) {
          if (elements.showQuizAnswerBtn)
            elements.showQuizAnswerBtn.disabled = true;
          if (elements.quizStreamerStatus) {
            const qText = elements.quizQuestionText
              ? elements.quizQuestionText.value.trim()
              : "Câu hỏi";
            const options = quizOptionsStreamer.map((opt) =>
              opt.inputElement.value.trim()
            );
            const correctOptText =
              options[correctAnswerIndex] ||
              `Lựa chọn ${correctAnswerIndex + 1}`;
            elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đã hiển thị đáp án cho "${qText.substring(
              0,
              50
            )}...". Đáp án đúng: <strong>${correctOptText}</strong></p>`;
          }
          if (elements.quizStreamerResults) {
            let resultsHtml = "<h4>Kết quả cuối cùng:</h4><ul>";
            const options = quizOptionsStreamer.map((opt) =>
              opt.inputElement.value.trim()
            );
            let totalVotes = 0;
            Object.values(results).forEach((count) => (totalVotes += count));

            for (const optionIndex in results) {
              const count = results[optionIndex];
              const percentage =
                totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
              const optionText =
                options[optionIndex] || `Lựa chọn ${parseInt(optionIndex) + 1}`;
              const isCorrect = parseInt(optionIndex) === correctAnswerIndex;
              resultsHtml += `<li ${
                isCorrect
                  ? 'style="font-weight:bold; color:var(--success-color);"'
                  : ""
              }>${optionText}: ${count} (${percentage}%) ${
                isCorrect ? " (ĐÚNG)" : ""
              }</li>`;
            }
            resultsHtml += `</ul><p>Tổng số phiếu: ${totalVotes}</p>`;
            elements.quizStreamerResults.innerHTML = resultsHtml;
          }
        }
      }
    );

    socket.on("quiz:ended", () => {
      isQuizActiveStreamer = false;
      resetQuizUIStreamer();
      if (elements.quizStreamerStatus)
        elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Trắc nghiệm đã kết thúc.</p>`;
    });

    socket.on("quiz:clearCurrent", () => {
      if (elements.quizStreamerStatus)
        elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chờ câu hỏi mới...</p>`;
      if (elements.quizStreamerResults)
        elements.quizStreamerResults.innerHTML = "";
      currentQuizQuestionIdStreamer = null;
    });

    socket.on("quiz:error", (errorMessage) => {
      if (typeof showAlert === "function") showAlert(errorMessage, "error");
      if (
        elements.startQuizBtn &&
        elements.startQuizBtn.disabled &&
        !isQuizActiveStreamer
      ) {
        elements.startQuizBtn.disabled = false;
        if (elements.quizQuestionText)
          elements.quizQuestionText.disabled = false;
        quizOptionsStreamer.forEach((opt) => {
          if (opt.inputElement) opt.inputElement.disabled = false;
        });
        if (elements.addQuizOptionBtn)
          elements.addQuizOptionBtn.disabled = false;
        if (elements.quizCorrectAnswerSelect)
          elements.quizCorrectAnswerSelect.disabled = false;
      }
    });
    // ---- End: Streamer Quiz Socket Listeners ----
  } // End initSocket

  // ==================================
  // PEERJS LOGIC
  // ==================================
  function initPeer() {
    try {
      const streamerPeerId = `${streamerConfig.roomId}_streamer_${Date.now()
        .toString()
        .slice(-5)}`;
      console.log("Initializing PeerJS with ID:", streamerPeerId);
      peerInstance = new Peer(streamerPeerId, streamerConfig.peerConfig);
      peerInstance.on("open", (id) => {
        console.log("Streamer PeerJS connected with actual ID:", id);
        if (socket && socket.connected) {
          socket.emit("streamerReady", {
            roomId: streamerConfig.roomId,
            peerId: id,
          });
        } else {
          console.warn("Peer opened, but socket not connected.");
        }
      });
      peerInstance.on("error", (err) => {
        console.error("PeerJS Error:", err);
        alert(
          `Lỗi Peer: ${err.type}. Một số chức năng có thể không hoạt động. Thử tải lại trang.`
        );
      });
      peerInstance.on("disconnected", () => {
        console.warn("PeerJS disconnected.");
      });
      peerInstance.on("close", () => {
        console.log("PeerJS closed.");
      });
      peerInstance.on("call", (call) => {
        console.warn("Incoming call to streamer, rejecting.");
        call.close();
      });
    } catch (error) {
      console.error("Failed to init PeerJS:", error);
      alert("Lỗi khởi tạo PeerJS.");
    }
  } // End initPeer

  // ==================================
  // WHITEBOARD LOGIC
  // ==================================
  function resizeWhiteboardCanvas() {
    if (
      !elements.whiteboardOverlay ||
      !elements.whiteboardCanvas ||
      !whiteboardCtx
    ) {
      console.warn("resizeWhiteboardCanvas: Missing elements, aborting.");
      return;
    }

    const overlay = elements.whiteboardOverlay;
    const canvas = elements.whiteboardCanvas;
    const toolbar = elements.whiteboardToolbar;

    const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
    const overlayPadding = 10; // Assuming 10px padding on each side of the overlay for the canvas area

    // Calculate available space for the canvas element (viewport)
    let viewportWidth = overlay.clientWidth - 2 * overlayPadding;
    let viewportHeight =
      overlay.clientHeight -
      toolbarHeight -
      2 * overlayPadding -
      (toolbar ? 5 : 0); /* extra gap for toolbar */

    viewportWidth = Math.max(10, viewportWidth);
    viewportHeight = Math.max(10, viewportHeight);

    // Set the drawing surface (buffer) size of the canvas element to match the viewport
    if (canvas.width !== viewportWidth || canvas.height !== viewportHeight) {
      canvas.width = viewportWidth;
      canvas.height = viewportHeight;
      console.log(
        `Whiteboard viewport (canvas element) resized to: ${canvas.width} x ${canvas.height}`
      );
    }

    // Set the display size of the canvas element (CSS pixels)
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;

    if (toolbar) {
      toolbar.style.width = `${viewportWidth}px`;
    }

    // After resizing the viewport, redraw the content based on current pan/zoom
    redrawWhiteboardFull();
  }

  function showWhiteboard() {
    if (!elements.whiteboardOverlay || isWhiteboardActive) return;

    isWhiteboardActive = true;
    elements.whiteboardOverlay.style.opacity = 0;
    elements.whiteboardOverlay.style.display = "flex";

    // Call resize to set up canvas dimensions and initial draw
    // resizeWhiteboardCanvas will internally call redrawWhiteboardFull
    resizeWhiteboardCanvas();

    if (!prefersReducedMotion) {
      gsap.to(elements.whiteboardOverlay, {
        duration: 0.5,
        autoAlpha: 1,
        ease: "power2.out",
      });
    } else {
      gsap.set(elements.whiteboardOverlay, { autoAlpha: 1 });
    }
    elements.toggleWhiteboardBtn?.classList.add("active");
    window.addEventListener("resize", resizeWhiteboardCanvas); // Re-calculate viewport on window resize
    console.log("Streamer Whiteboard shown. Active:", isWhiteboardActive);
    // Server may send wb:initState or streamer may request it if needed
    // For now, assumes streamer might have local history or starts fresh
    // If streamer rejoins and server sends wb:initState, that will populate wbDrawingHistory
    // and then redrawWhiteboardFull will render it.
  }

  function hideWhiteboard() {
    if (!elements.whiteboardOverlay || !isWhiteboardActive) return;

    const onHideComplete = () => {
      isWhiteboardActive = false;
      elements.whiteboardOverlay.style.display = "none";
      elements.toggleWhiteboardBtn?.classList.remove("active");
      window.removeEventListener("resize", resizeWhiteboardCanvas);
      console.log("Streamer Whiteboard hidden. Active:", isWhiteboardActive);
    };

    if (!prefersReducedMotion) {
      gsap.to(elements.whiteboardOverlay, {
        duration: 0.4,
        autoAlpha: 0,
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    } else {
      gsap.set(elements.whiteboardOverlay, { autoAlpha: 0 });
      onHideComplete();
    }
  }

  function drawOnWhiteboard(
    worldX0,
    worldY0,
    worldX1,
    worldY1, // Coordinates are now in world space
    color,
    lineWidth,
    emitEvent = true,
    isRedrawing = false,
    isEraser = false
  ) {
    if (!whiteboardCtx || !isWhiteboardActive) {
      // Check isWhiteboardActive
      // console.warn("Attempted to draw on whiteboard while not active or no context.");
      return;
    }

    const actualColor = isEraser ? WB_ERASER_COLOR_STREAMER : color;
    const actualLineWidth = isEraser
      ? (lineWidth || wbCurrentLineWidth) + 10
      : lineWidth || wbCurrentLineWidth;

    // Draw directly onto the viewport using transformed world coordinates
    // The redrawWhiteboardFull function handles the actual context transform for display
    // For a single new line, we can draw it immediately if we apply the transform here too.
    // However, it's often simpler to just add to history and call redraw.
    // For responsiveness, let's draw it directly and then it will be part of the next full redraw.

    whiteboardCtx.save();
    whiteboardCtx.scale(wbCamera.scale, wbCamera.scale);
    whiteboardCtx.translate(-wbCamera.x, -wbCamera.y);

    whiteboardCtx.beginPath();
    whiteboardCtx.moveTo(worldX0, worldY0);
    whiteboardCtx.lineTo(worldX1, worldY1);
    whiteboardCtx.strokeStyle = actualColor;
    whiteboardCtx.lineWidth = actualLineWidth; // Use lineWidth directly, scaling is handled by context
    whiteboardCtx.globalCompositeOperation = isEraser
      ? "destination-out"
      : "source-over";
    whiteboardCtx.stroke();
    whiteboardCtx.closePath();
    whiteboardCtx.globalCompositeOperation = "source-over"; // Reset
    whiteboardCtx.restore();

    if (!isRedrawing) {
      // Add to history using world coordinates
      wbDrawingHistory.push({
        type: "draw",
        x0: worldX0,
        y0: worldY0,
        x1: worldX1,
        y1: worldY1,
        color: color, // Store original color for pen
        lineWidth: lineWidth || wbCurrentLineWidth, // Store original line width for pen
        isEraser,
      });
      if (wbDrawingHistory.length > 500) {
        // Increased history limit
        wbDrawingHistory.splice(0, wbDrawingHistory.length - 500);
      }
    }

    if (emitEvent && socket && socket.connected && userCanDrawOnWhiteboard()) {
      socket.emit("wb:draw", {
        roomId: streamerConfig.roomId,
        drawData: {
          // Send world coordinates
          x0: worldX0,
          y0: worldY0,
          x1: worldX1,
          y1: worldY1,
          color: color,
          lineWidth: lineWidth || wbCurrentLineWidth,
          isEraser,
          username: streamerConfig.username,
        },
      });
    }
  }

  function handleWhiteboardDrawStart(event) {
    if (!isWhiteboardActive || !userCanDrawOnWhiteboard()) return;
    event.preventDefault();
    isDrawingOnWhiteboard = true;
    const pos = getMousePos(elements.whiteboardCanvas, event);
    wbLastX = pos.x;
    wbLastY = pos.y;
    drawOnWhiteboard(
      wbLastX - 0.5,
      wbLastY - 0.5,
      wbLastX,
      wbLastY,
      wbCurrentColor,
      wbCurrentLineWidth,
      true,
      false,
      wbIsEraserMode
    );
  }

  function handleWhiteboardDrawing(event) {
    if (
      !isDrawingOnWhiteboard ||
      !isWhiteboardActive ||
      !userCanDrawOnWhiteboard()
    )
      return;
    event.preventDefault();
    if (wbEventThrottleTimer) return;
    wbEventThrottleTimer = setTimeout(() => {
      const pos = getMousePos(elements.whiteboardCanvas, event);
      drawOnWhiteboard(
        wbLastX,
        wbLastY,
        pos.x,
        pos.y,
        wbCurrentColor,
        wbCurrentLineWidth,
        true,
        false,
        wbIsEraserMode
      );
      wbLastX = pos.x;
      wbLastY = pos.y;
      wbEventThrottleTimer = null;
    }, WB_THROTTLE_INTERVAL);
  }

  function handleWhiteboardDrawEnd() {
    if (!isDrawingOnWhiteboard || !isWhiteboardActive) return;
    isDrawingOnWhiteboard = false;
    clearTimeout(wbEventThrottleTimer);
    wbEventThrottleTimer = null;
  }

  function clearWhiteboard(emitEvent = true) {
    if (!whiteboardCtx || !elements.whiteboardCanvas) return;

    // Clear the viewport
    whiteboardCtx.clearRect(
      0,
      0,
      elements.whiteboardCanvas.width,
      elements.whiteboardCanvas.height
    );

    // Clear the drawing history
    wbDrawingHistory = [];
    wbDrawingHistory.push({ type: "clear" }); // Add a clear marker to history
    if (wbDrawingHistory.length > 200)
      // Keep history trim, though it's just 'clear' now
      wbDrawingHistory.splice(0, wbDrawingHistory.length - 200);

    // Redraw (which will now be empty due to cleared history)
    redrawWhiteboardFull(); // This ensures the current transform is respected

    if (emitEvent && socket && socket.connected && userCanDrawOnWhiteboard()) {
      socket.emit("wb:clear", {
        roomId: streamerConfig.roomId,
        username: streamerConfig.username,
      });
    }
    console.log("Whiteboard cleared (all history)");
  }

  function userCanDrawOnWhiteboard() {
    // For streamer.js, the streamer always has permission.
    // Logic for viewers to check their permission would be in liveRoom.js
    return streamerConfig.username === streamerConfig.roomOwner;
  }

  function initWhiteboard() {
    if (!elements.whiteboardCanvas) {
      console.error("Whiteboard canvas element not found!");
      return;
    }
    whiteboardCtx = elements.whiteboardCanvas.getContext("2d", { alpha: true }); // Use alpha if bg is styled via CSS
    if (!whiteboardCtx) {
      console.error("Failed to get 2D context for whiteboard!");
      return;
    }

    // Set initial canvas (viewport) size - this will be called by resizeWhiteboardCanvas too
    // The actual drawing surface size is conceptual (WB_MAX_WIDTH, WB_MAX_HEIGHT)
    // resizeWhiteboardCanvas() will set canvas.width and canvas.height to viewport dimensions
    // and handle redrawing.

    wbCurrentColor = elements.wbColorPicker?.value || "#FFFFFF";
    if (elements.wbColorPicker) elements.wbColorPicker.value = wbCurrentColor;
    wbCurrentLineWidth = parseInt(elements.wbLineWidthRange?.value || "3", 10);
    if (elements.wbLineWidthRange)
      elements.wbLineWidthRange.value = wbCurrentLineWidth;
    if (elements.wbLineWidthValueDisplay)
      elements.wbLineWidthValueDisplay.textContent = wbCurrentLineWidth;

    // Event listeners for drawing, panning, zooming
    elements.whiteboardCanvas.addEventListener(
      "mousedown",
      handleWhiteboardMouseDown
    );
    elements.whiteboardCanvas.addEventListener(
      "mousemove",
      handleWhiteboardMouseMove
    );
    elements.whiteboardCanvas.addEventListener(
      "mouseup",
      handleWhiteboardMouseUp
    );
    elements.whiteboardCanvas.addEventListener(
      "mouseout",
      handleWhiteboardMouseOut
    ); // End drawing/panning if mouse leaves
    elements.whiteboardCanvas.addEventListener(
      "wheel",
      handleWhiteboardWheelZoom,
      { passive: false }
    );

    elements.whiteboardCanvas.addEventListener(
      "touchstart",
      handleWhiteboardTouchStart,
      { passive: false }
    );
    elements.whiteboardCanvas.addEventListener(
      "touchmove",
      handleWhiteboardTouchMove,
      { passive: false }
    );
    elements.whiteboardCanvas.addEventListener(
      "touchend",
      handleWhiteboardTouchEnd
    );
    elements.whiteboardCanvas.addEventListener(
      "touchcancel",
      handleWhiteboardTouchEnd
    );

    // Set initial cursor based on whether pan tool is active (if such a tool exists and is initially active)
    elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
      ? "grab"
      : "crosshair";

    console.log("Whiteboard Initialized with Pan/Zoom capability.");
    // Initial draw will happen when showWhiteboard calls resize, or if wb:initState comes
  }

  function getCanvasWorldCoordinates(screenX, screenY) {
    if (!elements.whiteboardCanvas || !whiteboardCtx) return { x: 0, y: 0 };
    const canvasRect = elements.whiteboardCanvas.getBoundingClientRect();
    // Mouse position relative to the canvas viewport element
    const mouseXInViewport = screenX - canvasRect.left;
    const mouseYInViewport = screenY - canvasRect.top;

    // Transform viewport coordinates to world coordinates
    const worldX = mouseXInViewport / wbCamera.scale + wbCamera.x;
    const worldY = mouseYInViewport / wbCamera.scale + wbCamera.y;

    return { x: worldX, y: worldY };
  }

  function redrawWhiteboardFull() {
    if (!whiteboardCtx || !elements.whiteboardCanvas) return;

    const canvas = elements.whiteboardCanvas;
    whiteboardCtx.clearRect(0, 0, canvas.width, canvas.height); // Clear viewport

    whiteboardCtx.save();
    // Apply camera transformations
    whiteboardCtx.scale(wbCamera.scale, wbCamera.scale);
    whiteboardCtx.translate(-wbCamera.x, -wbCamera.y);

    // Set common line styles once before the loop for efficiency
    whiteboardCtx.lineCap = "round";
    whiteboardCtx.lineJoin = "round";

    // Redraw all history items
    wbDrawingHistory.forEach((item) => {
      if (item.type === "draw") {
        whiteboardCtx.beginPath();
        whiteboardCtx.moveTo(item.x0, item.y0);
        whiteboardCtx.lineTo(item.x1, item.y1);
        whiteboardCtx.strokeStyle = item.isEraser
          ? WB_ERASER_COLOR_STREAMER
          : item.color;
        whiteboardCtx.lineWidth = item.isEraser
          ? item.lineWidth + 10
          : item.lineWidth; // Eraser slightly larger
        whiteboardCtx.globalCompositeOperation = item.isEraser
          ? "destination-out"
          : "source-over";
        whiteboardCtx.stroke();
        whiteboardCtx.closePath();
      } else if (item.type === "clear") {
        // This is tricky with a panned/zoomed canvas.
        // A 'clear' in history means clear everything *at that point in time*.
        // For simplicity now, a 'clear' event from server will just clear the history array
        // and then this redraw will effectively clear the canvas.
        // If clear events are stored and need to be replayed, they should clear the *entire* world.
        // This is handled by wbDrawingHistory = [] before redraw on server 'wb:clear' event.
      }
    });
    whiteboardCtx.globalCompositeOperation = "source-over"; // Reset composite op
    whiteboardCtx.restore();
  }

  let wbLastWorldX = 0;
  let wbLastWorldY = 0;

  function handleWhiteboardMouseDown(event) {
    if (!isWhiteboardActive || !elements.whiteboardCanvas) return;
    event.preventDefault();

    const worldCoords = getCanvasWorldCoordinates(event.clientX, event.clientY);

    if (wbCamera.isPanToolActive || event.button === 1) {
      // Middle mouse button for panning
      wbCamera.isPanning = true;
      wbCamera.lastPanMouseX = event.clientX;
      wbCamera.lastPanMouseY = event.clientY;
      elements.whiteboardCanvas.style.cursor = "grabbing";
    } else if (event.button === 0 && userCanDrawOnWhiteboard()) {
      // Left mouse button for drawing
      isDrawingOnWhiteboard = true;
      wbLastWorldX = worldCoords.x;
      wbLastWorldY = worldCoords.y;

      // Draw a dot for single clicks
      drawOnWhiteboard(
        wbLastWorldX - 0.01 / wbCamera.scale, // Offset slightly to ensure a dot is drawn
        wbLastWorldY - 0.01 / wbCamera.scale,
        wbLastWorldX,
        wbLastWorldY,
        wbCurrentColor,
        wbCurrentLineWidth,
        true,
        false,
        wbIsEraserMode
      );
    }
  }

  function handleWhiteboardMouseMove(event) {
    if (!isWhiteboardActive || !elements.whiteboardCanvas) return;
    event.preventDefault();

    if (wbCamera.isPanning) {
      const dx = event.clientX - wbCamera.lastPanMouseX;
      const dy = event.clientY - wbCamera.lastPanMouseY;

      wbCamera.x -= dx / wbCamera.scale; // Pan in world coordinates
      wbCamera.y -= dy / wbCamera.scale;

      // Clamp panning to keep some part of the virtual canvas visible (optional)
      // wbCamera.x = Math.max(0, Math.min(wbCamera.x, WB_MAX_WIDTH - elements.whiteboardCanvas.width / wbCamera.scale));
      // wbCamera.y = Math.max(0, Math.min(wbCamera.y, WB_MAX_HEIGHT - elements.whiteboardCanvas.height / wbCamera.scale));

      wbCamera.lastPanMouseX = event.clientX;
      wbCamera.lastPanMouseY = event.clientY;
      redrawWhiteboardFull();
    } else if (isDrawingOnWhiteboard && userCanDrawOnWhiteboard()) {
      if (wbEventThrottleTimer) return;
      wbEventThrottleTimer = setTimeout(() => {
        const worldCoords = getCanvasWorldCoordinates(
          event.clientX,
          event.clientY
        );
        drawOnWhiteboard(
          wbLastWorldX,
          wbLastWorldY,
          worldCoords.x,
          worldCoords.y,
          wbCurrentColor,
          wbCurrentLineWidth,
          true,
          false,
          wbIsEraserMode
        );
        wbLastWorldX = worldCoords.x;
        wbLastWorldY = worldCoords.y;
        wbEventThrottleTimer = null;
      }, WB_THROTTLE_INTERVAL);
    }
  }

  function handleWhiteboardMouseUp(event) {
    if (wbCamera.isPanning) {
      wbCamera.isPanning = false;
      elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
        ? "grab"
        : "crosshair";
    }
    if (isDrawingOnWhiteboard) {
      isDrawingOnWhiteboard = false;
      clearTimeout(wbEventThrottleTimer);
      wbEventThrottleTimer = null;
    }
  }

  function handleWhiteboardMouseOut(event) {
    // Similar to mouseup, stop current operations
    if (wbCamera.isPanning) {
      // Keep panning if mouse button is still held, but it left the canvas
      // For simplicity, we can stop panning. More complex logic would track global mouse up.
      // wbCamera.isPanning = false;
      // elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive ? 'grab' : 'crosshair';
    }
    if (isDrawingOnWhiteboard) {
      isDrawingOnWhiteboard = false;
      clearTimeout(wbEventThrottleTimer);
      wbEventThrottleTimer = null;
    }
  }

  function handleWhiteboardWheelZoom(event) {
    if (!isWhiteboardActive || !elements.whiteboardCanvas) return;
    event.preventDefault();

    const zoomFactor = 1.1;
    const oldScale = wbCamera.scale;

    if (event.deltaY < 0) {
      // Zoom in
      wbCamera.scale *= zoomFactor;
    } else {
      // Zoom out
      wbCamera.scale /= zoomFactor;
    }
    wbCamera.scale = Math.max(
      WB_MIN_SCALE,
      Math.min(WB_MAX_SCALE, wbCamera.scale)
    );

    // Zoom towards the mouse cursor
    const worldCoords = getCanvasWorldCoordinates(event.clientX, event.clientY);

    wbCamera.x =
      worldCoords.x -
      (worldCoords.x - wbCamera.x) * (oldScale / wbCamera.scale);
    wbCamera.y =
      worldCoords.y -
      (worldCoords.y - wbCamera.y) * (oldScale / wbCamera.scale);

    redrawWhiteboardFull();
  }

  // --- Touch Event Handlers for Pan/Zoom/Draw ---
  let touchCache = []; // To store active touch points for pinch-zoom

  function handleWhiteboardTouchStart(event) {
    if (!isWhiteboardActive || !elements.whiteboardCanvas) return;
    event.preventDefault(); // Prevent default touch actions like scrolling page

    const touches = event.touches;
    for (let i = 0; i < touches.length; i++) {
      touchCache.push(copyTouch(touches[i]));
    }

    if (touchCache.length === 1) {
      // Single touch: either drawing or panning
      const touch = touchCache[0];
      const worldCoords = getCanvasWorldCoordinates(
        touch.clientX,
        touch.clientY
      );

      if (wbCamera.isPanToolActive) {
        wbCamera.isPanning = true;
        wbCamera.lastPanMouseX = touch.clientX;
        wbCamera.lastPanMouseY = touch.clientY;
        elements.whiteboardCanvas.style.cursor = "grabbing"; // Might not be visible on touch
      } else if (userCanDrawOnWhiteboard()) {
        isDrawingOnWhiteboard = true;
        wbLastWorldX = worldCoords.x;
        wbLastWorldY = worldCoords.y;
        drawOnWhiteboard(
          // Draw a dot
          wbLastWorldX - 0.01 / wbCamera.scale,
          wbLastWorldY - 0.01 / wbCamera.scale,
          wbLastWorldX,
          wbLastWorldY,
          wbCurrentColor,
          wbCurrentLineWidth,
          true,
          false,
          wbIsEraserMode
        );
      }
    } else if (touchCache.length === 2) {
      // Two touches: pinch-zoom
      isDrawingOnWhiteboard = false; // Stop drawing if it was active
      wbCamera.isPanning = false; // Stop panning if it was active
      wbCamera.isPinching = true;
      wbCamera.lastPinchDistance = getPinchDistance(
        touchCache[0],
        touchCache[1]
      );
    }
  }

  function handleWhiteboardTouchMove(event) {
    if (!isWhiteboardActive || !elements.whiteboardCanvas) return;
    event.preventDefault();

    const touches = event.touches;
    const currentTouchCache = [];
    for (let i = 0; i < touches.length; i++) {
      // Update touch cache
      const idx = getTouchIndexById(touches[i].identifier);
      if (idx >= 0) {
        touchCache[idx] = copyTouch(touches[i]); // Update existing touch
        currentTouchCache.push(touchCache[idx]);
      } else {
        // This case should ideally not happen if start correctly caches
        // console.warn("Touch move for unknown touch ID");
      }
    }

    if (touchCache.length === 1 && !wbCamera.isPinching) {
      // Single touch movement
      const touch = touchCache[0];
      if (wbCamera.isPanning) {
        const dx = touch.clientX - wbCamera.lastPanMouseX;
        const dy = touch.clientY - wbCamera.lastPanMouseY;
        wbCamera.x -= dx / wbCamera.scale;
        wbCamera.y -= dy / wbCamera.scale;
        wbCamera.lastPanMouseX = touch.clientX;
        wbCamera.lastPanMouseY = touch.clientY;
        redrawWhiteboardFull();
      } else if (isDrawingOnWhiteboard && userCanDrawOnWhiteboard()) {
        if (wbEventThrottleTimer) return;
        wbEventThrottleTimer = setTimeout(() => {
          const worldCoords = getCanvasWorldCoordinates(
            touch.clientX,
            touch.clientY
          );
          drawOnWhiteboard(
            wbLastWorldX,
            wbLastWorldY,
            worldCoords.x,
            worldCoords.y,
            wbCurrentColor,
            wbCurrentLineWidth,
            true,
            false,
            wbIsEraserMode
          );
          wbLastWorldX = worldCoords.x;
          wbLastWorldY = worldCoords.y;
          wbEventThrottleTimer = null;
        }, WB_THROTTLE_INTERVAL);
      }
    } else if (touchCache.length === 2 && wbCamera.isPinching) {
      // Pinch-zoom movement
      const newDist = getPinchDistance(touchCache[0], touchCache[1]);
      const oldScale = wbCamera.scale;

      wbCamera.scale *= newDist / wbCamera.lastPinchDistance;
      wbCamera.scale = Math.max(
        WB_MIN_SCALE,
        Math.min(WB_MAX_SCALE, wbCamera.scale)
      );

      // Zoom towards the pinch center
      const pinchCenterX = (touchCache[0].clientX + touchCache[1].clientX) / 2;
      const pinchCenterY = (touchCache[0].clientY + touchCache[1].clientY) / 2;
      const worldPinchCenter = getCanvasWorldCoordinates(
        pinchCenterX,
        pinchCenterY
      );

      wbCamera.x =
        worldPinchCenter.x -
        (worldPinchCenter.x - wbCamera.x) * (oldScale / wbCamera.scale);
      wbCamera.y =
        worldPinchCenter.y -
        (worldPinchCenter.y - wbCamera.y) * (oldScale / wbCamera.scale);

      wbCamera.lastPinchDistance = newDist;
      redrawWhiteboardFull();
    }
  }

  function handleWhiteboardTouchEnd(event) {
    if (!isWhiteboardActive) return;
    // event.preventDefault(); // Not always needed for touchend, but good practice if other handlers use it

    removeTouches(event.changedTouches); // Remove ended touches from cache

    if (isDrawingOnWhiteboard) {
      isDrawingOnWhiteboard = false;
      clearTimeout(wbEventThrottleTimer);
      wbEventThrottleTimer = null;
    }
    if (wbCamera.isPanning) {
      wbCamera.isPanning = false;
      elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
        ? "grab"
        : "crosshair";
    }
    if (wbCamera.isPinching && touchCache.length < 2) {
      wbCamera.isPinching = false;
      wbCamera.lastPinchDistance = 0;
    }

    // If all touches are up, reset state
    if (event.touches.length === 0) {
      touchCache = [];
      isDrawingOnWhiteboard = false;
      wbCamera.isPanning = false;
      wbCamera.isPinching = false;
      elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
        ? "grab"
        : "crosshair";
    }
  }

  // --- Touch Helper Functions ---
  function copyTouch(touch) {
    return {
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
  }
  function getTouchIndexById(idToFind) {
    for (let i = 0; i < touchCache.length; i++) {
      if (touchCache[i].identifier == idToFind) {
        return i;
      }
    }
    return -1; // not found
  }
  function removeTouches(touches) {
    for (let i = 0; i < touches.length; i++) {
      const idx = getTouchIndexById(touches[i].identifier);
      if (idx >= 0) {
        touchCache.splice(idx, 1);
      }
    }
  }
  function getPinchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ==================================
  // PICTURE-IN-PICTURE CHAT LOGIC
  // ==================================
  function initPipChatCanvas() {
    if (!elements.pipChatBtn) return;

    if (!pipChatCanvas) {
      pipChatCanvas = document.createElement("canvas");
    }
    // Kích thước canvas nên phù hợp với những gì bạn muốn hiển thị trong PiP
    pipChatCanvas.width = PIP_CANVAS_WIDTH; // ~400
    pipChatCanvas.height = PIP_CANVAS_HEIGHT; // ~600

    pipChatCtx = pipChatCanvas.getContext("2d");

    if (!pipChatCtx) {
      console.error(
        "Failed to create 2D context for PiP chat canvas (html2canvas target)."
      );
      if (elements.pipChatBtn) {
        elements.pipChatBtn.disabled = true;
        elements.pipChatBtn.title = "Không thể tạo canvas cho PiP Chat.";
        elements.pipChatBtn.style.display = "none";
      }
      return;
    }
    console.log("PiP Chat Canvas (for html2canvas target) initialized.");
  }

  function drawPipChatFrame() {
    if (!isPipChatActive) {
      if (pipChatUpdateRequestId) {
        cancelAnimationFrame(pipChatUpdateRequestId);
        pipChatUpdateRequestId = null;
      }
      return;
    }
    // Vẫn giữ requestAnimationFrame để có thể cập nhật nếu cần (ví dụ: hiệu ứng scrolling)
    // nhưng việc vẽ chỉ xảy ra nếu pipChatNeedsUpdate = true
    pipChatUpdateRequestId = requestAnimationFrame(drawPipChatFrame);

    if (
      !pipChatNeedsUpdate ||
      !pipChatCtx ||
      !pipChatCanvas ||
      !elements.chatMessagesList
    ) {
      return;
    }
    pipChatNeedsUpdate = false;

    // 1. Clear canvas
    pipChatCtx.fillStyle = "rgba(15, 15, 30, 0.95)"; // Nền đậm, gần như mờ đục
    pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);

    // 2. Lấy N tin nhắn cuối
    const messages = Array.from(elements.chatMessagesList.children).slice(-10); // Số lượng tin nhắn hiển thị
    let currentY = PIP_CANVAS_HEIGHT - PIP_PADDING;

    pipChatCtx.textBaseline = "bottom"; // Căn chỉnh text từ dưới lên cho mỗi dòng

    const FONT_FAMILY = "Inter, Arial, sans-serif";
    const MAX_WIDTH = PIP_CANVAS_WIDTH - 2 * PIP_PADDING;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break;

      const msgItem = messages[i];
      const usernameEl = msgItem.querySelector(".msg-username");
      const bodyEl = msgItem.querySelector(".msg-body");
      const timestampEl = msgItem.querySelector(".msg-timestamp");

      const username = usernameEl ? usernameEl.textContent.trim() : "System";
      // Lấy text thuần túy, bỏ qua mọi HTML/Markdown cho hiệu suất
      const textContent = bodyEl
        ? (bodyEl.innerText || bodyEl.textContent).trim()
        : "";
      const timestamp = timestampEl ? timestampEl.textContent.trim() : "";

      let userColor = "#a0a0c0"; // Guest - var(--text-medium)
      if (msgItem.classList.contains("message-host")) userColor = "#8a7ffb";
      // var(--primary-color)
      else if (msgItem.classList.contains("message-pro")) userColor = "#ffde7d";
      // var(--accent-color)
      else if (msgItem.classList.contains("message-system"))
        userColor = "#8899bb"; // Hơi xanh xám

      // --- Vẽ nội dung tin nhắn (text thuần túy) ---
      pipChatCtx.font = `${PIP_FONT_SIZE_MSG}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = "#e8eaf6"; // var(--text-light)

      // Hàm helper để ngắt dòng và vẽ text
      const drawWrappedText = (text, x, startY, lineHeight, maxWidth) => {
        const words = text.split(" ");
        let line = "";
        let linesDrawn = 0;
        let currentDrawY = startY;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const metrics = pipChatCtx.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            if (linesDrawn < PIP_MSG_MAX_LINES - 1) {
              // Trừ 1 dòng cho username/timestamp
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY; // Hết chỗ
              pipChatCtx.fillText(line.trim(), x, currentDrawY);
              currentDrawY -= lineHeight;
              line = words[n] + " ";
              linesDrawn++;
            } else {
              // Đã đủ số dòng tối đa, thêm "..."
              let lastLine = line.trim();
              while (
                pipChatCtx.measureText(lastLine + "...").width > maxWidth &&
                lastLine.length > 0
              ) {
                lastLine = lastLine.slice(0, -1);
              }
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
              pipChatCtx.fillText(lastLine + "...", x, currentDrawY);
              return currentDrawY - lineHeight; // Kết thúc vẽ cho tin nhắn này
            }
          } else {
            line = testLine;
          }
        }
        if (line.trim()) {
          // Vẽ dòng cuối cùng nếu còn
          if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
          pipChatCtx.fillText(line.trim(), x, currentDrawY);
          currentDrawY -= lineHeight;
        }
        return currentDrawY;
      };

      currentY = drawWrappedText(
        textContent,
        PIP_PADDING,
        currentY,
        PIP_LINE_HEIGHT,
        MAX_WIDTH
      );
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break; // Kiểm tra lại sau khi vẽ text

      // --- Vẽ username và timestamp ---
      pipChatCtx.font = `bold ${PIP_FONT_SIZE_USER}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = userColor;
      const userLine = `${username} ${timestamp ? `(${timestamp})` : ""}`;
      // Không cần ngắt dòng cho username, nếu quá dài sẽ bị cắt ở MAX_WIDTH (do fillText)
      pipChatCtx.fillText(userLine, PIP_PADDING, currentY, MAX_WIDTH);
      currentY -= PIP_LINE_HEIGHT + 4; // Khoảng cách giữa các tin nhắn
    }
  }

  async function togglePipChat() {
    if (
      !elements.pipChatBtn ||
      !elements.pipChatVideoPlayer ||
      !pipChatCanvas ||
      !pipChatCtx
    ) {
      console.error("PiP Chat: Prerequisites not met.");
      if (elements.pipChatBtn) elements.pipChatBtn.disabled = true;
      return;
    }

    if (document.pictureInPictureElement === elements.pipChatVideoPlayer) {
      console.log("PiP Chat: Attempting to exit PiP mode.");
      try {
        await document.exitPictureInPicture();
      } catch (error) {
        console.error("PiP Chat: Lỗi khi thoát PiP:", error);
      }
    } else {
      console.log("PiP Chat: Attempting to enter PiP mode.");

      // 1. Tạo hoặc xác thực stream từ canvas
      if (
        !pipChatStream ||
        !pipChatStream.active ||
        pipChatStream.getVideoTracks().length === 0 ||
        !pipChatStream.getVideoTracks()[0].enabled ||
        pipChatStream.getVideoTracks()[0].muted
      ) {
        console.log(
          "PiP Chat: Current stream invalid or missing. Attempting to create/recreate canvas stream."
        );
        if (pipChatStream && pipChatStream.active) {
          // Dừng stream cũ nếu có và không hợp lệ
          pipChatStream.getTracks().forEach((track) => track.stop());
        }
        try {
          pipChatCtx.fillStyle = "#000";
          pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);
          pipChatStream = pipChatCanvas.captureStream(25);
          if (!pipChatStream || pipChatStream.getVideoTracks().length === 0) {
            console.error(
              "PiP Chat: Failed to capture stream or stream has no video tracks."
            );
            alert(
              "Không thể tạo stream video từ nội dung chat cho PiP (Không có video track)."
            );
            pipChatStream = null;
            return;
          }
          console.log(
            "PiP Chat: Canvas stream captured/recreated successfully.",
            pipChatStream.id
          );
        } catch (e) {
          console.error(
            "PiP Chat: Lỗi nghiêm trọng khi captureStream từ canvas:",
            e
          );
          alert(
            "Trình duyệt không hỗ trợ đầy đủ tính năng PiP cho chat (lỗi captureStream)."
          );
          pipChatStream = null;
          return;
        }
      } else {
        console.log(
          "PiP Chat: Using existing active stream.",
          pipChatStream.id
        );
      }

      // Hàm dọn dẹp chung khi PiP thất bại
      const handlePipFailure = (
        errorMessage = "Không thể vào chế độ PiP cho chat."
      ) => {
        alert(errorMessage);
        if (pipChatStream && pipChatStream.active) {
          pipChatStream.getTracks().forEach((track) => track.stop());
        }
        pipChatStream = null;
        isPipChatActive = false;
        if (pipChatUpdateRequestId) {
          cancelAnimationFrame(pipChatUpdateRequestId);
          pipChatUpdateRequestId = null;
        }
        if (elements.pipChatBtn) {
          elements.pipChatBtn.classList.remove("active");
          elements.pipChatBtn.innerHTML =
            '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
        }
        // Dọn dẹp event listeners trên video player
        elements.pipChatVideoPlayer.removeEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "error",
          onCanPlayOrError
        );
      };

      // Hàm để xử lý việc vào PiP sau khi video sẵn sàng
      const enterPiPWhenReady = async () => {
        console.log(
          "PiP Chat: enterPiPWhenReady called. Video readyState:",
          elements.pipChatVideoPlayer.readyState
        );
        try {
          // Đảm bảo video không ở trạng thái lỗi
          if (elements.pipChatVideoPlayer.error) {
            console.error(
              "PiP Chat: Video player has an error:",
              elements.pipChatVideoPlayer.error
            );
            handlePipFailure("Lỗi video player khi chuẩn bị PiP.");
            return;
          }
          if (elements.pipChatVideoPlayer.paused) {
            console.log("PiP Chat: Video is paused, attempting to play.");
            await elements.pipChatVideoPlayer.play();
            console.log(
              "PiP Chat: pipChatVideoPlayer.play() promise resolved."
            );
          }
          console.log("PiP Chat: Requesting Picture-in-Picture.");
          await elements.pipChatVideoPlayer.requestPictureInPicture();
        } catch (error) {
          console.error(
            "PiP Chat: Lỗi trong enterPiPWhenReady (play video hoặc requestPictureInPicture):",
            error.name,
            error.message,
            error
          );
          let userMessage = `Không thể vào PiP: ${error.message}`;
          if (error.name === "NotAllowedError")
            userMessage =
              "Yêu cầu vào PiP bị từ chối. Hãy đảm bảo bạn đã tương tác với trang.";
          else if (error.name === "SecurityError")
            userMessage = "Không thể vào PiP do giới hạn bảo mật.";
          else if (error.name === "InvalidStateError")
            userMessage = "Video cho PiP đang ở trạng thái không hợp lệ.";
          else if (error.name === "NotFoundError")
            userMessage = "Không tìm thấy tài nguyên video hợp lệ cho PiP.";
          handlePipFailure(userMessage);
        }
      };

      // Gộp các listener lại
      const onCanPlayOrError = async (event) => {
        elements.pipChatVideoPlayer.removeEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "error",
          onCanPlayOrError
        );

        if (event.type === "error" || elements.pipChatVideoPlayer.error) {
          console.error(
            "PiP Chat: Video player error event caught:",
            event.type,
            elements.pipChatVideoPlayer.error
          );
          handlePipFailure("Lỗi khi tải dữ liệu video cho PiP.");
        } else {
          console.log(
            `PiP Chat: Video event '${event.type}' fired. Proceeding to enter PiP.`
          );
          await enterPiPWhenReady();
        }
      };

      try {
        // 2. Gán stream vào video player (hoặc làm mới nếu cần)
        // Chỉ gán lại nếu stream khác hoặc srcObject chưa được set
        if (elements.pipChatVideoPlayer.srcObject !== pipChatStream) {
          elements.pipChatVideoPlayer.srcObject = pipChatStream;
          await elements.pipChatVideoPlayer.play(); // chờ play() promise resolve
          await elements.pipChatVideoPlayer.requestPictureInPicture();
          console.log("PiP Chat: Stream assigned/re-assigned to video player.");
        } else {
          console.log("PiP Chat: Video player already has the correct stream.");
        }

        // 3. Thêm listeners TRƯỚC KHI gọi load() hoặc play()
        elements.pipChatVideoPlayer.addEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.addEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.addEventListener("error", onCanPlayOrError);

        // 4. Gọi load() để trình duyệt bắt đầu xử lý srcObject mới (nếu có thay đổi)
        // Hoặc nếu video đã có srcObject nhưng ở trạng thái HAVE_NOTHING
        if (
          elements.pipChatVideoPlayer.readyState <
            HTMLMediaElement.HAVE_METADATA ||
          elements.pipChatVideoPlayer.srcObject !== pipChatStream
        ) {
          console.log(
            "PiP Chat: Calling video.load() as readyState < HAVE_METADATA or srcObject changed."
          );
          elements.pipChatVideoPlayer.load();
        }

        // 5. Kiểm tra readyState ngay. Nếu đã sẵn sàng, vào PiP luôn.
        // Nếu không, các event listener ở trên sẽ xử lý.
        // HAVE_CURRENT_DATA (2) trở lên là đủ tốt để thử play.
        if (
          elements.pipChatVideoPlayer.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          console.log(
            "PiP Chat: Video player readyState >= HAVE_CURRENT_DATA. Attempting to enter PiP directly."
          );
          // Xóa listener vì chúng ta sẽ xử lý ngay, tránh gọi lại
          elements.pipChatVideoPlayer.removeEventListener(
            "loadedmetadata",
            onCanPlayOrError
          );
          elements.pipChatVideoPlayer.removeEventListener(
            "canplay",
            onCanPlayOrError
          );
          elements.pipChatVideoPlayer.removeEventListener(
            "error",
            onCanPlayOrError
          );
          await enterPiPWhenReady();
        } else {
          console.log(
            "PiP Chat: Video player not ready yet (readyState:",
            elements.pipChatVideoPlayer.readyState,
            "). Waiting for events."
          );
        }
      } catch (error) {
        // Lỗi chung khi thiết lập trước khi chờ event
        console.error(
          "PiP Chat: Lỗi chung trong quá trình chuẩn bị PiP (trước khi chờ event):",
          error
        );
        handlePipFailure(`Lỗi chuẩn bị PiP: ${error.message}`);
      }
    }
  }

  // ==================================
  // STREAMING & UI LOGIC
  // ==================================
  function callViewer(viewerId) {
    if (
      !localStream ||
      !peerInstance ||
      !viewerId ||
      peerInstance.disconnected ||
      peerInstance.destroyed
    ) {
      console.warn(
        `Cannot call viewer ${viewerId}. Stream (${!!localStream}), PeerJS (${!!peerInstance}), Peer disconnected (${
          peerInstance?.disconnected
        }), Peer destroyed (${peerInstance?.destroyed})`
      );
      if (viewerId && !pendingViewers.includes(viewerId))
        pendingViewers.push(viewerId);
      return;
    }
    if (currentCalls[viewerId]) {
      console.log(`Closing existing call before re-calling ${viewerId}`);
      currentCalls[viewerId].close();
      delete currentCalls[viewerId];
    }
    console.log(`Calling viewer: ${viewerId} with stream:`, localStream);
    try {
      if (localStream.getTracks().length === 0) {
        console.warn("Call attempt with empty stream.");
        return;
      }
      const call = peerInstance.call(viewerId, localStream);
      if (!call) {
        throw new Error("peerInstance.call returned undefined");
      }
      currentCalls[viewerId] = call;
      call.on("error", (err) => {
        console.error(`Call error with ${viewerId}:`, err);
        delete currentCalls[viewerId];
      });
      call.on("close", () => {
        console.log(`Call closed with ${viewerId}`);
        delete currentCalls[viewerId];
      });
      call.on("stream", (remoteStream) => {
        console.log(`Received stream from viewer ${viewerId}? (Unexpected)`);
      });
    } catch (error) {
      console.error(`Failed call to ${viewerId}:`, error);
      delete currentCalls[viewerId];
    }
  }
  function stopLocalStream() {
    console.log("Stopping local stream...");
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      console.log("Local stream tracks stopped.");
    }
    localStream = null;
    currentMode = null;
    console.log(`Closing ${Object.keys(currentCalls).length} active calls...`);
    for (const viewerId in currentCalls) {
      if (currentCalls[viewerId]) {
        currentCalls[viewerId].close();
      }
    }
    currentCalls = {};
    updateUIStreamStopped();
  }
  function updateUIStreamStarted(mode) {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.add("streaming");
    elements.streamStatusIndicator.textContent =
      mode === "liveCam" ? "LIVE CAM" : "SHARING SCREEN";
    elements.streamStatusIndicator.className = "stream-status-indicator active";
    if (elements.noStreamOverlay)
      elements.noStreamOverlay.style.display = "none";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.toggle(
        "active",
        mode === "screenShare"
      );
      elements.shareScreenBtn.disabled = mode === "liveCam";
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.toggle("active", mode === "liveCam");
      elements.liveCamBtn.innerHTML =
        mode === "liveCam"
          ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>'
          : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
      elements.liveCamBtn.disabled = mode === "screenShare";
    }
    checkMediaPermissions();
  }
  function updateUIStreamStopped() {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.remove("streaming");
    elements.streamStatusIndicator.textContent = "OFF AIR";
    elements.streamStatusIndicator.className = "stream-status-indicator";
    if (elements.previewVideo) elements.previewVideo.srcObject = null;
    if (elements.noStreamOverlay)
      elements.noStreamOverlay.style.display = "flex";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.remove("active");
      elements.shareScreenBtn.disabled = false;
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.remove("active");
      elements.liveCamBtn.disabled = false;
      elements.liveCamBtn.innerHTML =
        '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
    }
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.innerHTML =
        '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
      elements.toggleMicBtn.classList.add("active");
      elements.toggleMicBtn.disabled = true;
      isMicEnabled = true;
    }
    checkMediaPermissions();
  }
  async function startScreenShare() {
    if (currentMode === "screenShare") {
      console.log("Already screen sharing.");
      return;
    }
    stopLocalStream();
    console.log("Starting screen share...");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, cursor: "always" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      let audioTracksToAdd = [];
      let micObtained = false;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioTracksToAdd.push(...micStream.getAudioTracks());
        micObtained = true;
      } catch (micErr) {
        console.warn("Could not get mic:", micErr);
      }
      if (displayStream.getAudioTracks().length > 0) {
        if (
          !micObtained ||
          (micObtained &&
            displayStream.getAudioTracks()[0].id !== audioTracksToAdd[0]?.id)
        ) {
          audioTracksToAdd.push(...displayStream.getAudioTracks());
        }
      }
      localStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracksToAdd,
      ]);
      if (elements.previewVideo) {
        elements.previewVideo.srcObject = localStream;
      } else {
        console.error("Preview video element missing!");
      }
      currentMode = "screenShare";
      updateUIStreamStarted(currentMode);
      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Screen share ended by user.");
        stopLocalStream();
        if (socket)
          socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      });
      callPendingViewers();
      allJoinedViewers.forEach((viewerId) => callViewer(viewerId));
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Không thể chia sẻ màn hình: " + err.message);
      stopLocalStream();
    }
  }
  async function startLiveCam() {
    if (currentMode === "liveCam") {
      stopLocalStream();
      if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      return;
    }
    stopLocalStream();
    console.log("Starting live cam...");
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStream = camStream;
      isMicEnabled =
        localStream.getAudioTracks().length > 0 &&
        localStream.getAudioTracks()[0].enabled;
      currentMode = "liveCam";
      if (elements.previewVideo) elements.previewVideo.srcObject = localStream;
      updateUIStreamStarted(currentMode);
      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Live cam ended.");
        stopLocalStream();
        if (socket)
          socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      });
      callPendingViewers();
      allJoinedViewers.forEach((viewerId) => callViewer(viewerId));
    } catch (err) {
      console.error("Live cam error:", err);
      alert("Không thể bật camera/mic: " + err.message);
      stopLocalStream();
      updateUIStreamStopped();
    }
  }
  function toggleMicrophone() {
    if (!localStream) {
      console.warn("No local stream to toggle mic.");
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("Stream has no audio track.");
      checkMediaPermissions();
      return;
    }
    isMicEnabled = !isMicEnabled;
    audioTracks.forEach((track) => {
      track.enabled = isMicEnabled;
    });
    console.log(`Mic toggled: ${isMicEnabled ? "ON" : "OFF"}`);
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.classList.toggle("active", isMicEnabled);
      elements.toggleMicBtn.innerHTML = isMicEnabled
        ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
        : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
    }
  }
  async function checkMediaPermissions() {
    let hasMic = false;
    let hasCam = false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      hasMic = d.some((i) => i.kind === "audioinput" && i.deviceId);
      hasCam = d.some((i) => i.kind === "videoinput" && i.deviceId);
    } catch (e) {
      console.error("Enum dev err:", e);
    }
    const canShare =
      typeof navigator.mediaDevices.getDisplayMedia !== "undefined";
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.disabled =
        !hasMic || !localStream || localStream.getAudioTracks().length === 0;
      if (!hasMic)
        elements.toggleMicBtn.innerHTML =
          '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
      else if (localStream?.getAudioTracks().length > 0) {
        const enabled = localStream.getAudioTracks()[0].enabled;
        isMicEnabled = enabled;
        elements.toggleMicBtn.classList.toggle("active", enabled);
        elements.toggleMicBtn.innerHTML = enabled
          ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
          : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
      } else {
        elements.toggleMicBtn.innerHTML =
          '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
        elements.toggleMicBtn.classList.add("active");
        isMicEnabled = true;
      }
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.disabled = !hasCam || currentMode === "screenShare";
      if (!hasCam)
        elements.liveCamBtn.innerHTML =
          '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>';
      else
        elements.liveCamBtn.innerHTML =
          '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
    }
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.disabled = !canShare || currentMode === "liveCam";
      if (!canShare)
        elements.shareScreenBtn.innerHTML =
          '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>';
    }
    return { hasMic, hasCam };
  }
  function callPendingViewers() {
    if (!localStream || localStream.getTracks().length === 0) {
      console.warn("Skipping pending, no stream.");
      pendingViewers = [];
      return;
    }
    console.log(`Calling ${pendingViewers.length} pending...`);
    const toCall = [...pendingViewers];
    pendingViewers = [];
    toCall.forEach((vId) => {
      if (allJoinedViewers.has(vId)) callViewer(vId);
      else console.log(`Skipping pending ${vId}, already left.`);
    });
  }
  function scrollChatToBottom() {
    const w = elements.chatMessagesList?.parentNode;
    if (w) {
      w.scrollTop = w.scrollHeight;
    }
  }

  function addChatMessage(
    content,
    type = "guest",
    username = "System",
    timestamp = new Date(),
    originalMessage = null
  ) {
    const li = document.createElement("li");
    li.className = `chat-message-item message-${type}`;
    const iconSpan = document.createElement("span");
    iconSpan.className = "msg-icon";
    let iconClass = "fa-user";
    if (type === "host") iconClass = "fa-star";
    else if (type === "pro") iconClass = "fa-crown";
    else if (type === "system") iconClass = "fa-info-circle";
    else if (type === "left") iconClass = "fa-sign-out-alt";
    else if (type === "ban") iconClass = "fa-user-slash";
    iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`;
    li.appendChild(iconSpan);
    const cont = document.createElement("div");
    cont.className = "msg-content-container";
    const head = document.createElement("div");
    head.className = "msg-header";
    const userS = document.createElement("span");
    userS.className = "msg-username";
    userS.textContent = username;
    head.appendChild(userS);
    const timeS = document.createElement("span");
    timeS.className = "msg-timestamp";
    timeS.textContent = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    head.appendChild(timeS);
    cont.appendChild(head);
    const bodyS = document.createElement("span");
    bodyS.className = "msg-body prose-styling";
    let finalHtml = content || "";
    if (type !== "system" && typeof marked !== "undefined") {
      try {
        finalHtml = marked.parse(content || "");
        const t = document.createElement("div");
        t.innerHTML = finalHtml;
        if (typeof renderMathInElement === "function")
          renderMathInElement(t, {
            delimiters: [
              { left: "$$", right: "$$", display: !0 },
              { left: "$", right: "$", display: !1 },
              { left: "\\(", right: "\\)", display: !1 },
              { left: "\\[", right: "\\]", display: !0 },
            ],
            throwOnError: !1,
          });
        finalHtml = t.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Err:", e);
        finalHtml = content;
      }
    }
    bodyS.innerHTML = finalHtml;
    cont.appendChild(bodyS);
    li.appendChild(cont);
    if (
      streamerConfig.username === streamerConfig.roomOwner &&
      type !== "system" &&
      originalMessage
    ) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      const pinBtn = document.createElement("button");
      pinBtn.className = "action-btn pin-btn";
      pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
      pinBtn.title = "Ghim";
      pinBtn.onclick = () => {
        if (!socket) return;
        playButtonFeedback(pinBtn);
        socket.emit("pinComment", {
          roomId: streamerConfig.roomId,
          message: originalMessage,
        });
      };
      acts.appendChild(pinBtn);
      if (username !== streamerConfig.username) {
        const banBtn = document.createElement("button");
        banBtn.className = "action-btn ban-user-btn";
        banBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
        banBtn.title = `Chặn ${username}`;
        banBtn.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(banBtn);
          const confirmed = await showStreamerConfirmation(
            `Chặn ${username}?`,
            "Chặn",
            "Hủy",
            "fas fa-user-slash"
          );
          if (confirmed)
            socket.emit("banViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: username,
            });
        };
        acts.appendChild(banBtn);
      }
      li.appendChild(acts);
    }
    if (!prefersReducedMotion) {
      gsap.from(li, { duration: 0.5, autoAlpha: 0, y: 15, ease: "power2.out" });
    } else {
      gsap.set(li, { autoAlpha: 1 });
    }
    elements.chatMessagesList.appendChild(li);
    scrollChatToBottom();

    if (isPipChatActive) {
      pipChatNeedsUpdate = true; // Đặt cờ để frame tiếp theo sẽ rasterize lại
    }
    // Vòng lặp requestAnimationFrame trong drawPipChatFrame sẽ tự cập nhật khi isPipChatActive.
    // Không cần gọi drawPipChatFrame() hoặc kiểm tra pipChatUpdateRequestId ở đây nữa.
  }

  function displayPinnedComment(message) {
    const wasVisible =
      elements.pinnedCommentContainer.style.height !== "0px" &&
      elements.pinnedCommentContainer.style.opacity !== "0";
    const targetHeight = message && message.content ? "auto" : 0;
    const targetOpacity = message && message.content ? 1 : 0;
    gsap.to(elements.pinnedCommentContainer, {
      duration: 0.4,
      height: targetHeight,
      autoAlpha: targetOpacity,
      ease: "power1.inOut",
      onComplete: () => {
        elements.pinnedCommentContainer.innerHTML = "";
        if (message && message.content) {
          elements.pinnedCommentContainer.classList.add("has-content");
          const pb = document.createElement("div");
          pb.className = "pinned-box";
          const pi = document.createElement("span");
          pi.className = "pin-icon";
          pi.innerHTML = '<i class="fas fa-thumbtack"></i>';
          const pc = document.createElement("div");
          pc.className = "pinned-content";
          const us = document.createElement("span");
          us.className = "pinned-user";
          us.textContent = message.username;
          const ts = document.createElement("span");
          ts.className = "pinned-text prose-styling";
          const tss = document.createElement("span");
          tss.className = "pinned-timestamp";
          tss.textContent = new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          let ch = message.content || "";
          if (typeof marked !== "undefined") {
            try {
              ch = marked.parse(ch);
              const t = document.createElement("div");
              t.innerHTML = ch;
              if (typeof renderMathInElement === "function")
                renderMathInElement(t, {
                  delimiters: [
                    { left: "$$", right: "$$", display: !0 },
                    { left: "$", right: "$", display: !1 },
                    { left: "\\(", right: "\\)", display: !1 },
                    { left: "\\[", right: "\\]", display: !0 },
                  ],
                  throwOnError: !1,
                });
              ch = t.innerHTML;
            } catch (e) {
              console.error("Pin Mark Err:", e);
            }
          }
          ts.innerHTML = ch;
          pc.appendChild(us);
          pc.appendChild(ts);
          pb.appendChild(pi);
          pb.appendChild(pc);
          pb.appendChild(tss);
          if (streamerConfig.username === streamerConfig.roomOwner) {
            const btn = document.createElement("button");
            btn.className = "unpin-btn";
            btn.title = "Bỏ ghim";
            btn.innerHTML = `<i class="fas fa-times"></i>`;
            btn.onclick = () => {
              if (!socket) return;
              playButtonFeedback(btn);
              socket.emit("unpinComment", { roomId: streamerConfig.roomId });
            };
            pb.appendChild(btn);
          }
          elements.pinnedCommentContainer.appendChild(pb);
          if (!wasVisible && !prefersReducedMotion) {
            gsap.from(pb, {
              duration: 0.5,
              y: -10,
              autoAlpha: 0,
              ease: "power2.out",
            });
          }
        } else {
          elements.pinnedCommentContainer.classList.remove("has-content");
        }
      },
    });
  }
  function sendChatMessage() {
    if (!socket || !socket.connected) {
      console.error("Socket not init/conn");
      alert("Lỗi chat.");
      return;
    }
    const msg = elements.chatInputArea.value.trim();
    if (!msg) return;
    const msgType = "host";
    const msgObj = {
      username: streamerConfig.username,
      content: msg,
      messageType: msgType,
      timestamp: new Date().toISOString(),
    };
    socket.emit("chatMessage", {
      roomId: streamerConfig.roomId,
      message: msgObj,
    });
    elements.chatInputArea.value = "";
    elements.chatPreview.innerHTML = "";
    elements.chatInputArea.style.height = "auto";
  }

  function openModal(modalElement) {
    if (!modalElement) return;
    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));
    if (!prefersReducedMotion) {
      gsap.set(modalElement, { display: "flex", autoAlpha: 0 });
      gsap.set(modalElement.querySelector(".modal-content"), {
        y: -30,
        scale: 0.95,
      });
      gsap
        .timeline()
        .to(modalElement, { duration: 0.4, autoAlpha: 1, ease: "power2.out" })
        .to(
          modalElement.querySelector(".modal-content"),
          {
            duration: 0.5,
            y: 0,
            scale: 1,
            autoAlpha: 1,
            ease: "back.out(1.4)",
          },
          "-=0.3"
        );
    } else {
      gsap.set(modalElement, { display: "flex", autoAlpha: 1 });
      gsap.set(modalElement.querySelector(".modal-content"), {
        y: 0,
        scale: 1,
      });
    }
    document.body.style.overflow = "hidden";
  }

  function closeModal(modalElement) {
    if (!modalElement || gsap.getProperty(modalElement, "autoAlpha") === 0)
      return;
    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));
    if (!prefersReducedMotion) {
      gsap
        .timeline({
          onComplete: () => {
            gsap.set(modalElement, { display: "none" });
            document.body.style.overflow = "";
          },
        })
        .to(modalElement.querySelector(".modal-content"), {
          duration: 0.3,
          scale: 0.9,
          autoAlpha: 0,
          ease: "power1.in",
        })
        .to(
          modalElement,
          { duration: 0.4, autoAlpha: 0, ease: "power1.in" },
          "-=0.2"
        );
    } else {
      gsap.set(modalElement, { display: "none", autoAlpha: 0 });
      document.body.style.overflow = "";
    }
  }

  function renderListModal(listElement, items, isBannedList) {
    if (!listElement) return;
    listElement.innerHTML = "";
    if (!items || items.length === 0) {
      listElement.innerHTML = `<li class="user-list-item empty">${
        isBannedList ? "Không có ai bị chặn." : "Chưa có người xem."
      }</li>`;
      return;
    }
    const viewersArray = items.map((item) =>
      typeof item === "string" ? { username: item, canDraw: false } : item
    );

    viewersArray.forEach((viewer) => {
      const u = viewer.username;
      const currentCanDraw =
        viewerDrawPermissions[u] || viewer.canDraw || false;

      const li = document.createElement("li");
      li.className = "user-list-item";
      const ns = document.createElement("span");
      ns.className = "list-username";
      ns.textContent = u;
      if (!isBannedList && currentCanDraw) {
        // Only show draw icon for non-banned viewers with permission
        const drawIcon = document.createElement("i");
        drawIcon.className = "fas fa-paint-brush fa-xs";
        drawIcon.title = "Đang có quyền vẽ";
        drawIcon.style.marginLeft = "8px";
        drawIcon.style.color = "var(--success-color)";
        ns.appendChild(drawIcon);
      }
      li.appendChild(ns);

      const aw = document.createElement("div");
      aw.className = "list-actions";
      if (isBannedList) {
        const ub = document.createElement("button");
        ub.className = "action-btn unban-btn control-btn";
        ub.innerHTML = '<i class="fas fa-undo"></i> Bỏ chặn';
        ub.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(ub);
          const confirmed = await showStreamerConfirmation(
            `Bỏ chặn ${u}?`,
            "Bỏ chặn",
            "Hủy",
            "fas fa-undo"
          );
          if (confirmed)
            socket.emit("unbanViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: u,
            });
        };
        aw.appendChild(ub);
      } else if (u !== streamerConfig.username) {
        const bb = document.createElement("button");
        bb.className = "action-btn ban-btn control-btn";
        bb.innerHTML = '<i class="fas fa-user-slash"></i> Chặn';
        bb.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(bb);
          const confirmed = await showStreamerConfirmation(
            `Chặn ${u}?`,
            "Chặn",
            "Hủy",
            "fas fa-user-slash"
          );
          if (confirmed)
            socket.emit("banViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: u,
            });
        };
        aw.appendChild(bb);

        const drawPermBtn = document.createElement("button");
        drawPermBtn.className = `action-btn draw-perm-btn control-btn ${
          currentCanDraw ? "active" : ""
        }`;
        drawPermBtn.innerHTML = currentCanDraw
          ? '<i class="fas fa-paint-brush"></i> Thu hồi Vẽ'
          : '<i class="far fa-paint-brush"></i> Cho Vẽ';
        drawPermBtn.title = currentCanDraw
          ? "Thu hồi quyền vẽ của người này"
          : "Cho phép người này vẽ";
        drawPermBtn.onclick = () => {
          if (!socket) return;
          playButtonFeedback(drawPermBtn);
          const newPermission = !currentCanDraw;
          socket.emit("wb:toggleViewerDrawPermission", {
            roomId: streamerConfig.roomId,
            viewerUsername: u,
            canDraw: newPermission,
          });
        };
        aw.appendChild(drawPermBtn);
      }
      li.appendChild(aw);
      listElement.appendChild(li);
    });
    if (
      !prefersReducedMotion &&
      listElement.closest(".modal-v2")?.style.display === "flex"
    ) {
      gsap.from(listElement.children, {
        duration: 0.4,
        autoAlpha: 0,
        y: 10,
        stagger: 0.05,
        ease: "power1.out",
      });
    }
  }

  async function showStreamerConfirmation(
    message,
    confirmText = "Xác nhận",
    cancelText = "Hủy bỏ",
    iconClass = "fas fa-question-circle"
  ) {
    if (typeof showArtisticConfirm === "function") {
      return await showArtisticConfirm(
        message,
        confirmText,
        cancelText,
        iconClass
      );
    }
    console.warn(
      "showArtisticConfirm not found, using window.confirm as fallback."
    );
    return new Promise((resolve) => {
      resolve(window.confirm(message));
    });
  }

  function updateStreamDuration() {
    if (!elements.streamDuration) return;
    const n = new Date();
    const d = n - streamStartTime;
    if (d < 0) return;
    const h = Math.floor(d / 36e5);
    const m = Math.floor((d % 36e5) / 6e4);
    const s = Math.floor((d % 6e4) / 1e3);
    elements.streamDuration.textContent = `${String(h).padStart(
      2,
      "0"
    )}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function initAnimations() {
    // Check if panelContent exists and determine initial state
    const initialPanelContentHeight = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : "auto"
      : 0;
    const initialPanelContentAlpha = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : 1
      : 0;
    const initialPanelContentPadding = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : 20
      : 0;

    if (elements.panelContent) {
      gsap.set(elements.panelContent, {
        height: initialPanelContentHeight,
        autoAlpha: initialPanelContentAlpha,
        paddingTop: initialPanelContentPadding,
        paddingBottom: initialPanelContentPadding,
        marginTop: 0,
        // overflowY: "hidden" // Ensure overflow is hidden initially for height animation
      });
    }

    if (elements.controlButtons) {
      gsap.set(elements.controlButtons, {
        autoAlpha: elements.controlPanel?.classList.contains("collapsed")
          ? 0
          : 1,
      });
    }

    if (prefersReducedMotion) {
      gsap.set(
        "[data-animate], .streamer-main-header, .streamer-sidebar, .streamer-chat-area, .panel-header h3, .control-btn",
        { autoAlpha: 1 }
      );
      if (elements.panelContent) {
        elements.panelContent.style.display =
          elements.controlPanel?.classList.contains("collapsed")
            ? "none"
            : "block";
        // elements.panelContent.style.overflowY = elements.controlPanel?.classList.contains("collapsed") ? "hidden" : "auto";
      }
      if (
        !elements.controlPanel?.classList.contains("collapsed") &&
        elements.controlButtons
      ) {
        gsap.set(elements.controlButtons, { autoAlpha: 1 });
      }
      initBackgroundParticles();
      return;
    }

    const tl = gsap.timeline({ delay: 0.2 });
    tl.from(elements.header, {
      duration: 0.8,
      y: -80,
      autoAlpha: 0,
      ease: "power3.out",
    })
      .from(
        elements.sidebar,
        { duration: 0.9, x: -100, autoAlpha: 0, ease: "power3.out" },
        "-=0.5"
      )
      .from(
        elements.chatArea,
        { duration: 0.9, x: 100, autoAlpha: 0, ease: "power3.out" },
        "<"
      );
    if (elements.panelInternalHeader) {
      tl.from(
        elements.panelInternalHeader,
        { duration: 0.5, y: -15, autoAlpha: 0, ease: "power2.out" },
        "-=0.3"
      );
    } else {
      console.warn("Control panel header H3 not found for animation.");
    }
    if (
      !elements.controlPanel?.classList.contains("collapsed") &&
      elements.controlButtons &&
      elements.controlButtons.length > 0
    ) {
      gsap.from(elements.controlButtons, {
        duration: 0.6,
        y: 20,
        autoAlpha: 0,
        stagger: 0.06,
        ease: "power2.out",
        delay: tl.duration() - 0.2, // Ensure buttons animate after panel is somewhat visible
      });
    }
    tl.from(
      ".chat-container-v2 > *:not(#pinnedCommentV2)",
      {
        duration: 0.6,
        y: 20,
        autoAlpha: 0,
        stagger: 0.1,
        ease: "power2.out",
      },
      "-=0.5"
    );
    initBackgroundParticles();
  } // End initAnimations "#f0e68c"] },
  function playButtonFeedback(button) {
    if (!button || prefersReducedMotion) return;
    gsap
      .timeline()
      .to(button, { scale: 0.92, duration: 0.1, ease: "power1.in" })
      .to(button, { scale: 1, duration: 0.35, ease: "elastic.out(1, 0.5)" });
    if (typeof tsParticles !== "undefined") {
      tsParticles
        .load({
          element: button,
          preset: "confetti",
          particles: {
            number: { value: 10 },
            size: { value: { min: 1, max: 3 } },
          },
          emitters: {
            position: { x: 50, y: 50 },
            size: { width: 5, height: 5 },
            rate: { quantity: 5, delay: 0 },
            life: { duration: 0.15, count: 1 },
          },
        })
        .then((c) => setTimeout(() => c?.destroy(), 400));
    }
  }

  function addQuizOptionInput(optionText = "") {
    if (!elements.quizOptionsContainer || !elements.quizCorrectAnswerSelect)
      return;
    if (quizOptionsStreamer.length >= 6) {
      // Max 6 options for example
      if (typeof showAlert === "function")
        showAlert("Tối đa 6 lựa chọn cho một câu hỏi.", "warning");
      return;
    }

    const optionId = `quizOption_${Date.now()}_${quizOptionsStreamer.length}`;
    const wrapper = document.createElement("div");
    wrapper.className = "quiz-option-input-wrapper";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.marginBottom = "8px";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Lựa chọn ${quizOptionsStreamer.length + 1}`;
    input.value = optionText;
    input.dataset.optionId = optionId;
    input.style.flexGrow = "1";
    input.style.padding = "8px";
    input.style.border = "1px solid var(--border-color)";
    input.style.borderRadius = "var(--border-radius-small)";
    input.style.backgroundColor = "rgba(var(--bg-dark-rgb), 0.7)";
    input.style.color = "var(--text-light)";

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.className = "quiz-option-remove-btn";
    removeBtn.title = "Xóa lựa chọn này";
    removeBtn.style.marginLeft = "8px";
    removeBtn.style.background = "var(--danger-color)";
    removeBtn.style.color = "white";
    removeBtn.style.border = "none";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.width = "24px";
    removeBtn.style.height = "24px";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.display = "flex";
    removeBtn.style.alignItems = "center";
    removeBtn.style.justifyContent = "center";

    removeBtn.onclick = () => {
      quizOptionsStreamer = quizOptionsStreamer.filter(
        (opt) => opt.id !== optionId
      );
      wrapper.remove();
      updateQuizCorrectAnswerSelect();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    elements.quizOptionsContainer.appendChild(wrapper);
    quizOptionsStreamer.push({ id: optionId, inputElement: input });
    updateQuizCorrectAnswerSelect();
  }

  // Function to update the "correct answer" dropdown
  function updateQuizCorrectAnswerSelect() {
    if (!elements.quizCorrectAnswerSelect) return;
    elements.quizCorrectAnswerSelect.innerHTML = "";
    if (quizOptionsStreamer.length === 0) {
      elements.quizCorrectAnswerSelect.style.display = "none";
      return;
    }
    elements.quizCorrectAnswerSelect.style.display = "block";

    quizOptionsStreamer.forEach((option, index) => {
      const optElement = document.createElement("option");
      const currentText =
        option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
      optElement.value = index.toString();
      optElement.textContent = `Đáp án ${index + 1}: ${currentText.substring(
        0,
        30
      )}${currentText.length > 30 ? "..." : ""}`;
      elements.quizCorrectAnswerSelect.appendChild(optElement);
    });

    quizOptionsStreamer.forEach((option, index) => {
      option.inputElement.oninput = () => {
        const selectOption = elements.quizCorrectAnswerSelect.options[index];
        if (selectOption) {
          const inputText =
            option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
          selectOption.textContent = `Đáp án ${
            index + 1
          }: ${inputText.substring(0, 30)}${
            inputText.length > 30 ? "..." : ""
          }`;
        }
      };
    });
  }

  function handleStartQuiz() {
    if (
      !socket ||
      !elements.quizQuestionText ||
      !elements.quizCorrectAnswerSelect
    )
      return;
    playButtonFeedback(elements.startQuizBtn);

    const questionText = elements.quizQuestionText.value.trim();
    const options = quizOptionsStreamer
      .map((opt) => opt.inputElement.value.trim())
      .filter((optText) => optText.length > 0);
    const correctAnswerIndex = parseInt(
      elements.quizCorrectAnswerSelect.value,
      10
    );

    if (!questionText) {
      if (typeof showAlert === "function")
        showAlert("Vui lòng nhập nội dung câu hỏi.", "warning");
      return;
    }
    if (options.length < 2) {
      if (typeof showAlert === "function")
        showAlert("Cần ít nhất 2 lựa chọn cho câu hỏi.", "warning");
      return;
    }
    if (
      isNaN(correctAnswerIndex) ||
      correctAnswerIndex < 0 ||
      correctAnswerIndex >= options.length
    ) {
      if (typeof showAlert === "function")
        showAlert("Vui lòng chọn đáp án đúng hợp lệ.", "warning");
      return;
    }

    socket.emit("quiz:start", {
      roomId: streamerConfig.roomId,
      questionText: questionText,
      options: options,
      correctAnswerIndex: correctAnswerIndex,
    });

    elements.startQuizBtn.disabled = true;
    elements.quizQuestionText.disabled = true;
    quizOptionsStreamer.forEach((opt) => (opt.inputElement.disabled = true));
    elements.addQuizOptionBtn.disabled = true;
    elements.quizCorrectAnswerSelect.disabled = true;

    elements.showQuizAnswerBtn.disabled = false;
    elements.nextQuizQuestionBtn.disabled = false;
    elements.endQuizBtn.disabled = false;
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đang hỏi: "${questionText.substring(
        0,
        50
      )}..."</p>`;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    isQuizActiveStreamer = true;
  }

  function handleShowQuizAnswer() {
    if (!socket || !currentQuizQuestionIdStreamer) return;
    playButtonFeedback(elements.showQuizAnswerBtn);
    socket.emit("quiz:showAnswer", {
      roomId: streamerConfig.roomId,
      questionId: currentQuizQuestionIdStreamer,
    });
    elements.showQuizAnswerBtn.disabled = true;
  }

  function handleNextQuizQuestion() {
    if (!socket) return;
    playButtonFeedback(elements.nextQuizQuestionBtn);
    socket.emit("quiz:nextQuestion", { roomId: streamerConfig.roomId });

    if (elements.quizQuestionText) {
      elements.quizQuestionText.value = "";
      elements.quizQuestionText.disabled = false;
    }
    if (elements.quizOptionsContainer)
      elements.quizOptionsContainer.innerHTML = "";
    quizOptionsStreamer = [];
    addQuizOptionInput();
    addQuizOptionInput();
    if (elements.quizCorrectAnswerSelect) {
      elements.quizCorrectAnswerSelect.innerHTML = "";
      elements.quizCorrectAnswerSelect.disabled = false;
      updateQuizCorrectAnswerSelect();
    }
    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
    if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
    if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
    if (elements.nextQuizQuestionBtn)
      elements.nextQuizQuestionBtn.disabled = true;
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chờ câu hỏi mới...</p>`;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    currentQuizQuestionIdStreamer = null;
  }

  function handleEndQuiz() {
    if (!socket) return;
    playButtonFeedback(elements.endQuizBtn);
    socket.emit("quiz:end", { roomId: streamerConfig.roomId });
    isQuizActiveStreamer = false;
    resetQuizUIStreamer();
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đã kết thúc.</p>`;
  }

  function resetQuizUIStreamer() {
    if (elements.quizQuestionText) {
      elements.quizQuestionText.value = "";
      elements.quizQuestionText.disabled = false;
    }
    if (elements.quizOptionsContainer)
      elements.quizOptionsContainer.innerHTML = "";
    quizOptionsStreamer = [];
    addQuizOptionInput();
    addQuizOptionInput();
    if (elements.quizCorrectAnswerSelect) {
      elements.quizCorrectAnswerSelect.innerHTML = "";
      elements.quizCorrectAnswerSelect.disabled = false;
      updateQuizCorrectAnswerSelect();
    }
    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
    if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
    if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
    if (elements.nextQuizQuestionBtn)
      elements.nextQuizQuestionBtn.disabled = true;
    if (elements.endQuizBtn) elements.endQuizBtn.disabled = true;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    currentQuizQuestionIdStreamer = null;
    isQuizActiveStreamer = false; // Ensure this is also reset
    if (
      elements.streamerQuizPanel &&
      elements.streamerQuizPanel.style.display !== "none"
    ) {
      // Only hide if it was open and now quiz is fully reset/ended, or keep it if user explicitly opened it
      // elements.streamerQuizPanel.style.display = 'none';
      // if(elements.toggleQuizPanelBtn) elements.toggleQuizPanelBtn.classList.remove('active');
    }
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chưa bắt đầu.</p>`;
  }

  function initializeQuizOptionFields() {
    if (quizOptionsStreamer.length === 0 && elements.quizOptionsContainer) {
      // Check container exists
      addQuizOptionInput();
      addQuizOptionInput();
    }
  }

  function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handleWhiteboardDrawStart(event) {
    if (!isWhiteboardActive || !userCanDrawOnWhiteboard()) return;
    event.preventDefault();
    isDrawingOnWhiteboard = true;
    const pos = getMousePos(elements.whiteboardCanvas, event);
    wbLastX = pos.x;
    wbLastY = pos.y;
    drawOnWhiteboard(
      wbLastX - 0.5,
      wbLastY - 0.5,
      wbLastX,
      wbLastY,
      wbCurrentColor,
      wbCurrentLineWidth,
      true,
      false,
      wbIsEraserMode
    );
  }

  function handleWhiteboardDrawing(event) {
    if (
      !isDrawingOnWhiteboard ||
      !isWhiteboardActive ||
      !userCanDrawOnWhiteboard()
    )
      return;
    event.preventDefault();
    if (wbEventThrottleTimer) return;
    wbEventThrottleTimer = setTimeout(() => {
      const pos = getMousePos(elements.whiteboardCanvas, event);
      drawOnWhiteboard(
        wbLastX,
        wbLastY,
        pos.x,
        pos.y,
        wbCurrentColor,
        wbCurrentLineWidth,
        true,
        false,
        wbIsEraserMode
      );
      wbLastX = pos.x;
      wbLastY = pos.y;
      wbEventThrottleTimer = null;
    }, WB_THROTTLE_INTERVAL);
  }

  function handleWhiteboardDrawEnd() {
    if (!isDrawingOnWhiteboard || !isWhiteboardActive) return;
    isDrawingOnWhiteboard = false;
    clearTimeout(wbEventThrottleTimer);
    wbEventThrottleTimer = null;
  }

  function clearWhiteboard(emitEvent = true) {
    if (!whiteboardCtx || !elements.whiteboardCanvas) return;
    whiteboardCtx.clearRect(
      0,
      0,
      elements.whiteboardCanvas.width,
      elements.whiteboardCanvas.height
    );
    wbDrawingHistory.push({ type: "clear" });
    if (wbDrawingHistory.length > 200)
      wbDrawingHistory.splice(0, wbDrawingHistory.length - 200);

    if (emitEvent && socket && socket.connected && userCanDrawOnWhiteboard()) {
      socket.emit("wb:clear", {
        roomId: streamerConfig.roomId,
        username: streamerConfig.username,
      });
    }
    console.log("Whiteboard cleared");
  }

  function userCanDrawOnWhiteboard() {
    // For streamer.js, the streamer always has permission.
    // Logic for viewers to check their permission would be in liveRoom.js
    return streamerConfig.username === streamerConfig.roomOwner;
  }

  function initWhiteboard() {
    if (!elements.whiteboardCanvas) {
      console.error("Whiteboard canvas element not found!");
      return;
    }
    whiteboardCtx = elements.whiteboardCanvas.getContext("2d");
    if (!whiteboardCtx) {
      console.error("Failed to get 2D context for whiteboard!");
      return;
    }

    whiteboardCtx.lineCap = "round";
    whiteboardCtx.lineJoin = "round";
    wbCurrentColor = elements.wbColorPicker?.value || "#FFFFFF";
    elements.wbColorPicker.value = wbCurrentColor; // Ensure picker reflects state
    wbCurrentLineWidth = parseInt(elements.wbLineWidthRange?.value || "3", 10);
    elements.wbLineWidthRange.value = wbCurrentLineWidth; // Ensure range reflects state
    if (elements.wbLineWidthValueDisplay)
      elements.wbLineWidthValueDisplay.textContent = wbCurrentLineWidth;

    elements.whiteboardCanvas.addEventListener(
      "mousedown",
      handleWhiteboardDrawStart
    );
    elements.whiteboardCanvas.addEventListener(
      "mousemove",
      handleWhiteboardDrawing
    );
    elements.whiteboardCanvas.addEventListener(
      "mouseup",
      handleWhiteboardDrawEnd
    );
    elements.whiteboardCanvas.addEventListener(
      "mouseout",
      handleWhiteboardDrawEnd
    );
    elements.whiteboardCanvas.addEventListener(
      "touchstart",
      handleWhiteboardDrawStart,
      { passive: false }
    );
    elements.whiteboardCanvas.addEventListener(
      "touchmove",
      handleWhiteboardDrawing,
      { passive: false }
    );
    elements.whiteboardCanvas.addEventListener(
      "touchend",
      handleWhiteboardDrawEnd
    );
    elements.whiteboardCanvas.addEventListener(
      "touchcancel",
      handleWhiteboardDrawEnd
    );
    console.log("Whiteboard Initialized.");
  }

  // ==================================
  // PICTURE-IN-PICTURE CHAT LOGIC
  // ==================================
  function initPipChatCanvas() {
    if (!elements.pipChatBtn) return;

    if (!pipChatCanvas) {
      pipChatCanvas = document.createElement("canvas");
    }
    // Kích thước canvas nên phù hợp với những gì bạn muốn hiển thị trong PiP
    pipChatCanvas.width = PIP_CANVAS_WIDTH; // ~400
    pipChatCanvas.height = PIP_CANVAS_HEIGHT; // ~600

    pipChatCtx = pipChatCanvas.getContext("2d");

    if (!pipChatCtx) {
      console.error(
        "Failed to create 2D context for PiP chat canvas (html2canvas target)."
      );
      if (elements.pipChatBtn) {
        elements.pipChatBtn.disabled = true;
        elements.pipChatBtn.title = "Không thể tạo canvas cho PiP Chat.";
        elements.pipChatBtn.style.display = "none";
      }
      return;
    }
    console.log("PiP Chat Canvas (for html2canvas target) initialized.");
  }

  function drawPipChatFrame() {
    if (!isPipChatActive) {
      if (pipChatUpdateRequestId) {
        cancelAnimationFrame(pipChatUpdateRequestId);
        pipChatUpdateRequestId = null;
      }
      return;
    }
    // Vẫn giữ requestAnimationFrame để có thể cập nhật nếu cần (ví dụ: hiệu ứng scrolling)
    // nhưng việc vẽ chỉ xảy ra nếu pipChatNeedsUpdate = true
    pipChatUpdateRequestId = requestAnimationFrame(drawPipChatFrame);

    if (
      !pipChatNeedsUpdate ||
      !pipChatCtx ||
      !pipChatCanvas ||
      !elements.chatMessagesList
    ) {
      return;
    }
    pipChatNeedsUpdate = false;

    // 1. Clear canvas
    pipChatCtx.fillStyle = "rgba(15, 15, 30, 0.95)"; // Nền đậm, gần như mờ đục
    pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);

    // 2. Lấy N tin nhắn cuối
    const messages = Array.from(elements.chatMessagesList.children).slice(-10); // Số lượng tin nhắn hiển thị
    let currentY = PIP_CANVAS_HEIGHT - PIP_PADDING;

    pipChatCtx.textBaseline = "bottom"; // Căn chỉnh text từ dưới lên cho mỗi dòng

    const FONT_FAMILY = "Inter, Arial, sans-serif";
    const MAX_WIDTH = PIP_CANVAS_WIDTH - 2 * PIP_PADDING;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break;

      const msgItem = messages[i];
      const usernameEl = msgItem.querySelector(".msg-username");
      const bodyEl = msgItem.querySelector(".msg-body");
      const timestampEl = msgItem.querySelector(".msg-timestamp");

      const username = usernameEl ? usernameEl.textContent.trim() : "System";
      // Lấy text thuần túy, bỏ qua mọi HTML/Markdown cho hiệu suất
      const textContent = bodyEl
        ? (bodyEl.innerText || bodyEl.textContent).trim()
        : "";
      const timestamp = timestampEl ? timestampEl.textContent.trim() : "";

      let userColor = "#a0a0c0"; // Guest - var(--text-medium)
      if (msgItem.classList.contains("message-host")) userColor = "#8a7ffb";
      // var(--primary-color)
      else if (msgItem.classList.contains("message-pro")) userColor = "#ffde7d";
      // var(--accent-color)
      else if (msgItem.classList.contains("message-system"))
        userColor = "#8899bb"; // Hơi xanh xám

      // --- Vẽ nội dung tin nhắn (text thuần túy) ---
      pipChatCtx.font = `${PIP_FONT_SIZE_MSG}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = "#e8eaf6"; // var(--text-light)

      // Hàm helper để ngắt dòng và vẽ text
      const drawWrappedText = (text, x, startY, lineHeight, maxWidth) => {
        const words = text.split(" ");
        let line = "";
        let linesDrawn = 0;
        let currentDrawY = startY;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const metrics = pipChatCtx.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            if (linesDrawn < PIP_MSG_MAX_LINES - 1) {
              // Trừ 1 dòng cho username/timestamp
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY; // Hết chỗ
              pipChatCtx.fillText(line.trim(), x, currentDrawY);
              currentDrawY -= lineHeight;
              line = words[n] + " ";
              linesDrawn++;
            } else {
              // Đã đủ số dòng tối đa, thêm "..."
              let lastLine = line.trim();
              while (
                pipChatCtx.measureText(lastLine + "...").width > maxWidth &&
                lastLine.length > 0
              ) {
                lastLine = lastLine.slice(0, -1);
              }
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
              pipChatCtx.fillText(lastLine + "...", x, currentDrawY);
              return currentDrawY - lineHeight; // Kết thúc vẽ cho tin nhắn này
            }
          } else {
            line = testLine;
          }
        }
        if (line.trim()) {
          // Vẽ dòng cuối cùng nếu còn
          if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
          pipChatCtx.fillText(line.trim(), x, currentDrawY);
          currentDrawY -= lineHeight;
        }
        return currentDrawY;
      };

      currentY = drawWrappedText(
        textContent,
        PIP_PADDING,
        currentY,
        PIP_LINE_HEIGHT,
        MAX_WIDTH
      );
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break; // Kiểm tra lại sau khi vẽ text

      // --- Vẽ username và timestamp ---
      pipChatCtx.font = `bold ${PIP_FONT_SIZE_USER}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = userColor;
      const userLine = `${username} ${timestamp ? `(${timestamp})` : ""}`;
      // Không cần ngắt dòng cho username, nếu quá dài sẽ bị cắt ở MAX_WIDTH (do fillText)
      pipChatCtx.fillText(userLine, PIP_PADDING, currentY, MAX_WIDTH);
      currentY -= PIP_LINE_HEIGHT + 4; // Khoảng cách giữa các tin nhắn
    }
  }

  async function togglePipChat() {
    if (
      !elements.pipChatBtn ||
      !elements.pipChatVideoPlayer ||
      !pipChatCanvas ||
      !pipChatCtx
    ) {
      console.error("PiP Chat: Prerequisites not met.");
      if (elements.pipChatBtn) elements.pipChatBtn.disabled = true;
      return;
    }

    if (document.pictureInPictureElement === elements.pipChatVideoPlayer) {
      console.log("PiP Chat: Attempting to exit PiP mode.");
      try {
        await document.exitPictureInPicture();
      } catch (error) {
        console.error("PiP Chat: Lỗi khi thoát PiP:", error);
      }
    } else {
      console.log("PiP Chat: Attempting to enter PiP mode.");

      // 1. Tạo hoặc xác thực stream từ canvas
      if (
        !pipChatStream ||
        !pipChatStream.active ||
        pipChatStream.getVideoTracks().length === 0 ||
        !pipChatStream.getVideoTracks()[0].enabled ||
        pipChatStream.getVideoTracks()[0].muted
      ) {
        console.log(
          "PiP Chat: Current stream invalid or missing. Attempting to create/recreate canvas stream."
        );
        if (pipChatStream && pipChatStream.active) {
          // Dừng stream cũ nếu có và không hợp lệ
          pipChatStream.getTracks().forEach((track) => track.stop());
        }
        try {
          pipChatCtx.fillStyle = "#000";
          pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);
          pipChatStream = pipChatCanvas.captureStream(25);
          if (!pipChatStream || pipChatStream.getVideoTracks().length === 0) {
            console.error(
              "PiP Chat: Failed to capture stream or stream has no video tracks."
            );
            alert(
              "Không thể tạo stream video từ nội dung chat cho PiP (Không có video track)."
            );
            pipChatStream = null;
            return;
          }
          console.log(
            "PiP Chat: Canvas stream captured/recreated successfully.",
            pipChatStream.id
          );
        } catch (e) {
          console.error(
            "PiP Chat: Lỗi nghiêm trọng khi captureStream từ canvas:",
            e
          );
          alert(
            "Trình duyệt không hỗ trợ đầy đủ tính năng PiP cho chat (lỗi captureStream)."
          );
          pipChatStream = null;
          return;
        }
      } else {
        console.log(
          "PiP Chat: Using existing active stream.",
          pipChatStream.id
        );
      }

      // Hàm dọn dẹp chung khi PiP thất bại
      const handlePipFailure = (
        errorMessage = "Không thể vào chế độ PiP cho chat."
      ) => {
        alert(errorMessage);
        if (pipChatStream && pipChatStream.active) {
          pipChatStream.getTracks().forEach((track) => track.stop());
        }
        pipChatStream = null;
        isPipChatActive = false;
        if (pipChatUpdateRequestId) {
          cancelAnimationFrame(pipChatUpdateRequestId);
          pipChatUpdateRequestId = null;
        }
        if (elements.pipChatBtn) {
          elements.pipChatBtn.classList.remove("active");
          elements.pipChatBtn.innerHTML =
            '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
        }
        // Dọn dẹp event listeners trên video player
        elements.pipChatVideoPlayer.removeEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "error",
          onCanPlayOrError
        );
      };

      // Hàm để xử lý việc vào PiP sau khi video sẵn sàng
      const enterPiPWhenReady = async () => {
        console.log(
          "PiP Chat: enterPiPWhenReady called. Video readyState:",
          elements.pipChatVideoPlayer.readyState
        );
        try {
          // Đảm bảo video không ở trạng thái lỗi
          if (elements.pipChatVideoPlayer.error) {
            console.error(
              "PiP Chat: Video player has an error:",
              elements.pipChatVideoPlayer.error
            );
            handlePipFailure("Lỗi video player khi chuẩn bị PiP.");
            return;
          }
          if (elements.pipChatVideoPlayer.paused) {
            console.log("PiP Chat: Video is paused, attempting to play.");
            await elements.pipChatVideoPlayer.play();
            console.log(
              "PiP Chat: pipChatVideoPlayer.play() promise resolved."
            );
          }
          console.log("PiP Chat: Requesting Picture-in-Picture.");
          await elements.pipChatVideoPlayer.requestPictureInPicture();
        } catch (error) {
          console.error(
            "PiP Chat: Lỗi trong enterPiPWhenReady (play video hoặc requestPictureInPicture):",
            error.name,
            error.message,
            error
          );
          let userMessage = `Không thể vào PiP: ${error.message}`;
          if (error.name === "NotAllowedError")
            userMessage =
              "Yêu cầu vào PiP bị từ chối. Hãy đảm bảo bạn đã tương tác với trang.";
          else if (error.name === "SecurityError")
            userMessage = "Không thể vào PiP do giới hạn bảo mật.";
          else if (error.name === "InvalidStateError")
            userMessage = "Video cho PiP đang ở trạng thái không hợp lệ.";
          else if (error.name === "NotFoundError")
            userMessage = "Không tìm thấy tài nguyên video hợp lệ cho PiP.";
          handlePipFailure(userMessage);
        }
      };

      // Gộp các listener lại
      const onCanPlayOrError = async (event) => {
        elements.pipChatVideoPlayer.removeEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.removeEventListener(
          "error",
          onCanPlayOrError
        );

        if (event.type === "error" || elements.pipChatVideoPlayer.error) {
          console.error(
            "PiP Chat: Video player error event caught:",
            event.type,
            elements.pipChatVideoPlayer.error
          );
          handlePipFailure("Lỗi khi tải dữ liệu video cho PiP.");
        } else {
          console.log(
            `PiP Chat: Video event '${event.type}' fired. Proceeding to enter PiP.`
          );
          await enterPiPWhenReady();
        }
      };

      try {
        // 2. Gán stream vào video player (hoặc làm mới nếu cần)
        // Chỉ gán lại nếu stream khác hoặc srcObject chưa được set
        if (elements.pipChatVideoPlayer.srcObject !== pipChatStream) {
          elements.pipChatVideoPlayer.srcObject = pipChatStream;
          await elements.pipChatVideoPlayer.play(); // chờ play() promise resolve
          await elements.pipChatVideoPlayer.requestPictureInPicture();
          console.log("PiP Chat: Stream assigned/re-assigned to video player.");
        } else {
          console.log("PiP Chat: Video player already has the correct stream.");
        }

        // 3. Thêm listeners TRƯỚC KHI gọi load() hoặc play()
        elements.pipChatVideoPlayer.addEventListener(
          "loadedmetadata",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.addEventListener(
          "canplay",
          onCanPlayOrError
        );
        elements.pipChatVideoPlayer.addEventListener("error", onCanPlayOrError);

        // 4. Gọi load() để trình duyệt bắt đầu xử lý srcObject mới (nếu có thay đổi)
        // Hoặc nếu video đã có srcObject nhưng ở trạng thái HAVE_NOTHING
        if (
          elements.pipChatVideoPlayer.readyState <
            HTMLMediaElement.HAVE_METADATA ||
          elements.pipChatVideoPlayer.srcObject !== pipChatStream
        ) {
          console.log(
            "PiP Chat: Calling video.load() as readyState < HAVE_METADATA or srcObject changed."
          );
          elements.pipChatVideoPlayer.load();
        }

        // 5. Kiểm tra readyState ngay. Nếu đã sẵn sàng, vào PiP luôn.
        // Nếu không, các event listener ở trên sẽ xử lý.
        // HAVE_CURRENT_DATA (2) trở lên là đủ tốt để thử play.
        if (
          elements.pipChatVideoPlayer.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          console.log(
            "PiP Chat: Video player readyState >= HAVE_CURRENT_DATA. Attempting to enter PiP directly."
          );
          // Xóa listener vì chúng ta sẽ xử lý ngay, tránh gọi lại
          elements.pipChatVideoPlayer.removeEventListener(
            "loadedmetadata",
            onCanPlayOrError
          );
          elements.pipChatVideoPlayer.removeEventListener(
            "canplay",
            onCanPlayOrError
          );
          elements.pipChatVideoPlayer.removeEventListener(
            "error",
            onCanPlayOrError
          );
          await enterPiPWhenReady();
        } else {
          console.log(
            "PiP Chat: Video player not ready yet (readyState:",
            elements.pipChatVideoPlayer.readyState,
            "). Waiting for events."
          );
        }
      } catch (error) {
        // Lỗi chung khi thiết lập trước khi chờ event
        console.error(
          "PiP Chat: Lỗi chung trong quá trình chuẩn bị PiP (trước khi chờ event):",
          error
        );
        handlePipFailure(`Lỗi chuẩn bị PiP: ${error.message}`);
      }
    }
  }

  // ==================================
  // STREAMING & UI LOGIC
  // ==================================
  function callViewer(viewerId) {
    if (
      !localStream ||
      !peerInstance ||
      !viewerId ||
      peerInstance.disconnected ||
      peerInstance.destroyed
    ) {
      console.warn(
        `Cannot call viewer ${viewerId}. Stream (${!!localStream}), PeerJS (${!!peerInstance}), Peer disconnected (${
          peerInstance?.disconnected
        }), Peer destroyed (${peerInstance?.destroyed})`
      );
      if (viewerId && !pendingViewers.includes(viewerId))
        pendingViewers.push(viewerId);
      return;
    }
    if (currentCalls[viewerId]) {
      console.log(`Closing existing call before re-calling ${viewerId}`);
      currentCalls[viewerId].close();
      delete currentCalls[viewerId];
    }
    console.log(`Calling viewer: ${viewerId} with stream:`, localStream);
    try {
      if (localStream.getTracks().length === 0) {
        console.warn("Call attempt with empty stream.");
        return;
      }
      const call = peerInstance.call(viewerId, localStream);
      if (!call) {
        throw new Error("peerInstance.call returned undefined");
      }
      currentCalls[viewerId] = call;
      call.on("error", (err) => {
        console.error(`Call error with ${viewerId}:`, err);
        delete currentCalls[viewerId];
      });
      call.on("close", () => {
        console.log(`Call closed with ${viewerId}`);
        delete currentCalls[viewerId];
      });
      call.on("stream", (remoteStream) => {
        console.log(`Received stream from viewer ${viewerId}? (Unexpected)`);
      });
    } catch (error) {
      console.error(`Failed call to ${viewerId}:`, error);
      delete currentCalls[viewerId];
    }
  }
  function stopLocalStream() {
    console.log("Stopping local stream...");
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      console.log("Local stream tracks stopped.");
    }
    localStream = null;
    currentMode = null;
    console.log(`Closing ${Object.keys(currentCalls).length} active calls...`);
    for (const viewerId in currentCalls) {
      if (currentCalls[viewerId]) {
        currentCalls[viewerId].close();
      }
    }
    currentCalls = {};
    updateUIStreamStopped();
  }
  function updateUIStreamStarted(mode) {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.add("streaming");
    elements.streamStatusIndicator.textContent =
      mode === "liveCam" ? "LIVE CAM" : "SHARING SCREEN";
    elements.streamStatusIndicator.className = "stream-status-indicator active";
    if (elements.noStreamOverlay)
      elements.noStreamOverlay.style.display = "none";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.toggle(
        "active",
        mode === "screenShare"
      );
      elements.shareScreenBtn.disabled = mode === "liveCam";
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.toggle("active", mode === "liveCam");
      elements.liveCamBtn.innerHTML =
        mode === "liveCam"
          ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>'
          : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
      elements.liveCamBtn.disabled = mode === "screenShare";
    }
    checkMediaPermissions();
  }
  function updateUIStreamStopped() {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.remove("streaming");
    elements.streamStatusIndicator.textContent = "OFF AIR";
    elements.streamStatusIndicator.className = "stream-status-indicator";
    if (elements.previewVideo) elements.previewVideo.srcObject = null;
    if (elements.noStreamOverlay)
      elements.noStreamOverlay.style.display = "flex";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.remove("active");
      elements.shareScreenBtn.disabled = false;
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.remove("active");
      elements.liveCamBtn.disabled = false;
      elements.liveCamBtn.innerHTML =
        '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
    }
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.innerHTML =
        '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
      elements.toggleMicBtn.classList.add("active");
      elements.toggleMicBtn.disabled = true;
      isMicEnabled = true;
    }
    checkMediaPermissions();
  }
  async function startScreenShare() {
    if (currentMode === "screenShare") {
      console.log("Already screen sharing.");
      return;
    }
    stopLocalStream();
    console.log("Starting screen share...");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, cursor: "always" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      let audioTracksToAdd = [];
      let micObtained = false;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioTracksToAdd.push(...micStream.getAudioTracks());
        micObtained = true;
      } catch (micErr) {
        console.warn("Could not get mic:", micErr);
      }
      if (displayStream.getAudioTracks().length > 0) {
        if (
          !micObtained ||
          (micObtained &&
            displayStream.getAudioTracks()[0].id !== audioTracksToAdd[0]?.id)
        ) {
          audioTracksToAdd.push(...displayStream.getAudioTracks());
        }
      }
      localStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracksToAdd,
      ]);
      if (elements.previewVideo) {
        elements.previewVideo.srcObject = localStream;
      } else {
        console.error("Preview video element missing!");
      }
      currentMode = "screenShare";
      updateUIStreamStarted(currentMode);
      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Screen share ended by user.");
        stopLocalStream();
        if (socket)
          socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      });
      callPendingViewers();
      allJoinedViewers.forEach((viewerId) => callViewer(viewerId));
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Không thể chia sẻ màn hình: " + err.message);
      stopLocalStream();
    }
  }
  async function startLiveCam() {
    if (currentMode === "liveCam") {
      stopLocalStream();
      if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      return;
    }
    stopLocalStream();
    console.log("Starting live cam...");
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStream = camStream;
      isMicEnabled =
        localStream.getAudioTracks().length > 0 &&
        localStream.getAudioTracks()[0].enabled;
      currentMode = "liveCam";
      if (elements.previewVideo) elements.previewVideo.srcObject = localStream;
      updateUIStreamStarted(currentMode);
      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Live cam ended.");
        stopLocalStream();
        if (socket)
          socket.emit("streamEnded", { roomId: streamerConfig.roomId });
      });
      callPendingViewers();
      allJoinedViewers.forEach((viewerId) => callViewer(viewerId));
    } catch (err) {
      console.error("Live cam error:", err);
      alert("Không thể bật camera/mic: " + err.message);
      stopLocalStream();
      updateUIStreamStopped();
    }
  }
  function toggleMicrophone() {
    if (!localStream) {
      console.warn("No local stream to toggle mic.");
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("Stream has no audio track.");
      checkMediaPermissions();
      return;
    }
    isMicEnabled = !isMicEnabled;
    audioTracks.forEach((track) => {
      track.enabled = isMicEnabled;
    });
    console.log(`Mic toggled: ${isMicEnabled ? "ON" : "OFF"}`);
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.classList.toggle("active", isMicEnabled);
      elements.toggleMicBtn.innerHTML = isMicEnabled
        ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
        : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
    }
  }
  async function checkMediaPermissions() {
    let hasMic = false;
    let hasCam = false;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      hasMic = d.some((i) => i.kind === "audioinput" && i.deviceId);
      hasCam = d.some((i) => i.kind === "videoinput" && i.deviceId);
    } catch (e) {
      console.error("Enum dev err:", e);
    }
    const canShare =
      typeof navigator.mediaDevices.getDisplayMedia !== "undefined";
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.disabled =
        !hasMic || !localStream || localStream.getAudioTracks().length === 0;
      if (!hasMic)
        elements.toggleMicBtn.innerHTML =
          '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
      else if (localStream?.getAudioTracks().length > 0) {
        const enabled = localStream.getAudioTracks()[0].enabled;
        isMicEnabled = enabled;
        elements.toggleMicBtn.classList.toggle("active", enabled);
        elements.toggleMicBtn.innerHTML = enabled
          ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
          : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
      } else {
        elements.toggleMicBtn.innerHTML =
          '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
        elements.toggleMicBtn.classList.add("active");
        isMicEnabled = true;
      }
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.disabled = !hasCam || currentMode === "screenShare";
      if (!hasCam)
        elements.liveCamBtn.innerHTML =
          '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>';
      else
        elements.liveCamBtn.innerHTML =
          '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
    }
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.disabled = !canShare || currentMode === "liveCam";
      if (!canShare)
        elements.shareScreenBtn.innerHTML =
          '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>';
    }
    return { hasMic, hasCam };
  }
  function callPendingViewers() {
    if (!localStream || localStream.getTracks().length === 0) {
      console.warn("Skipping pending, no stream.");
      pendingViewers = [];
      return;
    }
    console.log(`Calling ${pendingViewers.length} pending...`);
    const toCall = [...pendingViewers];
    pendingViewers = [];
    toCall.forEach((vId) => {
      if (allJoinedViewers.has(vId)) callViewer(vId);
      else console.log(`Skipping pending ${vId}, already left.`);
    });
  }
  function scrollChatToBottom() {
    const w = elements.chatMessagesList?.parentNode;
    if (w) {
      w.scrollTop = w.scrollHeight;
    }
  }

  function addChatMessage(
    content,
    type = "guest",
    username = "System",
    timestamp = new Date(),
    originalMessage = null
  ) {
    const li = document.createElement("li");
    li.className = `chat-message-item message-${type}`;
    const iconSpan = document.createElement("span");
    iconSpan.className = "msg-icon";
    let iconClass = "fa-user";
    if (type === "host") iconClass = "fa-star";
    else if (type === "pro") iconClass = "fa-crown";
    else if (type === "system") iconClass = "fa-info-circle";
    else if (type === "left") iconClass = "fa-sign-out-alt";
    else if (type === "ban") iconClass = "fa-user-slash";
    iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`;
    li.appendChild(iconSpan);
    const cont = document.createElement("div");
    cont.className = "msg-content-container";
    const head = document.createElement("div");
    head.className = "msg-header";
    const userS = document.createElement("span");
    userS.className = "msg-username";
    userS.textContent = username;
    head.appendChild(userS);
    const timeS = document.createElement("span");
    timeS.className = "msg-timestamp";
    timeS.textContent = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    head.appendChild(timeS);
    cont.appendChild(head);
    const bodyS = document.createElement("span");
    bodyS.className = "msg-body prose-styling";
    let finalHtml = content || "";
    if (type !== "system" && typeof marked !== "undefined") {
      try {
        finalHtml = marked.parse(content || "");
        const t = document.createElement("div");
        t.innerHTML = finalHtml;
        if (typeof renderMathInElement === "function")
          renderMathInElement(t, {
            delimiters: [
              { left: "$$", right: "$$", display: !0 },
              { left: "$", right: "$", display: !1 },
              { left: "\\(", right: "\\)", display: !1 },
              { left: "\\[", right: "\\]", display: !0 },
            ],
            throwOnError: !1,
          });
        finalHtml = t.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Err:", e);
        finalHtml = content;
      }
    }
    bodyS.innerHTML = finalHtml;
    cont.appendChild(bodyS);
    li.appendChild(cont);
    if (
      streamerConfig.username === streamerConfig.roomOwner &&
      type !== "system" &&
      originalMessage
    ) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      const pinBtn = document.createElement("button");
      pinBtn.className = "action-btn pin-btn";
      pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
      pinBtn.title = "Ghim";
      pinBtn.onclick = () => {
        if (!socket) return;
        playButtonFeedback(pinBtn);
        socket.emit("pinComment", {
          roomId: streamerConfig.roomId,
          message: originalMessage,
        });
      };
      acts.appendChild(pinBtn);
      if (username !== streamerConfig.username) {
        const banBtn = document.createElement("button");
        banBtn.className = "action-btn ban-user-btn";
        banBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
        banBtn.title = `Chặn ${username}`;
        banBtn.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(banBtn);
          const confirmed = await showStreamerConfirmation(
            `Chặn ${username}?`,
            "Chặn",
            "Hủy",
            "fas fa-user-slash"
          );
          if (confirmed)
            socket.emit("banViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: username,
            });
        };
        acts.appendChild(banBtn);
      }
      li.appendChild(acts);
    }
    if (!prefersReducedMotion) {
      gsap.from(li, { duration: 0.5, autoAlpha: 0, y: 15, ease: "power2.out" });
    } else {
      gsap.set(li, { autoAlpha: 1 });
    }
    elements.chatMessagesList.appendChild(li);
    scrollChatToBottom();

    if (isPipChatActive) {
      pipChatNeedsUpdate = true; // Đặt cờ để frame tiếp theo sẽ rasterize lại
    }
    // Vòng lặp requestAnimationFrame trong drawPipChatFrame sẽ tự cập nhật khi isPipChatActive.
    // Không cần gọi drawPipChatFrame() hoặc kiểm tra pipChatUpdateRequestId ở đây nữa.
  }

  function displayPinnedComment(message) {
    const wasVisible =
      elements.pinnedCommentContainer.style.height !== "0px" &&
      elements.pinnedCommentContainer.style.opacity !== "0";
    const targetHeight = message && message.content ? "auto" : 0;
    const targetOpacity = message && message.content ? 1 : 0;
    gsap.to(elements.pinnedCommentContainer, {
      duration: 0.4,
      height: targetHeight,
      autoAlpha: targetOpacity,
      ease: "power1.inOut",
      onComplete: () => {
        elements.pinnedCommentContainer.innerHTML = "";
        if (message && message.content) {
          elements.pinnedCommentContainer.classList.add("has-content");
          const pb = document.createElement("div");
          pb.className = "pinned-box";
          const pi = document.createElement("span");
          pi.className = "pin-icon";
          pi.innerHTML = '<i class="fas fa-thumbtack"></i>';
          const pc = document.createElement("div");
          pc.className = "pinned-content";
          const us = document.createElement("span");
          us.className = "pinned-user";
          us.textContent = message.username;
          const ts = document.createElement("span");
          ts.className = "pinned-text prose-styling";
          const tss = document.createElement("span");
          tss.className = "pinned-timestamp";
          tss.textContent = new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          let ch = message.content || "";
          if (typeof marked !== "undefined") {
            try {
              ch = marked.parse(ch);
              const t = document.createElement("div");
              t.innerHTML = ch;
              if (typeof renderMathInElement === "function")
                renderMathInElement(t, {
                  delimiters: [
                    { left: "$$", right: "$$", display: !0 },
                    { left: "$", right: "$", display: !1 },
                    { left: "\\(", right: "\\)", display: !1 },
                    { left: "\\[", right: "\\]", display: !0 },
                  ],
                  throwOnError: !1,
                });
              ch = t.innerHTML;
            } catch (e) {
              console.error("Pin Mark Err:", e);
            }
          }
          ts.innerHTML = ch;
          pc.appendChild(us);
          pc.appendChild(ts);
          pb.appendChild(pi);
          pb.appendChild(pc);
          pb.appendChild(tss);
          if (streamerConfig.username === streamerConfig.roomOwner) {
            const btn = document.createElement("button");
            btn.className = "unpin-btn";
            btn.title = "Bỏ ghim";
            btn.innerHTML = `<i class="fas fa-times"></i>`;
            btn.onclick = () => {
              if (!socket) return;
              playButtonFeedback(btn);
              socket.emit("unpinComment", { roomId: streamerConfig.roomId });
            };
            pb.appendChild(btn);
          }
          elements.pinnedCommentContainer.appendChild(pb);
          if (!wasVisible && !prefersReducedMotion) {
            gsap.from(pb, {
              duration: 0.5,
              y: -10,
              autoAlpha: 0,
              ease: "power2.out",
            });
          }
        } else {
          elements.pinnedCommentContainer.classList.remove("has-content");
        }
      },
    });
  }
  function sendChatMessage() {
    if (!socket || !socket.connected) {
      console.error("Socket not init/conn");
      alert("Lỗi chat.");
      return;
    }
    const msg = elements.chatInputArea.value.trim();
    if (!msg) return;
    const msgType = "host";
    const msgObj = {
      username: streamerConfig.username,
      content: msg,
      messageType: msgType,
      timestamp: new Date().toISOString(),
    };
    socket.emit("chatMessage", {
      roomId: streamerConfig.roomId,
      message: msgObj,
    });
    elements.chatInputArea.value = "";
    elements.chatPreview.innerHTML = "";
    elements.chatInputArea.style.height = "auto";
  }

  function openModal(modalElement) {
    if (!modalElement) return;
    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));
    if (!prefersReducedMotion) {
      gsap.set(modalElement, { display: "flex", autoAlpha: 0 });
      gsap.set(modalElement.querySelector(".modal-content"), {
        y: -30,
        scale: 0.95,
      });
      gsap
        .timeline()
        .to(modalElement, { duration: 0.4, autoAlpha: 1, ease: "power2.out" })
        .to(
          modalElement.querySelector(".modal-content"),
          {
            duration: 0.5,
            y: 0,
            scale: 1,
            autoAlpha: 1,
            ease: "back.out(1.4)",
          },
          "-=0.3"
        );
    } else {
      gsap.set(modalElement, { display: "flex", autoAlpha: 1 });
      gsap.set(modalElement.querySelector(".modal-content"), {
        y: 0,
        scale: 1,
      });
    }
    document.body.style.overflow = "hidden";
  }

  function closeModal(modalElement) {
    if (!modalElement || gsap.getProperty(modalElement, "autoAlpha") === 0)
      return;
    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));
    if (!prefersReducedMotion) {
      gsap
        .timeline({
          onComplete: () => {
            gsap.set(modalElement, { display: "none" });
            document.body.style.overflow = "";
          },
        })
        .to(modalElement.querySelector(".modal-content"), {
          duration: 0.3,
          scale: 0.9,
          autoAlpha: 0,
          ease: "power1.in",
        })
        .to(
          modalElement,
          { duration: 0.4, autoAlpha: 0, ease: "power1.in" },
          "-=0.2"
        );
    } else {
      gsap.set(modalElement, { display: "none", autoAlpha: 0 });
      document.body.style.overflow = "";
    }
  }

  function renderListModal(listElement, items, isBannedList) {
    if (!listElement) return;
    listElement.innerHTML = "";
    if (!items || items.length === 0) {
      listElement.innerHTML = `<li class="user-list-item empty">${
        isBannedList ? "Không có ai bị chặn." : "Chưa có người xem."
      }</li>`;
      return;
    }
    const viewersArray = items.map((item) =>
      typeof item === "string" ? { username: item, canDraw: false } : item
    );

    viewersArray.forEach((viewer) => {
      const u = viewer.username;
      const currentCanDraw =
        viewerDrawPermissions[u] || viewer.canDraw || false;

      const li = document.createElement("li");
      li.className = "user-list-item";
      const ns = document.createElement("span");
      ns.className = "list-username";
      ns.textContent = u;
      if (!isBannedList && currentCanDraw) {
        // Only show draw icon for non-banned viewers with permission
        const drawIcon = document.createElement("i");
        drawIcon.className = "fas fa-paint-brush fa-xs";
        drawIcon.title = "Đang có quyền vẽ";
        drawIcon.style.marginLeft = "8px";
        drawIcon.style.color = "var(--success-color)";
        ns.appendChild(drawIcon);
      }
      li.appendChild(ns);

      const aw = document.createElement("div");
      aw.className = "list-actions";
      if (isBannedList) {
        const ub = document.createElement("button");
        ub.className = "action-btn unban-btn control-btn";
        ub.innerHTML = '<i class="fas fa-undo"></i> Bỏ chặn';
        ub.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(ub);
          const confirmed = await showStreamerConfirmation(
            `Bỏ chặn ${u}?`,
            "Bỏ chặn",
            "Hủy",
            "fas fa-undo"
          );
          if (confirmed)
            socket.emit("unbanViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: u,
            });
        };
        aw.appendChild(ub);
      } else if (u !== streamerConfig.username) {
        const bb = document.createElement("button");
        bb.className = "action-btn ban-btn control-btn";
        bb.innerHTML = '<i class="fas fa-user-slash"></i> Chặn';
        bb.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(bb);
          const confirmed = await showStreamerConfirmation(
            `Chặn ${u}?`,
            "Chặn",
            "Hủy",
            "fas fa-user-slash"
          );
          if (confirmed)
            socket.emit("banViewer", {
              roomId: streamerConfig.roomId,
              viewerUsername: u,
            });
        };
        aw.appendChild(bb);

        const drawPermBtn = document.createElement("button");
        drawPermBtn.className = `action-btn draw-perm-btn control-btn ${
          currentCanDraw ? "active" : ""
        }`;
        drawPermBtn.innerHTML = currentCanDraw
          ? '<i class="fas fa-paint-brush"></i> Thu hồi Vẽ'
          : '<i class="far fa-paint-brush"></i> Cho Vẽ';
        drawPermBtn.title = currentCanDraw
          ? "Thu hồi quyền vẽ của người này"
          : "Cho phép người này vẽ";
        drawPermBtn.onclick = () => {
          if (!socket) return;
          playButtonFeedback(drawPermBtn);
          const newPermission = !currentCanDraw;
          socket.emit("wb:toggleViewerDrawPermission", {
            roomId: streamerConfig.roomId,
            viewerUsername: u,
            canDraw: newPermission,
          });
        };
        aw.appendChild(drawPermBtn);
      }
      li.appendChild(aw);
      listElement.appendChild(li);
    });
    if (
      !prefersReducedMotion &&
      listElement.closest(".modal-v2")?.style.display === "flex"
    ) {
      gsap.from(listElement.children, {
        duration: 0.4,
        autoAlpha: 0,
        y: 10,
        stagger: 0.05,
        ease: "power1.out",
      });
    }
  }

  async function showStreamerConfirmation(
    message,
    confirmText = "Xác nhận",
    cancelText = "Hủy bỏ",
    iconClass = "fas fa-question-circle"
  ) {
    if (typeof showArtisticConfirm === "function") {
      return await showArtisticConfirm(
        message,
        confirmText,
        cancelText,
        iconClass
      );
    }
    console.warn(
      "showArtisticConfirm not found, using window.confirm as fallback."
    );
    return new Promise((resolve) => {
      resolve(window.confirm(message));
    });
  }

  function updateStreamDuration() {
    if (!elements.streamDuration) return;
    const n = new Date();
    const d = n - streamStartTime;
    if (d < 0) return;
    const h = Math.floor(d / 36e5);
    const m = Math.floor((d % 36e5) / 6e4);
    const s = Math.floor((d % 6e4) / 1e3);
    elements.streamDuration.textContent = `${String(h).padStart(
      2,
      "0"
    )}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function initAnimations() {
    // Check if panelContent exists and determine initial state
    const initialPanelContentHeight = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : "auto"
      : 0;
    const initialPanelContentAlpha = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : 1
      : 0;
    const initialPanelContentPadding = elements.panelContent
      ? elements.controlPanel?.classList.contains("collapsed")
        ? 0
        : 20
      : 0;

    if (elements.panelContent) {
      gsap.set(elements.panelContent, {
        height: initialPanelContentHeight,
        autoAlpha: initialPanelContentAlpha,
        paddingTop: initialPanelContentPadding,
        paddingBottom: initialPanelContentPadding,
        marginTop: 0,
        // overflowY: "hidden" // Ensure overflow is hidden initially for height animation
      });
    }

    if (elements.controlButtons) {
      gsap.set(elements.controlButtons, {
        autoAlpha: elements.controlPanel?.classList.contains("collapsed")
          ? 0
          : 1,
      });
    }

    if (prefersReducedMotion) {
      gsap.set(
        "[data-animate], .streamer-main-header, .streamer-sidebar, .streamer-chat-area, .panel-header h3, .control-btn",
        { autoAlpha: 1 }
      );
      if (elements.panelContent) {
        elements.panelContent.style.display =
          elements.controlPanel?.classList.contains("collapsed")
            ? "none"
            : "block";
        // elements.panelContent.style.overflowY = elements.controlPanel?.classList.contains("collapsed") ? "hidden" : "auto";
      }
      if (
        !elements.controlPanel?.classList.contains("collapsed") &&
        elements.controlButtons
      ) {
        gsap.set(elements.controlButtons, { autoAlpha: 1 });
      }
      initBackgroundParticles();
      return;
    }

    const tl = gsap.timeline({ delay: 0.2 });
    tl.from(elements.header, {
      duration: 0.8,
      y: -80,
      autoAlpha: 0,
      ease: "power3.out",
    })
      .from(
        elements.sidebar,
        { duration: 0.9, x: -100, autoAlpha: 0, ease: "power3.out" },
        "-=0.5"
      )
      .from(
        elements.chatArea,
        { duration: 0.9, x: 100, autoAlpha: 0, ease: "power3.out" },
        "<"
      );
    if (elements.panelInternalHeader) {
      tl.from(
        elements.panelInternalHeader,
        { duration: 0.5, y: -15, autoAlpha: 0, ease: "power2.out" },
        "-=0.3"
      );
    } else {
      console.warn("Control panel header H3 not found for animation.");
    }
    if (
      !elements.controlPanel?.classList.contains("collapsed") &&
      elements.controlButtons &&
      elements.controlButtons.length > 0
    ) {
      gsap.from(elements.controlButtons, {
        duration: 0.6,
        y: 20,
        autoAlpha: 0,
        stagger: 0.06,
        ease: "power2.out",
        delay: tl.duration() - 0.2, // Ensure buttons animate after panel is somewhat visible
      });
    }
    tl.from(
      ".chat-container-v2 > *:not(#pinnedCommentV2)",
      {
        duration: 0.6,
        y: 20,
        autoAlpha: 0,
        stagger: 0.1,
        ease: "power2.out",
      },
      "-=0.5"
    );
    initBackgroundParticles();
  } // End initAnimations

  function initBackgroundParticles() {
    if (prefersReducedMotion) return;
    const t = document.getElementById("tsparticles-bg");
    if (!t) return;
    tsParticles
      .load("tsparticles-bg", {
        fpsLimit: 60,
        particles: {
          number: { value: 50, density: { enable: !0, value_area: 900 } },
          color: { value: ["#FFFFFF", "#aaaacc", "#ccaaff", "#f0e68c"] },
          shape: { type: "circle" },
          opacity: {
            value: { min: 0.05, max: 0.2 },
            random: !0,
            anim: { enable: !0, speed: 0.4, minimumValue: 0.05, sync: !1 },
          },
          size: {
            value: { min: 0.5, max: 1.5 },
            random: !0,
            anim: { enable: !1 },
          },
          links: { enable: !1 },
          move: {
            enable: !0,
            speed: 0.3,
            direction: "none",
            random: !0,
            straight: !1,
            outModes: { default: "out" },
            attract: { enable: !1 },
            trail: { enable: !1 },
          },
        },
        interactivity: {
          detect_on: "window",
          events: { onhover: { enable: !1 }, onclick: { enable: !1 } },
        },
        retina_detect: !0,
        background: { color: "transparent" },
      })
      .catch((e) => console.error("tsParticles bg err:", e));
  }
  function playButtonFeedback(button) {
    if (!button || prefersReducedMotion) return;
    gsap
      .timeline()
      .to(button, { scale: 0.92, duration: 0.1, ease: "power1.in" })
      .to(button, { scale: 1, duration: 0.35, ease: "elastic.out(1, 0.5)" });
    if (typeof tsParticles !== "undefined") {
      tsParticles
        .load({
          element: button,
          preset: "confetti",
          particles: {
            number: { value: 10 },
            size: { value: { min: 1, max: 3 } },
          },
          emitters: {
            position: { x: 50, y: 50 },
            size: { width: 5, height: 5 },
            rate: { quantity: 5, delay: 0 },
            life: { duration: 0.15, count: 1 },
          },
        })
        .then((c) => setTimeout(() => c?.destroy(), 400));
    }
  }

  function addQuizOptionInput(optionText = "") {
    if (!elements.quizOptionsContainer || !elements.quizCorrectAnswerSelect)
      return;
    if (quizOptionsStreamer.length >= 6) {
      // Max 6 options for example
      if (typeof showAlert === "function")
        showAlert("Tối đa 6 lựa chọn cho một câu hỏi.", "warning");
      return;
    }

    const optionId = `quizOption_${Date.now()}_${quizOptionsStreamer.length}`;
    const wrapper = document.createElement("div");
    wrapper.className = "quiz-option-input-wrapper";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.marginBottom = "8px";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Lựa chọn ${quizOptionsStreamer.length + 1}`;
    input.value = optionText;
    input.dataset.optionId = optionId;
    input.style.flexGrow = "1";
    input.style.padding = "8px";
    input.style.border = "1px solid var(--border-color)";
    input.style.borderRadius = "var(--border-radius-small)";
    input.style.backgroundColor = "rgba(var(--bg-dark-rgb), 0.7)";
    input.style.color = "var(--text-light)";

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.className = "quiz-option-remove-btn";
    removeBtn.title = "Xóa lựa chọn này";
    removeBtn.style.marginLeft = "8px";
    removeBtn.style.background = "var(--danger-color)";
    removeBtn.style.color = "white";
    removeBtn.style.border = "none";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.width = "24px";
    removeBtn.style.height = "24px";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.display = "flex";
    removeBtn.style.alignItems = "center";
    removeBtn.style.justifyContent = "center";

    removeBtn.onclick = () => {
      quizOptionsStreamer = quizOptionsStreamer.filter(
        (opt) => opt.id !== optionId
      );
      wrapper.remove();
      updateQuizCorrectAnswerSelect();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    elements.quizOptionsContainer.appendChild(wrapper);
    quizOptionsStreamer.push({ id: optionId, inputElement: input });
    updateQuizCorrectAnswerSelect();
  }

  // Function to update the "correct answer" dropdown
  function updateQuizCorrectAnswerSelect() {
    if (!elements.quizCorrectAnswerSelect) return;
    elements.quizCorrectAnswerSelect.innerHTML = "";
    if (quizOptionsStreamer.length === 0) {
      elements.quizCorrectAnswerSelect.style.display = "none";
      return;
    }
    elements.quizCorrectAnswerSelect.style.display = "block";

    quizOptionsStreamer.forEach((option, index) => {
      const optElement = document.createElement("option");
      const currentText =
        option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
      optElement.value = index.toString();
      optElement.textContent = `Đáp án ${index + 1}: ${currentText.substring(
        0,
        30
      )}${currentText.length > 30 ? "..." : ""}`;
      elements.quizCorrectAnswerSelect.appendChild(optElement);
    });

    quizOptionsStreamer.forEach((option, index) => {
      option.inputElement.oninput = () => {
        const selectOption = elements.quizCorrectAnswerSelect.options[index];
        if (selectOption) {
          const inputText =
            option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
          selectOption.textContent = `Đáp án ${
            index + 1
          }: ${inputText.substring(0, 30)}${
            inputText.length > 30 ? "..." : ""
          }`;
        }
      };
    });
  }

  function handleStartQuiz() {
    if (
      !socket ||
      !elements.quizQuestionText ||
      !elements.quizCorrectAnswerSelect
    )
      return;
    playButtonFeedback(elements.startQuizBtn);

    const questionText = elements.quizQuestionText.value.trim();
    const options = quizOptionsStreamer
      .map((opt) => opt.inputElement.value.trim())
      .filter((optText) => optText.length > 0);
    const correctAnswerIndex = parseInt(
      elements.quizCorrectAnswerSelect.value,
      10
    );

    if (!questionText) {
      if (typeof showAlert === "function")
        showAlert("Vui lòng nhập nội dung câu hỏi.", "warning");
      return;
    }
    if (options.length < 2) {
      if (typeof showAlert === "function")
        showAlert("Cần ít nhất 2 lựa chọn cho câu hỏi.", "warning");
      return;
    }
    if (
      isNaN(correctAnswerIndex) ||
      correctAnswerIndex < 0 ||
      correctAnswerIndex >= options.length
    ) {
      if (typeof showAlert === "function")
        showAlert("Vui lòng chọn đáp án đúng hợp lệ.", "warning");
      return;
    }

    socket.emit("quiz:start", {
      roomId: streamerConfig.roomId,
      questionText: questionText,
      options: options,
      correctAnswerIndex: correctAnswerIndex,
    });

    elements.startQuizBtn.disabled = true;
    elements.quizQuestionText.disabled = true;
    quizOptionsStreamer.forEach((opt) => (opt.inputElement.disabled = true));
    elements.addQuizOptionBtn.disabled = true;
    elements.quizCorrectAnswerSelect.disabled = true;

    elements.showQuizAnswerBtn.disabled = false;
    elements.nextQuizQuestionBtn.disabled = false;
    elements.endQuizBtn.disabled = false;
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đang hỏi: "${questionText.substring(
        0,
        50
      )}..."</p>`;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    isQuizActiveStreamer = true;
  }

  function handleShowQuizAnswer() {
    if (!socket || !currentQuizQuestionIdStreamer) return;
    playButtonFeedback(elements.showQuizAnswerBtn);
    socket.emit("quiz:showAnswer", {
      roomId: streamerConfig.roomId,
      questionId: currentQuizQuestionIdStreamer,
    });
    elements.showQuizAnswerBtn.disabled = true;
  }

  function handleNextQuizQuestion() {
    if (!socket) return;
    playButtonFeedback(elements.nextQuizQuestionBtn);
    socket.emit("quiz:nextQuestion", { roomId: streamerConfig.roomId });

    if (elements.quizQuestionText) {
      elements.quizQuestionText.value = "";
      elements.quizQuestionText.disabled = false;
    }
    if (elements.quizOptionsContainer)
      elements.quizOptionsContainer.innerHTML = "";
    quizOptionsStreamer = [];
    addQuizOptionInput();
    addQuizOptionInput();
    if (elements.quizCorrectAnswerSelect) {
      elements.quizCorrectAnswerSelect.innerHTML = "";
      elements.quizCorrectAnswerSelect.disabled = false;
      updateQuizCorrectAnswerSelect();
    }
    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
    if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
    if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
    if (elements.nextQuizQuestionBtn)
      elements.nextQuizQuestionBtn.disabled = true;
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chờ câu hỏi mới...</p>`;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    currentQuizQuestionIdStreamer = null;
  }

  function handleEndQuiz() {
    if (!socket) return;
    playButtonFeedback(elements.endQuizBtn);
    socket.emit("quiz:end", { roomId: streamerConfig.roomId });
    isQuizActiveStreamer = false;
    resetQuizUIStreamer();
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đã kết thúc.</p>`;
  }

  function resetQuizUIStreamer() {
    if (elements.quizQuestionText) {
      elements.quizQuestionText.value = "";
      elements.quizQuestionText.disabled = false;
    }
    if (elements.quizOptionsContainer)
      elements.quizOptionsContainer.innerHTML = "";
    quizOptionsStreamer = [];
    addQuizOptionInput();
    addQuizOptionInput();
    if (elements.quizCorrectAnswerSelect) {
      elements.quizCorrectAnswerSelect.innerHTML = "";
      elements.quizCorrectAnswerSelect.disabled = false;
      updateQuizCorrectAnswerSelect();
    }

    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
    if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
    if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
    if (elements.nextQuizQuestionBtn)
      elements.nextQuizQuestionBtn.disabled = true;
    if (elements.endQuizBtn) elements.endQuizBtn.disabled = true;
    if (elements.quizStreamerResults)
      elements.quizStreamerResults.innerHTML = "";
    currentQuizQuestionIdStreamer = null;
    isQuizActiveStreamer = false; // Ensure this is also reset
    if (
      elements.streamerQuizPanel &&
      elements.streamerQuizPanel.style.display !== "none"
    ) {
      // Only hide if it was open and now quiz is fully reset/ended, or keep it if user explicitly opened it
      // elements.streamerQuizPanel.style.display = 'none';
      // if(elements.toggleQuizPanelBtn) elements.toggleQuizPanelBtn.classList.remove('active');
    }
    if (elements.quizStreamerStatus)
      elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chưa bắt đầu.</p>`;
  }

  function initializeQuizOptionFields() {
    if (quizOptionsStreamer.length === 0 && elements.quizOptionsContainer) {
      // Check container exists
      addQuizOptionInput();
      addQuizOptionInput();
    }
  }

  // ==================================
  // UI EVENT LISTENERS SETUP
  // ==================================
  function initUIEventListeners() {
    // --- Control Panel Toggle ---
    elements.togglePanelBtn?.addEventListener("click", () => {
      isPanelCollapsed = elements.controlPanel.classList.toggle("collapsed");
      const icon = elements.togglePanelBtn.querySelector("i");
      if (!elements.panelContent) return;

      gsap.to(icon, {
        rotation: isPanelCollapsed ? 180 : 0,
        duration: 0.4,
        ease: "power2.inOut",
      });

      // GSAP can't directly animate to 'auto' for height with overflow changes.
      // We'll handle overflow after the animation.
      if (!prefersReducedMotion) {
        if (isPanelCollapsed) {
          gsap.to(elements.controlButtons, {
            duration: 0.25,
            autoAlpha: 0,
            y: 10,
            stagger: 0.04,
            ease: "power1.in",
            overwrite: true,
          });
          gsap.to(elements.panelContent, {
            duration: 0.4,
            height: 0,
            paddingTop: 0,
            paddingBottom: 0,
            marginTop: 0, // Keep this if it's part of the collapsed style
            autoAlpha: 0,
            ease: "power2.inOut",
            delay: 0.1,
            onComplete: () => {
              // elements.panelContent.style.overflowY = "hidden"; // Hide scrollbar when collapsed
            },
          });
        } else {
          // elements.panelContent.style.overflowY = "hidden"; // Keep hidden during expansion animation
          gsap.set(elements.panelContent, {
            display: "block", // Make it block to calculate scrollHeight
            height: "auto", // Temporarily set to auto to get scrollHeight
            autoAlpha: 0, // Keep it invisible
          });
          const targetHeight = elements.panelContent.scrollHeight; // Get the natural height

          gsap.fromTo(
            elements.panelContent,
            {
              // From:
              height: 0,
              autoAlpha: 0,
              paddingTop: 0,
              paddingBottom: 0,
              // marginTop: 0 // if it's part of the collapsed style
            },
            {
              // To:
              duration: 0.5,
              height: targetHeight, // Animate to the calculated height
              paddingTop: 20, // Restore padding
              paddingBottom: 20,
              // marginTop: 0,    // Restore margin if needed
              autoAlpha: 1,
              ease: "power3.out",
              onComplete: () => {
                gsap.set(elements.panelContent, { height: "auto" }); // Set to auto for dynamic content
                // elements.panelContent.style.overflowY = "auto"; // Allow scrollbar now
                if (
                  elements.controlButtons &&
                  elements.controlButtons.length > 0
                ) {
                  gsap.fromTo(
                    elements.controlButtons,
                    { y: 15, autoAlpha: 0 },
                    {
                      duration: 0.5,
                      y: 0,
                      autoAlpha: 1,
                      stagger: 0.06,
                      ease: "power2.out",
                      overwrite: true,
                    }
                  );
                }
              },
            }
          );
        }
      } else {
        // Reduced motion
        elements.panelContent.style.display = isPanelCollapsed
          ? "none"
          : "block";
        // elements.panelContent.style.overflowY = isPanelCollapsed ? "hidden" : "auto";
        if (elements.controlButtons) {
          gsap.set(elements.controlButtons, {
            autoAlpha: isPanelCollapsed ? 0 : 1,
          });
        }
      }
    });

    elements.shareScreenBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.shareScreenBtn);
      startScreenShare();
    });
    elements.liveCamBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.liveCamBtn);
      startLiveCam();
    });
    elements.toggleMicBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.toggleMicBtn);
      toggleMicrophone();
    });
    elements.endStreamBtn?.addEventListener("click", async () => {
      if (!socket) {
        console.error("Socket not connected.");
        return;
      }
      playButtonFeedback(elements.endStreamBtn);
      const confirmed = await showStreamerConfirmation(
        "Xác nhận kết thúc stream?",
        "Kết thúc",
        "Hủy",
        "fas fa-exclamation-triangle"
      );
      if (confirmed) {
        stopLocalStream();
        socket.emit("endRoom", { roomId: streamerConfig.roomId });
        window.location.href = "https://hoctap-9a3.glitch.me/live";
      }
    });
    elements.viewersListBtn?.addEventListener("click", () => {
      if (!socket) return;
      playButtonFeedback(elements.viewersListBtn);
      socket.emit("getViewersList", { roomId: streamerConfig.roomId });
      openModal(elements.viewersModal);
    });
    elements.bannedListBtn?.addEventListener("click", () => {
      if (!socket) return;
      playButtonFeedback(elements.bannedListBtn);
      socket.emit("getBannedList", { roomId: streamerConfig.roomId });
      openModal(elements.bannedModal);
    });
    elements.closeViewersModalBtn?.addEventListener("click", () =>
      closeModal(elements.viewersModal)
    );
    elements.closeBannedModalBtn?.addEventListener("click", () =>
      closeModal(elements.bannedModal)
    );
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          closeModal(backdrop.closest(".modal-v2"));
        }
      });
    });
    elements.sendChatBtn?.addEventListener("click", sendChatMessage);
    elements.chatInputArea?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    elements.chatInputArea?.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
      const rt = this.value || "";
      if (elements.chatPreview && typeof marked !== "undefined") {
        try {
          let h = marked.parse(rt);
          elements.chatPreview.innerHTML = h;
        } catch (e) {
          elements.chatPreview.innerHTML = "Lỗi xem trước Markdown";
        }
      }
    });
    elements.viewersSearchInput?.addEventListener("input", function () {
      const q = this.value.toLowerCase();
      const li = elements.viewersModalList?.querySelectorAll("li");
      li?.forEach((l) => {
        const u =
          l.querySelector(".list-username")?.textContent.toLowerCase() || "";
        l.style.display = u.includes(q) ? "" : "none";
      });
    });

    elements.toggleWhiteboardBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.toggleWhiteboardBtn);
      const newVisibility = !isWhiteboardActive;
      if (socket && socket.connected) {
        socket.emit("wb:toggleGlobalVisibility", {
          roomId: streamerConfig.roomId,
          isVisible: newVisibility,
        });
      } else {
        if (newVisibility) {
          showWhiteboard();
        } else {
          hideWhiteboard();
        }
      }
    });
    elements.closeWhiteboardBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.closeWhiteboardBtn);
      if (socket && socket.connected) {
        socket.emit("wb:toggleGlobalVisibility", {
          roomId: streamerConfig.roomId,
          isVisible: false,
        });
      } else {
        hideWhiteboard();
      }
    });
    elements.wbColorPicker?.addEventListener("input", (e) => {
      wbCurrentColor = e.target.value;
    });
    elements.wbLineWidthRange?.addEventListener("input", (e) => {
      wbCurrentLineWidth = parseInt(e.target.value, 10);
      if (elements.wbLineWidthValueDisplay)
        elements.wbLineWidthValueDisplay.textContent = wbCurrentLineWidth;
    });
    elements.wbClearBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.wbClearBtn);
      clearWhiteboard(true);
    });
    elements.wbEraserModeBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.wbEraserModeBtn);
      wbIsEraserMode = !wbIsEraserMode;
      elements.wbEraserModeBtn.classList.toggle("active", wbIsEraserMode);
      if (elements.whiteboardCanvas) {
        elements.whiteboardCanvas.style.cursor = wbIsEraserMode
          ? "cell"
          : "crosshair";
      }
      if (wbIsEraserMode) {
        console.log("Eraser mode ON");
      } else {
        console.log("Eraser mode OFF, Pen mode ON");
      }
    });

    if (elements.pipChatBtn && elements.pipChatVideoPlayer && pipChatCanvas) {
      const isPiPSupportedByBrowser =
        typeof elements.pipChatVideoPlayer.requestPictureInPicture ===
          "function" && typeof pipChatCanvas.captureStream === "function";

      if (isPiPSupportedByBrowser) {
        elements.pipChatBtn.style.display = "flex";
        elements.pipChatBtn.disabled = false;
        elements.pipChatBtn.addEventListener("click", () => {
          playButtonFeedback(elements.pipChatBtn);
          togglePipChat();
        });

        elements.pipChatVideoPlayer.addEventListener(
          "enterpictureinpicture",
          () => {
            console.log(
              "PiP Chat: Sự kiện 'enterpictureinpicture' đã kích hoạt."
            );
            isPipChatActive = true;
            pipChatNeedsUpdate = true;
            if (elements.pipChatBtn) {
              elements.pipChatBtn.classList.add("active");
              elements.pipChatBtn.innerHTML =
                '<i class="fas fa-window-minimize"></i><span class="btn-label">Thoát PiP</span>';
            }
            if (pipChatUpdateRequestId)
              cancelAnimationFrame(pipChatUpdateRequestId);
            drawPipChatFrame();
          }
        );

        elements.pipChatVideoPlayer.addEventListener(
          "leavepictureinpicture",
          () => {
            console.log("Đã thoát chế độ PiP Chat.");
            isPipChatActive = false;
            pipChatNeedsUpdate = false;
            if (pipChatUpdateRequestId) {
              cancelAnimationFrame(pipChatUpdateRequestId);
              pipChatUpdateRequestId = null;
            }
            if (elements.pipChatBtn) {
              elements.pipChatBtn.classList.remove("active");
              elements.pipChatBtn.innerHTML =
                '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
            }
            if (pipChatStream) {
              pipChatStream.getTracks().forEach((track) => track.stop());
              pipChatStream = null;
            }
          }
        );
      } else {
        console.warn(
          "PiP Chat (Canvas Capture or Video PiP) is not fully supported by this browser."
        );
        if (elements.pipChatBtn) {
          elements.pipChatBtn.style.display = "flex";
          elements.pipChatBtn.classList.add("control-btn-disabled-visual");
          elements.pipChatBtn.title =
            "PiP Chat không được trình duyệt này hỗ trợ đầy đủ.";
          elements.pipChatBtn.disabled = true;
        }
      }
    } else if (elements.pipChatBtn) {
      elements.pipChatBtn.style.display = "none";
    }
    elements.toggleQuizPanelBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.toggleQuizPanelBtn);
      if (elements.streamerQuizPanel) {
        const isPanelVisible =
          elements.streamerQuizPanel.style.display === "block" ||
          elements.streamerQuizPanel.style.display === "";
        // Animate quiz panel toggle
        const quizIcon = elements.toggleQuizPanelBtn.querySelector("i");
        gsap.to(quizIcon, {
          rotation: isPanelVisible ? 0 : 180,
          duration: 0.3,
          ease: "power1.inOut",
        });

        if (isPanelVisible) {
          gsap.to(elements.streamerQuizPanel, {
            duration: 0.3,
            height: 0,
            autoAlpha: 0,
            ease: "power1.in",
            onComplete: () => {
              elements.streamerQuizPanel.style.display = "none";
            },
          });
          elements.toggleQuizPanelBtn.classList.remove("active");
        } else {
          gsap.set(elements.streamerQuizPanel, {
            display: "block",
            height: "auto",
            autoAlpha: 0,
          });
          const targetHeight = elements.streamerQuizPanel.scrollHeight;
          gsap.fromTo(
            elements.streamerQuizPanel,
            { height: 0, autoAlpha: 0 },
            {
              duration: 0.4,
              height: targetHeight,
              autoAlpha: 1,
              ease: "power2.out",
              onComplete: () => {
                gsap.set(elements.streamerQuizPanel, { height: "auto" }); // allow dynamic content later
              },
            }
          );
          elements.toggleQuizPanelBtn.classList.add("active");
          initializeQuizOptionFields();
          updateQuizCorrectAnswerSelect();
        }
      }
    });

    elements.addQuizOptionBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.addQuizOptionBtn);
      addQuizOptionInput();
    });

    elements.startQuizBtn?.addEventListener("click", handleStartQuiz);
    elements.showQuizAnswerBtn?.addEventListener("click", handleShowQuizAnswer);
    elements.nextQuizQuestionBtn?.addEventListener(
      "click",
      handleNextQuizQuestion
    );
    elements.endQuizBtn?.addEventListener("click", handleEndQuiz);

    // --- Whiteboard Pan/Zoom Tool UI (Example) ---
    const panToolBtn = document.getElementById("wbPanToolBtnV2Streamer"); // Assume you add this button
    const zoomInBtn = document.getElementById("wbZoomInBtnV2Streamer");
    const zoomOutBtn = document.getElementById("wbZoomOutBtnV2Streamer");
    const resetViewBtn = document.getElementById("wbResetViewBtnV2Streamer");

    if (panToolBtn) {
      panToolBtn.addEventListener("click", () => {
        wbCamera.isPanToolActive = !wbCamera.isPanToolActive;
        panToolBtn.classList.toggle("active", wbCamera.isPanToolActive);
        if (elements.whiteboardCanvas) {
          elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
            ? "grab"
            : wbIsEraserMode
            ? "cell"
            : "crosshair";
        }
        if (typeof showAlert === "function")
          showAlert(
            wbCamera.isPanToolActive
              ? "Chế độ Di chuyển Bảng vẽ: BẬT"
              : "Chế độ Di chuyển Bảng vẽ: TẮT",
            "info",
            2000
          );
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        const oldScale = wbCamera.scale;
        wbCamera.scale *= 1.2;
        wbCamera.scale = Math.min(WB_MAX_SCALE, wbCamera.scale);
        // Zoom towards center of current viewport
        const centerX = elements.whiteboardCanvas.width / 2;
        const centerY = elements.whiteboardCanvas.height / 2;
        const worldCenter = getCanvasWorldCoordinates(
          elements.whiteboardCanvas.getBoundingClientRect().left + centerX,
          elements.whiteboardCanvas.getBoundingClientRect().top + centerY
        );

        wbCamera.x = worldCenter.x - centerX / wbCamera.scale;
        wbCamera.y = worldCenter.y - centerY / wbCamera.scale;

        redrawWhiteboardFull();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        const oldScale = wbCamera.scale;
        wbCamera.scale /= 1.2;
        wbCamera.scale = Math.max(WB_MIN_SCALE, wbCamera.scale);
        const centerX = elements.whiteboardCanvas.width / 2;
        const centerY = elements.whiteboardCanvas.height / 2;
        const worldCenter = getCanvasWorldCoordinates(
          elements.whiteboardCanvas.getBoundingClientRect().left + centerX,
          elements.whiteboardCanvas.getBoundingClientRect().top + centerY
        );

        wbCamera.x = worldCenter.x - centerX / wbCamera.scale;
        wbCamera.y = worldCenter.y - centerY / wbCamera.scale;

        redrawWhiteboardFull();
      });
    }
    if (resetViewBtn) {
      resetViewBtn.addEventListener("click", () => {
        wbCamera.x = WB_MAX_WIDTH / 4;
        wbCamera.y = WB_MAX_HEIGHT / 4;
        wbCamera.scale = 0.5;
        redrawWhiteboardFull();
      });
    }

    // Ensure eraser mode also respects pan tool for cursor
    if (elements.wbEraserModeBtn) {
      const originalEraserClickHandler = elements.wbEraserModeBtn.onclick;
      elements.wbEraserModeBtn.onclick = function (e) {
        if (originalEraserClickHandler)
          originalEraserClickHandler.call(this, e); // Call original if exists
        // After original logic, set cursor based on pan tool
        if (elements.whiteboardCanvas) {
          elements.whiteboardCanvas.style.cursor = wbCamera.isPanToolActive
            ? "grab"
            : wbIsEraserMode
            ? "cell"
            : "crosshair";
        }
      };
    }
  } // End initUIEventListeners

  // ==================================
  // START INITIALIZATION
  // ==================================
  initializeStreamer();
}); // End DOMContentLoaded
