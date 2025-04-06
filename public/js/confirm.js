// --- Giữ nguyên file public/js/confirm.js ---
// Lý do: CSS mới không cung cấp style cho #customConfirm và các thành phần con của nó.
// Logic JS hiện tại vẫn hoạt động nhưng giao diện modal sẽ không khớp theme mới.
// Bạn cần tạo CSS riêng cho modal này để đồng bộ giao diện.

/* --- public/js/confirm.js --- */
function showCustomConfirm(message) {
  return new Promise((resolve) => { // Không cần reject ở đây
    const confirmModal = document.getElementById('customConfirm');
    const confirmMessage = document.getElementById('customConfirmMessage');
    const confirmOk = document.getElementById('customConfirmOk');
    const confirmCancel = document.getElementById('customConfirmCancel');

    // Kiểm tra các element tồn tại
    if (!confirmModal || !confirmMessage || !confirmOk || !confirmCancel) {
        console.error("Custom confirm modal elements not found!");
        // Fallback to native confirm if elements are missing
        resolve(window.confirm(message));
        return;
    }

    // Set the message and display the modal
    confirmMessage.textContent = message;
    confirmModal.classList.add('active'); // Thêm class để hiển thị (cần CSS tương ứng)

    // Biến cờ để đảm bảo resolve chỉ chạy một lần
    let resolved = false;

    // Function xử lý và gỡ bỏ listeners
    function cleanup(result) {
        if (resolved) return; // Chỉ chạy một lần
        resolved = true;
        confirmModal.classList.remove('active');
        confirmOk.removeEventListener('click', onOk);
        confirmCancel.removeEventListener('click', onCancel);
        // Có thể thêm listener cho phím Escape để hủy
        document.removeEventListener('keydown', onEscape);
        resolve(result);
    }

    // Event handlers
    function onOk() {
        cleanup(true);
    }

    function onCancel() {
        cleanup(false);
    }

     // Handle Escape key
    function onEscape(event) {
        if (event.key === 'Escape') {
            cleanup(false);
        }
    }

    // Add one-time event listeners
    confirmOk.addEventListener('click', onOk);
    confirmCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onEscape); // Thêm xử lý phím Escape
  });
}

// Example usage:
// customConfirm("Bạn có chắc muốn xóa ảnh này không?").then(result => {
//   if (result) {
//     // Proceed with deletion
//     console.log("User confirmed.");
//   } else {
//     // Cancel deletion
//     console.log("User cancelled.");
//   }
// });