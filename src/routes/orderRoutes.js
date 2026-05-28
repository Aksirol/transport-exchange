const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

// Всі маршрути заявок вимагають авторизації
router.use(verifyToken);

// Маршрути для всіх авторизованих користувачів
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);

// Маршрути тільки для Замовників (customer)
router.post('/', checkRole(['customer']), orderController.createOrder);
router.get('/my/list', checkRole(['customer']), orderController.getMyOrders); // Змінено шлях для уникнення конфлікту з :id
router.put('/:id', checkRole(['customer']), orderController.updateOrder);
router.delete('/:id', checkRole(['customer']), orderController.cancelOrder);

module.exports = router;