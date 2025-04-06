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
        // Add refs specific to this script
        controlPanelHeader: document.querySelector('#controlPanelV2 .panel-header'),
        controlButtons: gsap.utils.toArray('#controlPanelV2 .control-btn'),
        panelInternalHeader: document.querySelector('#controlPanelV2 .panel-header h3') // Get h3 inside panel
    };

    // --- State Variables ---
    let localStream = null;
    let currentMode = null; // 'screenShare', 'liveCam', null
    let peerInstance = null;
    let currentCalls = {}; // Store PeerJS calls { viewerId: call }
    let pendingViewers = [];
    let allJoinedViewers = new Set();
    let isMicEnabled = true; // Assume mic is initially intended to be on
    let isPanelCollapsed = false; // Assume panel starts expanded unless class exists
    let streamStartTime = streamerConfig.roomCreatedAt; // Use creation time as start
    let durationInterval = null;

    // --- DECLARE SOCKET VARIABLE AT HIGHER SCOPE ---
    let socket = null; // Initialize as null

    // ==================================
    // INITIALIZATION FUNCTION
    // ==================================
    function initializeStreamer() {
        console.log("Initializing Streamer UI & Connections...");
        initSocket();         // Initialize Socket.IO FIRST
        initPeer();           // Then Initialize PeerJS
        initAnimations();     // Then Setup initial animations
        initUIEventListeners(); // Then Setup UI interactions
        initBackgroundParticles(); // Initialize background particles
        updateStreamDuration(); // Initial call
        durationInterval = setInterval(updateStreamDuration, 1000);
        checkMediaPermissions(); // Check mic/cam permissions early
        // Set initial panel collapsed state based on class
        isPanelCollapsed = elements.controlPanel?.classList.contains('collapsed') || false;
        console.log("Streamer Initialization Complete. Panel collapsed:", isPanelCollapsed);
    }


    // ==================================
    // SOCKET.IO LOGIC
    // ==================================
    function initSocket() {
        // Check if socket already exists (e.g., on reconnect attempt)
        if (socket && socket.connected) {
             console.log("Socket already connected.");
             return;
        }

        // Establish connection
        socket = io(); // Assign to the higher-scoped variable

        // --- Setup Socket Event Handlers ---
        socket.on("connect_error", (err) => {
             console.error("Socket Connection Error:", err.message);
             // Use generic alert or a custom UI element
             // showAlert(`Lỗi kết nối server: ${err.message}`, "error", 10000);
             alert(`Lỗi kết nối server: ${err.message}`);
        });
        socket.on("connect", () => {
            console.log("Socket connected:", socket.id);
            socket.emit("joinRoom", { roomId: streamerConfig.roomId, username: streamerConfig.username });
            if (peerInstance && peerInstance.id) { // Check if peer is ready
               socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: peerInstance.id });
            }
        });
        socket.on("disconnect", (reason) => {
             console.warn("Socket disconnected:", reason);
             // showAlert("Mất kết nối tới server chat.", "warning");
             alert("Mất kết nối tới server chat.");
        });
        socket.on("userJoined", msg => { addChatMessage(msg, 'system'); });
        socket.on("viewerLeft", msg => { addChatMessage(msg, 'system', 'left'); });
        socket.on("newMessage", data => {
            // Basic validation
            if (data && data.message && data.message.content) {
                addChatMessage(data.message.content, data.message.messageType || 'guest', data.message.username || 'Anonymous', new Date(data.message.timestamp || Date.now()), data.message);
            } else {
                console.warn("Received invalid message data:", data);
            }
        });
        socket.on("updateViewers", count => { if(elements.viewerCount) elements.viewerCount.textContent = count; });
        socket.on("commentPinned", data => displayPinnedComment(data?.message)); // Handle null message
        socket.on("commentUnpinned", () => displayPinnedComment(null)); // Clear pinned comment
        socket.on("newViewer", ({ viewerId }) => {
             if (!viewerId) return;
             console.log("Socket received new viewer:", viewerId);
             allJoinedViewers.add(viewerId);
             callViewer(viewerId); // Attempt to call
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
          socket.on("updateViewersList", data => renderListModal(elements.viewersModalList, data?.viewers || [], false)); // Add default empty array
          socket.on("updateBannedList", data => renderListModal(elements.bannedModalList, data?.banned || [], true)); // Add default empty array
          socket.on("forceEndStream", message => {
              alert(message || "Stream đã bị kết thúc bởi quản trị viên.");
              stopLocalStream();
              if (socket) socket.disconnect(); // Disconnect socket on force end
              window.location.href = "/live"; // Redirect
          });
          socket.on("viewerBanned", msg => addChatMessage(msg, 'system', 'ban'));

    } // End initSocket

    // ==================================
    // PEERJS LOGIC
    // ==================================
    function initPeer() {
         try {
             peerInstance = new Peer(streamerConfig.roomId, streamerConfig.peerConfig);

             peerInstance.on('open', id => {
                 console.log('Streamer PeerJS connected with ID:', id);
                  // Notify server only AFTER peer is open and socket is connected
                  if (socket && socket.connected) {
                     socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: id });
                  } else {
                      console.warn("Peer opened, but socket not ready to send streamerReady.");
                      // Consider adding a check in socket 'connect' event to send if peerId is ready
                  }
             });
             peerInstance.on('error', err => {
                 console.error('PeerJS Error:', err);
                 alert(`Lỗi kết nối Peer: ${err.type}. Thử tải lại trang.`);
             });
             peerInstance.on('disconnected', () => {
                  console.warn('PeerJS disconnected. Auto-reconnect attempt by library.');
                  // alert("Mất kết nối Peer, đang thử kết nối lại...");
             });
              peerInstance.on('close', () => {
                 console.log('PeerJS connection closed.');
             });
             peerInstance.on('call', call => {
                  console.warn('Incoming call received by streamer, automatically rejecting.');
                  call.close();
             });
         } catch (error) {
             console.error("Failed to initialize PeerJS:", error);
              alert("Không thể khởi tạo kết nối PeerJS. Stream có thể không hoạt động.");
         }
    } // End initPeer

    // ==================================
    // STREAMING & UI LOGIC
    // ==================================
    function callViewer(viewerId) {
        if (!localStream || !peerInstance || !viewerId || peerInstance.disconnected) { // Added disconnected check
            console.warn(`Cannot call viewer ${viewerId}. Stream, PeerJS not ready, or Peer disconnected.`);
            if (!pendingViewers.includes(viewerId)) pendingViewers.push(viewerId);
            return;
        }
         if (currentCalls[viewerId]) {
             console.log(`Closing existing call before re-calling ${viewerId}`);
             currentCalls[viewerId].close();
             delete currentCalls[viewerId];
         }

        console.log(`Calling viewer: ${viewerId}`);
        try {
            // Ensure localStream has tracks before calling
            if (localStream.getTracks().length === 0) {
                console.warn("Attempted to call viewer with an empty localStream.");
                return;
            }
            const call = peerInstance.call(viewerId, localStream);
            if (!call) { throw new Error("Peer.call returned undefined"); }
            currentCalls[viewerId] = call;

            call.on('error', err => { console.error(`Call error with ${viewerId}:`, err); delete currentCalls[viewerId]; });
            call.on('close', () => { console.log(`Call closed with ${viewerId}`); delete currentCalls[viewerId]; });
             call.on('stream', remoteStream => { console.log(`Received stream from viewer ${viewerId}? (Unexpected)`); });

        } catch (error) { console.error(`Failed to initiate call to ${viewerId}:`, error); delete currentCalls[viewerId]; }
    }

    function stopLocalStream() {
        console.log("Stopping local stream...");
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                // track.dispatchEvent(new Event('ended')); // Ended event might not be needed if we update UI directly
            });
        }
        localStream = null;
        currentMode = null;
         // Close all active calls
         console.log("Closing active calls...");
         for (const viewerId in currentCalls) {
             if (currentCalls[viewerId]) {
                 currentCalls[viewerId].close();
             }
         }
         currentCalls = {}; // Reset calls object

        updateUIStreamStopped(); // Update UI state
    }

    function updateUIStreamStarted(mode) {
        if (!elements.previewContainer) return;
         elements.previewContainer.classList.add('streaming');
         elements.streamStatusIndicator.textContent = mode === 'liveCam' ? 'LIVE CAM' : 'SHARING SCREEN';
         elements.streamStatusIndicator.className = 'stream-status-indicator active';
         if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'none';

         // Update button states
         if(elements.shareScreenBtn) elements.shareScreenBtn.classList.toggle('active', mode === 'screenShare');
         if(elements.liveCamBtn) elements.liveCamBtn.classList.toggle('active', mode === 'liveCam');
         if(elements.liveCamBtn) elements.liveCamBtn.innerHTML = mode === 'liveCam' ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>' : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
         if(elements.shareScreenBtn) elements.shareScreenBtn.disabled = (mode === 'liveCam');
         if(elements.liveCamBtn) elements.liveCamBtn.disabled = (mode === 'screenShare');

         checkMicAvailability().then(hasMic => { // Check mic status after getting stream
            if (elements.toggleMicBtn) {
                 elements.toggleMicBtn.disabled = !hasMic;
                 if (hasMic) {
                     const audioTracks = localStream?.getAudioTracks() || [];
                     const isMicCurrentlyEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
                     isMicEnabled = isMicCurrentlyEnabled; // Sync state
                     elements.toggleMicBtn.classList.toggle('active', isMicEnabled);
                     elements.toggleMicBtn.innerHTML = isMicEnabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>' : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
                 } else {
                     elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
                     isMicEnabled = false;
                 }
            }
         });
    }

     function updateUIStreamStopped() {
        if (!elements.previewContainer) return;
         elements.previewContainer.classList.remove('streaming');
         elements.streamStatusIndicator.textContent = 'OFF AIR';
         elements.streamStatusIndicator.className = 'stream-status-indicator';
         if (elements.previewVideo) elements.previewVideo.srcObject = null;
         if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'flex';

          // Reset button states
         if(elements.shareScreenBtn) { elements.shareScreenBtn.classList.remove('active'); elements.shareScreenBtn.disabled = false; }
         if(elements.liveCamBtn) { elements.liveCamBtn.classList.remove('active'); elements.liveCamBtn.disabled = false; elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>'; }
         if(elements.toggleMicBtn) { elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'; elements.toggleMicBtn.classList.add('active'); elements.toggleMicBtn.disabled = false; isMicEnabled=true; }
         checkMediaPermissions(); // Re-check available devices
     }

    async function startScreenShare() {
        if (currentMode === 'screenShare') return;
        stopLocalStream();
        console.log("Starting screen share...");
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } });
            let audioTracksToAdd = [];

             // Try getting microphone stream
             try {
                 const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } });
                 audioTracksToAdd.push(...micStream.getAudioTracks());
                 isMicEnabled = true;
             } catch (micErr) {
                 console.warn("Could not get microphone stream:", micErr);
                 isMicEnabled = false;
             }

             // Add screen audio if available
             if(displayStream.getAudioTracks().length > 0){
                  audioTracksToAdd.push(...displayStream.getAudioTracks());
             }

            // Combine video and deduced audio tracks
            localStream = new MediaStream([...displayStream.getVideoTracks(), ...audioTracksToAdd]);
            if (elements.previewVideo) elements.previewVideo.srcObject = localStream;
            currentMode = 'screenShare';
            updateUIStreamStarted(currentMode);

             // End stream if user stops sharing via browser UI
            localStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                console.log("Screen share ended by user.");
                stopLocalStream();
                if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId });
            });

            callPendingViewers();
            allJoinedViewers.forEach(viewerId => callViewer(viewerId));

        } catch (err) {
            console.error("Error starting screen share:", err);
            alert("Không thể bắt đầu chia sẻ màn hình. Lỗi: " + err.message);
            stopLocalStream();
        }
    }

    async function startLiveCam() {
         if (currentMode === 'liveCam') { stopLocalStream(); if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId }); return; }
         stopLocalStream();
         console.log("Starting live cam...");
         try {
             const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } });
             localStream = camStream;
             isMicEnabled = true; // Assume mic enabled if stream obtained
             currentMode = 'liveCam';
             if (elements.previewVideo) elements.previewVideo.srcObject = localStream;
             updateUIStreamStarted(currentMode);

             localStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                 console.log("Live cam ended (e.g., unplugged).");
                 stopLocalStream();
                 if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId });
             });

             callPendingViewers();
             allJoinedViewers.forEach(viewerId => callViewer(viewerId));

         } catch (err) {
             console.error("Error starting live cam:", err);
             alert("Không thể bật camera/mic. Vui lòng kiểm tra quyền. Lỗi: " + err.message);
             stopLocalStream(); // Ensure cleanup
             isMicEnabled = false; // Ensure state is false on error
             updateUIStreamStopped(); // Reset UI fully
         }
    }

    function toggleMicrophone() {
        if (!localStream) { console.warn("Cannot toggle mic: No local stream."); return; }
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) { console.warn("Cannot toggle mic: Stream has no audio track."); return; }

        isMicEnabled = !isMicEnabled; // Toggle state
        audioTracks.forEach(track => { track.enabled = isMicEnabled; });
        console.log(`Microphone toggled: ${isMicEnabled ? 'ON' : 'OFF'}`);

        // Update button UI
         if(elements.toggleMicBtn){
             elements.toggleMicBtn.classList.toggle('active', isMicEnabled);
             elements.toggleMicBtn.innerHTML = isMicEnabled
                 ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'
                 : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
         }
     }

     async function checkMediaPermissions() {
        let hasMic = false; let hasCam = false;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            hasMic = devices.some(device => device.kind === "audioinput" && device.deviceId); // Check for actual deviceId
            hasCam = devices.some(device => device.kind === "videoinput" && device.deviceId);
        } catch (err) { console.error("Error enumerating devices:", err); }

        // Update button states based *only* on device presence initially
        if(elements.toggleMicBtn) {
             elements.toggleMicBtn.disabled = !hasMic;
             if (!hasMic) elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>';
             else if (localStream && localStream.getAudioTracks().length > 0){ // If stream exists, reflect its state
                  isMicEnabled = localStream.getAudioTracks()[0].enabled;
                  elements.toggleMicBtn.classList.toggle('active', isMicEnabled);
                  elements.toggleMicBtn.innerHTML = isMicEnabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>' : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>';
             } else { // Mic exists but no stream yet, assume it will be on
                  elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>';
                  elements.toggleMicBtn.classList.add('active');
                  isMicEnabled = true;
             }
        }
        if(elements.liveCamBtn) {
             elements.liveCamBtn.disabled = !hasCam;
             if (!hasCam) elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>';
             else elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>';
        }
        if(elements.shareScreenBtn && typeof navigator.mediaDevices.getDisplayMedia === 'undefined'){
             elements.shareScreenBtn.disabled = true;
             elements.shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>';
        }
        return { hasMic, hasCam }; // Return status
     }

    function callPendingViewers() {
         console.log(`Calling ${pendingViewers.length} pending viewers...`);
         const viewersToCall = [...pendingViewers]; // Copy array before iterating
         pendingViewers = []; // Clear pending list immediately
         viewersToCall.forEach(viewerId => {
            // Double check viewer hasn't disconnected while pending
            if(allJoinedViewers.has(viewerId)) {
                 callViewer(viewerId);
            } else {
                 console.log(`Skipping call to pending viewer ${viewerId} who already left.`);
            }
         });
     }


    // ==================================
    // CHAT & UI FUNCTIONS
    // ==================================
    function scrollChatToBottom() { /* ... Keep as before ... */ }
    function addChatMessage(content, type = 'guest', username = 'System', timestamp = new Date(), originalMessage = null) { /* ... Keep as before ... */ }
    function displayPinnedComment(message) { /* ... Keep as before ... */ }
    function sendChatMessage(){ /* ... Keep as before (with socket check) ... */ }
    function openModal(modalElement) { /* ... Keep as before ... */ }
    function closeModal(modalElement) { /* ... Keep as before ... */ }
    function renderListModal(listElement, items, isBannedList) { /* ... Keep as before (with socket checks in buttons) ... */ }
    function showCustomConfirm(message, onConfirm, onCancel) { /* ... Keep as before ... */ }
    function updateStreamDuration() { /* ... Keep as before ... */ }
    function initAnimations() { /* ... Keep as before ... */ }
    function initBackgroundParticles() { /* ... Keep as before ... */ }
    function playButtonFeedback(button) { /* ... Keep as before ... */ }


    // ==================================
    // UI EVENT LISTENERS SETUP
    // ==================================
    function initUIEventListeners() {
        // --- Control Panel Toggle ---
        elements.togglePanelBtn?.addEventListener("click", () => {
            isPanelCollapsed = !elements.controlPanel?.classList.contains("collapsed"); // Check current state before toggle
            const icon = elements.togglePanelBtn.querySelector('i');
            if (!elements.panelContent) return;

            elements.controlPanel?.classList.toggle("collapsed", isPanelCollapsed);
            if(icon) gsap.to(icon, { rotation: isPanelCollapsed ? 180 : 0, duration: 0.4, ease: 'power2.inOut' });

            if (!prefersReducedMotion) {
                 if (!isPanelCollapsed) { // Opening
                     gsap.set(elements.panelContent, { height: 'auto', autoAlpha: 1});
                     const height = elements.panelContent.scrollHeight;
                     gsap.fromTo(elements.panelContent,
                         { height: 0, autoAlpha: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0 },
                         { height: height, autoAlpha: 1, paddingTop: 20, paddingBottom: 20, marginTop: 20, duration: 0.5, ease: 'power3.out',
                           onStart: () => { // Animate buttons as panel opens
                                if (elements.controlButtons.length > 0) {
                                    gsap.fromTo(elements.controlButtons,
                                      { y: 15, autoAlpha: 0 },
                                      { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.1 }
                                    );
                                }
                           }
                         }
                     );
                 } else { // Closing
                      // Animate buttons out first
                      gsap.to(elements.controlButtons, {
                          y: 15, autoAlpha: 0, duration: 0.2, ease: 'power1.in', stagger: 0.03,
                          onComplete: () => { // Then close panel
                               gsap.to(elements.panelContent, {
                                   height: 0, autoAlpha: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0,
                                   duration: 0.4, ease: 'power2.inOut'
                               });
                          }
                      });
                 }
            } else { // Reduced Motion Toggle
                 elements.panelContent.style.display = isPanelCollapsed ? 'none' : ''; // Use empty string to revert to default display
                 elements.panelContent.style.height = isPanelCollapsed ? '0' : '';
                 elements.panelContent.style.paddingTop = isPanelCollapsed ? '0' : '';
                 elements.panelContent.style.paddingBottom = isPanelCollapsed ? '0' : '';
                 elements.panelContent.style.marginTop = isPanelCollapsed ? '0' : '';
                 elements.panelContent.style.opacity = isPanelCollapsed ? '0' : '1';
                 elements.panelContent.style.visibility = isPanelCollapsed ? 'hidden' : 'visible';
            }
        });

        // --- Other Listeners (Keep as before, ensure socket checks if needed) ---
        elements.shareScreenBtn?.addEventListener('click', () => { playButtonFeedback(elements.shareScreenBtn); startScreenShare(); });
        elements.liveCamBtn?.addEventListener('click', () => { playButtonFeedback(elements.liveCamBtn); startLiveCam(); });
        elements.toggleMicBtn?.addEventListener('click', () => { playButtonFeedback(elements.toggleMicBtn); toggleMicrophone(); });
        elements.endStreamBtn?.addEventListener('click', () => { /* ... end stream logic ... */ });
        elements.viewersListBtn?.addEventListener('click', () => { /* ... viewers list logic ... */ });
        elements.bannedListBtn?.addEventListener('click', () => { /* ... banned list logic ... */ });
        elements.closeViewersModalBtn?.addEventListener('click', () => closeModal(elements.viewersModal));
        elements.closeBannedModalBtn?.addEventListener('click', () => closeModal(elements.bannedModal));
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => { backdrop.addEventListener('click', () => closeModal(backdrop.closest('.modal-v2'))); });
        elements.sendChatBtn?.addEventListener('click', sendChatMessage);
        elements.chatInputArea?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
        elements.chatInputArea?.addEventListener('input', function() { /* ... textarea resize/preview ... */ });
        elements.viewersSearchInput?.addEventListener('input', function() { /* ... search logic ... */ });
        // elements.pipChatBtn?.addEventListener('click', togglePiPChat); // Enable if needed

    } // End initUIEventListeners


    // ==================================
    // START INITIALIZATION
    // ==================================
    initializeStreamer(); // Call the main setup function

}); // End DOMContentLoaded