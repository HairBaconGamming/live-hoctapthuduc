// File: public/js/confirm.js
// No changes needed from the original provided, it's a self-contained module.
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
        modal.dataset.modalOpen = 'true'; // Mark as open for global checks

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
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        const backdrop = modal.querySelector('.artistic-confirm-backdrop');
        const box = modal.querySelector('.artistic-confirm-box');
        const content = modal.querySelector('.confirm-box-content');
        const confirmBtn = modal.querySelector('.btn-confirm');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const closeBtn = modal.querySelector('.modal-close-button');
        const focusableElements = Array.from(modal.querySelectorAll('[data-modal-focus]'));
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        let isClosing = false;

        const removeElement = () => {
            modal?.remove();
            if (!document.querySelector('[data-modal-open="true"]')) {
                document.body.style.overflow = '';
            }
            console.log("Artistic Confirm Modal closed and removed.");
        };
        
        const cleanup = (result) => {
             if (isClosing || !modal) return;
             isClosing = true;
             modal.dataset.modalOpen = 'false';
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

        confirmBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
        closeBtn.onclick = () => cleanup(false);
        backdrop.onclick = () => cleanup(false);

        const handleFocusTrap = (e) => {
            if (e.key === 'Escape') {
                cleanup(false);
                return;
            }
            if (e.key === 'Tab') {
                if (e.shiftKey) { /* Shift + Tab */
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else { /* Tab */
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        };
        modal.addEventListener('keydown', handleFocusTrap);

        if (!prefersReducedMotion) {
            const openTl = gsap.timeline();
            openTl.set(modal, { display: 'flex', autoAlpha: 0 }); // Start with alpha 0 for GSAP
            openTl.to(modal, { duration: 0.01, autoAlpha: 1 }); // Make it visible for backdrop anim
            openTl.to(backdrop, { duration: 0.5, autoAlpha: 1, ease: 'none' });
            openTl.fromTo(box,
                 { scale: 0.7, y: 60, autoAlpha: 0, rotationX: -30 },
                 { duration: 0.7, scale: 1, y: 0, autoAlpha: 1, rotationX: 0, ease: 'back.out(1.5)' },
                 "-=0.3"
             );
             if (content && content.children.length > 0) {
                 openTl.from(content.children, {
                     duration: 0.5, autoAlpha: 0, y: 15, stagger: 0.08, ease: 'power2.out'
                 }, "-=0.4");
             }
        } else {
             gsap.set(modal, { display: 'flex', autoAlpha: 1 });
             gsap.set(box, { scale: 1, y: 0, autoAlpha: 1, rotationX: 0 });
             if (content) gsap.set(content.children, {autoAlpha: 1, y: 0});
        }

        setTimeout(() => {
             if (confirmBtn && typeof confirmBtn.focus === 'function') confirmBtn.focus();
        }, prefersReducedMotion ? 50 : 550); // Slightly shorter delay if no animation for focus

    });
}