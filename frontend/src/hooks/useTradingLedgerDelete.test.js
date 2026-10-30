import { act, renderHook } from '@testing-library/react';

import useTradingLedgerDelete from './useTradingLedgerDelete';
import { deleteInvoice } from '../services/salesService';
import { hasPermission } from '../utils/permissionHelper';

jest.mock('../services/salesService', () => ({ deleteInvoice: jest.fn() }));
jest.mock('../services/purchaseInvoiceService', () => ({
  __esModule: true,
  default: { deletePurchaseInvoice: jest.fn() },
}));
jest.mock('../services/refundService', () => ({ deleteRefund: jest.fn() }));
jest.mock('../services/purchaseReturnService', () => ({ deletePurchaseReturn: jest.fn() }));
jest.mock('../services/receivePaymentService', () => ({ deleteReceivePayment: jest.fn() }));
jest.mock('../services/payBillService', () => ({ deletePayBill: jest.fn() }));
jest.mock('../utils/permissionHelper', () => ({ hasPermission: jest.fn() }));

const entry = {
  _id: '64a000000000000000000001',
  sourceType: 'sale_invoice',
  invoiceId: '64a000000000000000000002',
  billNo: '1005',
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  hasPermission.mockReturnValue(true);
  deleteInvoice.mockReset();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('confirmation cancellation sends no delete request', async () => {
  window.confirm.mockReturnValue(false);
  const { result } = renderHook(() => useTradingLedgerDelete());

  await act(async () => {
    expect(await result.current.deleteEntry(entry)).toBe(false);
  });

  expect(deleteInvoice).not.toHaveBeenCalled();
});

test('double click sends one parent invoice delete and refreshes once', async () => {
  let finishDelete;
  deleteInvoice.mockReturnValue(new Promise((resolve) => { finishDelete = resolve; }));
  const onDeleted = jest.fn();
  const { result } = renderHook(() => useTradingLedgerDelete({ onDeleted }));

  let first;
  let second;
  await act(async () => {
    first = result.current.deleteEntry(entry);
    second = result.current.deleteEntry(entry);
    finishDelete({});
    await Promise.all([first, second]);
  });

  expect(deleteInvoice).toHaveBeenCalledTimes(1);
  expect(deleteInvoice).toHaveBeenCalledWith(entry.invoiceId, 'test-token');
  expect(onDeleted).toHaveBeenCalledTimes(1);
});

test('backend failure is displayed and does not refresh/remove ledger state', async () => {
  deleteInvoice.mockRejectedValue({ response: { data: { message: 'Linked stock prevents deletion' } } });
  const onDeleted = jest.fn();
  const { result } = renderHook(() => useTradingLedgerDelete({ onDeleted }));

  await act(async () => {
    expect(await result.current.deleteEntry(entry)).toBe(false);
  });

  expect(window.alert).toHaveBeenCalledWith('Linked stock prevents deletion');
  expect(onDeleted).not.toHaveBeenCalled();
});

test('disabled Travel context and missing permission expose no delete action', () => {
  const disabled = renderHook(() => useTradingLedgerDelete({ enabled: false }));
  expect(disabled.result.current.canDeleteEntry(entry)).toBe(false);
  disabled.unmount();

  hasPermission.mockReturnValue(false);
  const unauthorized = renderHook(() => useTradingLedgerDelete());
  expect(unauthorized.result.current.canDeleteEntry(entry)).toBe(false);
});
