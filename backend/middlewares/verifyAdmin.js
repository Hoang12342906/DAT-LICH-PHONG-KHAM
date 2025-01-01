const jwt = require('jsonwebtoken');


const verifyAdmin = (req, res, next) => {
  const token = req.query.token;  // Lấy token từ query parameters
  
  if (!token) {
    return res.status(401).json({ message: 'Không có token, không được phép truy cập' });
  }

  try {
    // Sử dụng secret key từ môi trường
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your_very_secret_key');
    
    // Kiểm tra vai trò admin
    if (decoded.idVaiTro !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Lỗi xác thực:', error);
    return res.status(401).json({ message: 'Token không hợp lệ', error: error.message });
  }
};

module.exports = verifyAdmin;
