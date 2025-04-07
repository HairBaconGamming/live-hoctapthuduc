// public/js/confirm.js - Artistic Confirmation Modal

/**
 * Displays an artistic, animated confirmation modal using GSAP.
 * Requires GSAP library to be loaded.
 * @param {string} message - The question/message to display.
 * @param {string} [confirmText='Xác nhận'] - Text for the confirmation button.
 * @param {string} [cancelText='Hủy bỏ'] - Text for the cancellation button.
 * @param {string} [iconClass='fas fa-question-circle'] - Font Awesome class for the icon.
 * @returns {Promise<boolean>} - A promise that resolves with true if confirmed, false if canceled/closed.
 */
function showArtisticConfirm(
    message,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy bỏ',
    iconClass = 'fas fa-question-circle' // Default icon
) {
    return new Promise((resolve) => {
        // --- Prevent duplicate modals ---
        if (document.getElementById('artisticConfirmModal')) {
            console.warn("Artistic confirm modal is already open.");
            resolve(false); // Resolve immediately as false if already open
            return;
        }

        // --- Check for GSAP ---
        if (typeof gsap === 'undefined') {
             console.error("GSAP not loaded! Cannot show artistic confirm modal.");
             // Fallback to basic window.confirm
             resolve(window.confirm(message));
             return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // --- Create Modal Structure ---
        const modal = document.createElement('div');
        modal.id = 'artisticConfirmModal';
        modal.className = 'artistic-confirm-modal';
        modal.setAttribute('role', 'alertdialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'artisticConfirmMessage');
        // Add data attribute to indicate it's open, useful for global checks
        modal.dataset.modalOpen = 'true';

        modal.innerHTML = `
            <div class="artistic-confirm-backdrop"></div>
            <div class="artistic-confirm-box" aria-describedby="artisticConfirmMessage">
                <div class="confirm-box-glow"></div>
                <div class="confirm-box-content">
                    <div class="confirm-icon-wrapper">
                         <i class="${iconClass} confirm-icon"></i>
                         <div class="icon-bg-pulse"></div>
                    </div>
                    <p id="artisticConfirmMessage" class="confirm-message">${message}</p>
                    <div class="confirm-action-buttons">
                        <button class="artistic-confirm-btn btn-cancel" data-modal-focus> 
                             <span class="btn-text">${cancelText}</span>
                             <span class="btn-border-anim"></span>
                        </button>
                        <button class="artistic-confirm-btn btn-confirm" data-modal-focus>
                            <span class="btn-text">${confirmText}</span>
                             <span class="btn-liquid-effect confirm-liquid"></span>
                        </button>
                    </div>
                </div>
                 <button class="modal-close-button" aria-label="Đóng" data-modal-focus>×</button>
            </div>
        `;

        document.body.appendChild(modal);
        // Prevent background scroll immediately
        document.body.style.overflow = 'hidden';

        // --- Get References ---
        const backdrop = modal.querySelector('.artistic-confirm-backdrop');
        const box = modal.querySelector('.artistic-confirm-box');
        const content = modal.querySelector('.confirm-box-content');
        const confirmBtn = modal.querySelector('.btn-confirm');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const closeBtn = modal.querySelector('.modal-close-button');
        const focusableElements = Array.from(modal.querySelectorAll('[data-modal-focus]')); // Select focusable elements
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        let isClosing = false; // Flag to prevent double cleanup

        // --- Cleanup Function ---
        const cleanup = (result) => {
             if (isClosing || !modal) return; // Prevent multiple calls
             isClosing = true;
             modal.dataset.modalOpen = 'false'; // Update state attribute

             // Remove focus trap listener
             modal.removeEventListener('keydown', handleFocusTrap);

             if (!prefersReducedMotion) {
                gsap.timeline({ onComplete: removeElement })
                    .to(box, { duration: 0.3, scale: 0.9, y: 30, rotationX: 10, autoAlpha: 0, ease: 'power1.in' })
                    .to(backdrop, { duration: 0.4, autoAlpha: 0, ease: 'none' }, 0);
             } else {
                 removeElement();
             }
             resolve(result);
        };

         const removeElement = () => {
            modal?.remove(); // Use optional chaining just in case
            // Only restore scroll if NO OTHER modals are open (check by class or specific ID pattern)
             if (!document.querySelector('[data-modal-open="true"]')) { // Check if any modal is still marked as open
                 document.body.style.overflow = '';
             }
             console.log("Artistic Confirm Modal closed.");
        };


        // --- Event Listeners ---
        confirmBtn.onclick = () => { console.log("Confirm clicked"); cleanup(true); };
        cancelBtn.onclick = () => { console.log("Cancel clicked"); cleanup(false); };
        closeBtn.onclick = () => { console.log("Close button clicked"); cleanup(false); };
        backdrop.onclick = () => { console.log("Backdrop clicked"); cleanup(false); };

        // --- Focus Trapping ---
        const handleFocusTrap = (e) => {
            if (e.key === 'Escape') {
                cleanup(false);
                return;
            }
            if (e.key === 'Tab') {
                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else { // Tab
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        };
        modal.addEventListener('keydown', handleFocusTrap);


        // --- Entrance Animation ---
        if (!prefersReducedMotion) {
            // Use a timeline to ensure proper execution order
            const openTl = gsap.timeline({
                 onStart: () => console.log("Entrance timeline START"),
                 onComplete: () => console.log("Entrance timeline COMPLETE. Modal alpha:", gsap.getProperty(modal, "autoAlpha"))
            });

            // 1. Set display: flex - crucial to happen BEFORE animating alpha/transform
            openTl.set(modal, { display: 'flex', autoAlpha: 1 }); // Ensure alpha starts at 0 FOR THE ANIMATION
            console.log("Set display:flex");

            // 2. Animate backdrop
            openTl.to(backdrop, { duration: 0.5, autoAlpha: 1, ease: 'none' });
             console.log("Animating backdrop...");

            // 3. Animate box entrance
            openTl.fromTo(box,
                 { scale: 0.7, y: 60, autoAlpha: 0, rotationX: -30 },
                 { duration: 0.7, scale: 1, y: 0, autoAlpha: 1, rotationX: 0, ease: 'back.out(1.5)' },
                 "-=0.3" // Overlap slightly
             );
             console.log("Animating box...");

            // 4. Stagger content inside box
             if (content && content.children.length > 0) {
                 openTl.from(content.children, {
                     duration: 0.5, autoAlpha: 0, y: 15, stagger: 0.08, ease: 'power2.out'
                 }, "-=0.4"); // Overlap box animation
                 console.log("Animating content stagger...");
             } else {
                  console.warn("Modal content children not found for stagger animation.");
             }


        } else { // Reduced motion
             console.log("Setting instant visibility (reduced motion).");
             gsap.set(modal, { display: 'flex', autoAlpha: 1 });
             gsap.set(box, { scale: 1, y: 0, autoAlpha: 1, rotationX: 0 });
             if (content) gsap.set(content.children, {autoAlpha: 1, y: 0});
        }

        // Focus the preferred button (usually confirm) after a short delay for animation
        setTimeout(() => {
            confirmBtn.focus();
        }, prefersReducedMotion ? 50 : 600); // Shorter delay if no animation

    }); // End Promise
} // End showArtisticConfirm

// --- Example Usage (You would call this from your other JS files) ---
/*
async function handleDeleteAction() {
    const confirmed = await showArtisticConfirm(
        "Bạn có chắc chắn muốn xóa mục này vĩnh viễn?", // Message
        "Xóa Ngay",      // Confirm Text
        "Để Sau",        // Cancel Text
        "fas fa-exclamation-triangle" // Icon (optional, default is question mark)
    );

    if (confirmed) {
        console.log("User confirmed deletion!");
        // Proceed with deletion logic...
    } else {
        console.log("User cancelled deletion.");
    }
}
*/