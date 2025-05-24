// File: public/js/liveRoom.js

// /public/js/liveRoom-viewer.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Lib Checks & Config ---
  if (
    typeof gsap === "undefined" ||
    typeof io === "undefined" ||
    typeof Peer === "undefined" ||
    typeof tsParticles === "undefined" ||
    typeof marked === "undefined" ||
    typeof katex === "undefined" ||
    typeof initializeSharedWhiteboard === "undefined" // Check for shared module
  ) {
    console.error(
      "Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles, Marked, KaTeX, SharedWhiteboard) not loaded!"
    );
    document.body.innerHTML =
      '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên. Vui lòng thử lại.</p>';
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // --- Element Refs ---
  const elements = {
    viewerCount: document.getElementById("viewerCountLive"),
    chatMessagesList: document.getElementById("chatMessagesLive"),
    chatInputArea: document.getElementById("chatInputAreaLive"),
    sendChatBtn: document.getElementById("sendChatBtnLive"),
    chatPreview: document.getElementById("chatPreviewLive"),
    pinnedCommentContainer: document.getElementById("pinnedCommentLive"),
    liveVideo: document.getElementById("liveVideoFeed"),
    placeholder: document.getElementById("streamPlaceholder"),
    waitingOverlay: document.getElementById("waitingOverlayLive"),
    endedOverlay: document.getElementById("roomEndedOverlayLive"),
    playOverlay: document.getElementById("playOverlayLive"),
    playButton: document.getElementById("playButtonLive"),
    exitButton: document.getElementById("exitRoomBtnLive"),
    liveIndicator: document.getElementById("liveIndicator"),
    // --- Whiteboard Elements for Shared Module (Viewer) ---
    whiteboardOverlayViewer: document.getElementById("whiteboardContainerOverlayViewer"), // The main overlay div
    whiteboardCanvasViewer: document.getElementById("whiteboardCanvasViewer"), // The <canvas>
    // Toolbar elements to pass to shared module
    whiteboardToolbarViewerMain: document.getElementById("whiteboardToolbarViewer"),
    wbColorPickerViewer: document.getElementById("wbColorPickerViewer"),
    wbLineWidthRangeViewer: document.getElementById("wbLineWidthRangeViewer"),
    wbLineWidthValueDisplayViewer: document.getElementById("wbLineWidthValueDisplayViewer"),
    wbEraserModeBtnViewer: document.getElementById("wbEraserModeBtnViewer"),
    // Viewers typically don't have clear, pan, zoom, grid, shape, select, delete buttons in their default toolbar.
    // If they are granted drawing rights and these tools, these elements would need to be present in liveRoom.ejs
    // and passed here. For now, assuming a simpler viewer toolbar.
    // Streamer's coords display is not for viewers.
    toggleViewerWhiteboardDisplayBtn: document.getElementById("toggleViewerWhiteboardDisplayBtn"), // Viewer's local show/hide
    // --- End Whiteboard Elements ---

    // ---- Start: Quiz Elements Viewer ----
    viewerQuizOverlay: document.getElementById("viewerQuizOverlay"),
    quizQuestionViewerText: document.getElementById("quizQuestionViewerText"),
    quizOptionsViewerContainer: document.getElementById("quizOptionsViewerContainer"),
    quizViewerFeedback: document.getElementById("quizViewerFeedback"),
    closeQuizOverlayBtn: document.getElementById("closeQuizOverlayBtn"),
    // ---- End: Quiz Elements Viewer ----
  };

  // --- State ---
  let viewerPeer = null;
  let currentCall = null;
  let socket = null;

  // --- Whiteboard State (now managed by shared module) ---
  let sharedWhiteboardInstance = null;
  let isWhiteboardLocallyVisible = false; // Viewer's independent decision to see the WB if globally available
  // `isWhiteboardGloballyVisible` will be tracked inside sharedWhiteboardInstance if needed, or implicitly by its `isActive()`
  // --- End Whiteboard State ---

  // ---- Start: Quiz State Viewer ----
  let currentQuizIdViewer = null;
  let selectedAnswerIndexViewer = null;
  let quizOverlayVisible = false;
  // ---- End: Quiz State Viewer ----

  // ==================================
  // INITIALIZATION
  // ==================================
  function initializeViewer() {
    console.log("Initializing Live Room Viewer...");
    initSocket();
    initPeer();
    initViewerWhiteboardModule(); // Initialize the shared whiteboard
    initUIEventListeners();
    initBackgroundParticles();
    initPageAnimations();

    console.log("Viewer Initialization Complete.");
  }

  // ==================================
  // ANIMATIONS & EFFECTS (Mostly Unchanged)
  // ==================================
  function initPageAnimations() {
    if (prefersReducedMotion) {
      gsap.set("[data-animate], .live-room-main-header, .live-video-area, .live-chat-area", { autoAlpha: 1 });
      return;
    }
    const tl = gsap.timeline({ delay: 0.1 });
    tl.from(".live-room-main-header", { duration: 0.7, y: -60, autoAlpha: 0, ease: "power2.out" })
      .from(".live-video-area", { duration: 0.9, x: -50, autoAlpha: 0, ease: "power3.out" }, "-=0.4")
      .from(".live-chat-area", { duration: 0.9, x: 50, autoAlpha: 0, ease: "power3.out" }, "<")
      .from(".live-room-main-header .header-info > *", { duration: 0.5, y: -10, autoAlpha: 0, stagger: 0.1, ease: "power1.out" }, "-=0.7")
      .from(".live-room-main-header .header-stats > *", { duration: 0.5, y: -10, autoAlpha: 0, stagger: 0.1, ease: "power1.out" }, "<");
  }

  function initBackgroundParticles() {
    if (prefersReducedMotion && liveRoomConfig.reduceMotionParticles) return;
    const targetEl = document.getElementById("live-particles-bg");
    if (!targetEl) return;
    tsParticles.load("live-particles-bg", {
        fpsLimit: prefersReducedMotion ? 20 : 45,
        particles: {
            number: { value: prefersReducedMotion ? 15 : 30, density: { enable: true, value_area: 800 } },
            color: { value: ["#a0a0c0", "#8a7ffb", "#6a6a8a"] },
            shape: { type: "circle" },
            opacity: { value: {min:0.05, max:0.15}, animation: { enable: !prefersReducedMotion, speed: 0.5, minimumValue: 0.05 } },
            size: { value: {min:1,max:3} },
            links: { enable: false },
            move: { enable: true, speed: prefersReducedMotion ? 0.1 : 0.2, direction: "none", random: true, straight: false, outModes: { default: "out" } },
        },
        interactivity: { enabled: false },
        background: { color: "transparent" },
    }).catch(error => console.error("tsParticles background error:", error));
  }

  function animateViewerCount(element) {
    if (!element || prefersReducedMotion) return;
    gsap.fromTo(element,
        { scale: 1.3, color: "var(--accent-color)" },
        { scale: 1, color: "var(--text-light)", duration: 0.5, ease: "back.out(2)" }
    );
  }

  // ==================================
  // SOCKET.IO (Adjust for shared whiteboard)
  // ==================================
  function initSocket() {
    if (socket && socket.connected) {
      console.log("Viewer socket already connected.");
      return;
    }
    socket = io();

    socket.on("connect", () => {
      console.log("Viewer socket connected:", socket.id);
      if (viewerPeer && viewerPeer.id) {
        socket.emit("joinRoom", { // Viewer now also sends peerId on joinRoom for simplicity if Peer is ready
          roomId: liveRoomConfig.roomId,
          username: liveRoomConfig.username,
          peerId: viewerPeer.id // Send PeerJS ID here
        });
        // No need for separate 'newViewer' from viewer side IF joinRoom includes peerId
      } else {
        socket.emit("joinRoom", { // Join without peerId if PeerJS not ready yet
          roomId: liveRoomConfig.roomId,
          username: liveRoomConfig.username,
        });
        console.log("Viewer socket connected, waiting for PeerJS to send its ID via newViewer event.");
      }
      socket.emit("getInitialData", { roomId: liveRoomConfig.roomId }); // For chat history, pinned msg etc.
      if (sharedWhiteboardInstance) {
        sharedWhiteboardInstance.forceRequestInitialState();
      } else {
         // If sharedWB not init yet, it will request state upon its own initialization
      }
    });
    socket.on("disconnect", (reason) => {
      console.warn("Viewer socket disconnected:", reason);
      showAlert("Bạn bị mất kết nối với lỗi không xác định.", "error");
      // Redirecting immediately might be too abrupt, consider a modal or countdown
      // location.href = liveRoomConfig.glitchProjectUrl + "/live";
    });
    socket.on("connect_error", (err) => console.error("Viewer Socket Error:", err.message));

    socket.on("userJoined", (msg) => addChatMessage(msg, "system", "join"));
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
      if (elements.viewerCount) elements.viewerCount.textContent = count;
      animateViewerCount(elements.viewerCount);
    });
    socket.on("commentPinned", (data) => displayPinnedComment(data.message));
    socket.on("commentUnpinned", () => displayPinnedComment(null));

    socket.on("hostJoined", () => {
        hideOverlay(elements.waitingOverlay);
        if(sharedWhiteboardInstance && sharedWhiteboardInstance.isGloballyVisible() && !isWhiteboardLocallyVisible){
            // If WB was supposed to be visible and we were waiting, try showing it.
             if (elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
        }
    });
    socket.on("roomEnded", () => {
      showOverlay(elements.endedOverlay);
      if (sharedWhiteboardInstance && sharedWhiteboardInstance.isActive()) {
        sharedWhiteboardInstance.hide(); // Hide it locally
      }
      if (elements.toggleViewerWhiteboardDisplayBtn) {
         elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
         elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
      }
      if (currentCall) {
        currentCall.close();
        currentCall = null;
      }
    });
    socket.on("waiting", () => showOverlay(elements.waitingOverlay));
    socket.on("banned", (msg) => {
      alert(msg || "Bạn đã bị chặn khỏi phòng này.");
      window.location.href = liveRoomConfig.glitchProjectUrl + "/live";
    });
    socket.on("screenShareEnded", () => handleStreamEnd()); // Streamer stopped sharing
    socket.on("initialRoomState", (state) => { // For chat history, pinned msg etc.
      console.log("Received initial room state:", state);
      if (state.pinnedComment) displayPinnedComment(state.pinnedComment);
      if (state.viewerCount) elements.viewerCount.textContent = state.viewerCount;
      if (!state.isHostPresent) showOverlay(elements.waitingOverlay);
      else hideOverlay(elements.waitingOverlay);
      // Whiteboard initial state is handled by wb:initState via sharedWhiteboardInstance
    });

    // Whiteboard events are now primarily handled by sharedWhiteboardInstance,
    // but we might need to listen to some for viewer-specific UI updates.

    socket.on("wb:toggleVisibility", ({ isVisible }) => {
      // This is the global visibility from the streamer
      // The sharedWhiteboardInstance's internal listener will also get this.
      // This is mostly for updating the viewer's local show/hide button state.
      if (elements.toggleViewerWhiteboardDisplayBtn) {
          elements.toggleViewerWhiteboardDisplayBtn.disabled = !isVisible;
          if (isVisible && isWhiteboardLocallyVisible) {
               elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
               elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
          } else {
               elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
               elements.toggleViewerWhiteboardDisplayBtn.title = "Hiện bảng vẽ (nếu streamer đang bật)";
          }
      }
      // If streamer turned it off, and viewer had it locally visible, the shared instance's handler should hide it.
      // If streamer turned it on, and viewer had it locally hidden, viewer can choose to show it.
      if (!isVisible && sharedWhiteboardInstance && sharedWhiteboardInstance.isActive()) {
          sharedWhiteboardInstance.hide(); // Force hide if globally off
          isWhiteboardLocallyVisible = false; // Update local flag
      }
    });

    // ---- Start: Viewer Quiz Socket Listeners (Unchanged from original liveRoom.js) ----
    socket.on("quiz:newQuestion", ({ questionId, text, options }) => {
      displayQuizQuestion(questionId, text, options);
    });
    socket.on("quiz:answerSubmitted", ({ questionId, answerIndex }) => {
      if (questionId === currentQuizIdViewer) {
        selectedAnswerIndexViewer = answerIndex;
        if (elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "Đã ghi nhận câu trả lời của bạn.";
        const optionButtons = elements.quizOptionsViewerContainer.querySelectorAll(".quiz-option-btn-viewer");
        optionButtons.forEach(button => {
          const optIdx = parseInt(button.dataset.optionIndex, 10);
          if (optIdx !== answerIndex) {
            button.disabled = true; button.style.opacity = "0.7";
          } else {
            button.classList.add("selected"); // Highlight selection
          }
        });
      }
    });
    socket.on("quiz:correctAnswer", ({ questionId, correctAnswerIndex, results }) => {
      if (questionId === currentQuizIdViewer) {
        showQuizResultViewer(questionId, correctAnswerIndex, results);
      }
    });
    socket.on("quiz:clearCurrent", () => {
      if (elements.viewerQuizOverlay && elements.quizQuestionViewerText && elements.quizOptionsViewerContainer) {
        elements.quizQuestionViewerText.textContent = "Chờ câu hỏi tiếp theo...";
        elements.quizOptionsViewerContainer.innerHTML = "";
        if (elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "";
      }
      currentQuizIdViewer = null; selectedAnswerIndexViewer = null;
    });
    socket.on("quiz:ended", () => {
      clearQuizOverlayViewer();
      if (typeof showAlert === "function") showAlert("Phiên trắc nghiệm đã kết thúc.", "info", 3000);
    });
    socket.on("quiz:error", (errorMessage) => {
      if (typeof showAlert === "function") showAlert(errorMessage, "error");
      // More robust error handling if an answer submission failed before results shown
      if (elements.quizOptionsViewerContainer && currentQuizIdViewer && selectedAnswerIndexViewer !== null) {
        const optionButtons = elements.quizOptionsViewerContainer.querySelectorAll(".quiz-option-btn-viewer");
        let answerAlreadyShown = false;
        optionButtons.forEach(btn => { if (btn.classList.contains('correct-answer') || btn.classList.contains('incorrect-answer')) answerAlreadyShown = true; });
        
        if (!answerAlreadyShown) { // Only re-enable if results not yet shown
            optionButtons.forEach(button => {
                button.disabled = false;
                button.style.opacity = "1";
                button.classList.remove("selected");
            });
            if (elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "Có lỗi xảy ra, vui lòng thử chọn lại.";
            selectedAnswerIndexViewer = null;
        }
      }
    });
    // ---- End: Viewer Quiz Socket Listeners ----
  }

  // ==================================
  // PEERJS
  // ==================================
  function initPeer() {
    // Viewer Peer ID is ephemeral, assigned by PeerServer
    viewerPeer = new Peer(undefined, liveRoomConfig.peerConfig);

    viewerPeer.on("open", (id) => {
      console.log("Viewer PeerJS open with ID:", id);
      if (socket && socket.connected) {
        // If socket is already connected, update the server with this peerId
        // This assumes 'joinRoom' might have been called before peer was ready.
        // A more robust way is to ensure 'joinRoom' always sends peerId if available,
        // or a separate 'viewerPeerReady' event.
        // For now, let's use a specific event if 'joinRoom' didn't have it.
        if(!socket.peerIdForStreamer) { // Check if joinRoom already sent it
             socket.emit("newViewer", { // 'newViewer' is listened to by streamer's socket handler
                viewerId: id,
                roomId: liveRoomConfig.roomId,
                username: liveRoomConfig.username
            });
        }
      } else {
        console.log("Viewer PeerJS opened, waiting for socket connection to send its ID.");
      }
    });

    viewerPeer.on("call", (call) => {
      console.log("Viewer received incoming call from host");
      hideOverlay(elements.waitingOverlay);
      hideOverlay(elements.playOverlay);

      call.answer(); // Viewer answers, does not send own stream

      call.on("stream", (hostStream) => {
        console.log("Viewer received stream from host.");
        if (elements.liveVideo) {
          elements.liveVideo.srcObject = hostStream;
          elements.liveVideo.muted = false; // Viewer should hear
          handleStreamStart();
          elements.liveVideo.play().catch((e) => {
            console.warn("Video autoplay failed, showing play button.", e);
            showOverlay(elements.playOverlay);
          });
        }
      });
      call.on("close", () => { console.log("Call closed by host."); handleStreamEnd(); });
      call.on("error", (err) => { console.error("Call error on viewer side:", err); handleStreamEnd(); showAlert("Lỗi kết nối stream.", "error"); });
      if (currentCall) currentCall.close();
      currentCall = call;
    });
    viewerPeer.on("error", (err) => { console.error("Viewer PeerJS Error:", err); showAlert(`Lỗi Peer: ${err.type}`, "error");});
    viewerPeer.on("disconnected", () => console.warn("Viewer PeerJS disconnected."));
    viewerPeer.on("close", () => console.log("Viewer PeerJS connection closed."));
  }

  // ==================================
  // WHITEBOARD LOGIC (VIEWER - using Shared Module)
  // ==================================
  function initViewerWhiteboardModule() {
    if (!elements.whiteboardCanvasViewer || !socket) {
      console.error("Cannot initialize viewer whiteboard: canvas or socket missing.");
      if(elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
      return;
    }

    const wbConfig = {
      canvasElement: elements.whiteboardCanvasViewer,
      toolbarElements: { // Viewer toolbar might be simpler or non-existent if no draw permission
        mainToolbar: elements.whiteboardToolbarViewerMain,
        colorPicker: elements.wbColorPickerViewer,
        lineWidthRange: elements.wbLineWidthRangeViewer,
        lineWidthValueDisplay: elements.wbLineWidthValueDisplayViewer,
        eraserBtn: elements.wbEraserModeBtnViewer,
        // Viewers don't typically have clear, pan, zoom etc. unless granted draw + advanced tools
      },
      socket: socket,
      roomId: liveRoomConfig.roomId,
      username: liveRoomConfig.username,
      isStreamer: false,
      initialCanDraw: false, // Viewers start without drawing permission
      showNotificationCallback: showAlert, // Use global showAlert
      // Viewers don't typically confirm actions on the WB unless they are drawing
      confirmActionCallback: (message, confirmText, cancelText, iconClass) => {
         // Use showArtisticConfirm if available, else window.confirm
         if (typeof showArtisticConfirm === 'function') {
             return showArtisticConfirm(message, confirmText, cancelText, iconClass);
         }
         return Promise.resolve(window.confirm(message));
      },
      onVisibilityChangeCallback: (isVisibleAndGlobal) => {
        // This callback is when the SHARED module's own visibility changes (show/hide called on it)
        // AND considers global state.
        // We use `isWhiteboardLocallyVisible` for the viewer's own toggle button.
        isWhiteboardLocallyVisible = isVisibleAndGlobal; // Update local state based on shared module
        if (elements.toggleViewerWhiteboardDisplayBtn) {
            elements.toggleViewerWhiteboardDisplayBtn.innerHTML = isVisibleAndGlobal
                ? '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ'
                : '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
            elements.toggleViewerWhiteboardDisplayBtn.title = isVisibleAndGlobal
                ? "Ẩn bảng vẽ (cục bộ)"
                : "Hiện bảng vẽ (nếu streamer đang bật)";
            // Disable button if WB is not globally available, handled by 'wb:toggleVisibility' from server too
             elements.toggleViewerWhiteboardDisplayBtn.disabled = !sharedWhiteboardInstance?.isGloballyVisible();
        }
         if (elements.whiteboardToolbarViewerMain) {
            elements.whiteboardToolbarViewerMain.style.display = (isVisibleAndGlobal && sharedWhiteboardInstance?.isGloballyVisible()) ? 'flex' : 'none';
        }
      },
      onPermissionChangeCallback: (canDraw) => {
        // Update viewer's drawing tools' enabled state
        const drawingTools = [
            elements.wbColorPickerViewer, elements.wbLineWidthRangeViewer, elements.wbEraserModeBtnViewer
        ];
        drawingTools.forEach(tool => { if(tool) tool.disabled = !canDraw; });

        if (elements.whiteboardToolbarViewerMain) {
            let permissionMsgEl = elements.whiteboardToolbarViewerMain.querySelector(".wb-permission-msg");
            if (!canDraw && !permissionMsgEl) {
                permissionMsgEl = document.createElement("span");
                permissionMsgEl.className = "wb-permission-msg";
                permissionMsgEl.textContent = "Bạn chưa có quyền vẽ";
                permissionMsgEl.style.color = "var(--warning-color)";
                permissionMsgEl.style.fontStyle = "italic";
                permissionMsgEl.style.fontSize = "0.8em";
                permissionMsgEl.style.marginLeft = "auto";
                elements.whiteboardToolbarViewerMain.appendChild(permissionMsgEl);
            } else if (canDraw && permissionMsgEl) {
                permissionMsgEl.remove();
            }
        }
         if (elements.whiteboardCanvasViewer) {
            elements.whiteboardCanvasViewer.classList.toggle("can-draw", canDraw);
            // Cursor will be managed by shared module's setActiveTool based on currentTool
        }
      },
      getRoomOwnerUsername: () => liveRoomConfig.roomOwner, // Function to get owner
    };

    sharedWhiteboardInstance = initializeSharedWhiteboard(wbConfig);

    if (sharedWhiteboardInstance) {
      console.log("Shared Whiteboard initialized for Viewer.");
      // Viewer whiteboard visibility is initially off, waiting for server signals
      // or user action via toggleViewerWhiteboardDisplayBtn.
      // The shared module's show/hide will be called by event listeners.
    } else {
      console.error("Failed to initialize Shared Whiteboard for Viewer.");
       if(elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
    }
  }


  // ---- Start: Viewer Quiz Functions (Unchanged) ----
  function displayQuizQuestion(questionId, text, options) {
    if (!elements.viewerQuizOverlay || !elements.quizQuestionViewerText || !elements.quizOptionsViewerContainer || !elements.quizViewerFeedback) return;
    currentQuizIdViewer = questionId; selectedAnswerIndexViewer = null;
    elements.quizQuestionViewerText.textContent = text;
    elements.quizOptionsViewerContainer.innerHTML = "";
    options.forEach((optionText, index) => {
      const button = document.createElement("button");
      button.className = "quiz-option-btn-viewer control-btn"; // Re-use control-btn for base styling
      button.textContent = optionText;
      button.dataset.optionIndex = index;
      // CSS in liveRoom.css will style .quiz-option-btn-viewer specifically
      button.onclick = () => {
        if (!socket || elements.quizOptionsViewerContainer.querySelector("button:disabled")) {
             if (elements.quizViewerFeedback && elements.quizViewerFeedback.textContent.includes("Đáp án đúng là")) return;
        }
        const allOptionBtns = elements.quizOptionsViewerContainer.querySelectorAll(".quiz-option-btn-viewer");
        allOptionBtns.forEach(btn => btn.classList.remove("selected"));
        button.classList.add("selected");
        socket.emit("quiz:submitAnswer", { roomId: liveRoomConfig.roomId, questionId: currentQuizIdViewer, answerIndex: index });
        if(elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "Đã gửi câu trả lời của bạn...";
      };
      elements.quizOptionsViewerContainer.appendChild(button);
    });
    if(elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "Chọn một câu trả lời.";
    elements.viewerQuizOverlay.style.display = "block"; quizOverlayVisible = true;
    if (!prefersReducedMotion) {
      gsap.fromTo(elements.viewerQuizOverlay, { autoAlpha: 0, y: 50 }, { duration: 0.5, autoAlpha: 1, y: 0, ease: "back.out(1.7)" });
    } else {
      gsap.set(elements.viewerQuizOverlay, { autoAlpha: 1, y: 0 });
    }
  }

  function showQuizResultViewer(questionId, correctAnswerIndex, results) {
    if (!elements.viewerQuizOverlay || !elements.quizOptionsViewerContainer || !elements.quizViewerFeedback || questionId !== currentQuizIdViewer) return;
    const optionButtons = elements.quizOptionsViewerContainer.querySelectorAll(".quiz-option-btn-viewer");
    let totalVotes = 0;
    if (results) Object.values(results).forEach(count => totalVotes += (count || 0));

    let feedbackText = "Đã hiển thị đáp án.";
    optionButtons.forEach(button => {
      const optionIndex = parseInt(button.dataset.optionIndex, 10);
      button.disabled = true; // Disable after showing results
      let resultText = "";
      if (results && results[optionIndex] !== undefined) {
        const count = results[optionIndex] || 0;
        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(0) : 0;
        resultText = ` (${count} phiếu, ${percentage}%)`;
      }
      // Clear existing content before adding new, to avoid appending icons multiple times
      const originalButtonText = button.textContent.replace(/\s*<i.*<\/i>\s*\(ĐÚNG\).*|\s*\(\d+ phiếu, \d+%\)/g, "").trim();

      if (optionIndex === correctAnswerIndex) {
        button.classList.add("correct-answer"); // Use class for styling from CSS
        button.classList.remove("incorrect-answer", "selected");
        button.innerHTML = `${originalButtonText} <i class="fas fa-check"></i> (ĐÚNG)${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex) feedbackText = "Chính xác! ";
      } else {
        button.classList.add("incorrect-answer");
        button.classList.remove("correct-answer", "selected");
        button.innerHTML = `${originalButtonText}${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex) feedbackText = "Sai rồi! ";
      }
    });
    if (elements.quizViewerFeedback) {
      if (selectedAnswerIndexViewer === null && feedbackText.startsWith("Đã hiển thị đáp án.")) {
        feedbackText = "Bạn chưa chọn đáp án. ";
      }
      const correctButton = optionButtons[correctAnswerIndex];
      if (correctButton) {
        const correctButtonText = correctButton.textContent.replace(/\s*<i.*<\/i>\s*\(ĐÚNG\).*|\s*\(\d+ phiếu, \d+%\)/g, "").trim();
        feedbackText += `Đáp án đúng là: ${correctButtonText}`;
      }
      elements.quizViewerFeedback.textContent = feedbackText;
    }
  }

  function clearQuizOverlayViewer() {
    if (!elements.viewerQuizOverlay) return;
    const onHideComplete = () => {
      if (elements.quizQuestionViewerText) elements.quizQuestionViewerText.textContent = "";
      if (elements.quizOptionsViewerContainer) elements.quizOptionsViewerContainer.innerHTML = "";
      if (elements.quizViewerFeedback) elements.quizViewerFeedback.textContent = "";
      if (elements.viewerQuizOverlay) elements.viewerQuizOverlay.style.display = "none";
      currentQuizIdViewer = null; selectedAnswerIndexViewer = null; quizOverlayVisible = false;
    };
    if (quizOverlayVisible && !prefersReducedMotion) {
      gsap.to(elements.viewerQuizOverlay, { duration: 0.4, autoAlpha: 0, y: 50, ease: "power1.in", onComplete: onHideComplete });
    } else {
      gsap.set(elements.viewerQuizOverlay, { autoAlpha: 0, display: 'none' });
      onHideComplete();
    }
  }
  // ---- End: Viewer Quiz Functions ----


  // ==================================
  // UI & CHAT FUNCTIONS (Mostly Unchanged)
  // ==================================
  function scrollChatToBottom() {
    const chatMessagesContainer = elements.chatMessagesList?.parentNode;
    if (chatMessagesContainer) {
      setTimeout(() => {
        const scrollThreshold = 50;
        const isScrolledUp = chatMessagesContainer.scrollHeight - chatMessagesContainer.scrollTop - chatMessagesContainer.clientHeight > scrollThreshold;
        if (!isScrolledUp) {
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
      }, 50);
    }
  }

  function addChatMessage(content, type = "guest", username = "System", timestamp = new Date(), originalMessage = null) {
    const li = document.createElement("li");
    li.className = `chat-message-item message-${type}`;
    const iconSpan = document.createElement("span");
    iconSpan.className = "msg-icon";
    let iconClass = "fa-user";
    if (type === "host") iconClass = "fa-star";
    else if (type === "pro") iconClass = "fa-check-circle";
    else if (type === "system" || type === "join") iconClass = "fa-info-circle";
    else if (type === "left") iconClass = "fa-sign-out-alt";
    else if (type === "ban") iconClass = "fa-gavel";
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
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    msgHeader.appendChild(timeSpan);
    contentContainer.appendChild(msgHeader);
    const bodySpan = document.createElement("span");
    bodySpan.className = "msg-body prose-styling";
    let finalHtml = content || "";
    if (type !== "system" && typeof marked !== "undefined" && typeof katex !== "undefined") {
      try {
        finalHtml = marked.parse(content || "");
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = finalHtml;
        renderMathInElement(tempDiv, {
          delimiters: [
            { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false,
        });
        finalHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in chat:", e);
        // finalHtml remains original content if error
      }
    }
    bodySpan.innerHTML = finalHtml;
    contentContainer.appendChild(bodySpan);
    li.appendChild(contentContainer);

    if (!prefersReducedMotion) {
      // Using GSAP for entrance animation from CSS keyframes
      // The class chat-message-item has an animation: messageFadeIn
      // If you want JS-controlled animation instead:
      //