const express = require('express');
const { register, login, createUser, getAllUsers, deleteUser } = require('../controllers/authController');
const { authenticate, superadminOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Superadmin user management routes
router.post('/users', authenticate, superadminOnly, createUser);
router.get('/users', authenticate, superadminOnly, getAllUsers);
router.delete('/users/:id', authenticate, superadminOnly, deleteUser);

module.exports = router;

