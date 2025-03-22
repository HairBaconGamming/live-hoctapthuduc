// server.js
const express = require('express');
const axios = require('axios');
const app = express();

// Middleware: Giả sử có middleware isLoggedIn để kiểm tra người dùng đã đăng nhập
function isLoggedIn(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: "Bạn cần đăng nhập để thực hiện chức năng này." });
}

// Route tạo link livestream
app.post('/livestream/createLink', isLoggedIn, async (req, res) => {
  try {
    // Lấy thông tin của user chủ phòng (owner)
    const ownerId = req.user._id; // hoặc req.user.username nếu API cần tên
    // Các tham số khác có thể được truyền lên từ client (ví dụ: title, mô tả)
    const { title } = req.body;
    
    // Gọi API bên ngoài để tạo phòng livestream
    const apiResponse = await axios.post('https://livestream.example.com/api/createRoom', {
      ownerId, // thông tin chủ phòng
      title: title || `Live Stream của ${req.user.username}`
    });
    
    // Giả sử API trả về { success: true, link: "https://livestream.example.com/room/abc123", ... }
    if (apiResponse.data.success) {
      const livestreamLink = apiResponse.data.link;
      // Nếu cần, bạn có thể lưu thông tin phòng vào database
      return res.json({ success: true, link: livestreamLink });
    } else {
      return res.status(400).json({ success: false, error: apiResponse.data.error || "Lỗi tạo phòng livestream" });
    }
  } catch (error) {
    console.error("Error creating livestream room:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Khởi chạy server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server đang chạy trên cổng ${port}`);
});
