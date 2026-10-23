const router = require('express').Router();
const controller = require('../controllers/installmentsPaymentController');
const protect = require('../middleware/authMiddleware');
const { requireModule } = require('../middleware/moduleMiddleware');
const { requirePermission, requireAllPermissions } = require('../middleware/permissionMiddleware');
const { MODULE_KEYS } = require('../utils/moduleConfig');

router.use(protect, requireModule(MODULE_KEYS.INSTALLMENTS));
router.get('/accounts', requirePermission('installments.payments.receive', 'installments.payments.pay_supplier', 'installments.payments.return_savings'), controller.accounts);
router.get('/lookups', requirePermission('installments.payments.receive', 'installments.payments.pay_supplier', 'installments.payments.return_savings'), controller.lookups);
router.get('/next-reference', requirePermission('installments.payments.receive', 'installments.payments.pay_supplier', 'installments.payments.return_savings'), controller.nextReference);
router.get('/members/:memberId/context', requirePermission('installments.payments.view_balances'), controller.memberContext);
router.get('/suppliers/:supplierId/context', requirePermission('installments.payments.view_balances'), controller.supplierContext);
router.post('/receive', requirePermission('installments.payments.receive'), controller.receive);
router.post('/pay-bill', requirePermission('installments.payments.pay_supplier'), controller.paySupplier);
router.post('/savings-payout', requirePermission('installments.payments.return_savings'), controller.payout);
router.get('/collections', requirePermission('installments.payments.view_collections'), controller.collections);
router.post('/collections/:transactionId/correct', requireAllPermissions('installments.payments.receive', 'installments.payments.reverse'), controller.correctCollection);
router.get('/dashboard', requirePermission('installments.payments.view_collections', 'installments.reports.profit', 'installments.reports.receivables'), controller.dashboard);
router.get('/history', requirePermission('installments.payments.view_history'), controller.history);
router.get('/:transactionId/document', requirePermission('installments.payments.print'), controller.document);
router.get('/:transactionId', requirePermission('installments.payments.view_history'), controller.detail);
router.post('/:transactionId/reverse', requirePermission('installments.payments.reverse'), controller.reverse);

module.exports = router;
