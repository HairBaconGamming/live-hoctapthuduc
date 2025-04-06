/**
 * Displays an advanced toast alert based on the new CSS structure.
 * @param {string} message - The main alert message.
 * @param {string|null} [title=null] - Optional title for the alert. If null, a default title based on type is used.
 * @param {string} [type='info'] - The alert type: 'info', 'success', 'error', or 'warning'.
 * @param {number} [duration=5000] - Duration in ms. Matches default toast visibility time.
 */
// const socket = io(); // Giữ lại nếu file này cũng cần socket, nếu không thì xóa

function showAlert(message, title = null, type = 'info', duration = 5000) {
  const container = document.getElementById('alert-container');
  if (!container) {
      console.error("Alert container #alert-container not found.");
      return;
  }

  // Mapping alert type to Font Awesome icons (giữ nguyên hoặc cập nhật nếu icon thay đổi)
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-times-circle',
    info: 'fas fa-info-circle',
    warning: 'fas fa-exclamation-triangle'
  };

  // Default titles if none provided
  const defaultTitles = {
    success: 'Thành công!',
    error: 'Lỗi!',
    info: 'Thông báo',
    warning: 'Cảnh báo!'
  };

  const alertEl = document.createElement('div');
  alertEl.classList.add('alert-toast', type);

  // Set CSS variable for progress bar animation duration
  // Chuyển đổi ms sang giây cho CSS animation
  alertEl.style.setProperty('--toast-duration', `${duration / 1000}s`);

  const iconHtml = `<i class="${icons[type] || icons['info']}"></i>`; // Fallback to info icon
  const finalTitle = title || defaultTitles[type];

  // Build inner HTML according to the new CSS structure
  alertEl.innerHTML = `
    <div class="toast-icon-area">
      ${iconHtml}
    </div>
    <div class="toast-content">
      <div class="toast-title">${finalTitle}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Đóng">&times;</button>
  `; // Sử dụng toast-close

  container.appendChild(alertEl);

  // Animation 'toastInRight' được định nghĩa trong CSS và tự động chạy khi element được thêm vào DOM.
  // Không cần thêm class 'show' nữa.

  // --- Event Listeners ---

  // Function để đóng toast
  const closeToast = () => {
    // 1. Add 'exiting' class to trigger fade-out animation
    alertEl.classList.add('exiting');

    // 2. Remove the element after the exit animation finishes
    // Lấy thời gian từ biến CSS --anim-duration-exit hoặc dùng giá trị cố định
    const exitDuration = parseFloat(getComputedStyle(alertEl).getPropertyValue('--anim-duration-exit') || '0.4') * 1000; // Lấy giá trị từ CSS hoặc mặc định 400ms

    alertEl.addEventListener('animationend', (event) => {
        // Đảm bảo chỉ xử lý khi animation 'toastOutRight' kết thúc
        if (event.animationName === 'toastOutRight' && alertEl.parentNode) {
            alertEl.remove();
        }
    }, { once: true }); // Tự động gỡ listener sau khi chạy 1 lần

    // Fallback nếu animationend không được kích hoạt (ví dụ trình duyệt cũ hoặc lỗi)
     setTimeout(() => {
         if (alertEl.parentNode) {
             alertEl.remove();
         }
     }, exitDuration + 50); // Chờ lâu hơn animation một chút
  };


  // Close on click of the close button
  const closeButton = alertEl.querySelector('.toast-close');
    if (closeButton) {
        closeButton.addEventListener('click', closeToast);
    } else {
        console.warn("Close button not found in toast template.");
    }


  // Auto-hide after duration
  const hideTimeout = setTimeout(closeToast, duration);

  // Optional: Pause timer on hover
  alertEl.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
    alertEl.style.animationPlayState = 'paused'; // Pause progress bar animation
     const progressBar = alertEl.querySelector('::after'); // Note: Pseudo-elements cannot be directly targeted like this in JS. Pausing the element itself might be enough.
     // To truly pause the ::after animation, you might need to toggle a class that stops the animation.
     alertEl.classList.add('paused'); // Add a class to potentially stop ::after animation via CSS rule like .alert-toast.paused::after { animation-play-state: paused; }
  });

  alertEl.addEventListener('mouseleave', () => {
    // Resume timer - create a *new* timeout for the *remaining* duration
    // This requires calculating remaining time, which adds complexity.
    // Simpler approach: Just restart the full timeout (user gets more time)
    // hideTimeout = setTimeout(closeToast, duration); // Restart full duration (simple)

    // Or simply restart the animation/timeout
     alertEl.style.animationPlayState = 'running';
     alertEl.classList.remove('paused');
     // Restart timeout (nếu muốn) - Logic tính thời gian còn lại phức tạp hơn
     // For simplicity, we might just let it finish normally after mouseleave or restart full duration
     // Let's stick with restarting the timeout for simplicity here:
     // clearTimeout(hideTimeout); // Clear previous one just in case
     // hideTimeout = setTimeout(closeToast, duration); // Start new full timeout
     // A better UX might involve calculating remaining time, but adds complexity.
     // Let's NOT restart the timeout here to avoid confusing behavior. The progress bar visually shows time left.
  });

}

// --- Function hideAlert không còn cần thiết theo cách cũ ---
// function hideAlert(alertEl) { ... }


// --- HÀM TIỆN ÍCH: wrapCharacters (Giữ nguyên) ---
// Không thay đổi vì nó dành cho achievement notifications
function wrapCharacters(text = '', baseDelay = 0, delayIncrement = 0.03) {
    if (typeof text !== 'string') return '';
    // ... (Existing wrapCharacters logic remains the same) ...
    const tokens = text.split(/(<br\s*\/?>)/gi);
    let delayCounter = 0;
    return tokens.map(token => {
      if (token.match(/<br\s*\/?>/i)) { return token; }
      else {
        return token.split('').map(char => {
          const delay = baseDelay + delayCounter * delayIncrement;
          delayCounter++;
          let displayChar = (char === ' ') ? ' ' : char;
          if (/[0-9]/.test(char)) displayChar = `<span class="char-highlight">${displayChar}</span>`;
          return `<span class="char-anim" style="--char-delay: ${delay.toFixed(3)}s;">${displayChar}</span>`; // Use CSS variable
        }).join('');
      }
    }).join('');
}
// --- ARTISTIC ACHIEVEMENT NOTIFICATION HANDLER ---

// Ensure socket is initialized (likely in your main app script)
// const socket = io();

// Check if GSAP and tsParticles are loaded
const libsLoaded = typeof gsap !== 'undefined' && typeof tsParticles !== 'undefined';
const prefersReducedMotion = libsLoaded ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : true; // Assume reduced if libs missing

if (typeof io !== 'undefined') { // Check if socket.io client is loaded
    const socket = io(); // Connect to the server

    socket.on("newAchievement", (achievement) => {
        console.log("Received achievement:", achievement);

        // Validate data
        if (!achievement || !achievement.icon || !achievement.name || !achievement.description) {
            console.error("Invalid achievement data received:", achievement);
            return;
        }

        // Limit concurrent notifications (optional, keep 1 for focus)
        const existingNotif = document.querySelector('.achievement-masterpiece');
        if (existingNotif) {
             console.log("Dismissing previous achievement notification.");
             gsap.to(existingNotif, { // Quickly fade out old one
                 autoAlpha: 0, scale: 0.9, duration: 0.3,
                 onComplete: () => existingNotif.remove()
             });
             // Wait a moment before showing the new one
             setTimeout(() => showAchievementNotification(achievement), 400);
             return; // Don't show immediately
        }

        showAchievementNotification(achievement);
    });

} else {
    console.warn("Socket.IO client not loaded, achievement notifications disabled.");
}


function showAchievementNotification(achievement) {
    if (!achievement) return;

    // --- Create Notification Element ---
    const notif = document.createElement("div");
    notif.className = "achievement-masterpiece"; // New class name
    notif.setAttribute('aria-live', 'polite'); // Accessibility

    // Unique ID for particle target
    const particleContainerId = `achievement-particles-${Date.now()}`;

    // --- Define Animation Delays ---
    const iconAnimDuration = 0.7;
    const titleBaseDelay = 0.3; // Start title anim sooner
    const titleIncrement = 0.04;
    const descBaseDelay = titleBaseDelay + (achievement.name.length * titleIncrement) + 0.2; // Delay after title finishes
    const descIncrement = 0.02;

    // --- Inner HTML Structure ---
    notif.innerHTML = `
        <div class="notification-background-glow"></div>
        <div id="${particleContainerId}" class="notification-particle-canvas"></div>
        <div class="achievement-content">
            <div class="achievement-icon-wrapper">
                <img src="${achievement.icon}" alt="Thành tích" class="achievement-main-icon">
            </div>
            <div class="achievement-text-content">
                <div class="achievement-announcement">Thành Tích Mở Khóa!</div>
                <h3 class="achievement-main-title" aria-label="${achievement.name}">
                    ${wrapCharacters(achievement.name, titleBaseDelay, titleIncrement)}
                </h3>
                <p class="achievement-main-description">
                    ${wrapCharacters(achievement.description, descBaseDelay, descIncrement)}
                </p>
            </div>
            <button class="achievement-close-btn" aria-label="Đóng">×</button>
        </div>
    `;

    document.body.appendChild(notif);

    // --- GSAP Entrance Animation ---
    const entranceTl = gsap.timeline({
        paused: true, // Don't play immediately
        onComplete: () => {
            // Start auto-hide timer AFTER entrance is complete
            const displayDuration = Math.max(7000, Math.ceil((descBaseDelay + achievement.description.length * descIncrement + 1) * 1000));
            autoHideTimeoutId = setTimeout(() => hideNotification(notif), displayDuration);
        }
    });

    if (!prefersReducedMotion) {
        entranceTl
            .set(notif, { display: 'block' }) // Ensure display is block before animating
            .fromTo(notif,
                { yPercent: 100, autoAlpha: 0, scale: 0.9 }, // Start from bottom, scaled down
                { yPercent: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: 'power3.out' } // Slide up and fade in
            )
            .fromTo('.achievement-icon-wrapper', // Icon entrance
                { scale: 0, rotationZ: -180 },
                { scale: 1, rotationZ: 0, duration: iconAnimDuration, ease: 'back.out(1.7)', delay: 0.1 }, // Delay slightly
                0.2 // Start slightly after container starts moving
            )
            .from('.notification-background-glow', // Glow fades in
                { opacity: 0, scale: 0.8, duration: 1, ease: 'power2.out'},
                0.3 // Start glow fade early
            );
            // Character animations are handled by CSS animation-delay set in wrapCharacters

    } else { // Reduced motion: Simple fade
        entranceTl.fromTo(notif, {autoAlpha: 0}, {autoAlpha: 1, duration: 0.5, display: 'block'});
    }

    // Play the entrance animation
    entranceTl.play();


    // --- Initialize Particles ---
    if (typeof tsParticles !== 'undefined' && !prefersReducedMotion) {
        tsParticles.load(particleContainerId, {
            fpsLimit: 60,
            particles: {
                number: { value: 50, density: { enable: false } }, // Fixed number
                color: { value: ["#FFD700", "#FF6EC4", "#7873F5", "#FFFFFF", "#a0a0c0"] }, // Theme + white/grey
                shape: { type: ["circle", "star"] }, // Mix shapes
                opacity: { value: {min: 0.3, max: 0.8}, random: true, anim: { enable: true, speed: 1, minimumValue: 0.1, sync: false } },
                size: { value: {min: 1, max: 4}, random: true, anim: { enable: true, speed: 4, minimumValue: 0.5, sync: false, destroy: 'min'} }, // Size animates down
                move: {
                    enable: true, speed: {min: 1, max: 3}, // Speed range
                    direction: "top", // Move generally upwards
                    random: true, straight: false,
                    outModes: { default: "destroy", top:"none" }, // Destroy when leaving sides/bottom
                    attract: { enable: false },
                    angle: { value: 90, offset: 45 }, // Spread angle
                    gravity: { enable: true, acceleration: -2 } // Slight upward force initially
                },
                 collisions: { enable: false },
                 links: { enable: false },
                 life: { duration: { value: 3, sync: false }, count: 1 } // Live for 3s max, appear once
            },
            interactivity: { enabled: false },
            detectRetina: true,
            background: { color: "transparent" },
            fullScreen: { enable: false }, // CRITICAL
             // Emit particles from the bottom center upwards
             emitters: {
                 position: { x: 50, y: 100 }, // Bottom center
                 rate: { quantity: 5, delay: 0.05 }, // Rate of emission
                 life: { duration: 0.6, count: 1 }, // Emitter lasts for 0.6s
                 size: { width: 100, height: 0 } // Emit across width
             }
        }).catch(error => console.error("tsParticles notification error:", error));
    }


    // --- Hide Logic ---
    let autoHideTimeoutId;

    const hideNotification = (element) => {
        if (!element) return;
        clearTimeout(autoHideTimeoutId); // Clear timer if closed manually

        if (!prefersReducedMotion) {
            gsap.to(element, {
                duration: 0.5, // Faster hide
                autoAlpha: 0,
                yPercent: 50, // Slide down
                scale: 0.9,
                ease: 'power2.in',
                onComplete: () => {
                    // Clean up particles associated with this specific notification
                    const instanceId = element.querySelector('.notification-particle-canvas')?.id;
                    if (instanceId) {
                         tsParticles.dom().find(c => c.id === instanceId)?.destroy();
                     }
                    element.remove();
                 }
            });
        } else {
             element.remove(); // Remove instantly
        }
    };

    // Close button listener
    const closeBtn = notif.querySelector('.achievement-close-btn');
    closeBtn?.addEventListener('click', () => hideNotification(notif));

    // Optional: Close on click anywhere on notification
    // notif.addEventListener('click', () => hideNotification(notif));

} // End showAchievementNotification

// --- Loading Link Script ---
document.querySelectorAll(".loading-link").forEach(anchor => {
    anchor.addEventListener("click", function(e) {
        const overlay = document.getElementById("loading-overlay");
        if (this.target !== "_blank" && !this.href.endsWith('#') && !this.href.startsWith('javascript:') && overlay && !overlay.classList.contains('active')) {
             if (this.href !== window.location.href + '#' && this.href !== window.location.href) {
                  overlay.classList.add("active");
             }
        }
    });
});