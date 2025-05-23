// /public/js/liveRoom-viewer.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Lib Checks & Config ---
  if (
    typeof gsap === "undefined" ||
    typeof io === "undefined" ||
    typeof Peer === "undefined" ||
    typeof tsParticles === "undefined" ||
    typeof marked === "undefined" ||
    typeof katex === "undefined"
  ) {
    console.error(
      "Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles, Marked, KaTeX) not loaded!"
    );
    document.body.innerHTML =
      '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên. Vui lòng thử lại.</p>';
    return;
  }
  gsap.registerPlugin(ScrollTrigger); // Register if needed for other effects later
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
    whiteboardOverlayViewer: document.getElementById(
      "whiteboardContainerOverlayViewer"
    ),
    whiteboardCanvasViewer: document.getElementById("whiteboardCanvasViewer"),
    whiteboardToolbarViewer: document.getElementById("whiteboardToolbarViewer"),
    closeWhiteboardBtnViewer: document.getElementById(
      "closeWhiteboardBtnViewer"
    ),
    wbColorPickerViewer: document.getElementById("wbColorPickerViewer"),
    wbLineWidthRangeViewer: document.getElementById("wbLineWidthRangeViewer"),
    wbLineWidthValueDisplayViewer: document.getElementById(
      "wbLineWidthValueDisplayViewer"
    ),
    wbEraserModeBtnViewer: document.getElementById("wbEraserModeBtnViewer"),
    toggleViewerWhiteboardDisplayBtn: document.getElementById(
      "toggleViewerWhiteboardDisplayBtn"
    ),
    // ---- Start: Quiz Elements Viewer ----
    viewerQuizOverlay: document.getElementById("viewerQuizOverlay"),
    quizQuestionViewerText: document.getElementById("quizQuestionViewerText"),
    quizOptionsViewerContainer: document.getElementById(
      "quizOptionsViewerContainer"
    ),
    quizViewerFeedback: document.getElementById("quizViewerFeedback"),
    closeQuizOverlayBtn: document.getElementById("closeQuizOverlayBtn"),
    // ---- End: Quiz Elements Viewer ----
  };

  // --- State ---
  let viewerPeer = null;
  let currentCall = null;
  let socket = null;
  let wbCtxViewer = null;
  let isWhiteboardGloballyVisible = false;
  let isWhiteboardLocallyVisible = false;
  let viewerCanDrawOnWhiteboard = false;
  let isDrawingOnViewerWhiteboard = false;
  let wbViewerLastX = 0;
  let wbViewerLastY = 0;
  let wbViewerCurrentColor = "#FFFFFF";
  let wbViewerCurrentLineWidth = 3;
  let wbViewerIsEraserMode = false;
  let wbViewerEventThrottleTimer = null;
  const WB_VIEWER_THROTTLE_INTERVAL = 16;
  const WB_VIEWER_ERASER_COLOR = "#202333";
  let wbViewerDrawingHistoryForRedraw = [];

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
    initViewerWhiteboard();
    initUIEventListeners();
    initBackgroundParticles();
    initPageAnimations();

    if (elements.toggleViewerWhiteboardDisplayBtn) {
      elements.toggleViewerWhiteboardDisplayBtn.disabled =
        !isWhiteboardGloballyVisible;
      if (isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) {
        elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
          '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
        elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
      } else {
        elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
          '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
        elements.toggleViewerWhiteboardDisplayBtn.title =
          "Hiện bảng vẽ (nếu streamer đang bật)";
      }
    }

    if (elements.whiteboardToolbarViewer) {
      const shouldToolbarBeVisible =
        isWhiteboardGloballyVisible && isWhiteboardLocallyVisible;
      elements.whiteboardToolbarViewer.style.display = shouldToolbarBeVisible
        ? "flex"
        : "none";
      if (shouldToolbarBeVisible) {
        const drawingTools = [
          elements.wbColorPickerViewer,
          elements.wbLineWidthRangeViewer,
          elements.wbEraserModeBtnViewer,
        ];
        drawingTools.forEach((tool) => {
          if (tool) tool.disabled = !viewerCanDrawOnWhiteboard;
        });

        let permissionMsgEl =
          elements.whiteboardToolbarViewer.querySelector(".wb-permission-msg");
        if (!viewerCanDrawOnWhiteboard && !permissionMsgEl) {
          permissionMsgEl = document.createElement("span");
          permissionMsgEl.className = "wb-permission-msg";
          permissionMsgEl.textContent = "Bạn chưa có quyền vẽ";
          permissionMsgEl.style.color = "var(--warning-color)";
          permissionMsgEl.style.fontStyle = "italic";
          permissionMsgEl.style.fontSize = "0.8em";
          permissionMsgEl.style.marginLeft = "auto";
          elements.whiteboardToolbarViewer.appendChild(permissionMsgEl);
        } else if (viewerCanDrawOnWhiteboard && permissionMsgEl) {
          permissionMsgEl.remove();
        }

        if (elements.wbEraserModeBtnViewer && !viewerCanDrawOnWhiteboard) {
          elements.wbEraserModeBtnViewer.classList.remove("active");
          wbViewerIsEraserMode = false;
        }
        if (elements.closeWhiteboardBtnViewer)
          elements.closeWhiteboardBtnViewer.disabled = false;
      }
    }
    console.log("Viewer Initialization Complete.");
  }

  // ==================================
  // ANIMATIONS & EFFECTS
  // ==================================
  function initPageAnimations() {
    if (prefersReducedMotion) {
      gsap.set(
        "[data-animate], .live-room-main-header, .live-video-area, .live-chat-area",
        { autoAlpha: 1 }
      );
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
        { duration: 0.9, x: -50, autoAlpha: 0, ease: "power3.out" },
        "-=0.4"
      )
      .from(
        ".live-chat-area",
        { duration: 0.9, x: 50, autoAlpha: 0, ease: "power3.out" },
        "<"
      ) // Same time as video area
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
          autoAlpha: 1,
          stagger: 0.1,
          ease: "power1.out",
        },
        "<"
      );
    // Note: Chat messages have their own entrance animation in addChatMessage
  }

  function initBackgroundParticles() {
    if (prefersReducedMotion) return;
    const targetEl = document.getElementById("live-particles-bg");
    if (!targetEl) return;
    tsParticles
      .load("live-particles-bg", {
        fpsLimit: 45, // Slightly lower FPS for background
        particles: {
          number: { value: 30, density: { enable: true, value_area: 800 } }, // Fewer background particles
          color: { value: ["#a0a0c0", "#8a7ffb", "#6a6a8a"] }, // Muted theme colors
          shape: { type: "circle" },
          opacity: { value: { min: 0.05, max: 0.15 }, random: true },
          size: { value: { min: 1, max: 3 }, random: true },
          links: { enable: false },
          move: {
            enable: true,
            speed: 0.2,
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
    if (!element || prefersReducedMotion) return;
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

  // ==================================
  // SOCKET.IO
  // ==================================
  function initSocket() {
    if (socket && socket.connected) {
      console.log("Socket already connected.");
      return;
    }
    socket = io();

    socket.on("connect", () => {
      console.log("Viewer socket connected:", socket.id);
      if (viewerPeer && viewerPeer.id) {
        socket.emit("joinRoom", {
          roomId: liveRoomConfig.roomId,
          username: liveRoomConfig.username,
        });
        socket.emit("newViewer", {
          viewerId: viewerPeer.id,
          roomId: liveRoomConfig.roomId,
          username: liveRoomConfig.username,
        });
      } else {
        console.log("Socket connected, waiting for PeerJS...");
      }
      socket.emit("getInitialData", { roomId: liveRoomConfig.roomId });
      socket.emit("wb:requestInitialState", { roomId: liveRoomConfig.roomId });
    });
    socket.on("disconnect", (reason) => {
      console.warn("Viewer socket disconnected:", reason);
      alert("Bạn bị mất kết nối với lỗi không xác định.");
      location.href = "https://hoctap-9a3.glitch.me/live";
    });
    socket.on("connect_error", (err) =>
      console.error("Viewer Socket Error:", err.message)
    );

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
    socket.on("hostJoined", () => hideOverlay(elements.waitingOverlay));
    socket.on("roomEnded", () => {
      showOverlay(elements.endedOverlay);
      if (isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) {
        hideViewerWhiteboard(true);
      }
      isWhiteboardGloballyVisible = false;
      if (elements.toggleViewerWhiteboardDisplayBtn) {
        elements.toggleViewerWhiteboardDisplayBtn.disabled = true;
        elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
          '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
        elements.toggleViewerWhiteboardDisplayBtn.title =
          "Hiện bảng vẽ (nếu streamer đang bật)";
      }
    });
    socket.on("waiting", () => showOverlay(elements.waitingOverlay));
    socket.on("banned", (msg) => {
      alert(msg || "Bạn đã bị chặn khỏi phòng này.");
      window.location.href = "/live";
    });
    socket.on("screenShareEnded", () => handleStreamEnd());
    socket.on("initialRoomState", (state) => {
      console.log("Received initial room state:", state);
      if (state.pinnedComment) displayPinnedComment(state.pinnedComment);
      if (state.viewerCount)
        elements.viewerCount.textContent = state.viewerCount;
      if (!state.isHostPresent) showOverlay(elements.waitingOverlay);
      else hideOverlay(elements.waitingOverlay);
    });

    socket.on("wb:toggleVisibility", ({ isVisible }) => {
      const oldGlobalVisibility = isWhiteboardGloballyVisible;
      isWhiteboardGloballyVisible = isVisible;

      if (elements.toggleViewerWhiteboardDisplayBtn) {
        elements.toggleViewerWhiteboardDisplayBtn.disabled = !isVisible;
        if (!isVisible || !isWhiteboardLocallyVisible) {
          elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
            '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
          elements.toggleViewerWhiteboardDisplayBtn.title =
            "Hiện bảng vẽ (nếu streamer đang bật)";
        } else {
          elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
            '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
          elements.toggleViewerWhiteboardDisplayBtn.title =
            "Ẩn bảng vẽ (cục bộ)";
        }
      }

      if (isVisible) {
        if (!isWhiteboardLocallyVisible && oldGlobalVisibility !== isVisible) {
          showViewerWhiteboard();
          socket.emit("wb:requestInitialState", {
            roomId: liveRoomConfig.roomId,
          });
        } else if (isWhiteboardLocallyVisible) {
          if (elements.whiteboardToolbarViewer) {
            elements.whiteboardToolbarViewer.style.display = "flex";
            const drawingTools = [
              elements.wbColorPickerViewer,
              elements.wbLineWidthRangeViewer,
              elements.wbEraserModeBtnViewer,
            ];
            drawingTools.forEach((tool) => {
              if (tool) tool.disabled = !viewerCanDrawOnWhiteboard;
            });

            let permissionMsgEl =
              elements.whiteboardToolbarViewer.querySelector(
                ".wb-permission-msg"
              );
            if (!viewerCanDrawOnWhiteboard && !permissionMsgEl) {
              permissionMsgEl = document.createElement("span");
              permissionMsgEl.className = "wb-permission-msg";
              permissionMsgEl.textContent = "Bạn chưa có quyền vẽ";
              permissionMsgEl.style.color = "var(--warning-color)";
              permissionMsgEl.style.fontStyle = "italic";
              permissionMsgEl.style.fontSize = "0.8em";
              permissionMsgEl.style.marginLeft = "auto";
              elements.whiteboardToolbarViewer.appendChild(permissionMsgEl);
            } else if (viewerCanDrawOnWhiteboard && permissionMsgEl) {
              permissionMsgEl.remove();
            }

            if (elements.wbEraserModeBtnViewer && !viewerCanDrawOnWhiteboard) {
              elements.wbEraserModeBtnViewer.classList.remove("active");
              wbViewerIsEraserMode = false;
            }
            if (elements.closeWhiteboardBtnViewer)
              elements.closeWhiteboardBtnViewer.disabled = false;
          }
          resizeWhiteboardCanvasViewer(false);
        }
      } else {
        if (elements.whiteboardToolbarViewer) {
          elements.whiteboardToolbarViewer.style.display = "none";
        }
        if (isWhiteboardLocallyVisible) {
          hideViewerWhiteboard(true);
        }
      }
    });

    socket.on("wb:draw", (data) => {
      if (data && data.drawData) {
        let needsResizeBeforeDraw = false;
        if (!isWhiteboardGloballyVisible) {
          isWhiteboardGloballyVisible = true;
          if (elements.toggleViewerWhiteboardDisplayBtn)
            elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
        }
        if (!isWhiteboardLocallyVisible) {
          showViewerWhiteboard();
          needsResizeBeforeDraw = true;
        }

        const { x0, y0, x1, y1, color, lineWidth, isEraser } = data.drawData;
        const drawAction = {
          type: "draw",
          x0,
          y0,
          x1,
          y1,
          color,
          lineWidth,
          isEraser: isEraser || false,
          drawnBy: data.username || "streamer",
        };
        wbViewerDrawingHistoryForRedraw.push(drawAction);
        if (wbViewerDrawingHistoryForRedraw.length > 300)
          wbViewerDrawingHistoryForRedraw.splice(
            0,
            wbViewerDrawingHistoryForRedraw.length - 300
          );

        if (isWhiteboardLocallyVisible && !needsResizeBeforeDraw) {
          wbCtxViewer.beginPath();
          wbCtxViewer.moveTo(x0, y0);
          wbCtxViewer.lineTo(x1, y1);
          wbCtxViewer.strokeStyle = isEraser ? WB_VIEWER_ERASER_COLOR : color;
          wbCtxViewer.lineWidth = isEraser
            ? lineWidth < 10
              ? lineWidth + 10
              : lineWidth * 1.5
            : lineWidth;
          wbCtxViewer.globalCompositeOperation =
            isEraser || false ? "destination-out" : "source-over";
          wbCtxViewer.stroke();
          wbCtxViewer.closePath();
          wbCtxViewer.globalCompositeOperation = "source-over";
        }
      }
    });
    socket.on("wb:clear", () => {
      if (!isWhiteboardGloballyVisible) {
        isWhiteboardGloballyVisible = true;
        if (elements.toggleViewerWhiteboardDisplayBtn)
          elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
      }
      if (!isWhiteboardLocallyVisible) showViewerWhiteboard();
      else resizeWhiteboardCanvasViewer();

      clearViewerWhiteboard();
    });

    socket.on("wb:permissionUpdate", ({ viewerUsername, canDraw }) => {
      if (viewerUsername === liveRoomConfig.username) {
        const oldPermission = viewerCanDrawOnWhiteboard;
        viewerCanDrawOnWhiteboard = canDraw;
        console.log(
          `My drawing permission updated to: ${viewerCanDrawOnWhiteboard}`
        );

        if (
          elements.whiteboardToolbarViewer &&
          elements.whiteboardToolbarViewer.style.display === "flex"
        ) {
          const drawingTools = [
            elements.wbColorPickerViewer,
            elements.wbLineWidthRangeViewer,
            elements.wbEraserModeBtnViewer,
          ];
          drawingTools.forEach((tool) => {
            if (tool) tool.disabled = !viewerCanDrawOnWhiteboard;
          });

          let permissionMsgEl =
            elements.whiteboardToolbarViewer.querySelector(
              ".wb-permission-msg"
            );
          if (!viewerCanDrawOnWhiteboard && !permissionMsgEl) {
            permissionMsgEl = document.createElement("span");
            permissionMsgEl.className = "wb-permission-msg";
            permissionMsgEl.textContent = "Bạn chưa có quyền vẽ";
            permissionMsgEl.style.color = "var(--warning-color)";
            permissionMsgEl.style.fontStyle = "italic";
            permissionMsgEl.style.fontSize = "0.8em";
            permissionMsgEl.style.marginLeft = "auto";
            elements.whiteboardToolbarViewer.appendChild(permissionMsgEl);
          } else if (viewerCanDrawOnWhiteboard && permissionMsgEl) {
            permissionMsgEl.remove();
          }

          if (elements.wbEraserModeBtnViewer && !viewerCanDrawOnWhiteboard) {
            elements.wbEraserModeBtnViewer.classList.remove("active");
            wbViewerIsEraserMode = false;
          }
        }

        if (elements.whiteboardCanvasViewer) {
          elements.whiteboardCanvasViewer.style.cursor =
            viewerCanDrawOnWhiteboard
              ? wbViewerIsEraserMode
                ? "cell"
                : "crosshair"
              : "default";
          elements.whiteboardCanvasViewer.classList.toggle(
            "can-draw",
            viewerCanDrawOnWhiteboard
          );
        }
      }
    });

    socket.on("wb:initState", (state) => {
      console.log("Viewer received initial whiteboard state", state);
      isWhiteboardGloballyVisible = true;
      if (elements.toggleViewerWhiteboardDisplayBtn)
        elements.toggleViewerWhiteboardDisplayBtn.disabled = false;

      if (!isWhiteboardLocallyVisible) {
        showViewerWhiteboard();
      } else {
        resizeWhiteboardCanvasViewer(false);
      }

      wbViewerDrawingHistoryForRedraw = [];

      if (state && state.history && Array.isArray(state.history)) {
        wbViewerDrawingHistoryForRedraw = state.history.map((item) => ({
          ...item,
        }));

        if (isWhiteboardLocallyVisible) {
          resizeWhiteboardCanvasViewer(false);
        }
        console.log(
          "Viewer whiteboard state restored from received history. Items:",
          wbViewerDrawingHistoryForRedraw.length
        );
      } else if (state && state.dataUrl) {
        wbViewerDrawingHistoryForRedraw = [
          { type: "image", dataUrl: state.dataUrl, drawnBy: "server" },
        ];
        if (isWhiteboardLocallyVisible) {
          resizeWhiteboardCanvasViewer(false);
        }
        console.log(
          "Viewer whiteboard state restored from Data URL (history not available)."
        );
      } else {
        if (isWhiteboardLocallyVisible) {
          wbCtxViewer.clearRect(
            0,
            0,
            elements.whiteboardCanvasViewer.width,
            elements.whiteboardCanvasViewer.height
          );
        }
        console.log(
          "Received empty or invalid initial whiteboard state. Cleared local whiteboard."
        );
      }
    });

    // ---- Start: Viewer Quiz Socket Listeners ----
    socket.on("quiz:newQuestion", ({ questionId, text, options }) => {
      displayQuizQuestion(questionId, text, options);
    });

    socket.on("quiz:answerSubmitted", ({ questionId, answerIndex }) => {
      if (questionId === currentQuizIdViewer) {
        selectedAnswerIndexViewer = answerIndex;
        if (elements.quizViewerFeedback)
          elements.quizViewerFeedback.textContent =
            "Đã ghi nhận câu trả lời của bạn.";

        const optionButtons =
          elements.quizOptionsViewerContainer.querySelectorAll(
            ".quiz-option-btn-viewer"
          );
        optionButtons.forEach((button) => {
          const optIdx = parseInt(button.dataset.optionIndex, 10);
          if (optIdx !== answerIndex) {
            button.disabled = true;
            button.style.opacity = "0.7";
          } else {
            button.style.fontWeight = "bold";
          }
        });
      }
    });

    socket.on(
      "quiz:correctAnswer",
      ({ questionId, correctAnswerIndex, results }) => {
        if (questionId === currentQuizIdViewer) {
          showQuizResultViewer(questionId, correctAnswerIndex, results);
        }
      }
    );

    socket.on("quiz:clearCurrent", () => {
      if (
        elements.viewerQuizOverlay &&
        elements.quizQuestionViewerText &&
        elements.quizOptionsViewerContainer
      ) {
        elements.quizQuestionViewerText.textContent =
          "Chờ câu hỏi tiếp theo...";
        elements.quizOptionsViewerContainer.innerHTML = "";
        if (elements.quizViewerFeedback)
          elements.quizViewerFeedback.textContent = "";
      }
      currentQuizIdViewer = null;
      selectedAnswerIndexViewer = null;
      // Keep overlay visible if it was already, or hide if preferred
      // For now, it stays until quiz:ended or new question
    });

    socket.on("quiz:ended", () => {
      clearQuizOverlayViewer();
      if (typeof showAlert === "function")
        showAlert("Phiên trắc nghiệm đã kết thúc.", "info", 3000);
    });

    socket.on("quiz:error", (errorMessage) => {
      if (typeof showAlert === "function") showAlert(errorMessage, "error");
      if (
        elements.quizOptionsViewerContainer &&
        currentQuizIdViewer &&
        selectedAnswerIndexViewer !== null
      ) {
        const optionButtons =
          elements.quizOptionsViewerContainer.querySelectorAll(
            ".quiz-option-btn-viewer"
          );
        let hasCorrectAnswerBeenShown = false;
        optionButtons.forEach((btn) => {
          if (btn.innerHTML.includes("ĐÚNG")) hasCorrectAnswerBeenShown = true;
        });
        if (!hasCorrectAnswerBeenShown) {
          optionButtons.forEach((button) => {
            button.disabled = false;
            button.style.opacity = "1";
            button.classList.remove("selected");
            button.style.fontWeight = "normal";
          });
          if (elements.quizViewerFeedback)
            elements.quizViewerFeedback.textContent =
              "Có lỗi xảy ra, vui lòng thử chọn lại.";
          selectedAnswerIndexViewer = null; // Allow re-selection
        }
      }
    });
    // ---- End: Viewer Quiz Socket Listeners ----
  }

  // ==================================
  // PEERJS
  // ==================================
  function initPeer() {
    viewerPeer = new Peer(undefined, liveRoomConfig.peerConfig); // Let PeerJS assign ID

    viewerPeer.on("open", (id) => {
      console.log("Viewer PeerJS open with ID:", id);
      // Send ID to server via Socket.IO *if socket is ready*
      if (socket && socket.connected) {
        socket.emit("newViewer", {
          viewerId: id,
          roomId: liveRoomConfig.roomId,
          username: liveRoomConfig.username,
        });
      } else {
        console.log("PeerJS opened, waiting for socket connection to send ID.");
        // Socket 'connect' handler will send it once ready
      }
    });

    viewerPeer.on("call", (call) => {
      console.log("Viewer received incoming call from host");
      hideOverlay(elements.waitingOverlay); // Hide waiting overlay
      hideOverlay(elements.playOverlay); // Hide play overlay if present

      // Answer the call (don't send any stream back)
      call.answer();

      // Handle stream from host
      call.on("stream", (hostStream) => {
        console.log("Viewer received stream from host.");
        if (elements.liveVideo) {
          elements.liveVideo.srcObject = hostStream;
          elements.liveVideo.muted = false; // Ensure viewer can hear
          handleStreamStart(); // Update UI
          elements.liveVideo.play().catch((e) => {
            console.warn("Video autoplay failed, showing play button.", e);
            showOverlay(elements.playOverlay); // Show play overlay if autoplay fails
          });
        }
      });

      call.on("close", () => {
        console.log("Call closed by host.");
        handleStreamEnd();
      });
      call.on("error", (err) => {
        console.error("Call error on viewer side:", err);
        handleStreamEnd();
        showAlert("Lỗi kết nối stream.", "error");
      });

      // Store the current call
      if (currentCall) currentCall.close(); // Close previous call if any
      currentCall = call;
    });

    viewerPeer.on("error", (err) => {
      console.error("Viewer PeerJS Error:", err);
      showAlert(`Lỗi Peer: ${err.type}`, "error");
    });
    viewerPeer.on("disconnected", () =>
      console.warn("Viewer PeerJS disconnected.")
    );
    viewerPeer.on("close", () =>
      console.log("Viewer PeerJS connection closed.")
    );
  }

  // ==================================
  // WHITEBOARD LOGIC (VIEWER)
  // ==================================
  function resizeWhiteboardCanvasViewer(triggeredByNewDrawEvent = false) {
    // Thêm cờ
    if (
      !elements.whiteboardOverlayViewer ||
      !elements.whiteboardCanvasViewer ||
      !wbCtxViewer
    )
      return;

    const toolbarIsVisible =
      elements.whiteboardToolbarViewer &&
      elements.whiteboardToolbarViewer.style.display !== "none";
    const toolbarHeight = toolbarIsVisible
      ? elements.whiteboardToolbarViewer.offsetHeight
      : 0;
    const overlayPadding = 10;

    const availableWidth =
      elements.whiteboardOverlayViewer.clientWidth - 2 * overlayPadding;
    const availableHeight =
      elements.whiteboardOverlayViewer.clientHeight -
      toolbarHeight -
      2 * overlayPadding -
      (toolbarIsVisible ? 5 : 0);

    const aspectRatio = 16 / 9;
    let canvasWidth = availableWidth;
    let canvasHeight = canvasWidth / aspectRatio;

    if (canvasHeight > availableHeight) {
      canvasHeight = availableHeight;
      canvasWidth = canvasHeight * aspectRatio;
    }
    if (canvasWidth > availableWidth) {
      canvasWidth = availableWidth;
      canvasHeight = canvasWidth / aspectRatio;
    }

    canvasWidth = Math.max(10, canvasWidth);
    canvasHeight = Math.max(10, canvasHeight);

    // Chỉ thay đổi buffer canvas nếu kích thước thực sự thay đổi
    // Hoặc nếu đây là lần đầu resize (ví dụ, khi showWhiteboard)
    const oldWidth = elements.whiteboardCanvasViewer.width;
    const oldHeight = elements.whiteboardCanvasViewer.height;

    let dimensionsChanged =
      oldWidth !== canvasWidth || oldHeight !== canvasHeight;

    if (dimensionsChanged) {
      elements.whiteboardCanvasViewer.width = canvasWidth;
      elements.whiteboardCanvasViewer.height = canvasHeight;
    }

    // CSS dimensions luôn được cập nhật để canvas hiển thị đúng trong layout
    elements.whiteboardCanvasViewer.style.width = `${canvasWidth}px`;
    elements.whiteboardCanvasViewer.style.height = `${canvasHeight}px`;

    if (elements.whiteboardToolbarViewer && toolbarIsVisible) {
      elements.whiteboardToolbarViewer.style.width = `${canvasWidth}px`;
    }

    wbCtxViewer.lineCap = "round";
    wbCtxViewer.lineJoin = "round";
    wbCtxViewer.globalCompositeOperation = "source-over";

    // Chỉ clear và vẽ lại toàn bộ history nếu kích thước canvas thực sự thay đổi,
    // HOẶC nếu không phải do một draw event mới kích hoạt (ví dụ, khi bật WB lần đầu, hoặc window resize thật sự).
    // Nếu là do draw event mới và kích thước không đổi, chúng ta không nên clear.
    if (dimensionsChanged || !triggeredByNewDrawEvent) {
      wbCtxViewer.clearRect(
        0,
        0,
        elements.whiteboardCanvasViewer.width,
        elements.whiteboardCanvasViewer.height
      );

      console.log(
        `Viewer WB Resized or Initial Draw. Redrawing ${wbViewerDrawingHistoryForRedraw.length} items.`
      );
      // Tạo bản sao của history để tránh thay đổi trong lúc lặp (mặc dù hiện tại không có)
      const historyToRedraw = [...wbViewerDrawingHistoryForRedraw];

      historyToRedraw.forEach((item) => {
        if (item.type === "draw") {
          // Gọi trực tiếp context để vẽ lại, không gọi drawOnViewerWhiteboard để tránh logic history/emit
          wbCtxViewer.beginPath();
          wbCtxViewer.moveTo(item.x0, item.y0);
          wbCtxViewer.lineTo(item.x1, item.y1);
          wbCtxViewer.strokeStyle = item.isEraser
            ? WB_VIEWER_ERASER_COLOR
            : item.color;
          wbCtxViewer.lineWidth = item.isEraser
            ? item.lineWidth < 10
              ? item.lineWidth + 10
              : item.lineWidth * 1.5
            : item.lineWidth;
          wbCtxViewer.globalCompositeOperation = item.isEraser
            ? "destination-out"
            : "source-over";
          wbCtxViewer.stroke();
          wbCtxViewer.closePath();
          wbCtxViewer.globalCompositeOperation = "source-over"; // Reset
        } else if (item.type === "clear") {
          wbCtxViewer.clearRect(
            0,
            0,
            elements.whiteboardCanvasViewer.width,
            elements.whiteboardCanvasViewer.height
          );
        } else if (item.type === "image" && item.dataUrl) {
          // Nếu khôi phục từ dataUrl
          const img = new Image();
          img.onload = () => {
            // Cần xử lý bất đồng bộ
            wbCtxViewer.drawImage(
              img,
              0,
              0,
              elements.whiteboardCanvasViewer.width,
              elements.whiteboardCanvasViewer.height
            );
          };
          img.src = item.dataUrl;
        }
      });
      if (dimensionsChanged)
        console.log(
          "Viewer whiteboard canvas buffer resized and history redrawn."
        );
      else
        console.log("Viewer whiteboard history redrawn (e.g. initial show).");
    }
  }

  function showViewerWhiteboard() {
    if (!elements.whiteboardOverlayViewer) return;

    isWhiteboardLocallyVisible = true;
    elements.whiteboardOverlayViewer.style.opacity = 0;
    elements.whiteboardOverlayViewer.style.display = "flex";

    if (elements.whiteboardToolbarViewer) {
      elements.whiteboardToolbarViewer.style.display = "flex"; // LUÔN HIỂN THỊ TOOLBAR KHI OVERLAY HIỂN THỊ

      // Tạo hoặc lấy phần tử hiển thị thông báo quyền
      let permissionMsgEl =
        elements.whiteboardToolbarViewer.querySelector(".wb-permission-msg");
      if (!viewerCanDrawOnWhiteboard && !permissionMsgEl) {
        permissionMsgEl = document.createElement("span");
        permissionMsgEl.className = "wb-permission-msg";
        permissionMsgEl.textContent = "Bạn chưa có quyền vẽ";
        permissionMsgEl.style.color = "var(--warning-color)";
        permissionMsgEl.style.fontStyle = "italic";
        permissionMsgEl.style.fontSize = "0.8em";
        permissionMsgEl.style.marginLeft = "auto"; // Đẩy sang phải
        elements.whiteboardToolbarViewer.appendChild(permissionMsgEl);
      } else if (viewerCanDrawOnWhiteboard && permissionMsgEl) {
        permissionMsgEl.remove(); // Xóa thông báo nếu có quyền
      }

      const drawingTools = [
        elements.wbColorPickerViewer,
        elements.wbLineWidthRangeViewer,
        elements.wbEraserModeBtnViewer,
      ];
      drawingTools.forEach((tool) => {
        if (tool) tool.disabled = !viewerCanDrawOnWhiteboard;
      });

      if (elements.wbEraserModeBtnViewer && !viewerCanDrawOnWhiteboard) {
        elements.wbEraserModeBtnViewer.classList.remove("active");
        wbViewerIsEraserMode = false; // Tắt chế độ tẩy nếu mất quyền
        if (elements.whiteboardCanvasViewer)
          elements.whiteboardCanvasViewer.style.cursor = "default";
      } else if (elements.whiteboardCanvasViewer && viewerCanDrawOnWhiteboard) {
        elements.whiteboardCanvasViewer.style.cursor = wbViewerIsEraserMode
          ? "cell"
          : "crosshair";
      }

      if (elements.closeWhiteboardBtnViewer)
        elements.closeWhiteboardBtnViewer.disabled = false;
    }

    if (elements.toggleViewerWhiteboardDisplayBtn) {
      elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
        '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
      elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
    }

    resizeWhiteboardCanvasViewer(false);

    if (!prefersReducedMotion) {
      gsap.to(elements.whiteboardOverlayViewer, {
        duration: 0.5,
        autoAlpha: 1,
        ease: "power2.out",
      });
    } else {
      gsap.set(elements.whiteboardOverlayViewer, { autoAlpha: 1 });
    }
    window.addEventListener("resize", () =>
      resizeWhiteboardCanvasViewer(false)
    );
    console.log(
      "Viewer whiteboard shown locally. Globally visible:",
      isWhiteboardGloballyVisible,
      "Can draw:",
      viewerCanDrawOnWhiteboard
    );
  }

  function hideViewerWhiteboard(isGlobalHide = false) {
    // isGlobalHide true if streamer turned it off for everyone
    if (!elements.whiteboardOverlayViewer || !isWhiteboardLocallyVisible)
      return; // Only hide if locally visible

    const onHideComplete = () => {
      isWhiteboardLocallyVisible = false; // Viewer no longer sees it
      elements.whiteboardOverlayViewer.style.display = "none";
      window.removeEventListener("resize", resizeWhiteboardCanvasViewer);
      if (elements.toggleViewerWhiteboardDisplayBtn) {
        elements.toggleViewerWhiteboardDisplayBtn.innerHTML =
          '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
        elements.toggleViewerWhiteboardDisplayBtn.title =
          "Hiện bảng vẽ (nếu streamer đang bật)";
        // Disable the button if whiteboard is not globally visible
        elements.toggleViewerWhiteboardDisplayBtn.disabled =
          !isWhiteboardGloballyVisible;
      }
      console.log(
        "Viewer whiteboard hidden locally. Global hide:",
        isGlobalHide
      );
    };

    if (!prefersReducedMotion) {
      gsap.to(elements.whiteboardOverlayViewer, {
        duration: 0.4,
        autoAlpha: 0,
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    } else {
      gsap.set(elements.whiteboardOverlayViewer, { autoAlpha: 0 });
      onHideComplete();
    }
  }

  function drawOnViewerWhiteboard(
    x0,
    y0,
    x1,
    y1,
    color,
    lineWidth,
    emitEvent = true,
    isRedrawing = false,
    isEraser = false,
    drawnBy = "streamer"
  ) {
    if (!wbCtxViewer || !isWhiteboardLocallyVisible) {
      // Phải kiểm tra isWhiteboardLocallyVisible
      // console.warn("Attempted to draw on viewer whiteboard while not locally visible or no context.");
      return;
    }

    const actualColor = isEraser ? WB_VIEWER_ERASER_COLOR : color;
    const actualLineWidth = isEraser
      ? lineWidth < 10
        ? lineWidth + 10
        : lineWidth * 1.5
      : lineWidth; // Tẩy to hơn một chút

    wbCtxViewer.beginPath();
    wbCtxViewer.moveTo(x0, y0);
    wbCtxViewer.lineTo(x1, y1);
    wbCtxViewer.strokeStyle = actualColor;
    wbCtxViewer.lineWidth = actualLineWidth;
    // Chế độ globalCompositeOperation quan trọng cho tẩy
    wbCtxViewer.globalCompositeOperation = isEraser
      ? "destination-out"
      : "source-over";
    wbCtxViewer.stroke();
    wbCtxViewer.closePath();
    wbCtxViewer.globalCompositeOperation = "source-over"; // Reset về mặc định sau khi vẽ/tẩy

    if (!isRedrawing) {
      // Chỉ thêm vào history nếu là hành động vẽ mới (không phải từ server đang vẽ lại)
      // hoặc nếu là hành động của chính viewer này (emitEvent=true)
      // Server sẽ gửi toàn bộ history khi viewer yêu cầu wb:initState
      // Viewer chỉ nên push vào history những gì *chính nó* vẽ.
      // Các nét vẽ từ người khác (streamer, viewer khác) sẽ được drawOnViewerWhiteboard trực tiếp
      // và được lưu vào wbViewerDrawingHistoryForRedraw bởi wb:initState hoặc khi vẽ lại.
      // Nếu emitEvent là true, nghĩa là viewer này tự vẽ
      if (emitEvent) {
        wbViewerDrawingHistoryForRedraw.push({
          type: "draw",
          x0,
          y0,
          x1,
          y1,
          color: actualColor,
          lineWidth: actualLineWidth,
          isEraser,
          drawnBy,
        });
        if (wbViewerDrawingHistoryForRedraw.length > 300)
          wbViewerDrawingHistoryForRedraw.splice(
            0,
            wbViewerDrawingHistoryForRedraw.length - 300
          );
      }
    } else {
      // Khi isRedrawing = true, nghĩa là đang vẽ lại từ history đã có (ví dụ sau resize)
      // không cần push lại vào history.
    }

    if (emitEvent && viewerCanDrawOnWhiteboard && socket && socket.connected) {
      socket.emit("wb:draw", {
        roomId: liveRoomConfig.roomId,
        username: liveRoomConfig.username,
        drawData: {
          x0,
          y0,
          x1,
          y1,
          color: actualColor, // Gửi màu thực tế đã dùng
          lineWidth: actualLineWidth, // Gửi độ dày thực tế
          isEraser,
        }, // Gửi trạng thái tẩy
      });
    }
  }

  function getMousePosViewer(canvas, evt) {
    // Same as streamer's getMousePos
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

  function handleViewerWhiteboardDrawStart(event) {
    if (!isWhiteboardLocallyVisible || !viewerCanDrawOnWhiteboard) return; // Check local visibility and permission
    event.preventDefault();
    isDrawingOnViewerWhiteboard = true;
    const pos = getMousePosViewer(elements.whiteboardCanvasViewer, event);
    wbViewerLastX = pos.x;
    wbViewerLastY = pos.y;

    const colorToUse = wbViewerIsEraserMode
      ? WB_VIEWER_ERASER_COLOR
      : wbViewerCurrentColor;
    const lineWidthToUse = wbViewerIsEraserMode
      ? wbViewerCurrentLineWidth + 10
      : wbViewerCurrentLineWidth;

    drawOnViewerWhiteboard(
      wbViewerLastX - 0.5,
      wbViewerLastY - 0.5,
      wbViewerLastX,
      wbViewerLastY,
      colorToUse,
      lineWidthToUse,
      true,
      false,
      wbViewerIsEraserMode,
      liveRoomConfig.username
    );
  }

  function handleViewerWhiteboardDrawing(event) {
    if (
      !isDrawingOnViewerWhiteboard ||
      !isWhiteboardLocallyVisible ||
      !viewerCanDrawOnWhiteboard
    )
      return; // Check local visibility and permission
    event.preventDefault();

    if (wbViewerEventThrottleTimer) return;
    wbViewerEventThrottleTimer = setTimeout(() => {
      const pos = getMousePosViewer(elements.whiteboardCanvasViewer, event);
      const colorToUse = wbViewerIsEraserMode
        ? WB_VIEWER_ERASER_COLOR
        : wbViewerCurrentColor;
      const lineWidthToUse = wbViewerIsEraserMode
        ? wbViewerCurrentLineWidth + 10
        : wbViewerCurrentLineWidth;

      drawOnViewerWhiteboard(
        wbViewerLastX,
        wbViewerLastY,
        pos.x,
        pos.y,
        colorToUse,
        lineWidthToUse,
        true,
        false,
        wbViewerIsEraserMode,
        liveRoomConfig.username
      );
      wbViewerLastX = pos.x;
      wbViewerLastY = pos.y;
      wbViewerEventThrottleTimer = null;
    }, WB_VIEWER_THROTTLE_INTERVAL);
  }

  function handleViewerWhiteboardDrawEnd() {
    if (
      !isDrawingOnViewerWhiteboard ||
      !isWhiteboardLocallyVisible ||
      !viewerCanDrawOnWhiteboard
    )
      return; // Check local visibility and permission
    isDrawingOnViewerWhiteboard = false;
    clearTimeout(wbViewerEventThrottleTimer);
    wbViewerEventThrottleTimer = null;
  }

  function clearViewerWhiteboard() {
    if (!wbCtxViewer || !elements.whiteboardCanvasViewer) return;
    // We still clear the canvas even if not locally visible, to keep its state synced.
    // The drawing functions will prevent drawing if not locally visible.
    wbCtxViewer.clearRect(
      0,
      0,
      elements.whiteboardCanvasViewer.width,
      elements.whiteboardCanvasViewer.height
    );
    wbViewerDrawingHistoryForRedraw.push({ type: "clear" });
    if (wbViewerDrawingHistoryForRedraw.length > 300)
      wbViewerDrawingHistoryForRedraw.splice(
        0,
        wbViewerDrawingHistoryForRedraw.length - 300
      );
    if (isWhiteboardLocallyVisible)
      console.log("Viewer whiteboard cleared by host.");
  }

  function initViewerWhiteboard() {
    if (!elements.whiteboardCanvasViewer) {
      console.error("Viewer whiteboard canvas element not found!");
      return;
    }
    wbCtxViewer = elements.whiteboardCanvasViewer.getContext("2d");
    if (!wbCtxViewer) {
      console.error("Failed to get 2D context for viewer whiteboard!");
      return;
    }
    wbCtxViewer.lineCap = "round";
    wbCtxViewer.lineJoin = "round";

    if (elements.wbColorPickerViewer)
      wbViewerCurrentColor = elements.wbColorPickerViewer.value || "#FF6EC4"; // Ensure default
    if (elements.wbLineWidthRangeViewer)
      wbViewerCurrentLineWidth = parseInt(
        elements.wbLineWidthRangeViewer.value || "3",
        10
      );
    if (elements.wbLineWidthValueDisplayViewer)
      elements.wbLineWidthValueDisplayViewer.textContent =
        wbViewerCurrentLineWidth;

    // Set initial cursor and class based on drawing permission
    if (elements.whiteboardCanvasViewer) {
      elements.whiteboardCanvasViewer.style.cursor = viewerCanDrawOnWhiteboard
        ? "crosshair"
        : "default";
      elements.whiteboardCanvasViewer.classList.toggle(
        "can-draw",
        viewerCanDrawOnWhiteboard
      );
      elements.whiteboardCanvasViewer.classList.toggle(
        "eraser-mode",
        wbViewerIsEraserMode && viewerCanDrawOnWhiteboard
      ); // Also consider eraser mode
    }

    // Desktop mouse events
    elements.whiteboardCanvasViewer.addEventListener(
      "mousedown",
      handleViewerWhiteboardDrawStart
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "mousemove",
      handleViewerWhiteboardDrawing
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "mouseup",
      handleViewerWhiteboardDrawEnd
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "mouseout",
      handleViewerWhiteboardDrawEnd
    );

    // Touch events
    elements.whiteboardCanvasViewer.addEventListener(
      "touchstart",
      handleViewerWhiteboardDrawStart,
      { passive: false }
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "touchmove",
      handleViewerWhiteboardDrawing,
      { passive: false }
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "touchend",
      handleViewerWhiteboardDrawEnd
    );
    elements.whiteboardCanvasViewer.addEventListener(
      "touchcancel",
      handleViewerWhiteboardDrawEnd
    );

    console.log(
      "Viewer Whiteboard Initialized. Can draw:",
      viewerCanDrawOnWhiteboard
    );
  }

  function displayQuizQuestion(questionId, text, options) {
    if (
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
      button.dataset.optionIndex = index;
      button.style.display = "block";
      button.style.width = "100%";
      button.style.marginBottom = "10px";
      button.style.padding = "10px";
      button.style.textAlign = "left";

      button.onclick = () => {
        if (
          !socket ||
          elements.quizOptionsViewerContainer.querySelector("button:disabled")
        ) {
          // Check if options already disabled (answer shown)
          if (
            elements.quizViewerFeedback &&
            elements.quizViewerFeedback.textContent.includes("Đáp án đúng là")
          ) {
            // If answer already shown, do nothing or provide feedback
            return;
          }
        }

        const allOptionBtns =
          elements.quizOptionsViewerContainer.querySelectorAll(
            ".quiz-option-btn-viewer"
          );
        allOptionBtns.forEach((btn) => btn.classList.remove("selected"));
        button.classList.add("selected");

        socket.emit("quiz:submitAnswer", {
          roomId: liveRoomConfig.roomId,
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
    if (!prefersReducedMotion) {
      gsap.fromTo(
        elements.viewerQuizOverlay,
        { autoAlpha: 0, y: 50 },
        { duration: 0.5, autoAlpha: 1, y: 0, ease: "back.out(1.7)" }
      );
    } else {
      gsap.set(elements.viewerQuizOverlay, { autoAlpha: 1, y: 0 });
    }
  }

  function showQuizResultViewer(questionId, correctAnswerIndex, results) {
    if (
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
    if (results) {
      Object.values(results).forEach((count) => (totalVotes += count || 0));
    }

    let feedbackText = "Đã hiển thị đáp án.";
    optionButtons.forEach((button) => {
      const optionIndex = parseInt(button.dataset.optionIndex, 10);
      button.disabled = true;

      let resultText = "";
      if (results && results[optionIndex] !== undefined) {
        const count = results[optionIndex];
        const percentage =
          totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(0) : 0; // 0 decimal for cleaner UI
        resultText = ` (${count} phiếu, ${percentage}%)`;
      }

      if (optionIndex === correctAnswerIndex) {
        button.style.borderColor = "var(--success-color, green)";
        button.style.backgroundColor =
          "rgba(var(--success-color-rgb, 80, 250, 123), 0.2)";
        button.innerHTML = `${button.textContent
          .split("(")[0]
          .trim()} <i class="fas fa-check"></i> (ĐÚNG)${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex) {
          feedbackText = "Chính xác! ";
        }
      } else {
        button.style.borderColor = "var(--danger-color, red)";
        button.style.backgroundColor =
          "rgba(var(--danger-color-rgb, 255, 85, 85), 0.1)";
        button.innerHTML = `${button.textContent
          .split("(")[0]
          .trim()}${resultText}`;
        if (selectedAnswerIndexViewer === optionIndex) {
          feedbackText = "Sai rồi! ";
        }
      }
    });
    if (elements.quizViewerFeedback) {
      if (
        selectedAnswerIndexViewer === null &&
        feedbackText.startsWith("Đã hiển thị đáp án.")
      ) {
        feedbackText = "Bạn chưa chọn đáp án. ";
      }
      const correctButton = optionButtons[correctAnswerIndex];
      if (correctButton) {
        feedbackText += `Đáp án đúng là: ${correctButton.textContent
          .split("(")[0]
          .trim()}`;
      }
      elements.quizViewerFeedback.textContent = feedbackText;
    }
  }

  function clearQuizOverlayViewer() {
    if (!elements.viewerQuizOverlay) return;

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

    if (quizOverlayVisible && !prefersReducedMotion) {
      gsap.to(elements.viewerQuizOverlay, {
        duration: 0.4,
        autoAlpha: 0,
        y: 50,
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    } else {
      gsap.set(elements.viewerQuizOverlay, { autoAlpha: 0 }); // ensure it's hidden if no animation
      onHideComplete();
    }
  }

  // ==================================
  // UI & CHAT FUNCTIONS
  // ==================================
  function scrollChatToBottom() {
    // Use the correct ID for the chat message list container based on the EJS file
    // For liveRoom.ejs (Viewer):
    const chatMessagesContainer =
      document.getElementById("chatMessagesLive")?.parentNode;
    // For streamer.ejs (Host):
    // const chatMessagesContainer = document.getElementById("chatMessagesV2")?.parentNode; // Or whatever the scrollable wrapper ID is

    if (chatMessagesContainer) {
      // A small delay can sometimes help ensure the scroll height is updated after adding a new message,
      // especially if there are complex rendering or animations.
      setTimeout(() => {
        // Check if user is scrolled up significantly - if so, don't force scroll down
        const scrollThreshold = 50; // Pixels from bottom
        const isScrolledUp =
          chatMessagesContainer.scrollHeight -
            chatMessagesContainer.scrollTop -
            chatMessagesContainer.clientHeight >
          scrollThreshold;

        if (!isScrolledUp) {
          // Option 1: Instant Scroll (Most reliable)
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

          // Option 2: Smooth Scroll with GSAP (Can sometimes be interrupted by new messages)
          // if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
          //     gsap.to(chatMessagesContainer, {
          //         duration: 0.3, // Adjust duration
          //         scrollTop: chatMessagesContainer.scrollHeight,
          //         ease: 'power1.out',
          //         overwrite: 'auto' // Allow interruption by user scroll
          //     });
          // } else {
          //     chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; // Fallback
          // }
        } else {
          console.log("User scrolled up, not forcing scroll to bottom.");
          // Optional: Show a "New message" indicator if scrolled up
        }
      }, 50); // 50ms delay - adjust if needed
    } else {
      console.warn("Chat message container not found for scrolling.");
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

    // Icon
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

    // Content Container
    const contentContainer = document.createElement("div");
    contentContainer.className = "msg-content-container";
    // Header
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
    // Body
    const bodySpan = document.createElement("span");
    bodySpan.className = "msg-body prose-styling";
    let finalHtml = content || "";
    if (type !== "system" && typeof marked !== "undefined") {
      try {
        finalHtml = marked.parse(content || "");
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = finalHtml;
        if (typeof renderMathInElement === "function")
          renderMathInElement(tempDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: !0 },
              { left: "$", right: "$", display: !1 },
              { left: "\\(", right: "\\)", display: !1 },
              { left: "\\[", right: "\\]", display: !0 },
            ],
            throwOnError: false,
          });
        finalHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in chat:", e);
        finalHtml = content;
      }
    }
    bodySpan.innerHTML = finalHtml;
    contentContainer.appendChild(bodySpan);
    li.appendChild(contentContainer);

    // Animation
    //if (!prefersReducedMotion) { gsap.from(li, { duration: 0.5, autoAlpha: 1, y: 15, ease: 'power2.out' }); }
    //else { gsap.set(li, { autoAlpha: 1 }); }

    elements.chatMessagesList?.appendChild(li);
    scrollChatToBottom(); // Scroll after adding
  }

  function displayPinnedComment(message) {
    const container = elements.pinnedCommentContainer;
    if (!container) return;

    const existingBox = container.querySelector(".pinned-box");

    if (!message || !message.content) {
      // Unpinning
      if (existingBox && !prefersReducedMotion) {
        gsap.to(existingBox, {
          duration: 0.3,
          height: 0,
          autoAlpha: 0,
          padding: 0,
          margin: 0,
          ease: "power1.in",
          onComplete: () => existingBox.remove(),
        });
      } else if (existingBox) {
        existingBox.remove();
      }
      container.classList.remove("has-content");
      return;
    }

    // Pinning or Updating
    let pinnedBox = existingBox;
    if (!pinnedBox) {
      // Create if doesn't exist
      pinnedBox = document.createElement("div");
      pinnedBox.className = "pinned-box";
      container.appendChild(pinnedBox);
      container.classList.add("has-content");
    }

    // Prepare content (Parse Markdown/KaTeX)
    let contentHtml = message.content || "";
    if (typeof marked !== "undefined") {
      try {
        contentHtml = marked.parse(contentHtml);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = contentHtml;
        if (typeof renderMathInElement === "function")
          renderMathInElement(tempDiv, {
            delimiters: [
              { left: "$$", right: "$$", display: !0 },
              { left: "$", right: "$", display: !1 },
              { left: "\\(", right: "\\)", display: !1 },
              { left: "\\[", right: "\\]", display: !0 },
            ],
            throwOnError: false,
          });
        contentHtml = tempDiv.innerHTML;
      } catch (e) {
        console.error("Marked/Katex Error in pinned:", e);
      }
    }

    pinnedBox.innerHTML = `
             <span class="pin-icon"><i class="fas fa-thumbtack"></i></span>
             <div class="pinned-content">
                 <span class="pinned-user">${message.username || "Host"}</span>
                 <span class="pinned-text prose-styling">${contentHtml}</span>
             </div>
             <span class="pinned-timestamp">${new Date(
               message.timestamp
             ).toLocaleTimeString([], {
               hour: "2-digit",
               minute: "2-digit",
             })}</span>
             ${
               liveRoomConfig.username === liveRoomConfig.roomOwner
                 ? '<button class="unpin-btn" title="Bỏ ghim"><i class="fas fa-times"></i></button>'
                 : ""
             }
         `;

    // Add unpin listener if host
    const unpinBtn = pinnedBox.querySelector(".unpin-btn");
    unpinBtn?.addEventListener("click", () => {
      if (socket)
        socket.emit("unpinComment", { roomId: liveRoomConfig.roomId });
    });

    // Animation
    if (!existingBox && !prefersReducedMotion) {
      // Animate only if newly created
      gsap.from(pinnedBox, {
        duration: 0.5,
        y: -10,
        autoAlpha: 0,
        ease: "power2.out",
      });
    }
  }

  function sendChatMessage() {
    if (!socket) {
      console.error("Socket not initialized.");
      return;
    }
    const messageContent = elements.chatInputArea.value.trim();
    if (!messageContent) return;

    // Determine message type based on viewer's status
    let messageType = liveRoomConfig.userIsPro ? "pro" : "guest";
    // Host status is determined server-side or via initial config if needed,
    // but viewers normally send as guest/pro.

    const messageObj = {
      username: liveRoomConfig.username,
      content: messageContent,
      messageType: messageType,
      timestamp: new Date().toISOString(),
    };
    socket.emit("chatMessage", {
      roomId: liveRoomConfig.roomId,
      message: messageObj,
    });
    elements.chatInputArea.value = "";
    elements.chatPreview.innerHTML = "";
    elements.chatInputArea.style.height = "auto"; // Reset height
  }

  // ==================================
  // OVERLAY & STREAM STATE HANDLING
  // ==================================
  function showOverlay(overlayElement) {
    if (!overlayElement) return;
    console.log(`Showing overlay: ${overlayElement.id}`);

    // Thêm hoặc cập nhật cursor
    if (
      overlayElement.id === "playOverlayLive" ||
      overlayElement.id === "roomEndedOverlayLive"
    ) {
      // Cho phép click toàn bộ overlay này để thực hiện hành động mặc định
      overlayElement.style.cursor = "pointer";
    } else {
      overlayElement.style.cursor = "default";
    }
    // Xóa pointer-events none nếu có, để overlay có thể nhận click
    overlayElement.style.pointerEvents = "auto";

    if (!prefersReducedMotion) {
      gsap
        .timeline()
        .set(overlayElement, { display: "flex" }) // GSAP sẽ xử lý display
        .to(overlayElement, { duration: 0.5, autoAlpha: 1, ease: "power2.out" })
        .from(
          overlayElement.querySelector(".overlay-content"),
          { duration: 0.6, scale: 0.9, autoAlpha: 0, ease: "back.out(1.7)" },
          "-=0.3"
        );
    } else {
      gsap.set(overlayElement, { display: "flex", autoAlpha: 1 });
    }
    overlayElement.classList.add("active"); // Thêm class active để CSS có thể target nếu cần
  }

  function hideOverlay(overlayElement) {
    if (!overlayElement || gsap.getProperty(overlayElement, "autoAlpha") === 0)
      return;
    console.log(`Hiding overlay: ${overlayElement.id}`);

    // Reset cursor và pointer-events khi ẩn
    overlayElement.style.cursor = "default";
    // overlayElement.style.pointerEvents = 'none'; // Có thể không cần nếu display:none

    if (!prefersReducedMotion) {
      gsap
        .timeline({
          onComplete: () => {
            gsap.set(overlayElement, { display: "none" });
            overlayElement.classList.remove("active");
          },
        })
        .to(overlayElement.querySelector(".overlay-content"), {
          duration: 0.3,
          scale: 0.9,
          autoAlpha: 0,
          ease: "power1.in",
        })
        .to(overlayElement, { duration: 0.4, autoAlpha: 0 }, "-=0.2");
    } else {
      gsap.set(overlayElement, { display: "none", autoAlpha: 0 });
      overlayElement.classList.remove("active");
    }
  }

  function handleStreamStart() {
    console.log("Handling stream start UI");
    if (elements.placeholder) elements.placeholder.classList.remove("active");
    if (elements.liveIndicator) elements.liveIndicator.classList.add("active");
    hideOverlay(elements.waitingOverlay);
    hideOverlay(elements.playOverlay);
  }

  function handleStreamEnd() {
    console.log("Handling stream end UI");
    if (elements.liveVideo && elements.liveVideo.srcObject) {
      elements.liveVideo.srcObject.getTracks().forEach((track) => track.stop());
      elements.liveVideo.srcObject = null;
    }
    if (elements.placeholder) elements.placeholder.classList.add("active"); // Show placeholder
    if (elements.liveIndicator)
      elements.liveIndicator.classList.remove("active");
    // Don't automatically show waiting overlay here, server should control that
  }

  // ==================================
  // UI EVENT LISTENERS SETUP
  // ==================================
  async function askExit() {
    const confirmed = await showArtisticConfirm(
      "Bạn có chắc muốn rời khỏi phòng live?", // Message
      "Tôi Chắc Chắn", // Confirm Text
      "Để Sau", // Cancel Text
      "fas fa-exclamation-triangle" // Icon (optional, default is question mark)
    );

    if (confirmed) {
      if (socket) socket.disconnect();
      if (viewerPeer) viewerPeer.destroy(); // Clean up peer connection
      window.location.href = "https://hoctap-9a3.glitch.me/live"; // Redirect
    } else {
      console.log("User cancelled deletion.");
    }
  }
  function initUIEventListeners() {
    elements.exitButton?.addEventListener("click", () => {
      askExit();
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
      const rawText = this.value || "";
      if (elements.chatPreview && typeof marked !== "undefined") {
        try {
          let html = marked.parse(rawText);
          elements.chatPreview.innerHTML = html;
        } catch (e) {
          elements.chatPreview.textContent = "Lỗi preview markdown";
        }
      }
    });

    elements.playButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      elements.liveVideo
        ?.play()
        .then(() => {
          hideOverlay(elements.playOverlay);
        })
        .catch((err) => {
          console.error("Manual play failed from button:", err);
          showAlert(
            "Không thể phát video tự động. Hãy thử tương tác với trang.",
            "warning"
          );
        });
    });

    elements.playOverlay?.addEventListener("click", () => {
      if (
        elements.playOverlay.classList.contains("active") &&
        elements.playButton &&
        elements.playButton.offsetParent !== null
      ) {
        console.log("Play overlay clicked directly");
        elements.liveVideo
          ?.play()
          .then(() => {
            hideOverlay(elements.playOverlay);
          })
          .catch((err) => {
            console.error("Manual play failed from overlay click:", err);
          });
      }
    });

    elements.endedOverlay?.addEventListener("click", (e) => {
      if (elements.endedOverlay.classList.contains("active")) {
        if (e.target.closest(".overlay-action-btn")) {
          return;
        }
        console.log("Room Ended overlay clicked.");
      }
    });

    elements.waitingOverlay?.addEventListener("click", () => {
      if (elements.waitingOverlay.classList.contains("active")) {
        console.log("Waiting overlay clicked - no default action.");
      }
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
            if (!elements.playOverlay.classList.contains("active")) {
              showOverlay(elements.playOverlay);
            }
          });
      }
      document.body.removeEventListener("click", startPlay);
      document.body.removeEventListener("keydown", startPlay);
    };
    document.body.addEventListener("click", startPlay);
    document.body.addEventListener("keydown", startPlay);

    elements.closeWhiteboardBtnViewer?.addEventListener("click", () => {
      if (isWhiteboardLocallyVisible) {
        hideViewerWhiteboard(false);
      }
    });

    elements.wbColorPickerViewer?.addEventListener("input", (e) => {
      if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
      wbViewerCurrentColor = e.target.value;
    });
    elements.wbLineWidthRangeViewer?.addEventListener("input", (e) => {
      if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
      wbViewerCurrentLineWidth = parseInt(e.target.value, 10);
      if (elements.wbLineWidthValueDisplayViewer)
        elements.wbLineWidthValueDisplayViewer.textContent =
          wbViewerCurrentLineWidth;
    });
    elements.wbEraserModeBtnViewer?.addEventListener("click", () => {
      if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
      wbViewerIsEraserMode = !wbViewerIsEraserMode;
      elements.wbEraserModeBtnViewer.classList.toggle(
        "active",
        wbViewerIsEraserMode
      );
      if (elements.whiteboardCanvasViewer) {
        elements.whiteboardCanvasViewer.style.cursor = wbViewerIsEraserMode
          ? "cell"
          : viewerCanDrawOnWhiteboard
          ? "crosshair"
          : "default";
        elements.whiteboardCanvasViewer.classList.toggle(
          "eraser-mode",
          wbViewerIsEraserMode
        );
      }
    });

    elements.toggleViewerWhiteboardDisplayBtn?.addEventListener("click", () => {
      if (!isWhiteboardGloballyVisible) {
        showAlert("Bảng vẽ chưa được streamer bật.", "info");
        return;
      }
      if (isWhiteboardLocallyVisible) {
        hideViewerWhiteboard(false);
      } else {
        showViewerWhiteboard();
        socket.emit("wb:requestInitialState", {
          roomId: liveRoomConfig.roomId,
        });
      }
    });

    // ---- Start: Quiz Viewer Listeners ----
    elements.closeQuizOverlayBtn?.addEventListener("click", () => {
      if (elements.viewerQuizOverlay) {
        // Only hide, don't clear data as server events will manage state.
        if (!prefersReducedMotion && quizOverlayVisible) {
          // check quizOverlayVisible
          gsap.to(elements.viewerQuizOverlay, {
            duration: 0.3,
            autoAlpha: 0,
            y: 30,
            ease: "power1.in",
            onComplete: () => {
              elements.viewerQuizOverlay.style.display = "none";
              quizOverlayVisible = false; // Update state
            },
          });
        } else {
          gsap.set(elements.viewerQuizOverlay, {
            autoAlpha: 0,
            display: "none",
          }); // ensure it's hidden
          quizOverlayVisible = false; // Update state
        }
      }
    });
    // ---- End: Quiz Viewer Listeners ----
  }

  // ==================================
  // START INITIALIZATION
  // ==================================
  initializeViewer();
}); // End DOMContentLoaded
