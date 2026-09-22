import React, { useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';

import SearchableCreatableSelect from './SearchableCreatableSelect';
import { t } from '../../i18n/i18n';

const input = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const Field = ({ label, children, className = '' }) => <label className={`block text-sm font-medium text-slate-700 ${className}`}><span>{label}</span>{children}</label>;

export default function WeavingPostedSaleEditModal({ invoice, meta, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    invoiceDate: invoice.invoiceDate, partyId: invoice.partyId?._id || invoice.partyId,
    quantity: invoice.quantity, finalRate: invoice.finalRate, discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount, creditDays: invoice.creditDays, dueDate: invoice.dueDate || '',
    saleTerms: invoice.saleTerms || 'credit', receivedNow: invoice.receivedNowRequested || '',
    paymentAccountId: invoice.paymentAccountId || '', paymentMethod: invoice.paymentMethod || 'cash',
    rateOverrideReason: invoice.rateOverrideReason || '', notes: invoice.notes || '',
  });
  const patch = (next) => setForm((value) => ({ ...value, ...next }));
  const grand = useMemo(() => Math.max(0, Number(form.quantity || 0) * Number(form.finalRate || 0) - Number(form.discountAmount || 0) + Number(form.taxAmount || 0)), [form.quantity, form.finalRate, form.discountAmount, form.taxAmount]);
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-3"><section className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4"><h2 className="text-lg font-bold">Edit {invoice.invoiceNo}</h2><button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"><FaTimes /></button></header><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
    <Field label={t('weaving.sales.invoiceDate')}><input type="date" className={input} value={form.invoiceDate} onChange={(event) => patch({ invoiceDate: event.target.value })} /></Field>
    <SearchableCreatableSelect label={t('weaving.sales.party')} options={meta.parties} value={form.partyId} required onChange={(partyId) => patch({ partyId })} />
    <Field label={t('weaving.sales.quantity')}><input type="number" min="0" className={input} value={form.quantity} onChange={(event) => patch({ quantity: event.target.value })} /></Field>
    <Field label={t('weaving.sales.rate')}><input type="number" min="0" className={input} value={form.finalRate} onChange={(event) => patch({ finalRate: event.target.value })} /></Field>
    <Field label="Discount / Deduction"><input type="number" min="0" className={input} value={form.discountAmount} onChange={(event) => patch({ discountAmount: event.target.value })} /></Field>
    <Field label="Tax / Charges"><input type="number" min="0" className={input} value={form.taxAmount} onChange={(event) => patch({ taxAmount: event.target.value })} /></Field>
    <Field label={t('weaving.sales.creditDays')}><input type="number" min="0" className={input} value={form.creditDays} onChange={(event) => patch({ creditDays: event.target.value })} /></Field>
    <Field label={t('weaving.sales.dueDate')}><input type="date" className={input} value={form.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} /></Field>
    <Field label={t('weaving.sales.saleTerms')}><select className={input} value={form.saleTerms} onChange={(event) => patch({ saleTerms: event.target.value, receivedNow: event.target.value === 'paid' ? grand : '' })}><option value="credit">Credit</option><option value="paid">Paid Now</option><option value="partial">Partial</option></select></Field>
    {form.saleTerms !== 'credit' && <><Field label={t('weaving.sales.receivedNow')}><input type="number" min="0" max={grand} disabled={form.saleTerms === 'paid'} className={input} value={form.saleTerms === 'paid' ? grand : form.receivedNow} onChange={(event) => patch({ receivedNow: event.target.value })} /></Field><Field label={t('weaving.sales.paymentAccount')}><select className={input} value={form.paymentAccountId} onChange={(event) => patch({ paymentAccountId: event.target.value })}><option value="">Select Account</option>{meta.paymentAccounts.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></Field><Field label={t('weaving.sales.paymentMethod')}><select className={input} value={form.paymentMethod} onChange={(event) => patch({ paymentMethod: event.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="online">Online</option><option value="cheque">Cheque</option></select></Field></>}
    {Number(form.finalRate) !== Number(invoice.originalRate) && <Field label="Rate Override Reason" className="sm:col-span-2"><input className={input} value={form.rateOverrideReason} onChange={(event) => patch({ rateOverrideReason: event.target.value })} /></Field>}
    <Field label={t('weaving.sales.notes')} className="col-span-full"><textarea className={`${input} h-20 py-2`} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} /></Field>
    <div className="col-span-full flex items-center justify-between rounded-md bg-teal-50 p-4"><span>Grand Total</span><b>Rs. {grand.toLocaleString('en-PK')}</b></div><div className="col-span-full flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border px-3 text-sm font-semibold">Cancel</button><button type="button" disabled={saving} onClick={() => onSave({ ...form, receivedNow: form.saleTerms === 'paid' ? grand : form.receivedNow })} className="h-9 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving...' : 'Save'}</button></div>
  </div></section></div>;
}
