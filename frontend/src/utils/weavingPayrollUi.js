export const getPayrollActionState = ({ payroll = {}, recordState = 'active', permissions = {}, isEarlyClosed = false }) => {
  const status = payroll.status || 'draft';
  const active = recordState === 'active' && status !== 'void' && payroll.isDeleted !== true;
  const posted = ['posted', 'finalized', 'partially_paid', 'paid'].includes(status);
  return {
    canAdjust: active && permissions.canEdit && !payroll.isFinalSettlement && ((status === 'draft' && !isEarlyClosed) || posted),
    canPay: active && permissions.canPay && posted && status !== 'paid' && Number(payroll.remainingDue || 0) > 0,
    canVoid: active && permissions.canDelete && posted,
    canRestore: recordState === 'inactive' && permissions.canEdit,
    canFinalPay: active && permissions.canEdit && status === 'draft',
  };
};

export const getSimplePayrollStatus = (payroll = {}) => {
  if (payroll.status === 'void' || payroll.isDeleted) return 'Void';
  if (payroll.status === 'draft') return 'Ready for Review';
  if (Number(payroll.remainingDue || 0) < 0) return 'Employee Receivable';
  if (payroll.status === 'paid' || Number(payroll.remainingDue || 0) === 0) return 'Paid';
  if (payroll.status === 'partially_paid' || Number(payroll.paidAmount || 0) > 0) return 'Partially Paid';
  return Array.isArray(payroll.revisionHistory) && payroll.revisionHistory.length ? 'Finalized · Revised' : 'Finalized';
};

export const invalidatePayrollReview = (nextForm) => ({
  form: nextForm,
  precheck: null,
});
