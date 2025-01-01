const connection = require('../config/db');

const User = {
  getAllUsers: (callback) => {
    const query = 'SELECT * FROM users';
    connection.query(query, (error, results) => {
      if (error) {
        callback(error, null);
        return;
      }
      callback(null, results);
    });
  },

  createUser: (userData, callback) => {
    const query = 'INSERT INTO users SET ?';
    connection.query(query, userData, (error, results) => {
      if (error) {
        callback(error, null);
        return;
      }
      callback(null, results);
    });
  }
};

module.exports = User;
