// File: public/js/liveRoom.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Lib Checks & Config ---
  if (
    typeof gsap === "undefined" ||
    typeof io === "undefined" ||
    typeof Peer === "undefined" ||
    typeof tsParticles === "undefined" ||
    typeof marked === "undefined" ||
    typeof katex === "undefined" ||
    typeof renderMathInElement === "undefined" ||
    typeof initializeSharedWhiteboard === "undefined"
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

  if (typeof LIVE_ROOM_CONFIG === "undefined") {
    console.error(
      "LIVE_ROOM_CONFIG is not defined! Ensure it's passed from EJS."
    );
    if (typeof showAlert === "function")
      showAlert(
        "Lỗi cấu hình phòng. Không thể tải phòng live.",
        "error",
        10000
      );
    else alert("Lỗi cấu hình phòng. Không thể tải phòng live.");
    return;
  }

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
    toggleViewerWhiteboardDisplayBtn: document.getElementById(
      "viewerToggleWhiteboardDisplayBtn"
    ),

    // Viewer Whiteboard Elements
    whiteboardOverlayViewer: document.getElementById(
      "sharedWhiteboardOverlayViewer"
    ),
    whiteboardCanvasViewer: document.getElementById(
      "sharedWhiteboardCanvasViewer"
    ),
    whiteboardToolbarViewer: document.getElementById("whiteboardToolbarViewer"),
    closeWhiteboardBtnViewer: document.getElementById("wbCloseBtnViewer"),
    coordsDisplayElementViewer: document.getElementById(
      "wbCoordsDisplayViewer"
    ),
    zoomInBtnViewer: document.getElementById("wbZoomInBtnViewer"),
    zoomOutBtnViewer: document.getElementById("wbZoomOutBtnViewer"),
    resetViewBtnViewer: document.getElementById("wbResetViewBtnViewer"),
    toggleGridBtnViewer: document.getElementById("wbToggleGridBtnViewer"),
    colorPickerViewer: document.getElementById("wbColorPickerViewer"),
    lineWidthRangeViewer: document.getElementById("wbLineWidthViewer"),
    lineWidthValueDisplayViewer: document.getElementById(
      "wbLineWidthValueViewer"
    ),
    eraserBtnViewer: document.getElementById("wbEraserBtnViewer"),
    panToolBtnViewer: document.getElementById("wbPanToolBtnViewer"),

    // Streamer Whiteboard Elements (will be null if !isHost)
    whiteboardOverlayStreamer: document.getElementById(
      "sharedWhiteboardOverlayStreamer"
    ),
    whiteboardCanvasStreamer: document.getElementById(
      "sharedWhiteboardCanvasStreamer"
    ),
    whiteboardToolbarStreamer: document.getElementById(
      "whiteboardToolbarStreamer"
    ),
    toggleGlobalVisibilityBtn: document.getElementById(
      "wbToggleGlobalVisibilityBtn"
    ),
    viewerPermissionsList: document.getElementById("wbViewerPermissionsList"),
    colorPickerStreamer: document.getElementById("wbColorPickerStreamer"),
    lineWidthStreamer: document.getElementById("wbLineWidthStreamer"),
    lineWidthValueStreamer: document.getElementById("wbLineWidthValueStreamer"),
    eraserBtnStreamer: document.getElementById("wbEraserBtnStreamer"),
    panToolBtnStreamer: document.getElementById("wbPanToolBtnStreamer"),
    zoomInBtnStreamer: document.getElementById("wbZoomInBtnStreamer"),
    zoomOutBtnStreamer: document.getElementById("wbZoomOutBtnStreamer"),
    resetViewBtnStreamer: document.getElementById("wbResetViewBtnStreamer"),
    toggleGridBtnStreamer: document.getElementById("wbToggleGridBtnStreamer"),
    shapeToolToggleBtnStreamer: document.getElementById(
      "wbShapeToolToggleBtnStreamer"
    ),
    shapeOptionsStreamer: document.getElementById("wbShapeOptionsStreamer"),
    rectShapeBtnStreamer: document.getElementById("wbRectShapeBtnStreamer"),
    circleShapeBtnStreamer: document.getElementById("wbCircleShapeBtnStreamer"),
    lineShapeBtnStreamer: document.getElementById("wbLineShapeBtnStreamer"),
    selectToolToggleBtnStreamer: document.getElementById(
      "wbSelectToolToggleBtnStreamer"
    ),
    snipOptionsStreamer: document.getElementById("wbSnipOptionsStreamer"),
    rectangularSnipBtnStreamer: document.getElementById(
      "wbRectangularSnipBtnStreamer"
    ),
    freedomSnipBtnStreamer: document.getElementById("wbFreedomSnipBtnStreamer"),
    deleteSelectedBtnStreamer: document.getElementById(
      "wbDeleteSelectedBtnStreamer"
    ),
    clearBtnStreamer: document.getElementById("wbClearBtnStreamer"),
    closeWhiteboardBtnStreamer: document.getElementById("wbCloseBtnStreamer"),
    coordsDisplayStreamer: document.getElementById("wbCoordsDisplayStreamer"),

    // Quiz Elements Viewer
    viewerQuizOverlay: document.getElementById("viewerQuizOverlay"),
    quizQuestionViewerText: document.getElementById("quizQuestionViewerText"),
    quizOptionsViewerContainer: document.getElementById(
      "quizOptionsViewerContainer"
    ),
    quizViewerFeedback: document.getElementById("quizViewerFeedback"),
    closeQuizOverlayBtn: document.getElementById("closeQuizOverlayBtn"),
  };

  // --- State ---
  let peer = null;
  let currentCall = null; // For viewer receiving call
  let outgoingCalls = {}; // For streamer managing calls
  let localStream = null; // For streamer's media
  let socket = null;
  let sharedWhiteboardInstance = null;
  let isWhiteboardLocallyVisible = false;
  let currentQuizIdViewer = null;
  let selectedAnswerIndexViewer = null;
  let quizOverlayVisible = false;

  // ==================================
  // INITIALIZATION
  // ==================================
  function initializeRoom() {
    console.log(
      `Initializing Live Room as ${
        LIVE_ROOM_CONFIG.isHost ? "Host/Streamer" : "Viewer"
      }...`
    );
    initSocket();
    initPeer();
    initWhiteboard();
    initUIEventListeners();
    initBackgroundParticles();
    initPageAnimations();
    if (LIVE_ROOM_CONFIG.isHost)
      console.log("Host-specific UI setup completed in initUIEventListeners.");
    else
      console.log(
        "Viewer-specific UI setup completed in initUIEventListeners."
      );
    console.log("Room Initialization Complete.");
  }

  // ==================================
  // ANIMATIONS & EFFECTS
  // ==================================
  function initPageAnimations() {
    /* ... (Your existing animation logic) ... */ if (prefersReducedMotion) {
      gsap.set(".live-room-main-header, .live-video-area, .live-chat-area", {
        autoAlpha: 1,
      });
      return;
    }
    const tl = gsap.timeline({ delay: 0.1 });
    tl.from(".live-room-main-header", {
      duration: 0.7,
      y: -60,
      autoAlpha: 0,
      ease: "power2.out",
    })
      .from(
        ".live-video-area",
        {
          duration: 0.9,
          x: LIVE_ROOM_CONFIG.isHost ? 50 : -50,
          autoAlpha: 0,
          ease: "power3.out",
        },
        "-=0.4"
      )
      .from(
        ".live-chat-area",
        {
          duration: 0.9,
          x: LIVE_ROOM_CONFIG.isHost ? -50 : 50,
          autoAlpha: 0,
          ease: "power3.out",
        },
        "<"
      )
      .from(
        ".live-room-main-header .header-info > *",
        {
          duration: 0.5,
          y: -10,
          autoAlpha: 0,
          stagger: 0.1,
          ease: "power1.out",
        },
        "-=0.7"
      )
      .from(
        ".live-room-main-header .header-stats > *",
        {
          duration: 0.5,
          y: -10,
          autoAlpha: 0,
          stagger: 0.1,
          ease: "power1.out",
        },
        "<"
      );
  }
  function initBackgroundParticles() {
    /* ... (Your existing particle logic) ... */ if (
      prefersReducedMotion &&
      LIVE_ROOM_CONFIG.reduceMotionParticles
    )
      return;
    const targetEl = document.getElementById("live-particles-bg");
    if (!targetEl) return;
    tsParticles
      .load("live-particles-bg", {
        fpsLimit: prefersReducedMotion ? 20 : 45,
        particles: {
          number: {
            value: prefersReducedMotion ? 15 : 30,
            density: { enable: true, value_area: 800 },
          },
          color: { value: ["#a0a0c0", "#8a7ffb", "#6a6a8a"] },
          shape: { type: "circle" },
          opacity: {
            value: { min: 0.05, max: 0.15 },
            animation: {
              enable: !prefersReducedMotion,
              speed: 0.5,
              minimumValue: 0.05,
            },
          },
          size: { value: { min: 1, max: 3 } },
          links: { enable: false },
          move: {
            enable: true,
            speed: prefersReducedMotion ? 0.1 : 0.2,
            direction: "none",
            random: true,
            straight: false,
            outModes: { default: "out" },
          },
        },
        interactivity: { enabled: false },
        background: { color: "transparent" },
      })
      .catch((error) => console.error("tsParticles background error:", error));
  }
  function animateViewerCount(element) {
    /* ... (Your existing animation logic) ... */ if (
      !element ||
      prefersReducedMotion
    )
      return;
    gsap.fromTo(
      element,
      { scale: 1.3, color: "var(--accent-color)" },
      {
        scale: 1,
        color: "var(--text-light)",
        duration: 0.5,
        ease: "back.out(2)",
      }
    );
  }
  function playButtonFeedback(buttonElement) {
    /* ... (Your existing animation logic) ... */ if (
      !buttonElement ||
      prefersReducedMotion
    )
      return;
    gsap
      .timeline()
      .to(buttonElement, { scale: 0.9, duration: 0.1, ease: "power1.in" })
      .to(buttonElement, {
        scale: 1,
        duration: 0.3,
        ease: "elastic.out(1, 0.5)",
      });
  }

  // ==================================
  // SOCKET.IO
  // ==================================
  function initSocket() {
    /* ... (Your existing socket initialization and event handlers) ... */ if (
      socket &&
      socket.connected
    )
      return;
    socket = io();
    socket.on("connect", () => {
      console.log(
        `${LIVE_ROOM_CONFIG.isHost ? "Host" : "Viewer"} socket connected:`,
        socket.id
      );
      if (peer && peer.id) {
        socket.emit("joinRoom", {
          roomId: LIVE_ROOM_CONFIG.roomId,
          username: LIVE_ROOM_CONFIG.username,
          peerId: peer.id,
          isHost: LIVE_ROOM_CONFIG.isHost,
        });
      } else {
        socket.emit("joinRoom", {
          roomId: LIVE_ROOM_CONFIG.roomId,
          username: LIVE_ROOM_CONFIG.username,
          isHost: LIVE_ROOM_CONFIG.isHost,
        });
      }
      socket.emit("getInitialData", { roomId: LIVE_ROOM_CONFIG.roomId });
      if (sharedWhiteboardInstance)
        sharedWhiteboardInstance.forceRequestInitialState();
    });
    socket.on("disconnect", (reason) => {
      console.warn(
        `${LIVE_ROOM_CONFIG.isHost ? "Host" : "Viewer"} socket disconnected:`,
        reason
      );
      showAlert("Mất kết nối với máy chủ.", "error");
    });
    socket.on("connect_error", (err) =>
      console.error("Socket Error:", err.message)
    );
    socket.on("userJoined", (msg) =>
      addChatMessage(msg, "system", "join")
    );
    socket.on("viewerLeft", (data) =>
      addChatMessage(`${data.username} đã rời đi.`, "system", "left")
    );
    socket.on("newMessage", (data) =>
      addChatMessage(
        data.message.content,
        data.message.messageType,
        data.message.username,
        new Date(data.message.timestamp),
        data.message
      )
    );
    socket.on("updateViewers", (count) => {
      if (elements.viewerCount) elements.viewerCount.textContent = count;
      animateViewerCount(elements.viewerCount);
    });
    socket.on("commentPinned", (data) => displayPinnedComment(data.message));
    socket.on("commentUnpinned", () => displayPinnedComment(null));
    socket.on("banned", (msg) => {
      alert(msg || "Bạn đã bị chặn!");
      window.location.href = LIVE_ROOM_CONFIG.glitchProjectUrl + "/live";
    });
    socket.on("hostJoined", () => {
      hideOverlay(elements.waitingOverlay);
      if (
        !LIVE_ROOM_CONFIG.isHost &&
        sharedWhiteboardInstance &&
        sharedWhiteboardInstance.isGloballyVisible()
      ) {
        if (elements.toggleViewerWhiteboardDisplayBtn)
          elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
      }
    });
    socket.on("hostLeft", () => {
      if (LIVE_ROOM_CONFIG.isHost) {
        showAlert(
          "Phiên live của bạn có thể đã bị ngắt từ một nơi khác.",
          "warning"
        );
      } else {
        handleStreamEnd();
        showOverlay(elements.waitingOverlay);
        elements.waitingOverlay.querySelector("h2").textContent =
          "Host đã rời đi. Đang chờ kết nối lại...";
      }
    });
    socket.on("roomEnded", () => {
      showOverlay(elements.endedOverlay);
      if (sharedWhiteboardInstance && sharedWhiteboardInstance.isActive())
        sharedWhiteboardInstance.hide();
      if (elements.toggleViewerWhiteboardDisplayBtn) {
        elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
        elements.toggleViewerWhiteboardDisplayBtn.querySelector(
          ".btn-text"
        ).textContent = "Bảng Vẽ";
      }
      if (currentCall) {
        currentCall.close();
        currentCall = null;
      }
      if (localStream && LIVE_ROOM_CONFIG.isHost) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
      }
    });
    socket.on("waiting", () => showOverlay(elements.waitingOverlay));
    socket.on("initialRoomState", (state) => {
      console.log("Received initial room state:", state);
      if (state.pinnedComment) displayPinnedComment(state.pinnedComment);
      if (state.viewerCount && elements.viewerCount)
        elements.viewerCount.textContent = state.viewerCount;
      if (LIVE_ROOM_CONFIG.isHost) {
        if (elements.toggleGlobalVisibilityBtn) {
          const btnText =
            elements.toggleGlobalVisibilityBtn.querySelector(".btn-text");
          if (btnText)
            btnText.textContent = state.isWhiteboardVisible
              ? "Ẩn Bảng Vẽ"
              : "Hiện Bảng Vẽ";
          elements.toggleGlobalVisibilityBtn.classList.toggle(
            "active",
            state.isWhiteboardVisible
          );
        }
      } else {
        if (!state.isHostPresent) showOverlay(elements.waitingOverlay);
        else hideOverlay(elements.waitingOverlay);
      }
    });
    socket.on("wb:toggleVisibility", ({ isVisible }) => {
      console.log(
        `Received wb:toggleVisibility - isVisible: ${isVisible} (I am ${
          LIVE_ROOM_CONFIG.isHost ? "Host" : "Viewer"
        })`
      );
      if (
        !LIVE_ROOM_CONFIG.isHost &&
        elements.toggleViewerWhiteboardDisplayBtn
      ) {
        elements.toggleViewerWhiteboardDisplayBtn.disabled = !isVisible;
        const btnTextEl =
          elements.toggleViewerWhiteboardDisplayBtn.querySelector(".btn-text");
        if (btnTextEl) {
          if (isVisible) {
            btnTextEl.textContent = isWhiteboardLocallyVisible
              ? "Ẩn Bảng Vẽ"
              : "Hiện Bảng Vẽ";
            elements.toggleViewerWhiteboardDisplayBtn.title =
              isWhiteboardLocallyVisible
                ? "Ẩn bảng vẽ (cục bộ)"
                : "Hiện bảng vẽ";
          } else {
            btnTextEl.textContent = "Bảng Vẽ";
            elements.toggleViewerWhiteboardDisplayBtn.title =
              "Bảng vẽ (Chủ phòng đang tắt)";
          }
        }
        elements.toggleViewerWhiteboardDisplayBtn.classList.toggle(
          "active",
          isWhiteboardLocallyVisible && isVisible
        );
      }
    });
    socket.on("quiz:newQuestion", ({ questionId, text, options }) => {
      displayQuizQuestion(questionId, text, options);
    });
    socket.on("quiz:answerSubmitted", ({ questionId, answerIndex }) => {
      /* quiz logic */
    });
    socket.on(
      "quiz:correctAnswer",
      ({ questionId, correctAnswerIndex, results }) => {
        /* quiz logic */
      }
    );
    socket.on("quiz:clearCurrent", () => {
      /* quiz logic */
    });
    socket.on("quiz:ended", () => {
      /* quiz logic */
    });
    socket.on("quiz:error", (errorMessage) => {
      /* quiz logic */
    });
    if (LIVE_ROOM_CONFIG.isHost) {
      socket.on("viewerPeerId", ({ viewerId, username: viewerUsername }) => {
        if (localStream && peer && viewerId && !outgoingCalls[viewerId]) {
          const call = peer.call(viewerId, localStream, {
            metadata: { type: "stream" },
          });
          if (call) {
            outgoingCalls[viewerId] = call;
            call.on("close", () => delete outgoingCalls[viewerId]);
            call.on("error", (err) => {
              console.error(`Call error with ${viewerId}:`, err);
              delete outgoingCalls[viewerId];
            });
          }
        }
      });
      socket.on(
        "requestScreenShareAgain",
        ({ viewerId, username: viewerUsername }) => {
          /* streamer logic */
        }
      );
    }
  }

  // ==================================
  // PEERJS
  // ==================================
  function initPeer() {
    /* ... (Your existing PeerJS initialization logic) ... */ let peerIdToUse =
      LIVE_ROOM_CONFIG.isHost ? LIVE_ROOM_CONFIG.roomId : undefined;
    peer = new Peer(peerIdToUse, LIVE_ROOM_CONFIG.peerConfig);
    peer.on("open", (id) => {
      console.log(
        `${LIVE_ROOM_CONFIG.isHost ? "Host" : "Viewer"} PeerJS open. ID: ${id}`
      );
      if (socket && socket.connected) {
        if (!LIVE_ROOM_CONFIG.isHost) {
          socket.emit("newViewer", {
            viewerId: id,
            roomId: LIVE_ROOM_CONFIG.roomId,
            username: LIVE_ROOM_CONFIG.username,
          });
        }
      }
    });
    if (!LIVE_ROOM_CONFIG.isHost) {
      peer.on("call", (call) => {
        console.log("Viewer received incoming call from host");
        hideOverlay(elements.waitingOverlay);
        hideOverlay(elements.playOverlay);
        call.answer();
        call.on("stream", (hostStream) => {
          console.log("Viewer received stream from host.");
          if (elements.liveVideo) {
            elements.liveVideo.srcObject = hostStream;
            elements.liveVideo.muted = false;
            handleStreamStart();
            elements.liveVideo.play().catch((e) => {
              console.warn("Video autoplay failed", e);
              showOverlay(elements.playOverlay);
            });
          }
        });
        call.on("close", () => {
          console.log("Call closed by host.");
          handleStreamEnd();
        });
        call.on("error", (err) => {
          console.error("Call error (viewer):", err);
          handleStreamEnd();
          showAlert("Lỗi kết nối stream.", "error");
        });
        if (currentCall) currentCall.close();
        currentCall = call;
      });
    }
    peer.on("error", (err) => {
      console.error(
        `${LIVE_ROOM_CONFIG.isHost ? "Host" : "Viewer"} PeerJS Error:`,
        err
      );
      showAlert(`Lỗi Peer: ${err.type || err.message}`, "error");
    });
    peer.on("disconnected", () => console.warn("PeerJS disconnected."));
    peer.on("close", () => console.log("PeerJS connection closed."));
  }

  // ==================================
  // WHITEBOARD LOGIC (Initialization)
  // ==================================
  function initWhiteboard() {
    let canvasForWB, toolbarConfigForWB;

    if (LIVE_ROOM_CONFIG.isHost) {
      canvasForWB = elements.whiteboardCanvasStreamer;
      toolbarConfigForWB = {
        mainToolbar: elements.whiteboardToolbarStreamer,
        colorPicker: elements.colorPickerStreamer,
        lineWidthRange: elements.lineWidthStreamer,
        lineWidthValueDisplay: elements.lineWidthValueStreamer,
        eraserBtn: elements.eraserBtnStreamer,
        clearBtn: elements.clearBtnStreamer,
        panToolBtn: elements.panToolBtnStreamer,
        zoomInBtn: elements.zoomInBtnStreamer,
        zoomOutBtn: elements.zoomOutBtnStreamer,
        resetViewBtn: elements.resetViewBtnStreamer,
        toggleGridBtn: elements.toggleGridBtnStreamer,
        shapeToolToggleBtn: elements.shapeToolToggleBtnStreamer,
        shapeOptionsContainer: elements.shapeOptionsStreamer,
        rectShapeBtn: elements.rectShapeBtnStreamer,
        circleShapeBtn: elements.circleShapeBtnStreamer,
        lineShapeBtn: elements.lineShapeBtnStreamer,
        selectToolToggleBtn: elements.selectToolToggleBtnStreamer,
        snipOptionsContainer: elements.snipOptionsStreamer,
        rectangularSnipBtn: elements.rectangularSnipBtnStreamer,
        freedomSnipBtn: elements.freedomSnipBtnStreamer,
        deleteSelectedBtn: elements.deleteSelectedBtnStreamer,
        coordsDisplayElement: elements.coordsDisplayStreamer,
        closeWhiteboardBtn: elements.closeWhiteboardBtnStreamer,
        toggleGlobalVisibilityButton: elements.toggleGlobalVisibilityBtn,
        viewerPermissionsDropdown: elements.viewerPermissionsList,
      };
    } else {
      // Viewer
      canvasForWB = elements.whiteboardCanvasViewer;
      toolbarConfigForWB = {
        mainToolbar: elements.whiteboardToolbarViewer, // For sharedWhiteboard.js to know which main toolbar is viewer's
        viewerToolbar: elements.whiteboardToolbarViewer, // Explicit for clarity
        closeWhiteboardBtn: elements.closeWhiteboardBtnViewer,
        coordsDisplayElement: elements.coordsDisplayElementViewer,
        zoomInBtn: elements.zoomInBtnViewer,
        zoomOutBtn: elements.zoomOutBtnViewer,
        resetViewBtn: elements.resetViewBtnViewer,
        toggleGridBtn: elements.toggleGridBtnViewer,
        // Conditionally add drawing tools if viewer has permission
        ...(LIVE_ROOM_CONFIG.initialViewerCanDraw && {
          colorPicker: elements.colorPickerViewer,
          lineWidthRange: elements.lineWidthRangeViewer,
          lineWidthValueDisplay: elements.lineWidthValueDisplayViewer,
          eraserBtn: elements.eraserBtnViewer,
          panToolBtn: elements.panToolBtnViewer,
        }),
      };
    }

    if (!canvasForWB || !socket) {
      console.error("Cannot initialize whiteboard: canvas or socket missing.");
      if (elements.toggleViewerWhiteboardDisplayBtn && !LIVE_ROOM_CONFIG.isHost)
        elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
      if (elements.toggleGlobalVisibilityBtn && LIVE_ROOM_CONFIG.isHost)
        elements.toggleGlobalVisibilityBtn.disabled = true;
      return;
    }

    const wbConfig = {
      canvasElement: canvasForWB,
      toolbarElements: toolbarConfigForWB,
      socket: socket,
      roomId: LIVE_ROOM_CONFIG.roomId,
      username: LIVE_ROOM_CONFIG.username,
      isStreamer: LIVE_ROOM_CONFIG.isHost,
      initialCanDraw: LIVE_ROOM_CONFIG.isHost
        ? true
        : LIVE_ROOM_CONFIG.initialViewerCanDraw,
      initialIsGloballyVisible: LIVE_ROOM_CONFIG.isHost
        ? false
        : LIVE_ROOM_CONFIG.initialWhiteboardGloballyVisible,
      showNotificationCallback: showAlert,
      confirmActionCallback: (message, confirmText, cancelText, iconClass) =>
        typeof showArtisticConfirm === "function"
          ? showArtisticConfirm(message, confirmText, cancelText, iconClass)
          : Promise.resolve(window.confirm(message)),
      onVisibilityChangeCallback: handleWhiteboardVisibilityChange,
      onPermissionChangeCallback: handleWhiteboardPermissionChange,
      onToolChangeCallback: (activeTool) =>
        console.log(`WB Tool Changed to: ${activeTool}`),
      playButtonFeedbackCallback: playButtonFeedback,
      getRoomOwnerUsername: () => LIVE_ROOM_CONFIG.roomOwnerUsername,
    };

    sharedWhiteboardInstance = initializeSharedWhiteboard(wbConfig);

    if (!sharedWhiteboardInstance) {
      console.error(
        `Failed to initialize Shared Whiteboard for ${
          LIVE_ROOM_CONFIG.isHost ? "Streamer" : "Viewer"
        }.`
      );
      if (elements.toggleViewerWhiteboardDisplayBtn && !LIVE_ROOM_CONFIG.isHost)
        elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
      if (elements.toggleGlobalVisibilityBtn && LIVE_ROOM_CONFIG.isHost)
        elements.toggleGlobalVisibilityBtn.disabled = true;
    } else {
      console.log(
        `Shared Whiteboard initialized for ${
          LIVE_ROOM_CONFIG.isHost ? "Streamer" : "Viewer"
        }.`
      );
    }
  }

  function handleWhiteboardVisibilityChange(
    isLocallyActive,
    isGloballyVisibleByStreamer
  ) {
    /* ... (Your existing logic) ... */ console.log(
      `handleWhiteboardVisibilityChange called. Local: ${isLocallyActive}, Global: ${isGloballyVisibleByStreamer}`
    );
    isWhiteboardLocallyVisible = isLocallyActive;
    if (LIVE_ROOM_CONFIG.isHost) {
      if (elements.toggleGlobalVisibilityBtn) {
        const btnTextEl =
          elements.toggleGlobalVisibilityBtn.querySelector(".btn-text");
        if (btnTextEl)
          btnTextEl.textContent = isGloballyVisibleByStreamer
            ? "Ẩn Bảng Vẽ"
            : "Hiện Bảng Vẽ";
        elements.toggleGlobalVisibilityBtn.classList.toggle(
          "active",
          isGloballyVisibleByStreamer
        );
        elements.toggleGlobalVisibilityBtn.title = isGloballyVisibleByStreamer
          ? "Tắt bảng vẽ cho mọi người"
          : "Bật bảng vẽ cho mọi người";
      }
      const overlay = elements.whiteboardOverlayStreamer;
      if (overlay) overlay.style.display = isLocallyActive ? "flex" : "none";
    } else {
      if (elements.toggleViewerWhiteboardDisplayBtn) {
        elements.toggleViewerWhiteboardDisplayBtn.disabled =
          !isGloballyVisibleByStreamer;
        const btnTextEl =
          elements.toggleViewerWhiteboardDisplayBtn.querySelector(".btn-text");
        if (btnTextEl) {
          if (isGloballyVisibleByStreamer) {
            btnTextEl.textContent = isLocallyActive
              ? "Ẩn Bảng Vẽ"
              : "Hiện Bảng Vẽ";
            elements.toggleViewerWhiteboardDisplayBtn.title = isLocallyActive
              ? "Ẩn bảng vẽ của bạn"
              : "Hiện bảng vẽ (Chủ phòng đang bật)";
          } else {
            btnTextEl.textContent = "Bảng Vẽ";
            elements.toggleViewerWhiteboardDisplayBtn.title =
              "Bảng vẽ (Chủ phòng đang tắt)";
          }
        }
        elements.toggleViewerWhiteboardDisplayBtn.classList.toggle(
          "active",
          isLocallyActive && isGloballyVisibleByStreamer
        );
      }
      const overlay = elements.whiteboardOverlayViewer;
      if (overlay)
        overlay.style.display =
          isLocallyActive && isGloballyVisibleByStreamer ? "flex" : "none";
    }
  }
  function handleWhiteboardPermissionChange(canDrawNow) {
    /* ... (Your existing logic) ... */ if (LIVE_ROOM_CONFIG.isHost) return;
    console.log(
      `Viewer ${LIVE_ROOM_CONFIG.username} draw permission changed to: ${canDrawNow}`
    );
    const viewerDrawingTools = [
      elements.colorPickerViewer,
      elements.lineWidthRangeViewer,
      elements.eraserBtnViewer,
      elements.panToolBtnViewer,
    ];
    viewerDrawingTools.forEach((tool) => {
      if (tool) tool.disabled = !canDrawNow;
    });
    if (elements.whiteboardToolbarViewer) {
      let permMsg =
        elements.whiteboardToolbarViewer.querySelector(".wb-permission-msg");
      if (!canDrawNow) {
        if (!permMsg) {
          permMsg = document.createElement("span");
          permMsg.className = "wb-permission-msg";
          permMsg.style.cssText =
            "color: var(--warning-color); font-style: italic; font-size: 0.8em; margin-left: auto;";
          elements.whiteboardToolbarViewer.appendChild(permMsg);
        }
        permMsg.textContent = "Chỉ xem";
      } else if (permMsg) {
        permMsg.remove();
      }
    }
    if (elements.whiteboardCanvasViewer) {
      elements.whiteboardCanvasViewer.style.cursor = canDrawNow
        ? "crosshair"
        : "default";
    }
  }

  // ---- Quiz Functions for Viewer ----
  function displayQuizQuestion(questionId, text, options) {
    /* ... (Your existing logic, same as before) ... */ if (
      !elements.viewerQuizOverlay ||
      !elements.quizQuestionViewerText ||
      !elements.quizOptionsViewerContainer ||
      !elements.quizViewerFeedback
    )
      return;
    currentQuizIdViewer = questionId;
    selectedAnswerIndexViewer = null;
    elements.quizQuestionViewerText.textContent = text;
    elements.quizOptionsViewerContainer.innerHTML = "";
    options.forEach((optionText, index) => {
      const button = document.createElement("button");
      button.className = "quiz-option-btn-viewer control-btn";
      button.textContent = optionText;
      button.dataset.optionIndex = String(index);
      button.onclick = () => {
        if (
          !socket ||
          elements.quizOptionsViewerContainer.querySelector("button:disabled")
        ) {
          if (
            elements.quizViewerFeedback &&
            elements.quizViewerFeedback.textContent.includes("Đáp án đúng là")
          )
            return;
        }
        const allOptionBtns =
          elements.quizOptionsViewerContainer.querySelectorAll(
            ".quiz-option-btn-viewer"
          );
        allOptionBtns.forEach((btn) => btn.classList.remove("selected"));
        button.classList.add("selected");
        socket.emit("quiz:submitAnswer", {
          roomId: LIVE_ROOM_CONFIG.roomId,
          questionId: currentQuizIdViewer,
          answerIndex: index,
        });
        if (elements.quizViewerFeedback)
          elements.quizViewerFeedback.textContent =
            "Đã gửi câu trả lời của bạn...";
      };
      elements.quizOptionsViewerContainer.appendChild(button);
    });
    if (elements.quizViewerFeedback)
      elements.quizViewerFeedback.textContent = "Chọn một câu trả lời.";
    elements.viewerQuizOverlay.style.display = "block";
    quizOverlayVisible = true;
    if (!prefersReducedMotion)
      gsap.fromTo(
        elements.viewerQuizOverlay,
        { autoAlpha: 0, y: 50 },
        { duration: 0.5, autoAlpha: 1, y: 0, ease: "back.out(1.7)" }
      );
    else gsap.set(elements.viewerQuizOverlay, { autoAlpha: 1, y: 0 });
  }
  function showQuizResultViewer(questionId, correctAnswerIndex, results) {
    /* ... (Your existing logic, same as before) ... */ if (
      !elements.viewerQuizOverlay ||
      !elements.quizOptionsViewerContainer ||
      !elements.quizViewerFeedback ||
      questionId !== currentQuizIdViewer
    )
      return;
    const optionButtons = elements.quizOptionsViewerContainer.querySelectorAll(
      ".quiz-option-btn-viewer"
    );
    let totalVotes = 0;
    if (results)
      Object.values(results).forEach((count) => (totalVotes += count || 0));
    let feedbackText = "Đã hiển thị đáp án.";
    optionButtons.forEach((button) => {
      const optionIndex = parseInt(button.dataset.optionIndex, 10);
      button.disabled = true;
      let resultText = "";
      if (results && results[optionIndex] !== undefined) {
        const count = results[optionIndex] || 0;
        const percentage =
          totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(0) : 0;
        resultText = ` (${count} phiếu, ${percentage}%)`;
      }
      const originalButtonText = button.textContent
        .replace(/\s*<i.*<\/i>\s*\(ĐÚNG\).*|\s*\(\d+ phiếu, \d+%\)/g, "")
        .trim();
      if (optionIndex === correctAnswerIndex) {
        button.classList.add("correct-answer");
        button.classList.remove("incorrect-answer", "selected");
        button.innerHTML = `${originalButtonText} <i class="fas fa-check"></i> (ĐÚNG)${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex)
          feedbackText = "Chính xác! ";
      } else {
        button.classList.add("incorrect-answer");
        button.classList.remove("correct-answer", "selected");
        button.innerHTML = `${originalButtonText}${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex)
          feedbackText = "Sai rồi! ";
      }
    });
    if (elements.quizViewerFeedback) {
      if (
        selectedAnswerIndexViewer === null &&
        feedbackText.startsWith("Đã hiển thị đáp án.")
      )
        feedbackText = "Bạn chưa chọn đáp án. ";
      const correctButton = optionButtons[correctAnswerIndex];
      if (correctButton) {
        const correctButtonText = correctButton.textContent
          .replace(/\s*<i.*<\/i>\s*\(ĐÚNG\).*|\s*\(\d+ phiếu, \d+%\)/g, "")
          .trim();
        feedbackText += `Đáp án đúng là: ${correctButtonText}`;
      }
      elements.quizViewerFeedback.textContent = feedbackText;
    }
  }
  function clearQuizOverlayViewer() {
    /* ... (Your existing logic, same as before) ... */ if (
      !elements.viewerQuizOverlay
    )
      return;
    const onHideComplete = () => {
      if (elements.quizQuestionViewerText)
        elements.quizQuestionViewerText.textContent = "";
      if (elements.quizOptionsViewerContainer)
        elements.quizOptionsViewerContainer.innerHTML = "";
      if (elements.quizViewerFeedback)
        elements.quizViewerFeedback.textContent = "";
      if (elements.viewerQuizOverlay)
        elements.viewerQuizOverlay.style.display = "none";
      currentQuizIdViewer = null;
      selectedAnswerIndexViewer = null;
      quizOverlayVisible = false;
    };
    if (quizOverlayVisible && !prefersReducedMotion)
      gsap.to(elements.viewerQuizOverlay, {
        duration: 0.4,
        autoAlpha: 0,
        y: 50,
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    else {
      gsap.set(elements.viewerQuizOverlay, { autoAlpha: 0, display: "none" });
      onHideComplete();
    }
  }

  // ==================================
  // UI & CHAT FUNCTIONS
  // ==================================
  function scrollChatToBottom() {
    /* ... (Your existing logic) ... */ const chatMessagesContainer =
      elements.chatMessagesList?.parentNode;
    if (chatMessagesContainer) {
      setTimeout(() => {
        const scrollThreshold = 50;
        const isScrolledUp =
          chatMessagesContainer.scrollHeight -
            chatMessagesContainer.scrollTop -
            chatMessagesContainer.clientHeight >
          scrollThreshold;
        if (!isScrolledUp)
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }, 50);
    }
  }
  // Inside addChatMessage function
  function addChatMessage(
    content,
    type = "guest",
    username = "System", // Default username for system messages
    timestamp = new Date(),
    originalMessage = null // The full message object from socket
  ) {
    const li = document.createElement("li");
    li.className = `chat-message-item message-${type}`; // e.g., message-system

    const iconSpan = document.createElement("span");
    iconSpan.className = "msg-icon";
    let iconClass = "fa-user"; // Default icon

    if (type === "host") iconClass = "fa-star";
    else if (type === "pro") iconClass = "fa-check-circle";
    else if (type === "system" || type === "join") iconClass = "fa-info-circle"; // System gets info icon
    else if (type === "left") iconClass = "fa-sign-out-alt";
    else if (type === "ban") iconClass = "fa-gavel";
    iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`;
    li.appendChild(iconSpan); // Icon is added

    // --- PROBLEM AREA LIKELY HERE ---
    // The content container with username, timestamp, and body might be skipped for "system" type implicitly or explicitly.

    const contentContainer = document.createElement("div");
    contentContainer.className = "msg-content-container";

    // Header (Username and Timestamp)
    // For system messages, we might want to display "System" or hide the header.
    // For join/left messages, the 'content' itself is usually like "UserX has joined."
    if (type !== "system" && type !== "join" && type !== "left" && type !== "ban") { // Only show user header for actual user messages
        const msgHeader = document.createElement("div");
        msgHeader.className = "msg-header";
        const userSpan = document.createElement("span");
        userSpan.className = "msg-username";
        userSpan.textContent = username; // Use the passed username
        msgHeader.appendChild(userSpan);

        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-timestamp";
        timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        msgHeader.appendChild(timeSpan);
        contentContainer.appendChild(msgHeader);
    }


    // Message Body
    const bodySpan = document.createElement("span");
    bodySpan.className = "msg-body prose-styling"; // Apply prose for potential markdown in system messages too

    let finalHtml = content || ""; // The 'content' for system messages is the system message itself.

    // Markdown/KaTeX parsing is usually NOT needed for simple system messages like "User joined"
    // but if your system messages can contain markdown, keep this block.
    // For this fix, let's assume system messages are plain text or simple HTML.
    if (
      type !== "system" && // Don't parse system messages as markdown by default
      type !== "join" &&   // Unless you intend them to have markdown
      type !== "left" &&
      type !== "ban" &&
      typeof marked !== "undefined" &&
      typeof katex !== "undefined" &&
      typeof renderMathInElement !== "undefined"
    ) {
      try {
        finalHtml = marked.parse(content || "");
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = finalHtml;
        renderMathInElement(tempDiv, { /* KaTeX options */ delimiters: [ { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true } ], throwOnError: false });
        finalHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in chat:", e);
        // finalHtml remains original content if error
      }
    }
    bodySpan.innerHTML = finalHtml;
    contentContainer.appendChild(bodySpan);

    // --- FIX: ALWAYS APPEND contentContainer to li ---
    li.appendChild(contentContainer);
    // --- END FIX ---


    if (!prefersReducedMotion) {
      // GSAP animation or CSS class for fade-in
    } else {
      gsap.set(li, { autoAlpha: 1, x: 0 });
    }

    elements.chatMessagesList?.appendChild(li);
    scrollChatToBottom();
  }
  function displayPinnedComment(message) {
    /* ... (Your existing logic, using renderMathInElement) ... */ const container =
      elements.pinnedCommentContainer;
    if (!container) return;
    const existingBox = container.querySelector(".pinned-box");
    if (!message || !message.content) {
      if (existingBox && !prefersReducedMotion)
        gsap.to(existingBox, {
          duration: 0.3,
          height: 0,
          autoAlpha: 0,
          padding: 0,
          margin: 0,
          ease: "power1.in",
          onComplete: () => existingBox.remove(),
        });
      else if (existingBox) existingBox.remove();
      container.classList.remove("has-content");
      return;
    }
    let pinnedBox = existingBox;
    if (!pinnedBox) {
      pinnedBox = document.createElement("div");
      pinnedBox.className = "pinned-box";
      container.appendChild(pinnedBox);
    }
    let contentHtml = message.content || "";
    if (
      typeof marked !== "undefined" &&
      typeof katex !== "undefined" &&
      typeof renderMathInElement !== "undefined"
    ) {
      try {
        contentHtml = marked.parse(contentHtml);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = contentHtml;
        renderMathInElement(tempDiv, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
        });
        contentHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in pinned:", e);
      }
    }
    pinnedBox.innerHTML = `<span class="pin-icon"><i class="fas fa-thumbtack"></i></span><div class="pinned-content"><span class="pinned-user">${
      message.username || "Host"
    }</span><span class="pinned-text prose-styling">${contentHtml}</span></div><span class="pinned-timestamp">${new Date(
      message.timestamp
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>`;
    if (!container.classList.contains("has-content")) {
      container.classList.add("has-content");
      if (!existingBox && !prefersReducedMotion)
        gsap.from(pinnedBox, {
          duration: 0.5,
          y: -10,
          autoAlpha: 0,
          ease: "power2.out",
          delay: 0.1,
        });
    } else if (existingBox && !prefersReducedMotion)
      gsap.fromTo(
        pinnedBox.querySelector(".pinned-content"),
        { autoAlpha: 0.5 },
        { autoAlpha: 1, duration: 0.3 }
      );
  }
  function sendChatMessage() {
    /* ... (Your existing logic) ... */ if (!socket) return;
    const messageContent = elements.chatInputArea.value.trim();
    if (!messageContent) return;
    let messageType = LIVE_ROOM_CONFIG.userIsPro ? "pro" : "guest";
    const messageObj = {
      username: LIVE_ROOM_CONFIG.username,
      content: messageContent,
      messageType: messageType,
      timestamp: new Date().toISOString(),
    };
    socket.emit("chatMessage", {
      roomId: LIVE_ROOM_CONFIG.roomId,
      message: messageObj,
    });
    elements.chatInputArea.value = "";
    elements.chatPreview.innerHTML = "";
    elements.chatPreview.style.display = "none";
    elements.chatInputArea.style.height = "auto";
  }

  // ==================================
  // OVERLAY & STREAM STATE HANDLING
  // ==================================
  function showOverlay(overlayElement) {
    /* ... (Your existing logic) ... */ if (!overlayElement) return;
    console.log(`Showing overlay: ${overlayElement.id}`);
    overlayElement.style.cursor =
      overlayElement.id === "playOverlayLive" ||
      overlayElement.id === "roomEndedOverlayLive"
        ? "pointer"
        : "default";
    overlayElement.style.pointerEvents = "auto";
    if (!prefersReducedMotion)
      gsap
        .timeline()
        .set(overlayElement, { display: "flex", autoAlpha: 0 })
        .to(overlayElement, { duration: 0.5, autoAlpha: 1, ease: "power2.out" })
        .from(
          overlayElement.querySelector(".overlay-content"),
          { duration: 0.6, scale: 0.9, autoAlpha: 0, ease: "back.out(1.7)" },
          "-=0.3"
        );
    else gsap.set(overlayElement, { display: "flex", autoAlpha: 1 });
    overlayElement.classList.add("active");
  }
  function hideOverlay(overlayElement) {
    /* ... (Your existing logic) ... */ if (
      !overlayElement ||
      gsap.getProperty(overlayElement, "autoAlpha") === 0
    )
      return;
    console.log(`Hiding overlay: ${overlayElement.id}`);
    overlayElement.style.cursor = "default";
    const onComplete = () => {
      gsap.set(overlayElement, { display: "none" });
      overlayElement.classList.remove("active");
    };
    if (!prefersReducedMotion)
      gsap
        .timeline({ onComplete })
        .to(overlayElement.querySelector(".overlay-content"), {
          duration: 0.3,
          scale: 0.9,
          autoAlpha: 0,
          ease: "power1.in",
        })
        .to(overlayElement, { duration: 0.4, autoAlpha: 0 }, "-=0.2");
    else {
      gsap.set(overlayElement, { display: "none", autoAlpha: 0 });
      onComplete();
    }
  }
  function handleStreamStart() {
    /* ... (Your existing logic) ... */ console.log("Handling stream start UI");
    if (elements.placeholder) elements.placeholder.classList.remove("active");
    if (elements.liveIndicator) elements.liveIndicator.classList.add("active");
    hideOverlay(elements.waitingOverlay);
    hideOverlay(elements.playOverlay);
  }
  function handleStreamEnd() {
    /* ... (Your existing logic) ... */ console.log("Handling stream end UI");
    if (elements.liveVideo && elements.liveVideo.srcObject) {
      elements.liveVideo.srcObject.getTracks().forEach((track) => track.stop());
      elements.liveVideo.srcObject = null;
    }
    if (elements.placeholder) elements.placeholder.classList.add("active");
    if (elements.liveIndicator)
      elements.liveIndicator.classList.remove("active");
  }

  // ==================================
  // UI EVENT LISTENERS SETUP
  // ==================================
  async function askExit() {
    /* ... (Your existing logic) ... */ let confirmed = false;
    if (typeof showArtisticConfirm === "function")
      confirmed = await showArtisticConfirm(
        "Bạn có chắc muốn rời khỏi phòng live?",
        "Tôi Chắc Chắn",
        "Để Sau",
        "fas fa-exclamation-triangle"
      );
    else confirmed = window.confirm("Bạn có chắc muốn rời khỏi phòng live?");
    if (confirmed) {
      if (socket) {
        socket.emit(
          LIVE_ROOM_CONFIG.isHost ? "streamerLeaving" : "viewerLeaving",
          {
            roomId: LIVE_ROOM_CONFIG.roomId,
            username: LIVE_ROOM_CONFIG.username,
          }
        );
        socket.disconnect();
      }
      if (peer) peer.destroy();
      if (sharedWhiteboardInstance) sharedWhiteboardInstance.destroy();
      window.location.href = LIVE_ROOM_CONFIG.glitchProjectUrl + "/live";
    }
  }
  function initUIEventListeners() {
    elements.exitButton?.addEventListener("click", askExit);
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
      const rawText = this.value || "";
      if (
        elements.chatPreview &&
        typeof marked !== "undefined" &&
        typeof renderMathInElement !== "undefined"
      ) {
        try {
          let html = marked.parse(rawText);
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = html;
          renderMathInElement(tempDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
              { left: "\\(", right: "\\)", display: false },
              { left: "\\[", right: "\\]", display: true },
            ],
            throwOnError: false,
          });
          elements.chatPreview.innerHTML = tempDiv.innerHTML;
          if (rawText.trim() !== "") {
            elements.chatPreview.style.display = "block";
            elements.chatPreview.style.opacity = "1";
          } else {
            elements.chatPreview.style.display = "none";
            elements.chatPreview.style.opacity = "0";
          }
        } catch (e) {
          elements.chatPreview.textContent = "Lỗi preview";
          elements.chatPreview.style.display = "block";
          elements.chatPreview.style.color = "var(--danger-color)";
        }
      }
    });
    elements.playButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      elements.liveVideo
        ?.play()
        .then(() => hideOverlay(elements.playOverlay))
        .catch((err) => {
          console.error("Manual play failed:", err);
          showAlert("Không thể phát video.", "warning");
        });
    });
    elements.playOverlay?.addEventListener("click", () => {
      if (elements.playOverlay.classList.contains("active"))
        elements.liveVideo
          ?.play()
          .then(() => hideOverlay(elements.playOverlay))
          .catch((err) => {
            console.error("Overlay play failed:", err);
            showAlert("Không thể phát video.", "error");
          });
    });
    elements.waitingOverlay?.addEventListener("click", (e) => {
      if (
        elements.waitingOverlay.classList.contains("active") &&
        e.target === elements.waitingOverlay
      )
        console.log("Waiting overlay clicked.");
    });
    elements.endedOverlay?.addEventListener("click", (e) => {
      if (
        elements.endedOverlay.classList.contains("active") &&
        e.target.closest(".overlay-action-btn")
      )
        return;
    });
    const startPlay = () => {
      if (
        elements.liveVideo &&
        elements.liveVideo.paused &&
        elements.liveVideo.srcObject &&
        !elements.playOverlay.classList.contains("active")
      ) {
        elements.liveVideo
          .play()
          .then(() => hideOverlay(elements.playOverlay))
          .catch(() => {
            if (!elements.playOverlay.classList.contains("active"))
              showOverlay(elements.playOverlay);
          });
      }
      document.body.removeEventListener("click", startPlay, { once: true });
      document.body.removeEventListener("keydown", startPlay, { once: true });
    };
    document.body.addEventListener("click", startPlay, { once: true });
    document.body.addEventListener("keydown", startPlay, { once: true });

    // Viewer's Whiteboard Toggle Button
    elements.toggleViewerWhiteboardDisplayBtn?.addEventListener("click", () => {
      playButtonFeedback(elements.toggleViewerWhiteboardDisplayBtn);
      if (!sharedWhiteboardInstance) {
        showAlert("Bảng vẽ chưa sẵn sàng.", "warning");
        return;
      }
      const isCurrentlyGloballyVisible =
        sharedWhiteboardInstance.isGloballyVisible();
      if (!isCurrentlyGloballyVisible) {
        showAlert("Bảng vẽ chưa được chủ phòng bật.", "info");
        return;
      }
      if (sharedWhiteboardInstance.isActive()) sharedWhiteboardInstance.hide();
      else sharedWhiteboardInstance.show();
    });

    // Streamer's Whiteboard Global Toggle Button
    if (LIVE_ROOM_CONFIG.isHost && elements.toggleGlobalVisibilityBtn) {
      elements.toggleGlobalVisibilityBtn.addEventListener("click", () => {
        playButtonFeedback(elements.toggleGlobalVisibilityBtn);
        if (sharedWhiteboardInstance) {
          const currentGlobalState =
            sharedWhiteboardInstance.isGloballyVisible();
          sharedWhiteboardInstance.setGlobalVisibility(!currentGlobalState);
        }
      });
    }
    if (LIVE_ROOM_CONFIG.isHost && elements.viewerPermissionsList) {
      elements.viewerPermissionsList.addEventListener("change", (e) => {
        const selectElement = e.target; // Type assertion
        const value = selectElement.value;
        const selectedOption =
          selectElement.options[selectElement.selectedIndex];

        if (value === "all_true") {
          socket.emit("wb:setAllViewersPermission", {
            roomId: LIVE_ROOM_CONFIG.roomId,
            canDraw: true,
          });
        } else if (value === "all_false") {
          socket.emit("wb:setAllViewersPermission", {
            roomId: LIVE_ROOM_CONFIG.roomId,
            canDraw: false,
          });
        } else {
          // Individual viewer
          const viewerUsername = value;
          // Determine new permission based on current data attribute (or assume toggle)
          const currentCanDraw = selectedOption.dataset.canDrawNow === "true";
          if (sharedWhiteboardInstance) {
            sharedWhiteboardInstance.setViewerDrawPermission(
              viewerUsername,
              !currentCanDraw
            );
          }
        }
      });
    }
    elements.closeQuizOverlayBtn?.addEventListener("click", () => {
      clearQuizOverlayViewer();
    });
  }

  // ==================================
  // START INITIALIZATION
  // ==================================
  initializeRoom();

  window.addEventListener("beforeunload", () => {
    if (socket && socket.connected) {
      socket.emit(
        LIVE_ROOM_CONFIG.isHost ? "streamerLeaving" : "viewerLeaving",
        { roomId: LIVE_ROOM_CONFIG.roomId, username: LIVE_ROOM_CONFIG.username }
      );
      socket.disconnect();
    }
    if (peer) peer.destroy();
    if (sharedWhiteboardInstance) sharedWhiteboardInstance.destroy();
  });
  window.addEventListener("pagehide", () => {
    if (socket && socket.connected) {
      socket.emit(
        LIVE_ROOM_CONFIG.isHost ? "streamerLeaving" : "viewerLeaving",
        { roomId: LIVE_ROOM_CONFIG.roomId, username: LIVE_ROOM_CONFIG.username }
      );
      socket.disconnect();
    }
    if (peer) peer.destroy();
    if (sharedWhiteboardInstance) sharedWhiteboardInstance.destroy();
  });
}); // End DOMContentLoaded
