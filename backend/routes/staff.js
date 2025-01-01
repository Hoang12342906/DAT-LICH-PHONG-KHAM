const express = require('express');
const verifyStaff = require('../middlewares/verifyStaff');
const router = express.Router();
const db = require('../config/db');


// Lấy thông tin cá nhân (bao gồm hình ảnh)
router.get('/profile', verifyStaff, (req, res) => {
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

// Hàm kiểm tra quyền của nhân viên với bác sĩ
const checkStaffPermission = (staffId, doctorId) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count 
        FROM NhanVienPhongKham 
        WHERE idNguoidung = ? AND idBacsi = ?
      `;
      db.query(query, [staffId, doctorId], (err, results) => {
        if (err) reject(err);
        resolve(results[0].count > 0);
      });
    });
  };
  
  // API lấy danh sách bác sĩ được phân công
  router.get('/assigned-doctors', verifyStaff, (req, res) => {
    const staffId = req.user.id;
    
    const query = `
      SELECT DISTINCT b.idBacsi, n.hoTen, ck.ten as tenChuyenKhoa, pk.ten as tenPhongKham
      FROM BacSi b 
      JOIN NguoiDung n ON b.idNguoidung = n.idNguoidung
      JOIN NhanVienPhongKham nv ON nv.idBacsi = b.idBacsi
      LEFT JOIN ChuyenKhoa ck ON b.idChuyenkhoa = ck.idChuyenkhoa
      LEFT JOIN PhongKham pk ON b.idPhongkham = pk.idPhongkham
      WHERE nv.idNguoidung = ?
    `;
    
    db.query(query, [staffId], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Lỗi server khi lấy danh sách bác sĩ' });
      }
      res.json(results);
    });
  });
  
  // API lấy lịch làm việc của bác sĩ
  router.get('/doctor-schedules/:idBacsi', verifyStaff, async (req, res) => {
    const staffId = req.user.id;
    const { idBacsi } = req.params;
  
    try {
      const hasPermission = await checkStaffPermission(staffId, idBacsi);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Không có quyền truy cập lịch của bác sĩ này' });
      }
  
      const query = `
        SELECT lt.idLichtrinh, lt.ngay, lt.caKham, lt.trangThai,
               GROUP_CONCAT(ckg.gioKham) as gioKham,
               GROUP_CONCAT(ckg.trangThai) as trangThaiGioKham,
               GROUP_CONCAT(ckg.idKhunggio) as dsIdKhunggio
        FROM LichTrinh lt
        LEFT JOIN ChiTietKhungGio ckg ON lt.idLichtrinh = ckg.idLichtrinh
        WHERE lt.idBacsi = ?
        GROUP BY lt.idLichtrinh
        ORDER BY lt.ngay ASC
      `;
      
      db.query(query, [idBacsi], (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Lỗi server khi lấy lịch làm việc' });
        }
  
        const schedules = results.map(schedule => ({
          ...schedule,
          gioKham: schedule.gioKham ? schedule.gioKham.split(',') : [],
          trangThaiGioKham: schedule.trangThaiGioKham 
            ? schedule.trangThaiGioKham.split(',').map(Number)
            : [],
          dsIdKhunggio: schedule.dsIdKhunggio 
            ? schedule.dsIdKhunggio.split(',').map(Number)
            : []
        }));
        
        res.json(schedules);
      });
    } catch (err) {
      console.error('Server error:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  });
  
  // API tạo lịch làm việc mới
  router.post('/create-schedule', verifyStaff, async (req, res) => {
    const staffId = req.user.id;
    const { idBacsi, ngay, caKham, gioKham } = req.body;
  
    try {
      // Kiểm tra quyền hạn
      const hasPermission = await checkStaffPermission(staffId, idBacsi);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Không có quyền tạo lịch cho bác sĩ này' });
      }
  
      // Validate đầu vào
      if (!idBacsi || !ngay || !caKham || !Array.isArray(gioKham) || gioKham.length === 0) {
        return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
      }
  
      // Kiểm tra trùng lịch
      const checkQuery = `
        SELECT COUNT(*) as count 
        FROM LichTrinh 
        WHERE idBacsi = ? AND ngay = ? AND caKham = ?
      `;
  
      db.query(checkQuery, [idBacsi, ngay, caKham], (err, results) => {
        if (err) {
          return res.status(500).json({ message: 'Lỗi kiểm tra lịch trình' });
        }
  
        if (results[0].count > 0) {
          return res.status(400).json({ message: 'Bác sĩ đã có lịch trong thời gian này' });
        }
  
        // Bắt đầu transaction
        db.beginTransaction(err => {
          if (err) {
            return res.status(500).json({ message: 'Lỗi khởi tạo transaction' });
          }
  
          // Tạo lịch trình
          const insertSchedule = `
            INSERT INTO LichTrinh (idBacsi, ngay, caKham, trangThai)
            VALUES (?, ?, ?, 0)
          `;
  
          db.query(insertSchedule, [idBacsi, ngay, caKham], (err, result) => {
            if (err) {
              return db.rollback(() => {
                res.status(500).json({ message: 'Lỗi tạo lịch trình' });
              });
            }
  
            const idLichtrinh = result.insertId;
  
            // Tạo chi tiết khung giờ
            const insertTimeSlots = `
              INSERT INTO ChiTietKhungGio (idLichtrinh, gioKham, trangThai)
              VALUES ?
            `;
  
            const timeSlotValues = gioKham.map(gio => [idLichtrinh, gio, 0]);
  
            db.query(insertTimeSlots, [timeSlotValues], err => {
              if (err) {
                return db.rollback(() => {
                  res.status(500).json({ message: 'Lỗi tạo khung giờ' });
                });
              }
  
              db.commit(err => {
                if (err) {
                  return db.rollback(() => {
                    res.status(500).json({ message: 'Lỗi commit transaction' });
                  });
                }
                res.json({
                  message: 'Tạo lịch thành công',
                  idLichtrinh: idLichtrinh
                });
              });
            });
          });
        });
      });
    } catch (err) {
      console.error('Server error:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  });
  
  // API xóa lịch làm việc
  router.delete('/delete-schedule/:idLichtrinh', verifyStaff, async (req, res) => {
    const staffId = req.user.id;
    const { idLichtrinh } = req.params;
  
    try {
      // Lấy thông tin lịch trình và kiểm tra quyền
      const checkSchedule = `
        SELECT idBacsi 
        FROM LichTrinh 
        WHERE idLichtrinh = ?
      `;
  
      db.query(checkSchedule, [idLichtrinh], async (err, results) => {
        if (err || results.length === 0) {
          return res.status(404).json({ message: 'Không tìm thấy lịch trình' });
        }
  
        const idBacsi = results[0].idBacsi;
  
        // Kiểm tra quyền hạn
        const hasPermission = await checkStaffPermission(staffId, idBacsi);
        if (!hasPermission) {
          return res.status(403).json({ message: 'Không có quyền xóa lịch này' });
        }
  
        // Kiểm tra lịch hẹn
        const checkAppointments = `
          SELECT COUNT(*) as count 
          FROM LichHenKham 
          WHERE idLichtrinh = ?
        `;
  
        db.query(checkAppointments, [idLichtrinh], (err, results) => {
          if (err) {
            return res.status(500).json({ message: 'Lỗi kiểm tra lịch hẹn' });
          }
  
          if (results[0].count > 0) {
            return res.status(400).json({ message: 'Không thể xóa lịch đã có lịch hẹn' });
          }
  
          // Bắt đầu transaction xóa
          db.beginTransaction(err => {
            if (err) {
              return res.status(500).json({ message: 'Lỗi khởi tạo transaction' });
            }
  
            // Xóa khung giờ
            const deleteTimeSlots = `
              DELETE FROM ChiTietKhungGio 
              WHERE idLichtrinh = ?
            `;
  
            db.query(deleteTimeSlots, [idLichtrinh], err => {
              if (err) {
                return db.rollback(() => {
                  res.status(500).json({ message: 'Lỗi xóa khung giờ' });
                });
              }
  
              // Xóa lịch trình
              const deleteSchedule = `
                DELETE FROM LichTrinh 
                WHERE idLichtrinh = ?
              `;
  
              db.query(deleteSchedule, [idLichtrinh], err => {
                if (err) {
                  return db.rollback(() => {
                    res.status(500).json({ message: 'Lỗi xóa lịch trình' });
                  });
                }
  
                db.commit(err => {
                  if (err) {
                    return db.rollback(() => {
                      res.status(500).json({ message: 'Lỗi commit transaction' });
                    });
                  }
                  res.json({ message: 'Xóa lịch thành công' });
                });
              });
            });
          });
        });
      });
    } catch (err) {
      console.error('Server error:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  });

  // API lấy danh sách lịch hẹn của bác sĩ được phân công
router.get('/appointments', verifyStaff, (req, res) => {
  const staffId = req.user.id;
  
  const query = `
    SELECT DISTINCT 
      lh.*,
      nd.hoTen as tenBacsi
    FROM LichHenKham lh
    JOIN BacSi b ON lh.idBacsi = b.idBacsi
    JOIN NguoiDung nd ON b.idNguoidung = nd.idNguoidung
    JOIN NhanVienPhongKham nv ON lh.idBacsi = nv.idBacsi
    WHERE nv.idNguoidung = ?
    ORDER BY lh.thoiGiandatlich DESC
  `;
  
  db.query(query, [staffId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách lịch hẹn' });
    }
    res.json(results);
  });
});

  // API cập nhật trạng thái khám bệnh
  router.put('/update-appointment-status/:idLichhen', verifyStaff, async (req, res) => {
    const { idLichhen } = req.params;
    const { trangThai } = req.body;
    const staffId = req.user.id;
  
    try {
      const checkPermission = `
        SELECT COUNT(*) as count, lh.idBacsi, lh.idBenhnhan
        FROM LichHenKham lh
        JOIN NhanVienPhongKham nv ON lh.idBacsi = nv.idBacsi
        WHERE lh.idLichhen = ? AND nv.idNguoidung = ?
      `;
  
      db.query(checkPermission, [idLichhen, staffId], (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập' });
        if (results[0].count === 0) return res.status(403).json({ message: 'Không có quyền cập nhật' });
  
        const { idBacsi, idBenhnhan } = results[0];
  
        db.beginTransaction(async (err) => {
          if (err) return res.status(500).json({ message: 'Lỗi khởi tạo transaction' });
  
          try {
            // Cập nhật trạng thái lịch hẹn
            const updateQuery = `
              UPDATE LichHenKham 
              SET trangThai = ?
              WHERE idLichhen = ?
            `;
  
            await new Promise((resolve, reject) => {
              db.query(updateQuery, [trangThai, idLichhen], (err) => {
                if (err) reject(err);
                resolve();
              });
            });
  
            // Nếu trạng thái là "đã khám xong", thêm vào lịch sử khám bệnh
            if (trangThai === 2) {
              const insertHistory = `
                INSERT INTO LichSuKhamBenh (idBenhnhan, idBacsi, idLichhen)
                VALUES (?, ?, ?)
              `;
  
              await new Promise((resolve, reject) => {
                db.query(insertHistory, [idBenhnhan, idBacsi, idLichhen], (err) => {
                  if (err) reject(err);
                  resolve();
                });
              });
            }
  
            db.commit((err) => {
              if (err) {
                return db.rollback(() => {
                  res.status(500).json({ message: 'Lỗi commit transaction' });
                });
              }
              res.json({ message: 'Cập nhật thành công', trangThai });
            });
          } catch (error) {
            db.rollback(() => {
              res.status(500).json({ message: 'Lỗi cập nhật dữ liệu' });
            });
          }
        });
      });
    } catch (err) {
      console.error('Server error:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  });
  
module.exports = router;
