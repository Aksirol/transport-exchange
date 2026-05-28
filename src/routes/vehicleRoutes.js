const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

router.use(verifyToken, checkRole(['carrier']));

router.post('/', vehicleController.addVehicle);
router.get('/my', vehicleController.getMyVehicles);
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;