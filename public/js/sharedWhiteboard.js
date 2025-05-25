// public/js/sharedWhiteboard.js

/**
 * Shared Whiteboard Module
 * Manages whiteboard state, drawing, pan/zoom, tools, and socket communication.
 *
 * @param {object} config - Configuration object for the whiteboard.
 * @param {HTMLCanvasElement} config.canvasElement - The HTML canvas element.
 * @param {object} config.toolbarElements - Object containing DOM elements for toolbar controls.
 * @param {object} config.socket - The Socket.IO client instance.
 * @param {string} config.roomId - The ID of the current room.
 * @param {string} config.username - The username of the current user.
 * @param {boolean} config.isStreamer - True if the current user is the streamer/host.
 * @param {boolean} config.initialCanDraw - Initial drawing permission (esp. for viewers).
 * @param {boolean} config.initialIsGloballyVisible - Initial global visibility state (esp. for viewers).
 * @param {function(string, string, number?): void} config.showNotificationCallback - Function to show notifications.
 * @param {function(string, string?, string?, string?): Promise<boolean>} config.confirmActionCallback - Function for confirmation dialogs.
 * @param {function(boolean, boolean?): void} config.onVisibilityChangeCallback - Callback when local or global visibility changes.
 * @param {function(boolean): void} config.onPermissionChangeCallback - Callback when viewer's draw permission changes.
 * @param {function(string): void} config.onToolChangeCallback - Callback when the active tool changes.
 * @param {function(HTMLElement): void} config.playButtonFeedbackCallback - Callback for button press visual/audio feedback.
 * @param {function(): string} config.getRoomOwnerUsername - Function to get the room owner's username.
 * @returns {object|null} The public API of the whiteboard module or null if initialization fails.
 */
function initializeSharedWhiteboard(config) {
  const {
    canvasElement,
    toolbarElements, // { colorPicker, lineWidthRange, lineWidthValueDisplay, eraserBtn, clearBtn, panToolBtn, zoomInBtn, zoomOutBtn, resetViewBtn, toggleGridBtn, shapeToolToggleBtn, shapeOptionsContainer, rectShapeBtn, circleShapeBtn, lineShapeBtn, selectToolToggleBtn, snipOptionsContainer, rectangularSnipBtn, freedomSnipBtn, deleteSelectedBtn, coordsDisplayElement, closeWhiteboardBtn, mainToolbar (streamer and viewer versions might be different elements) }
    socket,
    roomId,
    username,
    isStreamer,
    initialCanDraw,
    initialIsGloballyVisible,
    showNotificationCallback,
    confirmActionCallback,
    onVisibilityChangeCallback,
    onPermissionChangeCallback,
    onToolChangeCallback,
    playButtonFeedbackCallback,
    getRoomOwnerUsername,
  } = config;

  if (!canvasElement || !socket) {
    console.error(
      "SharedWhiteboard: Canvas element and socket instance are required."
    );
    return null;
  }

  const ctx = canvasElement.getContext("2d", { alpha: true });
  if (!ctx) {
    console.error("SharedWhiteboard: Failed to get 2D context.");
    return null;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // --- State ---
  let isActive = false; // Is the whiteboard overlay currently displayed and interactive for THIS client
  let isGloballyVisibleByStreamer = isStreamer
    ? false // Streamer's whiteboard starts off for OTHERS by default. They turn it on.
    : initialIsGloballyVisible; // For viewer, what server/initial config says
  let canDraw = isStreamer ? true : initialCanDraw; // Streamer can always draw, viewer depends on initial permission

  let drawingHistory = [];
  let isDrawing = false;
  let currentTool = "pen";
  let currentShapeMode = null;
  let isDrawingShape = false;
  let shapeStartX = 0,
    shapeStartY = 0;

  let currentColor = toolbarElements.colorPicker?.value || "#FFFFFF";
  let currentLineWidth = parseInt(
    toolbarElements.lineWidthRange?.value || "3",
    10
  );
  const ERASER_COLOR_INTERNAL =
    canvasElement.style.backgroundColor || "rgba(32,35,51,1)"; // Match canvas CSS bg for eraser

  // Pan & Zoom State
  const MAX_WORLD_WIDTH = 8192; // Increased virtual canvas size
  const MAX_WORLD_HEIGHT = 8192;
  const camera = {
    x: MAX_WORLD_WIDTH / 2 - canvasElement.width / 2 / 0.5, // Center initial view in a 0.5 scaled world
    y: MAX_WORLD_HEIGHT / 2 - canvasElement.height / 2 / 0.5,
    scale: 0.5,
    isPanning: false,
    lastPanMouseX: 0,
    lastPanMouseY: 0,
    lastPinchDistance: 0,
    isPinching: false,
  };
  const MIN_SCALE = 0.02;
  const MAX_SCALE = 10.0;
  let lastWorldX = 0,
    lastWorldY = 0;

  // Grid State
  let showGrid = false;
  const GRID_SIZE_WORLD = 50;

  // Select & Snip Tool State
  let currentSnipMode = null;
  let isSnipping = false;
  let snipPath = [];
  let snipRect = null;
  let selectedElementIndices = [];
  let isDraggingSelection = false;
  let selectionDragStartX = 0,
    selectionDragStartY = 0;
  let selectionBoundingBox = null;

  let eventThrottleTimer = null;
  const THROTTLE_INTERVAL = 16; // ms (approx 60fps)

  // --- Helper Functions ---
  function worldToScreen(worldX, worldY) {
    const screenX = (worldX - camera.x) * camera.scale;
    const screenY = (worldY - camera.y) * camera.scale;
    return { x: screenX, y: screenY };
  }

  function screenToWorld(screenX, screenY) {
    const worldX = screenX / camera.scale + camera.x;
    const worldY = screenY / camera.scale + camera.y;
    return { x: worldX, y: worldY };
  }

  function getMousePos(evt) {
    const rect = canvasElement.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return screenToWorld(screenX, screenY);
  }

  function updateCoordsDisplay(worldX, worldY, clientX, clientY) {
    if (toolbarElements.coordsDisplayElement) {
      const rect = canvasElement.getBoundingClientRect();
      const screenRelX = clientX - rect.left;
      const screenRelY = clientY - rect.top;
      toolbarElements.coordsDisplayElement.innerHTML = `W:(${Math.round(
        worldX
      )}, ${Math.round(worldY)}) S:(${Math.round(screenRelX)}, ${Math.round(
        screenRelY
      )}) Z:${camera.scale.toFixed(2)} P:(${Math.round(camera.x)}, ${Math.round(
        camera.y
      )})`;
      toolbarElements.coordsDisplayElement.style.display = "block";
    }
  }
  function hideCoordsDisplay() {
    if (toolbarElements.coordsDisplayElement) {
      toolbarElements.coordsDisplayElement.style.display = "none";
    }
  }

  // --- Drawing & Rendering ---
  function drawGrid() {
    if (!showGrid) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    const scaledGridSize = GRID_SIZE_WORLD * camera.scale;
    // Only draw grid if scaled size is reasonable to avoid performance issues
    if (scaledGridSize < 5) {
      ctx.restore();
      return;
    }
    ctx.lineWidth = 1; // Always 1px in screen space for fine grid lines

    const screenViewLeft = 0;
    const screenViewTop = 0;
    const screenViewRight = canvasElement.width;
    const screenViewBottom = canvasElement.height;

    const worldOriginScreen = worldToScreen(0, 0);

    ctx.beginPath();
    // Vertical lines
    let currentScreenX = worldOriginScreen.x % scaledGridSize;
    if (worldOriginScreen.x > 0) currentScreenX -= scaledGridSize; // Adjust if origin is off-screen

    for (let x = currentScreenX; x < screenViewRight; x += scaledGridSize) {
      if (x > screenViewLeft - scaledGridSize) {
        // Draw lines slightly off-screen to avoid gaps when panning
        ctx.moveTo(x, screenViewTop);
        ctx.lineTo(x, screenViewBottom);
      }
    }
    // Horizontal lines
    let currentScreenY = worldOriginScreen.y % scaledGridSize;
    if (worldOriginScreen.y > 0) currentScreenY -= scaledGridSize;

    for (let y = currentScreenY; y < screenViewBottom; y += scaledGridSize) {
      if (y > screenViewTop - scaledGridSize) {
        ctx.moveTo(screenViewLeft, y);
        ctx.lineTo(screenViewRight, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function redrawFullCanvas() {
    if (!isActive || !ctx) return;

    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    drawGrid(); // Draw grid first, in screen space

    ctx.save();
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawingHistory.forEach((item, index) => {
      const isSelected = selectedElementIndices.includes(index);
      ctx.save();
      if (item.isEraser) {
        // For eraser, we need to "punch out" content.
        // This requires drawing on an offscreen canvas and then compositing.
        // Or, if the background is solid, drawing with the background color.
        // Simplest for now: draw with ERASER_COLOR_INTERNAL with source-over.
        // More robust: destination-out, but requires careful handling of alpha.
        ctx.strokeStyle = ERASER_COLOR_INTERNAL; // This will draw the background color
        ctx.globalCompositeOperation = "source-over"; // Ensure it draws over existing content
      } else {
        ctx.strokeStyle = isSelected ? "rgba(0, 150, 255, 0.9)" : item.color;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.lineWidth =
        (item.isEraser ? item.lineWidth + 10 : item.lineWidth) +
        (isSelected ? 2 / camera.scale : 0);

      if (item.type === "draw") {
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.lineTo(item.x1, item.y1);
        ctx.stroke();
      } else if (item.type === "shape") {
        ctx.beginPath();
        if (item.shapeType === "rectangle") {
          ctx.rect(
            item.startX,
            item.startY,
            item.endX - item.startX,
            item.endY - item.startY
          );
        } else if (item.shapeType === "circle") {
          const radius = Math.sqrt(
            Math.pow(item.endX - item.startX, 2) +
              Math.pow(item.endY - item.startY, 2)
          );
          ctx.arc(item.startX, item.startY, radius, 0, 2 * Math.PI);
        } else if (item.shapeType === "line") {
          ctx.moveTo(item.startX, item.startY);
          ctx.lineTo(item.endX, item.endY);
        }
        ctx.stroke();
      }
      ctx.restore();
    });

    if (selectedElementIndices.length > 0 && selectionBoundingBox) {
      ctx.strokeStyle = "rgba(0, 150, 255, 0.9)";
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.setLineDash([6 / camera.scale, 3 / camera.scale]);
      ctx.strokeRect(
        selectionBoundingBox.minX,
        selectionBoundingBox.minY,
        selectionBoundingBox.maxX - selectionBoundingBox.minX,
        selectionBoundingBox.maxY - selectionBoundingBox.minY
      );
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawSegment(
    worldX0,
    worldY0,
    worldX1,
    worldY1,
    color,
    lineWidthVal,
    isEraserStroke
  ) {
    if (!isActive || !ctx) return;
    ctx.save();
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    ctx.beginPath();
    ctx.moveTo(worldX0, worldY0);
    ctx.lineTo(worldX1, worldY1);
    ctx.strokeStyle = isEraserStroke ? ERASER_COLOR_INTERNAL : color;
    ctx.lineWidth = isEraserStroke ? lineWidthVal + 10 : lineWidthVal;
    // For eraser, we draw with the background color directly
    ctx.globalCompositeOperation = "source-over"; // Always draw over for this method
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function addDrawToHistoryAndEmit(
    worldX0,
    worldY0,
    worldX1,
    worldY1,
    colorVal,
    lineWidthVal,
    isEraserFlag
  ) {
    const drawData = {
      type: "draw",
      x0: worldX0,
      y0: worldY0,
      x1: worldX1,
      y1: worldY1,
      color: colorVal,
      lineWidth: lineWidthVal,
      isEraser: isEraserFlag,
      timestamp: Date.now(),
      drawnBy: username,
    };
    drawingHistory.push(drawData);
    if (drawingHistory.length > 500)
      drawingHistory.splice(0, drawingHistory.length - 500);
    socket.emit("wb:draw", { roomId, drawData });
  }

  function finalizeAndEmitShape(
    shapeType,
    wStartX,
    wStartY,
    wEndX,
    wEndY,
    colorVal,
    lineWidthVal
  ) {
    const shapeData = {
      type: "shape",
      shapeType,
      startX: wStartX,
      startY: wStartY,
      endX: wEndX,
      endY: wEndY,
      color: colorVal,
      lineWidth: lineWidthVal,
      isEraser: false,
      timestamp: Date.now(),
      drawnBy: username,
    };
    drawingHistory.push(shapeData);
    if (drawingHistory.length > 500)
      drawingHistory.splice(0, drawingHistory.length - 500);
    socket.emit("wb:drawShape", { roomId, shapeData });
    redrawFullCanvas();
  }

  // --- Tool Activation & UI Updates ---
  function setActiveTool(toolName, shapeSubMode = null) {
    const previousTool = currentTool;
    const previousShapeMode = currentShapeMode;
    currentTool = toolName;
    currentShapeMode = toolName === "shape" ? shapeSubMode : null;
    currentSnipMode =
      toolName === "select" ? currentSnipMode || "rectangular" : null;

    const allToolButtons = [
      toolbarElements.eraserBtn,
      toolbarElements.panToolBtn,
      toolbarElements.shapeToolToggleBtn,
      toolbarElements.selectToolToggleBtn,
      toolbarElements.rectShapeBtn,
      toolbarElements.circleShapeBtn,
      toolbarElements.lineShapeBtn,
      toolbarElements.rectangularSnipBtn,
      toolbarElements.freedomSnipBtn,
    ];
    allToolButtons.forEach((btn) => btn?.classList.remove("active"));

    if (toolName === "pen") {
      /* Default */
    } else if (toolName === "eraser" && toolbarElements.eraserBtn)
      toolbarElements.eraserBtn.classList.add("active");
    else if (toolName === "pan" && toolbarElements.panToolBtn)
      toolbarElements.panToolBtn.classList.add("active");
    else if (toolName === "shape") {
      if (toolbarElements.shapeToolToggleBtn)
        toolbarElements.shapeToolToggleBtn.classList.add("active");
      if (shapeSubMode === "rectangle" && toolbarElements.rectShapeBtn)
        toolbarElements.rectShapeBtn.classList.add("active");
      else if (shapeSubMode === "circle" && toolbarElements.circleShapeBtn)
        toolbarElements.circleShapeBtn.classList.add("active");
      else if (shapeSubMode === "line" && toolbarElements.lineShapeBtn)
        toolbarElements.lineShapeBtn.classList.add("active");
    } else if (toolName === "select") {
      if (toolbarElements.selectToolToggleBtn)
        toolbarElements.selectToolToggleBtn.classList.add("active");
      if (
        currentSnipMode === "rectangular" &&
        toolbarElements.rectangularSnipBtn
      )
        toolbarElements.rectangularSnipBtn.classList.add("active");
      else if (currentSnipMode === "freedom" && toolbarElements.freedomSnipBtn)
        toolbarElements.freedomSnipBtn.classList.add("active");
    }

    canvasElement.style.cursor =
      toolName === "pan"
        ? "grab"
        : toolName === "eraser"
        ? "cell"
        : "crosshair";

    updateToolbarForCurrentTool();

    if (toolName !== "select") {
      selectedElementIndices = [];
      selectionBoundingBox = null;
      if (isStreamer && toolbarElements.deleteSelectedBtn)
        toolbarElements.deleteSelectedBtn.style.display = "none";
      if (isActive) redrawFullCanvas();
    }

    if (
      showNotificationCallback &&
      (previousTool !== currentTool ||
        (currentTool === "shape" && previousShapeMode !== currentShapeMode))
    ) {
      let toolFriendlyName = "Bút vẽ";
      if (currentTool === "eraser") toolFriendlyName = "Tẩy";
      else if (currentTool === "pan") toolFriendlyName = "Di chuyển bảng";
      else if (currentTool === "shape") {
        if (currentShapeMode === "rectangle")
          toolFriendlyName = "Vẽ Hình chữ nhật";
        else if (currentShapeMode === "circle")
          toolFriendlyName = "Vẽ Hình tròn";
        else if (currentShapeMode === "line")
          toolFriendlyName = "Vẽ Đường thẳng";
        else toolFriendlyName = "Công cụ Hình dạng";
      } else if (currentTool === "select")
        toolFriendlyName = "Công cụ Chọn/Cắt";
      showNotificationCallback(`Chế độ: ${toolFriendlyName}`, "info", 1500);
    }
    if (onToolChangeCallback) onToolChangeCallback(currentTool);
  }

  function updateToolbarForCurrentTool() {
    if (isStreamer) {
      if (toolbarElements.shapeOptionsContainer) {
        toolbarElements.shapeOptionsContainer.style.display =
          currentTool === "shape" &&
          toolbarElements.shapeToolToggleBtn?.classList.contains("active")
            ? "flex"
            : "none";
      }
      if (toolbarElements.snipOptionsContainer) {
        toolbarElements.snipOptionsContainer.style.display =
          currentTool === "select" &&
          toolbarElements.selectToolToggleBtn?.classList.contains("active")
            ? "flex"
            : "none";
      }
      if (toolbarElements.deleteSelectedBtn) {
        toolbarElements.deleteSelectedBtn.style.display =
          currentTool === "select" && selectedElementIndices.length > 0
            ? "inline-flex"
            : "none";
      }
    }
  }

  // --- Event Handlers (Mouse, Touch, Wheel) ---
  function handleMouseDown(event) {
    if (!isActive) return;
    event.preventDefault();
    const worldPos = getMousePos(event);
    lastWorldX = worldPos.x;
    lastWorldY = worldPos.y;

    if (currentTool === "pan" || event.button === 1) {
      camera.isPanning = true;
      camera.lastPanMouseX = event.clientX;
      camera.lastPanMouseY = event.clientY;
      canvasElement.style.cursor = "grabbing";
    } else if (event.button === 0 && canDraw) {
      if (currentTool === "pen" || currentTool === "eraser") {
        isDrawing = true;
        const effectiveColor =
          currentTool === "eraser" ? ERASER_COLOR_INTERNAL : currentColor;
        const effectiveLineWidth =
          currentTool === "eraser" ? currentLineWidth + 10 : currentLineWidth;
        drawSegment(
          lastWorldX - 0.01 / camera.scale,
          lastWorldY - 0.01 / camera.scale,
          lastWorldX,
          lastWorldY,
          effectiveColor,
          effectiveLineWidth,
          currentTool === "eraser"
        );
        addDrawToHistoryAndEmit(
          lastWorldX - 0.01 / camera.scale,
          lastWorldY - 0.01 / camera.scale,
          lastWorldX,
          lastWorldY,
          currentColor,
          currentLineWidth,
          currentTool === "eraser"
        );
      } else if (currentTool === "shape" && currentShapeMode) {
        isDrawingShape = true;
        shapeStartX = lastWorldX;
        shapeStartY = lastWorldY;
      } else if (currentTool === "select" && currentSnipMode) {
        isSnipping = true;
        snipPath = [];
        snipRect = {
          startX: lastWorldX,
          startY: lastWorldY,
          currentX: lastWorldX,
          currentY: lastWorldY,
        };
        if (currentSnipMode === "freedom")
          snipPath.push({ x: lastWorldX, y: lastWorldY });

        if (
          selectionBoundingBox &&
          lastWorldX >= selectionBoundingBox.minX &&
          lastWorldX <= selectionBoundingBox.maxX &&
          lastWorldY >= selectionBoundingBox.minY &&
          lastWorldY <= selectionBoundingBox.maxY
        ) {
          isDraggingSelection = true;
          isSnipping = false;
          selectionDragStartX = lastWorldX;
          selectionDragStartY = lastWorldY;
          selectedElementIndices.forEach((index) => {
            const item = drawingHistory[index];
            if (item) {
              if (item.type === "draw") {
                item.originalX0 = item.x0;
                item.originalY0 = item.y0;
                item.originalX1 = item.x1;
                item.originalY1 = item.y1;
              } else if (item.type === "shape") {
                item.originalStartX = item.startX;
                item.originalStartY = item.startY;
                item.originalEndX = item.endX;
                item.originalEndY = item.endY;
              }
            }
          });
          canvasElement.style.cursor = "move";
        } else {
          selectedElementIndices = [];
          selectionBoundingBox = null;
          if (toolbarElements.deleteSelectedBtn)
            toolbarElements.deleteSelectedBtn.style.display = "none";
          redrawFullCanvas();
        }
      }
    }
  }

  function handleMouseMove(event) {
    if (!isActive) return;
    event.preventDefault();
    const worldPos = getMousePos(event);
    updateCoordsDisplay(worldPos.x, worldPos.y, event.clientX, event.clientY);

    if (camera.isPanning) {
      const dx = event.clientX - camera.lastPanMouseX;
      const dy = event.clientY - camera.lastPanMouseY;
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      camera.lastPanMouseX = event.clientX;
      camera.lastPanMouseY = event.clientY;
      redrawFullCanvas();
    } else if (
      isDraggingSelection &&
      selectedElementIndices.length > 0 &&
      canDraw
    ) {
      const deltaX = worldPos.x - selectionDragStartX;
      const deltaY = worldPos.y - selectionDragStartY;
      selectedElementIndices.forEach((index) => {
        const item = drawingHistory[index];
        if (item) {
          if (item.type === "draw") {
            item.x0 = item.originalX0 + deltaX;
            item.y0 = item.originalY0 + deltaY;
            item.x1 = item.originalX1 + deltaX;
            item.y1 = item.originalY1 + deltaY;
          } else if (item.type === "shape") {
            item.startX = item.originalStartX + deltaX;
            item.startY = item.originalStartY + deltaY;
            item.endX = item.originalEndX + deltaX;
            item.endY = item.originalEndY + deltaY;
          }
        }
      });
      calculateSelectionBoundingBox();
      redrawFullCanvas();
    } else if (
      isDrawing &&
      (currentTool === "pen" || currentTool === "eraser") &&
      canDraw
    ) {
      if (eventThrottleTimer) return;
      eventThrottleTimer = setTimeout(() => {
        const effectiveColor =
          currentTool === "eraser" ? ERASER_COLOR_INTERNAL : currentColor;
        const effectiveLineWidth =
          currentTool === "eraser" ? currentLineWidth + 10 : currentLineWidth;
        drawSegment(
          lastWorldX,
          lastWorldY,
          worldPos.x,
          worldPos.y,
          effectiveColor,
          effectiveLineWidth,
          currentTool === "eraser"
        );
        addDrawToHistoryAndEmit(
          lastWorldX,
          lastWorldY,
          worldPos.x,
          worldPos.y,
          currentColor,
          currentLineWidth,
          currentTool === "eraser"
        );
        lastWorldX = worldPos.x;
        lastWorldY = worldPos.y;
        eventThrottleTimer = null;
      }, THROTTLE_INTERVAL);
    } else if (
      isDrawingShape &&
      currentTool === "shape" &&
      currentShapeMode &&
      canDraw
    ) {
      redrawFullCanvas();
      ctx.save();
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.x, -camera.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
      ctx.beginPath();
      if (currentShapeMode === "rectangle")
        ctx.rect(
          shapeStartX,
          shapeStartY,
          worldPos.x - shapeStartX,
          worldPos.y - shapeStartY
        );
      else if (currentShapeMode === "circle") {
        const radius = Math.sqrt(
          Math.pow(worldPos.x - shapeStartX, 2) +
            Math.pow(worldPos.y - shapeStartY, 2)
        );
        ctx.arc(shapeStartX, shapeStartY, radius, 0, 2 * Math.PI);
      } else if (currentShapeMode === "line") {
        ctx.moveTo(shapeStartX, shapeStartY);
        ctx.lineTo(worldPos.x, worldPos.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (
      isSnipping &&
      currentTool === "select" &&
      currentSnipMode &&
      canDraw
    ) {
      redrawFullCanvas();
      ctx.save();
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.x, -camera.y);
      ctx.strokeStyle = "rgba(0, 150, 255, 0.7)";
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.setLineDash([6 / camera.scale, 3 / camera.scale]);
      ctx.beginPath();
      if (currentSnipMode === "rectangular" && snipRect) {
        snipRect.currentX = worldPos.x;
        snipRect.currentY = worldPos.y;
        ctx.rect(
          snipRect.startX,
          snipRect.startY,
          snipRect.currentX - snipRect.startX,
          snipRect.currentY - snipRect.startY
        );
      } else if (currentSnipMode === "freedom") {
        if (snipPath.length > 0) {
          ctx.moveTo(snipPath[0].x, snipPath[0].y);
          for (let i = 1; i < snipPath.length; i++)
            ctx.lineTo(snipPath[i].x, snipPath[i].y);
          ctx.lineTo(worldPos.x, worldPos.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function handleMouseUp(event) {
    if (!isActive) return;
    const worldPos = getMousePos(event);

    if (camera.isPanning) {
      camera.isPanning = false;
      canvasElement.style.cursor = currentTool === "pan" ? "grab" : "crosshair";
    }

    if (isDraggingSelection && canDraw) {
      isDraggingSelection = false;
      canvasElement.style.cursor = "crosshair";
      const movedItemsData = selectedElementIndices.map((index) => {
        const item = drawingHistory[index];
        return {
          index: index,
          newItemData: {
            ...item,
            originalX0: undefined,
            originalY0: undefined,
            originalX1: undefined,
            originalY1: undefined,
            originalStartX: undefined,
            originalStartY: undefined,
            originalEndX: undefined,
            originalEndY: undefined,
          },
        };
      });
      if (movedItemsData.length > 0)
        socket.emit("wb:moveElements", { roomId, movedItemsData });
      selectedElementIndices.forEach((index) => {
        const item = drawingHistory[index];
        if (item) {
          delete item.originalX0;
          delete item.originalY0;
          delete item.originalX1;
          delete item.originalY1;
          delete item.originalStartX;
          delete item.originalStartY;
          delete item.originalEndX;
          delete item.originalEndY;
        }
      });
      redrawFullCanvas();
    } else if (isDrawing) {
      isDrawing = false;
      clearTimeout(eventThrottleTimer);
      eventThrottleTimer = null;
    } else if (
      isDrawingShape &&
      currentTool === "shape" &&
      currentShapeMode &&
      canDraw
    ) {
      isDrawingShape = false;
      finalizeAndEmitShape(
        currentShapeMode,
        shapeStartX,
        shapeStartY,
        worldPos.x,
        worldPos.y,
        currentColor,
        currentLineWidth
      );
    } else if (
      isSnipping &&
      currentTool === "select" &&
      currentSnipMode &&
      canDraw
    ) {
      isSnipping = false;
      if (currentSnipMode === "rectangular" && snipRect)
        selectElementsInRect(
          snipRect.startX,
          snipRect.startY,
          worldPos.x,
          worldPos.y
        );
      else if (currentSnipMode === "freedom") {
        snipPath.push({ x: worldPos.x, y: worldPos.y });
        if (snipPath.length > 2) {
          snipPath.push({ x: snipPath[0].x, y: snipPath[0].y });
          selectElementsInPath(snipPath);
        }
        snipPath = [];
      }
      snipRect = null;
      redrawFullCanvas();
      if (toolbarElements.deleteSelectedBtn)
        toolbarElements.deleteSelectedBtn.style.display =
          selectedElementIndices.length > 0 ? "inline-flex" : "none";
    }
  }

  function handleMouseOut(event) {
    if (isDrawing) {
      isDrawing = false;
      clearTimeout(eventThrottleTimer);
      eventThrottleTimer = null;
    }
    if (isDrawingShape) {
      const worldPos = getMousePos(event);
      finalizeAndEmitShape(
        currentShapeMode,
        shapeStartX,
        shapeStartY,
        worldPos.x,
        worldPos.y,
        currentColor,
        currentLineWidth
      );
      isDrawingShape = false;
    }
    if (isSnipping) {
      isSnipping = false;
      snipPath = [];
      snipRect = null;
      redrawFullCanvas();
    }
    hideCoordsDisplay();
  }

  function handleWheelZoom(event) {
    if (!isActive) return;
    event.preventDefault();
    const zoomFactor = 1.1;
    const oldScale = camera.scale;
    const mouseWorldPosBeforeZoom = getMousePos(event);
    if (event.deltaY < 0) camera.scale *= zoomFactor;
    else camera.scale /= zoomFactor;
    camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, camera.scale));
    camera.x =
      mouseWorldPosBeforeZoom.x -
      (mouseWorldPosBeforeZoom.x - camera.x) * (oldScale / camera.scale);
    camera.y =
      mouseWorldPosBeforeZoom.y -
      (mouseWorldPosBeforeZoom.y - camera.y) * (oldScale / camera.scale);
    redrawFullCanvas();
  }

  // Touch Handlers (Simplified, but keeping core logic)
  let activeTouches = [];
  function cacheTouch(touch) {
    const idx = activeTouches.findIndex(
      (t) => t.identifier === touch.identifier
    );
    const nt = {
      id: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
    if (idx > -1) activeTouches[idx] = nt;
    else activeTouches.push(nt);
  }
  function removeCachedTouch(touch) {
    const idx = activeTouches.findIndex(
      (t) => t.identifier === touch.identifier
    );
    if (idx > -1) activeTouches.splice(idx, 1);
  }
  function getPinchDistance() {
    if (activeTouches.length < 2) return 0;
    const t1 = activeTouches[0],
      t2 = activeTouches[1];
    return Math.sqrt(
      Math.pow(t2.clientX - t1.clientX, 2) +
        Math.pow(t2.clientY - t1.clientY, 2)
    );
  }
  function getPinchCenter() {
    if (activeTouches.length < 2) return null;
    const t1 = activeTouches[0],
      t2 = activeTouches[1];
    return {
      clientX: (t1.clientX + t2.clientX) / 2,
      clientY: (t1.clientY + t2.clientY) / 2,
    };
  }

  function handleTouchStart(event) {
    if (!isActive) return;
    event.preventDefault();
    Array.from(event.changedTouches).forEach(cacheTouch);
    if (activeTouches.length === 1) {
      const touch = activeTouches[0];
      handleMouseDown(touch); // Simulate mousedown
    } else if (activeTouches.length >= 2) {
      isDrawing =
        isDrawingShape =
        isSnipping =
        isDraggingSelection =
        camera.isPanning =
          false;
      camera.isPinching = true;
      camera.lastPinchDistance = getPinchDistance();
    }
  }
  function handleTouchMove(event) {
    if (!isActive) return;
    event.preventDefault();
    Array.from(event.changedTouches).forEach(cacheTouch);
    if (activeTouches.length === 0) return;
    const primaryTouch = activeTouches[0];
    if (camera.isPinching && activeTouches.length >= 2) {
      const newDist = getPinchDistance();
      if (camera.lastPinchDistance > 0 && newDist > 0) {
        const oldScale = camera.scale;
        camera.scale *= newDist / camera.lastPinchDistance;
        camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, camera.scale));
        const pinchCenterClient = getPinchCenter();
        if (pinchCenterClient) {
          const pinchCenterWorld = getMousePos(pinchCenterClient);
          camera.x =
            pinchCenterWorld.x -
            (pinchCenterWorld.x - camera.x) * (oldScale / camera.scale);
          camera.y =
            pinchCenterWorld.y -
            (pinchCenterWorld.y - camera.y) * (oldScale / camera.scale);
        }
      }
      camera.lastPinchDistance = newDist;
      redrawFullCanvas();
    } else if (activeTouches.length === 1) {
      handleMouseMove(primaryTouch); // Simulate mousemove
    }
  }
  function handleTouchEnd(event) {
    if (!isActive) return;
    Array.from(event.changedTouches).forEach(removeCachedTouch);
    const lastTouchUp =
      event.changedTouches[0] ||
      (activeTouches.length > 0 ? activeTouches[0] : null);
    if (lastTouchUp) handleMouseUp(lastTouchUp); // Simulate mouseup

    if (activeTouches.length < 2) camera.isPinching = false;
    if (activeTouches.length < 1) camera.isPanning = false;
    if (activeTouches.length === 0) {
      hideCoordsDisplay();
      if (!camera.isPanning && currentTool === "pan")
        canvasElement.style.cursor = "grab";
    }
  }

  // --- Select/Snip Logic ---
  function calculateSelectionBoundingBox() {
    if (selectedElementIndices.length === 0) {
      selectionBoundingBox = null;
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    selectedElementIndices.forEach((index) => {
      const item = drawingHistory[index];
      if (!item) return;
      if (item.type === "draw") {
        minX = Math.min(minX, item.x0, item.x1);
        minY = Math.min(minY, item.y0, item.y1);
        maxX = Math.max(maxX, item.x0, item.x1);
        maxY = Math.max(maxY, item.y0, item.y1);
      } else if (item.type === "shape") {
        if (item.shapeType === "rectangle" || item.shapeType === "line") {
          minX = Math.min(minX, item.startX, item.endX);
          minY = Math.min(minY, item.startY, item.endY);
          maxX = Math.max(maxX, item.startX, item.endX);
          maxY = Math.max(maxY, item.startY, item.endY);
        } else if (item.shapeType === "circle") {
          const r = Math.sqrt(
            Math.pow(item.endX - item.startX, 2) +
              Math.pow(item.endY - item.startY, 2)
          );
          minX = Math.min(minX, item.startX - r);
          minY = Math.min(minY, item.startY - r);
          maxX = Math.max(maxX, item.startX + r);
          maxY = Math.max(maxY, item.startY + r);
        }
      }
    });
    if (minX !== Infinity) {
      const p = 5 / camera.scale;
      selectionBoundingBox = {
        minX: minX - p,
        minY: minY - p,
        maxX: maxX + p,
        maxY: maxY + p,
      };
    } else selectionBoundingBox = null;
  }
  function isPointInPolygon(point, polygonVertices) {
    if (!polygonVertices || polygonVertices.length < 3) return false;
    let inside = false;
    const x = point.x,
      y = point.y;
    for (
      let i = 0, j = polygonVertices.length - 1;
      i < polygonVertices.length;
      j = i++
    ) {
      const xi = polygonVertices[i].x,
        yi = polygonVertices[i].y;
      const xj = polygonVertices[j].x,
        yj = polygonVertices[j].y;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }
  function selectElementsInRect(wStartX, wStartY, wEndX, wEndY) {
    selectedElementIndices = [];
    const rX1 = Math.min(wStartX, wEndX),
      rY1 = Math.min(wStartY, wEndY),
      rX2 = Math.max(wStartX, wEndX),
      rY2 = Math.max(wStartY, wEndY);
    drawingHistory.forEach((item, index) => {
      if (item.type === "draw") {
        const midX = (item.x0 + item.x1) / 2,
          midY = (item.y0 + item.y1) / 2;
        if (
          (item.x0 >= rX1 &&
            item.x0 <= rX2 &&
            item.y0 >= rY1 &&
            item.y0 <= rY2) ||
          (item.x1 >= rX1 &&
            item.x1 <= rX2 &&
            item.y1 >= rY1 &&
            item.y1 <= rY2) ||
          (midX >= rX1 && midX <= rX2 && midY >= rY1 && midY <= rY2)
        )
          selectedElementIndices.push(index);
      } else if (item.type === "shape") {
        let sMinX, sMinY, sMaxX, sMaxY;
        if (item.shapeType === "rectangle" || item.shapeType === "line") {
          sMinX = Math.min(item.startX, item.endX);
          sMinY = Math.min(item.startY, item.endY);
          sMaxX = Math.max(item.startX, item.endX);
          sMaxY = Math.max(item.startY, item.endY);
        } else if (item.shapeType === "circle") {
          const r = Math.sqrt(
            Math.pow(item.endX - item.startX, 2) +
              Math.pow(item.endY - item.startY, 2)
          );
          sMinX = item.startX - r;
          sMinY = item.startY - r;
          sMaxX = item.startX + r;
          sMaxY = item.startY + r;
        }
        if (
          sMinX !== undefined &&
          sMinX <= rX2 &&
          sMaxX >= rX1 &&
          sMinY <= rY2 &&
          sMaxY >= rY1
        )
          selectedElementIndices.push(index);
      }
    });
    calculateSelectionBoundingBox();
    if (showNotificationCallback)
      showNotificationCallback(
        `Đã chọn ${selectedElementIndices.length} đối tượng.`,
        "info",
        1500
      );
  }
  function selectElementsInPath(worldPathPoints) {
    selectedElementIndices = [];
    if (worldPathPoints.length < 3) return;
    drawingHistory.forEach((item, index) => {
      if (item.type === "draw") {
        const p0 = { x: item.x0, y: item.y0 },
          p1 = { x: item.x1, y: item.y1 },
          mid = { x: (item.x0 + item.x1) / 2, y: (item.y0 + item.y1) / 2 };
        if (
          isPointInPolygon(p0, worldPathPoints) ||
          isPointInPolygon(p1, worldPathPoints) ||
          isPointInPolygon(mid, worldPathPoints)
        )
          selectedElementIndices.push(index);
      } else if (item.type === "shape") {
        let cX, cY;
        if (item.shapeType === "rectangle" || item.shapeType === "line") {
          cX = (item.startX + item.endX) / 2;
          cY = (item.startY + item.endY) / 2;
        } else if (item.shapeType === "circle") {
          cX = item.startX;
          cY = item.startY;
        }
        if (
          cX !== undefined &&
          isPointInPolygon({ x: cX, y: cY }, worldPathPoints)
        )
          selectedElementIndices.push(index);
      }
    });
    calculateSelectionBoundingBox();
    if (showNotificationCallback)
      showNotificationCallback(
        `Đã chọn ${selectedElementIndices.length} đối tượng.`,
        "info",
        1500
      );
  }
  function deleteSelected() {
    if (selectedElementIndices.length === 0 || !canDraw) return;
    const indicesToDelete = [...selectedElementIndices].sort((a, b) => b - a);
    indicesToDelete.forEach((index) => drawingHistory.splice(index, 1));
    socket.emit("wb:deleteElements", { roomId, indices: indicesToDelete });
    selectedElementIndices = [];
    selectionBoundingBox = null;
    if (toolbarElements.deleteSelectedBtn)
      toolbarElements.deleteSelectedBtn.style.display = "none";
    redrawFullCanvas();
    if (showNotificationCallback)
      showNotificationCallback(
        `Đã xóa ${indicesToDelete.length} đối tượng.`,
        "info",
        2000
      );
  }

  // --- Socket Event Handlers ---
  function handleSocketDraw(data) {
    if (data.drawnBy === username) return;
    const item = data.drawData;
    if (item.type === "draw") {
      drawSegment(
        item.x0,
        item.y0,
        item.x1,
        item.y1,
        item.color,
        item.lineWidth,
        item.isEraser
      );
      drawingHistory.push(item);
      if (drawingHistory.length > 500)
        drawingHistory.splice(0, drawingHistory.length - 500);
    }
  }
  function handleSocketDrawShape(data) {
    if (data.drawnBy === username) return;
    const shapeData = data.shapeData;
    drawingHistory.push(shapeData);
    if (drawingHistory.length > 500)
      drawingHistory.splice(0, drawingHistory.length - 500);
    redrawFullCanvas();
  }
  function handleSocketClear() {
    drawingHistory = [{ type: "clear", timestamp: Date.now() }];
    redrawFullCanvas();
    if (showNotificationCallback && !isStreamer)
      showNotificationCallback("Bảng vẽ đã được xóa bởi chủ phòng.", "info"); // Notify viewer only
  }
  function handleSocketInitState(state) {
    if (state && Array.isArray(state.history)) {
      drawingHistory = state.history.map((item) => ({ ...item }));
      console.log(`WB: State restored. Items: ${drawingHistory.length}`);
    } else {
      drawingHistory = [];
      console.log("WB: Received empty/invalid initial state.");
    }
    selectedElementIndices = [];
    selectionBoundingBox = null;
    if (toolbarElements.deleteSelectedBtn)
      toolbarElements.deleteSelectedBtn.style.display = "none";
    redrawFullCanvas();
  }
  function handleSocketMoveElements(data) {
    if (!data || !Array.isArray(data.movedItemsData)) return;
    data.movedItemsData.forEach((movedItem) => {
      if (drawingHistory[movedItem.index])
        Object.assign(drawingHistory[movedItem.index], movedItem.newItemData);
    });
    if (
      selectedElementIndices.some((idx) =>
        data.movedItemsData.find((m) => m.index === idx)
      )
    )
      calculateSelectionBoundingBox();
    redrawFullCanvas();
  }
  function handleSocketDeleteElements(data) {
    if (!data || !Array.isArray(data.indices)) return;
    const indicesToDelete = [...data.indices].sort((a, b) => b - a);
    indicesToDelete.forEach((index) => {
      if (drawingHistory[index]) drawingHistory.splice(index, 1);
    });
    selectedElementIndices = selectedElementIndices.filter(
      (idx) => !indicesToDelete.includes(idx)
    );
    if (selectedElementIndices.length === 0) {
      selectionBoundingBox = null;
      if (toolbarElements.deleteSelectedBtn)
        toolbarElements.deleteSelectedBtn.style.display = "none";
    } else calculateSelectionBoundingBox();
    redrawFullCanvas();
  }

  // --- Public API & Lifecycle ---
  function resizeCanvas() {
    if (!isActive || !canvasElement.parentElement) return;
    const mainToolbar = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.viewerToolbar; // Use appropriate toolbar
    const toolbarHeight =
      mainToolbar && mainToolbar.style.display !== "none"
        ? mainToolbar.offsetHeight
        : 0;
    const overlayPadding = 0; // Using inset for overlay, padding handled by canvas parent

    let viewportWidth =
      canvasElement.parentElement.clientWidth - 2 * overlayPadding;
    let viewportHeight =
      canvasElement.parentElement.clientHeight -
      toolbarHeight -
      2 * overlayPadding -
      (mainToolbar && mainToolbar.style.display !== "none" ? 5 : 0);
    viewportWidth = Math.max(100, viewportWidth);
    viewportHeight = Math.max(100, viewportHeight);

    if (
      canvasElement.width !== viewportWidth ||
      canvasElement.height !== viewportHeight
    ) {
      canvasElement.width = viewportWidth;
      canvasElement.height = viewportHeight;
    }
    // These might not be needed if CSS handles canvas size correctly with parent
    // canvasElement.style.width = `${viewportWidth}px`;
    // canvasElement.style.height = `${viewportHeight}px`;

    if (mainToolbar && mainToolbar.style.display !== "none") {
      mainToolbar.style.width = `${viewportWidth}px`;
    }
    redrawFullCanvas();
  }

  function show() {
    if (isActive) return;
    isActive = true;
    if (!canvasElement.parentElement) {
      console.error("Canvas parent element not found for showing whiteboard.");
      return;
    }
    canvasElement.parentElement.style.opacity = "0"; // Start transparent for GSAP
    canvasElement.parentElement.style.display = "flex";

    const currentMainToolbar = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.viewerToolbar;
    if (currentMainToolbar) currentMainToolbar.style.display = "flex";

    resizeCanvas();

    if (!prefersReducedMotion && typeof gsap !== "undefined") {
      gsap.to(canvasElement.parentElement, {
        duration: 0.5,
        autoAlpha: 1,
        ease: "power2.out",
      });
      if (currentMainToolbar)
        gsap.fromTo(
          currentMainToolbar,
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, duration: 0.4, delay: 0.1, ease: "power2.out" }
        );
    } else {
      gsap.set(canvasElement.parentElement, { autoAlpha: 1 });
      if (currentMainToolbar)
        gsap.set(currentMainToolbar, { opacity: 1, y: 0 });
    }
    window.addEventListener("resize", resizeCanvas);
    if (onVisibilityChangeCallback)
      onVisibilityChangeCallback(true, isGloballyVisibleByStreamer);
    if (socket.connected) socket.emit("wb:requestInitialState", { roomId });
    console.log(
      `WB shown for ${
        isStreamer ? "streamer" : "viewer"
      }. Global: ${isGloballyVisibleByStreamer}, CanDraw: ${canDraw}`
    );
  }

  function hide() {
    if (!isActive) return;
    const parentOverlay = canvasElement.parentElement;
    const currentMainToolbar = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.viewerToolbar;

    const onHideComplete = () => {
      isActive = false;
      if (parentOverlay) parentOverlay.style.display = "none";
      if (currentMainToolbar) currentMainToolbar.style.display = "none";
      if (isStreamer) {
        // Also hide sub-tool containers for streamer
        if (toolbarElements.shapeOptionsContainer)
          toolbarElements.shapeOptionsContainer.style.display = "none";
        if (toolbarElements.snipOptionsContainer)
          toolbarElements.snipOptionsContainer.style.display = "none";
        if (toolbarElements.deleteSelectedBtn)
          toolbarElements.deleteSelectedBtn.style.display = "none";
      }
      window.removeEventListener("resize", resizeCanvas);
      if (onVisibilityChangeCallback)
        onVisibilityChangeCallback(false, isGloballyVisibleByStreamer);
      console.log(`WB hidden. Global: ${isGloballyVisibleByStreamer}`);
    };

    if (!prefersReducedMotion && typeof gsap !== "undefined") {
      if (currentMainToolbar)
        gsap.to(currentMainToolbar, {
          opacity: 0,
          y: -10,
          duration: 0.3,
          ease: "power1.in",
        });
      gsap.to(parentOverlay, {
        duration: 0.4,
        autoAlpha: 0,
        delay: currentMainToolbar ? 0.1 : 0,
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    } else {
      gsap.set(parentOverlay, { autoAlpha: 0 });
      if (currentMainToolbar) gsap.set(currentMainToolbar, { opacity: 0 });
      onHideComplete();
    }
  }

  function setupEventListeners() {
    canvasElement.addEventListener("mousedown", handleMouseDown);
    canvasElement.addEventListener("mousemove", handleMouseMove);
    canvasElement.addEventListener("mouseup", handleMouseUp);
    canvasElement.addEventListener("mouseout", handleMouseOut);
    canvasElement.addEventListener("wheel", handleWheelZoom, {
      passive: false,
    });
    canvasElement.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    canvasElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    canvasElement.addEventListener("touchend", handleTouchEnd);
    canvasElement.addEventListener("touchcancel", handleTouchEnd);

    if (toolbarElements.colorPicker) {
      toolbarElements.colorPicker.value = currentColor;
      toolbarElements.colorPicker.addEventListener("input", (e) => {
        currentColor = e.target.value;
        if (currentTool === "eraser") setActiveTool("pen");
      });
    }
    if (toolbarElements.lineWidthRange) {
      toolbarElements.lineWidthRange.value = String(currentLineWidth);
      if (toolbarElements.lineWidthValueDisplay)
        toolbarElements.lineWidthValueDisplay.textContent =
          String(currentLineWidth);
      toolbarElements.lineWidthRange.addEventListener("input", (e) => {
        currentLineWidth = parseInt(e.target.value, 10);
        if (toolbarElements.lineWidthValueDisplay)
          toolbarElements.lineWidthValueDisplay.textContent =
            String(currentLineWidth);
      });
    }
    if (toolbarElements.eraserBtn) {
      toolbarElements.eraserBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.eraserBtn);
        setActiveTool(currentTool === "eraser" ? "pen" : "eraser");
      });
    }
    if (toolbarElements.clearBtn && isStreamer) {
      toolbarElements.clearBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.clearBtn);
        (confirmActionCallback || window.confirm)(
          "Xóa toàn bộ nội dung bảng vẽ? Hành động này không thể hoàn tác.",
          "Xóa",
          "Hủy",
          "fas fa-trash-alt"
        ).then((confirmed) => {
          if (confirmed) {
            drawingHistory = [{ type: "clear", timestamp: Date.now() }];
            redrawFullCanvas();
            socket.emit("wb:clear", { roomId });
          }
        });
      });
    }
    if (toolbarElements.panToolBtn) {
      toolbarElements.panToolBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.panToolBtn);
        setActiveTool(currentTool === "pan" ? "pen" : "pan");
      });
    }
    if (toolbarElements.zoomInBtn) {
      toolbarElements.zoomInBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.zoomInBtn);
        const oS = camera.scale;
        camera.scale = Math.min(MAX_SCALE, camera.scale * 1.2);
        const wC = screenToWorld(
          canvasElement.width / 2,
          canvasElement.height / 2
        );
        camera.x = wC.x - canvasElement.width / 2 / camera.scale;
        camera.y = wC.y - canvasElement.height / 2 / camera.scale;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.zoomOutBtn) {
      toolbarElements.zoomOutBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.zoomOutBtn);
        const oS = camera.scale;
        camera.scale = Math.max(MIN_SCALE, camera.scale / 1.2);
        const wC = screenToWorld(
          canvasElement.width / 2,
          canvasElement.height / 2
        );
        camera.x = wC.x - canvasElement.width / 2 / camera.scale;
        camera.y = wC.y - canvasElement.height / 2 / camera.scale;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.resetViewBtn) {
      toolbarElements.resetViewBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.resetViewBtn);
        camera.x = MAX_WORLD_WIDTH / 2 - canvasElement.width / 2 / 0.5;
        camera.y = MAX_WORLD_HEIGHT / 2 - canvasElement.height / 2 / 0.5;
        camera.scale = 0.5;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.toggleGridBtn) {
      toolbarElements.toggleGridBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.toggleGridBtn);
        showGrid = !showGrid;
        toolbarElements.toggleGridBtn.classList.toggle("active", showGrid);
        redrawFullCanvas();
        if (showNotificationCallback)
          showNotificationCallback(
            showGrid ? "Lưới Bật" : "Lưới Tắt",
            "info",
            1000
          );
      });
    }

    if (isStreamer) {
      // Streamer-only toolbar interactions
      if (toolbarElements.shapeToolToggleBtn) {
        toolbarElements.shapeToolToggleBtn.addEventListener("click", () => {
          playButtonFeedbackCallback?.(toolbarElements.shapeToolToggleBtn);
          if (currentTool === "shape") setActiveTool("pen");
          else setActiveTool("shape", currentShapeMode || "rectangle");
          updateToolbarForCurrentTool();
        });
      }
      [
        { btn: toolbarElements.rectShapeBtn, mode: "rectangle" },
        { btn: toolbarElements.circleShapeBtn, mode: "circle" },
        { btn: toolbarElements.lineShapeBtn, mode: "line" },
      ].forEach((c) => {
        if (c.btn)
          c.btn.addEventListener("click", () => {
            playButtonFeedbackCallback?.(c.btn);
            setActiveTool("shape", c.mode);
            updateToolbarForCurrentTool();
          });
      });
      if (toolbarElements.selectToolToggleBtn) {
        toolbarElements.selectToolToggleBtn.addEventListener("click", () => {
          playButtonFeedbackCallback?.(toolbarElements.selectToolToggleBtn);
          if (currentTool === "select") setActiveTool("pen");
          else setActiveTool("select", currentSnipMode || "rectangular");
          updateToolbarForCurrentTool();
        });
      }
      [
        { btn: toolbarElements.rectangularSnipBtn, mode: "rectangular" },
        { btn: toolbarElements.freedomSnipBtn, mode: "freedom" },
      ].forEach((c) => {
        if (c.btn)
          c.btn.addEventListener("click", () => {
            playButtonFeedbackCallback?.(c.btn);
            setActiveTool("select", c.mode);
            updateToolbarForCurrentTool();
          });
      });
      if (toolbarElements.deleteSelectedBtn) {
        toolbarElements.deleteSelectedBtn.addEventListener("click", () => {
          playButtonFeedbackCallback?.(toolbarElements.deleteSelectedBtn);
          deleteSelected();
        });
      }
    }
    if (toolbarElements.closeWhiteboardBtn) {
      toolbarElements.closeWhiteboardBtn.addEventListener("click", () => {
        playButtonFeedbackCallback?.(toolbarElements.closeWhiteboardBtn);
        if (isStreamer) {
          publicApi.setGlobalVisibility(false); // Streamer's close button hides it globally
        } else {
          hide(); // Viewer's close button just hides it locally
        }
      });
    }

    socket.on("wb:draw", handleSocketDraw);
    socket.on("wb:drawShape", handleSocketDrawShape);
    socket.on("wb:clear", handleSocketClear);
    socket.on("wb:initState", handleSocketInitState);
    socket.on("wb:moveElements", handleSocketMoveElements);
    socket.on("wb:deleteElements", handleSocketDeleteElements);

    if (!isStreamer) {
      socket.on("wb:permissionUpdate", (data) => {
        if (data.viewerUsername === username) {
          canDraw = data.canDraw;
          if (onPermissionChangeCallback) onPermissionChangeCallback(canDraw);
          if (
            !canDraw &&
            (currentTool === "pen" ||
              currentTool === "eraser" ||
              currentTool === "shape" ||
              currentTool === "select")
          )
            canvasElement.style.cursor = "default";
          else if (canDraw && currentTool !== "pan")
            canvasElement.style.cursor =
              currentTool === "eraser" ? "cell" : "crosshair";
        }
      });
      socket.on("wb:toggleVisibility", (data) => {
        const oldGlobalVisibility = isGloballyVisibleByStreamer;
        isGloballyVisibleByStreamer = data.isVisible;
        console.log(
          `WB VIEWER ${username}: Global visibility is NOW ${isGloballyVisibleByStreamer}`
        );
        if (onVisibilityChangeCallback)
          onVisibilityChangeCallback(isActive, isGloballyVisibleByStreamer);
        if (!isGloballyVisibleByStreamer && isActive) hide(); // Force hide if streamer turned it off globally
      });
    }
  }

  setupEventListeners();
  setActiveTool(isStreamer ? "pen" : "pan"); // Default tool

  // Initial visibility setup
  if (isStreamer) {
    // Streamer starts with WB locally hidden, must explicitly show it (which also sets global)
    hide(); // This will call onVisibilityChangeCallback(false, false)
  } else {
    // Viewer: if it's globally visible, show it. Otherwise, keep it hidden.
    if (isGloballyVisibleByStreamer) {
      show();
    } else {
      hide();
    }
  }

  const publicApi = {
    show,
    hide,
    resize: resizeCanvas,
    isActive: () => isActive,
    isGloballyVisible: () => isGloballyVisibleByStreamer, // Reflects streamer's choice
    setGlobalVisibility: (visible) => { // Parameter is 'visible'
      if (!isStreamer) return;
      const changed = isGloballyVisibleByStreamer !== visible;
      isGloballyVisibleByStreamer = visible;

      // CORRECTED LINE: Use the 'visible' parameter
      socket.emit("wb:toggleGlobalVisibility", {
        roomId,
        isVisible: visible, // Use the 'visible' parameter here
      });

      if (changed) { // Only show/hide if state actually changed
          if (visible) {
            show();
          } else {
            hide();
          }
      }
      // onVisibilityChangeCallback is called by show/hide
      // Ensure the callback is also called if the state didn't change but an explicit setGlobalVisibility happened
      // This might be redundant if show/hide always call it, but good for explicit calls.
      // However, if show/hide already call it, this might double-call.
      // Let's rely on show()/hide() to call onVisibilityChangeCallback.
      // if (!changed && onVisibilityChangeCallback) {
      //     onVisibilityChangeCallback(isActive, isGloballyVisibleByStreamer);
      // }
    },
    setViewerDrawPermission: (viewerUsernameToSet, newPermission) => {
      if (!isStreamer) return;
      socket.emit("wb:toggleViewerDrawPermission", {
        roomId,
        viewerUsername: viewerUsernameToSet,
        canDraw: newPermission,
      });
    },
    forceRequestInitialState: () => {
      if (socket.connected) socket.emit("wb:requestInitialState", { roomId });
    },
    getDrawingHistory: () => [...drawingHistory],
    loadDrawingHistory: (history) => {
      if (Array.isArray(history)) {
        drawingHistory = [...history];
        redrawFullCanvas();
      }
    },
    destroy: () => {
      // Remove all event listeners
      canvasElement.removeEventListener("mousedown", handleMouseDown);
      canvasElement.removeEventListener("mousemove", handleMouseMove);
      canvasElement.removeEventListener("mouseup", handleMouseUp);
      canvasElement.removeEventListener("mouseout", handleMouseOut);
      canvasElement.removeEventListener("wheel", handleWheelZoom);
      canvasElement.removeEventListener("touchstart", handleTouchStart);
      canvasElement.removeEventListener("touchmove", handleTouchMove);
      canvasElement.removeEventListener("touchend", handleTouchEnd);
      canvasElement.removeEventListener("touchcancel", handleTouchEnd);
      window.removeEventListener("resize", resizeCanvas);

      // Remove socket listeners specific to this module
      socket.off("wb:draw", handleSocketDraw);
      socket.off("wb:drawShape", handleSocketDrawShape);
      socket.off("wb:clear", handleSocketClear);
      socket.off("wb:initState", handleSocketInitState);
      socket.off("wb:permissionUpdate");
      socket.off("wb:toggleVisibility");
      socket.off("wb:moveElements", handleSocketMoveElements);
      socket.off("wb:deleteElements", handleSocketDeleteElements);

      console.log("SharedWhiteboard destroyed.");
    },
  };

  return publicApi;
}
