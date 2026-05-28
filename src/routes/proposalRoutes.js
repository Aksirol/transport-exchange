const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

router.use(verifyToken);

// Для Перевізника
router.post('/', checkRole(['carrier']), proposalController.createProposal);
router.get('/my', checkRole(['carrier']), proposalController.getMyProposals);

// Для Замовника
router.put('/:id/accept', checkRole(['customer']), proposalController.acceptProposal);
router.put('/:id/reject', checkRole(['customer']), proposalController.rejectProposal);

module.exports = router;