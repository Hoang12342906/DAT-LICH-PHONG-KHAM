// server.js
require('dotenv').config(); 
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const staffRoutes = require('./routes/staff');
const profileRoutes = require('./routes/profile');
const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY
// Middleware kiểm tra token JWT

const corsOptions = {
  origin: 'http://localhost:3000',  // Chỉ cho phép frontend từ localhost:3000
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],      // Các phương thức được phép
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true, // Headers cho phép
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json()); // Handles JSON payloads.
app.use(bodyParser.urlencoded({ extended: true })); // 
// Sử dụng route auth.js
app.use('/api', authRoutes);
const authenticateToken = (req, res, next) => {
  const token = req.query.token; // Lấy token từ query parameter 'token'
  console.log("Ơ",token)
  if (!token) return res.status(401).send('Không có token');

  // Xác thực token
  jwt.verify(token,secretKey, (err, user) => {
    console.log("user",user)
    req.user = user;
    next();
  });
};

// Route cho admin (đã bảo vệ bằng token JWT)
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/patient',authenticateToken, patientRoutes);
app.use('/api/doctor', authenticateToken, doctorRoutes);
app.use('/api/staff', authenticateToken, staffRoutes);
app.use('/api/user', authenticateToken, profileRoutes);

// Khởi động server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
