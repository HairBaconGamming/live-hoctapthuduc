// public/js/alerts.js

(function() {
    'use strict';

    let alertContainer = null;
    const MAX_ALERTS = 5; // Maximum number of alerts to show at once
    const ALERT_GAP = 10; // Gap between alerts in pixels, should match CSS if set there

    function createAlertContainer() {
        if (document.getElementById('alertContainerGlobal')) {
            alertContainer = document.getElementById('alertContainerGlobal');
            return;
        }
        
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainerGlobal';
        
        // Apply styles that are crucial for functionality if not covered by CSS.
        // Ideally, most of this should be in a CSS file.
        alertContainer.style.position = 'fixed';
        alertContainer.style.top = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '10050'; // Higher than artistic confirm modal (10010) and streamer whiteboard (1005)
        alertContainer.style.display = 'flex';
        alertContainer.style.flexDirection = 'column';
        alertContainer.style.gap = `${ALERT_GAP}px`;
        alertContainer.style.width = 'auto'; // Fit content
        alertContainer.style.maxWidth = '380px'; // Consistent with --notification-width
        alertContainer.style.pointerEvents = 'none'; // Container itself should not block interactions

        document.body.appendChild(alertContainer);
    }

    function getIconClass(type) {
        switch (type) {
            case 'success': return 'fas fa-check-circle';
            case 'error': return 'fas fa-times-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info':
            default: return 'fas fa-info-circle';
        }
    }

    /**
     * Displays a custom alert message.
     * @param {string} message - The message to display.
     * @param {string} [type='info'] - Type of alert ('info', 'success', 'warning', 'error').
     * @param {number} [duration=5000] - Duration in ms to show the alert. 0 or negative for sticky.
     */
    window.showAlert = function(message, type = 'info', duration = 5000) {
        if (!alertContainer) {
            createAlertContainer();
        }

        // Limit the number of alerts
        if (alertContainer.children.length >= MAX_ALERTS) {
            const oldestAlert = alertContainer.firstChild;
            if (oldestAlert) {
                removeAlert(oldestAlert, true); // Remove immediately to make space
            }
        }

        const alertElement = document.createElement('div');
        alertElement.className = `custom-alert alert-${type}`;
        alertElement.setAttribute('role', 'alert');
        
        // Basic inline styles for structure and fallback theming.
        // CSS (e.g., in styles.css or a dedicated alerts.css) should override and complete this.
        alertElement.style.display = 'flex';
        alertElement.style.alignItems = 'flex-start'; // Align items to the top for multi-line messages
        alertElement.style.padding = '12px 15px';
        alertElement.style.borderRadius = 'var(--border-radius-medium, 10px)';
        alertElement.style.boxShadow = 'var(--shadow-medium, 0 6px 18px rgba(0, 0, 0, 0.1))';
        alertElement.style.opacity = '0'; 
        alertElement.style.transform = 'translateX(110%)'; // Start further off-screen
        alertElement.style.pointerEvents = 'auto'; // Individual alerts are interactive
        alertElement.style.minWidth = '300px';
        alertElement.style.margin = '0'; // Reset margin

        // Type-specific background/color hints using CSS variables from styles.css where possible
        // Fallbacks are provided if CSS variables are not defined.
        switch (type) {
            case 'success':
                alertElement.style.backgroundColor = 'var(--bg-success-light, #e8f5e9)';
                alertElement.style.color = 'var(--success-color-dark, #1e4620)'; // Darker green for text
                alertElement.style.borderLeft = '5px solid var(--success-color, #4CAF50)';
                break;
            case 'error':
                alertElement.style.backgroundColor = 'var(--bg-danger-light, #ffebee)';
                alertElement.style.color = 'var(--danger-color-dark, #c62828)'; // Darker red for text
                alertElement.style.borderLeft = '5px solid var(--danger-color, #F44336)';
                break;
            case 'warning':
                alertElement.style.backgroundColor = 'var(--bg-warning-light, #fff3e0)'; // Using orange theme
                alertElement.style.color = 'var(--warning-color-dark, #e65100)'; // Darker orange for text
                alertElement.style.borderLeft = '5px solid var(--warning-color, #ff9800)';
                break;
            case 'info':
            default:
                alertElement.style.backgroundColor = 'var(--bg-info-light, #e3f2fd)'; // Using blue theme
                alertElement.style.color = 'var(--info-color-dark, #0d47a1)'; // Darker blue for text
                alertElement.style.borderLeft = '5px solid var(--info-color, #2196F3)';
                break;
        }

        const iconElement = document.createElement('i');
        iconElement.className = `${getIconClass(type)} alert-icon`;
        iconElement.style.marginRight = '12px';
        iconElement.style.fontSize = '1.3em';
        iconElement.style.lineHeight = '1.5'; // Align icon better with first line of text
        iconElement.style.marginTop = '2px'; // Small top margin for better vertical alignment

        const textContainer = document.createElement('div');
        textContainer.style.flexGrow = '1';
        textContainer.style.lineHeight = '1.5'; // For message text readability
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'alert-text';
        messageSpan.textContent = message;
        textContainer.appendChild(messageSpan);

        const closeButton = document.createElement('button');
        closeButton.className = 'alert-close-btn';
        closeButton.innerHTML = '×';
        closeButton.setAttribute('aria-label', 'Close alert');
        closeButton.style.background = 'none';
        closeButton.style.border = 'none';
        closeButton.style.color = 'inherit';
        closeButton.style.opacity = '0.6';
        closeButton.style.marginLeft = '15px';
        closeButton.style.fontSize = '1.6em';
        closeButton.style.fontWeight = 'bold';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.style.lineHeight = '1'; // Ensure X is centered

        closeButton.onmouseover = () => closeButton.style.opacity = '1';
        closeButton.onmouseout = () => closeButton.style.opacity = '0.6';
        closeButton.onclick = (e) => {
            e.stopPropagation(); // Prevent any other click listeners on the alert itself
            removeAlert(alertElement);
        };

        alertElement.appendChild(iconElement);
        alertElement.appendChild(textContainer);
        alertElement.appendChild(closeButton);

        alertContainer.appendChild(alertElement);

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Entrance animation
        if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
            gsap.to(alertElement, { 
                duration: 0.5, 
                opacity: 1, 
                x: 0, 
                ease: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)' // EaseOutExpo
            });
        } else {
            alertElement.style.opacity = '1';
            alertElement.style.transform = 'translateX(0)';
        }

        if (duration > 0) {
            alertElement._dismissTimer = setTimeout(() => {
                removeAlert(alertElement);
            }, duration);
        }
        
        // Add hover listener to pause auto-dismiss
        alertElement.addEventListener('mouseenter', () => {
            if (alertElement._dismissTimer) {
                clearTimeout(alertElement._dismissTimer);
            }
        });

        alertElement.addEventListener('mouseleave', () => {
            if (duration > 0 && !alertElement.dataset.closing) { // Only restart if not already closing
                 alertElement._dismissTimer = setTimeout(() => {
                    removeAlert(alertElement);
                }, duration / 2); // Shorter duration after mouseleave if it was paused
            }
        });
    };

    function removeAlert(alertElement, immediate = false) {
        if (!alertElement || !alertElement.parentNode || alertElement.dataset.closing) return;
        
        alertElement.dataset.closing = 'true'; // Mark as closing to prevent re-triggering mouseleave timeout
        if (alertElement._dismissTimer) {
            clearTimeout(alertElement._dismissTimer);
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (typeof gsap !== 'undefined' && !prefersReducedMotion && !immediate) {
            gsap.to(alertElement, { 
                duration: 0.4, 
                opacity: 0, 
                x: '110%', // Slide out further
                height: 0, // Animate height to 0
                paddingTop: 0,
                paddingBottom: 0,
                marginTop: 0, 
                marginBottom: `-${ALERT_GAP}px`, // Compensate for gap if element above this one
                ease: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)', // EaseInExpo
                onComplete: () => {
                    alertElement.remove();
                    // If container is empty and not needed, it could be removed here, but it's generally fine to keep it.
                }
            });
        } else {
            alertElement.remove();
        }
    }
    
    // Ensure container is ready on DOM load if showAlert hasn't been called yet
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createAlertContainer);
    } else {
        createAlertContainer(); // DOM already loaded
    }

})();

/*
CSS suggestions for public/styles.css or a dedicated alerts.css:

*/