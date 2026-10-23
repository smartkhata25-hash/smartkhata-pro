import React, { useEffect, useState } from 'react';
import { FaRedo } from 'react-icons/fa';

import InstallmentsDialog from '../InstallmentsDialog';
import { t } from '../../../i18n/i18n';
import { formatInstallmentsDisplayRef } from '../../../utils/installmentsDisplay';
import { createInstallmentsSupplier, getNextInstallmentsSupplierNumber, updateInstallmentsSupplier } from '../../../services/installmentsSupplierService';

const blank = () => ({ name: '', supplierNumber: '', phone: '', openingBalanceAmount: '0', openingBalanceType: 'payable', notes: '' });
const validPhone = (value) => !value || /^(?:03\d{9}|923\d{9}|3\d{9})$/.test(String(value).replace(/\D/g, ''));

const SupplierFormModal = ({ open, supplier, initialName = '', onClose, onSaved, canOpening }) => {
  const [form, setForm] = useState(blank()); const [proposal, setProposal] = useState(''); const [loadingNumber, setLoadingNumber] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const loadNumber = async () => { try { setLoadingNumber(true); setError(''); const result = await getNextInstallmentsSupplierNumber(); setProposal(result.number); set('supplierNumber', result.number); } catch (requestError) { setError(requestError.response?.data?.message || t('installments.suppliers.errors.number')); } finally { setLoadingNumber(false); } };
  useEffect(() => { if (!open) return; setError(''); if (supplier) { setForm({ name: supplier.name || '', supplierNumber: supplier.supplierNumber || '', phone: supplier.phone || '', openingBalanceAmount: String(supplier.openingBalanceAmount || 0), openingBalanceType: supplier.openingBalanceType || 'payable', notes: supplier.notes || '' }); setProposal(supplier.supplierNumber || ''); } else { setForm({ ...blank(), name: initialName }); setProposal(''); loadNumber(); } }, [open, supplier, initialName]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const clear = () => { setForm({ ...blank(), supplierNumber: proposal }); setError(''); };
  const submit = async (event) => { event.preventDefault(); const errors = []; if (!form.name.trim()) errors.push(t('installments.suppliers.validation.name')); if (!validPhone(form.phone)) errors.push(t('installments.suppliers.validation.phone')); if (!Number.isFinite(Number(form.openingBalanceAmount)) || Number(form.openingBalanceAmount) < 0) errors.push(t('installments.suppliers.validation.opening')); if (errors.length) { setError(errors.join('\n')); return; } try { setSaving(true); setError(''); const payload = { name: form.name, phone: form.phone, notes: form.notes, ...(canOpening ? { openingBalanceAmount: form.openingBalanceAmount, openingBalanceType: form.openingBalanceType } : {}) }; const result = supplier ? await updateInstallmentsSupplier(supplier._id, payload) : await createInstallmentsSupplier(payload); onSaved(result.supplier); } catch (requestError) { setError(requestError.response?.data?.message || t('installments.suppliers.errors.save')); } finally { setSaving(false); } };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-2" role="dialog" aria-modal="true">
    <form noValidate onSubmit={submit} className="flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
        <style>{`.supplier-input{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:.65rem;background:#fff;padding:.55rem .75rem;font-size:14px;outline:none}.supplier-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}.supplier-input[readonly]{background:#f8fafc}`}</style>
        <div className="mb-3 flex justify-end"><button type="button" onClick={onClose} aria-label={t('cancel')} className="grid h-9 w-9 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100">×</button></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('installments.suppliers.name')} required><input autoFocus value={form.name} onChange={(event) => set('name', event.target.value)} placeholder={t('installments.suppliers.namePlaceholder')} className="supplier-input" /></Field>
          <Field label={t('installments.suppliers.number')}><div className="relative"><input value={formatInstallmentsDisplayRef(form.supplierNumber, 'supplier')} readOnly placeholder={t('installments.suppliers.numberLoading')} className="supplier-input pe-10 font-black" />{loadingNumber && <span className="absolute end-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />}{!loadingNumber && !form.supplierNumber && <button type="button" onClick={loadNumber} className="absolute end-1.5 top-1.5 h-9 w-9 text-indigo-600"><FaRedo /></button>}</div></Field>
          <Field label={t('installments.suppliers.phone')}><input type="tel" inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder={t('installments.suppliers.phonePlaceholder')} className="supplier-input" /></Field>
          <Field label={t('installments.suppliers.openingAmount')}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.openingBalanceAmount} onChange={(event) => set('openingBalanceAmount', event.target.value)} className="supplier-input" disabled={!canOpening} /></Field>
          <Field label={t('installments.suppliers.balanceType')}><select value={form.openingBalanceType} onChange={(event) => set('openingBalanceType', event.target.value)} className="supplier-input" disabled={!canOpening}><option value="payable">{t('installments.suppliers.payable')}</option><option value="receivable">{t('installments.suppliers.receivable')}</option></select></Field>
          <Field label={t('installments.suppliers.notes')}><textarea rows="2" value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder={t('installments.suppliers.notesPlaceholder')} className="supplier-input resize-none" /></Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t px-3 py-3 sm:px-4">{!supplier && <button type="button" onClick={clear} className="me-auto min-h-10 rounded-lg bg-slate-100 px-4 text-sm font-bold text-slate-600">{t('common.clear')}</button>}<button type="button" onClick={onClose} className={`${supplier ? 'ms-auto' : ''} min-h-10 rounded-lg border px-4 text-sm font-bold`}>{t('cancel')}</button><button disabled={saving || loadingNumber} className="min-h-10 flex-1 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 text-sm font-bold text-white disabled:opacity-60 sm:flex-none">{saving ? t('installments.suppliers.saving') : supplier ? t('common.saveChanges') : t('installments.suppliers.save')}</button></div>
    </form>
    <InstallmentsDialog open={Boolean(error)} type="error" message={error} onClose={() => setError('')} onConfirm={() => setError('')} />
  </div>;
};

const Field = ({ label, required, children }) => <label><span className="mb-1 block text-xs font-bold text-slate-600">{label}{required && <b className="ms-1 text-rose-600">*</b>}</span>{children}</label>;

export default SupplierFormModal;
