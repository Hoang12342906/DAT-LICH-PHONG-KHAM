const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const upload = multer();


router.get('/profile', (req, res) => {
    const userId = req.user.id; 
    db.query(
      'SELECT hoTen, email, hinhAnh, gioiTinh, ngaySinh, diaChi, SDT FROM NguoiDung WHERE idNguoidung = ?',
      [userId],
      (err, results) => {
        if (err) {
          console.error('Lỗi khi lấy thông tin:', err);
          return res.status(500).json({ message: 'Lỗi truy vấn' });
        }
  
        if (results.length > 0) {
          const user = results[0];
  
          // Chuyển đổi hình ảnh từ Buffer sang Base64
          if (user.hinhAnh) {
            const base64Image = user.hinhAnh.toString('base64');
            user.hinhAnh = `data:image/png;base64,${base64Image}`;
          } else {
            user.hinhAnh = './img/default_avatar.jpg';
          }
  
          // Chuyển đổi gioiTinh từ Buffer (kiểu BIT) sang số
          user.gioiTinh = user.gioiTinh ? user.gioiTinh[0] : null;
  
          console.log('Dữ liệu trả về:', user); // Log để kiểm tra
          res.json(user);
        } else {
          res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
      }
    );
  });
// Cập nhật thông tin cá nhân của admin
router.put('/profile', upload.single('hinhAnh'), (req, res) => {
    const { hoTen, email, gioiTinh, ngaySinh, diaChi, SDT } = req.body;
    const userId = req.user.id;
  
    // Chuyển đổi giới tính từ chuỗi sang kiểu số hoặc null
    const parsedGioiTinh = gioiTinh === '' ? null : gioiTinh === '0' ? 0 : gioiTinh === '1' ? 1 : null;
  
    console.log('Dữ liệu nhận được:', { hoTen, email, gioiTinh, ngaySinh, diaChi, SDT });
    console.log('Giới tính sau khi chuyển đổi:', parsedGioiTinh);
  
    let updateQuery = `
      UPDATE NguoiDung 
      SET hoTen = ?, email = ?, gioiTinh = ?, ngaySinh = ?, diaChi = ?, SDT = ?
    `;
    let queryParams = [hoTen, email, parsedGioiTinh, ngaySinh, diaChi, SDT];
  
    // Nếu có hình ảnh, thêm vào câu truy vấn
    if (req.file) {
      updateQuery += ', hinhAnh = ?';
      queryParams.push(req.file.buffer); // Sử dụng buffer cho hình ảnh
    }
  
    updateQuery += ' WHERE idNguoidung = ?';
    queryParams.push(userId);
  
    console.log('Câu truy vấn cập nhật:', updateQuery);
    console.log('Tham số truy vấn:', queryParams);
  
    db.query(updateQuery, queryParams, (err, result) => {
      if (err) {
        console.error('Lỗi khi cập nhật thông tin:', err);
        return res.status(500).json({
          message: 'Lỗi khi cập nhật thông tin',
          error: err.message,
        });
      }
  
      console.log('Kết quả cập nhật:', result);
  
      // Lấy lại thông tin đã cập nhật
      db.query(
        'SELECT hoTen, email, hinhAnh, gioiTinh, ngaySinh, diaChi, SDT FROM NguoiDung WHERE idNguoidung = ?',
        [userId],
        (err, results) => {
          if (err) {
            console.error('Lỗi khi lấy thông tin cập nhật:', err);
            return res.status(500).json({
              message: 'Lỗi khi lấy thông tin cập nhật',
              error: err.message,
            });
          }
  
          const updatedUser = results[0];
          if (updatedUser.hinhAnh) {
            const base64Image = updatedUser.hinhAnh.toString('base64');
            updatedUser.hinhAnh = `data:image/png;base64,${base64Image}`;
          }
  
          // Chuyển đổi BIT sang số cho giới tính
          updatedUser.gioiTinh = updatedUser.gioiTinh ? updatedUser.gioiTinh[0] : null;
  
          console.log('Dữ liệu trả về sau cập nhật:', updatedUser);
          res.json({ message: 'Cập nhật thông tin thành công', user: updatedUser });
        }
      );
    });
  });
  // API Thay đổi mật khẩu
  router.put('/change-password', async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; // ID người dùng từ token xác thực
  
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
    }
  
    try {
      // Lấy mật khẩu hiện tại từ database
      db.query('SELECT matKhau FROM NguoiDung WHERE idNguoidung = ?', [userId], async (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi hệ thống' });
        if (results.length === 0) return res.status(404).json({ message: 'Người dùng không tồn tại' });
  
        const hashedPassword = results[0].matKhau;
  
        // So sánh mật khẩu cũ
        const isMatch = await bcrypt.compare(oldPassword, hashedPassword);
        if (!isMatch) {
          return res.status(400).json({ message: 'Mật khẩu cũ không chính xác' });
        }
  
        // Mã hóa mật khẩu mới
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
  
        // Cập nhật mật khẩu mới
        db.query('UPDATE NguoiDung SET matKhau = ? WHERE idNguoidung = ?', [newHashedPassword, userId], (err) => {
          if (err) return res.status(500).json({ message: 'Lỗi khi cập nhật mật khẩu' });
          res.status(200).json({ message: 'Thay đổi mật khẩu thành công' });
        });
      });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi hệ thống' });
    }
  });
  
  // Thêm route sau vào profile.js
router.put('/doctor/update-price', (req, res) => {
  const userId = req.user.id;
  const { giaKham } = req.body;

  // Validate giá khám
  if (!giaKham || isNaN(giaKham)) {
    return res.status(400).json({ message: 'Giá khám không hợp lệ' });
  }

  // Trước tiên lấy idBacsi từ bảng BacSi
  db.query(
    'SELECT idBacsi FROM BacSi WHERE idNguoidung = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error('Lỗi khi tìm thông tin bác sĩ:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });
      }

      const idBacsi = results[0].idBacsi;

      // Cập nhật giá khám trong bảng BacSi
      db.query(
        'UPDATE BacSi SET giaKham = ? WHERE idBacsi = ?',
        [giaKham, idBacsi],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error('Lỗi khi cập nhật giá khám:', updateErr);
            return res.status(500).json({ message: 'Lỗi khi cập nhật giá khám' });
          }

          if (updateResult.affectedRows === 0) {
            return res.status(404).json({ message: 'Không tìm thấy bác sĩ để cập nhật' });
          }

          // Lấy thông tin đã cập nhật
          db.query(
            'SELECT giaKham FROM BacSi WHERE idBacsi = ?',
            [idBacsi],
            (getErr, getResults) => {
              if (getErr) {
                return res.status(500).json({ message: 'Lỗi khi lấy thông tin cập nhật' });
              }

              res.json({
                message: 'Cập nhật giá khám thành công',
                giaKham: getResults[0].giaKham
              });
            }
          );
        }
      );
    }
  );
});

// Thêm route để lấy thông tin giá khám của bác sĩ
router.get('/doctor/info', (req, res) => {
  const userId = req.user.id;

  db.query(
    'SELECT BacSi.* FROM BacSi WHERE BacSi.idNguoidung = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error('Lỗi khi lấy thông tin bác sĩ:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });
      }

      res.json(results[0]);
    }
  );
});
module.exports = router;