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
        // Add refs for other elements if needed
    };

    // --- State ---
    let viewerPeer = null;
    let currentCall = null; // Store the single incoming call from the host
    let socket = null; // Initialize socket variable

    // ==================================
    // INITIALIZATION
    // ==================================
    function initializeViewer() {
        console.log("Initializing Live Room Viewer...");
        initSocket();
        initPeer(); // Peer depends on socket being ready to send viewerId
        initUIEventListeners();
        initBackgroundParticles();
        initPageAnimations(); // Run entrance animations
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
            // Send viewerId only after PeerJS is open
            if (viewerPeer && viewerPeer.id) {
                 socket.emit("joinRoom", { roomId: liveRoomConfig.roomId, username: liveRoomConfig.username  });
                 socket.emit("newViewer", { viewerId: viewerPeer.id, roomId: liveRoomConfig.roomId, username: liveRoomConfig.username });
            } else {
                 console.log("Socket connected, waiting for PeerJS...");
            }
             socket.emit("getInitialData", { roomId: liveRoomConfig.roomId }); // Ask for current state
        });
        socket.on("disconnect", (reason) => {console.warn("Viewer socket disconnected:", reason); alert("Bạn bị mất kết nối với lỗi không xác định."); location.href = "https://hoctap-9a3.glitch.me/live"});
        socket.on("connect_error", (err) => console.error("Viewer Socket Error:", err.message));

        // --- Handle events ---
         socket.on("userJoined", msg => addChatMessage(msg, 'system', 'join'));
         socket.on("viewerLeft", msg => addChatMessage(msg, 'system', 'left'));
         // --- CORRECTED newMessage Handler ---
         socket.on("newMessage", data => { if (data?.message?.content) addChatMessage(data.message.content, data.message.messageType || 'guest', data.message.username || 'Anonymous', new Date(data.message.timestamp || Date.now()), data.message); else console.warn("Received invalid message data:", data); });
        
         socket.on("updateViewers", count => { if(elements.viewerCount) elements.viewerCount.textContent = count; animateViewerCount(elements.viewerCount); });
         socket.on("commentPinned", data => displayPinnedComment(data.message));
         socket.on("commentUnpinned", () => displayPinnedComment(null));
         socket.on("hostJoined", () => hideOverlay(elements.waitingOverlay)); // Hide waiting when host joins/rejoins
         socket.on("roomEnded", () => showOverlay(elements.endedOverlay)); // Show ended overlay
         socket.on("waiting", () => showOverlay(elements.waitingOverlay)); // Show waiting overlay if host disconnects
         socket.on("banned", msg => { alert(msg || "Bạn đã bị chặn khỏi phòng này."); window.location.href = "/live"; });
         socket.on("screenShareEnded", () => handleStreamEnd()); // Handle host stopping stream

         // Receive initial state (like pinned comment) when joining
         socket.on("initialRoomState", (state) => {
             console.log("Received initial room state:", state);
             if (state.pinnedComment) displayPinnedComment(state.pinnedComment);
             if (state.viewerCount) elements.viewerCount.textContent = state.viewerCount;
             if (!state.isHostPresent) showOverlay(elements.waitingOverlay); else hideOverlay(elements.waitingOverlay); // Show/hide waiting based on host presence
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
                     // Optional: Render KaTeX in preview here too
                     elements.chatPreview.innerHTML = html;
                  } catch(e) { elements.chatPreview.textContent = "Lỗi preview markdown"; }

             }
        });

         // Play button overlay listener
         elements.playButton?.addEventListener('click', () => {
             elements.liveVideo?.play().then(() => {
                 hideOverlay(elements.playOverlay); // Hide button on successful play
             }).catch(e => {
                 console.error("Manual play failed:", e);
                 showAlert("Không thể phát video tự động. Hãy thử tương tác với trang.", "warning");
             });
         });
         // Auto-play attempt on initial interaction
         const startPlay = () => {
            if(elements.liveVideo && elements.liveVideo.paused && elements.liveVideo.srcObject){
                 elements.liveVideo.play().then(() => hideOverlay(elements.playOverlay)).catch(()=>{}); // Try to play, hide overlay on success
            }
            document.body.removeEventListener('click', startPlay); // Run only once
            document.body.removeEventListener('keydown', startPlay);
         }
          document.body.addEventListener('click', startPlay);
          document.body.addEventListener('keydown', startPlay);


    } // End initUIEventListeners


    // ==================================
    // START INITIALIZATION
    // ==================================
    initializeViewer();

}); // End DOMContentLoaded