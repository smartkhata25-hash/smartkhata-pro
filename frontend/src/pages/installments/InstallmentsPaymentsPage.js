import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { FaAdjust, FaArrowLeft, FaCalendarAlt, FaCheck, FaCheckCircle, FaClock, FaEdit, FaExclamationTriangle, FaFileInvoiceDollar, FaHandHoldingUsd, FaHistory, FaMoneyBillWave, FaPhone, FaPrint, FaTimes, FaWhatsapp } from 'react-icons/fa';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n/i18n';

import {
  createPaymentRequestKey,
  correctInstallmentsCollectionReceipt,
  getInstallmentsCollections,
  getInstallmentsMemberPaymentContext,
  getInstallmentsPaymentHistory,
  getInstallmentsPaymentLookups,
  getInstallmentsSupplierPaymentContext,
  postInstallmentsReceipt,
  postInstallmentsSavingsPayout,
  postInstallmentsSupplierPayment,
} from '../../services/installmentsPaymentService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { formatInstallmentsDisplayRef } from '../../utils/installmentsDisplay';
import { formatInstallmentsMoney } from '../../utils/installmentsMoney';
import InstallmentsDialog from '../../components/installments/InstallmentsDialog';

const money = (value) => formatInstallmentsMoney(value);
const fieldClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';
const labelClass = 'mb-1 block text-xs font-extrabold text-slate-500';
const modes = [
  ['receive', 'installments.payments.tabs.receive', 'installments.payments.receive'],
  ['collections', 'installments.payments.tabs.collections', 'installments.payments.view_collections'],
  ['pay-bill', 'installments.payments.tabs.payBill', 'installments.payments.pay_supplier'],
  ['payout', 'installments.payments.tabs.memberPayout', 'installments.payments.return_savings'],
  ['history', 'installments.payments.tabs.history', 'installments.payments.view_history'],
];
const paymentMenuIcons = {
  receive: FaHandHoldingUsd,
  collections: FaCalendarAlt,
  'pay-bill': FaFileInvoiceDollar,
  payout: FaMoneyBillWave,
  history: FaHistory,
};
const getError = (error) => error?.response?.data?.message || error?.message || 'Unable to complete this action.';
const defaultAccount = (data) => String(data?.defaultAccountId || '');
const initialPayment = (accountId = '') => ({ transactionDate: getBusinessDateInputValue(), amount: '', accountId, notes: '', externalReference: '' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const memberOptionLabel = (row) => `${row.fullName} — ${formatInstallmentsDisplayRef(row.memberNumber, 'member')} — ${row.mobile || ''}`;
const supplierOptionLabel = (row) => `${row.name} — ${formatInstallmentsDisplayRef(row.supplierNumber, 'supplier')} — ${row.phone || ''}`;

const Summary = ({ label, value, tone = 'text-slate-900' }) => <div className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className={`mt-1 text-sm font-black ${tone}`}>{value}</div></div>;
const Field = ({ label, children }) => <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
const Notice = ({ error, success }) => { const [dismissed, setDismissed] = useState(false); const [input, setInput] = useState(''); const prompt = error && typeof error === 'object' ? error : null; useEffect(() => { setDismissed(false); setInput(''); }, [error]); return <>{error && !dismissed && <InstallmentsDialog open type={prompt ? 'warning' : 'error'} message={prompt?.message || error} inputLabel={prompt?.inputLabel} inputValue={input} inputRequired={Boolean(prompt)} onInputChange={setInput} cancelLabel={prompt ? t('cancel') : ''} confirmLabel={prompt?.confirmLabel} onClose={() => setDismissed(true)} onConfirm={() => { if (prompt) prompt.onConfirm?.(input); else setDismissed(true); }} />}{success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{success}</div>}</>; };
const Submit = ({ busy, disabled = false, children, className = '' }) => <button formNoValidate disabled={busy || disabled} className={`h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 px-5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${className}`}>{busy ? 'Saving…' : children}</button>;

const PaymentFields = ({ form, setForm, accounts }) => <>
  <Field label={t('installments.payments.paymentDate')}><input type="date" className={fieldClass} value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} /></Field>
  <Field label={t('installments.payments.amount')}><input inputMode="decimal" className={fieldClass} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" /></Field>
  <Field label={t('installments.payments.paymentAccount')}><select required className={fieldClass} value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}><option value="">{t('installments.payments.selectAccount')}</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name} {account.code ? `— ${account.code}` : ''}</option>)}</select></Field>
</>;

const SearchableMemberSelect = ({ members, value, onChange, disabled = false }) => {
  const listId = useId();
  const selected = members.find((row) => String(row._id) === String(value));
  const [text, setText] = useState(selected ? memberOptionLabel(selected) : '');
  useEffect(() => { setText(selected ? memberOptionLabel(selected) : ''); }, [selected]);
  return <><input required disabled={disabled} list={listId} autoComplete="off" className={fieldClass} value={text} placeholder={t('installments.payments.selectMember')} onChange={(event) => { const next = event.target.value; setText(next); const match = members.find((row) => memberOptionLabel(row) === next); onChange(match?._id || ''); }} /><datalist id={listId}>{members.map((row) => <option key={row._id} value={memberOptionLabel(row)} />)}</datalist></>;
};

const MobileSupplierAutocomplete = ({ suppliers, value, onChange }) => {
  const listId = useId();
  const selected = suppliers.find((row) => String(row._id) === String(value));
  const [text, setText] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredSuppliers = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query || (selected && query === String(selected.name || '').trim().toLowerCase())) return suppliers;
    return suppliers.filter((row) => supplierOptionLabel(row).toLowerCase().includes(query));
  }, [selected, suppliers, text]);

  useEffect(() => {
    if (selected) setText(selected.name || '');
    else if (value) setText('');
  }, [selected, value]);
  useEffect(() => setActiveIndex(-1), [text]);

  const chooseSupplier = (supplier) => {
    setText(supplier.name || '');
    onChange(supplier._id);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!filteredSuppliers.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredSuppliers.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      chooseSupplier(filteredSuppliers[activeIndex] || filteredSuppliers[0]);
    }
  };

  return (
    <div className="relative">
      <input
        required
        autoComplete="off"
        className={fieldClass}
        value={text}
        placeholder={t('installments.payments.selectSupplier')}
        role="combobox"
        aria-label={t('installments.payments.supplier')}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && filteredSuppliers[activeIndex] ? `${listId}-${filteredSuppliers[activeIndex]._id}` : undefined}
        onFocus={(event) => {
          setOpen(true);
          if (selected) event.currentTarget.select();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setOpen(true);
          if (!selected || next !== selected.name) onChange('');
        }}
      />
      {open && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-[90] mt-1 max-h-[min(14rem,45vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filteredSuppliers.length ? filteredSuppliers.map((row, index) => (
            <button id={`${listId}-${row._id}`} key={row._id} type="button" role="option" aria-selected={String(row._id) === String(value)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm ${index === activeIndex ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => chooseSupplier(row)}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{row.name}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{[row.referenceNumber || row.memberNumber, row.phone].filter(Boolean).join(' · ')}</span>
              </span>
              {String(row._id) === String(value) && <FaCheck className="shrink-0 text-cyan-600" aria-hidden="true" />}
            </button>
          )) : <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{t('installments.payments.noSupplierMatches')}</p>}
        </div>
      )}
    </div>
  );
};

const MobileAccountSelect = ({ accounts, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((account) => String(account._id) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" className={`${fieldClass} flex items-center justify-between gap-2 text-start`} aria-haspopup="listbox" aria-expanded={open} aria-label={t('installments.payments.paymentAccount')} onClick={() => setOpen(true)}>
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.name || t('installments.payments.selectAccount')}</span>
        <span className="shrink-0 text-xs text-slate-400" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-slate-950/25 sm:hidden" onMouseDown={() => setOpen(false)}>
          <div className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{t('installments.payments.paymentAccount')}</span>
              <button type="button" className="rounded-lg p-2 text-slate-500" aria-label={t('close')} onClick={() => setOpen(false)}><FaTimes aria-hidden="true" /></button>
            </div>
            <div role="listbox" className="max-h-[calc(70vh-3.5rem)] overflow-y-auto p-2">
              {accounts.map((account) => (
                <button key={account._id} type="button" role="option" aria-selected={String(account._id) === String(value)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start ${String(account._id) === String(value) ? 'bg-cyan-50 font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-200'}`} onClick={() => { onChange(account._id); setOpen(false); }}>
                  <span className="truncate">{account.name}</span>
                  {String(account._id) === String(value) && <FaCheck className="shrink-0 text-cyan-600" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const SearchableSupplierSelect = ({ suppliers, value, onChange }) => {
  const listId = useId();
  const selected = suppliers.find((row) => String(row._id) === String(value));
  const [text, setText] = useState(selected ? supplierOptionLabel(selected) : '');
  useEffect(() => { setText(selected ? supplierOptionLabel(selected) : ''); }, [selected]);
  return <><input required list={listId} autoComplete="off" className={fieldClass} value={text} placeholder={t('installments.payments.selectSupplier')} onChange={(event) => { const next = event.target.value; setText(next); const match = suppliers.find((row) => supplierOptionLabel(row) === next); onChange(match?._id || ''); }} /><datalist id={listId}>{suppliers.map((row) => <option key={row._id} value={supplierOptionLabel(row)} />)}</datalist></>;
};

const ReceiveForm = ({ members, accounts, defaultAccountId, preset, onPosted }) => {
  const [memberId, setMemberId] = useState(preset?.member?._id || '');
  const [context, setContext] = useState(null);
  const [committeeId, setCommitteeId] = useState(preset?.committee?._id || '');
  const [form, setForm] = useState({ ...initialPayment(defaultAccountId), amount: preset?.suggestedAmount || '' });
  const [requestId, setRequestId] = useState(createPaymentRequestKey());
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');

  useEffect(() => { setForm((current) => ({ ...current, accountId: current.accountId || defaultAccountId })); }, [defaultAccountId]);
  useEffect(() => {
    let active = true;
    setContext(null); setSuccess('');
    if (!memberId) { setCommitteeId(''); return () => { active = false; }; }
    if (!preset) setCommitteeId('');
    setError('');
    getInstallmentsMemberPaymentContext(memberId).then((data) => {
      if (!active) return;
      setContext(data);
      const committees = data.receiptCommittees || [];
      if (preset?.committee?._id && committees.some((row) => String(row._id) === String(preset.committee._id))) setCommitteeId(preset.committee._id);
      else setCommitteeId(committees.length === 1 ? committees[0]._id : '');
    }).catch((e) => { if (active) setError(getError(e)); });
    return () => { active = false; };
  }, [memberId, preset]);
  useEffect(() => { if (preset) { setMemberId(preset.member?._id || ''); setCommitteeId(preset.committee?._id || ''); setForm((current) => ({ ...current, amount: preset.suggestedAmount || '', transactionDate: preset.date || current.transactionDate })); } }, [preset]);

  const committees = context?.receiptCommittees || [];
  const needsCommittee = committees.length > 1;
  const relevantReceivable = context ? (needsCommittee && !committeeId ? null : (context.unpaidInvoices || []).filter((invoice) => String(invoice.committeeId?._id || invoice.committeeId || '') === String(committeeId || '')).reduce((sum, invoice) => sum + Number(invoice.outstandingAmount || 0), 0)) : 0;

  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    if (!memberId || !form.transactionDate || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0 || !form.accountId) { setError(t('installments.payments.validation.required')); return; }
    if ((needsCommittee || preset?.committee?._id) && !committeeId) { setError(t('installments.payments.validation.committeeRequired')); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const data = await postInstallmentsReceipt({ ...form, memberId, committeeId: committeeId || null, paymentSource: preset ? 'today_collections' : 'manual' }, requestId);
      setSuccess(`${data.message} — ${formatInstallmentsDisplayRef(data.transaction.referenceNumber, 'reference')}`); setRequestId(createPaymentRequestKey()); setForm((current) => ({ ...initialPayment(defaultAccountId), transactionDate: current.transactionDate }));
      getInstallmentsMemberPaymentContext(memberId).then(setContext).catch(() => {});
      await onPosted?.(data.transaction);
    } catch (e) { setError(getError(e)); } finally { setBusy(false); }
  };

  return <form noValidate onSubmit={submit} className="space-y-3">
    <Notice error={error} success={success} />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Field label={t('installments.payments.memberCustomer')}><SearchableMemberSelect members={members} value={memberId} disabled={Boolean(preset)} onChange={(value) => { setMemberId(value); setCommitteeId(''); setContext(null); }} /></Field>
      <Field label={t('installments.payments.committee')}><select disabled={Boolean(preset) || !committees.length} required={needsCommittee} className={fieldClass} value={committeeId} onChange={(event) => setCommitteeId(event.target.value)}><option value="">{committees.length ? t('installments.payments.selectCommittee') : t('installments.payments.noCommittee')}</option>{committees.map((committee) => <option key={committee._id} value={committee._id}>{formatInstallmentsDisplayRef(committee.committeeNumber, 'committee')}</option>)}</select></Field>
      <PaymentFields form={form} setForm={setForm} accounts={accounts} />
    </div>
    <div className="grid items-end gap-3 md:grid-cols-[minmax(170px,.4fr)_minmax(260px,1fr)_auto]">
      <Summary label={t('installments.payments.receivable')} value={relevantReceivable === null ? '—' : money(relevantReceivable)} tone="text-rose-700" />
      <Field label={t('installments.payments.notesOptional')}><input className={fieldClass} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
      <Submit busy={busy}>{t('installments.payments.confirmReceive')}</Submit>
    </div>
  </form>;
};

const Collections = ({ accounts, defaultAccountId, committeeId = '' }) => {
  const [date, setDate] = useState(getBusinessDateInputValue()); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const [accountId, setAccountId] = useState(defaultAccountId || ''); const [data, setData] = useState({ rows: [], summary: {} }); const [amounts, setAmounts] = useState({}); const [requestKeys, setRequestKeys] = useState({});
  const [postingKey, setPostingKey] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null); const [correctionKeys, setCorrectionKeys] = useState({});
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const canReceive = hasPermission('installments.payments.receive');
  const canCorrect = canReceive && hasPermission('installments.payments.reverse');
  const selectedAccount = accounts.find((account) => String(account._id) === String(accountId));
  useEffect(() => { if (!accountId && defaultAccountId) setAccountId(defaultAccountId); }, [accountId, defaultAccountId]);
  useEffect(() => { if (!mobileAccountOpen) return undefined; const close = (event) => { if (event.key === 'Escape') setMobileAccountOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [mobileAccountOpen]);
  const load = useCallback(async (resetKey = '') => {
    setLoading(true); setError('');
    try {
      const next = await getInstallmentsCollections({ date, search, status, committeeId });
      setData(next);
      setAmounts((current) => Object.fromEntries(next.rows.map((row) => { const rowKey = `${row.committee._id}:${row.date}`; return [rowKey, rowKey === resetKey || current[rowKey] === undefined ? String(row.suggestedAmount || '') : current[rowKey]]; })));
      setRequestKeys((current) => ({ ...current, ...Object.fromEntries(next.rows.map((row) => { const rowKey = `${row.committee._id}:${row.date}`; return [rowKey, current[rowKey] || createPaymentRequestKey()]; })) }));
    } catch (e) { setError(getError(e)); } finally { setLoading(false); }
  }, [date, search, status, committeeId]);
  useEffect(() => { load(); }, [load]);
  const contact = (phone) => String(phone || '').replace(/\D/g, '').replace(/^0/, '92');
  const receive = async (row) => {
    const rowKey = `${row.committee._id}:${row.date}`; const amountText = String(amounts[rowKey] ?? '').trim(); const amount = Number(amountText); const account = accounts.find((item) => String(item._id) === String(accountId));
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) { setError(t('installments.collections.invalidAmount')); return; }
    if (!row.member?._id || !row.committee?._id || !account) { setError(t('installments.collections.invalidContext')); return; }
    if (postingKey) return;
    if (row.hasDailyReceipt) { setError(t('installments.collections.alreadyRecorded')); return; }
    setPostingKey(rowKey); setError('');
    try {
      await postInstallmentsReceipt({ transactionDate: date, amount, accountId, memberId: row.member._id, committeeId: row.committee._id, paymentSource: 'today_collections', notes: '' }, requestKeys[rowKey] || createPaymentRequestKey());
      setRequestKeys((current) => ({ ...current, [rowKey]: createPaymentRequestKey() }));
      await load(rowKey);
    } catch (e) { setError(getError(e)); } finally { setPostingKey(''); }
  };
  const beginEdit = (row, rowKey) => {
    if (row.dailyReceiptCount !== 1 || !row.dailyReceipt?._id) { setError(t('installments.collections.multipleReceipts')); return; }
    setCorrectionKeys((current) => ({ ...current, [row.dailyReceipt._id]: current[row.dailyReceipt._id] || createPaymentRequestKey() }));
    setEdit({ rowKey, transactionId: row.dailyReceipt._id, amount: String(row.dailyReceived) });
  };
  const requestCorrection = async (row) => {
    const amountText = String(edit?.amount || '').trim(); const amount = Number(amountText); const rowKey = `${row.committee._id}:${row.date}`;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) { setError(t('installments.collections.invalidAmount')); return; }
    if (amount === Number(row.dailyReceived || 0)) { setEdit(null); return; }
    if (postingKey) return;
    setError(''); setPostingKey(rowKey);
    try {
      await correctInstallmentsCollectionReceipt(edit.transactionId, amount, correctionKeys[edit.transactionId] || createPaymentRequestKey());
      setEdit(null); await load(rowKey);
    } catch (e) { setError(getError(e)); } finally { setPostingKey(''); }
  };
  return <div className="space-y-3"><Notice error={error} /><div className="flex flex-col gap-2">
    <div className="order-2 sm:order-1">
      <div className="sm:hidden">
        <div className={`grid items-center gap-1.5 ${canReceive ? 'grid-cols-[40px_minmax(78px,.8fr)_minmax(0,1.4fr)]' : 'grid-cols-[40px_minmax(0,1fr)]'}`}>
          <label title={t('installments.collections.date')} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-cyan-700"><FaCalendarAlt aria-hidden="true" /><input type="date" aria-label={t('installments.collections.date')} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <select aria-label={t('installments.collections.status')} title={t('installments.collections.status')} className={`${fieldClass} min-w-0 px-1 text-[11px]`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t('installments.collections.allDue')}</option><option value="pending">{t('installments.collections.pending')}</option><option value="partial">{t('installments.collections.partial')}</option><option value="paid">{t('installments.collections.paid')}</option><option value="overdue">{t('installments.collections.overdue')}</option></select>
          {canReceive && <button type="button" aria-label={t('installments.collections.paymentAccount')} title={t('installments.collections.paymentAccount')} aria-haspopup="listbox" aria-expanded={mobileAccountOpen} onClick={() => setMobileAccountOpen(true)} className="flex h-10 min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-2 text-start text-[11px] font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"><span className="truncate">{selectedAccount?.name || t('installments.payments.selectAccount')}</span><span aria-hidden="true" className="text-[9px] text-slate-400">▼</span></button>}
        </div>
        <input aria-label={t('installments.collections.search')} className={`${fieldClass} mt-1.5`} placeholder={t('installments.collections.searchPlaceholder')} value={search} onChange={(event) => setSearch(event.target.value)} />
        {mobileAccountOpen && <><div aria-hidden="true" onClick={() => setMobileAccountOpen(false)} className="fixed inset-0 z-[120] bg-slate-950/35" /><div role="listbox" aria-label={t('installments.collections.paymentAccount')} className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[130] max-h-[min(60vh,24rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"><div className="sticky top-0 mb-1 flex items-center justify-between gap-2 bg-white px-2 py-1.5"><span className="text-sm font-black text-slate-800">{t('installments.collections.paymentAccount')}</span><button type="button" aria-label={t('close')} onClick={() => setMobileAccountOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><FaTimes /></button></div>{accounts.map((account) => { const selected = String(account._id) === String(accountId); return <button key={account._id} type="button" role="option" aria-selected={selected} onClick={() => { setAccountId(account._id); setMobileAccountOpen(false); }} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start text-sm font-bold ${selected ? 'bg-cyan-50 text-cyan-800' : 'text-slate-700 hover:bg-slate-50'}`}><span className="min-w-0"><span className="block truncate">{account.name}</span>{account.code && <span className="block truncate text-[10px] font-semibold text-slate-400">{account.code}</span>}</span>{selected && <FaCheck className="flex-none text-cyan-700" />}</button>; })}</div></>}
      </div>
      <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-[170px_minmax(240px,1fr)_180px_minmax(220px,280px)]"><Field label={t('installments.collections.date')}><input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label={t('installments.collections.search')}><input className={fieldClass} placeholder={t('installments.collections.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Field label={t('installments.collections.status')}><select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">{t('installments.collections.allDue')}</option><option value="pending">{t('installments.collections.pending')}</option><option value="partial">{t('installments.collections.partial')}</option><option value="paid">{t('installments.collections.paid')}</option><option value="overdue">{t('installments.collections.overdue')}</option></select></Field>{canReceive && <Field label={t('installments.collections.paymentAccount')}><select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">{t('installments.payments.selectAccount')}</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}{account.code ? ` · ${account.code}` : ''}</option>)}</select></Field>}</div>
    </div>
    <div className="order-1 grid grid-cols-3 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 sm:order-2 sm:flex sm:flex-wrap sm:gap-x-5 sm:px-3"><CompactMetric label={<><span className="sm:hidden">{t('installments.collections.expected')}</span><span className="hidden sm:inline">{t('installments.collections.expectedToday')}</span></>} value={money(data.summary.expected)} /><CompactMetric label={t('installments.collections.received')} value={money(data.summary.actuallyReceived)} tone="text-emerald-700" /><CompactMetric label={t('installments.collections.remaining')} value={money(data.summary.remaining)} tone="text-rose-700" /></div>
  </div>
    <div className="space-y-2">{loading ? <p className="p-6 text-center text-sm font-bold text-slate-500">{t('installments.collections.loading')}</p> : data.rows.map((row) => { const rowKey = `${row.committee._id}:${row.date}`; const phone = contact(row.member.mobile); const busy = postingKey === rowKey; const editing = edit?.rowKey === rowKey; return <article key={rowKey} className={`grid items-center gap-2 rounded-xl border bg-white p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_minmax(230px,1.15fr)_150px_auto] ${row.status === 'overdue' ? 'border-rose-200' : row.status === 'collected' ? 'border-emerald-200' : 'border-slate-200'}`}><div className="min-w-0"><div className="flex items-center gap-2"><CollectionStatusIcon status={row.status} /><h3 className="truncate font-black text-slate-900">{row.member.fullName}</h3></div><p className="truncate text-xs font-semibold text-slate-500">{formatInstallmentsDisplayRef(row.member.memberNumber, 'member')} · {formatInstallmentsDisplayRef(row.committee.committeeNumber, 'committee')}{row.member.mobile ? ` · ${row.member.mobile}` : ''}</p></div><div className="text-xs leading-5 text-slate-600"><span>{t('installments.collections.scheduledToday')}: <b>{money(row.scheduledToday)}</b></span><span className="ms-3">{t('installments.collections.pendingDues')}: <b className={row.remainingExpected > 0 ? 'text-rose-700' : 'text-emerald-700'}>{money(row.remainingExpected)}</b></span></div>{row.hasDailyReceipt ? editing ? <Field label={t('installments.collections.received')}><input inputMode="decimal" disabled={busy} className={fieldClass} value={edit.amount} onChange={(event) => setEdit((current) => ({ ...current, amount: event.target.value }))} /></Field> : <Field label={t('installments.collections.received')}><output className={`${fieldClass} flex items-center bg-slate-50`}>{money(row.dailyReceived)}</output></Field> : <Field label={t('installments.collections.receiveAmount')}><input inputMode="decimal" disabled={!canReceive || busy} className={fieldClass} value={amounts[rowKey] ?? ''} onChange={(e) => setAmounts((current) => ({ ...current, [rowKey]: e.target.value }))} /></Field>}<div className="flex items-end justify-end gap-2">{phone && <><a aria-label={t('installments.collections.call')} title={t('installments.collections.call')} href={`tel:${row.member.mobile}`} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><FaPhone /></a><a aria-label={t('installments.collections.whatsapp')} title={t('installments.collections.whatsapp')} href={`https://wa.me/${phone}?text=${encodeURIComponent(`${t('installments.collections.reminderGreeting')} ${row.member.fullName}, ${t('installments.collections.reminderBody')} ${money(row.remainingExpected)} · ${formatInstallmentsDisplayRef(row.committee.committeeNumber, 'committee')}`)}`} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><FaWhatsapp /></a></>}{editing ? <><button type="button" disabled={busy} aria-label={t('installments.collections.cancelEdit')} title={t('installments.collections.cancelEdit')} onClick={() => setEdit(null)} className="grid h-10 w-10 place-items-center rounded-xl border text-slate-600"><FaTimes /></button><button type="button" disabled={busy} aria-label={t('installments.collections.updateReceipt')} title={t('installments.collections.updateReceipt')} onClick={() => requestCorrection(row)} className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-white disabled:opacity-60"><FaCheck /></button></> : row.hasDailyReceipt ? canCorrect && <button type="button" disabled={busy} aria-label={t('installments.collections.editReceipt')} title={t('installments.collections.editReceipt')} onClick={() => beginEdit(row, rowKey)} className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><FaEdit /></button> : canReceive && row.remainingExpected > 0 && <button type="button" disabled={Boolean(postingKey) || !accountId} onClick={() => receive(row)} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? t('installments.collections.receiving') : t('installments.collections.receive')}</button>}</div></article>; })}{!loading && !data.rows.length && <p className="p-8 text-center text-sm font-semibold text-slate-500">{t('installments.collections.empty')}</p>}</div>
  </div>;
};

const CompactMetric = ({ label, value, tone = 'text-slate-900' }) => <span className="min-w-0 text-center text-[10px] font-bold text-slate-500 sm:whitespace-nowrap sm:text-start sm:text-xs">{label}<span className="hidden sm:inline">: </span><b className={`block truncate text-sm sm:inline ${tone}`}>{value}</b></span>;
const CollectionStatusIcon = ({ status }) => { const config = status === 'collected' ? [FaCheckCircle, 'text-emerald-600', 'paid'] : status === 'partial' ? [FaAdjust, 'text-amber-600', 'partial'] : status === 'overdue' ? [FaExclamationTriangle, 'text-rose-600', 'overdue'] : [FaClock, 'text-amber-500', 'pending']; const [StatusIcon, tone, label] = config; return <span role="img" aria-label={t(`installments.collections.${label}`)} title={t(`installments.collections.${label}`)} className={tone}><StatusIcon /></span>; };

const PayBill = ({ members = [], suppliers, accounts, defaultAccountId, payout = false }) => {
  const parties = payout ? [] : suppliers; const [partyId, setPartyId] = useState(''); const [context, setContext] = useState(null); const [committeeId, setCommitteeId] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [form, setForm] = useState(initialPayment(defaultAccountId)); const [key, setKey] = useState(createPaymentRequestKey()); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  useEffect(() => { setForm((current) => ({ ...current, accountId: current.accountId || defaultAccountId })); }, [defaultAccountId]);
  useEffect(() => {
    let current = true;
    setCommitteeId(''); setContext(null); setSuccess('');
    if (!partyId) { setContextLoading(false); return () => { current = false; }; }
    setError(''); setContextLoading(true);
    const request = payout ? getInstallmentsMemberPaymentContext(partyId) : getInstallmentsSupplierPaymentContext(partyId);
    request.then((data) => {
      if (!current) return;
      setContext(data); setContextLoading(false);
      if (payout && data.committees?.length === 1) setCommitteeId(data.committees[0]._id);
      else if (payout && !data.committees?.length) setError(t('installments.payments.noEligibleCommittee'));
    }).catch((e) => { if (current) { setContextLoading(false); setError(getError(e)); } });
    return () => { current = false; };
  }, [partyId, payout]);
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    const amount = Number(form.amount); const selected = context?.committees?.find((row) => row._id === committeeId);
    if (!partyId || (payout && !committeeId) || !form.transactionDate || !Number.isFinite(amount) || amount <= 0 || !form.accountId) { setError(t('installments.payments.validation.required')); return; }
    if (payout && (!selected || amount > Number(selected.verifiedAvailableAdvance || 0))) { setError(t('installments.payments.validation.exceedsRefundable')); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const data = payout ? await postInstallmentsSavingsPayout({ ...form, memberId: partyId, committeeId, confirmed: true }, key) : await postInstallmentsSupplierPayment({ ...form, supplierId: partyId }, key);
      setSuccess(`${data.message} — ${formatInstallmentsDisplayRef(data.transaction.referenceNumber, 'reference')}`); setKey(createPaymentRequestKey()); setForm(initialPayment(defaultAccountId));
      if (payout) { const refreshed = await getInstallmentsMemberPaymentContext(partyId); setContext(refreshed); setCommitteeId(refreshed.committees?.length === 1 ? refreshed.committees[0]._id : ''); }
      else { setContextLoading(true); try { setContext(await getInstallmentsSupplierPaymentContext(partyId)); } catch { setContext(null); } finally { setContextLoading(false); } }
    } catch (err) { setError(getError(err)); } finally { setBusy(false); }
  };
  const selectedCommittee = context?.committees?.find((row) => row._id === committeeId);
  if (!payout) return <form onSubmit={submit} className="space-y-3"><Notice error={error} success={success} />
    <div className="space-y-2 sm:hidden">
      <MobileSupplierAutocomplete suppliers={parties} value={partyId} onChange={(value) => { setPartyId(value); setCommitteeId(''); }} />

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="sr-only">{t('installments.payments.paymentDate')}</span>
          <span className="relative block">
            <FaCalendarAlt className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input required type="date" aria-label={t('installments.payments.paymentDate')} className={`${fieldClass} ps-9 pe-2 text-xs`} value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} />
          </span>
        </label>
        <label className="block">
          <span className="sr-only">{t('installments.payments.amount')}</span>
          <input required inputMode="decimal" aria-label={t('installments.payments.amount')} placeholder={t('installments.payments.amount')} className={fieldClass} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
        </label>
      </div>

      <MobileAccountSelect accounts={accounts} value={form.accountId} onChange={(accountId) => setForm((current) => ({ ...current, accountId }))} />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,.62fr)] gap-2">
        <label className="block">
          <span className="sr-only">{t('installments.payments.notesOptional')}</span>
          <input className={fieldClass} value={form.notes} placeholder={t('installments.payments.notesOptional')} aria-label={t('installments.payments.notesOptional')} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
        <output className="flex h-10 min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" aria-live="polite" aria-label={t('installments.payments.verifiedSupplierPayable')}>
          <span className="whitespace-nowrap">{t('installments.payments.verifiedSupplierPayable')}</span>
          <strong className="shrink-0 text-sm text-slate-900 dark:text-white">{contextLoading ? '…' : context ? money(context.payable) : '—'}</strong>
        </output>
      </div>

      <Submit busy={busy} className="w-full">{t('installments.payments.savePayment')}</Submit>
    </div>

    <div className="hidden gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.35fr)_170px_150px_minmax(220px,1fr)]">
      <Field label={t('installments.payments.supplier')}><SearchableSupplierSelect suppliers={parties} value={partyId} onChange={(value) => { setPartyId(value); setCommitteeId(''); }} /></Field>
      <PaymentFields form={form} setForm={setForm} accounts={accounts} />
    </div>
    <div className="hidden items-end gap-2 sm:grid sm:grid-cols-[minmax(260px,1fr)_minmax(150px,.35fr)_auto]">
      <Field label={t('installments.payments.notesOptional')}><input className={fieldClass} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
      <Field label={t('installments.payments.verifiedSupplierPayable')}><output className={`${fieldClass} flex items-center bg-slate-50`} aria-live="polite">{contextLoading ? '…' : context ? money(context.payable) : '—'}</output></Field>
      <Submit busy={busy}>{t('installments.payments.savePayment')}</Submit>
    </div>
  </form>;
  return <form onSubmit={submit} className="space-y-3"><Notice error={error} success={success} />
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.3fr)_minmax(220px,1fr)_minmax(190px,.8fr)_160px]">
      <Field label={t('installments.payments.member')}><SearchableMemberSelect members={members} value={partyId} onChange={setPartyId} /></Field>
      <Field label={t('installments.payments.committee')}><select required disabled={!context?.committees?.length} className={fieldClass} value={committeeId} onChange={(e) => setCommitteeId(e.target.value)}><option value="">{t('installments.payments.selectCommittee')}</option>{context?.committees?.map((row) => <option key={row._id} value={row._id}>{formatInstallmentsDisplayRef(row.committeeNumber, 'committee')} — {t(`installments.committees.frequencies.${row.schedule?.frequency}`)} — {money(row.verifiedAvailableAdvance)}</option>)}</select></Field>
      <div className="flex items-end"><div className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-extrabold text-slate-500"><span className="whitespace-nowrap">{t('installments.payments.verifiedRefundable')}:</span><b className="truncate text-sm text-emerald-700">{money(selectedCommittee?.verifiedAvailableAdvance || 0)}</b></div></div>
      <Field label={t('installments.payments.payoutAmount')}><input inputMode="decimal" className={fieldClass} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></Field>
    </div>
    <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_minmax(220px,1fr)_auto]">
      <Field label={t('installments.payments.paymentAccount')}><select required className={fieldClass} value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}><option value="">{t('installments.payments.selectAccount')}</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name} {account.code ? `— ${account.code}` : ''}</option>)}</select></Field>
      <Field label={t('installments.payments.date')}><input type="date" className={fieldClass} value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} /></Field>
      <Field label={t('installments.payments.notesOptional')}><input className={fieldClass} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
      <Submit busy={busy}>{t('installments.payments.confirmMemberPayout')}</Submit>
    </div>
  </form>;
};

const History = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const type = ['receipts', 'suppliers', 'payouts'].includes(requestedType) ? requestedType : 'receipts';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const reference = searchParams.get('reference') || '';
  const partySearch = searchParams.get('party') || '';
  const memberId = searchParams.get('memberId') || '';
  const supplierId = searchParams.get('supplierId') || '';
  const [data, setData] = useState({ rows: [], total: 0 }); const [error, setError] = useState('');
  const requestFilters = useMemo(() => ({ type, fromDate, toDate, reference, memberId, supplierId, limit: 100 }), [type, fromDate, toDate, reference, memberId, supplierId]);
  const load = useCallback(() => { setError(''); return getInstallmentsPaymentHistory(requestFilters).then(setData).catch((e) => setError(getError(e))); }, [requestFilters]);
  useEffect(() => { load(); }, [load]);
  const updateFilter = (key, value) => { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); };
  const selectType = (value) => { const next = new URLSearchParams(searchParams); next.set('type', value); next.delete('party'); next.delete('memberId'); next.delete('supplierId'); setSearchParams(next); };
  const query = partySearch.trim().toLocaleLowerCase();
  const visibleRows = data.rows.filter((row) => !query || [row.memberId?.fullName, row.memberId?.mobile, row.memberId?.memberNumber, row.supplierId?.name, row.supplierId?.phone, row.supplierId?.supplierNumber, row.referenceNumber, formatInstallmentsDisplayRef(row.referenceNumber, 'reference')].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  const print = (row) => { const party = row.memberId?.fullName || row.supplierId?.name || 'Customer'; const voucherTitle = row.transactionType === 'committee_savings_payout' ? t('installments.payments.memberPayoutVoucher') : t('installments.payments.paymentVoucher'); const popup = window.open('', '_blank', 'noopener,noreferrer'); if (!popup) return; popup.document.write(`<!doctype html><html><head><title>${escapeHtml(formatInstallmentsDisplayRef(row.referenceNumber, 'reference'))}</title><style>body{font-family:Arial;padding:32px;color:#172033}h1{color:#0756c7}dl{display:grid;grid-template-columns:150px 1fr;gap:10px}dt{font-weight:bold}footer{margin-top:35px;border-top:1px solid #ccc;padding-top:12px}</style></head><body><h1>${escapeHtml(voucherTitle)}</h1><dl><dt>Reference</dt><dd>${escapeHtml(formatInstallmentsDisplayRef(row.referenceNumber, 'reference'))}</dd><dt>Date</dt><dd>${escapeHtml(row.transactionDate)}</dd><dt>Party</dt><dd>${escapeHtml(party)}</dd><dt>Amount</dt><dd>${escapeHtml(money(row.amount))}</dd><dt>Payment Method</dt><dd>${escapeHtml(row.paymentMode || '-')}</dd><dt>Account</dt><dd>${escapeHtml(row.accountId?.name || 'Legacy / reconciliation required')}</dd><dt>Status</dt><dd>${escapeHtml(row.status)}</dd><dt>Notes</dt><dd>${escapeHtml(row.notes || '-')}</dd></dl><footer>Generated from the posted SmartKhaata transaction.</footer><script>window.onload=()=>window.print()</script></body></html>`); popup.document.close(); };
  return <div className="space-y-4"><Notice error={error} /><div className="flex flex-wrap gap-2">{[['receipts', t('installments.nav.customerReceiptsList')], ['suppliers', t('installments.nav.supplierPaymentsList')], ['payouts', t('installments.nav.memberPayoutHistory')]].map(([key, label]) => <button key={key} onClick={() => selectType(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${type === key ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><input type="date" aria-label={t('installments.members.fromDate')} className={fieldClass} value={fromDate} onChange={(e) => updateFilter('fromDate', e.target.value)} /><input type="date" aria-label={t('installments.members.toDate')} className={fieldClass} value={toDate} onChange={(e) => updateFilter('toDate', e.target.value)} /><input aria-label={t('installments.nav.referenceSearch')} placeholder={t('installments.nav.referenceSearch')} className={fieldClass} value={reference} onChange={(e) => updateFilter('reference', e.target.value)} /><input type="search" aria-label={t(type === 'suppliers' ? 'installments.nav.searchSupplierPayments' : 'installments.nav.searchMemberPayments')} placeholder={t(type === 'suppliers' ? 'installments.nav.searchSupplierPayments' : 'installments.nav.searchMemberPayments')} className={fieldClass} value={partySearch} onChange={(e) => updateFilter('party', e.target.value)} /></div>{(memberId || supplierId) && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">{t('installments.nav.specificPartyFilter')} <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('memberId'); next.delete('supplierId'); setSearchParams(next, { replace: true }); }} className="ms-2 underline">{t('installments.members.clear')}</button></p>}<div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 text-start">{t('installments.members.reference')}</th><th className="px-3 py-3 text-start">{t('installments.nav.dateParty')}</th><th className="px-3 py-3 text-start">{t('installments.sidebar.accounts')}</th><th className="px-3 py-3 text-end">{t('installments.payments.amount')}</th><th className="px-3 py-3 text-end">{t('actions')}</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row._id} className="border-t border-slate-100"><td className="px-3 py-3 font-bold">{formatInstallmentsDisplayRef(row.referenceNumber, 'reference')}{row.isLegacy && <span className="block text-[10px] text-amber-700">{t('installments.nav.legacyReconciliation')}</span>}</td><td className="px-3 py-3">{row.transactionDate}<span className="block text-xs text-slate-500">{row.memberId?.fullName || row.supplierId?.name || '-'}</span></td><td className="px-3 py-3">{row.accountId?.name || '-'}</td><td className="px-3 py-3 text-end font-black">{money(row.amount)}</td><td className="px-3 py-3"><div className="flex justify-end gap-2"><button aria-label={t('installments.nav.printVoucher')} onClick={() => print(row)} className="rounded-lg bg-blue-50 p-2 text-blue-700"><FaPrint /></button></div></td></tr>)}</tbody></table>{!visibleRows.length && <p className="p-8 text-center text-sm font-semibold text-slate-500">{t('installments.nav.noPayments')}</p>}</div></div>;
};

const InstallmentsPaymentsPage = ({ initialMode = '' }) => {
  const navigate = useNavigate(); const location = useLocation(); const [searchParams] = useSearchParams();
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isPaymentsLanding = !initialMode && normalizedPath === '/installments/payments' && !searchParams.get('mode');
  const routeMode = initialMode || (location.pathname.includes('/collections/') ? 'collections' : location.pathname.endsWith('/pay-bill') ? 'pay-bill' : location.pathname.endsWith('/history') ? 'history' : searchParams.get('mode') || 'receive');
  const allowed = modes.filter(([, , permission]) => hasPermission(permission)); const mode = allowed.some(([key]) => key === routeMode) ? routeMode : allowed[0]?.[0] || 'receive';
  const [members, setMembers] = useState([]); const [suppliers, setSuppliers] = useState([]); const [accountData, setAccountData] = useState({ accounts: [], defaultAccountId: null }); const [error, setError] = useState('');
  const presetMemberId = searchParams.get('memberId') || '';
  const presetCommitteeId = searchParams.get('committeeId') || '';
  const receivePreset = useMemo(() => presetMemberId ? { member: { _id: presetMemberId }, committee: presetCommitteeId ? { _id: presetCommitteeId } : null } : null, [presetMemberId, presetCommitteeId]);
  useEffect(() => {
    if (isPaymentsLanding) return;
    if (mode === 'history' || (mode === 'collections' && !hasPermission('installments.payments.receive'))) return;
    getInstallmentsPaymentLookups().then((data) => { setMembers(data.members || []); setSuppliers(data.suppliers || []); setAccountData(data || { accounts: [] }); }).catch((e) => setError(getError(e)));
  }, [isPaymentsLanding, mode]);
  const go = (next, fromMenu = false) => { const paths = { receive: '/installments/payments/receive', collections: '/installments/collections/today', 'pay-bill': '/installments/payments/pay-bill', history: '/installments/payments/history', payout: '/installments/payments?mode=payout' }; navigate(paths[next], fromMenu ? { state: { fromPaymentsMenu: true } } : undefined); };
  const content = useMemo(() => { const common = { accounts: accountData.accounts || [], defaultAccountId: defaultAccount(accountData) }; if (mode === 'collections') return <Collections members={members} committeeId={presetCommitteeId} {...common} />; if (mode === 'pay-bill') return <PayBill members={members} suppliers={suppliers} {...common} />; if (mode === 'payout') return <PayBill payout members={members} suppliers={suppliers} {...common} />; if (mode === 'history') return <History />; return <ReceiveForm members={members} preset={receivePreset} {...common} />; }, [mode, members, suppliers, accountData, presetCommitteeId, receivePreset]);
  if (isPaymentsLanding) return <main className="min-h-full bg-gradient-to-br from-slate-50 via-cyan-50/30 to-blue-50/60 p-3 sm:p-5">
    <div className="mx-auto max-w-5xl">
      <h1 className="sr-only">{t('installments.header.payments')}</h1>
      <nav aria-label={t('installments.payments.navigation')} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {allowed.map(([key, labelKey]) => {
          const MenuIcon = paymentMenuIcons[key];
          return <button key={key} type="button" onClick={() => go(key, true)} className="group flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-slate-700 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-800 hover:shadow-md focus-visible:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-200 active:translate-y-0">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 to-blue-100 text-cyan-700 transition group-hover:from-cyan-100 group-hover:to-blue-200" aria-hidden="true"><MenuIcon /></span>
            <span className="text-xs font-black leading-tight">{t(labelKey)}</span>
          </button>;
        })}
      </nav>
    </div>
  </main>;
  const showMobileMenuBack = Boolean(location.state?.fromPaymentsMenu);
  return <main className={`min-h-full bg-gradient-to-br from-slate-50 via-cyan-50/30 to-blue-50/60 ${mode === 'collections' ? 'px-2 pb-3 pt-1' : 'p-3'} sm:p-5`}><div className="mx-auto max-w-[1500px] sm:space-y-3"><nav aria-label={t('installments.payments.navigation')} className="hidden flex-wrap items-center gap-2 sm:flex">{allowed.map(([key, labelKey]) => key === 'history' ? <button key={key} type="button" onClick={() => go(key)} title={t(labelKey)} aria-label={t(labelKey)} aria-current={mode === key ? 'page' : undefined} className={`grid h-9 w-9 place-items-center rounded-xl text-sm ${mode === key ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white' : 'bg-white text-slate-600 shadow-sm'}`}><FaHistory /></button> : <button key={key} type="button" onClick={() => go(key)} aria-current={mode === key ? 'page' : undefined} className={`h-9 rounded-xl px-3 text-xs font-black ${mode === key ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{t(labelKey)}</button>)}</nav>{showMobileMenuBack && <button type="button" onClick={() => navigate(-1)} className="mb-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-black text-cyan-800 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-cyan-300 sm:hidden"><FaArrowLeft className="rtl:rotate-180" aria-hidden="true" />{t('back')}</button>}<Notice error={error} /><section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${mode === 'collections' ? 'p-2' : 'p-3'} sm:p-5`}>{content}</section></div></main>;
};

export default InstallmentsPaymentsPage;
