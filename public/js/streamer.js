// /public/js/streamer-masterpiece.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Lib Checks & Config ---
    if (typeof gsap === 'undefined' || typeof io === 'undefined' || typeof Peer === 'undefined' || typeof tsParticles === 'undefined') {
        console.error("Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles) not loaded!");
        // Optionally display an error message to the user
        document.body.innerHTML = '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên cần thiết. Không thể bắt đầu stream.</p>';
        return;
    }
    gsap.registerPlugin(ScrollTrigger); // If needed elsewhere, though likely not on this page
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Element Refs ---
    const elements = {
        header: document.querySelector('.streamer-main-header'),
        sidebar: document.querySelector('.streamer-sidebar'),
        chatArea: document.querySelector('.streamer-chat-area'),
        viewerCount: document.getElementById('viewerCountV2'),
        streamDuration: document.getElementById('streamDuration'),
        controlPanel: document.getElementById('controlPanelV2'),
        togglePanelBtn: document.getElementById('togglePanelBtnV2'),
        panelContent: document.querySelector('.panel-content-collapsible'),
        previewContainer: document.getElementById('streamPreviewContainer'),
        previewVideo: document.getElementById('streamPreviewVideo'),
        noStreamOverlay: document.querySelector('.no-stream-overlay'),
        streamStatusIndicator: document.getElementById('streamStatusIndicator'),
        shareScreenBtn: document.getElementById('shareScreenBtnV2'),
        liveCamBtn: document.getElementById('liveCamBtnV2'),
        toggleMicBtn: document.getElementById('toggleMicBtnV2'),
        endStreamBtn: document.getElementById('endStreamBtnV2'),
        viewersListBtn: document.getElementById('viewersListBtnV2'),
        bannedListBtn: document.getElementById('bannedListBtnV2'),
        pipChatBtn: document.getElementById('pipChatBtnV2'),
        pinnedCommentContainer: document.getElementById('pinnedCommentV2'),
        chatMessagesList: document.getElementById('chatMessagesV2'),
        chatInputArea: document.getElementById('chatInputAreaV2'),
        sendChatBtn: document.getElementById('sendChatBtnV2'),
        chatPreview: document.getElementById('chatPreviewV2'),
        viewersModal: document.getElementById('viewersModalV2'),
        viewersModalList: document.getElementById('viewersListV2'),
        viewersSearchInput: document.getElementById('viewersSearchV2'),
        closeViewersModalBtn: document.querySelector('#viewersModalV2 .modal-close-btn'),
        bannedModal: document.getElementById('bannedModalV2'),
        bannedModalList: document.getElementById('bannedListV2'),
        closeBannedModalBtn: document.querySelector('#bannedModalV2 .modal-close-btn'),
        // Add PiP elements if re-implementing PiP canvas
    };

    // --- State Variables ---
    let localStream = null;
    let currentMode = null; // 'screenShare', 'liveCam', null
    let peerInstance = null;
    let currentCalls = {}; // Store PeerJS calls { viewerId: call }
    let pendingViewers = [];
    let allJoinedViewers = new Set();
    let isMicEnabled = true; // Assume mic is initially intended to be on
    let isPanelCollapsed = false;
    let streamStartTime = streamerConfig.roomCreatedAt; // Use creation time as start
    let durationInterval = null;

    // --- Initialize ---
    initAnimations();
    initPeer();
    initSocket();
    initUIEventListeners();
    initBackgroundParticles(); // Initialize background particles
    updateStreamDuration(); // Initial call
    durationInterval = setInterval(updateStreamDuration, 1000);
    checkMediaPermissions(); // Check mic/cam permissions early


    // ==================================
    // INITIALIZATION & ANIMATIONS
    // ==================================
    function initAnimations() {
        if (prefersReducedMotion) {
            gsap.set('[data-animate]', { autoAlpha: 1 }); // Show all instantly
            return;
        }
        const tl = gsap.timeline({ delay: 0.2 });
        tl.from(elements.header, { duration: 0.8, y: -100, autoAlpha: 0, ease: 'power3.out' })
          .from(elements.sidebar, { duration: 0.9, x: -100, autoAlpha: 0, ease: 'power3.out' }, "-=0.5")
          .from(elements.chatArea, { duration: 0.9, x: 100, autoAlpha: 0, ease: 'power3.out' }, "<") // Start same time as sidebar
          .from('.control-btn, .panel-header h3', { duration: 0.5, y: 15, autoAlpha: 0, stagger: 0.05, ease: 'power2.out'}, "-=0.4")
          .from('.chat-container-v2 > *', { duration: 0.6, y: 20, autoAlpha: 0, stagger: 0.1, ease: 'power2.out'}, "-=0.5");
    }

    function initBackgroundParticles() {
        if (prefersReducedMotion) return;
        const targetEl = document.getElementById('tsparticles-bg');
        if (!targetEl) return;
        tsParticles.load("tsparticles-bg", {
            fpsLimit: 60, particles: { number: { value: 40, density: { enable: true, value_area: 800 } }, color: { value: ["#FFFFFF", "#7873F5", "#FF6EC4"] }, shape: { type: "circle" }, opacity: { value: { min: 0.1, max: 0.3 }, random: true, anim: { enable: true, speed: 0.3, sync: false } }, size: { value: { min: 1, max: 2.5 }, random: true }, links: { enable: false }, move: { enable: true, speed: 0.4, direction: "none", random: true, straight: false, outModes: { default: "out" } } }, interactivity: { enabled: false }, background: { color: "transparent" }
        }).catch(error => console.error("tsParticles background error:", error));
    }

    function playButtonFeedback(button) {
        if (!button || prefersReducedMotion) return;
        gsap.timeline()
            .to(button, { scale: 0.9, duration: 0.1, ease: 'power1.in' })
            .to(button, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
        // Add particle burst centered on button
         if (typeof tsParticles !== 'undefined') {
              tsParticles.load({
                  element: button, // Target the button itself temporarily
                  preset: "confetti", // Use a built-in preset
                  // Override preset options if needed
                  particles: { number:{ value: 15 }, size: {value: {min: 1, max: 4}}, move: {gravity:{enable:true, acceleration:15}}},
                  emitters: { position:{x:50, y:50}, size:{width:10, height:10}, rate:{quantity:10, delay:0}, life:{duration:0.2, count: 1}}
              }).then(container => setTimeout(() => container?.destroy(), 500)); // Destroy after short burst
         }
    }

    // ==================================
    // PEERJS & STREAMING LOGIC
    // ==================================
    function initPeer() {
        peerInstance = new Peer(streamerConfig.roomId, streamerConfig.peerConfig);
        peerInstance.on('open', id => {
            console.log('Streamer PeerJS connected with ID:', id);
            socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: id });
        });
        peerInstance.on('error', err => {
            console.error('PeerJS Error:', err);
            showAlert(`Lỗi kết nối Peer: ${err.type}. Thử tải lại trang.`, 'error');
            // Handle specific errors (e.g., network, unavailable-id)
        });
        peerInstance.on('disconnected', () => {
             console.warn('PeerJS disconnected. Attempting reconnect...');
             // PeerJS attempts auto-reconnect with default config
             // showAlert("Mất kết nối Peer, đang thử kết nối lại...", "warning");
         });
          peerInstance.on('close', () => {
             console.log('PeerJS connection closed.');
             // Clean up? Maybe not needed if page will close/redirect.
         });
        // Handle incoming calls (shouldn't happen for streamer, but good practice)
        peerInstance.on('call', call => {
             console.warn('Incoming call received by streamer, automatically rejecting.');
             call.close();
         });
    }

    function callViewer(viewerId) {
        if (!localStream || !peerInstance || !viewerId) {
            console.warn(`Cannot call viewer ${viewerId}. Stream or PeerJS not ready.`);
            if (!pendingViewers.includes(viewerId)) pendingViewers.push(viewerId); // Add to pending if not already called
            return;
        }
        // Close existing call if any (e.g., on stream change)
         if (currentCalls[viewerId]) {
             console.log(`Closing existing call for ${viewerId}`);
             currentCalls[viewerId].close();
             delete currentCalls[viewerId]; // Remove reference
         }

        console.log(`Calling viewer: ${viewerId}`);
        try {
            const call = peerInstance.call(viewerId, localStream);
            if (!call) { throw new Error("Peer.call returned undefined"); }
            currentCalls[viewerId] = call;

            call.on('error', err => {
                console.error(`Call error with ${viewerId}:`, err);
                delete currentCalls[viewerId];
                // Maybe try calling again after a delay?
            });
            call.on('close', () => {
                console.log(`Call closed with ${viewerId}`);
                delete currentCalls[viewerId];
            });
             call.on('stream', remoteStream => {
                 // Streamer generally doesn't *receive* streams, but handle if needed
                 console.log(`Received stream from viewer ${viewerId}? (Unexpected)`);
             });

        } catch (error) {
            console.error(`Failed to initiate call to ${viewerId}:`, error);
            delete currentCalls[viewerId];
        }
    }

    function stopLocalStream() {
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                track.dispatchEvent(new Event('ended')); // Manually trigger ended event
            });
            console.log("Local stream stopped.");
        }
        localStream = null;
        currentMode = null;
        updateUIStreamStopped();
    }

    function updateUIStreamStarted(mode) {
         elements.previewContainer.classList.add('streaming');
         elements.streamStatusIndicator.textContent = mode === 'liveCam' ? 'LIVE CAM' : 'SHARING SCREEN';
         elements.streamStatusIndicator.className = 'stream-status-indicator active';
         if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'none';

         // Update button states
         if(elements.shareScreenBtn) elements.shareScreenBtn.classList.toggle('active', mode === 'screenShare');
         if(elements.liveCamBtn) elements.liveCamBtn.classList.toggle('active', mode === 'liveCam');
         if(elements.liveCamBtn) elements.liveCamBtn.innerHTML = mode === 'liveCam' ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>' : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
         if(elements.shareScreenBtn && mode === 'liveCam') elements.shareScreenBtn.disabled = true; else if(elements.shareScreenBtn) elements.shareScreenBtn.disabled = false;
         if(elements.liveCamBtn && mode === 'screenShare') elements.liveCamBtn.disabled = true; else if(elements.liveCamBtn) elements.liveCamBtn.disabled = false;

         checkMicAvailability(); // Re-check mic status after getting stream
    }

     function updateUIStreamStopped() {
         elements.previewContainer.classList.remove('streaming');
         elements.streamStatusIndicator.textContent = 'OFF AIR';
         elements.streamStatusIndicator.className = 'stream-status-indicator';
         if (elements.previewVideo) elements.previewVideo.srcObject = null;
         if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'flex'; // Show placeholder

          // Reset button states
         if(elements.shareScreenBtn) { elements.shareScreenBtn.classList.remove('active'); elements.shareScreenBtn.disabled = false; }
         if(elements.liveCamBtn) { elements.liveCamBtn.classList.remove('active'); elements.liveCamBtn.disabled = false; elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>'; }
         if(elements.toggleMicBtn) { elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'; elements.toggleMicBtn.classList.add('active'); isMicEnabled=true; } // Reset mic button too
         checkMediaPermissions(); // Re-check permissions
     }

    async function startScreenShare() {
        if (currentMode === 'screenShare') return; // Already sharing
        stopLocalStream(); // Stop previous stream first
        console.log("Starting screen share...");
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            let audioStream = new MediaStream(); // Start with empty audio stream

             // Try getting microphone stream
             try {
                 const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                 micStream.getAudioTracks().forEach(track => audioStream.addTrack(track));
                 isMicEnabled = true; // Assume mic is enabled initially
             } catch (micErr) {
                 console.warn("Could not get microphone stream:", micErr);
                 isMicEnabled = false; // Mark mic as unavailable/disabled
             }

             // Add screen audio if available and distinct from mic
             if(displayStream.getAudioTracks().length > 0){
                  // Simple check: If mic failed OR mic exists but screen audio seems different
                  if(!isMicEnabled || (isMicEnabled && displayStream.getAudioTracks()[0].id !== audioStream.getAudioTracks()[0]?.id)){
                       displayStream.getAudioTracks().forEach(track => audioStream.addTrack(track));
                  }
             }

            // Combine video and audio tracks
            localStream = new MediaStream([...displayStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
            elements.previewVideo.srcObject = localStream;
            currentMode = 'screenShare';
            updateUIStreamStarted(currentMode);

             // End stream if user stops sharing via browser UI
            localStream.getVideoTracks()[0].addEventListener('ended', () => {
                console.log("Screen share ended by user.");
                stopLocalStream();
                socket.emit("streamEnded", { roomId: streamerConfig.roomId }); // Notify server
            });

            // Call pending and all current viewers
             callPendingViewers();
             allJoinedViewers.forEach(viewerId => callViewer(viewerId));

        } catch (err) {
            console.error("Error starting screen share:", err);
            showAlert("Không thể bắt đầu chia sẻ màn hình. Lỗi: " + err.message, "error");
            stopLocalStream(); // Ensure cleanup
        }
    }

    async function startLiveCam() {
         if (currentMode === 'liveCam') { // If already live cam, stop it
             stopLocalStream();
             socket.emit("streamEnded", { roomId: streamerConfig.roomId });
             return;
          }
         stopLocalStream(); // Stop previous stream
         console.log("Starting live cam...");
         try {
             const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
             localStream = camStream;
             currentMode = 'liveCam';
             elements.previewVideo.srcObject = localStream;
             updateUIStreamStarted(currentMode);

             localStream.getVideoTracks()[0].addEventListener('ended', () => {
                 console.log("Live cam ended (e.g., unplugged).");
                 stopLocalStream();
                 socket.emit("streamEnded", { roomId: streamerConfig.roomId });
             });

             callPendingViewers();
             allJoinedViewers.forEach(viewerId => callViewer(viewerId));

         } catch (err) {
             console.error("Error starting live cam:", err);
             showAlert("Không thể bật camera/mic. Vui lòng kiểm tra quyền. Lỗi: " + err.message, "error");
             stopLocalStream();
         }
    }

    function toggleMicrophone() {
        if (!localStream || localStream.getAudioTracks().length === 0) {
            console.warn("Cannot toggle mic: No local stream or audio track.");
            // Update button state if somehow out of sync
            elements.toggleMicBtn.classList.remove('active');
            elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
            elements.toggleMicBtn.disabled = true;
            isMicEnabled = false;
            return;
        }

        isMicEnabled = !isMicEnabled; // Toggle state
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isMicEnabled;
        });

        console.log(`Microphone toggled: ${isMicEnabled ? 'ON' : 'OFF'}`);
        // Update button UI
         elements.toggleMicBtn.classList.toggle('active', isMicEnabled);
         elements.toggleMicBtn.innerHTML = isMicEnabled
             ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
             : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';

          // Play feedback sound? (Optional, requires audio handling)
     }

     async function checkMediaPermissions() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasMic = devices.some(device => device.kind === "audioinput");
            const hasCam = devices.some(device => device.kind === "videoinput");

            if(elements.toggleMicBtn) {
                 elements.toggleMicBtn.disabled = !hasMic;
                 if (!hasMic) elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
            }
            if(elements.liveCamBtn) {
                 elements.liveCamBtn.disabled = !hasCam;
                 if (!hasCam) elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>';
            }
            if(elements.shareScreenBtn && typeof navigator.mediaDevices.getDisplayMedia === 'undefined'){
                 elements.shareScreenBtn.disabled = true;
                 elements.shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>';
            }

        } catch (err) {
            console.error("Error checking media permissions:", err);
             // Disable buttons if enumeration fails
             if(elements.toggleMicBtn) elements.toggleMicBtn.disabled = true;
             if(elements.liveCamBtn) elements.liveCamBtn.disabled = true;
        }
     }

    function callPendingViewers() {
         console.log(`Calling ${pendingViewers.length} pending viewers...`);
         while (pendingViewers.length > 0) {
             const viewerId = pendingViewers.shift(); // Remove from pending
             callViewer(viewerId);
         }
     }


    // ==================================
    // SOCKET.IO EVENT HANDLERS
    // ==================================
    function initSocket() {
        socket.on("connect_error", (err) => {
             console.error("Socket Connection Error:", err.message);
             showAlert(`Lỗi kết nối server: ${err.message}`, "error", 10000);
         });
         socket.on("connect", () => {
             console.log("Socket connected:", socket.id);
              // Re-join room on reconnect
             socket.emit("joinRoom", { roomId: streamerConfig.roomId, username: streamerConfig.username });
             if (peerInstance && peerInstance.id) {
                socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: peerInstance.id });
             }
         });
         socket.on("disconnect", (reason) => {
             console.warn("Socket disconnected:", reason);
             showAlert("Mất kết nối tới server chat.", "warning");
         });

        socket.on("userJoined", msg => { addChatMessage(msg, 'system'); });
        socket.on("viewerLeft", msg => { addChatMessage(msg, 'system', 'left'); });
        socket.on("newMessage", data => {
             addChatMessage(data.message.content, data.message.messageType || 'guest', data.message.username, new Date(data.message.timestamp), data.message); // Pass full message object for pinning
        });
        socket.on("updateViewers", count => { elements.viewerCount.textContent = count; });
        socket.on("commentPinned", data => displayPinnedComment(data.message));
        socket.on("commentUnpinned", () => displayPinnedComment(null)); // Clear pinned comment
        socket.on("newViewer", ({ viewerId }) => {
             console.log("Socket received new viewer:", viewerId);
             allJoinedViewers.add(viewerId);
             callViewer(viewerId); // Attempt to call immediately
         });
         socket.on("viewerDisconnected", ({ viewerId }) => {
              console.log("Viewer disconnected:", viewerId);
              allJoinedViewers.delete(viewerId);
              if (currentCalls[viewerId]) {
                  currentCalls[viewerId].close();
                  delete currentCalls[viewerId];
              }
          });
          socket.on("updateViewersList", data => renderListModal(elements.viewersModalList, data.viewers, false));
          socket.on("updateBannedList", data => renderListModal(elements.bannedModalList, data.banned, true));
          socket.on("forceEndStream", message => {
              alert(message || "Stream đã bị kết thúc bởi quản trị viên.");
              stopLocalStream();
              socket.disconnect();
              window.location.href = "/live"; // Redirect
          });
          socket.on("viewerBanned", msg => addChatMessage(msg, 'system', 'ban'));

    }

    // ==================================
    // UI EVENT LISTENERS
    // ==================================
    function initUIEventListeners() {
        // --- Control Panel Toggle ---
        elements.togglePanelBtn?.addEventListener("click", () => {
            isPanelCollapsed = !isPanelCollapsed;
            const icon = elements.togglePanelBtn.querySelector('i');
            if (!elements.panelContent) return;

            if (!prefersReducedMotion) {
                gsap.to(elements.panelContent, {
                    height: isPanelCollapsed ? 0 : 'auto',
                    autoAlpha: isPanelCollapsed ? 0 : 1, // Use autoAlpha for fade
                    paddingTop: isPanelCollapsed ? 0 : 20, // Animate padding
                    paddingBottom: isPanelCollapsed ? 0 : 0,
                    marginTop: isPanelCollapsed ? 0 : 20,
                    duration: 0.4,
                    ease: 'power2.inOut',
                    onStart: () => { // Rotate icon during animation
                        gsap.to(icon, { rotation: isPanelCollapsed ? 180 : 0, duration: 0.4, ease: 'power2.inOut' });
                    }
                });
            } else {
                 elements.panelContent.style.display = isPanelCollapsed ? 'none' : 'block';
                 if(icon) icon.style.transform = isPanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            }
             elements.controlPanel.classList.toggle("collapsed", isPanelCollapsed);
        });

        // --- Stream Control Buttons ---
        elements.shareScreenBtn?.addEventListener('click', () => { playButtonFeedback(elements.shareScreenBtn); startScreenShare(); });
        elements.liveCamBtn?.addEventListener('click', () => { playButtonFeedback(elements.liveCamBtn); startLiveCam(); });
        elements.toggleMicBtn?.addEventListener('click', () => { playButtonFeedback(elements.toggleMicBtn); toggleMicrophone(); });
        elements.endStreamBtn?.addEventListener('click', () => {
            playButtonFeedback(elements.endStreamBtn);
            showCustomConfirm("Xác nhận kết thúc buổi live stream này?", () => {
                stopLocalStream(); // Stop stream locally first
                socket.emit("endRoom", { roomId: streamerConfig.roomId }); // Notify server
                window.location.href = "/live"; // Redirect after confirmation
            });
        });

        // --- Modal Buttons ---
        elements.viewersListBtn?.addEventListener('click', () => {
            playButtonFeedback(elements.viewersListBtn);
             socket.emit("getViewersList", { roomId: streamerConfig.roomId }); // Request fresh list
             openModal(elements.viewersModal);
         });
        elements.bannedListBtn?.addEventListener('click', () => {
            playButtonFeedback(elements.bannedListBtn);
             socket.emit("getBannedList", { roomId: streamerConfig.roomId }); // Request fresh list
             openModal(elements.bannedModal);
         });
        elements.closeViewersModalBtn?.addEventListener('click', () => closeModal(elements.viewersModal));
        elements.closeBannedModalBtn?.addEventListener('click', () => closeModal(elements.bannedModal));
        // Close modal on backdrop click
         document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
             backdrop.addEventListener('click', () => closeModal(backdrop.closest('.modal-v2')));
         });

         // --- Chat Input ---
         elements.sendChatBtn?.addEventListener('click', sendChatMessage);
         elements.chatInputArea?.addEventListener('keydown', (e) => {
             if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow newline with Shift+Enter
                 e.preventDefault();
                 sendChatMessage();
             }
         });
          // Auto-resize textarea
          elements.chatInputArea?.addEventListener('input', function() {
              this.style.height = 'auto'; // Reset height
              this.style.height = (this.scrollHeight) + 'px'; // Set to scroll height
              // Update preview
               const rawText = this.value || "";
               if (elements.chatPreview && typeof marked !== 'undefined') {
                   let html = marked.parse(rawText);
                   // Add KaTeX processing if needed
                   elements.chatPreview.innerHTML = html;
               }
          });


          // --- Search Filter ---
          elements.viewersSearchInput?.addEventListener('input', function() {
              const query = this.value.toLowerCase();
              const listItems = elements.viewersModalList?.querySelectorAll('li');
              listItems?.forEach(li => {
                  const username = li.querySelector('.list-username')?.textContent.toLowerCase() || '';
                  li.style.display = username.includes(query) ? '' : 'none';
              });
          });

        // --- PiP Button ---
         if (elements.pipChatBtn && typeof document.createElement('canvas').captureStream === 'function' && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function') {
            // elements.pipChatBtn.addEventListener('click', togglePiPChat); // Enable if PiP is fully implemented
            elements.pipChatBtn.style.display = 'none'; // Hide PiP button for now as canvas logic is removed
         } else if (elements.pipChatBtn) {
             elements.pipChatBtn.style.display = 'none'; // Hide if not supported
         }

         // --- Drop Zone / File Input (For Upload - Placeholder) ---
         // Add event listeners if implementing file upload via chat later
    }


    // ==================================
    // CHAT & UI FUNCTIONS
    // ==================================
    function scrollChatToBottom() {
        const wrapper = elements.chatMessagesList?.parentNode; // Get the scrollable wrapper
        if (wrapper) {
            // Use GSAP for smooth scroll? Optional.
            // gsap.to(wrapper, { duration: 0.3, scrollTop: wrapper.scrollHeight, ease: 'power1.out' });
             wrapper.scrollTop = wrapper.scrollHeight; // Instant scroll
        }
    }

    function addChatMessage(content, type = 'guest', username = 'System', timestamp = new Date(), originalMessage = null) {
        const li = document.createElement("li");
        li.classList.add('chat-message-item', `message-${type}`); // Add base class + type class

        // 1. Icon
        const iconSpan = document.createElement("span");
        iconSpan.className = "msg-icon";
        // Determine icon character based on type
        let iconChar = "\uf2bd"; // Guest default
        if (type === 'host') iconChar = "\uf005"; // Star for host
        else if (type === 'pro') iconChar = "\uf521"; // Crown for pro (or check-circle?)
        else if (type === 'system') iconChar = "\uf05a"; // Info circle
        else if (type === 'left') iconChar = "\uf08b"; // Sign out
        else if (type === 'ban') iconChar = "\uf05e"; // Ban
        iconSpan.innerHTML = `<i class="fas ${iconChar}"></i>`; // Use FontAwesome classes
        li.appendChild(iconSpan);

        // 2. Content Container
        const contentContainer = document.createElement("div");
        contentContainer.className = "msg-content-container";

        // 3. Header (Username + Timestamp)
        const msgHeader = document.createElement("div");
        msgHeader.className = "msg-header";
        const userSpan = document.createElement("span");
        userSpan.className = "msg-username";
        userSpan.textContent = username;
        msgHeader.appendChild(userSpan);
        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-timestamp";
        timeSpan.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msgHeader.appendChild(timeSpan);
        contentContainer.appendChild(msgHeader);

        // 4. Message Body (Parse Markdown/KaTeX)
        const bodySpan = document.createElement("span");
        bodySpan.className = "msg-body prose-styling"; // Apply prose styling
        let finalHtml = content || '';
        if (type !== 'system' && typeof marked !== 'undefined') { // Don't parse system messages as MD
            try {
                finalHtml = marked.parse(content || '');
                 // Render KaTeX after markdown parsing
                 // Temporary div to render math
                 const tempDiv = document.createElement('div');
                 tempDiv.innerHTML = finalHtml;
                 if(typeof renderMathInElement === 'function'){
                     renderMathInElement(tempDiv, { delimiters: [{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}], throwOnError: false });
                 }
                 finalHtml = tempDiv.innerHTML;

            } catch (e) { console.error("Marked/Katex Error in chat:", e); finalHtml = content; } // Fallback
        }
        bodySpan.innerHTML = finalHtml;
        contentContainer.appendChild(bodySpan);
        li.appendChild(contentContainer);

        // 5. Action Buttons (Pin/Ban - Only Host sees)
        if (streamerConfig.username === streamerConfig.roomOwner && type !== 'system') {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'msg-actions';

            // Pin Button
            const pinBtn = document.createElement("button");
            pinBtn.className = "action-btn pin-btn";
            pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
            pinBtn.title = "Ghim tin nhắn này";
            pinBtn.onclick = () => {
                playButtonFeedback(pinBtn);
                socket.emit("pinComment", { roomId: streamerConfig.roomId, message: originalMessage });
            };
            actionsDiv.appendChild(pinBtn);

             // Ban Button (Don't allow banning self)
             if(username !== streamerConfig.username) {
                 const banBtn = document.createElement("button");
                 banBtn.className = "action-btn ban-user-btn";
                 banBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
                 banBtn.title = `Chặn ${username}`;
                 banBtn.onclick = () => {
                      playButtonFeedback(banBtn);
                      showCustomConfirm(`Bạn có chắc muốn chặn ${username} khỏi phòng?`, () => {
                         socket.emit("banViewer", { roomId: streamerConfig.roomId, viewerUsername: username });
                      });
                 };
                 actionsDiv.appendChild(banBtn);
             }
            li.appendChild(actionsDiv);
        }

        // Animation
        if (!prefersReducedMotion) {
            gsap.from(li, { duration: 0.5, autoAlpha: 0, y: 15, ease: 'power2.out' });
        } else {
             gsap.set(li, { autoAlpha: 1 });
        }

        elements.chatMessagesList.appendChild(li);
        scrollChatToBottom();
    }

     function displayPinnedComment(message) {
        elements.pinnedCommentContainer.innerHTML = ""; // Clear previous
         gsap.to(elements.pinnedCommentContainer, { duration: 0.3, height: message ? 'auto' : 0, autoAlpha: message ? 1 : 0, ease: 'power1.inOut'});


        if (!message || !message.content) {
            return; // No message to pin
        }

        const pinnedBox = document.createElement("div");
        pinnedBox.className = "pinned-box";

        const pinIcon = document.createElement("span"); pinIcon.className = "pin-icon"; pinIcon.innerHTML = '<i class="fas fa-thumbtack"></i>';
        const pinnedContent = document.createElement("div"); pinnedContent.className = "pinned-content";
        const userSpan = document.createElement("span"); userSpan.className = "pinned-user"; userSpan.textContent = message.username;
        const textSpan = document.createElement("span"); textSpan.className = "pinned-text prose-styling";
        const timestampSpan = document.createElement("span"); timestampSpan.className = "pinned-timestamp"; timestampSpan.textContent = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHtml = message.content || '';
         if (typeof marked !== 'undefined') {
            try {
                contentHtml = marked.parse(contentHtml);
                 const tempDiv = document.createElement('div'); tempDiv.innerHTML = contentHtml;
                 if(typeof renderMathInElement === 'function') renderMathInElement(tempDiv, { delimiters: [{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}], throwOnError: false });
                 contentHtml = tempDiv.innerHTML;
            } catch (e) { console.error("Marked/Katex Error in pinned:", e); }
        }
        textSpan.innerHTML = contentHtml;

        pinnedContent.appendChild(userSpan);
        pinnedContent.appendChild(textSpan);
        pinnedBox.appendChild(pinIcon);
        pinnedBox.appendChild(pinnedContent);
        pinnedBox.appendChild(timestampSpan);

        // Unpin Button for host
        if (streamerConfig.username === streamerConfig.roomOwner) {
            const unpinBtn = document.createElement("button");
            unpinBtn.className = "unpin-btn"; unpinBtn.title = "Bỏ ghim";
            unpinBtn.innerHTML = `<i class="fas fa-times"></i>`; // Simple X icon
            unpinBtn.onclick = () => {
                playButtonFeedback(unpinBtn);
                socket.emit("unpinComment", { roomId: streamerConfig.roomId });
            };
            pinnedBox.appendChild(unpinBtn);
        }

        elements.pinnedCommentContainer.appendChild(pinnedBox);
         if (!prefersReducedMotion) {
            gsap.from(pinnedBox, { duration: 0.5, y: -10, autoAlpha: 0, ease: 'power2.out'});
         }
    }

    function sendChatMessage(){
         const messageContent = elements.chatInputArea.value.trim();
         if (!messageContent) return;

         let messageType = "host"; // Default for streamer
          // No need to check PRO status for host message type
         const messageObj = {
             username: streamerConfig.username, content: messageContent,
             messageType: messageType, timestamp: new Date().toISOString()
         };
         socket.emit("chatMessage", { roomId: streamerConfig.roomId, message: messageObj });
         elements.chatInputArea.value = "";
         elements.chatPreview.innerHTML = "";
         // Reset textarea height after sending
          elements.chatInputArea.style.height = 'auto';
     }


    // ==================================
    // MODAL FUNCTIONS
    // ==================================
     function openModal(modalElement) {
         if (!modalElement) return;
         if (!prefersReducedMotion) {
             gsap.timeline()
                 .set(modalElement, { display: 'flex' })
                 .to(modalElement, { duration: 0.4, autoAlpha: 1, ease: 'power2.out' })
                 .from(modalElement.querySelector('.modal-content'), { duration: 0.5, y: -30, scale: 0.95, ease: 'back.out(1.4)' }, "-=0.2");
         } else {
             gsap.set(modalElement, { display: 'flex', autoAlpha: 1 });
         }
         document.body.style.overflow = 'hidden'; // Prevent background scroll
     }

     function closeModal(modalElement) {
         if (!modalElement) return;
          if (!prefersReducedMotion) {
             gsap.timeline({ onComplete: () => { modalElement.style.display = 'none'; document.body.style.overflow = ''; } })
                 .to(modalElement.querySelector('.modal-content'), { duration: 0.3, scale: 0.9, ease: 'power1.in' })
                 .to(modalElement, { duration: 0.4, autoAlpha: 0, ease: 'power1.in' }, "-=0.2");
         } else {
             gsap.set(modalElement, { display: 'none', autoAlpha: 0 });
             document.body.style.overflow = '';
         }
     }

     function renderListModal(listElement, items, isBannedList) {
         if (!listElement) return;
         listElement.innerHTML = ''; // Clear previous items
         if (!items || items.length === 0) {
             listElement.innerHTML = `<li>${isBannedList ? 'Không có ai bị chặn.' : 'Chưa có người xem nào khác.'}</li>`;
             return;
         }

         items.forEach(username => {
             const li = document.createElement('li');
             li.className = 'user-list-item';

             // Add Avatar (optional, requires fetching avatar URLs)
             // const avatar = document.createElement('img');
             // avatar.src = '/path/to/default/avatar.png'; // Fetch real avatar later
             // avatar.className = 'list-avatar';
             // li.appendChild(avatar);

             const nameSpan = document.createElement('span');
             nameSpan.className = 'list-username';
             nameSpan.textContent = username;
             li.appendChild(nameSpan);

             const actionWrapper = document.createElement('div');
             actionWrapper.className = 'list-actions';

             if (isBannedList) {
                 const unbanBtn = document.createElement('button');
                 unbanBtn.className = 'action-btn unban-btn';
                 unbanBtn.innerHTML = '<i class="fas fa-undo"></i> Bỏ chặn';
                 unbanBtn.onclick = () => {
                      playButtonFeedback(unbanBtn);
                      showCustomConfirm(`Xác nhận bỏ chặn ${username}?`, () => {
                         socket.emit("unbanViewer", { roomId: streamerConfig.roomId, viewerUsername: username });
                         // List will be updated via socket event
                      });
                 };
                 actionWrapper.appendChild(unbanBtn);
             } else if (username !== streamerConfig.username) { // Don't show ban button for self
                 const banBtn = document.createElement('button');
                 banBtn.className = 'action-btn ban-btn';
                 banBtn.innerHTML = '<i class="fas fa-user-slash"></i> Chặn';
                 banBtn.onclick = () => {
                      playButtonFeedback(banBtn);
                       showCustomConfirm(`Xác nhận chặn ${username} khỏi phòng?`, () => {
                         socket.emit("banViewer", { roomId: streamerConfig.roomId, viewerUsername: username });
                         // List will be updated via socket event
                      });
                 };
                 actionWrapper.appendChild(banBtn);
             }
             li.appendChild(actionWrapper);
             listElement.appendChild(li);
         });

          // Animate list items entrance (if modal just opened)
          if(!prefersReducedMotion && listElement.closest('.modal-v2')?.style.display === 'flex') {
             gsap.from(listElement.children, {duration: 0.4, autoAlpha: 0, y: 10, stagger: 0.05, ease: 'power1.out'});
          }
     }

     // Use Custom Confirm if available from confirm.js or alerts.js
      function showCustomConfirm(message, onConfirm, onCancel) {
          if (typeof showAdvCustomConfirm === 'function') { // Check for advanced confirm first
              showAdvCustomConfirm(message, onConfirm, onCancel);
          } else if (typeof window.showCustomConfirm === 'function') { // Check for basic custom confirm
              window.showCustomConfirm(message).then(confirmed => {
                  if(confirmed && onConfirm) onConfirm();
                  else if (!confirmed && onCancel) onCancel();
              });
          } else { // Fallback to window.confirm
              if (window.confirm(message)) { if(onConfirm) onConfirm(); }
              else { if(onCancel) onCancel(); }
          }
      }


    // ==================================
    // UTILITY & MISC
    // ==================================
    function updateStreamDuration() {
        const now = new Date();
        const diff = now - streamStartTime;
        if (diff < 0) return; // Avoid issues if clock is wrong
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        elements.streamDuration.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }


    // --- Final Setup ---
    // Apply initial UI states based on variables if needed (e.g., mic button)
     checkMediaPermissions(); // Set initial button states based on available devices

}); // End DOMContentLoaded