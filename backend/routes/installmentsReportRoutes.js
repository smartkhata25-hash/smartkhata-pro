const router = require('express').Router();
const controller = require('../controllers/installmentsReportController');
const protect = require('../middleware/authMiddleware');
const { requireModule } = require('../middleware/moduleMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { MODULE_KEYS } = require('../utils/moduleConfig');

router.use(protect, requireModule(MODULE_KEYS.INSTALLMENTS));
router.get('/lookups', requirePermission('installments.reports.profit', 'installments.reports.collections', 'installments.reports.expenses', 'installments.reports.receivables'), controller.lookups);
router.get('/profit', requirePermission('installments.reports.profit'), controller.profit);
router.get('/collections', requirePermission('installments.reports.collections'), controller.collections);
router.get('/expenses', requirePermission('installments.reports.expenses'), controller.expenses);
router.get('/balances', requirePermission('installments.reports.receivables'), controller.balances);
router.get('/savings', requirePermission('installments.reports.receivables'), controller.savings);

module.exports = router;
