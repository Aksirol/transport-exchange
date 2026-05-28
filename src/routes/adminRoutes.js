const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

// Усі маршрути в цьому файлі вимагають токена та ролі 'admin'
router.use(verifyToken, checkRole(['admin']));

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getAllUsers);
router.delete('/users/:id', adminController.deleteUser);
router.get('/orders', adminController.getAllOrders);

module.exports = router;