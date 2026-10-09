import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSave, FaTrashAlt, FaUndoAlt } from 'react-icons/fa';
import { useSearchParams } from 'react-router-dom';

import {
  createTravelCustomerRefundPayment,
  createTravelVendorRefundReceipt,
  fetchOutstandingCustomerRefunds,
  fetchOutstandingVendorRefundSources,
  fetchTravelCustomerRefundPaymentHistory,
  fetchTravelCustomers,
  fetchTravelParties,
  fetchTravelPaymentAccounts,
  fetchTravelVendorRefundReceiptHistory,
  fetchTravelVendors,
  reverseTravelCustomerRefundPayment,
  reverseTravelVendorRefundReceipt,
} from '../../services/travelMasterService';
import { getLocalDateInputValue, getLocalTimeInputValue } from '../../utils/localDateTime';
import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelErrorModal,
  TravelMasterPageFrame,
  formatTravelMoney,
  getTravelErrorMessage,
} from '../../components/travel/master/TravelMasterUI';

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

const getId = (value) => (typeof value === 'object' ? value?._id : value) || '';
const optionId = (type, id) => (id ? `${type}:${id}` : '');
const splitOptionId = (value = '') => {
  const [type, id] = String(value).split(':');
  return { type, id };
};
const counterpartyOption = (record, type) => ({
  ...record,
  _id: optionId(type, getId(record)),
  sourceId: getId(record),
  entityType: type,
});
const getLabel = (record) => record?.name || '-';
const getMeta = (record) => [record?.entityType === 'party' ? 'Party' : '', record?.phone]
  .filter(Boolean).join(' | ');
const getCustomerCredit = (record) => record?.entityType === 'party'
  ? Math.max(-Number(record?.balance || 0), 0)
  : Math.max(Number(record?.customerCredit || 0), 0);
const getVendorCredit = (record) => record?.entityType === 'party'
  ? Math.max(Number(record?.balance || 0), 0)
  : Math.max(Number(record?.vendorCredit ?? -Number(record?.balance || 0)), 0);

const SummaryCard = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <div className="text-[11px] font-extrabold uppercase text-slate-500">{label}</div>
    <div className={`mt-1 text-sm font-black ${tone}`}>{value}</div>
  </div>
);

const createForm = () => ({
  amount: '',
  accountId: '',
  paymentType: 'cash',
  date: getLocalDateInputValue(),
  time: getLocalTimeInputValue(),
  reference: '',
  notes: '',
});

const TravelRefundSettlementPage = ({ kind, modeActions = null }) => {
  const isCustomer = kind === 'customer';
  const [searchParams] = useSearchParams();
  const [counterparties, setCounterparties] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState('');
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(createForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReverseId, setConfirmReverseId] = useState('');

  const selectedCounterparty = useMemo(
    () => counterparties.find((record) => String(record._id) === selectedCounterpartyId) || null,
    [counterparties, selectedCounterpartyId]
  );
  const availableCredit = selectedCounterparty
    ? (isCustomer ? getCustomerCredit(selectedCounterparty) : getVendorCredit(selectedCounterparty))
    : 0;
  const safeMaximum = Math.min(
    Number(selectedSource?.outstandingAmount || 0),
    Number(availableCredit || 0)
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [mainRecords, partyRecords, paymentAccounts] = await Promise.all([
          isCustomer
            ? fetchTravelCustomers({ includeBalance: 'true' }, { forceRefresh: true })
            : fetchTravelVendors({ includeBalance: 'true' }, { forceRefresh: true }),
          fetchTravelParties({
            status: 'active',
            eligibleRole: isCustomer ? 'customer' : 'supplier',
            includeBalance: 'true',
          }, { forceRefresh: true }),
          fetchTravelPaymentAccounts(),
        ]);
        if (cancelled) return;
        const type = isCustomer ? 'customer' : 'vendor';
        const options = [
          ...(Array.isArray(mainRecords) ? mainRecords : []).map((row) => counterpartyOption(row, type)),
          ...(Array.isArray(partyRecords) ? partyRecords : []).map((row) => counterpartyOption(row, 'party')),
        ];
        setCounterparties(options);
        setAccounts(Array.isArray(paymentAccounts) ? paymentAccounts : []);
        setForm((current) => ({ ...current, accountId: current.accountId || paymentAccounts?.[0]?._id || '' }));

        const queryType = searchParams.get(isCustomer ? 'customerType' : 'vendorType');
        const queryId = searchParams.get(queryType === 'party'
          ? (isCustomer ? 'customerPartyId' : 'vendorPartyId')
          : (isCustomer ? 'customerId' : 'vendorId'));
        if (queryId) setSelectedCounterpartyId(optionId(queryType === 'party' ? 'party' : type, queryId));
      } catch (loadError) {
        if (!cancelled) setError(getTravelErrorMessage(loadError, 'Unable to load settlement references.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isCustomer, searchParams]);

  const loadSources = useCallback(async () => {
    if (!selectedCounterpartyId) {
      setSources([]);
      setSelectedSource(null);
      return;
    }
    const { type, id } = splitOptionId(selectedCounterpartyId);
    const params = isCustomer
      ? { customerType: type, ...(type === 'party' ? { customerPartyId: id } : { customerId: id }) }
      : { vendorType: type, ...(type === 'party' ? { vendorPartyId: id } : { vendorId: id }) };
    const requestedSourceId = searchParams.get(isCustomer ? 'refundId' : 'sourceId');
    const requestedSourceType = searchParams.get('sourceType');
    try {
      const rows = isCustomer
        ? await fetchOutstandingCustomerRefunds(params)
        : await fetchOutstandingVendorRefundSources(params);
      const normalized = rows.map((row) => isCustomer ? {
        ...row,
        sourceId: row._id,
        sourceType: 'travel_refund',
        sourceNumber: row.refundNumber,
      } : row);
      setSources(normalized);
      setSelectedSource((current) => {
        const requested = normalized.find((row) =>
          String(row.sourceId) === String(requestedSourceId) &&
          (!requestedSourceType || row.sourceType === requestedSourceType));
        const retained = normalized.find((row) =>
          String(row.sourceId) === String(current?.sourceId) && row.sourceType === current?.sourceType);
        return requested || retained || normalized[0] || current || null;
      });
    } catch (loadError) {
      setError(getTravelErrorMessage(loadError, 'Unable to load outstanding refunds.'));
    }
  }, [isCustomer, searchParams, selectedCounterpartyId]);

  useEffect(() => { loadSources(); }, [loadSources]);

  const loadHistory = useCallback(async () => {
    if (!selectedSource) {
      setHistory([]);
      return;
    }
    try {
      const rows = isCustomer
        ? await fetchTravelCustomerRefundPaymentHistory(selectedSource.sourceId)
        : await fetchTravelVendorRefundReceiptHistory(
            selectedSource.sourceType,
            selectedSource.sourceId,
            selectedSource.entityType === 'party'
              ? { vendorType: 'party', vendorPartyId: selectedSource.entityId }
              : { vendorType: 'vendor', vendorId: selectedSource.entityId }
          );
      setHistory(rows);
    } catch (loadError) {
      setError(getTravelErrorMessage(loadError, 'Unable to load settlement history.'));
    }
  }, [isCustomer, selectedSource]);

  useEffect(() => {
    setConfirmReverseId('');
    setForm((current) => ({ ...current, amount: safeMaximum > 0 ? String(safeMaximum) : '' }));
    loadHistory();
  }, [loadHistory, safeMaximum]);

  const updateSource = (value) => {
    const [sourceType, sourceId] = value.split(':');
    setSelectedSource(sources.find((row) => row.sourceType === sourceType && String(row.sourceId) === sourceId) || null);
  };

  const adjustCounterpartyCredit = (creditDelta) => {
    const { type } = splitOptionId(selectedCounterpartyId);
    setCounterparties((current) => current.map((record) => {
      if (String(record._id) !== selectedCounterpartyId) return record;
      if (type === 'party') {
        return {
          ...record,
          balance: Number(record.balance || 0) + (isCustomer ? -creditDelta : creditDelta),
        };
      }
      return isCustomer
        ? { ...record, customerCredit: Math.max(Number(record.customerCredit || 0) + creditDelta, 0) }
        : { ...record, vendorCredit: Math.max(Number(record.vendorCredit || 0) + creditDelta, 0) };
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (!selectedSource || !form.accountId || amount <= 0 || amount > safeMaximum) {
      setError(`Enter an amount up to ${formatTravelMoney(safeMaximum)} and select a payment account.`);
      return;
    }
    const { type, id } = splitOptionId(selectedCounterpartyId);
    try {
      setSaving(true);
      setError('');
      if (isCustomer) {
        await createTravelCustomerRefundPayment(selectedSource.sourceId, { ...form, amount });
      } else {
        await createTravelVendorRefundReceipt(selectedSource.sourceType, selectedSource.sourceId, {
          ...form,
          amount,
          vendorType: type,
          vendorId: type === 'vendor' ? id : '',
          vendorPartyId: type === 'party' ? id : '',
        });
      }
      adjustCounterpartyCredit(-amount);
      setSelectedSource((current) => current ? {
        ...current,
        settledAmount: Number(current.settledAmount ?? current.paidBackAmount ?? 0) + amount,
        paidBackAmount: isCustomer ? Number(current.paidBackAmount || 0) + amount : current.paidBackAmount,
        outstandingAmount: Math.max(Number(current.outstandingAmount || 0) - amount, 0),
      } : current);
      setForm((current) => ({ ...createForm(), accountId: current.accountId }));
      await Promise.all([loadSources(), loadHistory()]);
    } catch (saveError) {
      setError(getTravelErrorMessage(saveError, 'Settlement could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const reverseEntry = async (journalId) => {
    if (confirmReverseId !== journalId) {
      setConfirmReverseId(journalId);
      return;
    }
    try {
      setSaving(true);
      const reversedAmount = Number(history.find((entry) => String(entry._id) === String(journalId))?.amount || 0);
      if (isCustomer) {
        await reverseTravelCustomerRefundPayment(selectedSource.sourceId, journalId);
      } else {
        await reverseTravelVendorRefundReceipt(selectedSource.sourceType, selectedSource.sourceId, journalId);
      }
      adjustCounterpartyCredit(reversedAmount);
      setSelectedSource((current) => current ? {
        ...current,
        settledAmount: Math.max(Number(current.settledAmount ?? current.paidBackAmount ?? 0) - reversedAmount, 0),
        paidBackAmount: isCustomer
          ? Math.max(Number(current.paidBackAmount || 0) - reversedAmount, 0)
          : current.paidBackAmount,
        outstandingAmount: Number(current.outstandingAmount || 0) + reversedAmount,
      } : current);
      setConfirmReverseId('');
      await Promise.all([loadSources(), loadHistory()]);
    } catch (reverseError) {
      setError(getTravelErrorMessage(reverseError, 'Settlement reversal failed.'));
    } finally {
      setSaving(false);
    }
  };

  const sourceValue = selectedSource
    ? `${selectedSource.sourceType}:${selectedSource.sourceId}`
    : '';

  return (
    <TravelMasterPageFrame
      titleKey={isCustomer ? 'Pay Customer Refund' : 'Receive Vendor Refund'}
      className="mx-auto w-full max-w-5xl !pt-0"
      actions={modeActions}
    >
      <TravelErrorModal open={Boolean(error)} title="Refund settlement" message={error} onClose={() => setError('')} />
      <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className={`h-1 bg-gradient-to-r ${isCustomer ? 'from-rose-500 to-orange-500' : 'from-emerald-500 to-cyan-500'}`} />
        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <TravelCompactAutocomplete
              labelKey={isCustomer ? 'travel.fields.customer' : 'travel.fields.vendor'}
              value={selectedCounterpartyId}
              onChange={(value) => { setSelectedCounterpartyId(value); setSelectedSource(null); }}
              records={counterparties}
              getLabel={getLabel}
              getMeta={getMeta}
              placeholderKey={isCustomer ? 'travel.payments.customerPlaceholder' : 'travel.payments.vendorPlaceholder'}
              disabled={loading || saving}
            />
            <label>
              <span className="mb-1 block text-xs font-extrabold text-slate-500">Refund source</span>
              <select value={sourceValue} onChange={(event) => updateSource(event.target.value)} className={inputClass} disabled={!sources.length || saving}>
                {!sources.length && <option value="">No outstanding refunds</option>}
                {sources.map((row) => (
                  <option key={`${row.sourceType}:${row.sourceId}:${row.entityId || ''}`} value={`${row.sourceType}:${row.sourceId}`}>
                    {row.sourceNumber || row.originalInvoiceNumber || 'Refund'} — {formatTravelMoney(row.outstandingAmount)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedSource && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Refund total" value={formatTravelMoney(selectedSource.totalAmount ?? selectedSource.customerRefundAmount)} />
              <SummaryCard label="Already settled" value={formatTravelMoney(selectedSource.settledAmount ?? selectedSource.paidBackAmount)} />
              <SummaryCard label="Outstanding" value={formatTravelMoney(selectedSource.outstandingAmount)} tone="text-amber-700" />
              <SummaryCard label="Safe maximum now" value={formatTravelMoney(safeMaximum)} tone="text-cyan-700" />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Amount</span><input type="number" min="0.01" step="0.01" max={safeMaximum || undefined} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} /></label>
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Payment account</span><select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className={inputClass}><option value="">Select account</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}{account.code ? ` - ${account.code}` : ''}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Payment type</span><select value={form.paymentType} onChange={(event) => setForm({ ...form, paymentType: event.target.value })} className={inputClass}><option value="cash">Cash</option><option value="online">Online / Bank</option><option value="cheque">Cheque</option></select></label>
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Date</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></label>
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Time</span><input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} className={inputClass} /></label>
            <label><span className="mb-1 block text-xs font-extrabold text-slate-500">Reference</span><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} /></label>
            <label className="md:col-span-2"><span className="mb-1 block text-xs font-extrabold text-slate-500">Notes</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} /></label>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <TravelActionButton type="submit" icon={FaSave} variant={isCustomer ? 'danger' : 'success'} disabled={saving || loading || !selectedSource || safeMaximum <= 0}>
              {saving ? 'Saving…' : isCustomer ? 'Pay refund' : 'Receive refund'}
            </TravelActionButton>
          </div>
        </div>
      </form>

      {selectedSource && (
        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-extrabold text-slate-800"><FaUndoAlt /> Settlement history</div>
          {!history.length ? <p className="p-4 text-sm font-semibold text-slate-500">No settlements recorded yet.</p> : (
            <div className="divide-y divide-slate-100">
              {history.map((entry) => (
                <div key={entry._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-sm font-black text-slate-800">{formatTravelMoney(entry.amount)}</div><div className="text-xs font-semibold text-slate-500">{new Date(entry.date).toLocaleDateString()} · {entry.paymentType || 'payment'}{entry.isReversed ? ' · Reversed' : ''}</div></div>
                  {!entry.isReversed && (
                    <TravelActionButton icon={FaTrashAlt} variant={confirmReverseId === entry._id ? 'danger' : 'secondary'} disabled={saving} onClick={() => reverseEntry(entry._id)}>
                      {confirmReverseId === entry._id ? 'Confirm reversal' : 'Reverse'}
                    </TravelActionButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </TravelMasterPageFrame>
  );
};

export default TravelRefundSettlementPage;
