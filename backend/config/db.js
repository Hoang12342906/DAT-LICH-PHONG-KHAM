const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // Mật khẩu của bạn, nếu có
  database: 'datlichkham'
});

connection.connect((err) => {
  if (err) {
    console.error('Lỗi kết nối cơ sở dữ liệu: ', err);
  } else {
    console.log('Đã kết nối đến cơ sở dữ liệu MySQL');
  }
});

module.exports = connection;
