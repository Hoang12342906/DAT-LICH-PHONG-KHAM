const express = require('express');
const multer = require('multer');
const upload = multer();
const verifyDoctor = require('../middlewares/verifyDoctor');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config(); 
const secretKey = process.env.JWT_SECRET_KEY



// Lấy thông tin cá nhân của bác sĩ (bao gồm hình ảnh)
router.get('/profile', verifyDoctor, (req, res) => {
    const userId = req.user.id;
    db.query(
        'SELECT hoTen, email, hinhAnh FROM NguoiDung WHERE idNguoidung = ?',
        [userId],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });

            if (results.length > 0) {
                const user = results[0];

                if (user.hinhAnh) {
                    const base64Image = user.hinhAnh.toString('base64');
                    res.json({
                        hoTen: user.hoTen,
                        email: user.email,
                        hinhAnh: `data:image/png;base64,${base64Image}`
                    });
                } else {
                    res.json({
                        hoTen: user.hoTen,
                        email: user.email,
                        hinhAnh: '/default-avatar.png'
                    });
                }
            } else {
                res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }
        }
    );
});


// Kiểm tra trạng thái phòng khám hiện tại của bác sĩ
const checkClinicStatus = (doctorId) => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT idPhongkham, ten, trangThai FROM PhongKham WHERE idAdmin = ? ORDER BY idPhongkham DESC LIMIT 1',
      [doctorId],
      (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results[0] || null);
      }
    );
  });
};

// API đăng ký phòng khám với validation
router.post('/phongkham/dangky', verifyDoctor, upload.single('hinhAnh'), async (req, res) => {
  try {
    const doctorId = req.user.id;
    
    // Kiểm tra trạng thái phòng khám hiện tại
    const currentClinic = await checkClinicStatus(doctorId);
    if (currentClinic && currentClinic.trangThai !== 2) { // 2 là trạng thái từ chối
      return res.status(400).json({ 
        message: 'Không thể đăng ký phòng khám mới khi đã có phòng khám đang chờ duyệt hoặc đã được duyệt'
      });
    }

    const { ten, diaChi, SDT, moTa, idChuyenkhoa } = req.body;
    const hinhAnh = req.file ? req.file.buffer : null;

    // Validate required fields
    if (!ten || !diaChi || !SDT || !idChuyenkhoa) {
      return res.status(400).json({ 
        message: 'Vui lòng cung cấp đầy đủ thông tin',
        missing: {
          ten: !ten,
          diaChi: !diaChi,
          SDT: !SDT,
          idChuyenkhoa: !idChuyenkhoa
        }
      });
    }

    // Validate SDT is numeric
    if (isNaN(parseInt(SDT, 10))) {
      return res.status(400).json({ message: 'Số điện thoại không hợp lệ' });
    }

    db.query(
      'INSERT INTO PhongKham (ten, diaChi, SDT, moTa, trangThai, hinhAnh, idChuyenkhoa, idAdmin) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
      [ten, diaChi, parseInt(SDT, 10), moTa || '', hinhAnh, parseInt(idChuyenkhoa, 10), doctorId],
      (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ 
            message: 'Lỗi khi đăng ký phòng khám',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
          });
        }

        res.status(201).json({ message: 'Đăng ký phòng khám thành công, chờ duyệt từ admin' });
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Lỗi server khi xử lý yêu cầu' });
  }
});

router.get('/phongkham/status', verifyDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    
    // Lấy phòng khám mới nhất của bác sĩ
    db.query(
      'SELECT idPhongkham, ten, trangThai FROM PhongKham WHERE idAdmin = ? ORDER BY idPhongkham DESC LIMIT 1',
      [doctorId],
      (err, results) => {
        if (err) {
          return res.status(500).json({ message: 'Lỗi khi kiểm tra trạng thái phòng khám' });
        }

        if (results.length > 0) {
          res.json({
            hasClinic: true,
            clinic: results[0]
          });
        } else {
          res.json({
            hasClinic: false
          });
        }
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi xử lý yêu cầu' });
  }
});
// doctor.js (Backend)

router.get('/chuyenkhoa', verifyDoctor, (req, res) => {
  db.query('SELECT * FROM ChuyenKhoa', (err, results) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
    res.json(results);
  });
});


// Lấy danh sách nhân viên
router.get('/staffs/list', verifyDoctor, async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  try {
    const doctorId = req.user.id;
    console.log("Doctor ID: ", doctorId); // Thêm log để kiểm tra doctorId

    db.query(
      `SELECT bs.idBacsi 
       FROM BacSi bs 
       WHERE bs.idNguoidung = ?`,
      [doctorId],
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi khi truy vấn thông tin bác sĩ' });
        if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });

        const idBacsi = results[0].idBacsi;

        db.query(
          `SELECT n.idNguoidung AS id, n.hoTen, n.tenTaiKhoan, n.email, n.hinhAnh
           FROM NguoiDung n
           INNER JOIN NhanVienPhongKham nv ON n.idNguoidung = nv.idNguoidung
           WHERE nv.idBacsi = ?`,
          [idBacsi],
          (err, staffResults) => {
            if (err) return res.status(500).json({ message: 'Lỗi khi lấy danh sách nhân viên' });

            const staffList = staffResults.map(staff => ({
              id: staff.id,
              hoTen: staff.hoTen,
              tenTaiKhoan: staff.tenTaiKhoan,
              email: staff.email,
              hinhAnh: staff.hinhAnh
                ? `data:image/png;base64,${staff.hinhAnh.toString('base64')}`
                : null
            }));

            res.status(200).json(staffList);
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Token không hợp lệ' });
  }
});

// Thêm nhân viên mới
router.post('/staffs/add', verifyDoctor, async (req, res) => {
  const { token } = req.query;
  const { hoTen, tenTaiKhoan, matKhau, email } = req.body;

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  // Mã hóa mật khẩu
  const hashedPassword = await bcrypt.hash(matKhau, 10);

  if (!hoTen || !tenTaiKhoan || !matKhau || !email) {
    return res.status(400).json({ 
      message: 'Vui lòng cung cấp đầy đủ thông tin',
      required: {
        hoTen: !hoTen,
        tenTaiKhoan: !tenTaiKhoan,
        matKhau: !matKhau,
        email: !email
      }
    });
  }

  try {
    const doctorId = req.user.id;

    db.query(
      'SELECT idBacsi FROM BacSi WHERE idNguoidung = ?',
      [doctorId],
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi khi truy vấn thông tin bác sĩ' });
        if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });

        const idBacsi = results[0].idBacsi;

        // Add user and associate with doctor
        db.query(
          'INSERT INTO NguoiDung (hoTen, tenTaiKhoan, matKhau, email, idVaiTro) VALUES (?, ?, ?, ?, "nhanvien")',
          [hoTen, tenTaiKhoan, hashedPassword, email],
          (err, insertResult) => {
            if (err) {
              if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Tên tài khoản hoặc email đã tồn tại' });
              }
              return res.status(500).json({ message: 'Lỗi khi thêm nhân viên' });
            }

            const newUserId = insertResult.insertId;

            db.query(
              'INSERT INTO NhanVienPhongKham (idBacsi, idNguoidung) VALUES (?, ?)',
              [idBacsi, newUserId],
              (err) => {
                if (err) return res.status(500).json({ message: 'Lỗi khi thêm vào NhanVienPhongKham' });

                res.status(201).json({ message: 'Thêm nhân viên thành công', staffId: newUserId });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hệ thống' });
  }
});

// Cập nhật nhân viên
router.put('/staffs/update', verifyDoctor, async (req, res) => {
  const { token } = req.query;
  const { staffId, hoTen, email } = req.body;

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  if (!staffId || !hoTen || !email) {
    return res.status(400).json({ 
      message: 'Vui lòng cung cấp đầy đủ thông tin',
      required: { staffId: !staffId, hoTen: !hoTen, email: !email }
    });
  }

  try {
    const doctorId = req.user.id;

    db.query(
      `SELECT nv.idNguoidung 
       FROM NhanVienPhongKham nv
       INNER JOIN BacSi bs ON nv.idBacsi = bs.idBacsi
       WHERE bs.idNguoidung = ? AND nv.idNguoidung = ?`,
      [doctorId, staffId],
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
        if (results.length === 0) return res.status(403).json({ message: 'Không có quyền cập nhật nhân viên này' });

        db.query(
          'UPDATE NguoiDung SET hoTen = ?, email = ? WHERE idNguoidung = ? AND idVaiTro = "nhanvien"',
          [hoTen, email, staffId],
          (err) => {
            if (err) return res.status(500).json({ message: 'Lỗi khi cập nhật thông tin nhân viên' });

            res.status(200).json({ message: 'Cập nhật thông tin nhân viên thành công' });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hệ thống' });
  }
});

// Xóa nhân viên
router.delete('/staffs/delete', verifyDoctor, async (req, res) => {
  const { token } = req.query;
  const { staffId } = req.body;

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  if (!staffId) {
    return res.status(400).json({ message: 'Vui lòng cung cấp ID nhân viên' });
  }

  try {
    const doctorId = req.user.id;

    db.query(
      `SELECT nv.idNguoidung 
       FROM NhanVienPhongKham nv
       INNER JOIN BacSi bs ON nv.idBacsi = bs.idBacsi
       WHERE bs.idNguoidung = ? AND nv.idNguoidung = ?`,
      [doctorId, staffId],
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
        if (results.length === 0) return res.status(403).json({ message: 'Không có quyền xóa nhân viên này' });

        db.query(
          'DELETE FROM NhanVienPhongKham WHERE idNguoidung = ?',
          [staffId],
          (err) => {
            if (err) return res.status(500).json({ message: 'Lỗi khi xóa nhân viên' });

            db.query(
              'DELETE FROM NguoiDung WHERE idNguoidung = ? AND idVaiTro = "nhanvien"',
              [staffId],
              (err) => {
                if (err) return res.status(500).json({ message: 'Lỗi khi xóa tài khoản nhân viên' });

                res.status(200).json({ message: 'Xóa nhân viên thành công' });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hệ thống' });
  }
});

// Add these endpoints to doctor.js
const moment = require('moment-timezone');

router.get('/schedule', verifyDoctor, (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  const doctorId = req.user.id;

  db.query(
    `SELECT bs.idBacsi FROM BacSi bs WHERE bs.idNguoidung = ?`,
    [doctorId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn thông tin bác sĩ' });
      if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });

      const idBacsi = results[0].idBacsi;

      db.query(
        `SELECT lt.idLichtrinh, lt.ngay, lt.caKham, lt.trangThai, 
                ctkh.idKhunggio, ctkh.gioKham, ctkh.trangThai as trangThaiKhungGio
         FROM LichTrinh lt
         LEFT JOIN ChiTietKhungGio ctkh ON lt.idLichtrinh = ctkh.idLichtrinh
         WHERE lt.idBacsi = ?
         ORDER BY lt.ngay ASC, ctkh.gioKham ASC`,
        [idBacsi],
        (err, scheduleResults) => {
          if (err) return res.status(500).json({ message: 'Lỗi khi lấy lịch trình' });

          // Chuyển đổi ngày sang múi giờ VN
          const organizedSchedule = scheduleResults.reduce((acc, curr) => {
            const date = moment.utc(curr.ngay).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
            
            if (!acc[date]) {
              acc[date] = {
                idLichtrinh: curr.idLichtrinh,
                ngay: date,
                caKham: curr.caKham,
                trangThai: curr.trangThai,
                khungGio: []
              };
            }

            if (curr.idKhunggio) {
              acc[date].khungGio.push({
                idKhunggio: curr.idKhunggio,
                gioKham: curr.gioKham,
                trangThai: curr.trangThaiKhungGio
              });
            }

            return acc;
          }, {});

          res.json(Object.values(organizedSchedule));
        }
      );
    }
  );
});

// Xem lịch trình do nhân viên xếp chờ duyệt
router.get('/staff-schedules/pending', verifyDoctor, (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  const doctorId = req.user.id;

  db.query(
    `SELECT bs.idBacsi FROM BacSi bs WHERE bs.idNguoidung = ?`,
    [doctorId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn thông tin bác sĩ' });
      if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });

      const idBacsi = results[0].idBacsi;

      db.query(
        `SELECT lt.idLichtrinh, lt.ngay, lt.caKham, lt.trangThai,
                ctkh.idKhunggio, ctkh.gioKham, ctkh.trangThai as trangThaiKhungGio,
                nv.idNhanvien, nd.hoTen as tenNhanVien
         FROM LichTrinh lt
         LEFT JOIN ChiTietKhungGio ctkh ON lt.idLichtrinh = ctkh.idLichtrinh
         LEFT JOIN NhanVienPhongKham nv ON lt.idLichtrinh = nv.idLichtrinh
         LEFT JOIN NguoiDung nd ON nv.idNguoidung = nd.idNguoidung
         WHERE lt.idBacsi = ? AND lt.trangThai = 0
         ORDER BY lt.ngay ASC, ctkh.gioKham ASC`,
        [idBacsi],
        (err, scheduleResults) => {
          if (err) return res.status(500).json({ message: 'Lỗi khi lấy lịch trình chờ duyệt' });

          const organizedSchedule = scheduleResults.reduce((acc, curr) => {
            const date = moment.utc(curr.ngay).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
            
            if (!acc[date]) {
              acc[date] = {
                idLichtrinh: curr.idLichtrinh,
                ngay: date,
                caKham: curr.caKham,
                trangThai: curr.trangThai,
                tenNhanVien: curr.tenNhanVien,
                khungGio: []
              };
            }

            if (curr.idKhunggio) {
              acc[date].khungGio.push({
                idKhunggio: curr.idKhunggio,
                gioKham: curr.gioKham,
                trangThai: curr.trangThaiKhungGio
              });
            }

            return acc;
          }, {});

          res.json(Object.values(organizedSchedule));
        }
      );
    }
  );
});


// Duyệt lịch trình do nhân viên xếp
router.put('/staff-schedules/approve', verifyDoctor, (req, res) => {
  const { token } = req.query;
  const { idLichtrinh } = req.body;
  
  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  if (!idLichtrinh) {
    return res.status(400).json({ message: 'Vui lòng cung cấp ID lịch trình' });
  }

  const doctorId = req.user.id;

  // Kiểm tra quyền duyệt lịch trình
  db.query(
    `SELECT lt.idLichtrinh 
     FROM LichTrinh lt
     INNER JOIN BacSi bs ON lt.idBacsi = bs.idBacsi
     WHERE bs.idNguoidung = ? AND lt.idLichtrinh = ? AND lt.trangThai = 0`,
    [doctorId, idLichtrinh],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
      if (results.length === 0) return res.status(403).json({ 
        message: 'Không có quyền duyệt lịch trình này hoặc lịch trình không tồn tại/đã được duyệt' 
      });

      // Cập nhật trạng thái lịch trình thành đã duyệt
      db.query(
        'UPDATE LichTrinh SET trangThai = 1 WHERE idLichtrinh = ?',
        [idLichtrinh],
        (err) => {
          if (err) return res.status(500).json({ message: 'Lỗi khi duyệt lịch trình' });

          res.json({ 
            message: 'Duyệt lịch trình thành công',
            idLichtrinh: idLichtrinh
          });
        }
      );
    }
  );
});


router.get('/appointments', verifyDoctor, (req, res) => {
  const doctorId = req.user.id;

  db.query(
    `SELECT bs.idBacsi FROM BacSi bs WHERE bs.idNguoidung = ?`,
    [doctorId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn thông tin bác sĩ' });
      if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy thông tin bác sĩ' });

      const idBacsi = results[0].idBacsi;

      db.query(
        `SELECT 
          lh.idLichhen, lh.thoiGiandatlich, lh.lyDokham,
          lh.tenBenhnhan, lh.SDTBenhnhan, lh.diaChiBenhnhan,
          lh.ngaySinhBenhnhan, lh.gioiTinhBenhnhan,
          lh.trangThai,
          lt.ngay, ctkh.gioKham,
          pk.ten as tenPhongKham
         FROM LichHenKham lh
         LEFT JOIN LichTrinh lt ON lh.idLichtrinh = lt.idLichtrinh
         LEFT JOIN ChiTietKhungGio ctkh ON lh.idKhunggio = ctkh.idKhunggio
         LEFT JOIN PhongKham pk ON lh.idPhongkham = pk.idPhongkham
         WHERE lh.idBacsi = ?
         ORDER BY lt.ngay DESC, ctkh.gioKham ASC`,
        [idBacsi],
        (err, appointmentResults) => {
          if (err) return res.status(500).json({ message: 'Lỗi khi lấy danh sách lịch hẹn' });

        // In doctor.js, modify the appointments query response:
        // Trong file doctor.js
        
        const appointments = appointmentResults.map(apt => {
          console.log('Raw date from DB:', apt.ngay); // Log để kiểm tra
          let trangThaiText;
  switch(apt.trangThai) {
    case 0:
      trangThaiText = 'Chờ khám';
      break;
    case 1:
      trangThaiText = 'Đang khám';
      break;
    case 2:
      trangThaiText = 'Đã khám xong';
      break;
    case 3:
      trangThaiText = 'Đã hủy';
      break;
    default:
      trangThaiText = 'Không xác định';
    }
          
          return {
            ...apt,
            ngay: apt.ngay ? moment(apt.ngay).format('YYYY-MM-DD') : null,
            ngaySinhBenhnhan: apt.ngaySinhBenhnhan ? moment(apt.ngaySinhBenhnhan).format('YYYY-MM-DD') : null,
            thoiGiandatlich: apt.thoiGiandatlich ? moment(apt.thoiGiandatlich).format('YYYY-MM-DD HH:mm:ss') : null,
            trangThai: trangThaiText
          };
        });

          res.json(appointments);
        }
      );
    }
  );
});

module.exports = router;
