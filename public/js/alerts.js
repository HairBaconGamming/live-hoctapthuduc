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
        
        // Crucial inline styles for positioning and behavior.
        // Theme-related styles (colors, fonts, specific border-radius) should come from CSS.
        alertContainer.style.position = 'fixed';
        alertContainer.style.top = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '10050'; // High z-index
        alertContainer.style.display = 'flex';
        alertContainer.style.flexDirection = 'column';
        alertContainer.style.gap = `${ALERT_GAP}px`;
        alertContainer.style.width = 'auto'; // Fit content
        alertContainer.style.maxWidth = 'var(--notification-width, 380px)'; // Use CSS var if available
        alertContainer.style.pointerEvents = 'none'; // Container itself doesn't block

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

        if (alertContainer.children.length >= MAX_ALERTS) {
            const oldestAlert = alertContainer.firstChild;
            if (oldestAlert) {
                removeAlert(oldestAlert, true); // Remove immediately
            }
        }

        const alertElement = document.createElement('div');
        // The class `custom-alert` is for general styling, `alert-${type}` for type-specific.
        alertElement.className = `custom-alert alert-${type}`;
        alertElement.setAttribute('role', 'alert');
        
        // Basic structural inline styles, appearance should be from CSS.
        alertElement.style.display = 'flex';
        alertElement.style.alignItems = 'flex-start';
        alertElement.style.opacity = '0'; // For GSAP animation
        alertElement.style.transform = 'translateX(110%)'; // For GSAP animation
        alertElement.style.pointerEvents = 'auto'; // Individual alerts are interactive
        // min-width, padding, borderRadius, boxShadow should come from CSS .custom-alert

        // Type-specific styling is primarily handled by CSS classes (.alert-info, .alert-success etc.)
        // The inline styles in the original for background/color were fallbacks, CSS is preferred.

        const iconElement = document.createElement('i');
        iconElement.className = `${getIconClass(type)} alert-icon`;
        // Icon styling (margin, font-size) should come from CSS .alert-icon

        const textContainer = document.createElement('div');
        textContainer.className = 'alert-text-container'; // Added for better structure if needed
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'alert-text';
        messageSpan.textContent = message;
        textContainer.appendChild(messageSpan);

        const closeButton = document.createElement('button');
        closeButton.className = 'alert-close-btn';
        closeButton.innerHTML = '×'; // Use HTML entity for '×'
        closeButton.setAttribute('aria-label', 'Close alert');
        // Styling for close button (background, border, color, opacity etc.) should be in CSS

        closeButton.onclick = (e) => {
            e.stopPropagation();
            removeAlert(alertElement);
        };

        alertElement.appendChild(iconElement);
        alertElement.appendChild(textContainer);
        alertElement.appendChild(closeButton);

        alertContainer.appendChild(alertElement);

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        
        alertElement.addEventListener('mouseenter', () => {
            if (alertElement._dismissTimer) {
                clearTimeout(alertElement._dismissTimer);
            }
        });

        alertElement.addEventListener('mouseleave', () => {
            if (duration > 0 && !alertElement.dataset.closing) {
                 alertElement._dismissTimer = setTimeout(() => {
                    removeAlert(alertElement);
                }, duration / 2); 
            }
        });
    };

    function removeAlert(alertElement, immediate = false) {
        if (!alertElement || !alertElement.parentNode || alertElement.dataset.closing) return;
        
        alertElement.dataset.closing = 'true';
        if (alertElement._dismissTimer) {
            clearTimeout(alertElement._dismissTimer);
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (typeof gsap !== 'undefined' && !prefersReducedMotion && !immediate) {
            gsap.to(alertElement, { 
                duration: 0.4, 
                opacity: 0, 
                x: '110%', 
                height: 0, // Animate height
                paddingTop: 0, // Animate padding
                paddingBottom: 0,
                marginTop: 0, // Animate margin
                marginBottom: `-${ALERT_GAP}px`, // Compensate for gap removal
                ease: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)', // EaseInExpo
                onComplete: () => {
                    alertElement.remove();
                }
            });
        } else {
            alertElement.remove();
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createAlertContainer);
    } else {
        createAlertContainer();
    }

})();

/*
CSS suggestions (to be placed in public/styles.css or a dedicated alerts.css):

#alertContainerGlobal {
    // Positioned by JS, but ensure it's above other content
    // z-index: 10050;
    // gap: 10px; // Handled by JS
    // max-width: var(--notification-width, 380px); // Handled by JS
}

.custom-alert {
    display: flex;
    align-items: flex-start;
    padding: 12px 15px;
    border-radius: var(--border-radius-medium, 10px);
    box-shadow: var(--shadow-medium, 0 6px 18px rgba(0,0,0,0.1));
    min-width: 300px;
    line-height: 1.5;
    color: var(--text-dark); // Default text color if not overridden by type
    font-family: var(--font-main, sans-serif);
    font-size: 0.9rem;
    // GSAP handles opacity & transform
}

.custom-alert .alert-icon {
    margin-right: 12px;
    font-size: 1.3em; 
    line-height: inherit; 
    margin-top: 2px; 
}

.custom-alert .alert-text-container {
    flex-grow: 1;
}

.custom-alert .alert-close-btn {
    background: none;
    border: none;
    color: inherit; 
    opacity: 0.6;
    margin-left: 15px;
    font-size: 1.6em;
    font-weight: bold;
    cursor: pointer;
    padding: 0 5px;
    line-height: 1; 
    transition: opacity 0.2s ease;
}
.custom-alert .alert-close-btn:hover {
    opacity: 1;
}

.alert-info {
    background-color: var(--bg-info-light, #e3f2fd);
    color: var(--info-color-dark, #0d47a1);
    border-left: 5px solid var(--info-color, #2196F3);
}
.alert-info .alert-icon { color: var(--info-color, #2196F3); }

.alert-success {
    background-color: var(--bg-success-light, #e8f5e9);
    color: var(--success-color-dark, #1e4620);
    border-left: 5px solid var(--success-color, #4CAF50);
}
.alert-success .alert-icon { color: var(--success-color, #4CAF50); }

.alert-warning {
    background-color: var(--bg-warning-light, #fff3e0);
    color: var(--warning-color-dark, #e65100);
    border-left: 5px solid var(--warning-color, #ff9800);
}
.alert-warning .alert-icon { color: var(--warning-color, #ff9800); }

.alert-error {
    background-color: var(--bg-danger-light, #ffebee);
    color: var(--danger-color-dark, #c62828);
    border-left: 5px solid var(--danger-color, #F44336);
}
.alert-error .alert-icon { color: var(--danger-color, #F44336); }
*/