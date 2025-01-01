const express = require('express');
const bcrypt = require('bcryptjs');
const verifyAdmin = require('../middlewares/verifyAdmin');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const upload = multer();



// Quản lý Người Dùng
// Lấy danh sách người dùng với khả năng tìm kiếm và lọc
router.get('/users', verifyAdmin, (req, res) => {
  const { search, role } = req.query;
  
  let query = `
    SELECT idNguoidung, hoTen, email, tenTaiKhoan, SDT, idVaiTro, isLocked, hinhAnh 
    FROM NguoiDung
    WHERE 1=1
  `;
  
  const queryParams = [];

  // Thêm điều kiện tìm kiếm
  if (search) {
    query += ` AND (
      hoTen LIKE ? OR 
      email LIKE ? OR 
      tenTaiKhoan LIKE ? OR 
      SDT LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Thêm điều kiện lọc theo vai trò
  if (role && role !== 'all') {
    query += ` AND idVaiTro = ?`;
    queryParams.push(role);
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Lỗi truy vấn database' });
    }

    // Xử lý hình ảnh trước khi gửi response
    const processedResults = results.map(user => {
      if (user.hinhAnh) {
        user.hinhAnh = user.hinhAnh.toString('base64');
      }else{
        user.hinhAnh = 'https://static.vecteezy.com/system/resources/thumbnails/009/292/244/small/default-avatar-icon-of-social-media-user-vector.jpg';
      }
      return user;
    });

    res.json(processedResults);
  });
});

// Khóa/Mở khóa tài khoản người dùng
router.put('/users/lock', verifyAdmin, (req, res) => {
  const userId = req.query.userId;
  const locked = req.query.locked === 'true';

  if (!userId) {
    return res.status(400).json({ message: 'Thiếu userId trong query parameters' });
  }

  db.query(
    'UPDATE NguoiDung SET isLocked = ? WHERE idNguoidung = ?',
    [locked ? 1 : 0, userId],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái tài khoản' });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }
      
      res.json({ 
        message: locked ? 'Khóa tài khoản thành công' : 'Mở khóa tài khoản thành công',
        userId,
        isLocked: locked
      });
    }
  );
});

// Xóa tài khoản người dùng
router.delete('/users', verifyAdmin, (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ message: 'Thiếu userId trong query parameters' });
  }

  // Kiểm tra xem người dùng có phải là admin không
  db.query(
    'SELECT idVaiTro FROM NguoiDung WHERE idNguoidung = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Lỗi khi kiểm tra vai trò người dùng' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }

      if (results[0].idVaiTro === 'admin') {
        return res.status(403).json({ message: 'Không thể xóa tài khoản admin' });
      }

      // Tiến hành xóa người dùng nếu không phải admin
      db.query(
        'DELETE FROM NguoiDung WHERE idNguoidung = ?',
        [userId],
        (deleteErr, deleteResult) => {
          if (deleteErr) {
            console.error('Database error:', deleteErr);
            return res.status(500).json({ message: 'Lỗi khi xóa người dùng' });
          }

          res.json({ 
            message: 'Xóa người dùng thành công',
            userId
          });
        }
      );
    }
  );
});

// Lấy thông tin cá nhân của admin
router.get('/profile', verifyAdmin, (req, res) => {
  const userId = req.user.id; // Lấy ID admin từ token xác thực
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
          user.hinhAnh = '/default-avatar.png';
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
router.put('/profile', verifyAdmin, upload.single('hinhAnh'), (req, res) => {
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
router.put('/change-password', verifyAdmin, async (req, res) => {
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


// Thêm chuyên khoa
// Middleware để parse body request
router.use(express.json()); // Đảm bảo rằng dữ liệu JSON từ body sẽ được parse

// Thêm chuyên khoa
router.post('/chuyenkhoa', verifyAdmin, upload.single('hinhAnh'), (req, res) => {
  const { ten, moTa } = req.body;
  const token = req.query.token;

  if (!ten) {
    return res.status(400).json({ message: 'Tên chuyên khoa không được để trống' });
  }

  if (!token) {
    return res.status(400).json({ message: 'Token không được để trống' });
  }

  let query = 'INSERT INTO ChuyenKhoa (ten, moTa';
  let values = [ten, moTa];
  let placeholders = '?, ?';

  // Nếu có hình ảnh được upload
  if (req.file) {
    query += ', hinhAnh';
    values.push(req.file.buffer);
    placeholders += ', ?';
  }

  query += `) VALUES (${placeholders})`;

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Lỗi khi thêm chuyên khoa:', err);
      return res.status(500).json({ message: 'Lỗi khi thêm chuyên khoa' });
    }
    res.status(201).json({ message: 'Thêm chuyên khoa thành công', id: result.insertId });
  });
});
// Cập nhật chuyên khoa

router.put('/chuyenkhoa', verifyAdmin, upload.single('hinhAnh'), (req, res) => {
  const { idChuyenkhoa, ten, moTa } = req.body;
  const token = req.query.token;

  if (!idChuyenkhoa || !ten) {
    return res.status(400).json({ message: 'Thiếu thông tin cần thiết' });
  }

  if (!token) {
    return res.status(400).json({ message: 'Token không hợp lệ' });
  }

  let query = 'UPDATE ChuyenKhoa SET ten = ?, moTa = ?';
  let values = [ten, moTa];

  // Nếu có hình ảnh được upload
  if (req.file) {
    query += ', hinhAnh = ?';
    values.push(req.file.buffer);
  }

  query += ' WHERE idChuyenkhoa = ?';
  values.push(idChuyenkhoa);

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật chuyên khoa:', err);
      return res.status(500).json({ message: 'Lỗi khi cập nhật chuyên khoa' });
    }
    res.status(200).json({ message: 'Cập nhật chuyên khoa thành công' });
  });
});

// Lấy danh sách chuyên khoa với hình ảnh
router.get('/chuyenkhoa', verifyAdmin, (req, res) => {
  db.query('SELECT * FROM ChuyenKhoa', (err, results) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
    
    // Chuyển đổi hình ảnh sang base64 nếu có
    const processedResults = results.map(specialty => {
      if (specialty.hinhAnh) {
        specialty.hinhAnh = specialty.hinhAnh.toString('base64');
      }
      return specialty;
    });
    
    res.json(processedResults);
  });
});


// Xóa chuyên khoa
router.delete('/chuyenkhoa', verifyAdmin, (req, res) => {
  const idChuyenkhoa = req.query.idChuyenkhoa;

  if (!idChuyenkhoa) {
    return res.status(400).json({ message: 'Thiếu idChuyenkhoa trong query parameters' });
  }

  db.query(
    'DELETE FROM ChuyenKhoa WHERE idChuyenkhoa = ?',
    [idChuyenkhoa],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Lỗi khi xóa chuyên khoa' });
      res.status(200).json({ message: 'Xóa chuyên khoa thành công' });
    }
  );
});

// Lấy danh sách chuyên khoa
router.get('/chuyenkhoa', verifyAdmin, (req, res) => {
  db.query('SELECT * FROM ChuyenKhoa', (err, results) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
    res.json(results);
  });
});


// Lấy danh sách phòng khám
router.get('/phongkham', verifyAdmin, (req, res) => {
  const { trangThai, search, idChuyenkhoa } = req.query;

  let query = `
    SELECT p.*, n.hoTen as tenBacSi, n.email, ck.ten as tenChuyenKhoa 
    FROM PhongKham p
    LEFT JOIN NguoiDung n ON p.idAdmin = n.idNguoidung
    LEFT JOIN ChuyenKhoa ck ON p.idChuyenkhoa = ck.idChuyenkhoa
    WHERE 1=1
  `;
  
  let queryParams = [];

  // Filter by status
  if (trangThai !== undefined) {
    query += ' AND p.trangThai = ?';
    queryParams.push(trangThai);
  }

  // Filter by specialty
  if (idChuyenkhoa) {
    query += ' AND p.idChuyenkhoa = ?';
    queryParams.push(idChuyenkhoa);
  }

  // Search filter
  if (search) {
    query += ` AND (p.ten LIKE ? OR n.hoTen LIKE ? OR n.email LIKE ?)`;
    const searchPattern = `%${search}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern);
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Lỗi truy vấn database' });
    }

    // Process images
    const processedResults = results.map(clinic => {
      if (clinic.hinhAnh) {
        clinic.hinhAnh = clinic.hinhAnh.toString('base64');
      }
      return clinic;
    });

    res.json(processedResults);
  });
});

// Duyệt hoặc từ chối phòng khám
router.put('/phongkham/duyet', verifyAdmin, (req, res) => {
  const { idPhongkham, trangThai, idNguoidung, idChuyenkhoa } = req.body; // Lấy id và trạng thái từ body request

  if (![0, 1, 2].includes(trangThai)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }

  if (!idPhongkham) {
    return res.status(400).json({ message: 'Thiếu idPhongkham' });
  }
  // Cập nhật trạng thái của phòng khám
  db.query(
    'UPDATE PhongKham SET trangThai = ? WHERE idPhongkham = ?',
    [trangThai, idPhongkham], 
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái phòng khám' });
      if (trangThai === 1) {
        const insertBacSiQuery = `
          INSERT INTO BacSi (idNguoidung, idPhongkham, idChuyenkhoa, moTa, giaKham)
          VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
          insertBacSiQuery,
          [idNguoidung, idPhongkham, idChuyenkhoa, 'Mô tả mặc định', '500000'],
          (err, result) => {
            if (err) return res.status(500).json({ message: 'Lỗi khi thêm bác sĩ mới' });
            return res.status(200).json({ message: 'Cập nhật và thêm bác sĩ thành công' });
          }
        );
      } else {
      res.status(200).json({ message: 'Cập nhật trạng thái phòng khám thành công' });
      }
    }
  );
});



// Lấy thông tin chi tiết phòng khám
router.get('/phongkham', verifyAdmin, (req, res) => {
  const idPhongkham = req.query.idPhongkham; // Lấy idPhongkham từ query parameters

  if (!idPhongkham) {
    return res.status(400).json({ message: 'Thiếu idPhongkham trong query parameters' });
  }

  db.query('SELECT * FROM PhongKham WHERE idPhongkham = ?', [idPhongkham], (err, results) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
    if (results.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phòng khám' });
    }
    res.json(results[0]); // Trả về thông tin phòng khám chi tiết
  });
});

// Thống kê bác sĩ có doanh thu cao nhất
router.get('/stats/top-doctors', verifyAdmin, (req, res) => {
  const query = `
    SELECT 
      bs.idBacsi,
      nd.hoTen,
      pk.ten as tenPhongKham,
      ck.ten as tenChuyenKhoa,
      COUNT(lh.idLichhen) as soLuotKham,
      SUM(CAST(bs.giaKham AS DECIMAL(10,2))) as doanhThu
    FROM BacSi bs
    JOIN NguoiDung nd ON bs.idNguoidung = nd.idNguoidung
    JOIN PhongKham pk ON bs.idPhongkham = pk.idPhongkham
    JOIN ChuyenKhoa ck ON bs.idChuyenkhoa = ck.idChuyenkhoa
    LEFT JOIN LichHenKham lh ON bs.idBacsi = lh.idBacsi
    WHERE lh.trangThai = 2
    GROUP BY bs.idBacsi, nd.hoTen, pk.ten, ck.ten
    ORDER BY doanhThu DESC
    LIMIT 5
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Lỗi truy vấn database' });
    }
    res.json(results);
  });
});

// Thống kê phòng khám có nhiều lượt khám nhất
router.get('/stats/top-clinics', verifyAdmin, (req, res) => {
  const query = `
    SELECT 
      pk.idPhongkham,
      pk.ten,
      ck.ten as tenChuyenKhoa,
      COUNT(lh.idLichhen) as soLuotKham
    FROM PhongKham pk
    JOIN ChuyenKhoa ck ON pk.idChuyenkhoa = ck.idChuyenkhoa
    LEFT JOIN LichHenKham lh ON pk.idPhongkham = lh.idPhongkham
    WHERE lh.trangThai = 2
    GROUP BY pk.idPhongkham, pk.ten, ck.ten
    ORDER BY soLuotKham DESC
    LIMIT 5
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Lỗi truy vấn database' });
    }
    res.json(results);
  });
});


module.exports = router;
