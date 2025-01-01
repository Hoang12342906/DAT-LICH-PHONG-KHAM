const User = require('../models/user.model');

exports.getAllUsers = (req, res) => {
  User.getAllUsers((err, data) => {
    if (err) {
      res.status(500).send({ message: 'Error retrieving users' });
    } else {
      res.send(data);
    }
  });
};

exports.createUser = (req, res) => {
  const newUser = req.body;

  User.createUser(newUser, (err, data) => {
    if (err) {
      res.status(500).send({ message: 'Error creating user' });
    } else {
      res.send({ message: 'User created successfully!', userId: data.insertId });
    }
  });
};
