// File: public/js/streamer.js

// /public/js/streamer-masterpiece.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Lib Checks & Config ---
  if (
    typeof gsap === "undefined" ||
    typeof io === "undefined" ||
    typeof Peer === "undefined" ||
    typeof tsParticles === "undefined" ||
    typeof marked === "undefined" || // Added marked
    typeof katex === "undefined" || // Added katex
    typeof initializeSharedWhiteboard === "undefined" // Check for shared module
  ) {
    console.error(
      "Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles, Marked, KaTeX, SharedWhiteboard) not loaded!"
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
    // --- Whiteboard Elements for Shared Module ---
    toggleWhiteboardBtnStreamer: document.getElementById("toggleWhiteboardBtnStreamerV2"), // Global toggle for streamer
    whiteboardOverlay: document.getElementById("whiteboardContainerOverlayV2"), // The main overlay div
    whiteboardCanvas: document.getElementById("whiteboardCanvasV2"), // The <canvas>
    // Toolbar elements to pass to shared module
    whiteboardToolbarMain: document.getElementById("whiteboardToolbarV2"),
    wbColorPicker: document.getElementById("wbColorPickerV2"),
    wbLineWidthRange: document.getElementById("wbLineWidthRangeV2"),
    wbLineWidthValueDisplay: document.getElementById("wbLineWidthValueV2"),
    wbEraserModeBtn: document.getElementById("wbEraserModeBtnV2"),
    wbClearBtn: document.getElementById("wbClearBtnV2"),
    wbPanToolBtn: document.getElementById("wbPanToolBtnV2Streamer"),
    wbZoomInBtn: document.getElementById("wbZoomInBtnV2Streamer"),
    wbZoomOutBtn: document.getElementById("wbZoomOutBtnV2Streamer"),
    wbResetViewBtn: document.getElementById("wbResetViewBtnV2Streamer"),
    wbToggleGridBtn: document.getElementById("wbToggleGridBtnV2Streamer"),
    wbShapeToolToggleBtn: document.getElementById("wbShapeToolBtnV2Streamer"),
    wbShapeOptionsContainer: document.getElementById("wbShapeOptionsContainerV2Streamer"),
    wbDrawRectangleBtn: document.getElementById("wbDrawRectangleBtnV2Streamer"),
    wbDrawCircleBtn: document.getElementById("wbDrawCircleBtnV2Streamer"),
    wbDrawLineBtn: document.getElementById("wbDrawLineBtnV2Streamer"),
    wbSelectToolToggleBtn: document.getElementById("wbSelectToolBtnV2Streamer"),
    wbSnipModeOptionsContainer: document.getElementById("wbSnipModeOptionsContainerV2Streamer"),
    wbRectangularSnipBtn: document.getElementById("wbRectangularSnipBtnV2Streamer"),
    wbFreedomSnipBtn: document.getElementById("wbFreedomSnipBtnV2Streamer"),
    wbDeleteSelectedBtn: document.getElementById("wbDeleteSelectedBtnV2Streamer"),
    streamerCoordsDisplay: document.getElementById("streamerCoordsDisplay"),
    // --- End Whiteboard Elements ---
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
  let viewerDrawPermissions = {}; // { username: boolean } -> now mainly managed by server, client UI reflects
  let pendingViewers = [];
  let allJoinedViewers = new Set();
  let isMicEnabled = true;
  let isPanelCollapsed = false;
  let streamStartTime = streamerConfig.roomCreatedAt
    ? new Date(streamerConfig.roomCreatedAt)
    : new Date();
  let durationInterval = null;

  // --- Whiteboard State (now managed by shared module) ---
  let sharedWhiteboardInstance = null;
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

  // --- Quiz State (Streamer specific UI state) ---
  let quizOptionsStreamer = []; // [{id, inputElement}, ...]
  let currentQuizQuestionIdStreamer = null; // ID of the quiz question *currently being configured or active on server*
  let isQuizActiveStreamer = false; // Is a quiz session active (from streamer's perspective)

  let socket = null;

  // ==================================
  // INITIALIZATION FUNCTION
  // ==================================
  function initializeStreamer() {
    console.log("Initializing Streamer UI & Connections...");
    initSocket(); // Socket must be initialized before PeerJS uses it
    initPeer();
    initAnimations();
    initPipChatCanvas();
    initUIEventListeners(); // This will also init shared whiteboard
    updateStreamDuration();
    if (durationInterval) clearInterval(durationInterval);
    durationInterval = setInterval(updateStreamDuration, 1000);
    checkMediaPermissions();
    isPanelCollapsed =
      elements.controlPanel?.classList.contains("collapsed") || false;

    resetQuizUIStreamer(); // Initialize quiz UI elements

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
      if (typeof showAlert === "function")
        showAlert(`Lỗi kết nối server: ${err.message}`, "error");
      else alert(`Lỗi kết nối server: ${err.message}`);
    });

    socket.on("connect", () => {
      console.log("Streamer socket connected:", socket.id);
      socket.emit("joinRoom", {
        roomId: streamerConfig.roomId,
        username: streamerConfig.username,
        // No peerId here, streamerReady will send it
      });

      if (
        peerInstance &&
        peerInstance.id &&
        !peerInstance.disconnected &&
        !peerInstance.destroyed
      ) {
        console.log(
          "Streamer socket connected AND PeerJS ready. Emitting streamerReady."
        );
        socket.emit("streamerReady", {
          roomId: streamerConfig.roomId,
          peerId: peerInstance.id,
        });
      } else {
        console.warn(
          "Streamer socket connected, but PeerJS not yet ready for streamerReady."
        );
      }
      // Streamer requests its own potential existing state if it's rejoining
      if (sharedWhiteboardInstance) {
         sharedWhiteboardInstance.forceRequestInitialState();
      } else {
        // Fallback if sharedWB not init yet, server will handle host rejoin state for WB
        socket.emit("wb:requestInitialState", { roomId: streamerConfig.roomId });
      }

      // Handle quiz state on host rejoin
      socket.emit("quiz:requestHostState", { roomId: streamerConfig.roomId });

    });

    socket.on("disconnect", (reason) => {
      console.warn("Streamer socket disconnected:", reason);
      if (typeof showAlert === "function")
        showAlert("Mất kết nối tới server chat.", "error");
      else alert("Mất kết nối tới server chat.");
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
      else console.warn("Streamer received invalid message data:", data);
    });
    socket.on("updateViewers", (count) => {
      if (elements.viewerCount) elements.viewerCount.textContent = count ?? 0;
    });
    socket.on("commentPinned", (data) => displayPinnedComment(data?.message));
    socket.on("commentUnpinned", () => displayPinnedComment(null));

    socket.on("newViewer", ({ viewerId }) => { // viewerId is PeerJS ID of viewer
      if (!viewerId) return;
      console.log("Socket received new viewer (PeerJS ID):", viewerId);
      allJoinedViewers.add(viewerId); // Keep track for calling
      callViewer(viewerId);
    });

    socket.on("viewerDisconnected", ({ viewerId }) => { // viewerId is PeerJS ID
      if (!viewerId) return;
      console.log("Viewer (PeerJS ID) disconnected:", viewerId);
      allJoinedViewers.delete(viewerId);
      if (currentCalls[viewerId]) {
        currentCalls[viewerId].close();
        delete currentCalls[viewerId];
      }
      // Optional: Update viewer list if you maintain a separate list keyed by PeerJS ID for calls
    });

    socket.on("updateViewersList", (data) => { // data.viewers is [{username, canDraw}, ...]
      const viewers = data?.viewers || [];
      // Update local cache of permissions (though server is source of truth)
      viewers.forEach(viewer => {
        if (typeof viewer === 'object' && viewer.username) {
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
      window.location.href = "https://hoctap-9a3.glitch.me/live"; // Use config URL
    });
    socket.on("viewerBanned", (msg) => addChatMessage(msg, "system", "ban"));

    // Whiteboard specific events are handled by sharedWhiteboardInstance via its own socket listeners setup
    // The shared module will handle wb:draw, wb:clear, wb:initState etc.

    // Streamer-specific handling of whiteboard viewer requests or permissions
    socket.on("wb:viewerRequestState", ({ viewerSocketId }) => {
      if (sharedWhiteboardInstance) {
        const history = sharedWhiteboardInstance.getDrawingHistory();
        console.log(`Streamer sending whiteboard history (count: ${history.length}) to viewer ${viewerSocketId}`);
        socket.emit("wb:syncStateToViewer", {
          targetViewerId: viewerSocketId,
          history: history,
        });
      }
    });

    // --- Streamer Quiz Socket Listeners ---
    socket.on("quiz:newQuestion", ({ questionId }) => {
      // This is when the server confirms the question is active
      currentQuizQuestionIdStreamer = questionId;
      if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = false;
      if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = false; // Or true until answer shown?
      if (elements.endQuizBtn) elements.endQuizBtn.disabled = false;
      if (elements.startQuizBtn) elements.startQuizBtn.disabled = true; // Question is now active

      if (elements.quizStreamerStatus) {
        const qText = elements.quizQuestionText ? elements.quizQuestionText.value.trim() : "Câu hỏi";
        elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đang hỏi: "${qText.substring(0,50)}..." (ID: ${questionId.substring(0,6)})</p>`;
      }
       isQuizActiveStreamer = true; // Mark quiz as active from streamer's UI perspective
    });

    socket.on("quiz:resultsUpdate", ({ questionId, results }) => {
      if (elements.quizStreamerResults && questionId === currentQuizQuestionIdStreamer) {
        let resultsHtml = "<h4>Kết quả hiện tại:</h4><ul>";
        const options = quizOptionsStreamer.map(opt => opt.inputElement.value.trim());
        let totalVotes = 0;
        Object.values(results).forEach(count => totalVotes += (count || 0));

        for (const optionIndex in results) {
          const count = results[optionIndex] || 0;
          const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
          const optionText = options[optionIndex] || `Lựa chọn ${parseInt(optionIndex) + 1}`;
          resultsHtml += `<li>${optionText}: ${count} (${percentage}%)</li>`;
        }
        resultsHtml += `</ul><p>Tổng số phiếu: ${totalVotes}</p>`;
        elements.quizStreamerResults.innerHTML = resultsHtml;
      }
    });

    socket.on("quiz:correctAnswer", ({ questionId, correctAnswerIndex, results }) => {
      if (questionId === currentQuizQuestionIdStreamer) {
        if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
         if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = false; // Enable next after showing answer

        if (elements.quizStreamerStatus) {
          const qText = elements.quizQuestionText ? elements.quizQuestionText.value.trim() : "Câu hỏi";
          const options = quizOptionsStreamer.map(opt => opt.inputElement.value.trim());
          const correctOptText = options[correctAnswerIndex] || `Lựa chọn ${correctAnswerIndex + 1}`;
          elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đã hiển thị đáp án cho "${qText.substring(0,50)}...". Đáp án đúng: <strong>${correctOptText}</strong></p>`;
        }
        if (elements.quizStreamerResults) {
            let resultsHtml = "<h4>Kết quả cuối cùng:</h4><ul>";
            const options = quizOptionsStreamer.map(opt => opt.inputElement.value.trim());
            let totalVotes = 0;
            if (results) { // Ensure results is not undefined
                Object.values(results).forEach(count => totalVotes += (count || 0));
            }

            for (const optionIndex in results) {
                const count = results[optionIndex] || 0;
                const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
                const optionText = options[optionIndex] || `Lựa chọn ${parseInt(optionIndex) + 1}`;
                const isCorrect = parseInt(optionIndex) === correctAnswerIndex;
                resultsHtml += `<li ${isCorrect ? 'style="font-weight:bold; color:var(--success-color);"' : ''}>${optionText}: ${count} (${percentage}%) ${isCorrect ? ' (ĐÚNG)' : ''}</li>`;
            }
            resultsHtml += `</ul><p>Tổng số phiếu: ${totalVotes}</p>`;
            elements.quizStreamerResults.innerHTML = resultsHtml;
        }
      }
    });

    socket.on("quiz:ended", () => {
      isQuizActiveStreamer = false;
      resetQuizUIStreamer();
      if (elements.quizStreamerStatus) elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Trắc nghiệm đã kết thúc.</p>`;
      if (typeof showAlert === "function") showAlert("Phiên trắc nghiệm đã kết thúc.", "info", 3000);
    });

    socket.on("quiz:clearCurrent", () => { // Server confirms current Q is cleared, ready for new
      if (elements.quizStreamerStatus) elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chuẩn bị câu hỏi mới...</p>`;
      if (elements.quizStreamerResults) elements.quizStreamerResults.innerHTML = "";
      currentQuizQuestionIdStreamer = null;
      // UI for inputting new question is re-enabled by handleNextQuizQuestion or resetQuizUIStreamer
      // No, this event means the *server* cleared it. We should reset parts of UI.
      if (elements.quizQuestionText) elements.quizQuestionText.disabled = false;
      quizOptionsStreamer.forEach(opt => opt.inputElement.disabled = false);
      if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
      if (elements.quizCorrectAnswerSelect) elements.quizCorrectAnswerSelect.disabled = false;
      if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
      if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
      if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = true; // Await new question start
    });

    socket.on("quiz:error", (errorMessage) => {
      if (typeof showAlert === "function") showAlert(errorMessage, "error");
      // Re-enable start button if it was a start attempt that failed
      if (elements.startQuizBtn && elements.startQuizBtn.disabled && !isQuizActiveStreamer) {
        elements.startQuizBtn.disabled = false;
        if (elements.quizQuestionText) elements.quizQuestionText.disabled = false;
        quizOptionsStreamer.forEach(opt => { if (opt.inputElement) opt.inputElement.disabled = false; });
        if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
        if (elements.quizCorrectAnswerSelect) elements.quizCorrectAnswerSelect.disabled = false;
      }
    });
    socket.on("quiz:hostState", (quizState) => {
        console.log("Received host quiz state on rejoin:", quizState);
        if (quizState && quizState.isActive && quizState.currentQuestion) {
            isQuizActiveStreamer = true;
            currentQuizQuestionIdStreamer = quizState.currentQuestion.id;

            if (elements.quizQuestionText) elements.quizQuestionText.value = quizState.currentQuestion.text;
            
            if (elements.quizOptionsContainer) elements.quizOptionsContainer.innerHTML = "";
            quizOptionsStreamer = [];
            quizState.currentQuestion.options.forEach(optText => addQuizOptionInput(optText));
            updateQuizCorrectAnswerSelect();
            if (elements.quizCorrectAnswerSelect) elements.quizCorrectAnswerSelect.value = quizState.currentQuestion.correctAnswerIndex.toString();

            if (elements.startQuizBtn) elements.startQuizBtn.disabled = true;
            if (elements.quizQuestionText) elements.quizQuestionText.disabled = true;
            quizOptionsStreamer.forEach(opt => opt.inputElement.disabled = true);
            if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = true;
            if (elements.quizCorrectAnswerSelect) elements.quizCorrectAnswerSelect.disabled = true;


            if (quizState.showCorrectAnswer) {
                if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
                if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = false;
                // Display results if already shown
                 if (elements.quizStreamerResults && quizState.results && quizState.results[currentQuizQuestionIdStreamer]) {
                    socket.emit("quiz:resultsUpdate", { // Fake an update to re-render
                        questionId: currentQuizQuestionIdStreamer,
                        results: quizState.results[currentQuizQuestionIdStreamer]
                    });
                     // Then re-trigger correctAnswer display to get the "ĐÚNG" label
                     socket.emit("quiz:correctAnswer", {
                        questionId: currentQuizQuestionIdStreamer,
                        correctAnswerIndex: quizState.currentQuestion.correctAnswerIndex,
                        results: quizState.results[currentQuizQuestionIdStreamer]
                    });
                }

            } else {
                if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = false;
                if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = true;
                 if (elements.quizStreamerResults && quizState.results && quizState.results[currentQuizQuestionIdStreamer]) {
                    socket.emit("quiz:resultsUpdate", { // Fake an update to re-render
                        questionId: currentQuizQuestionIdStreamer,
                        results: quizState.results[currentQuizQuestionIdStreamer]
                    });
                }
            }
            if (elements.endQuizBtn) elements.endQuizBtn.disabled = false;
             if (elements.quizStreamerStatus) {
                const qText = quizState.currentQuestion.text;
                elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Đang hỏi: "${qText.substring(0,50)}..." (ID: ${currentQuizQuestionIdStreamer.substring(0,6)})</p>`;
            }

        } else {
            resetQuizUIStreamer(); // No active quiz on server for this room
        }
    });


  } // End initSocket

  // ==================================
  // PEERJS LOGIC
  // ==================================
  function initPeer() {
    try {
      const streamerPeerId = `${streamerConfig.roomId}_host_${streamerConfig.username
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 30)}`; // Sanitize and shorten
      console.log("Attempting to initialize PeerJS with ID:", streamerPeerId);

      peerInstance = new Peer(streamerPeerId, streamerConfig.peerConfig);

      peerInstance.on("open", (id) => {
        console.log("Streamer PeerJS connected with actual ID:", id);
        if (socket && socket.connected) {
          console.log(
            "PeerJS opened AND Socket connected. Emitting streamerReady."
          );
          socket.emit("streamerReady", {
            roomId: streamerConfig.roomId,
            peerId: id,
          });
        } else {
          console.warn(
            "PeerJS opened, but socket not yet connected for streamerReady."
          );
        }
      });

      peerInstance.on("error", (err) => {
        console.error("PeerJS Error:", err);
        let message = `Lỗi PeerJS: ${err.type}.`;
        if (err.type === "unavailable-id") {
          message += ` ID ${streamerPeerId} đã được sử dụng. Streamer khác có thể đang dùng phòng này. Vui lòng thử lại hoặc tạo phòng mới.`;
          // Force stop everything, as another streamer might be active.
          stopLocalStream();
          elements.shareScreenBtn.disabled = true;
          elements.liveCamBtn.disabled = true;
          elements.endStreamBtn.disabled = true;
        } else if (err.type === "peer-unavailable") {
          message += ` Không thể kết nối tới viewer. Họ có thể đã rời đi.`;
        } else if (err.type === "network") {
          message += ` Lỗi mạng khi kết nối PeerJS. Kiểm tra kết nối internet.`;
        } else if (err.type === "server-error") {
          message += ` Lỗi từ PeerJS server. Vui lòng thử lại sau.`;
        }

        if (typeof showAlert === "function") showAlert(message, "error", 10000);
        else alert(message);

        if (
          err.type === "disconnected" ||
          err.type === "network" ||
          err.type === "server-error"
        ) {
          console.warn("PeerJS connection issue, may need to re-initialize.");
        }
      });
      peerInstance.on("disconnected", () => {
        console.warn(
          "PeerJS client disconnected from the PeerServer. PeerJS will attempt to reconnect."
        );
        if (typeof showAlert === "function") showAlert("Mất kết nối PeerJS, đang thử kết nối lại...", "warning", 3000);
      });
      peerInstance.on("close", () => {
        console.log("PeerJS connection closed permanently.");
         if (typeof showAlert === "function") showAlert("Kết nối PeerJS đã đóng.", "info");
      });
      peerInstance.on("call", (call) => {
        console.warn(
          "Incoming call to streamer detected, which is unexpected. Rejecting call from:",
          call.peer
        );
        call.close();
      });
    } catch (error) {
      console.error("Failed to initialize PeerJS instance:", error);
      if (typeof showAlert === "function")
        showAlert(
          "Lỗi nghiêm trọng khi khởi tạo PeerJS. Không thể stream.",
          "error"
        );
      else alert("Lỗi nghiêm trọng khi khởi tạo PeerJS. Không thể stream.");
    }
  } // End initPeer

  // ==================================
  // SHARED WHITEBOARD INITIALIZATION & CALLBACKS
  // ==================================
  // playButtonFeedback function (already defined in streamer.js)
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
          particles: { /* ... */ },
          emitters: { /* ... */ },
        })
        .then((c) => setTimeout(() => c?.destroy(), 400));
    }
  }
  function initStreamerWhiteboard() {
    if (!elements.whiteboardCanvas || !socket) {
      console.error(
        "Cannot initialize streamer whiteboard: canvas or socket missing."
      );
      if (elements.toggleWhiteboardBtnStreamer) elements.toggleWhiteboardBtnStreamer.disabled = true;
      return;
    }

    const wbConfig = {
      canvasElement: elements.whiteboardCanvas,
      toolbarElements: {
        mainToolbar: elements.whiteboardToolbarMain,
        colorPicker: elements.wbColorPicker,
        lineWidthRange: elements.wbLineWidthRange,
        lineWidthValueDisplay: elements.wbLineWidthValueDisplay,
        eraserBtn: elements.wbEraserModeBtn,
        clearBtn: elements.wbClearBtn,
        panToolBtn: elements.wbPanToolBtn,
        zoomInBtn: elements.wbZoomInBtn,
        zoomOutBtn: elements.wbZoomOutBtn,
        resetViewBtn: elements.wbResetViewBtn,
        toggleGridBtn: elements.wbToggleGridBtn,
        shapeToolToggleBtn: elements.wbShapeToolToggleBtn,
        shapeOptionsContainer: elements.wbShapeOptionsContainer,
        rectShapeBtn: elements.wbDrawRectangleBtn,
        circleShapeBtn: elements.wbDrawCircleBtn,
        lineShapeBtn: elements.wbDrawLineBtn,
        selectToolToggleBtn: elements.wbSelectToolToggleBtn,
        snipOptionsContainer: elements.wbSnipModeOptionsContainer,
        rectangularSnipBtn: elements.wbRectangularSnipBtn,
        freedomSnipBtn: elements.wbFreedomSnipBtn,
        deleteSelectedBtn: elements.wbDeleteSelectedBtn,
        coordsDisplayElement: elements.streamerCoordsDisplay,
      },
      socket: socket,
      roomId: streamerConfig.roomId,
      username: streamerConfig.username,
      isStreamer: true,
      initialCanDraw: true, // Streamer can always draw
      showNotificationCallback: showAlert,
      confirmActionCallback: showStreamerConfirmation,
      playButtonFeedbackCallback: playButtonFeedback,
      onVisibilityChangeCallback: (isVisible) => {
        // Streamer's global toggle button UI update
        elements.toggleWhiteboardBtnStreamer?.classList.toggle(
          "active",
          isVisible
        );
        if (isVisible) {
            // Shared module handles showing the overlay via its own show()
        } else {
            // Shared module handles hiding
        }
      },
      getRoomOwnerUsername: () => streamerConfig.username, // Streamer is owner
    };

    sharedWhiteboardInstance = initializeSharedWhiteboard(wbConfig);

    if (sharedWhiteboardInstance) {
      console.log("Shared Whiteboard initialized for Streamer.");
      // Streamer decides initial global visibility (e.g., based on saved room state or default off)
      // For now, let's assume it starts off and streamer explicitly enables it.
      // sharedWhiteboardInstance.setGlobalVisibility(false); // Default to off
    } else {
      console.error("Failed to initialize Shared Whiteboard for Streamer.");
      if (elements.toggleWhiteboardBtnStreamer) elements.toggleWhiteboardBtnStreamer.disabled = true;
    }
  }

  // ==================================
  // PICTURE-IN-PICTURE CHAT LOGIC (Mostly unchanged, ensure elements are correct)
  // ==================================
  function initPipChatCanvas() {
    if (!elements.pipChatBtn) return;

    if (!pipChatCanvas) {
      pipChatCanvas = document.createElement("canvas");
    }
    pipChatCanvas.width = PIP_CANVAS_WIDTH;
    pipChatCanvas.height = PIP_CANVAS_HEIGHT;
    pipChatCtx = pipChatCanvas.getContext("2d");

    if (!pipChatCtx) {
      console.error("Failed to create 2D context for PiP chat canvas.");
      if (elements.pipChatBtn) {
        elements.pipChatBtn.disabled = true;
        elements.pipChatBtn.title = "Không thể tạo canvas cho PiP Chat.";
        elements.pipChatBtn.style.display = "none"; // Hide if not usable
      }
      return;
    }
    console.log("PiP Chat Canvas initialized.");
  }

  function drawPipChatFrame() {
    if (!isPipChatActive) {
      if (pipChatUpdateRequestId) {
        cancelAnimationFrame(pipChatUpdateRequestId);
        pipChatUpdateRequestId = null;
      }
      return;
    }
    pipChatUpdateRequestId = requestAnimationFrame(drawPipChatFrame);

    if (!pipChatNeedsUpdate || !pipChatCtx || !pipChatCanvas || !elements.chatMessagesList) {
      return;
    }
    pipChatNeedsUpdate = false;

    pipChatCtx.fillStyle = "rgba(15, 15, 30, 0.95)";
    pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);

    const messages = Array.from(elements.chatMessagesList.children).slice(-10);
    let currentY = PIP_CANVAS_HEIGHT - PIP_PADDING;
    pipChatCtx.textBaseline = "bottom";
    const FONT_FAMILY = "Inter, Arial, sans-serif";
    const MAX_WIDTH = PIP_CANVAS_WIDTH - 2 * PIP_PADDING;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break;
      const msgItem = messages[i];
      const usernameEl = msgItem.querySelector(".msg-username");
      const bodyEl = msgItem.querySelector(".msg-body");
      const timestampEl = msgItem.querySelector(".msg-timestamp");
      const username = usernameEl ? usernameEl.textContent.trim() : "System";
      const textContent = bodyEl ? (bodyEl.innerText || bodyEl.textContent).trim() : "";
      const timestamp = timestampEl ? timestampEl.textContent.trim() : "";
      let userColor = "#a0a0c0";
      if (msgItem.classList.contains("message-host")) userColor = "#8a7ffb";
      else if (msgItem.classList.contains("message-pro")) userColor = "#ffde7d";
      else if (msgItem.classList.contains("message-system")) userColor = "#8899bb";

      pipChatCtx.font = `${PIP_FONT_SIZE_MSG}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = "#e8eaf6";

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
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
              pipChatCtx.fillText(line.trim(), x, currentDrawY);
              currentDrawY -= lineHeight;
              line = words[n] + " ";
              linesDrawn++;
            } else {
              let lastLine = line.trim();
              while (pipChatCtx.measureText(lastLine + "...").width > maxWidth && lastLine.length > 0) {
                lastLine = lastLine.slice(0, -1);
              }
              if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
              pipChatCtx.fillText(lastLine + "...", x, currentDrawY);
              return currentDrawY - lineHeight;
            }
          } else {
            line = testLine;
          }
        }
        if (line.trim()) {
          if (currentDrawY < PIP_PADDING + lineHeight) return currentDrawY;
          pipChatCtx.fillText(line.trim(), x, currentDrawY);
          currentDrawY -= lineHeight;
        }
        return currentDrawY;
      };

      currentY = drawWrappedText(textContent, PIP_PADDING, currentY, PIP_LINE_HEIGHT, MAX_WIDTH);
      if (currentY < PIP_PADDING + PIP_LINE_HEIGHT) break;

      pipChatCtx.font = `bold ${PIP_FONT_SIZE_USER}px ${FONT_FAMILY}`;
      pipChatCtx.fillStyle = userColor;
      const userLine = `${username} ${timestamp ? `(${timestamp})` : ""}`;
      pipChatCtx.fillText(userLine, PIP_PADDING, currentY, MAX_WIDTH);
      currentY -= PIP_LINE_HEIGHT + 4;
    }
  }

  async function togglePipChat() {
    if (!elements.pipChatBtn || !elements.pipChatVideoPlayer || !pipChatCanvas || !pipChatCtx) {
      console.error("PiP Chat: Prerequisites not met.");
      if (elements.pipChatBtn) elements.pipChatBtn.disabled = true;
      return;
    }

    const pipVideo = elements.pipChatVideoPlayer;

    if (document.pictureInPictureElement === pipVideo) {
      try {
        await document.exitPictureInPicture();
      } catch (error) {
        console.error("PiP Chat: Lỗi khi thoát PiP:", error);
      }
    } else {
      const handlePipFailure = (errorMessage = "Không thể vào chế độ PiP cho chat.") => {
        showAlert(errorMessage, "error", 5000);
        if (pipChatStream && pipChatStream.active) {
          pipChatStream.getTracks().forEach(track => track.stop());
        }
        pipChatStream = null;
        isPipChatActive = false;
        if (pipChatUpdateRequestId) {
          cancelAnimationFrame(pipChatUpdateRequestId);
          pipChatUpdateRequestId = null;
        }
        if (elements.pipChatBtn) {
          elements.pipChatBtn.classList.remove("active");
          elements.pipChatBtn.innerHTML = '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
        }
        pipVideo.removeEventListener("loadedmetadata", onCanPlayOrError);
        pipVideo.removeEventListener("canplay", onCanPlayOrError);
        pipVideo.removeEventListener("error", onCanPlayOrError);
      };

      const enterPiPWhenReady = async () => {
        try {
          if (pipVideo.error) {
            handlePipFailure("Lỗi video player khi chuẩn bị PiP.");
            return;
          }
          if (pipVideo.paused) await pipVideo.play();
          await pipVideo.requestPictureInPicture();
        } catch (error) {
          let userMessage = `Không thể vào PiP: ${error.message}`;
          if (error.name === "NotAllowedError") userMessage = "Yêu cầu vào PiP bị từ chối. Hãy đảm bảo bạn đã tương tác với trang.";
          else if (error.name === "SecurityError") userMessage = "Không thể vào PiP do giới hạn bảo mật.";
          else if (error.name === "InvalidStateError") userMessage = "Video cho PiP đang ở trạng thái không hợp lệ.";
          handlePipFailure(userMessage);
        }
      };

      const onCanPlayOrError = async (event) => {
        pipVideo.removeEventListener("loadedmetadata", onCanPlayOrError);
        pipVideo.removeEventListener("canplay", onCanPlayOrError);
        pipVideo.removeEventListener("error", onCanPlayOrError);
        if (event.type === "error" || pipVideo.error) {
          handlePipFailure("Lỗi khi tải dữ liệu video cho PiP.");
        } else {
          await enterPiPWhenReady();
        }
      };

      try {
        if (!pipChatStream || !pipChatStream.active || pipChatStream.getVideoTracks().length === 0) {
          if (pipChatStream && pipChatStream.active) pipChatStream.getTracks().forEach(track => track.stop());
          pipChatCtx.fillStyle = "rgba(15, 15, 30, 0.95)"; // Initial clear
          pipChatCtx.fillRect(0, 0, pipChatCanvas.width, pipChatCanvas.height);
          pipChatStream = pipChatCanvas.captureStream(25); // FPS
          if (!pipChatStream || pipChatStream.getVideoTracks().length === 0) {
            handlePipFailure("Không thể tạo stream từ canvas (không có video track).");
            return;
          }
        }

        if (pipVideo.srcObject !== pipChatStream) {
          pipVideo.srcObject = pipChatStream;
        }
        
        pipVideo.addEventListener("loadedmetadata", onCanPlayOrError);
        pipVideo.addEventListener("canplay", onCanPlayOrError);
        pipVideo.addEventListener("error", onCanPlayOrError);

        if (pipVideo.readyState < HTMLMediaElement.HAVE_METADATA || pipVideo.srcObject !== pipChatStream) {
             pipVideo.load(); // Important if srcObject was just set or video is in initial state
        } else if (pipVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            // If already has data, try to enter PiP immediately
            pipVideo.removeEventListener("loadedmetadata", onCanPlayOrError);
            pipVideo.removeEventListener("canplay", onCanPlayOrError);
            pipVideo.removeEventListener("error", onCanPlayOrError);
            await enterPiPWhenReady();
        }
      } catch (error) {
        handlePipFailure(`Lỗi chuẩn bị PiP: ${error.message}`);
      }
    }
  }


  // ==================================
  // STREAMING & UI LOGIC (Mostly unchanged, PeerJS parts are key)
  // ==================================
  function callViewer(viewerId) {
    if (!localStream || !peerInstance || !viewerId || peerInstance.disconnected || peerInstance.destroyed) {
      console.warn(`Cannot call viewer ${viewerId}. Stream (${!!localStream}), PeerJS ready (${!!peerInstance && !peerInstance.disconnected && !peerInstance.destroyed})`);
      if (viewerId && !pendingViewers.includes(viewerId)) pendingViewers.push(viewerId);
      return;
    }
    if (currentCalls[viewerId]) {
      console.log(`Closing existing call before re-calling ${viewerId}`);
      currentCalls[viewerId].close();
      delete currentCalls[viewerId];
    }
    console.log(`Calling viewer: ${viewerId} with stream:`, localStream.id);
    try {
      if (localStream.getTracks().length === 0) {
        console.warn("Call attempt with empty stream tracks.");
        return;
      }
      const call = peerInstance.call(viewerId, localStream);
      if (!call) {
        console.error(`peerInstance.call to ${viewerId} returned undefined/null.`);
        return;
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
      // Streamer usually doesn't expect a stream back from a simple viewer
      call.on("stream", (remoteStream) => {
        console.log(`Received stream from viewer ${viewerId}? (Unexpected for simple viewer)`);
        // Handle if two-way video is ever a feature for specific viewers
      });
    } catch (error) {
      console.error(`Failed call to ${viewerId}:`, error);
      delete currentCalls[viewerId]; // Clean up if call setup failed
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
    // Notify viewers that stream ended
    if (socket && socket.connected) {
        socket.emit("streamEnded", { roomId: streamerConfig.roomId });
    }
  }

  function updateUIStreamStarted(mode) {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.add("streaming");
    elements.streamStatusIndicator.textContent = mode === "liveCam" ? "LIVE CAM" : "SHARING SCREEN";
    elements.streamStatusIndicator.className = "stream-status-indicator active";
    if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = "none";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.toggle("active", mode === "screenShare");
      elements.shareScreenBtn.disabled = mode === "liveCam";
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.toggle("active", mode === "liveCam");
      elements.liveCamBtn.innerHTML = mode === "liveCam"
        ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>'
        : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
      elements.liveCamBtn.disabled = mode === "screenShare";
    }
    checkMediaPermissions(); // Update mic button state too
  }

  function updateUIStreamStopped() {
    if (!elements.previewContainer) return;
    elements.previewContainer.classList.remove("streaming");
    elements.streamStatusIndicator.textContent = "OFF AIR";
    elements.streamStatusIndicator.className = "stream-status-indicator";
    if (elements.previewVideo) elements.previewVideo.srcObject = null;
    if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = "flex";
    if (elements.shareScreenBtn) {
      elements.shareScreenBtn.classList.remove("active");
      elements.shareScreenBtn.disabled = false;
    }
    if (elements.liveCamBtn) {
      elements.liveCamBtn.classList.remove("active");
      elements.liveCamBtn.disabled = false;
      elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
    }
    if (elements.toggleMicBtn) {
      elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
      elements.toggleMicBtn.classList.add("active"); // Default to on appearance
      elements.toggleMicBtn.disabled = true; // Disabled because no stream
      isMicEnabled = true; // Reset state
    }
    checkMediaPermissions(); // Refresh all media button states
  }

  async function startScreenShare() {
    if (currentMode === "screenShare") {
      console.log("Already screen sharing.");
      return;
    }
    stopLocalStream(); // Stop any existing stream first
    console.log("Starting screen share...");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, cursor: "always" },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }, // Request system audio
      });

      let combinedAudioTracks = [];
      let micObtained = false;

      // Try to get microphone audio
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        micStream.getAudioTracks().forEach(track => combinedAudioTracks.push(track));
        micObtained = true;
        console.log("Microphone audio obtained for screen share.");
      } catch (micErr) {
        console.warn("Could not get microphone for screen share:", micErr.name, micErr.message);
        if (typeof showAlert === "function") showAlert("Không thể lấy âm thanh micro. Chia sẻ màn hình sẽ không có tiếng nói của bạn.", "warning");
      }

      // Add system audio from displayStream if available and not redundant
      displayStream.getAudioTracks().forEach(displayAudioTrack => {
        if (!micObtained || !combinedAudioTracks.some(micTrack => micTrack.label === displayAudioTrack.label && micTrack.kind === displayAudioTrack.kind)) {
             // A more robust check might involve comparing track settings if labels are unreliable
            combinedAudioTracks.push(displayAudioTrack);
            console.log("System audio track added to screen share.");
        } else {
            console.log("System audio track seems redundant with microphone, not adding.");
            displayAudioTrack.stop(); // Stop the redundant track from displayStream
        }
      });

      localStream = new MediaStream([...displayStream.getVideoTracks(), ...combinedAudioTracks]);

      if (elements.previewVideo) {
        elements.previewVideo.srcObject = localStream;
        elements.previewVideo.muted = true; // Mute local preview to avoid feedback
      } else {
        console.error("Preview video element missing!");
      }
      currentMode = "screenShare";
      updateUIStreamStarted(currentMode);

      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Screen share ended by user (e.g., 'Stop sharing' button in browser UI).");
        stopLocalStream(); // This will also emit streamEnded to server
      });
      
      callPendingViewers(); // Call anyone who joined while no stream was active
      allJoinedViewers.forEach(viewerId => callViewer(viewerId)); // Call all currently known viewers

    } catch (err) {
      console.error("Screen share error:", err);
      showAlert("Không thể chia sẻ màn hình: " + err.message, "error");
      stopLocalStream(); // Clean up
    }
  }

  async function startLiveCam() {
    if (currentMode === "liveCam") { // If live cam is already active, this button now means "Stop Cam"
      stopLocalStream();
      // Server notification handled by stopLocalStream's call to socket.emit("streamEnded",...)
      return;
    }
    stopLocalStream(); // Stop any existing stream (like screen share)
    console.log("Starting live cam...");
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: {ideal: 30} },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      localStream = camStream;
      isMicEnabled = localStream.getAudioTracks().length > 0 && localStream.getAudioTracks()[0].enabled;
      currentMode = "liveCam";
      if (elements.previewVideo) {
          elements.previewVideo.srcObject = localStream;
          elements.previewVideo.muted = true; // Mute local preview
      }
      updateUIStreamStarted(currentMode);

      localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        console.log("Live cam ended (e.g., camera unplugged or permissions revoked).");
        stopLocalStream(); // This also notifies server
      });
      
      callPendingViewers();
      allJoinedViewers.forEach(viewerId => callViewer(viewerId));

    } catch (err) {
      console.error("Live cam error:", err);
      showAlert("Không thể bật camera/mic: " + err.message, "error");
      stopLocalStream(); // Clean up
      updateUIStreamStopped(); // Ensure UI reflects stop
    }
  }
  function toggleMicrophone() {
    if (!localStream) {
      console.warn("No local stream to toggle mic.");
      if (elements.toggleMicBtn) elements.toggleMicBtn.disabled = true;
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("Stream has no audio track to toggle.");
      if (elements.toggleMicBtn) elements.toggleMicBtn.disabled = true;
      // Optionally, try to acquire mic if current stream is video-only screen share
      // This is complex, better to re-initiate stream with audio.
      return;
    }
    isMicEnabled = !isMicEnabled;
    audioTracks.forEach(track => {
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
    let hasMic = false, hasCam = false, canShareScreen = false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      hasMic = devices.some(device => device.kind === 'audioinput' && device.deviceId);
      hasCam = devices.some(device => device.kind === 'videoinput' && device.deviceId);
    } catch (e) { console.error("Error enumerating devices:", e); }
    canShareScreen = typeof navigator.mediaDevices.getDisplayMedia === 'function';

    if (elements.toggleMicBtn) {
        elements.toggleMicBtn.disabled = !hasMic || !localStream || localStream.getAudioTracks().length === 0;
        if (!hasMic) {
            elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
            elements.toggleMicBtn.classList.remove("active");
        } else if (localStream && localStream.getAudioTracks().length > 0) {
            // isMicEnabled should be the source of truth if stream exists
            elements.toggleMicBtn.classList.toggle("active", isMicEnabled);
            elements.toggleMicBtn.innerHTML = isMicEnabled
                ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
                : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
        } else { // Has mic, but no stream yet or stream has no audio
            elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
            elements.toggleMicBtn.classList.add("active"); // Default to 'on' appearance before stream
            elements.toggleMicBtn.disabled = true; // Can't toggle if no stream with audio
        }
    }

    if (elements.liveCamBtn) {
        elements.liveCamBtn.disabled = !hasCam || currentMode === "screenShare";
        if (!hasCam) {
            elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>';
        } else {
             // Text changes based on whether cam is active
            elements.liveCamBtn.innerHTML = currentMode === "liveCam"
                ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>'
                : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
        }
    }

    if (elements.shareScreenBtn) {
        elements.shareScreenBtn.disabled = !canShareScreen || currentMode === "liveCam";
        if (!canShareScreen) {
            elements.shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>';
        } else {
            // Text changes based on whether screen share is active
            elements.shareScreenBtn.innerHTML = currentMode === "screenShare"
                 ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Share</span>' // Assuming screen share btn also stops it
                 : '<i class="fas fa-desktop"></i><span class="btn-label">Share MH</span>';

        }
    }
    return { hasMic, hasCam, canShareScreen };
  }

  function callPendingViewers() {
    if (!localStream || localStream.getTracks().length === 0) {
      console.warn("Skipping pending viewers call, no active local stream.");
      // Do not clear pendingViewers here, they should be called when stream becomes available
      return;
    }
    console.log(`Calling ${pendingViewers.length} pending viewers...`);
    const viewersToCallNow = [...pendingViewers];
    pendingViewers = []; // Clear the list of those we are attempting to call now
    
    viewersToCallNow.forEach(viewerId => {
      if (allJoinedViewers.has(viewerId)) { // Ensure they haven't disconnected in the meantime
        callViewer(viewerId);
      } else {
        console.log(`Skipping call to pending viewer ${viewerId} as they are no longer in allJoinedViewers list.`);
      }
    });
  }

  // ==================================
  // CHAT & UI FUNCTIONS (Mostly Unchanged)
  // ==================================
  function scrollChatToBottom() {
    const chatMessagesContainer = elements.chatMessagesList?.parentNode;
    if (chatMessagesContainer) {
      setTimeout(() => {
        const scrollThreshold = 50;
        const isScrolledUp =
          chatMessagesContainer.scrollHeight -
            chatMessagesContainer.scrollTop -
            chatMessagesContainer.clientHeight >
          scrollThreshold;
        if (!isScrolledUp) {
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
      }, 50);
    }
  }

  function addChatMessage(
    content,
    type = "guest",
    username = "System",
    timestamp = new Date(),
    originalMessage = null // Keep original message for pinning/banning
  ) {
    const li = document.createElement("li");
    li.className = `chat-message-item message-${type}`;

    const iconSpan = document.createElement("span");
    iconSpan.className = "msg-icon";
    let iconClass = "fa-user";
    if (type === "host") iconClass = "fa-star";
    else if (type === "pro") iconClass = "fa-crown"; // Changed from fa-check-circle
    else if (type === "system" || type === "join") iconClass = "fa-info-circle";
    else if (type === "left") iconClass = "fa-sign-out-alt";
    else if (type === "ban") iconClass = "fa-user-slash"; // Changed from fa-gavel
    iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`;
    li.appendChild(iconSpan);

    const contentContainer = document.createElement("div");
    contentContainer.className = "msg-content-container";

    const msgHeader = document.createElement("div");
    msgHeader.className = "msg-header";
    const userSpan = document.createElement("span");
    userSpan.className = "msg-username";
    userSpan.textContent = username;
    msgHeader.appendChild(userSpan);
    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-timestamp";
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    msgHeader.appendChild(timeSpan);
    contentContainer.appendChild(msgHeader);

    const bodySpan = document.createElement("span");
    bodySpan.className = "msg-body prose-styling"; // Ensure prose-styling for tailwind/typography if used
    let finalHtml = content || "";
    if (type !== "system" && typeof marked !== "undefined" && typeof katex !== "undefined") {
      try {
        finalHtml = marked.parse(content || ""); // Ensure content is not null
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = finalHtml;
        renderMathInElement(tempDiv, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
        });
        finalHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in chat:", e);
        // finalHtml remains original content
      }
    }
    bodySpan.innerHTML = finalHtml;
    contentContainer.appendChild(bodySpan);
    li.appendChild(contentContainer);

    // Message Actions (Pin, Ban) for Streamer
    if (streamerConfig.username === streamerConfig.roomOwner && type !== "system" && originalMessage) {
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "msg-actions";

      const pinBtn = document.createElement("button");
      pinBtn.className = "action-btn pin-btn";
      pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
      pinBtn.title = "Ghim tin nhắn";
      pinBtn.onclick = () => {
        if (!socket) return;
        playButtonFeedback(pinBtn);
        socket.emit("pinComment", { roomId: streamerConfig.roomId, message: originalMessage });
      };
      actionsDiv.appendChild(pinBtn);

      if (username !== streamerConfig.username) { // Don't show ban for self
        const banBtn = document.createElement("button");
        banBtn.className = "action-btn ban-user-btn";
        banBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
        banBtn.title = `Chặn ${username}`;
        banBtn.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(banBtn);
          const confirmed = await showStreamerConfirmation(
            `Bạn có chắc muốn chặn ${username} khỏi phòng chat?`,
            "Chặn", "Hủy", "fas fa-user-slash"
          );
          if (confirmed) {
            socket.emit("banViewer", { roomId: streamerConfig.roomId, viewerUsername: username });
          }
        };
        actionsDiv.appendChild(banBtn);
      }
      li.appendChild(actionsDiv);
    }


    if (!prefersReducedMotion) {
      gsap.from(li, { duration: 0.5, autoAlpha: 0, y: 15, ease: "power2.out" });
    } else {
      gsap.set(li, { autoAlpha: 1 });
    }

    elements.chatMessagesList.appendChild(li);
    scrollChatToBottom();

    if (isPipChatActive) {
      pipChatNeedsUpdate = true;
    }
  }

  function displayPinnedComment(message) {
    const container = elements.pinnedCommentContainer;
    if (!container) return;

    const existingBox = container.querySelector(".pinned-box");
    const targetHeight = message && message.content ? "auto" : 0;
    const targetOpacity = message && message.content ? 1 : 0;

    // Animation handling
    if (existingBox && (!message || !message.content)) { // Unpinning
        if (!prefersReducedMotion) {
            gsap.to(existingBox, { duration: 0.3, height: 0, autoAlpha: 0, paddingTop: 0, paddingBottom:0, marginTop:0, marginBottom:0, ease: "power1.in", onComplete: () => existingBox.remove() });
        } else {
            existingBox.remove();
        }
         container.classList.remove("has-content");
    } else if (message && message.content) { // Pinning or updating
        let pinnedBox = existingBox;
        if (!pinnedBox) {
            pinnedBox = document.createElement("div");
            pinnedBox.className = "pinned-box";
            container.appendChild(pinnedBox);
        }
        container.classList.add("has-content");

        let contentHtml = message.content || "";
        if (typeof marked !== "undefined" && typeof katex !== "undefined") {
            try {
                contentHtml = marked.parse(contentHtml);
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = contentHtml;
                renderMathInElement(tempDiv, { /* ... KaTeX options ... */ throwOnError: false });
                contentHtml = tempDiv.innerHTML;
            } catch (e) { console.error("Marked/Katex Error in pinned comment:", e); }
        }

        pinnedBox.innerHTML = `
            <span class="pin-icon"><i class="fas fa-thumbtack"></i></span>
            <div class="pinned-content">
                <span class="pinned-user">${message.username || "Host"}</span>
                <span class="pinned-text prose-styling">${contentHtml}</span>
            </div>
            <span class="pinned-timestamp">${new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            ${streamerConfig.username === streamerConfig.roomOwner ? '<button class="unpin-btn" title="Bỏ ghim"><i class="fas fa-times"></i></button>' : ""}
        `;

        const unpinBtn = pinnedBox.querySelector(".unpin-btn");
        unpinBtn?.addEventListener("click", () => {
            if (!socket) return;
            playButtonFeedback(unpinBtn);
            socket.emit("unpinComment", { roomId: streamerConfig.roomId });
        });

        if (!existingBox && !prefersReducedMotion) { // Animate if newly created
            gsap.set(container, { height: 0, autoAlpha:0, paddingTop:0, paddingBottom:0, marginTop:0, marginBottom:0 });
            gsap.to(container, {duration: 0.4, height: "auto", autoAlpha:1, paddingTop:10, paddingBottom:10, marginTop:5, marginBottom:5, ease: "power1.out"}); // Use specific padding/margin values from CSS
            gsap.from(pinnedBox, { duration: 0.5, y: -10, autoAlpha: 0, ease: "power2.out", delay: 0.1});
        } else if (existingBox && !prefersReducedMotion) { // Content updated, animate height if necessary
            gsap.to(container, {duration: 0.3, height: "auto", ease: "power1.inOut"});
        } else if (existingBox) { // Reduced motion update
             container.style.height = "auto";
        }

    } else { // No message and no existing box
        container.innerHTML = "";
        container.classList.remove("has-content");
        gsap.set(container, { height: 0, autoAlpha:0, padding:0, margin:0 });
    }
}


  function sendChatMessage() {
    if (!socket || !socket.connected) {
      console.error("Socket not initialized or not connected.");
      showAlert("Lỗi kết nối khi gửi tin nhắn.", "error");
      return;
    }
    const messageContent = elements.chatInputArea.value.trim();
    if (!messageContent) return;

    const messageType = "host"; // Streamer is always host type
    const messageObj = {
      username: streamerConfig.username,
      content: messageContent,
      messageType: messageType,
      timestamp: new Date().toISOString(),
    };
    socket.emit("chatMessage", { roomId: streamerConfig.roomId, message: messageObj });
    elements.chatInputArea.value = "";
    elements.chatPreview.innerHTML = ""; // Clear preview
    elements.chatInputArea.style.height = "auto"; // Reset textarea height
  }

  function openModal(modalElement) {
    if (!modalElement) return;
    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));

    document.body.style.overflow = "hidden"; // Prevent background scroll

    if (!prefersReducedMotion) {
      gsap.set(modalElement, { display: "flex", autoAlpha: 0 });
      gsap.set(modalElement.querySelector(".modal-content"), { y: -30, scale: 0.95, autoAlpha: 0 });
      gsap.timeline()
        .to(modalElement, { duration: 0.4, autoAlpha: 1, ease: "power2.out" })
        .to(modalElement.querySelector(".modal-content"), {
            duration: 0.5, y: 0, scale: 1, autoAlpha: 1, ease: "back.out(1.4)"
          }, "-=0.3");
    } else {
      gsap.set(modalElement, { display: "flex", autoAlpha: 1 });
      gsap.set(modalElement.querySelector(".modal-content"), { y: 0, scale: 1, autoAlpha: 1 });
    }
  }

  function closeModal(modalElement) {
    if (!modalElement || gsap.getProperty(modalElement, "autoAlpha") === 0) return;

    gsap.killTweensOf(modalElement);
    gsap.killTweensOf(modalElement.querySelector(".modal-content"));

    const onComplete = () => {
        gsap.set(modalElement, { display: "none" });
        // Only restore body scroll if no other modals are open
        if (!document.querySelector('.modal-v2[style*="display: flex"]')) {
            document.body.style.overflow = "";
        }
    };

    if (!prefersReducedMotion) {
      gsap.timeline({ onComplete })
        .to(modalElement.querySelector(".modal-content"), {
            duration: 0.3, scale: 0.9, y: -10, autoAlpha: 0, ease: "power1.in"
          })
        .to(modalElement, { duration: 0.4, autoAlpha: 0, ease: "power1.in" }, "-=0.2");
    } else {
      gsap.set(modalElement, { display: "none", autoAlpha: 0 });
      onComplete();
    }
  }

  function renderListModal(listElement, items, isBannedList) {
    if (!listElement) return;
    listElement.innerHTML = ""; // Clear previous items

    if (!items || items.length === 0) {
      listElement.innerHTML = `<li class="user-list-item empty">${isBannedList ? "Không có ai bị chặn." : "Chưa có người xem."}</li>`;
      return;
    }

    const viewersArray = items.map(item => (typeof item === 'string' ? { username: item, canDraw: false } : item));

    viewersArray.forEach(viewer => {
      const viewerUsername = viewer.username;
      // Fetch current permission from local cache, which should be updated by server
      const currentCanDraw = viewerDrawPermissions[viewerUsername] || viewer.canDraw || false;

      const listItem = document.createElement("li");
      listItem.className = "user-list-item";

      const usernameSpan = document.createElement("span");
      usernameSpan.className = "list-username";
      usernameSpan.textContent = viewerUsername;

      // Show draw icon if applicable
      if (!isBannedList && currentCanDraw) {
        const drawIcon = document.createElement("i");
        drawIcon.className = "fas fa-paint-brush fa-xs"; // Using Font Awesome
        drawIcon.title = "Đang có quyền vẽ";
        drawIcon.style.marginLeft = "8px";
        drawIcon.style.color = "var(--success-color)"; // Use CSS variable
        usernameSpan.appendChild(drawIcon);
      }
      listItem.appendChild(usernameSpan);

      const actionsWrapper = document.createElement("div");
      actionsWrapper.className = "list-actions";

      if (isBannedList) {
        const unbanButton = document.createElement("button");
        unbanButton.className = "action-btn unban-btn control-btn"; // Re-use control-btn for styling
        unbanButton.innerHTML = '<i class="fas fa-undo"></i> Bỏ chặn';
        unbanButton.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(unbanButton);
          const confirmed = await showStreamerConfirmation(
            `Bỏ chặn ${viewerUsername}?`, "Bỏ chặn", "Hủy", "fas fa-undo"
          );
          if (confirmed) socket.emit("unbanViewer", { roomId: streamerConfig.roomId, viewerUsername });
        };
        actionsWrapper.appendChild(unbanButton);
      } else if (viewerUsername !== streamerConfig.username) { // Streamer can't ban/perm self
        const banButton = document.createElement("button");
        banButton.className = "action-btn ban-btn control-btn";
        banButton.innerHTML = '<i class="fas fa-user-slash"></i> Chặn';
        banButton.onclick = async () => {
          if (!socket) return;
          playButtonFeedback(banButton);
          const confirmed = await showStreamerConfirmation(
            `Chặn ${viewerUsername}?`, "Chặn", "Hủy", "fas fa-user-slash"
          );
          if (confirmed) socket.emit("banViewer", { roomId: streamerConfig.roomId, viewerUsername });
        };
        actionsWrapper.appendChild(banButton);

        // Whiteboard Draw Permission Button
        const drawPermButton = document.createElement("button");
        drawPermButton.className = `action-btn draw-perm-btn control-btn ${currentCanDraw ? "active" : ""}`;
        drawPermButton.innerHTML = currentCanDraw ? '<i class="fas fa-paint-brush"></i> Thu hồi Vẽ' : '<i class="far fa-paint-brush"></i> Cho Vẽ';
        drawPermButton.title = currentCanDraw ? "Thu hồi quyền vẽ của người này" : "Cho phép người này vẽ";
        drawPermButton.onclick = () => {
            if (!socket || !sharedWhiteboardInstance) return;
            playButtonFeedback(drawPermButton);
            const newPermission = !currentCanDraw;
            // Use the sharedWhiteboardInstance method to manage permission
            sharedWhiteboardInstance.setViewerDrawPermission(viewerUsername, newPermission);
        };
        actionsWrapper.appendChild(drawPermButton);
      }
      listItem.appendChild(actionsWrapper);
      listElement.appendChild(listItem);
    });

    // Animate new list items if modal is visible
    if (!prefersReducedMotion && listElement.closest('.modal-v2[style*="display: flex"]')) {
        gsap.from(listElement.children, {
            duration: 0.4, autoAlpha: 0, y: 10, stagger: 0.05, ease: "power1.out"
        });
    }
  }

  async function showStreamerConfirmation(message, confirmText = "Xác nhận", cancelText = "Hủy bỏ", iconClass = "fas fa-question-circle") {
    // Ensure showArtisticConfirm is available (loaded by index.ejs or similar)
    if (typeof showArtisticConfirm === "function") {
      return await showArtisticConfirm(message, confirmText, cancelText, iconClass);
    }
    console.warn("showArtisticConfirm not found, using window.confirm as fallback.");
    return new Promise((resolve) => {
      resolve(window.confirm(message)); // Fallback
    });
  }

  function updateStreamDuration() {
    if (!elements.streamDuration) return;
    const now = new Date();
    const diffMs = now - streamStartTime; // streamStartTime should be a Date object
    if (diffMs < 0) return; // Avoid issues if clock is weird

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    elements.streamDuration.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function initAnimations() {
    const initialPanelContentHeight = elements.panelContent ? (elements.controlPanel?.classList.contains('collapsed') ? 0 : "auto") : 0;
    const initialPanelContentAlpha = elements.panelContent ? (elements.controlPanel?.classList.contains('collapsed') ? 0 : 1) : 0;
    const initialPanelContentPadding = elements.panelContent ? (elements.controlPanel?.classList.contains('collapsed') ? 0 : 20) : 0;

    if (elements.panelContent) {
        gsap.set(elements.panelContent, {
            height: initialPanelContentHeight,
            autoAlpha: initialPanelContentAlpha,
            paddingTop: initialPanelContentPadding,
            paddingBottom: initialPanelContentPadding,
            marginTop: 0,
        });
    }
    if (elements.controlButtons) {
        gsap.set(elements.controlButtons, { autoAlpha: elements.controlPanel?.classList.contains('collapsed') ? 0 : 1 });
    }

    if (prefersReducedMotion) {
      gsap.set("[data-animate], .streamer-main-header, .streamer-sidebar, .streamer-chat-area, .panel-header h3, .control-btn", { autoAlpha: 1 });
      if (elements.panelContent) {
        elements.panelContent.style.display = elements.controlPanel?.classList.contains('collapsed') ? "none" : "block";
      }
      if (!elements.controlPanel?.classList.contains('collapsed') && elements.controlButtons) {
        gsap.set(elements.controlButtons, { autoAlpha: 1 });
      }
      initBackgroundParticles(); // Call even with reduced motion if it's subtle
      return;
    }

    const tl = gsap.timeline({ delay: 0.2 });
    tl.from(elements.header, { duration: 0.8, y: -80, autoAlpha: 0, ease: "power3.out" })
      .from(elements.sidebar, { duration: 0.9, x: -100, autoAlpha: 0, ease: "power3.out" }, "-=0.5")
      .from(elements.chatArea, { duration: 0.9, x: 100, autoAlpha: 0, ease: "power3.out" }, "<");

    if (elements.panelInternalHeader) {
      tl.from(elements.panelInternalHeader, { duration: 0.5, y: -15, autoAlpha: 0, ease: "power2.out" }, "-=0.3");
    }

    if (!elements.controlPanel?.classList.contains('collapsed') && elements.controlButtons && elements.controlButtons.length > 0) {
        gsap.from(elements.controlButtons, {
            duration: 0.6, y: 20, autoAlpha: 0, stagger: 0.06, ease: "power2.out", delay: tl.duration() - 0.4 // Adjust timing
        });
    }
    // Animate chat area contents if needed, excluding pinned comment which has its own animation
    // tl.from(".chat-container-v2 > *:not(#pinnedCommentV2)", { /* ... */ }, "-=0.5");
    initBackgroundParticles();
  }

  function initBackgroundParticles() {
    if (prefersReducedMotion && streamerConfig.reduceMotionParticles) return; // Allow disabling even if reducedMotion is off globally
    const particlesContainer = document.getElementById("streamer-particles-bg"); // Correct ID
    if (!particlesContainer) return;

    tsParticles.load("streamer-particles-bg", { // Use correct ID
        fpsLimit: prefersReducedMotion ? 30 : 60,
        particles: {
            number: { value: prefersReducedMotion ? 20 : 50, density: { enable: true, area: 900 } },
            color: { value: ["#FFFFFF", "#aaaacc", "#ccaaff", "#f0e68c"] }, // From streamer.css
            shape: { type: "circle" },
            opacity: { value: {min: 0.05, max: 0.2}, animation: { enable: !prefersReducedMotion, speed: 0.4, minimumValue: 0.05 } },
            size: { value: {min: 0.5, max: 1.5} },
            links: { enable: false },
            move: {
                enable: true,
                speed: prefersReducedMotion ? 0.1 : 0.3,
                direction: "none",
                random: true,
                straight: false,
                outModes: { default: "out" },
            },
        },
        interactivity: { enabled: false }, // Keep interactivity off for background
        background: { color: "transparent" },
    }).catch(error => console.error("tsParticles background error:", error));
  }

  function playButtonFeedback(button) {
    if (!button || prefersReducedMotion) return;
    gsap.timeline()
        .to(button, { scale: 0.92, duration: 0.1, ease: "power1.in" })
        .to(button, { scale: 1, duration: 0.35, ease: "elastic.out(1, 0.5)" });
    // Confetti might be too much for every button, use sparingly or make it conditional
  }

  // --- Quiz UI Functions ---
  function addQuizOptionInput(optionText = "") {
    if (!elements.quizOptionsContainer || !elements.quizCorrectAnswerSelect) return;
    if (quizOptionsStreamer.length >= 6) {
      if (typeof showAlert === "function") showAlert("Tối đa 6 lựa chọn cho một câu hỏi.", "warning");
      return;
    }

    const optionId = `quizOption_${Date.now()}_${quizOptionsStreamer.length}`;
    const wrapper = document.createElement("div");
    wrapper.className = "quiz-option-input-wrapper"; // Use class from streamer.css
    // Styles are in streamer.css, no need for inline styles unless overriding

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Lựa chọn ${quizOptionsStreamer.length + 1}`;
    input.value = optionText;
    input.dataset.optionId = optionId;
    // input.className = "some-input-class"; // Add class if streamer.css has specific styling for these

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.className = "quiz-option-remove-btn control-btn control-btn-small"; // Re-use for consistent styling
    removeBtn.title = "Xóa lựa chọn này";
    removeBtn.style.background = "var(--danger-color)"; // Override for danger
    removeBtn.style.borderColor = "var(--danger-color)";
    removeBtn.style.color = "white";
     removeBtn.style.width = "auto"; // Let content define width
    removeBtn.style.minWidth = "28px";
    removeBtn.style.height = "28px";
    removeBtn.style.padding = "0";
    removeBtn.style.marginLeft = "8px";


    removeBtn.onclick = () => {
      quizOptionsStreamer = quizOptionsStreamer.filter(opt => opt.id !== optionId);
      wrapper.remove();
      updateQuizCorrectAnswerSelect();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    elements.quizOptionsContainer.appendChild(wrapper);
    quizOptionsStreamer.push({ id: optionId, inputElement: input });
    updateQuizCorrectAnswerSelect();
  }

  function updateQuizCorrectAnswerSelect() {
    if (!elements.quizCorrectAnswerSelect) return;
    const currentSelectedValue = elements.quizCorrectAnswerSelect.value;
    elements.quizCorrectAnswerSelect.innerHTML = "";

    if (quizOptionsStreamer.length === 0) {
      elements.quizCorrectAnswerSelect.style.display = "none";
      return;
    }
    elements.quizCorrectAnswerSelect.style.display = "block";

    quizOptionsStreamer.forEach((option, index) => {
      const optElement = document.createElement("option");
      const currentText = option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
      optElement.value = index.toString(); // Value is the index
      optElement.textContent = `Đáp án ${index + 1}: ${currentText.substring(0, 30)}${currentText.length > 30 ? "..." : ""}`;
      elements.quizCorrectAnswerSelect.appendChild(optElement);

      // Re-select previous if still valid
      if (currentSelectedValue === index.toString()) {
          elements.quizCorrectAnswerSelect.value = currentSelectedValue;
      }
    });

    // Add oninput listeners to update select options dynamically
    quizOptionsStreamer.forEach((option, index) => {
      option.inputElement.oninput = () => {
        const selectOption = elements.quizCorrectAnswerSelect.options[index];
        if (selectOption) {
          const inputText = option.inputElement.value.trim() || `Lựa chọn ${index + 1}`;
          selectOption.textContent = `Đáp án ${index + 1}: ${inputText.substring(0,30)}${inputText.length > 30 ? "..." : ""}`;
        }
      };
    });
  }

  function handleStartQuiz() {
    if (!socket || !elements.quizQuestionText || !elements.quizCorrectAnswerSelect) return;
    playButtonFeedback(elements.startQuizBtn);

    const questionText = elements.quizQuestionText.value.trim();
    const options = quizOptionsStreamer
      .map(opt => opt.inputElement.value.trim())
      .filter(optText => optText.length > 0); // Ensure options are not empty strings

    const correctAnswerIndex = parseInt(elements.quizCorrectAnswerSelect.value, 10);

    if (!questionText) {
      if (typeof showAlert === "function") showAlert("Vui lòng nhập nội dung câu hỏi.", "warning");
      return;
    }
    if (options.length < 2) {
      if (typeof showAlert === "function") showAlert("Cần ít nhất 2 lựa chọn cho câu hỏi.", "warning");
      return;
    }
    if (isNaN(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
      if (typeof showAlert === "function") showAlert("Vui lòng chọn đáp án đúng hợp lệ.", "warning");
      return;
    }

    socket.emit("quiz:start", {
      roomId: streamerConfig.roomId,
      questionText: questionText,
      options: options,
      correctAnswerIndex: correctAnswerIndex,
    });

    // UI updates after emitting (server will confirm with quiz:newQuestion)
    elements.startQuizBtn.disabled = true;
    elements.quizQuestionText.disabled = true;
    quizOptionsStreamer.forEach(opt => opt.inputElement.disabled = true);
    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = true;
    elements.quizCorrectAnswerSelect.disabled = true;
    // show/next/end buttons will be enabled by server response (quiz:newQuestion)
  }

  function handleShowQuizAnswer() {
    if (!socket || !currentQuizQuestionIdStreamer) return;
    playButtonFeedback(elements.showQuizAnswerBtn);
    socket.emit("quiz:showAnswer", {
      roomId: streamerConfig.roomId,
      questionId: currentQuizQuestionIdStreamer,
    });
    // UI update (disabling button) handled by server response (quiz:correctAnswer)
  }

  function handleNextQuizQuestion() {
    if (!socket) return;
    playButtonFeedback(elements.nextQuizQuestionBtn);
    socket.emit("quiz:nextQuestion", { roomId: streamerConfig.roomId });
    // UI reset for new question input handled by server response (quiz:clearCurrent)
    // and then locally by resetQuizUIStreamer (called by quiz:clearCurrent handler)
  }

  function handleEndQuiz() {
    if (!socket) return;
    playButtonFeedback(elements.endQuizBtn);
    socket.emit("quiz:end", { roomId: streamerConfig.roomId });
    // UI reset handled by server response (quiz:ended)
  }

  function resetQuizUIStreamer() {
    if (elements.quizQuestionText) {
      elements.quizQuestionText.value = "";
      elements.quizQuestionText.disabled = false;
    }
    if (elements.quizOptionsContainer) elements.quizOptionsContainer.innerHTML = "";
    quizOptionsStreamer = [];
    addQuizOptionInput(); // Add initial two options
    addQuizOptionInput();

    if (elements.quizCorrectAnswerSelect) {
      elements.quizCorrectAnswerSelect.innerHTML = "";
      elements.quizCorrectAnswerSelect.disabled = false;
      updateQuizCorrectAnswerSelect(); // Populate with default "Lựa chọn X"
    }
    if (elements.addQuizOptionBtn) elements.addQuizOptionBtn.disabled = false;
    if (elements.startQuizBtn) elements.startQuizBtn.disabled = false;
    if (elements.showQuizAnswerBtn) elements.showQuizAnswerBtn.disabled = true;
    if (elements.nextQuizQuestionBtn) elements.nextQuizQuestionBtn.disabled = true;
    if (elements.endQuizBtn) elements.endQuizBtn.disabled = true;
    if (elements.quizStreamerResults) elements.quizStreamerResults.innerHTML = "";
    if (elements.quizStreamerStatus) elements.quizStreamerStatus.innerHTML = `<p>Trạng thái: Chưa bắt đầu.</p>`;

    currentQuizQuestionIdStreamer = null;
    isQuizActiveStreamer = false;
  }

  function initializeQuizOptionFields() { // Called if quiz panel is opened
    if (quizOptionsStreamer.length === 0 && elements.quizOptionsContainer && !isQuizActiveStreamer) {
      addQuizOptionInput();
      addQuizOptionInput();
    }
    // Ensure correct answer select is populated if options exist
     if (quizOptionsStreamer.length > 0) {
        updateQuizCorrectAnswerSelect();
    }
  }


  // ==================================
  // UI EVENT LISTENERS SETUP
  // ==================================
  function initUIEventListeners() {
    // Control Panel Toggle
    elements.togglePanelBtn?.addEventListener("click", () => {
        isPanelCollapsed = elements.controlPanel.classList.toggle("collapsed");
        const icon = elements.togglePanelBtn.querySelector("i");
        if (!elements.panelContent) return;

        gsap.to(icon, { rotation: isPanelCollapsed ? 180 : 0, duration: 0.4, ease: "power2.inOut" });

        if (!prefersReducedMotion) {
            if (isPanelCollapsed) {
                gsap.to(elements.controlButtons, { duration: 0.25, autoAlpha: 0, y: 10, stagger: 0.04, ease: "power1.in", overwrite: true });
                gsap.to(elements.panelContent, { duration: 0.4, height: 0, paddingTop: 0, paddingBottom: 0, autoAlpha: 0, ease: "power2.inOut", delay: 0.1, onComplete: () => {
                    // elements.panelContent.style.overflowY = "hidden"; // Managed by GSAP/CSS
                }});
            } else {
                gsap.set(elements.panelContent, { display: "block", height: "auto", autoAlpha: 0 });
                const targetHeight = elements.panelContent.scrollHeight;
                gsap.fromTo(elements.panelContent,
                    { height: 0, autoAlpha: 0, paddingTop: 0, paddingBottom: 0 },
                    { duration: 0.5, height: targetHeight, paddingTop: 20, paddingBottom: 20, autoAlpha: 1, ease: "power3.out",
                        onComplete: () => {
                            gsap.set(elements.panelContent, { height: "auto" }); // For dynamic content
                            // elements.panelContent.style.overflowY = "auto";
                            if (elements.controlButtons && elements.controlButtons.length > 0) {
                                gsap.fromTo(elements.controlButtons,
                                    { y: 15, autoAlpha: 0 },
                                    { duration: 0.5, y: 0, autoAlpha: 1, stagger: 0.06, ease: "power2.out", overwrite: true }
                                );
                            }
                        }
                    }
                );
            }
        } else { /* Reduced motion handling */
            elements.panelContent.style.display = isPanelCollapsed ? "none" : "block";
            if(elements.controlButtons) gsap.set(elements.controlButtons, { autoAlpha: isPanelCollapsed ? 0 : 1 });
        }
    });

    // Stream Control Buttons
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
        if (!socket) { console.error("Socket not connected."); return; }
        playButtonFeedback(elements.endStreamBtn);
        const confirmed = await showStreamerConfirmation("Xác nhận kết thúc stream?", "Kết thúc", "Hủy", "fas fa-exclamation-triangle");
        if (confirmed) {
            stopLocalStream(); // Will also emit streamEnded via socket
            // Server side, on streamEnded or endRoom, will clean up room.
             setTimeout(() => { // Delay redirect slightly to allow socket events to process
                window.location.href = "https://hoctap-9a3.glitch.me/live";
            }, 500);
        }
    });

    // Modal Buttons
    elements.viewersListBtn?.addEventListener("click", () => {
        if (!socket) return;
        playButtonFeedback(elements.viewersListBtn);
        socket.emit("getViewersList", { roomId: streamerConfig.roomId }); // Request fresh list
        openModal(elements.viewersModal);
    });
    elements.bannedListBtn?.addEventListener("click", () => {
        if (!socket) return;
        playButtonFeedback(elements.bannedListBtn);
        socket.emit("getBannedList", { roomId: streamerConfig.roomId }); // Request fresh list
        openModal(elements.bannedModal);
    });
    elements.closeViewersModalBtn?.addEventListener("click", () => closeModal(elements.viewersModal));
    elements.closeBannedModalBtn?.addEventListener("click", () => closeModal(elements.bannedModal));
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) closeModal(backdrop.closest(".modal-v2"));
        });
    });

    // Chat Input
    elements.sendChatBtn?.addEventListener("click", sendChatMessage);
    elements.chatInputArea?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    elements.chatInputArea?.addEventListener("input", function () {
        this.style.height = "auto"; // Reset height
        this.style.height = this.scrollHeight + "px"; // Set to scroll height
        const rawText = this.value || "";
        if (elements.chatPreview && typeof marked !== "undefined" && typeof katex !== "undefined") {
            try {
                let html = marked.parse(rawText);
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = html;
                renderMathInElement(tempDiv, { /* KaTeX options */ throwOnError: false});
                elements.chatPreview.innerHTML = tempDiv.innerHTML;
            } catch (e) {
                elements.chatPreview.textContent = "Lỗi preview markdown/KaTeX";
            }
        }
    });

    // Viewers Search
    elements.viewersSearchInput?.addEventListener("input", function () {
        const query = this.value.toLowerCase();
        const listItems = elements.viewersModalList?.querySelectorAll("li.user-list-item");
        listItems?.forEach(li => {
            const username = li.querySelector(".list-username")?.textContent.toLowerCase() || "";
            li.style.display = username.includes(query) ? "" : "none";
        });
    });

    // Streamer Whiteboard Toggle
    elements.toggleWhiteboardBtnStreamer?.addEventListener("click", () => {
        if (!sharedWhiteboardInstance) return;
        playButtonFeedback(elements.toggleWhiteboardBtnStreamer);
        const newVisibility = !sharedWhiteboardInstance.isGloballyVisible();
        sharedWhiteboardInstance.setGlobalVisibility(newVisibility);
        // The onVisibilityChangeCallback in sharedWhiteboardInstance config will update button class
    });


    // PiP Chat Button
    if (elements.pipChatBtn && elements.pipChatVideoPlayer && pipChatCanvas) {
        const isPiPSupportedByBrowser = typeof elements.pipChatVideoPlayer.requestPictureInPicture === "function" &&
                                        typeof pipChatCanvas.captureStream === "function";
        if (isPiPSupportedByBrowser) {
            elements.pipChatBtn.style.display = "flex"; // Show button
            elements.pipChatBtn.disabled = false;
            elements.pipChatBtn.addEventListener("click", () => {
                playButtonFeedback(elements.pipChatBtn);
                togglePipChat();
            });

            elements.pipChatVideoPlayer.addEventListener("enterpictureinpicture", () => {
                console.log("PiP Chat: Entered PiP mode.");
                isPipChatActive = true;
                pipChatNeedsUpdate = true; // Force first draw
                if(elements.pipChatBtn) {
                    elements.pipChatBtn.classList.add("active");
                    elements.pipChatBtn.innerHTML = '<i class="fas fa-window-minimize"></i><span class="btn-label">Thoát PiP</span>';
                }
                if (pipChatUpdateRequestId) cancelAnimationFrame(pipChatUpdateRequestId);
                drawPipChatFrame(); // Start drawing loop
            });

            elements.pipChatVideoPlayer.addEventListener("leavepictureinpicture", () => {
                console.log("PiP Chat: Exited PiP mode.");
                isPipChatActive = false;
                pipChatNeedsUpdate = false;
                if (pipChatUpdateRequestId) {
                    cancelAnimationFrame(pipChatUpdateRequestId);
                    pipChatUpdateRequestId = null;
                }
                if(elements.pipChatBtn) {
                    elements.pipChatBtn.classList.remove("active");
                    elements.pipChatBtn.innerHTML = '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
                }
                if (pipChatStream) { // Stop the stream when exiting PiP
                    pipChatStream.getTracks().forEach(track => track.stop());
                    pipChatStream = null;
                }
            });

        } else {
            console.warn("PiP Chat (Canvas Capture or Video PiP) is not fully supported by this browser.");
            if (elements.pipChatBtn) {
                elements.pipChatBtn.style.display = "flex";
                elements.pipChatBtn.classList.add("control-btn-disabled-visual");
                elements.pipChatBtn.title = "PiP Chat không được trình duyệt này hỗ trợ đầy đủ.";
                elements.pipChatBtn.disabled = true;
            }
        }
    } else if (elements.pipChatBtn) { // Hide if prereqs not met
        elements.pipChatBtn.style.display = "none";
    }

    // Quiz Panel UI
    elements.toggleQuizPanelBtn?.addEventListener("click", () => {
        playButtonFeedback(elements.toggleQuizPanelBtn);
        if (elements.streamerQuizPanel) {
            const isPanelVisible = elements.streamerQuizPanel.style.display === 'block' || elements.streamerQuizPanel.style.display === '';
            const quizIcon = elements.toggleQuizPanelBtn.querySelector("i");
            gsap.to(quizIcon, { rotation: isPanelVisible ? 0 : 180, duration: 0.3, ease: "power1.inOut" });

            if (isPanelVisible) {
                gsap.to(elements.streamerQuizPanel, { duration: 0.3, height: 0, autoAlpha: 0, ease: "power1.in", onComplete: () => {
                    elements.streamerQuizPanel.style.display = 'none';
                }});
                elements.toggleQuizPanelBtn.classList.remove("active");
            } else {
                gsap.set(elements.streamerQuizPanel, { display: 'block', height: 'auto', autoAlpha: 0 });
                const targetHeight = elements.streamerQuizPanel.scrollHeight;
                gsap.fromTo(elements.streamerQuizPanel,
                    { height: 0, autoAlpha: 0 },
                    { duration: 0.4, height: targetHeight, autoAlpha: 1, ease: "power2.out", onComplete: () => {
                        gsap.set(elements.streamerQuizPanel, { height: 'auto' });
                    }}
                );
                elements.toggleQuizPanelBtn.classList.add("active");
                initializeQuizOptionFields(); // Ensure options are there if panel is opened
            }
        }
    });

    elements.addQuizOptionBtn?.addEventListener("click", () => {
        playButtonFeedback(elements.addQuizOptionBtn);
        addQuizOptionInput();
    });
    elements.startQuizBtn?.addEventListener("click", handleStartQuiz);
    elements.showQuizAnswerBtn?.addEventListener("click", handleShowQuizAnswer);
    elements.nextQuizQuestionBtn?.addEventListener("click", handleNextQuizQuestion);
    elements.endQuizBtn?.addEventListener("click", handleEndQuiz);

    // Initialize Shared Whiteboard for Streamer
    initStreamerWhiteboard();

  } // End initUIEventListeners

  // ==================================
  // START INITIALIZATION
  // ==================================
  initializeStreamer();
}); // End DOMContentLoaded