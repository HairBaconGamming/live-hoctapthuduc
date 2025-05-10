// /public/js/liveRoom-viewer.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Lib Checks & Config ---
    if (typeof gsap === 'undefined' || typeof io === 'undefined' || typeof Peer === 'undefined' || typeof tsParticles === 'undefined' || typeof marked === 'undefined' || typeof katex === 'undefined') {
        console.error("Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles, Marked, KaTeX) not loaded!");
        document.body.innerHTML = '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên. Vui lòng thử lại.</p>';
        return;
    }
    gsap.registerPlugin(ScrollTrigger); // Register if needed for other effects later
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Element Refs ---
    const elements = {
        viewerCount: document.getElementById('viewerCountLive'),
        chatMessagesList: document.getElementById('chatMessagesLive'),
        chatInputArea: document.getElementById('chatInputAreaLive'),
        sendChatBtn: document.getElementById('sendChatBtnLive'),
        chatPreview: document.getElementById('chatPreviewLive'),
        pinnedCommentContainer: document.getElementById('pinnedCommentLive'),
        liveVideo: document.getElementById('liveVideoFeed'),
        placeholder: document.getElementById('streamPlaceholder'),
        waitingOverlay: document.getElementById('waitingOverlayLive'),
        endedOverlay: document.getElementById('roomEndedOverlayLive'),
        playOverlay: document.getElementById('playOverlayLive'),
        playButton: document.getElementById('playButtonLive'),
        exitButton: document.getElementById('exitRoomBtnLive'),
        liveIndicator: document.getElementById('liveIndicator'),
        // --- Whiteboard Elements for Viewer ---
        whiteboardOverlayViewer: document.getElementById('whiteboardContainerOverlayViewer'), // Will be added to EJS
        whiteboardCanvasViewer: document.getElementById('whiteboardCanvasViewer'),         // Will be added to EJS
        whiteboardToolbarViewer: document.getElementById('whiteboardToolbarViewer'),       // Will be added to EJS
        closeWhiteboardBtnViewer: document.getElementById('closeWhiteboardBtnViewer'),   // Will be added to EJS
        wbColorPickerViewer: document.getElementById('wbColorPickerViewer'),
        wbLineWidthRangeViewer: document.getElementById('wbLineWidthRangeViewer'),
        wbLineWidthValueDisplayViewer: document.getElementById('wbLineWidthValueDisplayViewer'),
        wbEraserModeBtnViewer: document.getElementById('wbEraserModeBtnViewer'),
        toggleViewerWhiteboardDisplayBtn: document.getElementById('toggleViewerWhiteboardDisplayBtn'), 
    };

    // --- State ---
    let viewerPeer = null;
    let currentCall = null; // Store the single incoming call from the host
    let socket = null; // Initialize socket variable
    // --- Whiteboard State for Viewer ---
    let wbCtxViewer = null;
    let isWhiteboardGloballyVisible = false; // True if streamer has enabled whiteboard for the room
    let isWhiteboardLocallyVisible = false; // True if viewer has chosen to see it (and it's globally visible)
    let viewerCanDrawOnWhiteboard = false; 
    let isDrawingOnViewerWhiteboard = false;
    let wbViewerLastX = 0;
    let wbViewerLastY = 0;
    let wbViewerCurrentColor = '#FFFFFF';
    let wbViewerCurrentLineWidth = 3;
    let wbViewerIsEraserMode = false;
    let wbViewerEventThrottleTimer = null;
    const WB_VIEWER_THROTTLE_INTERVAL = 16; 
    const WB_VIEWER_ERASER_COLOR = '#202333'; // Matching CSS for viewer canvas
    let wbViewerDrawingHistoryForRedraw = []; 

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
            elements.toggleViewerWhiteboardDisplayBtn.disabled = !isWhiteboardGloballyVisible; 
            if (isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) { 
                elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
                elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
            } else {
                elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
                elements.toggleViewerWhiteboardDisplayBtn.title = "Hiện bảng vẽ (nếu streamer đang bật)";
            }
        }
        if (elements.whiteboardToolbarViewer) {
            elements.whiteboardToolbarViewer.style.display = (viewerCanDrawOnWhiteboard && isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) ? 'flex' : 'none';
        }

        // Attempt to notify server when viewer is leaving
        const handleBeforeUnload = (event) => {
            if (socket && socket.connected) {
                // Standard way to send data with sendBeacon if available, otherwise a quick sync XHR (less reliable)
                // However, for socket.io, a simple emit is often tried.
                // It's not guaranteed to complete.
                socket.emit('viewerLeaving', { roomId: liveRoomConfig.roomId, username: liveRoomConfig.username });
                // socket.disconnect(); // Optionally explicitly disconnect
            }
            // Some browsers require a return value for beforeunload.
            // event.preventDefault(); // Not always needed and can be annoying
            // event.returnValue = ''; // For older browsers
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        // For mobile browsers, 'pagehide' is often more reliable than 'unload' or 'beforeunload'
        // for detecting when a page is being navigated away from or put into the background.
        window.addEventListener('pagehide', (event) => {
            // The event.persisted property is true if the page is being saved for fast back/forward navigation (bfcache)
            // If !event.persisted, it means the page is likely being unloaded permanently.
            if (!event.persisted) {
                if (socket && socket.connected) {
                    socket.emit('viewerLeaving', { roomId: liveRoomConfig.roomId, username: liveRoomConfig.username });
                    // socket.disconnect(); // Optionally explicitly disconnect
                }
            }
        });


        console.log("Viewer Initialization Complete.");
    }


    // ==================================
    // ANIMATIONS & EFFECTS
    // ==================================
     function initPageAnimations() {
        if (prefersReducedMotion) {
            gsap.set('[data-animate], .live-room-main-header, .live-video-area, .live-chat-area', { autoAlpha: 1 });
            return;
        }
         const tl = gsap.timeline({delay: 0.1});
         tl.from('.live-room-main-header', { duration: 0.7, y: -60, autoAlpha: 0, ease: 'power2.out'})
           .from('.live-video-area', { duration: 0.9, x: -50, autoAlpha: 0, ease: 'power3.out'}, "-=0.4")
           .from('.live-chat-area', { duration: 0.9, x: 50, autoAlpha: 0, ease: 'power3.out'}, "<") // Same time as video area
           .from('.live-room-main-header .header-info > *', { duration: 0.5, y: -10, autoAlpha: 0, stagger: 0.1, ease: 'power1.out'}, "-=0.7")
           .from('.live-room-main-header .header-stats > *', { duration: 0.5, y: -10, autoAlpha: 1, stagger: 0.1, ease: 'power1.out'}, "<");
           // Note: Chat messages have their own entrance animation in addChatMessage
     }

     function initBackgroundParticles() {
        if (prefersReducedMotion) return;
        const targetEl = document.getElementById('live-particles-bg');
        if (!targetEl) return;
        tsParticles.load("live-particles-bg", {
            fpsLimit: 45, // Slightly lower FPS for background
            particles: {
                number: { value: 30, density: { enable: true, value_area: 800 } }, // Fewer background particles
                color: { value: ["#a0a0c0", "#8a7ffb", "#6a6a8a"] }, // Muted theme colors
                shape: { type: "circle" },
                opacity: { value: {min: 0.05, max: 0.15}, random: true },
                size: { value: {min: 1, max: 3}, random: true },
                links: { enable: false },
                move: { enable: true, speed: 0.2, direction: "none", random: true, straight: false, outModes: { default: "out" } },
            },
            interactivity: { enabled: false },
            background: { color: "transparent" },
        }).catch(error => console.error("tsParticles background error:", error));
     }

      function animateViewerCount(element) {
          if (!element || prefersReducedMotion) return;
          gsap.fromTo(element, { scale: 1.3, color: 'var(--accent-color)' }, { scale: 1, color: 'var(--text-light)', duration: 0.5, ease: 'back.out(2)' });
      }

    // ==================================
    // SOCKET.IO
    // ==================================
    function initSocket() {
        if (socket && socket.connected) { console.log("Socket already connected."); return; }
        socket = io();

        socket.on("connect", () => {
            console.log("Viewer socket connected:", socket.id);
            if (viewerPeer && viewerPeer.id) {
                 socket.emit("joinRoom", { roomId: liveRoomConfig.roomId, username: liveRoomConfig.username  });
                 socket.emit("newViewer", { viewerId: viewerPeer.id, roomId: liveRoomConfig.roomId, username: liveRoomConfig.username });
            } else {
                 console.log("Socket connected, waiting for PeerJS...");
            }
             socket.emit("getInitialData", { roomId: liveRoomConfig.roomId }); 
             socket.emit('wb:requestInitialState', { roomId: liveRoomConfig.roomId }); // Viewer requests WB state on join
        });
        socket.on("disconnect", (reason) => {console.warn("Viewer socket disconnected:", reason); alert("Bạn bị mất kết nối với lỗi không xác định."); location.href = "https://hoctap-9a3.glitch.me/live"});
        socket.on("connect_error", (err) => console.error("Viewer Socket Error:", err.message));

        // --- Handle events ---
         socket.on("userJoined", msg => addChatMessage(msg, 'system', 'join'));
         socket.on("viewerLeft", msg => addChatMessage(msg, 'system', 'left'));
         socket.on("newMessage", data => { if (data?.message?.content) addChatMessage(data.message.content, data.message.messageType || 'guest', data.message.username || 'Anonymous', new Date(data.message.timestamp || Date.now()), data.message); else console.warn("Received invalid message data:", data); });
         socket.on("updateViewers", count => { if(elements.viewerCount) elements.viewerCount.textContent = count; animateViewerCount(elements.viewerCount); });
         socket.on("commentPinned", data => displayPinnedComment(data.message));
         socket.on("commentUnpinned", () => displayPinnedComment(null));
         socket.on("hostJoined", () => hideOverlay(elements.waitingOverlay)); 
         socket.on("roomEnded", () => {
            showOverlay(elements.endedOverlay);
            if(isWhiteboardVisibleToViewer) hideViewerWhiteboard(); // Hide whiteboard if room ends
         });
         socket.on("waiting", () => showOverlay(elements.waitingOverlay)); 
         socket.on("banned", msg => { alert(msg || "Bạn đã bị chặn khỏi phòng này."); window.location.href = "/live"; });
         socket.on("screenShareEnded", () => handleStreamEnd()); 
         socket.on("initialRoomState", (state) => {
             console.log("Received initial room state:", state);
             if (state.pinnedComment) displayPinnedComment(state.pinnedComment);
             if (state.viewerCount) elements.viewerCount.textContent = state.viewerCount;
             if (!state.isHostPresent) showOverlay(elements.waitingOverlay); else hideOverlay(elements.waitingOverlay); 
         });

        // --- Whiteboard Socket Events (Viewer) ---
        socket.on('wb:toggleVisibility', ({ isVisible }) => { 
            const oldGlobalVisibility = isWhiteboardGloballyVisible;
            isWhiteboardGloballyVisible = isVisible; 
            
            if (elements.toggleViewerWhiteboardDisplayBtn) {
                elements.toggleViewerWhiteboardDisplayBtn.disabled = !isVisible; 
                if (!isVisible) { // If globally hidden, update button text to "Hiện"
                     elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
                     elements.toggleViewerWhiteboardDisplayBtn.title = "Hiện bảng vẽ (nếu streamer đang bật)";
                } else if (isWhiteboardLocallyVisible) { // If globally visible AND locally visible
                    elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
                    elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
                } else { // Globally visible but locally hidden
                    elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
                    elements.toggleViewerWhiteboardDisplayBtn.title = "Hiện bảng vẽ (nếu streamer đang bật)";
                }
            }
            if (elements.whiteboardToolbarViewer) { // Also update toolbar visibility
                elements.whiteboardToolbarViewer.style.display = (viewerCanDrawOnWhiteboard && isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) ? 'flex' : 'none';
            }


            if (isVisible) {
                // If whiteboard becomes globally visible and wasn't before,
                // and if viewer has it locally set to visible (or defaults to show when globally on)
                if (!isWhiteboardLocallyVisible && oldGlobalVisibility !== isVisible) { 
                    // Default to show if streamer turns it on, unless viewer explicitly hid it before while it was on
                    showViewerWhiteboard();
                    socket.emit('wb:requestInitialState', { roomId: liveRoomConfig.roomId });
                } else if (isWhiteboardLocallyVisible) {
                    // It's already locally visible, ensure canvas is sized
                    resizeWhiteboardCanvasViewer();
                }
            } else {
                // Streamer turned it off globally. Force hide for viewer.
                if (isWhiteboardLocallyVisible) { // Only hide if it was locally visible
                    hideViewerWhiteboard(true); 
                }
            }
        });

        socket.on('wb:draw', (data) => { 
            if (data && data.drawData) {
                if (!isWhiteboardGloballyVisible) { // If streamer just enabled it, make it globally visible
                    isWhiteboardGloballyVisible = true;
                     if (elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
                }
                if (!isWhiteboardLocallyVisible) showViewerWhiteboard(); 
                else resizeWhiteboardCanvasViewer(); // Ensure canvas is ready
                
                drawOnViewerWhiteboard(data.drawData.x0, data.drawData.y0, data.drawData.x1, data.drawData.y1, data.drawData.color, data.drawData.lineWidth, false, false, data.drawData.isEraser || false, data.username || 'unknown');
            }
        });
        socket.on('wb:clear', () => {
            if (!isWhiteboardGloballyVisible) {
                isWhiteboardGloballyVisible = true;
                if (elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = false;
            }
            if (!isWhiteboardLocallyVisible) showViewerWhiteboard();
            else resizeWhiteboardCanvasViewer();

            clearViewerWhiteboard();
        });

        socket.on('wb:permissionUpdate', ({ viewerUsername, canDraw }) => {
            if (viewerUsername === liveRoomConfig.username) {
                viewerCanDrawOnWhiteboard = canDraw;
                console.log(`My drawing permission updated to: ${viewerCanDrawOnWhiteboard}`);
                if (elements.whiteboardToolbarViewer) { 
                    elements.whiteboardToolbarViewer.style.display = (viewerCanDrawOnWhiteboard && isWhiteboardLocallyVisible && isWhiteboardGloballyVisible) ? 'flex' : 'none';
                }
                if (elements.whiteboardCanvasViewer) { // Update cursor
                    elements.whiteboardCanvasViewer.style.cursor = viewerCanDrawOnWhiteboard ? (wbViewerIsEraserMode ? 'cell' : 'crosshair') : 'default';
                    elements.whiteboardCanvasViewer.classList.toggle('can-draw', viewerCanDrawOnWhiteboard);
                }
            }
        });
        
       socket.on('wb:initState', (state) => {
            console.log("Viewer received initial whiteboard state", state);
            isWhiteboardGloballyVisible = true; // Receiving state means it's globally active
            if (elements.toggleViewerWhiteboardDisplayBtn) elements.toggleViewerWhiteboardDisplayBtn.disabled = false;

            if (!isWhiteboardLocallyVisible) showViewerWhiteboard(); 
            else resizeWhiteboardCanvasViewer(); 

            wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
            wbViewerDrawingHistoryForRedraw = []; 

            if (state && state.history && Array.isArray(state.history)) {
                state.history.forEach(item => {
                    if (item.type === 'draw') {
                        drawOnViewerWhiteboard(item.x0, item.y0, item.x1, item.y1, item.color, item.lineWidth, false, true, item.isEraser || false, item.drawnBy || 'streamer');
                    } else if (item.type === 'clear') {
                        wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
                        wbViewerDrawingHistoryForRedraw = [];
                    }
                });
                 console.log("Viewer whiteboard state restored from history.");
            } else if (state && state.dataUrl) {
                 const img = new Image();
                 img.onload = () => {
                     wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
                     wbCtxViewer.drawImage(img, 0, 0);
                     console.log("Viewer whiteboard state restored from Data URL.");
                 };
                 img.src = state.dataUrl;
            }
        });
    }

    // ==================================
    // PEERJS
    // ==================================
    function initPeer() {
        viewerPeer = new Peer(undefined, liveRoomConfig.peerConfig); // Let PeerJS assign ID

        viewerPeer.on('open', id => {
            console.log('Viewer PeerJS open with ID:', id);
            // Send ID to server via Socket.IO *if socket is ready*
            if (socket && socket.connected) {
                 socket.emit("newViewer", { viewerId: id, roomId: liveRoomConfig.roomId, username: liveRoomConfig.username });
            } else {
                 console.log("PeerJS opened, waiting for socket connection to send ID.");
                 // Socket 'connect' handler will send it once ready
            }
        });

        viewerPeer.on('call', call => {
             console.log("Viewer received incoming call from host");
             hideOverlay(elements.waitingOverlay); // Hide waiting overlay
             hideOverlay(elements.playOverlay);   // Hide play overlay if present

             // Answer the call (don't send any stream back)
             call.answer();

             // Handle stream from host
             call.on('stream', hostStream => {
                 console.log("Viewer received stream from host.");
                 if(elements.liveVideo) {
                     elements.liveVideo.srcObject = hostStream;
                      elements.liveVideo.muted = false; // Ensure viewer can hear
                      handleStreamStart(); // Update UI
                      elements.liveVideo.play().catch(e => {
                          console.warn("Video autoplay failed, showing play button.", e);
                          showOverlay(elements.playOverlay); // Show play overlay if autoplay fails
                      });
                 }
             });

             call.on('close', () => {
                 console.log("Call closed by host.");
                 handleStreamEnd();
             });
             call.on('error', err => {
                 console.error('Call error on viewer side:', err);
                 handleStreamEnd();
                 showAlert("Lỗi kết nối stream.", "error");
             });

             // Store the current call
              if (currentCall) currentCall.close(); // Close previous call if any
             currentCall = call;
         });

         viewerPeer.on('error', err => { console.error('Viewer PeerJS Error:', err); showAlert(`Lỗi Peer: ${err.type}`, 'error'); });
         viewerPeer.on('disconnected', () => console.warn('Viewer PeerJS disconnected.'));
         viewerPeer.on('close', () => console.log('Viewer PeerJS connection closed.'));
    }

    // ==================================
    // WHITEBOARD LOGIC (VIEWER)
    // ==================================
    function resizeWhiteboardCanvasViewer() {
        if (!elements.whiteboardOverlayViewer || !elements.whiteboardCanvasViewer || !wbCtxViewer) return;

        const toolbarHeight = elements.whiteboardToolbarViewer ? elements.whiteboardToolbarViewer.offsetHeight : 0;
        const overlayPadding = 20; 
        
        const availableWidth = elements.whiteboardOverlayViewer.clientWidth - (2 * overlayPadding);
        const availableHeight = elements.whiteboardOverlayViewer.clientHeight - toolbarHeight - (2 * overlayPadding) - 10;

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

        elements.whiteboardCanvasViewer.width = canvasWidth;
        elements.whiteboardCanvasViewer.height = canvasHeight;
        elements.whiteboardCanvasViewer.style.width = `${canvasWidth}px`;
        elements.whiteboardCanvasViewer.style.height = `${canvasHeight}px`;
        
        if (elements.whiteboardToolbarViewer) {
            elements.whiteboardToolbarViewer.style.width = `${canvasWidth}px`;
        }

        wbCtxViewer.lineCap = 'round';
        wbCtxViewer.lineJoin = 'round';
        wbCtxViewer.globalCompositeOperation = 'source-over'; 

        // Redraw local history if needed (e.g., after resize)
        const tempHistory = [...wbViewerDrawingHistoryForRedraw];
        wbViewerDrawingHistoryForRedraw = []; 
        wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
        tempHistory.forEach(item => {
            if (item.type === 'draw') {
                drawOnViewerWhiteboard(item.x0, item.y0, item.x1, item.y1, item.color, item.lineWidth, false, true, item.isEraser || false);
            } else if (item.type === 'clear') {
                wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
                wbViewerDrawingHistoryForRedraw = [];
            }
        });
        console.log("Viewer whiteboard canvas resized.");
    }

    function showViewerWhiteboard() { // Now only called when it *should* be shown
        if (!elements.whiteboardOverlayViewer) return;
        
        isWhiteboardLocallyVisible = true; // Viewer chooses to see it
        elements.whiteboardOverlayViewer.style.opacity = 0;
        elements.whiteboardOverlayViewer.style.display = 'flex';
        
        if (elements.whiteboardToolbarViewer) {
            elements.whiteboardToolbarViewer.style.display = viewerCanDrawOnWhiteboard ? 'flex' : 'none';
        }
        if (elements.toggleViewerWhiteboardDisplayBtn) { // Update the local toggle button's appearance
            elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn Bảng Vẽ';
            elements.toggleViewerWhiteboardDisplayBtn.title = "Ẩn bảng vẽ (cục bộ)";
        }

        resizeWhiteboardCanvasViewer(); 

        if (!prefersReducedMotion) {
            gsap.to(elements.whiteboardOverlayViewer, { duration: 0.5, autoAlpha: 1, ease: 'power2.out' });
        } else {
            gsap.set(elements.whiteboardOverlayViewer, { autoAlpha: 1 });
        }
        window.addEventListener('resize', resizeWhiteboardCanvasViewer);
        console.log("Viewer whiteboard shown locally. Globally visible:", isWhiteboardGloballyVisible, "Can draw:", viewerCanDrawOnWhiteboard);
    }

    function hideViewerWhiteboard(isGlobalHide = false) { // isGlobalHide true if streamer turned it off for everyone
        if (!elements.whiteboardOverlayViewer || !isWhiteboardLocallyVisible) return; // Only hide if locally visible
        
        const onHideComplete = () => {
            isWhiteboardLocallyVisible = false; // Viewer no longer sees it
            elements.whiteboardOverlayViewer.style.display = 'none';
            window.removeEventListener('resize', resizeWhiteboardCanvasViewer);
            if (elements.toggleViewerWhiteboardDisplayBtn) {
                elements.toggleViewerWhiteboardDisplayBtn.innerHTML = '<i class="fas fa-chalkboard"></i> Hiện Bảng Vẽ';
                 elements.toggleViewerWhiteboardDisplayBtn.title = "Hiện bảng vẽ (nếu streamer đang bật)";
                 // Disable the button if whiteboard is not globally visible
                 elements.toggleViewerWhiteboardDisplayBtn.disabled = !isWhiteboardGloballyVisible;
            }
            console.log("Viewer whiteboard hidden locally. Global hide:", isGlobalHide);
        };

        if (!prefersReducedMotion) {
            gsap.to(elements.whiteboardOverlayViewer, { duration: 0.4, autoAlpha: 0, ease: 'power1.in', onComplete: onHideComplete });
        } else {
            gsap.set(elements.whiteboardOverlayViewer, { autoAlpha: 0 });
            onHideComplete();
        }
    }

function drawOnViewerWhiteboard(x0, y0, x1, y1, color, lineWidth, emitEvent = true, isRedrawing = false, isEraser = false, drawnBy = 'streamer') {
        if (!wbCtxViewer || !isWhiteboardLocallyVisible) return; // Check if locally visible

        const actualColor = isEraser ? WB_VIEWER_ERASER_COLOR : color;
        const actualLineWidth = isEraser ? lineWidth + 10 : lineWidth;

        wbCtxViewer.beginPath();
        wbCtxViewer.moveTo(x0, y0);
        wbCtxViewer.lineTo(x1, y1);
        wbCtxViewer.strokeStyle = actualColor;
        wbCtxViewer.lineWidth = actualLineWidth;
        wbCtxViewer.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        wbCtxViewer.stroke();
        wbCtxViewer.closePath();
        wbCtxViewer.globalCompositeOperation = 'source-over';

        if (!isRedrawing) { 
            wbViewerDrawingHistoryForRedraw.push({ type: 'draw', x0, y0, x1, y1, color: actualColor, lineWidth: actualLineWidth, isEraser, drawnBy });
             if (wbViewerDrawingHistoryForRedraw.length > 300) wbViewerDrawingHistoryForRedraw.splice(0, wbViewerDrawingHistoryForRedraw.length - 300);
        }

        if (emitEvent && viewerCanDrawOnWhiteboard && socket && socket.connected) {
            socket.emit('wb:draw', { 
                roomId: liveRoomConfig.roomId,
                username: liveRoomConfig.username, 
                drawData: { x0, y0, x1, y1, color: actualColor, lineWidth: actualLineWidth, isEraser }
            });
        }
    }
    
    function getMousePosViewer(canvas, evt) { // Same as streamer's getMousePos
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
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function handleViewerWhiteboardDrawStart(event) {
        if (!isWhiteboardLocallyVisible || !viewerCanDrawOnWhiteboard) return; // Check local visibility and permission
        event.preventDefault();
        isDrawingOnViewerWhiteboard = true;
        const pos = getMousePosViewer(elements.whiteboardCanvasViewer, event);
        wbViewerLastX = pos.x;
        wbViewerLastY = pos.y;

        const colorToUse = wbViewerIsEraserMode ? WB_VIEWER_ERASER_COLOR : wbViewerCurrentColor;
        const lineWidthToUse = wbViewerIsEraserMode ? wbViewerCurrentLineWidth + 10 : wbViewerCurrentLineWidth;
        
        drawOnViewerWhiteboard(wbViewerLastX - 0.5, wbViewerLastY - 0.5, wbViewerLastX, wbViewerLastY, colorToUse, lineWidthToUse, true, false, wbViewerIsEraserMode, liveRoomConfig.username);
    }

    function handleViewerWhiteboardDrawing(event) {
        if (!isDrawingOnViewerWhiteboard || !isWhiteboardLocallyVisible || !viewerCanDrawOnWhiteboard) return; // Check local visibility and permission
        event.preventDefault();

        if (wbViewerEventThrottleTimer) return;
        wbViewerEventThrottleTimer = setTimeout(() => {
            const pos = getMousePosViewer(elements.whiteboardCanvasViewer, event);
            const colorToUse = wbViewerIsEraserMode ? WB_VIEWER_ERASER_COLOR : wbViewerCurrentColor;
            const lineWidthToUse = wbViewerIsEraserMode ? wbViewerCurrentLineWidth + 10 : wbViewerCurrentLineWidth;

            drawOnViewerWhiteboard(wbViewerLastX, wbViewerLastY, pos.x, pos.y, colorToUse, lineWidthToUse, true, false, wbViewerIsEraserMode, liveRoomConfig.username);
            wbViewerLastX = pos.x;
            wbViewerLastY = pos.y;
            wbViewerEventThrottleTimer = null;
        }, WB_VIEWER_THROTTLE_INTERVAL);
    }

    function handleViewerWhiteboardDrawEnd() {
        if (!isDrawingOnViewerWhiteboard || !isWhiteboardLocallyVisible || !viewerCanDrawOnWhiteboard) return; // Check local visibility and permission
        isDrawingOnViewerWhiteboard = false;
        clearTimeout(wbViewerEventThrottleTimer);
        wbViewerEventThrottleTimer = null;
    }

    function clearViewerWhiteboard() { 
        if (!wbCtxViewer || !elements.whiteboardCanvasViewer) return;
        // We still clear the canvas even if not locally visible, to keep its state synced.
        // The drawing functions will prevent drawing if not locally visible.
        wbCtxViewer.clearRect(0, 0, elements.whiteboardCanvasViewer.width, elements.whiteboardCanvasViewer.height);
        wbViewerDrawingHistoryForRedraw.push({ type: 'clear' }); 
        if (wbViewerDrawingHistoryForRedraw.length > 300) wbViewerDrawingHistoryForRedraw.splice(0, wbViewerDrawingHistoryForRedraw.length - 300);
        if (isWhiteboardLocallyVisible) console.log("Viewer whiteboard cleared by host.");
    }

    function initViewerWhiteboard() {
        if (!elements.whiteboardCanvasViewer) {
            console.error("Viewer whiteboard canvas element not found!");
            return;
        }
        wbCtxViewer = elements.whiteboardCanvasViewer.getContext('2d');
        if (!wbCtxViewer) {
            console.error("Failed to get 2D context for viewer whiteboard!");
            return;
        }
        wbCtxViewer.lineCap = 'round';
        wbCtxViewer.lineJoin = 'round';

        if(elements.wbColorPickerViewer) wbViewerCurrentColor = elements.wbColorPickerViewer.value || '#FF6EC4'; // Ensure default
        if(elements.wbLineWidthRangeViewer) wbViewerCurrentLineWidth = parseInt(elements.wbLineWidthRangeViewer.value || '3', 10);
        if(elements.wbLineWidthValueDisplayViewer) elements.wbLineWidthValueDisplayViewer.textContent = wbViewerCurrentLineWidth;

        // Set initial cursor and class based on drawing permission
        if (elements.whiteboardCanvasViewer) {
            elements.whiteboardCanvasViewer.style.cursor = viewerCanDrawOnWhiteboard ? 'crosshair' : 'default';
            elements.whiteboardCanvasViewer.classList.toggle('can-draw', viewerCanDrawOnWhiteboard);
            elements.whiteboardCanvasViewer.classList.toggle('eraser-mode', wbViewerIsEraserMode && viewerCanDrawOnWhiteboard); // Also consider eraser mode
        }

        // Desktop mouse events
        elements.whiteboardCanvasViewer.addEventListener('mousedown', handleViewerWhiteboardDrawStart);
        elements.whiteboardCanvasViewer.addEventListener('mousemove', handleViewerWhiteboardDrawing);
        elements.whiteboardCanvasViewer.addEventListener('mouseup', handleViewerWhiteboardDrawEnd);
        elements.whiteboardCanvasViewer.addEventListener('mouseout', handleViewerWhiteboardDrawEnd); 

        // Touch events
        elements.whiteboardCanvasViewer.addEventListener('touchstart', handleViewerWhiteboardDrawStart, { passive: false });
        elements.whiteboardCanvasViewer.addEventListener('touchmove', handleViewerWhiteboardDrawing, { passive: false });
        elements.whiteboardCanvasViewer.addEventListener('touchend', handleViewerWhiteboardDrawEnd);
        elements.whiteboardCanvasViewer.addEventListener('touchcancel', handleViewerWhiteboardDrawEnd);
        
        console.log("Viewer Whiteboard Initialized. Can draw:", viewerCanDrawOnWhiteboard);
    }
  
    // ==================================
    // UI & CHAT FUNCTIONS
    // ==================================
    function scrollChatToBottom() {
        // Use the correct ID for the chat message list container based on the EJS file
        // For liveRoom.ejs (Viewer):
        const chatMessagesContainer = document.getElementById("chatMessagesLive")?.parentNode;
        // For streamer.ejs (Host):
        // const chatMessagesContainer = document.getElementById("chatMessagesV2")?.parentNode; // Or whatever the scrollable wrapper ID is

        if (chatMessagesContainer) {
            // A small delay can sometimes help ensure the scroll height is updated after adding a new message,
            // especially if there are complex rendering or animations.
            setTimeout(() => {
                // Check if user is scrolled up significantly - if so, don't force scroll down
                const scrollThreshold = 50; // Pixels from bottom
                const isScrolledUp = chatMessagesContainer.scrollHeight - chatMessagesContainer.scrollTop - chatMessagesContainer.clientHeight > scrollThreshold;

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

    function addChatMessage(content, type = 'guest', username = 'System', timestamp = new Date(), originalMessage = null) {
        const li = document.createElement("li");
        li.className = `chat-message-item message-${type}`;

        // Icon
        const iconSpan = document.createElement("span"); iconSpan.className = "msg-icon";
        let iconClass = "fa-user";
        if (type === 'host') iconClass = "fa-star";
        else if (type === 'pro') iconClass = "fa-check-circle";
        else if (type === 'system' || type === 'join') iconClass = "fa-info-circle";
        else if (type === 'left') iconClass = "fa-sign-out-alt";
        else if (type === 'ban') iconClass = "fa-gavel";
        iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`;
        li.appendChild(iconSpan);

        // Content Container
        const contentContainer = document.createElement("div"); contentContainer.className = "msg-content-container";
        // Header
        const msgHeader = document.createElement("div"); msgHeader.className = "msg-header";
        const userSpan = document.createElement("span"); userSpan.className = "msg-username"; userSpan.textContent = username;
        msgHeader.appendChild(userSpan);
        const timeSpan = document.createElement("span"); timeSpan.className = "msg-timestamp"; timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msgHeader.appendChild(timeSpan);
        contentContainer.appendChild(msgHeader);
        // Body
        const bodySpan = document.createElement("span"); bodySpan.className = "msg-body prose-styling";
        let finalHtml = content || '';
        if (type !== 'system' && typeof marked !== 'undefined') {
            try {
                finalHtml = marked.parse(content || '');
                 const tempDiv = document.createElement('div'); tempDiv.innerHTML = finalHtml;
                 if(typeof renderMathInElement === 'function') renderMathInElement(tempDiv, { delimiters: [{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}], throwOnError: false });
                 finalHtml = tempDiv.innerHTML;
            } catch (e) { console.error("Marked/Katex Error in chat:", e); finalHtml = content; }
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

         const existingBox = container.querySelector('.pinned-box');

         if (!message || !message.content) { // Unpinning
             if (existingBox && !prefersReducedMotion) {
                 gsap.to(existingBox, { duration: 0.3, height: 0, autoAlpha: 0, padding: 0, margin: 0, ease: 'power1.in', onComplete: () => existingBox.remove() });
             } else if (existingBox) {
                 existingBox.remove();
             }
             container.classList.remove('has-content');
             return;
         }

         // Pinning or Updating
         let pinnedBox = existingBox;
         if (!pinnedBox) { // Create if doesn't exist
             pinnedBox = document.createElement("div"); pinnedBox.className = "pinned-box";
             container.appendChild(pinnedBox);
             container.classList.add('has-content');
         }

         // Prepare content (Parse Markdown/KaTeX)
         let contentHtml = message.content || '';
          if (typeof marked !== 'undefined') {
             try {
                 contentHtml = marked.parse(contentHtml);
                  const tempDiv = document.createElement('div'); tempDiv.innerHTML = contentHtml;
                  if(typeof renderMathInElement === 'function') renderMathInElement(tempDiv, { delimiters: [{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}], throwOnError: false });
                  contentHtml = tempDiv.innerHTML;
             } catch (e) { console.error("Marked/Katex Error in pinned:", e); }
         }

         pinnedBox.innerHTML = `
             <span class="pin-icon"><i class="fas fa-thumbtack"></i></span>
             <div class="pinned-content">
                 <span class="pinned-user">${message.username || 'Host'}</span>
                 <span class="pinned-text prose-styling">${contentHtml}</span>
             </div>
             <span class="pinned-timestamp">${new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
             ${liveRoomConfig.username === liveRoomConfig.roomOwner ? '<button class="unpin-btn" title="Bỏ ghim"><i class="fas fa-times"></i></button>' : ''}
         `;

          // Add unpin listener if host
          const unpinBtn = pinnedBox.querySelector('.unpin-btn');
          unpinBtn?.addEventListener('click', () => {
              if(socket) socket.emit("unpinComment", { roomId: liveRoomConfig.roomId });
          });

         // Animation
         if (!existingBox && !prefersReducedMotion) { // Animate only if newly created
             gsap.from(pinnedBox, { duration: 0.5, y: -10, autoAlpha: 0, ease: 'power2.out'});
         }
    }


     function sendChatMessage(){
        if (!socket) { console.error("Socket not initialized."); return; }
        const messageContent = elements.chatInputArea.value.trim();
        if (!messageContent) return;

        // Determine message type based on viewer's status
        let messageType = liveRoomConfig.userIsPro ? "pro" : "guest";
        // Host status is determined server-side or via initial config if needed,
        // but viewers normally send as guest/pro.

        const messageObj = {
            username: liveRoomConfig.username, content: messageContent,
            messageType: messageType, timestamp: new Date().toISOString()
        };
        socket.emit("chatMessage", { roomId: liveRoomConfig.roomId, message: messageObj });
        elements.chatInputArea.value = "";
        elements.chatPreview.innerHTML = "";
        elements.chatInputArea.style.height = 'auto'; // Reset height
    }


    // ==================================
    // OVERLAY & STREAM STATE HANDLING
    // ==================================
    function showOverlay(overlayElement) {
        if (!overlayElement) return;
        console.log(`Showing overlay: ${overlayElement.id}`);
         if (!prefersReducedMotion) {
            gsap.timeline()
                .set(overlayElement, { display: 'flex' })
                .to(overlayElement, { duration: 0.5, autoAlpha: 1, ease: 'power2.out' })
                .from(overlayElement.querySelector('.overlay-content'), { duration: 0.6, scale: 0.9, autoAlpha: 1, ease: 'back.out(1.7)' }, "-=0.3");
         } else {
              gsap.set(overlayElement, { display: 'flex', autoAlpha: 1 });
         }
    }

    function hideOverlay(overlayElement) {
        if (!overlayElement || gsap.getProperty(overlayElement, "autoAlpha") === 0) return; // Don't hide if already hidden
        console.log(`Hiding overlay: ${overlayElement.id}`);
         if (!prefersReducedMotion) {
            gsap.timeline({ onComplete: () => {gsap.set(overlayElement, { display: 'none' }); overlayElement.classList.remove("active");} })
                .to(overlayElement.querySelector('.overlay-content'), { duration: 0.3, scale: 0.9, autoAlpha: 0, ease: 'power1.in' })
                .to(overlayElement, { duration: 0.4, autoAlpha: 0 }, "-=0.2");
         } else {
              gsap.set(overlayElement, { display: 'none', autoAlpha: 0 });
         }
    }

     function handleStreamStart() {
         console.log("Handling stream start UI");
         if(elements.placeholder) elements.placeholder.classList.remove('active');
         if(elements.liveIndicator) elements.liveIndicator.classList.add('active');
         hideOverlay(elements.waitingOverlay);
         hideOverlay(elements.playOverlay);
     }

     function handleStreamEnd() {
         console.log("Handling stream end UI");
         if(elements.liveVideo && elements.liveVideo.srcObject) {
             elements.liveVideo.srcObject.getTracks().forEach(track => track.stop());
             elements.liveVideo.srcObject = null;
         }
         if(elements.placeholder) elements.placeholder.classList.add('active'); // Show placeholder
         if(elements.liveIndicator) elements.liveIndicator.classList.remove('active');
         // Don't automatically show waiting overlay here, server should control that
     }


    // ==================================
    // UI EVENT LISTENERS SETUP
    // ==================================
    async function askExit() {
        const confirmed = await showArtisticConfirm(
            "Bạn có chắc muốn rời khỏi phòng live?", // Message
            "Tôi Chắc Chắn",      // Confirm Text
            "Để Sau",        // Cancel Text
            "fas fa-exclamation-triangle" // Icon (optional, default is question mark)
        );

        if (confirmed) {
            if(socket) socket.disconnect();
            if(viewerPeer) viewerPeer.destroy(); // Clean up peer connection
            window.location.href = 'https://hoctap-9a3.glitch.me/live'; // Redirect
        } else {
            console.log("User cancelled deletion.");
        }
    }
    function initUIEventListeners() {
        elements.exitButton?.addEventListener('click', () => {
            askExit()
        });

        elements.sendChatBtn?.addEventListener('click', sendChatMessage);
        elements.chatInputArea?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
        elements.chatInputArea?.addEventListener('input', function() {
             this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
             const rawText = this.value || "";
             if (elements.chatPreview && typeof marked !== 'undefined') {
                  try {
                     let html = marked.parse(rawText);
                     elements.chatPreview.innerHTML = html;
                  } catch(e) { elements.chatPreview.textContent = "Lỗi preview markdown"; }
             }
        });
         elements.playButton?.addEventListener('click', () => {
             elements.liveVideo?.play().then(() => {
                 hideOverlay(elements.playOverlay); 
             }).catch(e => {
                 console.error("Manual play failed:", e);
                 showAlert("Không thể phát video tự động. Hãy thử tương tác với trang.", "warning");
             });
         });
         const startPlay = () => {
            if(elements.liveVideo && elements.liveVideo.paused && elements.liveVideo.srcObject){
                 elements.liveVideo.play().then(() => hideOverlay(elements.playOverlay)).catch(()=>{}); 
            }
            document.body.removeEventListener('click', startPlay); 
            document.body.removeEventListener('keydown', startPlay);
         }
          document.body.addEventListener('click', startPlay);
          document.body.addEventListener('keydown', startPlay);

        // --- Viewer Whiteboard UI Listeners ---
        elements.closeWhiteboardBtnViewer?.addEventListener('click', () => {
            // This button on viewer's toolbar now acts as a local hide.
             if (isWhiteboardLocallyVisible) {
                hideViewerWhiteboard(false); // false because it's a local action
             }
        });

       elements.wbColorPickerViewer?.addEventListener('input', (e) => {
            if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
            wbViewerCurrentColor = e.target.value;
        });
        elements.wbLineWidthRangeViewer?.addEventListener('input', (e) => {
            if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
            wbViewerCurrentLineWidth = parseInt(e.target.value, 10);
            if(elements.wbLineWidthValueDisplayViewer) elements.wbLineWidthValueDisplayViewer.textContent = wbViewerCurrentLineWidth;
        });
        elements.wbEraserModeBtnViewer?.addEventListener('click', () => {
            if (!viewerCanDrawOnWhiteboard || !isWhiteboardLocallyVisible) return;
            wbViewerIsEraserMode = !wbViewerIsEraserMode;
            elements.wbEraserModeBtnViewer.classList.toggle('active', wbViewerIsEraserMode);
            if (elements.whiteboardCanvasViewer) {
                elements.whiteboardCanvasViewer.style.cursor = wbViewerIsEraserMode ? 'cell' : (viewerCanDrawOnWhiteboard ? 'crosshair' : 'default');
                elements.whiteboardCanvasViewer.classList.toggle('eraser-mode', wbViewerIsEraserMode);
            }
        });
      
              // Listener for the new global toggle button for viewer's local display
        elements.toggleViewerWhiteboardDisplayBtn?.addEventListener('click', () => {
            // This button only works if the whiteboard is globally visible (streamer enabled it)
            if (!isWhiteboardGloballyVisible) {
                alert("Bảng vẽ chưa được streamer bật.");
                return;
            }
            if (isWhiteboardLocallyVisible) {
                hideViewerWhiteboard(false); // Local hide
            } else {
                showViewerWhiteboard();
                // After showing, viewer might need the current state if they hid it then re-showed
                socket.emit('wb:requestInitialState', { roomId: liveRoomConfig.roomId });
            }
        });
    }


    // ==================================
    // START INITIALIZATION
    // ==================================
    initializeViewer();

}); // End DOMContentLoaded