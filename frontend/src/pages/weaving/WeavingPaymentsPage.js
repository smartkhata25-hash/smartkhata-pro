import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaHistory, FaMoneyBillWave, FaReceipt, FaWallet } from 'react-icons/fa';
import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeavingRecordDetailModal from '../../components/weaving/WeavingRecordDetailModal';
import { useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';
import {
  createCounterparty,
  createMoneyTransaction,
  getCommercialMeta,
  getCounterpartyBalance,
  getPaymentById,
  listPayments,
} from '../../services/weavingCommercialService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';

const input =
  'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const requestKey = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const fresh = (type, no = '') => ({
  type,
  requestKey: requestKey(),
  transactionNo: no,
  date: getBusinessDateInputValue(),
  partyId: '',
  purchaseInvoiceId: '',
  salesInvoiceId: '',
  amount: '',
  paymentAccountId: '',
  paymentMethod: 'cash',
  description: '',
});
const money = (value) => Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const Field = ({ label, children, className = '' }) => (
  <label className={`text-sm font-medium text-slate-700 ${className}`}>
    {label}
    {children}
  </label>
);

export default function WeavingPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = ['receive', 'pay', 'history'].includes(params.get('tab'))
    ? params.get('tab')
    : 'receive';
  const [tab, setTab] = useState(requestedTab);
  const [meta, setMeta] = useState({
    parties: [],
    paymentAccounts: [],
    openPurchases: [],
    openSales: [],
  });
  const [form, setForm] = useState(fresh('receive'));
  const [balance, setBalance] = useState(0);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  useWeavingFeedback(notice, setNotice);
  const [transactionDetail, setTransactionDetail] = useState(null);
  const load = async () => {
    try {
      const [options, history] = await Promise.all([
        getCommercialMeta({ force: true }),
        listPayments(),
      ]);
      setMeta(options);
      setRows(history);
      setForm((value) => ({
        ...value,
        transactionNo:
          value.transactionNo ||
          (tab === 'receive' ? options.nextReceiptNo : options.nextPaymentNo),
      }));
    } catch (error) {
      setNotice({ error: true, text: error.response?.data?.message || 'Could not load payments' });
    }
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (requestedTab !== tab) setTab(requestedTab);
  }, [requestedTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'history') {
      setForm(fresh(tab, tab === 'receive' ? meta.nextReceiptNo : meta.nextPaymentNo));
      setBalance(0);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const transactionId = params.get('transactionId');
    if (!transactionId) {
      setTransactionDetail(null);
      return;
    }
    getPaymentById(transactionId)
      .then(setTransactionDetail)
      .catch((error) =>
        setNotice({
          error: true,
          text:
            error.response?.status === 404
              ? 'Source record is no longer available.'
              : error.response?.data?.message || 'Could not load payment transaction',
        })
      );
  }, [params]);
  const closeTransactionDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('transactionId');
    setParams(next, { replace: true });
    setTransactionDetail(null);
  };
  const parties = useMemo(
    () =>
      meta.parties.filter(
        (party) =>
          party.role === 'both' || party.role === (tab === 'receive' ? 'customer' : 'supplier')
      ),
    [meta.parties, tab]
  );
  const chooseParty = async (partyId) => {
    setForm((value) => ({ ...value, partyId, purchaseInvoiceId: '', salesInvoiceId: '' }));
    setBalance(partyId ? (await getCounterpartyBalance(partyId)).balance : 0);
  };
  const chooseInvoice = async (invoiceId) => {
    const list = tab === 'receive' ? meta.openSales : meta.openPurchases;
    const invoice = list.find((row) => row._id === invoiceId);
    if (!invoice) {
      setForm((value) => ({ ...value, purchaseInvoiceId: '', salesInvoiceId: '' }));
      return;
    }
    const partyId = String(invoice.partyId);
    setForm((value) => ({
      ...value,
      partyId,
      purchaseInvoiceId: tab === 'pay' ? invoiceId : '',
      salesInvoiceId: tab === 'receive' ? invoiceId : '',
      amount: invoice.balanceDue,
      description: `${tab === 'receive' ? 'Receipt against' : 'Payment against'} ${invoice.invoiceNo || invoice.purchaseNo}`,
    }));
    setBalance((await getCounterpartyBalance(partyId)).balance);
  };
  const quickParty = async (name) => {
    const party = await createCounterparty({
      name,
      role: tab === 'receive' ? 'customer' : 'supplier',
    });
    setMeta((value) => ({ ...value, parties: [...value.parties, party] }));
    await chooseParty(party._id);
  };
  const save = async () => {
    setSaving(true);
    try {
      await createMoneyTransaction(form);
      setNotice({
        text: tab === 'receive' ? 'Receipt posted successfully' : 'Payment posted successfully',
      });
      await load();
      setForm(fresh(tab, tab === 'receive' ? meta.nextReceiptNo : meta.nextPaymentNo));
      setBalance(0);
    } catch (error) {
      setNotice({ error: true, text: error.response?.data?.message || 'Could not post payment' });
    } finally {
      setSaving(false);
    }
  };
  const linkedInvoices = tab === 'receive' ? meta.openSales : meta.openPurchases;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-emerald-50/50 p-3 sm:p-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <FaWallet className="text-emerald-600" />
            Payments
          </h1>
        </header>
        <div className="flex rounded-md border bg-white p-1">
          {[
            ['receive', 'Receive Payment', FaReceipt],
            ['pay', 'Pay Bill', FaMoneyBillWave],
            ['history', 'History', FaHistory],
          ].map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setParams({ tab: value });
                setTab(value);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold ${tab === value ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        {tab !== 'history' && (
          <section className="rounded-md border bg-white shadow-sm">
            <div className="border-b bg-emerald-50 px-4 py-3 font-bold text-emerald-900">
              {tab === 'receive' ? 'Receive Payment' : 'Pay Bill'}
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={tab === 'receive' ? 'Receipt No.' : 'Payment No.'}>
                <input
                  className={input}
                  value={form.transactionNo}
                  onChange={(event) => setForm({ ...form, transactionNo: event.target.value })}
                />
              </Field>
              <Field label="Date *">
                <input
                  type="date"
                  className={input}
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </Field>
              <Field
                label={tab === 'receive' ? 'Sales Invoice' : 'Purchase Invoice'}
                className="lg:col-span-2"
              >
                <select
                  className={input}
                  value={tab === 'receive' ? form.salesInvoiceId : form.purchaseInvoiceId}
                  onChange={(event) => chooseInvoice(event.target.value)}
                >
                  <option value="">General payment on account</option>
                  {linkedInvoices.map((invoice) => (
                    <option key={invoice._id} value={invoice._id}>
                      {invoice.invoiceNo || invoice.purchaseNo} - {invoice.partyName} - Rs.{' '}
                      {money(invoice.balanceDue)}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <SearchableCreatableSelect
                  label={tab === 'receive' ? 'Customer / Party' : 'Supplier / Party'}
                  placeholder="Search or add counterparty"
                  options={parties}
                  value={form.partyId}
                  required
                  onChange={chooseParty}
                  onQuickAdd={quickParty}
                  onAddDetails={quickParty}
                />
              </div>
              <div
                className={`rounded-md p-3 ${balance >= 0 ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}
              >
                <div className="text-xs">Current {balance >= 0 ? 'Receivable' : 'Payable'}</div>
                <div className="text-lg font-bold">Rs. {money(Math.abs(balance))}</div>
              </div>
              <Field label="Amount *">
                <input
                  type="number"
                  min="0"
                  className={input}
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </Field>
              <Field label="Payment Account *">
                <select
                  className={input}
                  value={form.paymentAccountId}
                  onChange={(event) => setForm({ ...form, paymentAccountId: event.target.value })}
                >
                  <option value="">Select Cash / Bank</option>
                  {meta.paymentAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment Method">
                <select
                  className={input}
                  value={form.paymentMethod}
                  onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="online">Online</option>
                  <option value="cheque">Cheque</option>
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2 lg:col-span-4">
                <textarea
                  className={`${input} h-20 py-2`}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <button
                  type="button"
                  onClick={() => setForm(fresh(tab))}
                  className="rounded-md border px-4 py-2"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="rounded-md bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Posting...' : 'Post Payment'}
                </button>
              </div>
            </div>
          </section>
        )}
        {tab === 'history' && (
          <section className="overflow-hidden rounded-md border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-emerald-50 text-left text-xs uppercase">
                  <tr>
                    {[
                      'No.',
                      'Date',
                      'Type',
                      'Counterparty',
                      'Invoice',
                      'Amount',
                      'Account',
                      'Method',
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id} className="border-t">
                      <td className="px-4 py-3 font-semibold">{row.transactionNo}</td>
                      <td className="px-4 py-3">{row.date}</td>
                      <td className="px-4 py-3 capitalize">{row.type}</td>
                      <td className="px-4 py-3">{row.partyId?.name}</td>
                      <td className="px-4 py-3">
                        {row.salesInvoiceId || row.purchaseInvoiceId ? 'Linked' : 'On account'}
                      </td>
                      <td className="px-4 py-3 font-semibold">Rs. {money(row.amount)}</td>
                      <td className="px-4 py-3">{row.paymentAccountId?.name}</td>
                      <td className="px-4 py-3 capitalize">{row.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {transactionDetail && (
          <WeavingRecordDetailModal
            title={`${transactionDetail.type === 'receive' ? 'Receipt' : 'Payment'} ${transactionDetail.transactionNo}`}
            fields={[
              ['Date', transactionDetail.date],
              ['Type', transactionDetail.type],
              ['Party', transactionDetail.partyId?.name],
              ['Amount', `Rs. ${money(transactionDetail.amount)}`],
              ['Payment Account', transactionDetail.paymentAccountId?.name],
              ['Method', transactionDetail.paymentMethod],
              ['Linked Purchase', transactionDetail.purchaseInvoiceId?.purchaseNo],
              ['Linked Sales Invoice', transactionDetail.salesInvoiceId?.invoiceNo],
              ['Linked Sizing Bill', transactionDetail.sizingBillId?.billNo],
              ['Cheque Number', transactionDetail.chequeNo],
              ['Cheque Bank', transactionDetail.chequeBank],
              ['Cheque Date', transactionDetail.chequeDate],
              ['Cheque Due Date', transactionDetail.chequeDueDate],
              ['Cheque Status', transactionDetail.chequeStatus],
              ['Description', transactionDetail.description],
              ['Status', transactionDetail.status],
              [
                'Attachments',
                (transactionDetail.attachments || []).map((item) => item.originalName).join(', '),
              ],
            ]}
            onClose={closeTransactionDetail}
          />
        )}
      </div>
    </div>
  );
}
