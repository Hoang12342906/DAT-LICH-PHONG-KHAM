const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const { OAuth2Client } = require('google-auth-library'); // Thêm thư viện google-auth-library
const router = express.Router();
const db = require('../config/db');
require('dotenv').config(); 
const secretKey = process.env.JWT_SECRET_KEY
// Khởi tạo client OAuth2 từ Google
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // clientId của bạn

// Hàm đăng ký
router.post('/register', async (req, res) => {
  const { hoTen, tenTaiKhoan, matKhau, email, gioiTinh, ngaySinh, idVaiTro, diaChi, SDT, hinhAnh } = req.body;
  
  console.log(req.body);  // Xem dữ liệu nhận được từ frontend
  
  db.query('SELECT * FROM NguoiDung WHERE tenTaiKhoan = ?', [tenTaiKhoan], async (err, results) => {
    if (err) {
      console.error(err);  // In lỗi ra console
      return res.status(500).json({ message: 'Lỗi hệ thống' });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: 'Tên tài khoản đã tồn tại' });
    }

    const hashedPassword = await bcrypt.hash(matKhau, 10);
  
    db.query(
      'INSERT INTO NguoiDung (hoTen, tenTaiKhoan, matKhau, email, gioiTinh, ngaySinh, idVaiTro, diaChi, SDT, hinhAnh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [hoTen, tenTaiKhoan, hashedPassword, email, gioiTinh, ngaySinh, idVaiTro, diaChi, SDT, hinhAnh],
      (err, result) => {
        if (err) {
          console.error(err);  // In lỗi ra console
          return res.status(500).json({ message: 'Lỗi khi đăng ký người dùng' });
        }
        console.log(result);  // In kết quả khi thêm người dùng thành công
        return res.status(200).json({ message: 'Đăng ký thành công' });
      }
    );
  });
});

// Hàm đăng nhập
router.post('/login', (req, res) => {
  const { tenTaiKhoan, matKhau } = req.body;

  // Kiểm tra tên tài khoản và mật khẩu
  db.query('SELECT * FROM nguoidung WHERE tenTaiKhoan = ?', [tenTaiKhoan], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Lỗi hệ thống' });
    }

    if (results.length === 0) {
      return res.status(400).json({ message: 'Tên tài khoản không tồn tại' });
    }
       // Kiểm tra tài khoản bị khóa
    if (results[0].isLocked === 1) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa' });
    }
    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(matKhau, results[0].matKhau);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' });
    }
    
    // In ra dữ liệu người dùng để kiểm tra
    console.log("User Data:", results[0]);
    // Tạo token
    const token = jwt.sign({ id: results[0].idNguoidung, tenTaiKhoan: results[0].tenTaiKhoan, idVaiTro: results[0].idVaiTro}, secretKey, { expiresIn: '1h' });

    return res.status(200).json({
      message: 'Đăng nhập thành công',
      token,
      role: results[0].idVaiTro 
    });
  });
});

// Xác thực Google token
async function verifyGoogleToken(tokenId) {
  try {
    // Kiểm tra tokenId hợp lệ
    const ticket = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID, // Client ID
    });

    // Lấy thông tin người dùng từ token Google
    const payload = ticket.getPayload();
    return payload;
  } catch (error) {
    throw new Error('Token không hợp lệ');
  }
}

// Hàm đăng nhập Google
router.post('/google-login', async (req, res) => {
  const { tokenId } = req.body; // Nhận tokenId từ request

  try {
    // Xác thực token Google
    const googleUser = await verifyGoogleToken(tokenId);
    
    // Kiểm tra xem người dùng đã có trong hệ thống chưa
    let user = await db.promise().query('SELECT * FROM NguoiDung WHERE email = ?', [googleUser.email]);

    if (user[0].length === 0) {
      // Nếu không tìm thấy người dùng, tạo mới người dùng
      await db.promise().query(
        'INSERT INTO NguoiDung (hoTen, email, idVaiTro) VALUES (?, ?, ?)',
        [googleUser.name, googleUser.email, 'benhnhan']  // Tạo người dùng mặc định là 'benhnhan'
      );
      user = await db.promise().query('SELECT * FROM NguoiDung WHERE email = ?', [googleUser.email]);
    }

    // Tạo JWT token cho người dùng đã đăng nhập
    const token = jwt.sign(
      { id: user[0][0].idNguoidung, tenTaiKhoan: user[0][0].tenTaiKhoan, email: googleUser.email, idVaiTro: user[0][0].idVaiTro },
      'process.env.JWT_SECRET_KEY', // Mã hóa bằng secret key
      { expiresIn: '1h' }
    );

    // Trả về token và thông tin người dùng
    return res.status(200).json({
      message: 'Đăng nhập thành công',
      token,
      role: user[0][0].idVaiTro, // Trả về vai trò của người dùng
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Lỗi đăng nhập với Google', error: error.message });
  }
});



module.exports = router;
