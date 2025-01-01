const express = require('express');
const verifyPatient = require('../middlewares/verifyPatient');
const router = express.Router();
const db = require('../config/db');


// Lấy thông tin 
router.get('/user', verifyPatient, (req, res) => {
    const userId = req.user.id; 
    db.query(
      'SELECT hoTen, email, hinhAnh FROM NguoiDung WHERE idNguoidung = ?', 
      [userId], 
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Lỗi truy vấn' });
  
        if (results.length > 0) {
          const user = results[0];
  
          // Nếu hình ảnh tồn tại, chuyển đổi hình ảnh sang Base64
          if (user.hinhAnh) {
            const base64Image = user.hinhAnh.toString('base64');
            res.json({
              hoTen: user.hoTen,
              email: user.email,
              hinhAnh: `data:image/png;base64,${base64Image}` // Gửi ảnh dưới dạng Base64
            });
          } else {
            // Nếu không có ảnh, trả về URL ảnh mặc định
            res.json({
              hoTen: user.hoTen,
              email: user.email,
              hinhAnh: 'https://static.vecteezy.com/system/resources/thumbnails/009/292/244/small/default-avatar-icon-of-social-media-user-vector.jpg', // Ảnh mặc định
            });
          }
        } else {
          res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
      }
    );
  });

  // Lấy danh sách chuyên khoa
  router.get('/chuyenkhoa', verifyPatient, (req, res) => {
    db.query('SELECT idChuyenkhoa, ten, hinhAnh FROM ChuyenKhoa LIMIT 12', (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
  
      const chuyenkhoa = results.map(item => ({
        idChuyenkhoa: item.idChuyenkhoa,
        ten: item.ten,
        hinhAnh: item.hinhAnh ? `data:image/png;base64,${item.hinhAnh.toString('base64')}` : null,
      }));
      res.json(chuyenkhoa);
    });
  });
  
  // Lấy danh sách phòng khám nổi bật
  router.get('/phongkham/noibat', verifyPatient, (req, res) => {
    db.query('SELECT idPhongkham, ten, hinhAnh FROM PhongKham WHERE trangThai = 1 LIMIT 8', (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
  
      const phongkham = results.map(item => ({
        idPhongkham: item.idPhongkham,
        ten: item.ten,
        hinhAnh: item.hinhAnh ? `data:image/png;base64,${item.hinhAnh.toString('base64')}` : null,
      }));
      res.json(phongkham);
    });
  });
  
  
  
  // Lấy danh sách bác sĩ nổi bật
  router.get('/bacsi/noibat', verifyPatient, (req, res) => {
    db.query(`
      SELECT BacSi.idBacsi, NguoiDung.hoTen, NguoiDung.hinhAnh
      FROM BacSi
      JOIN NguoiDung ON BacSi.idNguoidung = NguoiDung.idNguoidung
      WHERE NguoiDung.idVaiTro = 'bacsi'
      AND NguoiDung.isLocked = 0
      LIMIT 8
    `, (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
  
      const bacsi = results.map(item => ({
        idBacsi: item.idBacsi,
        hoTen: item.hoTen,
        hinhAnh: item.hinhAnh ? `data:image/png;base64,${item.hinhAnh.toString('base64')}` : null,
      }));
      res.json(bacsi);
    });
  });

  router.get('/chuyenkhoa', verifyPatient, (req, res) => {
    db.query('SELECT idChuyenkhoa, ten, moTa, hinhAnh FROM ChuyenKhoa LIMIT 12', (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
  
      const chuyenkhoa = results.map(item => ({
        idChuyenkhoa: item.idChuyenkhoa,
        ten: item.ten,
        moTa: item.moTa,
        hinhAnh: item.hinhAnh ? `data:image/png;base64,${item.hinhAnh.toString('base64')}` : null,
      }));
      res.json(chuyenkhoa);
    });
  });
  
  
  // Lấy danh sách tất cả phòng khám
router.get('/phongkham', verifyPatient, (req, res) => {
  db.query(
    `SELECT pk.idPhongkham, pk.ten, pk.diaChi, pk.hinhAnh 
     FROM PhongKham pk 
     WHERE pk.trangThai = 1`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });

      const phongkham = results.map(item => ({
        idPhongkham: item.idPhongkham,
        ten: item.ten,
        diaChi: item.diaChi,
        hinhAnh: item.hinhAnh ? `data:image/png;base64,${item.hinhAnh.toString('base64')}` : null,
      }));
      res.json(phongkham);
    }
  );
});

// Lấy chi tiết phòng khám và danh sách bác sĩ
router.get('/phongkham/:id', verifyPatient, (req, res) => {
  const clinicId = req.params.id;
  
  // Query thông tin phòng khám
  const clinicQuery = `
    SELECT pk.*, ck.ten as tenChuyenKhoa 
    FROM PhongKham pk
    LEFT JOIN ChuyenKhoa ck ON pk.idChuyenkhoa = ck.idChuyenkhoa
    WHERE pk.idPhongkham = ? AND pk.trangThai = 1`;

  // Query danh sách bác sĩ của phòng khám
  const doctorsQuery = `
    SELECT 
      bs.idBacsi, bs.moTa, bs.giaKham,
      nd.hoTen, nd.hinhAnh,
      ck.ten as chuyenKhoa
    FROM BacSi bs
    JOIN NguoiDung nd ON bs.idNguoidung = nd.idNguoidung
    LEFT JOIN ChuyenKhoa ck ON bs.idChuyenkhoa = ck.idChuyenkhoa
    WHERE bs.idPhongkham = ?
    AND nd.idVaiTro = 'bacsi'
    AND nd.isLocked = 0`;

  // Thực hiện query phòng khám
  db.query(clinicQuery, [clinicId], (err, clinicResults) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn phòng khám', error: err });
    if (clinicResults.length === 0) return res.status(404).json({ message: 'Không tìm thấy phòng khám' });

    const clinic = clinicResults[0];
    clinic.hinhAnh = clinic.hinhAnh ? `data:image/png;base64,${clinic.hinhAnh.toString('base64')}` : null;

    // Thực hiện query bác sĩ
    db.query(doctorsQuery, [clinicId], (err, doctorResults) => {
      if (err) return res.status(500).json({ message: 'Lỗi truy vấn danh sách bác sĩ', error: err });

      const doctors = doctorResults.map(doctor => ({
        idBacsi: doctor.idBacsi,
        hoTen: doctor.hoTen,
        moTa: doctor.moTa,
        giaKham: doctor.giaKham,
        chuyenKhoa: doctor.chuyenKhoa,
        hinhAnh: doctor.hinhAnh ? `data:image/png;base64,${doctor.hinhAnh.toString('base64')}` : null
      }));

      res.json({
        clinic: {
          ...clinic,
          doctors
        }
      });
    });
  });
});

const moment = require('moment-timezone');
// Lấy lịch khám của bác sĩ
router.get('/bacsi/:id/lichkham', verifyPatient, (req, res) => {
  const doctorId = req.params.id;
  
  const query = `
    SELECT 
      lt.idLichtrinh,
      lt.ngay,
      lt.caKham,
      lt.trangThai as trangThaiLich,
      ctkg.idKhunggio,
      ctkg.gioKham,
      ctkg.trangThai as trangThaiKhungGio
    FROM LichTrinh lt
    LEFT JOIN ChiTietKhungGio ctkg ON lt.idLichtrinh = ctkg.idLichtrinh
    WHERE lt.idBacsi = ? 
    AND lt.ngay >= CURDATE()
    ORDER BY lt.ngay ASC, ctkg.gioKham ASC`;

  db.query(query, [doctorId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Lỗi truy vấn lịch khám', error: err });

    // Nhóm các khung giờ theo ngày
    const schedule = results.reduce((acc, curr) => {
      const date = moment.utc(curr.ngay).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
      
      if (!acc[date]) {
        acc[date] = {
          idLichtrinh: curr.idLichtrinh,
          ngay: date,
          caKham: curr.caKham,
          trangThai: curr.trangThaiLich,
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

    res.json(Object.values(schedule));
  });
});


// Add new route for booking
router.post('/datlich', verifyPatient, async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ message: 'Token không được cung cấp' });
  }

  const {
    idBacsi,
    idLichtrinh,
    idKhunggio,
    idPhongkham,
    lyDokham,
    tenBenhnhan,
    SDTBenhnhan,
    diaChiBenhnhan,
    ngaySinhBenhnhan,
    gioiTinhBenhnhan,
  } = req.body;
  console.log("idLichtrinh received:", idLichtrinh);
  try {
    // Kiểm tra khung giờ
    const checkSlot = await new Promise((resolve, reject) => {
      db.query(
        'SELECT trangThai FROM ChiTietKhungGio WHERE idKhunggio = ?',
        [idKhunggio],
        (err, results) => {
          if (err) reject(err);
          resolve(results[0]);
        }
      );
    });

    if (!checkSlot || checkSlot.trangThai !== 0) {
      return res.status(400).json({ message: 'Khung giờ đã được đặt' });
    }

    // Tạo lịch hẹn khám
    const appointment = await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO LichHenKham (
          idBacsi, idBenhnhan, idLichtrinh, idKhunggio, idPhongkham,
          thoiGiandatlich, lyDokham, tenBenhnhan, SDTBenhnhan,
          diaChiBenhnhan, ngaySinhBenhnhan, gioiTinhBenhnhan
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
        [
          idBacsi,
          req.user.id, // idBenhnhan lấy từ token đã xác thực
          idLichtrinh,
          idKhunggio,
          idPhongkham,
          lyDokham,
          tenBenhnhan,
          SDTBenhnhan,
          diaChiBenhnhan,
          ngaySinhBenhnhan,
          gioiTinhBenhnhan,
        ],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });

    // Kiểm tra nếu tạo lịch hẹn thất bại
    if (!appointment.insertId) {
      return res.status(500).json({ message: 'Không thể tạo lịch hẹn' });
    }

    // Cập nhật trạng thái khung giờ
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE ChiTietKhungGio SET trangThai = 1 WHERE idKhunggio = ?',
        [idKhunggio],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });

    res.status(201).json({ message: 'Đặt lịch thành công', idLichhen: appointment.insertId });
  } catch (error) {
    console.error('Error during booking:', error);
    res.status(500).json({ message: 'Lỗi khi đặt lịch', error });
  }
});

//booking
// Get list of departments
router.get('/chuyenkhoa', verifyPatient, (req, res) => {
  db.query(
    'SELECT idChuyenkhoa, ten FROM ChuyenKhoa',
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error', error: err });
      res.json(results);
    }
  );
});

// Get doctors by department
router.get('/bacsi/chuyenkhoa/:id', verifyPatient, (req, res) => {
  const deptId = req.params.id;
  db.query(
    `SELECT bs.idBacsi, bs.giaKham, bs.idPhongkham, nd.hoTen, ck.ten as chuyenKhoa
     FROM BacSi bs
     JOIN NguoiDung nd ON bs.idNguoidung = nd.idNguoidung
     JOIN ChuyenKhoa ck ON bs.idChuyenkhoa = ck.idChuyenkhoa
     WHERE bs.idChuyenkhoa = ? AND nd.idVaiTro = 'bacsi' AND nd.isLocked = 0`,
    [deptId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error', error: err });
      res.json(results);
    }
  );
});

// Get doctor's schedule
router.get('/bacsi/:id/lichkham', verifyPatient, (req, res) => {
  const doctorId = req.params.id;
  const today = moment().format('YYYY-MM-DD');
  
  db.query(
    `SELECT lt.idLichtrinh, lt.ngay, lt.caKham, lt.trangThai as trangThaiLich,
     kg.idKhunggio, kg.gioKham, kg.trangThai as trangThaiKhungGio
     FROM LichTrinh lt
     LEFT JOIN ChiTietKhungGio kg ON lt.idLichtrinh = kg.idLichtrinh
     WHERE lt.idBacsi = ? AND lt.ngay >= ? AND lt.trangThai = 1
     ORDER BY lt.ngay, kg.gioKham`,
    [doctorId, today],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error', error: err });
      
      const schedules = results.reduce((acc, curr) => {
        const date = curr.ngay;
        if (!acc[date]) {
          acc[date] = {
            idLichtrinh: curr.idLichtrinh,
            ngay: date,
            caKham: curr.caKham,
            trangThaiLich: curr.trangThaiLich,
            khungGio: []
          };
        }
        if (curr.idKhunggio && curr.trangThaiKhungGio === 0) {
          acc[date].khungGio.push({
            idKhunggio: curr.idKhunggio,
            gioKham: curr.gioKham,
            trangThai: curr.trangThaiKhungGio
          });
        }
        return acc;
      }, {});
      
      res.json(Object.values(schedules));
    }
  );
});

// Book appointment
router.post('/datlich', verifyPatient, async (req, res) => {
  const {
    idBacsi, idLichtrinh, idKhunggio, idPhongkham,
    lyDokham, tenBenhnhan, SDTBenhnhan, diaChiBenhnhan,
    ngaySinhBenhnhan, gioiTinhBenhnhan
  } = req.body;

  const conn = await db.promise().getConnection();
  
  try {
    await conn.beginTransaction();

    // Verify time slot availability
    const [slots] = await conn.query(
      'SELECT trangThai FROM ChiTietKhungGio WHERE idKhunggio = ? FOR UPDATE',
      [idKhunggio]
    );

    if (!slots.length || slots[0].trangThai !== 0) {
      throw new Error('Khung giờ không còn trống');
    }

    // Create appointment
    const [result] = await conn.query(
      `INSERT INTO LichHenKham (
        idBacsi, idBenhnhan, idLichtrinh, idKhunggio, idPhongkham,
        thoiGiandatlich, lyDokham, tenBenhnhan, SDTBenhnhan,
        diaChiBenhnhan, ngaySinhBenhnhan, gioiTinhBenhnhan, trangThai
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, 0)`,
      [
        idBacsi, req.user.id, idLichtrinh, idKhunggio, idPhongkham,
        lyDokham, tenBenhnhan, SDTBenhnhan, diaChiBenhnhan,
        ngaySinhBenhnhan, gioiTinhBenhnhan
      ]
    );

    // Update time slot status
    await conn.query(
      'UPDATE ChiTietKhungGio SET trangThai = 1 WHERE idKhunggio = ?',
      [idKhunggio]
    );

    await conn.commit();
    res.status(201).json({
      message: 'Đặt lịch thành công',
      idLichhen: result.insertId
    });

  } catch (error) {
    await conn.rollback();
    res.status(400).json({
      message: error.message || 'Lỗi khi đặt lịch',
      error: error
    });
  } finally {
    conn.release();
  }
});


// Lấy lịch sử đặt lịch khám
router.get('/lichhen', verifyPatient, (req, res) => {
  const userId = req.user.id;
  
  const query = `
    SELECT 
      lhk.idLichhen,
      lhk.thoiGiandatlich,
      lhk.lyDokham,
      lhk.trangThai,
      lt.ngay,
      ctkg.gioKham,
      bs.giaKham,
      nd_bs.hoTen as tenBacsi,
      ck.ten as chuyenKhoa,
      pk.ten as tenPhongKham,
      pk.diaChi as diaChiPhongKham
    FROM LichHenKham lhk
    JOIN LichTrinh lt ON lhk.idLichtrinh = lt.idLichtrinh
    JOIN ChiTietKhungGio ctkg ON lhk.idKhunggio = ctkg.idKhunggio
    JOIN BacSi bs ON lhk.idBacsi = bs.idBacsi
    JOIN NguoiDung nd_bs ON bs.idNguoidung = nd_bs.idNguoidung
    JOIN ChuyenKhoa ck ON bs.idChuyenkhoa = ck.idChuyenkhoa
    JOIN PhongKham pk ON lhk.idPhongkham = pk.idPhongkham
    WHERE lhk.idBenhnhan = ?
    ORDER BY lt.ngay DESC, ctkg.gioKham DESC`;

  db.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
    }
    res.json(results);
  });
});

// Lấy lịch sử khám bệnh
router.get('/lichsukham', verifyPatient, (req, res) => {
  const userId = req.user.id;
  
  const query = `
    SELECT 
      lsk.idLichsukham,
      lhk.thoiGiandatlich,
      lhk.lyDokham,
      lt.ngay,
      ctkg.gioKham,
      nd_bs.hoTen as tenBacsi,
      ck.ten as chuyenKhoa,
      pk.ten as tenPhongKham
    FROM LichSuKhamBenh lsk
    JOIN LichHenKham lhk ON lsk.idLichhen = lhk.idLichhen
    JOIN LichTrinh lt ON lhk.idLichtrinh = lt.idLichtrinh
    JOIN ChiTietKhungGio ctkg ON lhk.idKhunggio = ctkg.idKhunggio
    JOIN BacSi bs ON lhk.idBacsi = bs.idBacsi
    JOIN NguoiDung nd_bs ON bs.idNguoidung = nd_bs.idNguoidung
    JOIN ChuyenKhoa ck ON bs.idChuyenkhoa = ck.idChuyenkhoa
    JOIN PhongKham pk ON lhk.idPhongkham = pk.idPhongkham
    WHERE lhk.idBenhnhan = ?
    ORDER BY lt.ngay DESC, ctkg.gioKham DESC`;

  db.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Lỗi truy vấn cơ sở dữ liệu', error: err });
    }
    res.json(results);
  });
});

module.exports = router;
