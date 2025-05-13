// /public/js/streamer-masterpiece.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Lib Checks & Config ---
    if (typeof gsap === 'undefined' || typeof io === 'undefined' || typeof Peer === 'undefined' || typeof tsParticles === 'undefined') {
        console.error("Essential libraries (GSAP, Socket.IO, PeerJS, tsParticles) not loaded!");
        document.body.innerHTML = '<p style="color: red; padding: 20px; text-align: center;">Lỗi tải tài nguyên cần thiết. Không thể bắt đầu stream.</p>';
        return;
    }
    // html2canvas sẽ được kiểm tra trong module PiP Chat
    
    gsap.registerPlugin(ScrollTrigger);
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
        pipChatBtn: document.getElementById('pipChatBtnV2'), // Nút PiP
        pinnedCommentContainer: document.getElementById('pinnedCommentV2'),
        chatMessagesList: document.getElementById('chatMessagesV2'), // ID này được dùng bởi module PiP
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
        controlPanelHeader: document.querySelector('#controlPanelV2 .panel-header'),
        controlButtons: gsap.utils.toArray('#controlPanelV2 .control-btn'),
        panelInternalHeader: document.querySelector('#controlPanelV2 .panel-header h3'),
        
        // Whiteboard Elements
        toggleWhiteboardBtn: document.getElementById('toggleWhiteboardBtnStreamerV2'),
        whiteboardOverlay: document.getElementById('whiteboardContainerOverlayV2'),
        whiteboardCanvas: document.getElementById('whiteboardCanvasV2'),
        whiteboardToolbar: document.getElementById('whiteboardToolbarV2'),
        closeWhiteboardBtn: document.getElementById('closeWhiteboardBtnV2'),
        wbClearBtn: document.getElementById('wbClearBtnV2'),
        wbColorPicker: document.getElementById('wbColorPickerV2'),
        wbLineWidthRange: document.getElementById('wbLineWidthRangeV2'),
        wbLineWidthValueDisplay: document.getElementById('wbLineWidthValueDisplayV2'),
        wbEraserModeBtn: document.getElementById('wbEraserModeBtnV2'),

        // PiP Chat Video Player (thêm nếu chưa có)
        pipChatVideoPlayer: document.getElementById('pipChatVideoPlayer'), // ID này được dùng bởi module PiP
    };

    // --- State Variables ---
    let localStream = null;
    let currentMode = null;
    let peerInstance = null;
    let currentCalls = {};
    let pendingViewers = [];
    let allJoinedViewers = new Set();
    let isMicEnabled = true;
    let isPanelCollapsed = false;
    let streamStartTime = streamerConfig.roomCreatedAt; 
    let durationInterval = null;
    let socket = null;

    // Whiteboard State
    let whiteboardCtx = null;
    let isWhiteboardActive = false; // Streamer có đang bật WB không
    let isDrawingOnWhiteboard = false;
    let wbLastX = 0, wbLastY = 0;
    let wbCurrentColor = '#FFFFFF';
    let wbCurrentLineWidth = 3;
    let wbDrawingHistory = []; 
    let wbEventThrottleTimer = null;
    const WB_THROTTLE_INTERVAL = 16; 
    let wbIsEraserMode = false;
    const WB_ERASER_COLOR = '#222639'; 
    let viewerDrawPermissions = {}; // { username: canDraw_boolean }


    // ==================================
    // INITIALIZATION FUNCTION
    // ==================================
    function initializeStreamer() {
        console.log("Initializing Streamer UI & Connections...");
        initSocket();
        initPeer();
        initAnimations();     
        initWhiteboard(); 
        // PiP Chat module tự khởi tạo khi được load, không cần gọi initPipChatCanvas() riêng nữa
        initUIEventListeners(); 
        updateStreamDuration(); 
        if (durationInterval) clearInterval(durationInterval);
        durationInterval = setInterval(updateStreamDuration, 1000);
        checkMediaPermissions();
        isPanelCollapsed = elements.controlPanel?.classList.contains('collapsed') || false;
        console.log("Streamer Initialization Complete. Panel collapsed:", isPanelCollapsed);
    }

    // ==================================
    // SOCKET.IO LOGIC
    // ==================================
    function initSocket() {
        if (socket && socket.connected) { console.log("Socket already connected."); return; }
        socket = io();
        socket.on("connect_error", (err) => { console.error("Socket Connection Error:", err.message); alert(`Lỗi kết nối server: ${err.message}`); window.location.href = "https://hoctap-9a3.glitch.me/live";});
        socket.on("connect", () => { 
            console.log("Socket connected:", socket.id); 
            socket.emit("joinRoom", { roomId: streamerConfig.roomId, username: streamerConfig.username }); 
            if (peerInstance && peerInstance.id && !peerInstance.disconnected) { 
                socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: peerInstance.id }); 
            } else { 
                console.warn("Socket connected, but peer not ready to send streamerReady."); 
            }
            socket.emit('wb:requestInitialState', { roomId: streamerConfig.roomId });
        });
        socket.on("disconnect", (reason) => { console.warn("Socket disconnected:", reason); alert("Mất kết nối tới server chat."); window.location.href = "https://hoctap-9a3.glitch.me/live";});
        socket.on("userJoined", msg => addChatMessage(msg, 'system'));
        socket.on("viewerLeft", msg => addChatMessage(msg, 'system', 'left'));
        socket.on("newMessage", data => { if (data?.message?.content) addChatMessage(data.message.content, data.message.messageType || 'guest', data.message.username || 'Anonymous', new Date(data.message.timestamp || Date.now()), data.message); else console.warn("Received invalid message data:", data); });
        socket.on("updateViewers", count => { if(elements.viewerCount) elements.viewerCount.textContent = count ?? 0; });
        socket.on("commentPinned", data => displayPinnedComment(data?.message));
        socket.on("commentUnpinned", () => displayPinnedComment(null));
        
        socket.on("newViewer", ({ viewerId }) => { 
            if (!viewerId) return; 
            console.log("Socket received new viewer:", viewerId); 
            allJoinedViewers.add(viewerId); 
            callViewer(viewerId); 
            // Streamer sẽ gửi wb state khi viewer yêu cầu qua 'wb:viewerRequestState'
        });
        socket.on("viewerDisconnected", ({ viewerId }) => { if (!viewerId) return; console.log("Viewer disconnected:", viewerId); allJoinedViewers.delete(viewerId); if (currentCalls[viewerId]) { currentCalls[viewerId].close(); delete currentCalls[viewerId]; } });
        
        socket.on("updateViewersList", data => {
            const viewers = data?.viewers || [];
            viewers.forEach(viewer => {
                if (typeof viewer === 'object' && viewer.username) { 
                    viewerDrawPermissions[viewer.username] = viewer.canDraw || false;
                }
            });
            renderListModal(elements.viewersModalList, viewers, false);
        });
        socket.on("updateBannedList", data => renderListModal(elements.bannedModalList, data?.banned || [], true));
        socket.on("forceEndStream", message => { alert(message || "Stream đã bị kết thúc bởi quản trị viên."); stopLocalStream(); if (socket) socket.disconnect(); window.location.href = "https://hoctap-9a3.glitch.me/live"; });
        socket.on("viewerBanned", msg => addChatMessage(msg, 'system', 'ban'));

        // Whiteboard Socket Events (Streamer side listening to events it might have caused or from others if multi-streamer)
        socket.on('wb:draw', (data) => { // Thường thì streamer không nhận lại event vẽ của chính mình nếu server filter đúng
            if (data && data.drawData && data.username !== streamerConfig.username) { // Chỉ vẽ nếu là từ người khác
                drawOnWhiteboard(data.drawData.x0, data.drawData.y0, data.drawData.x1, data.drawData.y1, data.drawData.color, data.drawData.lineWidth, false, true, data.drawData.isEraser || false);
            }
        });
        socket.on('wb:clear', (data) => { // Tương tự, chỉ clear nếu không phải do chính streamer
             if (data && data.username !== streamerConfig.username) {
                clearWhiteboard(false);
             }
        });
        socket.on('wb:initState', (state) => { 
            console.log("Streamer received initial whiteboard state (e.g. after reconnect or if another host was present)", state);
            if (state && state.history && Array.isArray(state.history)) {
                if (!isWhiteboardActive) showWhiteboard(); 
                else resizeWhiteboardCanvas(); 

                whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height);
                wbDrawingHistory = []; 

                state.history.forEach(item => {
                    if (item.type === 'draw') {
                        drawOnWhiteboard(item.x0, item.y0, item.x1, item.y1, item.color, item.lineWidth, false, true, item.isEraser || false); 
                    } else if (item.type === 'clear') {
                        whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height);
                        wbDrawingHistory = []; 
                    }
                });
                 console.log("Streamer Whiteboard state restored from history.");
            } else if (state && state.dataUrl) { 
                 if (!isWhiteboardActive) showWhiteboard();
                 else resizeWhiteboardCanvas();
                 const img = new Image();
                 img.onload = () => {
                     whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height);
                     whiteboardCtx.drawImage(img, 0, 0);
                     console.log("Streamer Whiteboard state restored from Data URL.");
                 };
                 img.src = state.dataUrl;
            }
        });
        socket.on('wb:viewerRequestState', ({ viewerSocketId }) => { // Viewer yêu cầu trạng thái bảng trắng
            if (isWhiteboardActive && elements.whiteboardCanvas && wbDrawingHistory.length > 0) {
                console.log(`Streamer sending whiteboard history to viewer ${viewerSocketId}`);
                socket.emit('wb:syncStateToViewer', {
                    targetViewerId: viewerSocketId, 
                    history: wbDrawingHistory,
                });
            }
        });
        socket.on('wb:toggleVisibility', ({ isVisible }) => { // Nhận lại từ server để đồng bộ UI nút bấm
            if (isVisible) {
                if (!isWhiteboardActive) showWhiteboard();
            } else {
                if (isWhiteboardActive) hideWhiteboard();
            }
        });
         socket.on('wb:permissionUpdate', ({ viewerUsername, canDraw }) => { // Cập nhật cache quyền vẽ của streamer
            viewerDrawPermissions[viewerUsername] = canDraw;
            if (elements.viewersModal && elements.viewersModal.style.display === 'flex') {
                socket.emit("getViewersList", { roomId: streamerConfig.roomId }); // Re-render viewer list
            }
        });
    } 

    // ==================================
    // PEERJS LOGIC
    // ==================================
    function initPeer() {
         try {
             const streamerPeerId = `${streamerConfig.roomId}_streamer_${Date.now().toString().slice(-5)}`;
             console.log("Initializing PeerJS with ID:", streamerPeerId);
             peerInstance = new Peer(streamerPeerId, streamerConfig.peerConfig);
             peerInstance.on('open', id => { console.log('Streamer PeerJS connected with actual ID:', id); if (socket && socket.connected) { socket.emit("streamerReady", { roomId: streamerConfig.roomId, peerId: id }); } else { console.warn("Peer opened, but socket not connected."); } });
             peerInstance.on('error', err => { console.error('PeerJS Error:', err); alert(`Lỗi Peer: ${err.type}. Một số chức năng có thể không hoạt động. Thử tải lại trang.`); });
             peerInstance.on('disconnected', () => { console.warn('PeerJS disconnected.'); });
             peerInstance.on('close', () => { console.log('PeerJS closed.'); });
             peerInstance.on('call', call => { console.warn('Incoming call to streamer, rejecting.'); call.close(); });
         } catch (error) { console.error("Failed to init PeerJS:", error); alert("Lỗi khởi tạo PeerJS."); }
    }

    // ==================================
    // STREAMING & UI LOGIC (Giữ nguyên các hàm này)
    // ==================================
    function callViewer(viewerId) { if (!localStream || !peerInstance || !viewerId || peerInstance.disconnected || peerInstance.destroyed) { console.warn(`Cannot call viewer ${viewerId}. Stream (${!!localStream}), PeerJS (${!!peerInstance}), Peer disconnected (${peerInstance?.disconnected}), Peer destroyed (${peerInstance?.destroyed})`); if (viewerId && !pendingViewers.includes(viewerId)) pendingViewers.push(viewerId); return; } if (currentCalls[viewerId]) { console.log(`Closing existing call before re-calling ${viewerId}`); currentCalls[viewerId].close(); delete currentCalls[viewerId]; } console.log(`Calling viewer: ${viewerId} with stream:`, localStream); try { if (localStream.getTracks().length === 0) { console.warn("Call attempt with empty stream."); return; } const call = peerInstance.call(viewerId, localStream); if (!call) { throw new Error("peerInstance.call returned undefined"); } currentCalls[viewerId] = call; call.on('error', err => { console.error(`Call error with ${viewerId}:`, err); delete currentCalls[viewerId]; }); call.on('close', () => { console.log(`Call closed with ${viewerId}`); delete currentCalls[viewerId]; }); call.on('stream', remoteStream => { console.log(`Received stream from viewer ${viewerId}? (Unexpected)`); }); } catch (error) { console.error(`Failed call to ${viewerId}:`, error); delete currentCalls[viewerId]; } }
    function stopLocalStream() { console.log("Stopping local stream..."); if (localStream) { localStream.getTracks().forEach(track => track.stop()); console.log("Local stream tracks stopped."); } localStream = null; currentMode = null; console.log(`Closing ${Object.keys(currentCalls).length} active calls...`); for (const viewerId in currentCalls) { if (currentCalls[viewerId]) { currentCalls[viewerId].close(); } } currentCalls = {}; updateUIStreamStopped(); }
    function updateUIStreamStarted(mode) { if (!elements.previewContainer) return; elements.previewContainer.classList.add('streaming'); elements.streamStatusIndicator.textContent = mode === 'liveCam' ? 'LIVE CAM' : 'SHARING SCREEN'; elements.streamStatusIndicator.className = 'stream-status-indicator active'; if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'none'; if(elements.shareScreenBtn) { elements.shareScreenBtn.classList.toggle('active', mode === 'screenShare'); elements.shareScreenBtn.disabled = (mode === 'liveCam'); } if(elements.liveCamBtn) { elements.liveCamBtn.classList.toggle('active', mode === 'liveCam'); elements.liveCamBtn.innerHTML = mode === 'liveCam' ? '<i class="fas fa-stop-circle"></i><span class="btn-label">Dừng Cam</span>' : '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>'; elements.liveCamBtn.disabled = (mode === 'screenShare'); } checkMediaPermissions(); }
    function updateUIStreamStopped() { if (!elements.previewContainer) return; elements.previewContainer.classList.remove('streaming'); elements.streamStatusIndicator.textContent = 'OFF AIR'; elements.streamStatusIndicator.className = 'stream-status-indicator'; if (elements.previewVideo) elements.previewVideo.srcObject = null; if (elements.noStreamOverlay) elements.noStreamOverlay.style.display = 'flex'; if(elements.shareScreenBtn) { elements.shareScreenBtn.classList.remove('active'); elements.shareScreenBtn.disabled = false; } if(elements.liveCamBtn) { elements.liveCamBtn.classList.remove('active'); elements.liveCamBtn.disabled = false; elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>'; } if(elements.toggleMicBtn) { elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'; elements.toggleMicBtn.classList.add('active'); elements.toggleMicBtn.disabled = true; isMicEnabled=true; } checkMediaPermissions(); }
    async function startScreenShare() { if (currentMode === 'screenShare') { console.log("Already screen sharing."); return; } stopLocalStream(); console.log("Starting screen share..."); try { const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, cursor: "always" }, audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } }); let audioTracksToAdd = []; let micObtained = false; try { const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } }); audioTracksToAdd.push(...micStream.getAudioTracks()); micObtained = true; } catch (micErr) { console.warn("Could not get mic:", micErr); } if(displayStream.getAudioTracks().length > 0){ if(!micObtained || (micObtained && displayStream.getAudioTracks()[0].id !== audioTracksToAdd[0]?.id)){ audioTracksToAdd.push(...displayStream.getAudioTracks()); } } localStream = new MediaStream([...displayStream.getVideoTracks(), ...audioTracksToAdd]); if (elements.previewVideo) { elements.previewVideo.srcObject = localStream; } else { console.error("Preview video element missing!"); } currentMode = 'screenShare'; updateUIStreamStarted(currentMode); localStream.getVideoTracks()[0]?.addEventListener('ended', () => { console.log("Screen share ended by user."); stopLocalStream(); if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId }); }); callPendingViewers(); allJoinedViewers.forEach(viewerId => callViewer(viewerId)); } catch (err) { console.error("Screen share error:", err); alert("Không thể chia sẻ màn hình: " + err.message); stopLocalStream(); } }
    async function startLiveCam() { if (currentMode === 'liveCam') { stopLocalStream(); if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId }); return; } stopLocalStream(); console.log("Starting live cam..."); try { const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } }); localStream = camStream; isMicEnabled = localStream.getAudioTracks().length > 0 && localStream.getAudioTracks()[0].enabled; currentMode = 'liveCam'; if (elements.previewVideo) elements.previewVideo.srcObject = localStream; updateUIStreamStarted(currentMode); localStream.getVideoTracks()[0]?.addEventListener('ended', () => { console.log("Live cam ended."); stopLocalStream(); if (socket) socket.emit("streamEnded", { roomId: streamerConfig.roomId }); }); callPendingViewers(); allJoinedViewers.forEach(viewerId => callViewer(viewerId)); } catch (err) { console.error("Live cam error:", err); alert("Không thể bật camera/mic: " + err.message); stopLocalStream(); updateUIStreamStopped(); } }
    function toggleMicrophone() { if (!localStream) { console.warn("No local stream to toggle mic."); return; } const audioTracks = localStream.getAudioTracks(); if (audioTracks.length === 0) { console.warn("Stream has no audio track."); checkMediaPermissions(); return; } isMicEnabled = !isMicEnabled; audioTracks.forEach(track => { track.enabled = isMicEnabled; }); console.log(`Mic toggled: ${isMicEnabled ? 'ON' : 'OFF'}`); if(elements.toggleMicBtn){ elements.toggleMicBtn.classList.toggle('active', isMicEnabled); elements.toggleMicBtn.innerHTML = isMicEnabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>' : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>'; } }
    async function checkMediaPermissions() { let hasMic = false; let hasCam = false; try { const d = await navigator.mediaDevices.enumerateDevices(); hasMic = d.some(i=>i.kind==="audioinput"&&i.deviceId); hasCam = d.some(i=>i.kind==="videoinput"&&i.deviceId); } catch(e){console.error("Enum dev err:",e);} const canShare = typeof navigator.mediaDevices.getDisplayMedia !== 'undefined'; if(elements.toggleMicBtn){ elements.toggleMicBtn.disabled = !hasMic || !localStream || localStream.getAudioTracks().length === 0; if (!hasMic) elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span class="btn-label">No Mic</span>'; else if (localStream?.getAudioTracks().length > 0){ const enabled = localStream.getAudioTracks()[0].enabled; isMicEnabled = enabled; elements.toggleMicBtn.classList.toggle('active', enabled); elements.toggleMicBtn.innerHTML = enabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>' : '<i class="fas fa-microphone-slash"></i><span class="btn-label">Mic Off</span>'; } else { elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="btn-label">Mic On</span>'; elements.toggleMicBtn.classList.add('active'); isMicEnabled = true; }} if(elements.liveCamBtn){ elements.liveCamBtn.disabled = !hasCam || currentMode === 'screenShare'; if (!hasCam) elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">No Cam</span>'; else elements.liveCamBtn.innerHTML = '<i class="fas fa-camera-retro"></i><span class="btn-label">Camera</span>'; } if(elements.shareScreenBtn){ elements.shareScreenBtn.disabled = !canShare || currentMode === 'liveCam'; if (!canShare) elements.shareScreenBtn.innerHTML = '<i class="fas fa-desktop"></i><span class="btn-label">Not Supported</span>'; } return { hasMic, hasCam }; }
    function callPendingViewers() { if (!localStream || localStream.getTracks().length === 0) { console.warn("Skipping pending, no stream."); pendingViewers = []; return; } console.log(`Calling ${pendingViewers.length} pending...`); const toCall = [...pendingViewers]; pendingViewers = []; toCall.forEach(vId => { if(allJoinedViewers.has(vId)) callViewer(vId); else console.log(`Skipping pending ${vId}, already left.`); }); }
    function scrollChatToBottom() { const w = elements.chatMessagesList?.parentNode; if(w){w.scrollTop = w.scrollHeight;} }
    function addChatMessage(content, type = 'guest', username = 'System', timestamp = new Date(), originalMessage = null) { const li = document.createElement("li"); li.className = `chat-message-item message-${type}`; const iconSpan = document.createElement("span"); iconSpan.className = "msg-icon"; let iconClass = "fa-user"; if(type === 'host') iconClass = "fa-star"; else if(type === 'pro') iconClass = "fa-crown"; else if(type === 'system') iconClass = "fa-info-circle"; else if(type === 'left') iconClass = "fa-sign-out-alt"; else if(type === 'ban') iconClass = "fa-user-slash"; iconSpan.innerHTML = `<i class="fas ${iconClass}"></i>`; li.appendChild(iconSpan); const cont = document.createElement("div"); cont.className = "msg-content-container"; const head = document.createElement("div"); head.className = "msg-header"; const userS = document.createElement("span"); userS.className = "msg-username"; userS.textContent = username; head.appendChild(userS); const timeS = document.createElement("span"); timeS.className = "msg-timestamp"; timeS.textContent = new Date(timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); head.appendChild(timeS); cont.appendChild(head); const bodyS = document.createElement("span"); bodyS.className = "msg-body prose-styling"; let finalHtml = content || ''; if (type !== 'system' && typeof marked !== 'undefined') { try { finalHtml = marked.parse(content || ''); const t=document.createElement('div');t.innerHTML=finalHtml;if(typeof renderMathInElement==='function')renderMathInElement(t,{delimiters:[{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}],throwOnError:!1});finalHtml=t.innerHTML;} catch(e){console.error("Marked/Katex Err:", e); finalHtml = content;} } bodyS.innerHTML = finalHtml; cont.appendChild(bodyS); li.appendChild(cont); if (streamerConfig.username === streamerConfig.roomOwner && type !== 'system' && originalMessage) { const acts = document.createElement('div'); acts.className='msg-actions'; const pinBtn = document.createElement("button"); pinBtn.className="action-btn pin-btn"; pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>'; pinBtn.title="Ghim"; pinBtn.onclick=()=>{if(!socket)return;playButtonFeedback(pinBtn);socket.emit("pinComment",{roomId:streamerConfig.roomId,message:originalMessage});}; acts.appendChild(pinBtn); if(username!==streamerConfig.username){ const banBtn=document.createElement("button"); banBtn.className="action-btn ban-user-btn"; banBtn.innerHTML='<i class="fas fa-user-slash"></i>'; banBtn.title=`Chặn ${username}`; banBtn.onclick= async ()=>{if(!socket)return;playButtonFeedback(banBtn); const confirmed = await showStreamerConfirmation(`Chặn ${username}?`, "Chặn", "Hủy", "fas fa-user-slash"); if(confirmed) socket.emit("banViewer",{roomId:streamerConfig.roomId,viewerUsername:username});}; acts.appendChild(banBtn); } li.appendChild(acts); } if (!prefersReducedMotion) { gsap.from(li, { duration: 0.5, autoAlpha: 0, y: 15, ease: 'power2.out' }); } else { gsap.set(li, { autoAlpha: 1 }); } elements.chatMessagesList.appendChild(li); scrollChatToBottom(); if (typeof window.PiPChatModule !== 'undefined' && window.PiPChatModule.isActive()) { window.PiPChatModule.setNeedsUpdate(); } }
    function displayPinnedComment(message) { const wasVisible = elements.pinnedCommentContainer.style.height !== '0px' && elements.pinnedCommentContainer.style.opacity !== '0'; const targetHeight = message && message.content ? 'auto' : 0; const targetOpacity = message && message.content ? 1 : 0; gsap.to(elements.pinnedCommentContainer, { duration: 0.4, height: targetHeight, autoAlpha: targetOpacity, ease: 'power1.inOut', onComplete: () => { elements.pinnedCommentContainer.innerHTML = ""; if (message && message.content) { elements.pinnedCommentContainer.classList.add('has-content'); const pb=document.createElement("div"); pb.className="pinned-box"; const pi=document.createElement("span");pi.className="pin-icon";pi.innerHTML='<i class="fas fa-thumbtack"></i>'; const pc=document.createElement("div");pc.className="pinned-content"; const us=document.createElement("span");us.className="pinned-user";us.textContent=message.username; const ts=document.createElement("span");ts.className="pinned-text prose-styling"; const tss=document.createElement("span");tss.className="pinned-timestamp";tss.textContent=new Date(message.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); let ch=message.content||'';if(typeof marked!=='undefined'){try{ch=marked.parse(ch);const t=document.createElement('div');t.innerHTML=ch;if(typeof renderMathInElement==='function')renderMathInElement(t,{delimiters:[{left:"$$",right:"$$",display:!0},{left:"$",right:"$",display:!1},{left:"\\(",right:"\\)",display:!1},{left:"\\[",right:"\\]",display:!0}],throwOnError:!1});ch=t.innerHTML}catch(e){console.error("Pin Mark Err:",e)}}; ts.innerHTML=ch; pc.appendChild(us);pc.appendChild(ts); pb.appendChild(pi);pb.appendChild(pc);pb.appendChild(tss); if(streamerConfig.username===streamerConfig.roomOwner){const btn=document.createElement("button");btn.className="unpin-btn";btn.title="Bỏ ghim";btn.innerHTML=`<i class="fas fa-times"></i>`;btn.onclick=()=>{if(!socket)return;playButtonFeedback(btn);socket.emit("unpinComment",{roomId:streamerConfig.roomId});};pb.appendChild(btn);} elements.pinnedCommentContainer.appendChild(pb); if (!wasVisible && !prefersReducedMotion) { gsap.from(pb, { duration: 0.5, y: -10, autoAlpha: 0, ease: 'power2.out'}); } } else { elements.pinnedCommentContainer.classList.remove('has-content'); } }}); }
    function sendChatMessage(){ if (!socket || !socket.connected) { console.error("Socket not init/conn"); alert("Lỗi chat."); return; } const msg = elements.chatInputArea.value.trim(); if (!msg) return; const msgType = "host"; const msgObj = { username: streamerConfig.username, content: msg, messageType: msgType, timestamp: new Date().toISOString() }; socket.emit("chatMessage", { roomId: streamerConfig.roomId, message: msgObj }); elements.chatInputArea.value = ""; elements.chatPreview.innerHTML = ""; elements.chatInputArea.style.height = 'auto'; }
    function openModal(modalElement) { if (!modalElement) return; gsap.killTweensOf(modalElement); gsap.killTweensOf(modalElement.querySelector('.modal-content')); if (!prefersReducedMotion) { gsap.set(modalElement, { display: 'flex', autoAlpha: 0 }); gsap.set(modalElement.querySelector('.modal-content'), { y: -30, scale: 0.95 }); gsap.timeline().to(modalElement, { duration: 0.4, autoAlpha: 1, ease: 'power2.out' }).to(modalElement.querySelector('.modal-content'), { duration: 0.5, y: 0, scale: 1, autoAlpha: 1, ease: 'back.out(1.4)' }, "-=0.3"); } else { gsap.set(modalElement, { display: 'flex', autoAlpha: 1 }); gsap.set(modalElement.querySelector('.modal-content'), { y: 0, scale: 1 }); } document.body.style.overflow = 'hidden'; }
    function closeModal(modalElement) { if (!modalElement || gsap.getProperty(modalElement, "autoAlpha") === 0) return; gsap.killTweensOf(modalElement); gsap.killTweensOf(modalElement.querySelector('.modal-content')); if (!prefersReducedMotion) { gsap.timeline({ onComplete: () => { gsap.set(modalElement, { display: 'none' }); document.body.style.overflow = ''; } }).to(modalElement.querySelector('.modal-content'), { duration: 0.3, scale: 0.9, autoAlpha: 0, ease: 'power1.in' }).to(modalElement, { duration: 0.4, autoAlpha: 0, ease: 'power1.in' }, "-=0.2"); } else { gsap.set(modalElement, { display: 'none', autoAlpha: 0 }); document.body.style.overflow = ''; } }
    function renderListModal(listElement, items, isBannedList) { if (!listElement) return; listElement.innerHTML = ''; if (!items || items.length === 0) { listElement.innerHTML = `<li class="user-list-item empty">${isBannedList ? 'Không có ai bị chặn.' : 'Chưa có người xem.'}</li>`; return; } const viewersArray = items.map(item => (typeof item === 'string' ? { username: item, canDraw: viewerDrawPermissions[item] || false } : item)); viewersArray.forEach(viewer => { const u = viewer.username; const currentCanDraw = viewerDrawPermissions[u] || viewer.canDraw || false; const li = document.createElement('li'); li.className = 'user-list-item'; const ns = document.createElement('span'); ns.className = 'list-username'; ns.textContent = u; if (currentCanDraw && !isBannedList) { const drawIcon = document.createElement('i'); drawIcon.className = 'fas fa-paint-brush fa-xs'; drawIcon.title = "Đang có quyền vẽ"; drawIcon.style.marginLeft = '8px'; drawIcon.style.color = 'var(--success-color)'; ns.appendChild(drawIcon); } li.appendChild(ns); const aw = document.createElement('div'); aw.className = 'list-actions'; if (isBannedList) { const ub = document.createElement('button'); ub.className = 'action-btn unban-btn control-btn'; ub.innerHTML = '<i class="fas fa-undo"></i> Bỏ chặn'; ub.onclick = async () => { if (!socket) return; playButtonFeedback(ub); const confirmed = await showStreamerConfirmation(`Bỏ chặn ${u}?`, "Bỏ chặn", "Hủy", "fas fa-undo"); if (confirmed) socket.emit("unbanViewer", { roomId: streamerConfig.roomId, viewerUsername: u }); }; aw.appendChild(ub); } else if (u !== streamerConfig.username) { const bb = document.createElement('button'); bb.className = 'action-btn ban-btn control-btn'; bb.innerHTML = '<i class="fas fa-user-slash"></i> Chặn'; bb.onclick = async () => { if (!socket) return; playButtonFeedback(bb); const confirmed = await showStreamerConfirmation(`Chặn ${u}?`, "Chặn", "Hủy", "fas fa-user-slash"); if (confirmed) socket.emit("banViewer", { roomId: streamerConfig.roomId, viewerUsername: u }); }; aw.appendChild(bb); const drawPermBtn = document.createElement('button'); drawPermBtn.className = `action-btn draw-perm-btn control-btn ${currentCanDraw ? 'active' : ''}`; drawPermBtn.innerHTML = currentCanDraw ? '<i class="fas fa-paint-brush"></i> Thu hồi Vẽ' : '<i class="far fa-paint-brush"></i> Cho Vẽ'; drawPermBtn.title = currentCanDraw ? "Thu hồi quyền vẽ" : "Cho phép vẽ"; drawPermBtn.onclick = () => { if (!socket) return; playButtonFeedback(drawPermBtn); socket.emit('wb:toggleViewerDrawPermission', { roomId: streamerConfig.roomId, viewerUsername: u, canDraw: !currentCanDraw }); }; aw.appendChild(drawPermBtn); } li.appendChild(aw); listElement.appendChild(li); }); if (!prefersReducedMotion && listElement.closest('.modal-v2')?.style.display === 'flex') { gsap.from(listElement.children, { duration: 0.4, autoAlpha: 0, y: 10, stagger: 0.05, ease: 'power1.out' }); } }
    async function showStreamerConfirmation(message, confirmText = 'Xác nhận', cancelText = 'Hủy bỏ', iconClass = 'fas fa-question-circle') { if (typeof showArtisticConfirm === 'function') { return await showArtisticConfirm(message, confirmText, cancelText, iconClass); } console.warn("showArtisticConfirm not found, using window.confirm as fallback."); return new Promise((resolve) => { resolve(window.confirm(message)); }); }
    function updateStreamDuration() { if(!elements.streamDuration)return;const n=new Date();const d=n-new Date(streamStartTime);if(d<0)return;const h=Math.floor(d/36e5);const m=Math.floor((d%36e5)/6e4);const s=Math.floor((d%6e4)/1e3);elements.streamDuration.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
    function initAnimations() { gsap.set(elements.panelContent, { height: elements.controlPanel?.classList.contains('collapsed') ? 0 : 'auto', autoAlpha: elements.controlPanel?.classList.contains('collapsed') ? 0 : 1, paddingTop: elements.controlPanel?.classList.contains('collapsed') ? 0 : 20, paddingBottom: elements.controlPanel?.classList.contains('collapsed') ? 0 : 20, marginTop: 0 }); gsap.set(elements.controlButtons, { autoAlpha: elements.controlPanel?.classList.contains('collapsed') ? 0 : 1 }); if (prefersReducedMotion) { gsap.set('[data-animate], .streamer-main-header, .streamer-sidebar, .streamer-chat-area, .panel-header h3, .control-btn', { autoAlpha: 1 }); if(elements.panelContent) elements.panelContent.style.display = elements.controlPanel?.classList.contains('collapsed') ? 'none' : 'block'; if (!elements.controlPanel?.classList.contains('collapsed')) { gsap.set(elements.controlButtons, { autoAlpha: 1 }); } initBackgroundParticles(); return; } const tl = gsap.timeline({ delay: 0.2 }); tl.from(elements.header, { duration: 0.8, y: -80, autoAlpha: 0, ease: 'power3.out' }).from(elements.sidebar, { duration: 0.9, x: -100, autoAlpha: 0, ease: 'power3.out' }, "-=0.5").from(elements.chatArea, { duration: 0.9, x: 100, autoAlpha: 0, ease: 'power3.out' }, "<"); if (elements.panelInternalHeader) { tl.from(elements.panelInternalHeader, { duration: 0.5, y: -15, autoAlpha: 0, ease: 'power2.out' }, "-=0.3"); } else { console.warn("Control panel header H3 not found for animation."); } if (!elements.controlPanel?.classList.contains('collapsed') && elements.controlButtons.length > 0) { gsap.from(elements.controlButtons, { duration: 0.6, y: 20, autoAlpha: 0, stagger: 0.06, ease: 'power2.out', delay: tl.duration() - 0.2 }); } tl.from('.chat-container-v2 > *:not(#pinnedCommentV2)', { duration: 0.6, y: 20, autoAlpha: 0, stagger: 0.1, ease: 'power2.out' }, "-=0.5"); initBackgroundParticles(); }
    function initBackgroundParticles() { if(prefersReducedMotion || typeof tsParticles === 'undefined')return; const t=document.getElementById('tsparticles-bg');if(!t)return;tsParticles.load("tsparticles-bg",{fpsLimit:60,particles:{number:{value:50,density:{enable:!0,value_area:900}},color:{value:["#FFFFFF","#aaaacc","#ccaaff","#f0e68c"]},shape:{type:"circle"},opacity:{value:{min:.05,max:.2},random:!0,anim:{enable:!0,speed:.4,minimumValue:.05,sync:!1}},size:{value:{min:.5,max:1.5},random:!0,anim:{enable:!1}},links:{enable:!1},move:{enable:!0,speed:.3,direction:"none",random:!0,straight:!1,outModes:{default:"out"},attract:{enable:!1},trail:{enable:!1}}},interactivity:{detect_on:"window",events:{onhover:{enable:!1},onclick:{enable:!1}}},retina_detect:!0,background:{color:"transparent"}}).catch(e=>console.error("tsParticles bg err:",e));}
    function playButtonFeedback(button) { if(!button||prefersReducedMotion)return;gsap.timeline().to(button,{scale:.92,duration:.1,ease:"power1.in"}).to(button,{scale:1,duration:.35,ease:"elastic.out(1, 0.5)"});if(typeof tsParticles!=='undefined' && typeof tsParticles.load === 'function'){tsParticles.load({element:button,preset:"confetti",particles:{number:{value:10},size:{value:{min:1,max:3}}},emitters:{position:{x:50,y:50},size:{width:5,height:5},rate:{quantity:5,delay:0},life:{duration:.15,count:1}}}).then(c=>setTimeout(()=>c?.destroy(),400)).catch(e => console.warn("Particle feedback error:", e));}}

    // ==================================
    // WHITEBOARD LOGIC (Giữ nguyên các hàm whiteboard đã fix)
    // ==================================
    function resizeWhiteboardCanvas() { if (!elements.whiteboardOverlay || !elements.whiteboardCanvas || !whiteboardCtx) return; const toolbarHeight = elements.whiteboardToolbar ? elements.whiteboardToolbar.offsetHeight : 0; const overlayPadding = 20; const availableWidth = elements.whiteboardOverlay.clientWidth - (2 * overlayPadding); const availableHeight = elements.whiteboardOverlay.clientHeight - toolbarHeight - (2 * overlayPadding) - 10; const aspectRatio = 16 / 9; let canvasWidth = availableWidth; let canvasHeight = canvasWidth / aspectRatio; if (canvasHeight > availableHeight) { canvasHeight = availableHeight; canvasWidth = canvasHeight * aspectRatio; } if (canvasWidth > availableWidth) { canvasWidth = availableWidth; canvasHeight = canvasWidth / aspectRatio; } elements.whiteboardCanvas.width = canvasWidth; elements.whiteboardCanvas.height = canvasHeight; elements.whiteboardCanvas.style.width = `${canvasWidth}px`; elements.whiteboardCanvas.style.height = `${canvasHeight}px`; if (elements.whiteboardToolbar) { elements.whiteboardToolbar.style.width = `${canvasWidth}px`; } whiteboardCtx.lineCap = 'round'; whiteboardCtx.lineJoin = 'round'; whiteboardCtx.globalCompositeOperation = 'source-over'; const tempHistory = [...wbDrawingHistory]; wbDrawingHistory = []; whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height); tempHistory.forEach(item => { if (item.type === 'draw') { drawOnWhiteboard(item.x0, item.y0, item.x1, item.y1, item.color, item.lineWidth, false, true, item.isEraser || false); } else if (item.type === 'clear') { whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height); wbDrawingHistory = []; } }); console.log("Whiteboard canvas resized to:", elements.whiteboardCanvas.width, "x", elements.whiteboardCanvas.height); }
    function showWhiteboard() { if (!elements.whiteboardOverlay || isWhiteboardActive) return; isWhiteboardActive = true; elements.whiteboardOverlay.style.opacity = 0; elements.whiteboardOverlay.style.display = 'flex'; resizeWhiteboardCanvas(); if (!prefersReducedMotion) { gsap.to(elements.whiteboardOverlay, { duration: 0.5, autoAlpha: 1, ease: 'power2.out', }); } else { gsap.set(elements.whiteboardOverlay, { autoAlpha: 1 }); } elements.toggleWhiteboardBtn?.classList.add('active'); window.addEventListener('resize', resizeWhiteboardCanvas); console.log("Streamer Whiteboard shown by server event or local toggle"); }
    function hideWhiteboard() { if (!elements.whiteboardOverlay || !isWhiteboardActive) return; const onHideComplete = () => { isWhiteboardActive = false; elements.whiteboardOverlay.style.display = 'none'; elements.toggleWhiteboardBtn?.classList.remove('active'); window.removeEventListener('resize', resizeWhiteboardCanvas); console.log("Streamer Whiteboard hidden by server event or local toggle"); }; if (!prefersReducedMotion) { gsap.to(elements.whiteboardOverlay, { duration: 0.4, autoAlpha: 0, ease: 'power1.in', onComplete: onHideComplete }); } else { gsap.set(elements.whiteboardOverlay, { autoAlpha: 0 }); onHideComplete(); } }
    function drawOnWhiteboard(x0, y0, x1, y1, color, lineWidth, emitEvent = true, isRedrawing = false, isEraser = false) { if (!whiteboardCtx) return; const actualColor = isEraser ? WB_ERASER_COLOR : color; const actualLineWidth = isEraser ? (lineWidth < 10 ? lineWidth + 10 : lineWidth * 1.5) : lineWidth; whiteboardCtx.beginPath(); whiteboardCtx.moveTo(x0, y0); whiteboardCtx.lineTo(x1, y1); whiteboardCtx.strokeStyle = actualColor; whiteboardCtx.lineWidth = actualLineWidth; whiteboardCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'; whiteboardCtx.stroke(); whiteboardCtx.closePath(); whiteboardCtx.globalCompositeOperation = 'source-over'; if (!isRedrawing) { wbDrawingHistory.push({ type: 'draw', x0, y0, x1, y1, color: actualColor, lineWidth: actualLineWidth, isEraser }); if (wbDrawingHistory.length > 300) wbDrawingHistory.splice(0, wbDrawingHistory.length - 300); } if (emitEvent && socket && socket.connected) { socket.emit('wb:draw', { roomId: streamerConfig.roomId, username: streamerConfig.username, drawData: { x0, y0, x1, y1, color: actualColor, lineWidth: actualLineWidth, isEraser } }); } }
    function getMousePos(canvas, evt) { const rect = canvas.getBoundingClientRect(); let clientX, clientY; if (evt.touches && evt.touches.length > 0) { clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY; } else { clientX = evt.clientX; clientY = evt.clientY; } return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }; }
    function handleWhiteboardDrawStart(event) { if (!isWhiteboardActive || !userCanDrawOnWhiteboard()) return; event.preventDefault(); isDrawingOnWhiteboard = true; const pos = getMousePos(elements.whiteboardCanvas, event); wbLastX = pos.x; wbLastY = pos.y; const colorToUse = wbIsEraserMode ? WB_ERASER_COLOR : wbCurrentColor; const lineWidthToUse = wbIsEraserMode ? wbCurrentLineWidth + 10 : wbCurrentLineWidth; drawOnWhiteboard(wbLastX - 0.5, wbLastY - 0.5, wbLastX, wbLastY, colorToUse, lineWidthToUse, true, false, wbIsEraserMode); }
    function handleWhiteboardDrawing(event) { if (!isDrawingOnWhiteboard || !isWhiteboardActive || !userCanDrawOnWhiteboard()) return; event.preventDefault(); if (wbEventThrottleTimer) return; wbEventThrottleTimer = setTimeout(() => { const pos = getMousePos(elements.whiteboardCanvas, event); const colorToUse = wbIsEraserMode ? WB_ERASER_COLOR : wbCurrentColor; const lineWidthToUse = wbIsEraserMode ? wbCurrentLineWidth + 10 : wbCurrentLineWidth; drawOnWhiteboard(wbLastX, wbLastY, pos.x, pos.y, colorToUse, lineWidthToUse, true, false, wbIsEraserMode); wbLastX = pos.x; wbLastY = pos.y; wbEventThrottleTimer = null; }, WB_THROTTLE_INTERVAL); }
    function handleWhiteboardDrawEnd() { if (!isDrawingOnWhiteboard || !isWhiteboardActive || !userCanDrawOnWhiteboard()) return; isDrawingOnWhiteboard = false; clearTimeout(wbEventThrottleTimer); wbEventThrottleTimer = null; }
    function clearWhiteboard(emitEvent = true) { if (!whiteboardCtx || !elements.whiteboardCanvas) return; whiteboardCtx.clearRect(0, 0, elements.whiteboardCanvas.width, elements.whiteboardCanvas.height); wbDrawingHistory.push({ type: 'clear' }); if (wbDrawingHistory.length > 300) wbDrawingHistory.splice(0, wbDrawingHistory.length - 300); if (emitEvent && socket && socket.connected) { socket.emit('wb:clear', { roomId: streamerConfig.roomId, username: streamerConfig.username }); } console.log("Whiteboard cleared"); }
    function userCanDrawOnWhiteboard() { return true; } // Streamer luôn có quyền vẽ
    function initWhiteboard() { if (!elements.whiteboardCanvas) { console.error("Whiteboard canvas element not found!"); return; } whiteboardCtx = elements.whiteboardCanvas.getContext('2d'); if (!whiteboardCtx) { console.error("Failed to get 2D context for whiteboard!"); return; } whiteboardCtx.lineCap = 'round'; whiteboardCtx.lineJoin = 'round'; wbCurrentColor = elements.wbColorPicker?.value || '#FFFFFF'; wbCurrentLineWidth = parseInt(elements.wbLineWidthRange?.value || '3', 10); if(elements.wbLineWidthValueDisplay) elements.wbLineWidthValueDisplay.textContent = wbCurrentLineWidth; elements.whiteboardCanvas.addEventListener('mousedown', handleWhiteboardDrawStart); elements.whiteboardCanvas.addEventListener('mousemove', handleWhiteboardDrawing); elements.whiteboardCanvas.addEventListener('mouseup', handleWhiteboardDrawEnd); elements.whiteboardCanvas.addEventListener('mouseout', handleWhiteboardDrawEnd); elements.whiteboardCanvas.addEventListener('touchstart', handleWhiteboardDrawStart, { passive: false }); elements.whiteboardCanvas.addEventListener('touchmove', handleWhiteboardDrawing, { passive: false }); elements.whiteboardCanvas.addEventListener('touchend', handleWhiteboardDrawEnd); elements.whiteboardCanvas.addEventListener('touchcancel', handleWhiteboardDrawEnd); console.log("Whiteboard Initialized."); }

    // ==================================
    // UI EVENT LISTENERS SETUP
    // ==================================
    function initUIEventListeners() {
        elements.togglePanelBtn?.addEventListener("click", () => { isPanelCollapsed = elements.controlPanel.classList.toggle("collapsed"); const icon = elements.togglePanelBtn.querySelector('i'); if (!elements.panelContent) return; gsap.to(icon, { rotation: isPanelCollapsed ? 180 : 0, duration: 0.4, ease: 'power2.inOut' }); if (!prefersReducedMotion) { if (isPanelCollapsed) { gsap.to(elements.controlButtons, { duration: 0.25, autoAlpha: 0, y: 10, stagger: 0.04, ease: 'power1.in', overwrite: true }); gsap.to(elements.panelContent, { duration: 0.4, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, autoAlpha: 0, ease: 'power2.inOut', delay: 0.1 }); } else { gsap.set(elements.panelContent, { display: 'block', height: 'auto', autoAlpha: 0 }); const targetPanelStyles = { height: elements.panelContent.scrollHeight, paddingTop: 20, paddingBottom: 20, marginTop: 0, autoAlpha: 1 }; gsap.fromTo(elements.panelContent, { height: 0, autoAlpha: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0 }, { duration: 0.5, ...targetPanelStyles, ease: 'power3.out', onComplete: () => { gsap.set(elements.panelContent, { height: 'auto' }); if(elements.controlButtons.length > 0) { gsap.fromTo(elements.controlButtons, { y: 15, autoAlpha: 0 }, { duration: 0.5, y: 0, autoAlpha: 1, stagger: 0.06, ease: 'power2.out', overwrite: true } ); } } } ); } } else { elements.panelContent.style.display = isPanelCollapsed ? 'none' : 'block'; gsap.set(elements.controlButtons, { autoAlpha: isPanelCollapsed ? 0: 1}); } });
        elements.shareScreenBtn?.addEventListener('click', () => { playButtonFeedback(elements.shareScreenBtn); startScreenShare(); });
        elements.liveCamBtn?.addEventListener('click', () => { playButtonFeedback(elements.liveCamBtn); startLiveCam(); });
        elements.toggleMicBtn?.addEventListener('click', () => { playButtonFeedback(elements.toggleMicBtn); toggleMicrophone(); });
        elements.endStreamBtn?.addEventListener('click', async () => { if (!socket) { console.error("Socket not connected."); return; } playButtonFeedback(elements.endStreamBtn); const confirmed = await showStreamerConfirmation("Xác nhận kết thúc stream?", "Kết thúc", "Hủy", "fas fa-exclamation-triangle"); if (confirmed) { stopLocalStream(); socket.emit("endRoom", { roomId: streamerConfig.roomId }); window.location.href = "https://hoctap-9a3.glitch.me/live"; } });
        elements.viewersListBtn?.addEventListener('click', () => { if (!socket) return; playButtonFeedback(elements.viewersListBtn); socket.emit("getViewersList", { roomId: streamerConfig.roomId }); openModal(elements.viewersModal); });
        elements.bannedListBtn?.addEventListener('click', () => { if (!socket) return; playButtonFeedback(elements.bannedListBtn); socket.emit("getBannedList", { roomId: streamerConfig.roomId }); openModal(elements.bannedModal); });
        elements.closeViewersModalBtn?.addEventListener('click', () => closeModal(elements.viewersModal)); 
        elements.closeBannedModalBtn?.addEventListener('click', () => closeModal(elements.bannedModal)); 
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => { backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { closeModal(backdrop.closest('.modal-v2')); } }); });
        elements.sendChatBtn?.addEventListener('click', sendChatMessage);
        elements.chatInputArea?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
        elements.chatInputArea?.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; const rt=this.value||""; if(elements.chatPreview && typeof marked !== 'undefined'){try{let h=marked.parse(rt);elements.chatPreview.innerHTML=h;}catch(e){elements.chatPreview.innerHTML="Lỗi xem trước Markdown"}}});
        elements.viewersSearchInput?.addEventListener('input', function() { const q=this.value.toLowerCase(); const li=elements.viewersModalList?.querySelectorAll('li'); li?.forEach(l=>{const u=l.querySelector('.list-username')?.textContent.toLowerCase()||'';l.style.display=u.includes(q)?'':'none';}); });
        
        // Whiteboard Controls Listeners
        elements.toggleWhiteboardBtn?.addEventListener('click', () => { playButtonFeedback(elements.toggleWhiteboardBtn); const newVisibility = !isWhiteboardActive; if (socket && socket.connected) { socket.emit('wb:toggleGlobalVisibility', { roomId: streamerConfig.roomId, isVisible: newVisibility }); } else { if (newVisibility) showWhiteboard(); else hideWhiteboard(); } });
        elements.closeWhiteboardBtn?.addEventListener('click', () => { playButtonFeedback(elements.closeWhiteboardBtn); if (socket && socket.connected) { socket.emit('wb:toggleGlobalVisibility', { roomId: streamerConfig.roomId, isVisible: false }); } else { hideWhiteboard(); } });
        elements.wbColorPicker?.addEventListener('input', (e) => { wbCurrentColor = e.target.value; });
        elements.wbLineWidthRange?.addEventListener('input', (e) => { wbCurrentLineWidth = parseInt(e.target.value, 10); if(elements.wbLineWidthValueDisplay) elements.wbLineWidthValueDisplay.textContent = wbCurrentLineWidth; });
        elements.wbClearBtn?.addEventListener('click', () => { playButtonFeedback(elements.wbClearBtn); clearWhiteboard(true); });
        elements.wbEraserModeBtn?.addEventListener('click', () => { playButtonFeedback(elements.wbEraserModeBtn); wbIsEraserMode = !wbIsEraserMode; elements.wbEraserModeBtn.classList.toggle('active', wbIsEraserMode); elements.whiteboardCanvas.style.cursor = wbIsEraserMode ? 'cell' : 'crosshair'; if (wbIsEraserMode) console.log("Eraser mode ON"); else console.log("Eraser mode OFF, Pen mode ON"); });

        // PiP Button Listener is handled by the PiP Chat Module below
    }

    // ==================================
    // START INITIALIZATION
    // ==================================
    initializeStreamer();

    // ==================================
    // PIP CHAT MODULE (Dựa trên code bạn cung cấp và đã fix)
    // ==================================
    (function() {
        const PIP_WIDTH = 400; 
        const PIP_HEIGHT = 600; 
        const PIP_PADDING = 12;
        const MSG_FONT_SIZE = 13; // Giữ lại giá trị bạn đã có
        const LINE_HEIGHT = 18;
        const USER_FONT_SIZE = 14; // Giữ lại giá trị bạn đã có
        
        let pipCanvasInternal, pipCtxInternal, pipStreamInternal, pipRafId;
        let pipNeedsUpdateInternal = true; 
        let pipActiveInternal = false;
      
        // Sử dụng 'elements' object đã được khai báo ở phạm vi ngoài
        const chatList = elements.chatMessagesList; 
        const pipBtn = elements.pipChatBtn;         
        const videoEl = elements.pipChatVideoPlayer; 
      
        if (!chatList || !pipBtn || !videoEl || typeof html2canvas === 'undefined') { 
          console.warn('PiP Chat unavailable: missing elements or html2canvas library.');
          if (pipBtn) pipBtn.style.display = 'none'; 
          return;
        } else {
          if (pipBtn) pipBtn.style.display = 'flex'; // Đảm bảo nút hiển thị nếu mọi thứ OK
        }
      
        pipCanvasInternal = document.createElement('canvas');
        pipCanvasInternal.width = PIP_WIDTH;
        pipCanvasInternal.height = PIP_HEIGHT;
        pipCtxInternal = pipCanvasInternal.getContext('2d');
        if (!pipCtxInternal) {
          console.error('Cannot get 2D context for PiP Chat.');
          if (pipBtn) pipBtn.style.display = 'none';
          return;
        }
        // Vẽ nền ban đầu cho canvas PiP
        pipCtxInternal.fillStyle = "rgba(15, 15, 30, 0.92)";
        pipCtxInternal.fillRect(0,0,PIP_WIDTH, PIP_HEIGHT);

        new MutationObserver(() => {
            if (pipActiveInternal) pipNeedsUpdateInternal = true; 
        }).observe(chatList, { childList: true, subtree: true }); 
      
        pipBtn.addEventListener('click', togglePipChatHandler); 
      
        async function drawPipChatFrameInternal() {
          if (!pipActiveInternal) { 
            if (pipRafId) cancelAnimationFrame(pipRafId);
            pipRafId = null;
            return;
          }
          pipRafId = requestAnimationFrame(drawPipChatFrameInternal); 
          
          if (!pipNeedsUpdateInternal) return; 
          pipNeedsUpdateInternal = false; 
      
          const offscreenContainer = document.createElement('div');
          Object.assign(offscreenContainer.style, {
            width: PIP_WIDTH + 'px', height: PIP_HEIGHT + 'px',
            padding: PIP_PADDING + 'px', boxSizing: 'border-box',
            backgroundColor: 'rgba(15,15,30,0.92)', color: '#e8eaf6',
            fontFamily: 'Inter, sans-serif', display: 'flex',
            flexDirection: 'column-reverse', justifyContent: 'flex-start',
            overflow: 'hidden', position: 'absolute', 
            top: '-99999px', left: '-99999px',
          });
      
          const messagesToRender = Array.from(chatList.children).slice(-12); 
          if (messagesToRender.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.textContent = 'Chưa có tin nhắn...';
            Object.assign(placeholder.style, { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: MSG_FONT_SIZE + 'px' });
            offscreenContainer.appendChild(placeholder);
          } else {
            messagesToRender.forEach(originalMessageElement => {
              const clonedMessageElement = originalMessageElement.cloneNode(true);
              clonedMessageElement.querySelectorAll('.msg-actions').forEach(actionEl => actionEl.remove());
              clonedMessageElement.style.marginBottom = '6px';
              clonedMessageElement.style.fontSize = MSG_FONT_SIZE + 'px';
              clonedMessageElement.style.lineHeight = LINE_HEIGHT + 'px';
              const headerElement = clonedMessageElement.querySelector('.msg-username');
              if (headerElement) { /* ... (styling header như cũ) ... */ 
                headerElement.style.fontSize = USER_FONT_SIZE + 'px';
                headerElement.style.fontWeight = 'bold';
                if (originalMessageElement.classList.contains('message-host')) headerElement.style.color = '#8a7ffb';
                else if (originalMessageElement.classList.contains('message-pro')) headerElement.style.color = '#ffde7d';
                else if (originalMessageElement.classList.contains('message-system')) headerElement.style.color = '#8899bb';
                else headerElement.style.color = '#a0a0c0';
              }
              const bodyElement = clonedMessageElement.querySelector('.msg-body');
              if (bodyElement) { bodyElement.style.color = '#e8eaf6'; bodyElement.style.overflowWrap = 'break-word'; bodyElement.style.wordWrap = 'break-word';}

              offscreenContainer.appendChild(clonedMessageElement);
            });
          }
          document.body.appendChild(offscreenContainer);
      
          try {
            const renderedCanvasByHtml2Canvas = await html2canvas(offscreenContainer, {
              width: PIP_WIDTH, height: PIP_HEIGHT,
              backgroundColor: null, useCORS: true, logging: false,
            });
            pipCtxInternal.clearRect(0,0,pipCanvasInternal.width,pipCanvasInternal.height); 
            pipCtxInternal.drawImage(renderedCanvasByHtml2Canvas, 0, 0, pipCanvasInternal.width, pipCanvasInternal.height);
          } catch (err) {
            console.error('PiP Chat render error:', err);
            pipCtxInternal.fillStyle = 'rgba(15,15,30,0.92)';
            pipCtxInternal.fillRect(0,0,pipCanvasInternal.width,pipCanvasInternal.height);
            pipCtxInternal.fillStyle = 'orange';
            pipCtxInternal.font = 'bold 14px Inter, sans-serif';
            pipCtxInternal.textAlign = 'center'; pipCtxInternal.textBaseline = 'middle';
            pipCtxInternal.fillText('Lỗi render PiP Chat', pipCanvasInternal.width/2, pipCanvasInternal.height/2 -10);
            if(err.message) pipCtxInternal.fillText(err.message.substring(0,40), pipCanvasInternal.width/2, pipCanvasInternal.height/2 + 10);
          } finally {
            document.body.removeChild(offscreenContainer);
          }
        }
      
        async function togglePipChatHandler() { 
          if (document.pictureInPictureElement === videoEl) {
            try { await document.exitPictureInPicture(); } 
            catch (err) { console.error("Error exiting PiP:", err); cleanupPipStateInternal(); }
            return;
          }
          
          pipActiveInternal = true;
          pipNeedsUpdateInternal = true; 
      
          if (!pipStreamInternal || !pipStreamInternal.active) { 
              if (pipStreamInternal) pipStreamInternal.getTracks().forEach(t => t.stop()); 
              pipStreamInternal = pipCanvasInternal.captureStream(25); 
               console.log("PiP Chat: New stream created from canvas.");
          }
          videoEl.srcObject = pipStreamInternal;
          
          try {
            await videoEl.play();
            console.log("PiP Chat: Video element playing.");
            drawPipChatFrameInternal(); 
            await videoEl.requestPictureInPicture();
            // console.log("PiP Chat: Entered PiP successfully."); // Log này sẽ từ listener enterpictureinpicture
          } catch (err) {
            console.error('Failed to enter PiP:', err);
            cleanupPipStateInternal(true); // true để báo là lỗi, cần dừng stream
            alert("Không thể vào chế độ PiP: " + err.message);
          }
        }
      
        function cleanupPipStateInternal(stopStreamOnError = false) { 
          console.log("PiP Chat: Cleaning up PiP state.");
          pipActiveInternal = false;
          if (pipRafId) { cancelAnimationFrame(pipRafId); pipRafId = null; }
          
          if (pipStreamInternal && (stopStreamOnError || !document.pictureInPictureElement)) { // Dừng stream nếu lỗi hoặc không còn trong PiP
            pipStreamInternal.getTracks().forEach(t => t.stop());
            console.log("PiP Chat: Stream tracks stopped.");
            // Không set pipStreamInternal = null ngay, để có thể kiểm tra active ở lần toggle sau
          }
          if (videoEl) videoEl.srcObject = null; 
          
          if (pipBtn) {
              pipBtn.classList.remove('active');
              pipBtn.innerHTML = '<i class="fas fa-window-restore"></i><span class="btn-label">PiP Chat</span>';
          }
        }

        // Event listeners cho video element để quản lý trạng thái PiP
        if (videoEl) {
            videoEl.addEventListener('enterpictureinpicture', () => {
                console.log("PiP Chat: Event 'enterpictureinpicture' fired.");
                pipActiveInternal = true; // Đã được set trong togglePipChatHandler
                pipNeedsUpdateInternal = true; // Cần vẽ lại frame đầu tiên
                 if (pipBtn) {
                    pipBtn.classList.add('active');
                    pipBtn.innerHTML = '<i class="fas fa-window-minimize"></i><span class="btn-label">Thoát PiP</span>';
                }
                if (pipRafId) cancelAnimationFrame(pipRafId); // Dừng frame cũ nếu có
                drawPipChatFrameInternal(); // Bắt đầu vòng lặp vẽ
            });

            videoEl.addEventListener('leavepictureinpicture', () => {
                console.log("PiP Chat: Event 'leavepictureinpicture' fired.");
                cleanupPipStateInternal(false); // false vì đây là thoát bình thường
            });
        }

        // Public API cho module PiP (nếu cần gọi từ bên ngoài)
        // window.PiPChatModule = {
        //     isActive: () => pipActiveInternal,
        //     setNeedsUpdate: () => { if (pipActiveInternal) pipNeedsUpdateInternal = true; }
        // };

    })(); // Kết thúc IIFE module PiP Chat

}); // Kết thúc DOMContentLoaded