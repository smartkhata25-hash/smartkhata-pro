const express = require('express');
const controller = require('../controllers/installmentsCommitteeController');
const protect = require('../middleware/authMiddleware');
const { requireModule } = require('../middleware/moduleMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { MODULE_KEYS } = require('../utils/moduleConfig');

const router = express.Router();
router.use(protect, requireModule(MODULE_KEYS.INSTALLMENTS));

router.get('/', requirePermission('installments.committees.view', 'installments.committees.manage'), controller.list);
router.get('/:committeeId', requirePermission('installments.committees.view', 'installments.committees.schedule.view', 'installments.committees.manage'), controller.detail);
router.post('/:committeeId/close-early', requirePermission('installments.committees.edit', 'installments.committees.manage'), controller.closeEarly);
router.delete('/:committeeId', requirePermission('installments.committees.archive', 'installments.committees.manage'), controller.archive);
router.post('/:committeeId/restore', requirePermission('installments.committees.restore', 'installments.committees.manage'), controller.restore);

module.exports = router;
