import { useCallback, useRef, useState } from 'react';

import { deleteInvoice } from '../services/salesService';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { deleteRefund } from '../services/refundService';
import { deletePurchaseReturn } from '../services/purchaseReturnService';
import { deleteReceivePayment } from '../services/receivePaymentService';
import { deletePayBill } from '../services/payBillService';
import { hasPermission } from '../utils/permissionHelper';
import { resolveTradingLedgerDeleteTarget } from '../utils/tradingLedgerDeleteResolver';

const errorMessage = (error) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.response?.data?.detail ||
  error?.message ||
  'Delete failed';

const executeDelete = (target, token) => {
  switch (target.action) {
    case 'saleInvoice':
      return deleteInvoice(target.id, token);
    case 'purchaseInvoice':
      return purchaseInvoiceService.deletePurchaseInvoice(target.id);
    case 'refund':
      return deleteRefund(target.id, token);
    case 'purchaseReturn':
      return deletePurchaseReturn(target.id, token);
    case 'receivePayment':
      return deleteReceivePayment(target.id);
    case 'payBill':
      return deletePayBill(target.id);
    default:
      throw new Error('Unsupported Trading ledger record');
  }
};

const useTradingLedgerDelete = ({ enabled = true, onDeleted } = {}) => {
  const token = localStorage.getItem('token');
  const inFlightRef = useRef('');
  const [deletingKey, setDeletingKey] = useState('');
  const [deletingEntryId, setDeletingEntryId] = useState('');

  const resolveTarget = useCallback(
    (entry) => (enabled ? resolveTradingLedgerDeleteTarget(entry, hasPermission) : null),
    [enabled]
  );

  const canDeleteEntry = useCallback((entry) => Boolean(resolveTarget(entry)), [resolveTarget]);

  const deleteEntry = useCallback(
    async (entry) => {
      const target = resolveTarget(entry);
      if (!target || inFlightRef.current) return false;

      const reference = target.billNo ? ` #${target.billNo}` : '';
      if (!window.confirm(`Delete ${target.label}${reference}?`)) return false;

      inFlightRef.current = target.key;
      setDeletingKey(target.key);
      setDeletingEntryId(String(entry?._id || ''));
      try {
        await executeDelete(target, token);
        await onDeleted?.(target, entry);
        return true;
      } catch (error) {
        alert(errorMessage(error));
        return false;
      } finally {
        inFlightRef.current = '';
        setDeletingKey('');
        setDeletingEntryId('');
      }
    },
    [onDeleted, resolveTarget, token]
  );

  return { canDeleteEntry, deleteEntry, deletingEntryId, deletingKey, resolveTarget };
};

export default useTradingLedgerDelete;
