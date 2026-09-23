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
  updateMoneyTransaction,
  voidMoneyTransaction,
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
  chequeNo: '',
  chequeBank: '',
  chequeDate: '',
  description: '',
});

const money = (value) =>
  Number(value || 0).toLocaleString('en-PK', {
    maximumFractionDigits: 2,
  });
const dateRange = (preset, from, to) => {
  const now = new Date(); const day = (value) => value.toISOString().slice(0, 10); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'custom') return { from, to };
  if (preset === 'today') return { from: day(now), to: day(now) };
  if (preset === 'yesterday') { const value = new Date(start.getTime() - 86400000); return { from: day(value), to: day(value) }; }
  if (preset === 'thisWeek') { const value = new Date(start); value.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return { from: day(value), to: day(now) }; }
  if (preset === 'lastWeek') { const end = new Date(start); end.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 1); const begin = new Date(end); begin.setDate(end.getDate() - 6); return { from: day(begin), to: day(end) }; }
  if (preset === 'thisMonth') return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now) };
  if (preset === 'lastMonth') return { from: day(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: day(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (preset === 'thisYear') return { from: `${now.getFullYear()}-01-01`, to: day(now) };
  if (preset === 'lastYear') return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  return {};
};

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
  const historyType = ['receive', 'pay'].includes(params.get('type')) ? params.get('type') : '';

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
  const [editingId, setEditingId] = useState('');
  const [filters, setFilters] = useState({ search: '', date: 'all', from: '', to: '', paymentMethod: '', paymentAccountId: '' });
  const [notice, setNotice] = useState(null);

  useWeavingFeedback(notice, setNotice);

  const [transactionDetail, setTransactionDetail] = useState(null);
  const historyRows = historyType ? rows.filter((row) => row.type === historyType) : rows;

  const load = async () => {
    try {
      const [options, history] = await Promise.all([
        getCommercialMeta({ force: true }),
        listPayments(tab === 'history' ? { type: historyType || undefined, search: filters.search || undefined, paymentMethod: filters.paymentMethod || undefined, paymentAccountId: filters.paymentAccountId || undefined, ...dateRange(filters.date, filters.from, filters.to) } : {}),
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
      setNotice({
        error: true,
        text: error.response?.data?.message || 'Could not load payments',
      });
    }
  };

  useEffect(() => {
    load();
  }, [tab, historyType, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (requestedTab !== tab) {
      setTab(requestedTab);
    }
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

    setParams(next, {
      replace: true,
    });

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
    setForm((value) => ({
      ...value,
      partyId,
      purchaseInvoiceId: '',
      salesInvoiceId: '',
    }));

    setBalance(partyId ? (await getCounterpartyBalance(partyId)).balance : 0);
  };

  const quickParty = async (name) => {
    const party = await createCounterparty({
      name,
      role: tab === 'receive' ? 'customer' : 'supplier',
    });

    setMeta((value) => ({
      ...value,
      parties: [...value.parties, party],
    }));

    await chooseParty(party._id);
  };

  const save = async () => {
    setSaving(true);

    try {
      await (editingId ? updateMoneyTransaction(editingId, form) : createMoneyTransaction(form));

      setNotice({
        text: tab === 'receive' ? 'Receipt posted successfully' : 'Payment posted successfully',
      });

      const [options, history] = await Promise.all([
        getCommercialMeta({ force: true }),
        listPayments(),
      ]);

      setMeta(options);
      setRows(history);

      setForm(fresh(tab, tab === 'receive' ? options.nextReceiptNo : options.nextPaymentNo));
      setEditingId('');

      setBalance(0);
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || 'Could not post payment',
      });
    } finally {
      setSaving(false);
    }
  };

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
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold ${
                tab === value ? 'bg-emerald-600 text-white' : 'text-slate-600'
              }`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        {tab !== 'history' && (
          <section className="rounded-md border bg-white shadow-sm">
            <div className="border-b bg-emerald-50 px-4 py-3 font-bold text-emerald-900">
              {editingId ? `Edit ${tab === 'receive' ? 'Receive Payment' : 'Pay Bill'}` : tab === 'receive' ? 'Receive Payment' : 'Pay Bill'}
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={tab === 'receive' ? 'Receipt No.' : 'Payment No.'}>
                <input className={input} value={form.transactionNo} disabled />
              </Field>

              <Field label="Date *">
                <input
                  type="date"
                  className={input}
                  value={form.date}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      date: event.target.value,
                    })
                  }
                />
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
                className={`rounded-md p-3 ${
                  balance >= 0 ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'
                }`}
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
                  onChange={(event) =>
                    setForm({
                      ...form,
                      amount: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Payment Account *">
                <select
                  className={input}
                  value={form.paymentAccountId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      paymentAccountId: event.target.value,
                    })
                  }
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
                  onChange={(event) =>
                    setForm({
                      ...form,
                      paymentMethod: event.target.value,
                      ...(event.target.value === 'cheque' ? {} : { chequeNo: '', chequeBank: '', chequeDate: '' }),
                    })
                  }
                >
                  <option value="cash">Cash</option>

                  <option value="bank">Bank</option>

                  <option value="online">Online</option>

                  <option value="cheque">Cheque</option>
                </select>
              </Field>
              {form.paymentMethod === 'cheque' && <>
                <Field label="Cheque Number *">
                  <input className={input} value={form.chequeNo} onChange={(event) => setForm({ ...form, chequeNo: event.target.value })} />
                </Field>
                <Field label="Bank Name">
                  <input className={input} value={form.chequeBank} onChange={(event) => setForm({ ...form, chequeBank: event.target.value })} />
                </Field>
                <Field label="Cheque Date *">
                  <input type="date" className={input} value={form.chequeDate} onChange={(event) => setForm({ ...form, chequeDate: event.target.value })} />
                </Field>
              </>}

              <Field label="Description" className="sm:col-span-2 lg:col-span-4">
                <textarea
                  className={`${input} h-20 py-2`}
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value,
                    })
                  }
                />
              </Field>

              <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <button
                  type="button"
                  onClick={() => { setEditingId(''); setForm(fresh(tab, tab === 'receive' ? meta.nextReceiptNo : meta.nextPaymentNo)); }}
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
                  {saving ? 'Saving...' : editingId ? 'Update Payment' : 'Post Payment'}
                </button>
                {editingId && <button type="button" onClick={() => { setEditingId(''); setForm(fresh(tab, tab === 'receive' ? meta.nextReceiptNo : meta.nextPaymentNo)); }} className="rounded-md border px-4 py-2">Cancel Edit</button>}
              </div>
            </div>
          </section>
        )}

        {tab === 'history' && (
          <section className="overflow-hidden rounded-md border bg-white shadow-sm">
            {historyType && <div className="border-b bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{historyType === 'receive' ? 'Receive Payment List' : 'Pay Bill List'}</div>}
            <div className="grid gap-2 border-b p-3 sm:grid-cols-3 lg:grid-cols-6"><input className={input} placeholder="Search no. or party" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select className={input} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })}>{[['all','All Dates'],['today','Today'],['yesterday','Yesterday'],['thisWeek','This Week'],['lastWeek','Last Week'],['thisMonth','This Month'],['lastMonth','Last Month'],['thisYear','This Year'],['lastYear','Last Year'],['custom','Custom Date']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{filters.date === 'custom' && <><input type="date" className={input} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /><input type="date" className={input} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></>}<select className={input} value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}><option value="">All Methods</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="online">Online</option><option value="cheque">Cheque</option></select><select className={input} value={filters.paymentAccountId} onChange={(e) => setFilters({ ...filters, paymentAccountId: e.target.value })}><option value="">All Accounts</option>{meta.paymentAccounts.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select><button type="button" className="rounded-md border px-3 text-sm" onClick={() => setFilters({ search: '', date: 'all', from: '', to: '', paymentMethod: '', paymentAccountId: '' })}>Clear Filters</button></div>
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
                      'Method', 'Actions',
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row._id} onClick={async () => { const detail = await getPaymentById(row._id); setForm({ ...fresh(detail.type, detail.transactionNo), ...detail, partyId: detail.partyId?._id || detail.partyId, paymentAccountId: detail.paymentAccountId?._id || detail.paymentAccountId }); setEditingId(detail._id); setTab(detail.type); setParams({ tab: detail.type }); }} className="cursor-pointer border-t hover:bg-emerald-50">
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
                      <td className="px-4 py-3"><button type="button" title="Delete" onClick={async (event) => { event.stopPropagation(); if (!window.confirm('Are you sure you want to delete this record?')) return; await voidMoneyTransaction(row._id, 'Deleted from payment list'); setRows((current) => current.filter((item) => item._id !== row._id)); }} className="text-rose-700">Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {transactionDetail && (
          <WeavingRecordDetailModal
            title={`${
              transactionDetail.type === 'receive' ? 'Receipt' : 'Payment'
            } ${transactionDetail.transactionNo}`}
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
