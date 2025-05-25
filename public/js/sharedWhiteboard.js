/**
 * Shared Whiteboard Module
 * Manages whiteboard state, drawing, pan/zoom, tools, and socket communication.
 *
 * Events Emitted by this module (via provided socket instance):
 * - wb:draw (for lines and eraser strokes)
 * - wb:drawShape (for finalized shapes like rect, circle, line)
 * - wb:clear
 * - wb:moveElements
 * - wb:deleteElements
 * - wb:toggleGlobalVisibility (streamer only)
 * - wb:toggleViewerDrawPermission (streamer only)
 * - wb:requestInitialState (on init or when visibility is toggled on)
 *
 * Events Listened To by this module (via provided socket instance):
 * - wb:draw
 * - wb:drawShape
 * - wb:clear
 * - wb:initState
 * - wb:permissionUpdate (for viewers)
 * - wb:toggleVisibility (global visibility changes)
 * - wb:moveElements
 * - wb:deleteElements
 */

function initializeSharedWhiteboard(canvasId, socket, currentRoomId, currentUserId, isHost) {
  const {
    canvasElement,
    toolbarElements, // { colorPicker, lineWidthRange, lineWidthValueDisplay, eraserBtn, clearBtn, panToolBtn, zoomInBtn, zoomOutBtn, resetViewBtn, toggleGridBtn, shapeToolToggleBtn, shapeOptionsContainer, rectShapeBtn, circleShapeBtn, lineShapeBtn, selectToolToggleBtn, snipOptionsContainer, rectangularSnipBtn, freedomSnipBtn, deleteSelectedBtn, coordsDisplayElement (optional) }
    socket,
    roomId,
    username,
    isStreamer, // boolean
    initialCanDraw, // boolean, relevant for viewer
    showNotificationCallback, // (message, type, duration) -> typically window.showAlert
    confirmActionCallback, // (message, confirmText, cancelText, iconClass) -> typically showArtisticConfirm or window.confirm
    onVisibilityChangeCallback, // (isVisible: boolean) -> for parent to update its UI
    onPermissionChangeCallback, // (canDraw: boolean) -> for viewer parent to update UI
    onToolChangeCallback, // (activeTool: string) -> for parent if it needs to know
    playButtonFeedbackCallback,
    getRoomOwnerUsername, // () => string
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
    ? false
    : initialIsGloballyVisible; // For viewer, what server says
  let canDraw = initialCanDraw;

  let drawingHistory = []; // {type: 'draw'/'shape'/'clear'/'delete'/'move', ...data}
  let isDrawing = false;
  let currentTool = "pen"; // 'pen', 'eraser', 'shape', 'select', 'pan'
  let currentShapeMode = null; // 'rectangle', 'circle', 'line' (if currentTool is 'shape')
  let isDrawingShape = false;
  let shapeStartX = 0,
    shapeStartY = 0;

  let currentColor = toolbarElements.colorPicker?.value || "#FFFFFF";
  let currentLineWidth = parseInt(
    toolbarElements.lineWidthRange?.value || "3",
    10
  );
  const ERASER_COLOR_INTERNAL =
    canvasElement.style.backgroundColor || "#202333"; // Match canvas CSS bg for eraser effect

  // Pan & Zoom State (World Coordinates)
  const MAX_WORLD_WIDTH = 4096; // Virtual canvas size
  const MAX_WORLD_HEIGHT = 4096;
  const camera = {
    x: MAX_WORLD_WIDTH / 4, // Initial pan X (world coord at top-left of viewport)
    y: MAX_WORLD_HEIGHT / 4, // Initial pan Y
    scale: 0.5,
    isPanning: false,
    lastPanMouseX: 0,
    lastPanMouseY: 0,
    lastPinchDistance: 0,
    isPinching: false,
  };
  const MIN_SCALE = 0.05;
  const MAX_SCALE = 10.0;
  let lastWorldX = 0,
    lastWorldY = 0; // For drawing

  // Grid State
  let showGrid = false;
  const GRID_SIZE_WORLD = 50;

  // Select & Snip Tool State
  let currentSnipMode = null; // 'rectangular', 'freedom'
  let isSnipping = false;
  let snipPath = []; // For freedom snip: array of {x,y} in world coords
  let snipRect = null; // For rectangular snip: {startX, startY, currentX, currentY} in world coords
  let selectedElementIndices = [];
  let isDraggingSelection = false;
  let selectionDragStartX = 0,
    selectionDragStartY = 0;
  let selectionBoundingBox = null; // {minX, minY, maxX, maxY} of selected elements in world coords

  let eventThrottleTimer = null;
  const THROTTLE_INTERVAL = 16; // ms

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
    // Screen coordinates relative to the canvas element
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return screenToWorld(screenX, screenY); // Return world coordinates
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
    ctx.lineWidth = 1 / camera.scale; // Keep grid lines thin

    const worldViewLeft = camera.x;
    const worldViewTop = camera.y;
    const worldViewRight = camera.x + canvasElement.width / camera.scale;
    const worldViewBottom = camera.y + canvasElement.height / camera.scale;

    const startX =
      Math.floor(worldViewLeft / GRID_SIZE_WORLD) * GRID_SIZE_WORLD;
    const startY = Math.floor(worldViewTop / GRID_SIZE_WORLD) * GRID_SIZE_WORLD;

    ctx.beginPath();
    for (let x = startX; x < worldViewRight; x += GRID_SIZE_WORLD) {
      if (x > -MAX_WORLD_WIDTH / 2 && x < MAX_WORLD_WIDTH / 2) {
        // Optional: constrain grid to world bounds
        ctx.moveTo(x, worldViewTop);
        ctx.lineTo(x, worldViewBottom);
      }
    }
    for (let y = startY; y < worldViewBottom; y += GRID_SIZE_WORLD) {
      if (y > -MAX_WORLD_HEIGHT / 2 && y < MAX_WORLD_HEIGHT / 2) {
        ctx.moveTo(worldViewLeft, y);
        ctx.lineTo(worldViewRight, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function redrawFullCanvas() {
    if (!isActive || !ctx) return;

    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.save();
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    drawGrid();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawingHistory.forEach((item, index) => {
      const isSelected = selectedElementIndices.includes(index);
      ctx.save(); // Save context state for each item
      if (item.isEraser) {
        ctx.globalCompositeOperation = "destination-out";
        // Use the canvas background color for "erasing" if destination-out is not enough or for visual consistency
        // This requires knowing the actual background color used by the canvas CSS
        // For this example, we assume destination-out is sufficient.
        // If not, you'd do: ctx.strokeStyle = ERASER_COLOR_INTERNAL;
      } else {
        ctx.strokeStyle = isSelected ? "rgba(0, 150, 255, 0.9)" : item.color;
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
      // Handle other types like 'clear', 'image' if added to history
      ctx.restore(); // Restore to default composite operation and styles
    });

    // Draw selection bounding box
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
    ctx.restore(); // Restore from initial save
  }

  function drawSegment(
    worldX0,
    worldY0,
    worldX1,
    worldY1,
    color,
    lineWidth,
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
    ctx.lineWidth = isEraserStroke ? lineWidth + 10 : lineWidth;
    ctx.globalCompositeOperation = isEraserStroke
      ? "destination-out"
      : "source-over";
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
      type: "shape", // Distinguish from simple draw lines in history
      shapeType: shapeType,
      startX: wStartX,
      startY: wStartY,
      endX: wEndX,
      endY: wEndY,
      color: colorVal,
      lineWidth: lineWidthVal,
      isEraser: false, // Shapes are not erasers
      timestamp: Date.now(),
      drawnBy: username,
    };
    drawingHistory.push(shapeData);
    if (drawingHistory.length > 500)
      drawingHistory.splice(0, drawingHistory.length - 500);

    socket.emit("wb:drawShape", { roomId, shapeData });
    redrawFullCanvas(); // Redraw to show the finalized shape from history
  }

  // --- Tool Activation & UI Updates ---
  function setActiveTool(toolName, shapeSubMode = null) {
    const previousTool = currentTool;
    currentTool = toolName;
    currentShapeMode = toolName === "shape" ? shapeSubMode : null;
    currentSnipMode =
      toolName === "select" ? currentSnipMode || "rectangular" : null; // Keep current snip mode or default

    // Deactivate all tool buttons visually
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

    // Activate the current tool button
    if (toolName === "pen") {
      /* No specific button for pen, it's the default */
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

    // Update cursor
    if (toolName === "pan") canvasElement.style.cursor = "grab";
    else if (toolName === "eraser") canvasElement.style.cursor = "cell";
    else canvasElement.style.cursor = "crosshair"; // pen, shape, select

    updateToolbarForCurrentTool(); // Update visibility of sub-tool containers

    if (toolName !== "select") {
      selectedElementIndices = [];
      selectionBoundingBox = null;
      if (isStreamer && toolbarElements.deleteSelectedBtn)
        toolbarElements.deleteSelectedBtn.style.display = "none";
      if (isActive) redrawFullCanvas(); // Clear selection visuals only if active
    }

    if (
      showNotificationCallback &&
      previousTool !== currentTool &&
      (previousTool !== "shape" || currentShapeMode !== shapeSubMode)
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
        else toolFriendlyName = "Công cụ Hình dạng"; // When only main shape toggle is hit
      } else if (currentTool === "select")
        toolFriendlyName = "Công cụ Chọn/Cắt";
      showNotificationCallback(`Chế độ: ${toolFriendlyName}`, "info", 1500);
    }
    if (onToolChangeCallback) onToolChangeCallback(currentTool);
  }

  // --- Event Handlers (Mouse, Touch, Wheel) ---
  function handleMouseDown(event) {
    if (!isActive) return;
    event.preventDefault();
    const worldPos = getMousePos(event);
    lastWorldX = worldPos.x;
    lastWorldY = worldPos.y;

    if (currentTool === "pan" || event.button === 1 /* Middle mouse */) {
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
        // Draw a dot for the start
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
          currentColor, // Always emit original color for pen
          currentLineWidth,
          currentTool === "eraser"
        );
      } else if (currentTool === "shape" && currentShapeMode) {
        isDrawingShape = true;
        shapeStartX = lastWorldX;
        shapeStartY = lastWorldY;
      } else if (currentTool === "select" && currentSnipMode) {
        isSnipping = true;
        snipPath = []; // Reset for freedom snip
        snipRect = {
          startX: lastWorldX,
          startY: lastWorldY,
          currentX: lastWorldX,
          currentY: lastWorldY,
        };
        if (currentSnipMode === "freedom") {
          snipPath.push({ x: lastWorldX, y: lastWorldY });
        }
        // Clear previous selection when starting a new one, unless dragging
        if (!isDraggingSelection) {
          selectedElementIndices = [];
          selectionBoundingBox = null;
          if (toolbarElements.deleteSelectedBtn)
            toolbarElements.deleteSelectedBtn.style.display = "none";
          redrawFullCanvas();
        }

        // Check if clicking inside existing selection to start drag
        if (
          selectionBoundingBox &&
          lastWorldX >= selectionBoundingBox.minX &&
          lastWorldX <= selectionBoundingBox.maxX &&
          lastWorldY >= selectionBoundingBox.minY &&
          lastWorldY <= selectionBoundingBox.maxY
        ) {
          isDraggingSelection = true;
          isSnipping = false; // Not a new snip, it's a drag
          selectionDragStartX = lastWorldX;
          selectionDragStartY = lastWorldY;
          // Store original positions of selected elements
          selectedElementIndices.forEach((index) => {
            const item = drawingHistory[index];
            if (item) {
              // Should always exist
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
          // Start new snip
          selectedElementIndices = [];
          selectionBoundingBox = null;
          if (toolbarElements.deleteSelectedBtn)
            toolbarElements.deleteSelectedBtn.style.display = "none";
          redrawFullCanvas(); // Redraw to clear previous selection highlights
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
      calculateSelectionBoundingBox(); // Update bounding box as elements move
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
      redrawFullCanvas(); // Clear previous preview
      // Draw temporary shape preview
      ctx.save();
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.x, -camera.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentLineWidth;
      ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
      ctx.beginPath();
      if (currentShapeMode === "rectangle") {
        ctx.rect(
          shapeStartX,
          shapeStartY,
          worldPos.x - shapeStartX,
          worldPos.y - shapeStartY
        );
      } else if (currentShapeMode === "circle") {
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
      redrawFullCanvas(); // Clear previous snip preview
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
        // For live preview of freedom snip, add current point and draw path
        // This point is temporary for preview, only add to snipPath on mouseup if needed or keep adding here
        if (snipPath.length > 0) {
          ctx.moveTo(snipPath[0].x, snipPath[0].y);
          for (let i = 1; i < snipPath.length; i++) {
            ctx.lineTo(snipPath[i].x, snipPath[i].y);
          }
          ctx.lineTo(worldPos.x, worldPos.y); // Line to current mouse position
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function handleMouseUp(event) {
    if (!isActive) return;
    const worldPos = getMousePos(event); // Get final world position

    if (camera.isPanning) {
      camera.isPanning = false;
      canvasElement.style.cursor = currentTool === "pan" ? "grab" : "crosshair"; // Revert cursor
    }

    if (isDraggingSelection && canDraw) {
      isDraggingSelection = false;
      canvasElement.style.cursor = "crosshair"; // or specific select cursor

      const movedItemsData = selectedElementIndices.map((index) => {
        const item = drawingHistory[index];
        // Ensure we have the latest data after drag
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

      if (movedItemsData.length > 0) {
        socket.emit("wb:moveElements", { roomId, movedItemsData });
      }
      // Clean up temporary original positions
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
      redrawFullCanvas(); // Final redraw
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
      // Optionally, revert to pen tool or keep shape tool active
      // setActiveTool('pen'); // Example: revert to pen
    } else if (
      isSnipping &&
      currentTool === "select" &&
      currentSnipMode &&
      canDraw
    ) {
      isSnipping = false;
      if (currentSnipMode === "rectangular" && snipRect) {
        selectElementsInRect(
          snipRect.startX,
          snipRect.startY,
          worldPos.x, // Use final worldPos
          worldPos.y
        );
      } else if (currentSnipMode === "freedom") {
        snipPath.push({ x: worldPos.x, y: worldPos.y }); // Add final point
        if (snipPath.length > 2) {
          // Close the path for selection logic
          snipPath.push({ x: snipPath[0].x, y: snipPath[0].y });
          selectElementsInPath(snipPath);
        }
        snipPath = []; // Reset for next snip
      }
      snipRect = null;
      redrawFullCanvas(); // Redraw to show selection highlights
      if (toolbarElements.deleteSelectedBtn) {
        toolbarElements.deleteSelectedBtn.style.display =
          selectedElementIndices.length > 0 ? "inline-flex" : "none";
      }
    }
  }

  function handleMouseOut(event) {
    if (isDrawing) {
      isDrawing = false;
      clearTimeout(eventThrottleTimer);
      eventThrottleTimer = null;
    }
    if (isDrawingShape) {
      // If mouse out during shape drawing, finalize with current position or cancel
      // For simplicity, let's finalize. User can undo/delete if needed.
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
      // Similar to shape drawing, finalize snip or clear
      // For now, let's clear/reset the snip if mouse leaves during active snipping
      isSnipping = false;
      snipPath = [];
      snipRect = null;
      redrawFullCanvas(); // Remove preview
    }
    // Do not reset camera.isPanning on mouseout, as user might be holding button and moving outside then back in.
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

    // Adjust camera.x, camera.y to keep the point under the mouse cursor fixed
    camera.x =
      mouseWorldPosBeforeZoom.x -
      (mouseWorldPosBeforeZoom.x - camera.x) * (oldScale / camera.scale);
    camera.y =
      mouseWorldPosBeforeZoom.y -
      (mouseWorldPosBeforeZoom.y - camera.y) * (oldScale / camera.scale);

    redrawFullCanvas();
  }

  // Touch event cache
  let activeTouches = [];
  function cacheTouch(touch) {
    const idx = activeTouches.findIndex(
      (t) => t.identifier === touch.identifier
    );
    const newTouch = {
      identifier: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
    if (idx > -1) activeTouches[idx] = newTouch;
    else activeTouches.push(newTouch);
  }
  function removeCachedTouch(touch) {
    const idx = activeTouches.findIndex(
      (t) => t.identifier === touch.identifier
    );
    if (idx > -1) activeTouches.splice(idx, 1);
  }
  function getPinchDistance() {
    if (activeTouches.length < 2) return 0;
    const t1 = activeTouches[0];
    const t2 = activeTouches[1];
    return Math.sqrt(
      Math.pow(t2.clientX - t1.clientX, 2) +
        Math.pow(t2.clientY - t1.clientY, 2)
    );
  }
  function getPinchCenter() {
    if (activeTouches.length < 2) return null;
    const t1 = activeTouches[0];
    const t2 = activeTouches[1];
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
      const worldPos = getMousePos(touch);
      lastWorldX = worldPos.x;
      lastWorldY = worldPos.y;

      if (currentTool === "pan") {
        camera.isPanning = true;
        camera.lastPanMouseX = touch.clientX;
        camera.lastPanMouseY = touch.clientY;
      } else if (canDraw) {
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
          // Similar logic to mousedown for select/snip with touch
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
          } else {
            selectedElementIndices = [];
            selectionBoundingBox = null;
            if (toolbarElements.deleteSelectedBtn)
              toolbarElements.deleteSelectedBtn.style.display = "none";
            redrawFullCanvas();
          }
        }
      }
    } else if (activeTouches.length >= 2) {
      isDrawing = false; // Stop drawing if multiple touches
      isDrawingShape = false;
      isSnipping = false;
      isDraggingSelection = false;
      camera.isPanning = false; // Prefer pinch zoom over pan with 2 fingers
      camera.isPinching = true;
      camera.lastPinchDistance = getPinchDistance();
    }
  }

  function handleTouchMove(event) {
    if (!isActive) return;
    event.preventDefault();
    const oldTouchCacheForThisMove = [...activeTouches]; // Cache current state for this specific move event
    Array.from(event.changedTouches).forEach(cacheTouch); // Update global activeTouches

    if (activeTouches.length === 0) return;

    const primaryTouch = activeTouches[0]; // Use the first active touch for general coordinates
    const worldPos = getMousePos(primaryTouch);
    updateCoordsDisplay(
      worldPos.x,
      worldPos.y,
      primaryTouch.clientX,
      primaryTouch.clientY
    );

    if (camera.isPinching && activeTouches.length >= 2) {
      const newDist = getPinchDistance();
      if (camera.lastPinchDistance > 0 && newDist > 0) {
        const oldScale = camera.scale;
        camera.scale *= newDist / camera.lastPinchDistance;
        camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, camera.scale));

        const pinchCenterClient = getPinchCenter();
        if (pinchCenterClient) {
          const pinchCenterWorld = getMousePos(pinchCenterClient); // Convert client center to world
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
    } else if (camera.isPanning && activeTouches.length === 1) {
      const dx = primaryTouch.clientX - camera.lastPanMouseX;
      const dy = primaryTouch.clientY - camera.lastPanMouseY;
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      camera.lastPanMouseX = primaryTouch.clientX;
      camera.lastPanMouseY = primaryTouch.clientY;
      redrawFullCanvas();
    } else if (
      isDraggingSelection &&
      selectedElementIndices.length > 0 &&
      canDraw &&
      activeTouches.length === 1
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
      canDraw &&
      activeTouches.length === 1
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
      canDraw &&
      activeTouches.length === 1
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
      canDraw &&
      activeTouches.length === 1
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

  function handleTouchEnd(event) {
    if (!isActive) return;
    // event.preventDefault(); // Not always needed for touchend
    Array.from(event.changedTouches).forEach(removeCachedTouch);

    const finalWorldPos =
      event.changedTouches.length > 0
        ? getMousePos(event.changedTouches[0])
        : { x: lastWorldX, y: lastWorldY };

    if (isDrawing) {
      isDrawing = false;
      clearTimeout(eventThrottleTimer);
      eventThrottleTimer = null;
    }
    if (
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
        finalWorldPos.x,
        finalWorldPos.y,
        currentColor,
        currentLineWidth
      );
    }
    if (isSnipping && currentTool === "select" && currentSnipMode && canDraw) {
      isSnipping = false;
      if (currentSnipMode === "rectangular" && snipRect) {
        selectElementsInRect(
          snipRect.startX,
          snipRect.startY,
          finalWorldPos.x,
          finalWorldPos.y
        );
      } else if (currentSnipMode === "freedom") {
        snipPath.push({ x: finalWorldPos.x, y: finalWorldPos.y });
        if (snipPath.length > 2) {
          snipPath.push({ x: snipPath[0].x, y: snipPath[0].y }); // Close path for selection
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
    if (isDraggingSelection && canDraw) {
      isDraggingSelection = false;
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
      if (movedItemsData.length > 0) {
        socket.emit("wb:moveElements", { roomId, movedItemsData });
      }
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
    }

    if (activeTouches.length < 2) camera.isPinching = false;
    if (activeTouches.length < 1) camera.isPanning = false;

    if (activeTouches.length === 0) {
      hideCoordsDisplay();
      if (!camera.isPanning && currentTool === "pan")
        canvasElement.style.cursor = "grab"; // Reset pan cursor if needed
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
        if (item.shapeType === "rectangle") {
          minX = Math.min(minX, item.startX, item.endX);
          minY = Math.min(minY, item.startY, item.endY);
          maxX = Math.max(maxX, item.startX, item.endX);
          maxY = Math.max(maxY, item.startY, item.endY);
        } else if (item.shapeType === "circle") {
          const radius = Math.sqrt(
            Math.pow(item.endX - item.startX, 2) +
              Math.pow(item.endY - item.startY, 2)
          );
          minX = Math.min(minX, item.startX - radius);
          minY = Math.min(minY, item.startY - radius);
          maxX = Math.max(maxX, item.startX + radius);
          maxY = Math.max(maxY, item.startY + radius);
        } else if (item.shapeType === "line") {
          minX = Math.min(minX, item.startX, item.endX);
          minY = Math.min(minY, item.startY, item.endY);
          maxX = Math.max(maxX, item.startX, item.endX);
          maxY = Math.max(maxY, item.startY, item.endY);
        }
      }
    });

    if (minX !== Infinity) {
      const padding = 5 / camera.scale;
      selectionBoundingBox = {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
      };
    } else {
      selectionBoundingBox = null;
    }
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
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function selectElementsInRect(wStartX, wStartY, wEndX, wEndY) {
    selectedElementIndices = [];
    const rX1 = Math.min(wStartX, wEndX);
    const rY1 = Math.min(wStartY, wEndY);
    const rX2 = Math.max(wStartX, wEndX);
    const rY2 = Math.max(wStartY, wEndY);

    drawingHistory.forEach((item, index) => {
      if (item.type === "draw") {
        // Basic check: if any part of the line segment is within the rect.
        // More precise would be line-rectangle intersection.
        const midX = (item.x0 + item.x1) / 2;
        const midY = (item.y0 + item.y1) / 2;
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
        ) {
          selectedElementIndices.push(index);
        }
      } else if (item.type === "shape") {
        // Check if shape's bounding box intersects with selection rect
        let shapeMinX, shapeMinY, shapeMaxX, shapeMaxY;
        if (item.shapeType === "rectangle" || item.shapeType === "line") {
          shapeMinX = Math.min(item.startX, item.endX);
          shapeMinY = Math.min(item.startY, item.endY);
          shapeMaxX = Math.max(item.startX, item.endX);
          shapeMaxY = Math.max(item.startY, item.endY);
        } else if (item.shapeType === "circle") {
          const radius = Math.sqrt(
            Math.pow(item.endX - item.startX, 2) +
              Math.pow(item.endY - item.startY, 2)
          );
          shapeMinX = item.startX - radius;
          shapeMinY = item.startY - radius;
          shapeMaxX = item.startX + radius;
          shapeMaxY = item.startY + radius;
        }

        if (
          shapeMinX <= rX2 &&
          shapeMaxX >= rX1 &&
          shapeMinY <= rY2 &&
          shapeMaxY >= rY1
        ) {
          selectedElementIndices.push(index); // Bounding box intersection
        }
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

  function updateToolbarForCurrentTool() {
    // ... existing logic to activate/deactivate tool buttons ...

    // Manage visibility of sub-tool containers for streamer
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

  function selectElementsInPath(worldPathPoints) {
    selectedElementIndices = [];
    if (worldPathPoints.length < 3) return;

    drawingHistory.forEach((item, index) => {
      if (item.type === "draw") {
        const p0 = { x: item.x0, y: item.y0 };
        const p1 = { x: item.x1, y: item.y1 };
        const mid = { x: (item.x0 + item.x1) / 2, y: (item.y0 + item.y1) / 2 };
        if (
          isPointInPolygon(p0, worldPathPoints) ||
          isPointInPolygon(p1, worldPathPoints) ||
          isPointInPolygon(mid, worldPathPoints)
        ) {
          selectedElementIndices.push(index);
        }
      } else if (item.type === "shape") {
        // For shapes, check if their center point is within the polygon
        let centerX, centerY;
        if (item.shapeType === "rectangle" || item.shapeType === "line") {
          centerX = (item.startX + item.endX) / 2;
          centerY = (item.startY + item.endY) / 2;
        } else if (item.shapeType === "circle") {
          centerX = item.startX;
          centerY = item.startY;
        }
        if (
          centerX !== undefined &&
          isPointInPolygon({ x: centerX, y: centerY }, worldPathPoints)
        ) {
          selectedElementIndices.push(index);
        }
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

    const indicesToDelete = [...selectedElementIndices].sort((a, b) => b - a); // Sort descending
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
    if (data.drawnBy === username) return; // Don't redraw own actions if server echoes
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
      drawingHistory.push(item); // Add to local history for redraws
      if (drawingHistory.length > 500)
        drawingHistory.splice(0, drawingHistory.length - 500);
    }
  }

  function handleSocketDrawShape(data) {
    if (data.drawnBy === username) return;
    const shapeData = data.shapeData;
    // Add to history and redraw. The redrawFullCanvas will handle drawing shapes.
    drawingHistory.push(shapeData);
    if (drawingHistory.length > 500)
      drawingHistory.splice(0, drawingHistory.length - 500);
    redrawFullCanvas();
  }

  function handleSocketClear() {
    drawingHistory = [{ type: "clear", timestamp: Date.now() }]; // Keep a clear marker if needed, or just empty array
    redrawFullCanvas(); // This will clear the canvas
    if (showNotificationCallback && isStreamer)
      showNotificationCallback("Bảng vẽ đã được xóa bởi người khác.", "info");
  }

  function handleSocketInitState(state) {
    if (state && Array.isArray(state.history)) {
      drawingHistory = state.history.map((item) => ({ ...item })); // Deep copy
      console.log(
        `SharedWhiteboard: State restored from history. Items: ${drawingHistory.length}`
      );
    } else if (state && state.dataUrl) {
      // dataUrl restoration is more complex with pan/zoom as it's a flat image.
      // For now, prioritize history. If only dataUrl, we'd need to draw it as a base image.
      // This example focuses on history-based sync.
      console.warn(
        "SharedWhiteboard: dataUrl in initState not fully implemented with pan/zoom. History preferred."
      );
      drawingHistory = [
        { type: "image", dataUrl: state.dataUrl, timestamp: Date.now() },
      ]; // Simplistic handling
    } else {
      drawingHistory = [];
      console.log("SharedWhiteboard: Received empty/invalid initial state.");
    }
    selectedElementIndices = []; // Clear selection on new state
    selectionBoundingBox = null;
    if (toolbarElements.deleteSelectedBtn)
      toolbarElements.deleteSelectedBtn.style.display = "none";
    redrawFullCanvas();
  }

  function handleSocketMoveElements(data) {
    if (!data || !Array.isArray(data.movedItemsData)) return;
    data.movedItemsData.forEach((movedItem) => {
      if (drawingHistory[movedItem.index]) {
        // Check if the item being moved is by the current user and is currently selected by them.
        // This is to prevent conflicts if multiple users try to move the same thing simultaneously.
        // For simplicity, we'll allow any move for now, assuming server might mediate or last-write-wins.
        Object.assign(drawingHistory[movedItem.index], movedItem.newItemData);
      }
    });
    // If the current user had these items selected, their local selectionBoundingBox also needs update
    if (
      selectedElementIndices.some((idx) =>
        data.movedItemsData.find((m) => m.index === idx)
      )
    ) {
      calculateSelectionBoundingBox();
    }
    redrawFullCanvas();
  }

  function handleSocketDeleteElements(data) {
    if (!data || !Array.isArray(data.indices)) return;
    const indicesToDelete = [...data.indices].sort((a, b) => b - a); // Sort descending
    indicesToDelete.forEach((index) => {
      if (drawingHistory[index]) {
        drawingHistory.splice(index, 1);
      }
    });
    // If any of the deleted items were selected locally, clear that selection
    selectedElementIndices = selectedElementIndices.filter(
      (idx) => !indicesToDelete.includes(idx)
    );
    if (selectedElementIndices.length === 0) {
      selectionBoundingBox = null;
      if (toolbarElements.deleteSelectedBtn)
        toolbarElements.deleteSelectedBtn.style.display = "none";
    } else {
      calculateSelectionBoundingBox();
    }
    redrawFullCanvas();
  }

  // --- Public API & Lifecycle ---
  function resizeCanvas() {
    if (!isActive || !canvasElement.parentElement) return;

    const mainToolbarElement = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.mainToolbar; // Use correct toolbar ref
    const toolbarHeight =
      mainToolbarElement && mainToolbarElement.style.display !== "none"
        ? mainToolbarElement.offsetHeight
        : 0;
    const overlayPadding = 10;

    let viewportWidth =
      canvasElement.parentElement.clientWidth - 2 * overlayPadding;
    let viewportHeight =
      canvasElement.parentElement.clientHeight -
      toolbarHeight -
      2 * overlayPadding -
      (mainToolbarElement && mainToolbarElement.style.display !== "none"
        ? 5
        : 0); /* extra gap for toolbar */

    viewportWidth = Math.max(100, viewportWidth);
    viewportHeight = Math.max(100, viewportHeight);

    if (
      canvasElement.width !== viewportWidth ||
      canvasElement.height !== viewportHeight
    ) {
      canvasElement.width = viewportWidth;
      canvasElement.height = viewportHeight;
    }
    canvasElement.style.width = `${viewportWidth}px`;
    canvasElement.style.height = `${viewportHeight}px`;

    if (mainToolbarElement && mainToolbarElement.style.display !== "none") {
      mainToolbarElement.style.width = `${viewportWidth}px`;
    }
    redrawFullCanvas();
  }

  function show() {
    if (isActive) return;
    isActive = true;
    canvasElement.parentElement.style.opacity = 0;
    canvasElement.parentElement.style.display = "flex";

    // Make the correct toolbar visible
    const mainToolbarElement = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.mainToolbar; // toolbarElements.mainToolbar should be the correct one passed in config
    if (mainToolbarElement) {
      mainToolbarElement.style.display = "flex"; // Or "block" depending on its CSS
    }

    resizeCanvas(); // Set initial size and draw

    if (!prefersReducedMotion) {
      gsap.to(canvasElement.parentElement, {
        duration: 0.5,
        autoAlpha: 1,
        ease: "power2.out",
      });
      // Optionally animate toolbar entrance if desired
      if (mainToolbarElement) {
        gsap.fromTo(
          mainToolbarElement,
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, duration: 0.4, delay: 0.1, ease: "power2.out" }
        );
      }
    } else {
      gsap.set(canvasElement.parentElement, { autoAlpha: 1 });
      if (mainToolbarElement)
        gsap.set(mainToolbarElement, { opacity: 1, y: 0 });
    }
    window.addEventListener("resize", resizeCanvas);
    if (onVisibilityChangeCallback) onVisibilityChangeCallback(true);
    if (socket.connected) socket.emit("wb:requestInitialState", { roomId });
    console.log(
      `SharedWhiteboard shown for ${isStreamer ? "streamer" : "viewer"}`
    );
  }

  function hide() {
    if (!isActive) return;
    const parentOverlay = canvasElement.parentElement;
    const mainToolbarElement = isStreamer
      ? toolbarElements.mainToolbar
      : toolbarElements.mainToolbar;

    const onHideComplete = () => {
      isActive = false;
      parentOverlay.style.display = "none";
      if (mainToolbarElement) {
        mainToolbarElement.style.display = "none";
        // Also hide sub-option containers if they exist and are for streamer
        if (isStreamer) {
          if (toolbarElements.shapeOptionsContainer)
            toolbarElements.shapeOptionsContainer.style.display = "none";
          if (toolbarElements.snipOptionsContainer)
            toolbarElements.snipOptionsContainer.style.display = "none";
          if (toolbarElements.deleteSelectedBtn)
            toolbarElements.deleteSelectedBtn.style.display = "none";
        }
      }
      window.removeEventListener("resize", resizeCanvas);
      if (onVisibilityChangeCallback) onVisibilityChangeCallback(false);
      console.log(
        `SharedWhiteboard hidden for ${isStreamer ? "streamer" : "viewer"}`
      );
    };

    if (!prefersReducedMotion) {
      // Animate toolbar out first or simultaneously
      if (mainToolbarElement) {
        gsap.to(mainToolbarElement, {
          opacity: 0,
          y: -10,
          duration: 0.3,
          ease: "power1.in",
        });
      }
      gsap.to(parentOverlay, {
        duration: 0.4,
        autoAlpha: 0,
        delay: mainToolbarElement ? 0.1 : 0, // Slight delay if toolbar is animating out
        ease: "power1.in",
        onComplete: onHideComplete,
      });
    } else {
      gsap.set(parentOverlay, { autoAlpha: 0 });
      if (mainToolbarElement) gsap.set(mainToolbarElement, { opacity: 0 });
      onHideComplete();
    }
  }

  function setupEventListeners() {
    // Drawing surface listeners
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

    // Toolbar listeners
    if (toolbarElements.colorPicker) {
      toolbarElements.colorPicker.value = currentColor; // Set initial value
      toolbarElements.colorPicker.addEventListener("input", (e) => {
        currentColor = e.target.value;
        if (currentTool === "eraser") setActiveTool("pen"); // Switch from eraser if color changed
      });
    }
    if (toolbarElements.lineWidthRange) {
      toolbarElements.lineWidthRange.value = currentLineWidth; // Set initial value
      if (toolbarElements.lineWidthValueDisplay)
        toolbarElements.lineWidthValueDisplay.textContent = currentLineWidth;
      toolbarElements.lineWidthRange.addEventListener("input", (e) => {
        currentLineWidth = parseInt(e.target.value, 10);
        if (toolbarElements.lineWidthValueDisplay)
          toolbarElements.lineWidthValueDisplay.textContent = currentLineWidth;
      });
    }
    if (toolbarElements.eraserBtn) {
      toolbarElements.eraserBtn.addEventListener("click", () => {
        setActiveTool(currentTool === "eraser" ? "pen" : "eraser");
      });
    }
    if (toolbarElements.clearBtn && isStreamer) {
      // Only streamer can clear globally by default via button
      toolbarElements.clearBtn.addEventListener("click", () => {
        if (confirmActionCallback) {
          confirmActionCallback(
            "Xóa toàn bộ nội dung bảng vẽ? Hành động này không thể hoàn tác.",
            "Xóa",
            "Hủy",
            "fas fa-trash-alt"
          ).then((confirmed) => {
            if (confirmed) {
              drawingHistory = [{ type: "clear", timestamp: Date.now() }]; // Local clear
              redrawFullCanvas();
              socket.emit("wb:clear", { roomId }); // Global clear
            }
          });
        } else if (window.confirm("Xóa toàn bộ nội dung bảng vẽ?")) {
          drawingHistory = [{ type: "clear", timestamp: Date.now() }];
          redrawFullCanvas();
          socket.emit("wb:clear", { roomId });
        }
      });
    }

    // Pan/Zoom tools
    if (toolbarElements.panToolBtn) {
      toolbarElements.panToolBtn.addEventListener("click", () =>
        setActiveTool(currentTool === "pan" ? "pen" : "pan")
      );
    }
    if (toolbarElements.zoomInBtn) {
      toolbarElements.zoomInBtn.addEventListener("click", () => {
        const oldScale = camera.scale;
        camera.scale = Math.min(MAX_SCALE, camera.scale * 1.2);
        const worldCenter = screenToWorld(
          canvasElement.width / 2,
          canvasElement.height / 2
        );
        camera.x = worldCenter.x - canvasElement.width / 2 / camera.scale;
        camera.y = worldCenter.y - canvasElement.height / 2 / camera.scale;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.zoomOutBtn) {
      toolbarElements.zoomOutBtn.addEventListener("click", () => {
        const oldScale = camera.scale;
        camera.scale = Math.max(MIN_SCALE, camera.scale / 1.2);
        const worldCenter = screenToWorld(
          canvasElement.width / 2,
          canvasElement.height / 2
        );
        camera.x = worldCenter.x - canvasElement.width / 2 / camera.scale;
        camera.y = worldCenter.y - canvasElement.height / 2 / camera.scale;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.resetViewBtn) {
      toolbarElements.resetViewBtn.addEventListener("click", () => {
        camera.x = MAX_WORLD_WIDTH / 4;
        camera.y = MAX_WORLD_HEIGHT / 4;
        camera.scale = 0.5;
        redrawFullCanvas();
      });
    }
    if (toolbarElements.toggleGridBtn) {
      toolbarElements.toggleGridBtn.addEventListener("click", () => {
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

    // Shape tools
    if (toolbarElements.shapeToolToggleBtn) {
      toolbarElements.shapeToolToggleBtn.addEventListener("click", () => {
        if (currentTool === "shape") {
          // If shape tool already active, toggle it off (back to pen)
          setActiveTool("pen");
        } else {
          // Activate shape tool (default to rect or last used shape)
          setActiveTool("shape", currentShapeMode || "rectangle");
        }
      });
    }
    const shapeButtonsConfig = [
      { btn: toolbarElements.rectShapeBtn, mode: "rectangle" },
      { btn: toolbarElements.circleShapeBtn, mode: "circle" },
      { btn: toolbarElements.lineShapeBtn, mode: "line" },
    ];
    shapeButtonsConfig.forEach((config) => {
      if (config.btn) {
        config.btn.addEventListener("click", () =>
          setActiveTool("shape", config.mode)
        );
      }
    });

    // Select/Snip tools
    if (toolbarElements.selectToolToggleBtn) {
      toolbarElements.selectToolToggleBtn.addEventListener("click", () => {
        if (currentTool === "select") {
          setActiveTool("pen"); // Toggle off to pen
        } else {
          setActiveTool("select", currentSnipMode || "rectangular"); // Toggle on
        }
      });
    }
    const snipButtonsConfig = [
      { btn: toolbarElements.rectangularSnipBtn, mode: "rectangular" },
      { btn: toolbarElements.freedomSnipBtn, mode: "freedom" },
    ];
    snipButtonsConfig.forEach((config) => {
      if (config.btn) {
        config.btn.addEventListener("click", () => {
          if (currentTool !== "select") setActiveTool("select", config.mode);
          // Ensure select tool is active
          else currentSnipMode = config.mode; // Just change sub-mode

          // Update active state for snip sub-buttons
          if (toolbarElements.rectangularSnipBtn)
            toolbarElements.rectangularSnipBtn.classList.toggle(
              "active",
              currentSnipMode === "rectangular"
            );
          if (toolbarElements.freedomSnipBtn)
            toolbarElements.freedomSnipBtn.classList.toggle(
              "active",
              currentSnipMode === "freedom"
            );
          if (showNotificationCallback)
            showNotificationCallback(
              `Chế độ cắt: ${
                config.mode === "rectangular" ? "Hình chữ nhật" : "Tự do"
              }`,
              "info",
              1500
            );
        });
      }
    });
    if (toolbarElements.deleteSelectedBtn) {
      toolbarElements.deleteSelectedBtn.addEventListener(
        "click",
        deleteSelected
      );
    }

    // Socket listeners for whiteboard events
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
          // If lost permission while a drawing tool was active, switch to a neutral state (e.g., pan or disable drawing)
          if (
            !canDraw &&
            (currentTool === "pen" ||
              currentTool === "eraser" ||
              currentTool === "shape" ||
              currentTool === "select")
          ) {
            // Optionally switch to pan tool or just update cursor and disable drawing inputs
            // setActiveTool('pan'); // Or a new 'view_only' tool state
            canvasElement.style.cursor = "default";
          } else if (canDraw && currentTool !== "pan") {
            // If gained permission and not in pan mode
            canvasElement.style.cursor =
              currentTool === "eraser" ? "cell" : "crosshair";
          }
        }
      });
      socket.on("wb:toggleVisibility", (data) => {
        console.log(
          `SharedWB ${username}: Received wb:toggleVisibility - isVisible: ${data.isVisible}`
        );
        const oldGlobalVisibility = isGloballyVisibleByStreamer;
        isGloballyVisibleByStreamer = data.isVisible;

        if (isStreamer) {
          // Streamer's own client also listens to this to keep its UI in sync if changed by another instance
          if (isGloballyVisibleByStreamer && !isActive) show();
          else if (!isGloballyVisibleByStreamer && isActive) hide();
          // onVisibilityChangeCallback in streamer's config will update button
        } else {
          // Viewer logic
          if (isGloballyVisibleByStreamer) {
            // Streamer turned it ON. Viewer can now choose to see it.
            // The onVisibilityChangeCallback will update the viewer's toggle button state.
            if (onVisibilityChangeCallback)
              onVisibilityChangeCallback(isActive, isGloballyVisibleByStreamer);
          } else {
            // Streamer turned it OFF. Force hide for viewer if it was locally visible.
            if (isActive) {
              hide(); // This will call onVisibilityChangeCallback(false, false)
            } else {
              // If already locally hidden, just update button state via callback
              if (onVisibilityChangeCallback)
                onVisibilityChangeCallback(false, false);
            }
          }
        }
      });
    }
    if (toolbarElements.closeWhiteboardBtn) { // Check if it was passed
        toolbarElements.closeWhiteboardBtn.addEventListener("click", () => {
            if (isStreamer) {
                // Streamer's close button should set global visibility to false
                publicApi.setGlobalVisibility(false);
            } else {
                // Viewer's close button just hides it locally
                hide();
            }
        });
    }
    if (isStreamer) {
      // Streamer specific tool buttons
      if (toolbarElements.shapeToolToggleBtn) {
        toolbarElements.shapeToolToggleBtn.addEventListener("click", () => {
          if (playButtonFeedbackCallback)
            playButtonFeedbackCallback(toolbarElements.shapeToolToggleBtn);
          const isCurrentlyShapeTool =
            toolbarElements.shapeToolToggleBtn.classList.contains("active");
          if (isCurrentlyShapeTool && !currentShapeMode) {
            // If main toggle active but no sub-shape, turn off
            setActiveTool("pen");
          } else if (isCurrentlyShapeTool && currentShapeMode) {
            // If sub-shape active, turn off all shapes
            setActiveTool("pen");
          } else {
            // Activate shape tool, default to rectangle or last used if available
            setActiveTool("shape", currentShapeMode || "rectangle");
          }
          updateToolbarForCurrentTool();
        });
      }

      const shapeButtonsConfig = [
        { btn: toolbarElements.rectShapeBtn, mode: "rectangle" },
        { btn: toolbarElements.circleShapeBtn, mode: "circle" },
        { btn: toolbarElements.lineShapeBtn, mode: "line" },
      ];
      shapeButtonsConfig.forEach((config) => {
        if (config.btn) {
          config.btn.addEventListener("click", () => {
            if (playButtonFeedbackCallback)
              playButtonFeedbackCallback(config.btn);
            setActiveTool("shape", config.mode);
            updateToolbarForCurrentTool();
          });
        }
      });

      if (toolbarElements.selectToolToggleBtn) {
        toolbarElements.selectToolToggleBtn.addEventListener("click", () => {
          if (playButtonFeedbackCallback)
            playButtonFeedbackCallback(toolbarElements.selectToolToggleBtn);
          const isCurrentlySelectTool =
            toolbarElements.selectToolToggleBtn.classList.contains("active");
          if (isCurrentlySelectTool) {
            setActiveTool("pen"); // Toggle off to pen
          } else {
            setActiveTool("select", currentSnipMode || "rectangular"); // Toggle on
          }
          updateToolbarForCurrentTool();
        });
      }
      const snipButtonsConfig = [
        { btn: toolbarElements.rectangularSnipBtn, mode: "rectangular" },
        { btn: toolbarElements.freedomSnipBtn, mode: "freedom" },
      ];
      snipButtonsConfig.forEach((config) => {
        if (config.btn) {
          config.btn.addEventListener("click", () => {
            if (playButtonFeedbackCallback)
              playButtonFeedbackCallback(config.btn);
            setActiveTool("select", config.mode); // This will set currentTool and currentSnipMode
            updateToolbarForCurrentTool(); // This will update active classes for snip buttons
          });
        }
      });
      if (toolbarElements.deleteSelectedBtn) {
        toolbarElements.deleteSelectedBtn.addEventListener("click", () => {
          if (playButtonFeedbackCallback)
            playButtonFeedbackCallback(toolbarElements.deleteSelectedBtn);
          deleteSelected();
        });
      }
    }
  }
  setupEventListeners();

  // Set initial tool (e.g., pen)
  setActiveTool("pen");

  // Return public API
  const publicApi = {
    show,
    hide,
    resize: resizeCanvas,
    isActive: () => isActive,
    isGloballyVisible: () => isGloballyVisible,
    setGlobalVisibility: (visible) => {
      if (!isStreamer) return;
      isGloballyVisibleByStreamer = visible; // Update the module's sense of global state
      socket.emit("wb:toggleGlobalVisibility", {
        roomId,
        isVisible: isGloballyVisibleByStreamer,
      });

      if (isGloballyVisibleByStreamer) {
        if (!isActive) show(); // If streamer turns it on globally, their local view also shows
      } else {
        if (isActive) hide(); // If streamer turns it off globally, their local view also hides
      }
      // The onVisibilityChangeCallback will be called by show/hide to update streamer's button
    },
    setViewerDrawPermission: (viewerUsernameToSet, newPermission) => {
      // For streamer to call
      if (!isStreamer) return;
      socket.emit("wb:toggleViewerDrawPermission", {
        roomId,
        viewerUsername: viewerUsernameToSet,
        canDraw: newPermission,
      });
    },
    forceRequestInitialState: () => {
      // Useful if connection drops and re-establishes
      if (socket.connected) socket.emit("wb:requestInitialState", { roomId });
    },
    getDrawingHistory: () => [...drawingHistory], // For debugging or saving state locally
    loadDrawingHistory: (history) => {
      // For restoring state
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

  if (isStreamer) {
    isGloballyVisible = false; // Streamer starts with WB off unless state says otherwise
    canDraw = true;
    // Streamer can call publicApi.setGlobalVisibility(true) to start.
  } else {
    // Viewer waits for wb:toggleVisibility or wb:initState
    // If it's already supposed to be visible from server state, it will be handled
  }

  if (isStreamer) {
    setActiveTool("pen"); // Default tool for streamer
  } else {
    // For viewer, default tool doesn't matter much until they get draw permission
    // but cursor should be 'default' if no permission.
    canvasElement.style.cursor = initialCanDraw ? "crosshair" : "default";
  }

  return publicApi;
}
