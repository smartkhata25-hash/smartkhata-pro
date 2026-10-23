const express = require('express');
const controller = require('../controllers/installmentsMemberController');
const protect = require('../middleware/authMiddleware');
const { requireModule } = require('../middleware/moduleMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { MODULE_KEYS } = require('../utils/moduleConfig');

const router = express.Router();
router.use(protect, requireModule(MODULE_KEYS.INSTALLMENTS));

router.post('/schedule-preview', requirePermission('installments.committees.create', 'installments.committees.edit', 'installments.committees.manage'), controller.previewSchedule);
router.get('/next-number', requirePermission('installments.members.create'), controller.getNextNumber);
router.get('/', requirePermission('installments.members.view'), controller.listMembers);
router.post('/quick', requirePermission('installments.members.create'), controller.quickCreateMember);
router.post('/', requirePermission('installments.members.create'), controller.createMember);
router.get('/:memberId', requirePermission('installments.members.view'), controller.getMember);
router.put('/:memberId', requirePermission('installments.members.edit'), controller.updateMember);
router.get('/:memberId/ledger', requirePermission('installments.members.view_ledger'), controller.getLedger);
router.get('/:memberId/financial-summary', requirePermission('installments.members.delete'), controller.getFinancialSummary);
router.put('/:memberId/opening-balance', requirePermission('installments.opening_balances.manage'), controller.updateOpeningBalance);
router.delete('/:memberId', requirePermission('installments.members.delete'), controller.archiveMember);
router.post('/:memberId/restore', requirePermission('installments.members.restore'), controller.restoreMember);
router.get('/:memberId/committees', requirePermission('installments.members.view'), controller.listCommittees);
router.post('/:memberId/committees', requirePermission('installments.committees.create', 'installments.committees.manage'), controller.createCommittee);
router.put('/:memberId/committees/:committeeId', requirePermission('installments.committees.edit', 'installments.committees.manage'), controller.updateCommittee);

module.exports = router;

