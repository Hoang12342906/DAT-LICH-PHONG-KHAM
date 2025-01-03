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
// In auth.js, modify the google-login route:
router.get('/google-login', async (req, res) => {
  const tokenId = req.query.tokenId;

  try {
    const googleUser = await verifyGoogleToken(tokenId);
    let user = await db.promise().query('SELECT * FROM NguoiDung WHERE email = ?', [googleUser.email]);

    if (user[0].length === 0) {
      let tenTaiKhoan = googleUser.email.split('@')[0];
      const existingUser = await db.promise().query('SELECT * FROM NguoiDung WHERE tenTaiKhoan = ?', [tenTaiKhoan]);
      if (existingUser[0].length > 0) {
        tenTaiKhoan += Math.floor(Math.random() * 1000);
      }

      await db.promise().query(
        'INSERT INTO NguoiDung (hoTen, tenTaiKhoan, email, idVaiTro) VALUES (?, ?, ?, ?)',
        [googleUser.name, tenTaiKhoan, googleUser.email, 'benhnhan']
      );
      user = await db.promise().query('SELECT * FROM NguoiDung WHERE email = ?', [googleUser.email]);
    }

    const token = jwt.sign(
      { 
        id: user[0][0].idNguoidung, 
        tenTaiKhoan: user[0][0].tenTaiKhoan, 
        email: googleUser.email, 
        idVaiTro: user[0][0].idVaiTro 
      },
      secretKey,
      { expiresIn: '1h' }
    );

    // Return JSON response instead of redirect
    return res.status(200).json({
      message: 'Đăng nhập thành công',
      token,
      role: user[0][0].idVaiTro
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Lỗi đăng nhập với Google', error: error.message });
  }
});


// auth.js - Thêm route xử lý quên mật khẩu
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Route xử lý yêu cầu quên mật khẩu
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email không được để trống' });
  }

  try {
    // Verify email exists
    const [users] = await db.promise().query(
      'SELECT * FROM NguoiDung WHERE email = ?', 
      [email]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Email không tồn tại trong hệ thống' });
    }

    const newPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.promise().query(
      'UPDATE NguoiDung SET matKhau = ? WHERE email = ?',
      [hashedPassword, email]
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Mật khẩu mới cho tài khoản của bạn',
      html: `
        <h2>Yêu cầu đặt lại mật khẩu</h2>
        <p>Mật khẩu mới của bạn là: <strong>${newPassword}</strong></p>
        <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi nhận được email này.</p>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: 'Mật khẩu mới đã được gửi đến email của bạn' });
    } catch (emailError) {
      console.error('Email error:', emailError);
      // Revert password change if email fails
      await db.promise().query(
        'UPDATE NguoiDung SET matKhau = ? WHERE email = ?',
        [users[0].matKhau, email]
      );
      res.status(500).json({ message: 'Lỗi gửi email. Vui lòng thử lại sau.' });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Lỗi server. Vui lòng thử lại sau.' });
  }
});

module.exports = router;
