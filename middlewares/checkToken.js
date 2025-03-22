// file middlewares/checkToken.js
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET; // Hoặc 1 secret chung

function checkHoctapAuth(req, res, next) {
  // Lấy token từ query hoặc header
  const token = req.query.token || req.headers["x-hoctap-token"];
  if (!token) {
    return res.status(401).send("Unauthorized: no token provided");
  }
  try {
    // Verify
    const payload = jwt.verify(token, SECRET_KEY);
    // Lưu thông tin user
    req.user = payload; 
    next();
  } catch (err) {
    return res.status(401).send("Unauthorized: invalid token");
  }
}

module.exports = { checkHoctapAuth };
