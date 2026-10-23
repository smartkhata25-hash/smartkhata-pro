import React, { useEffect, useState } from 'react';
import { FaPen, FaRedo } from 'react-icons/fa';
import InstallmentsDialog from '../InstallmentsDialog';

import { t } from '../../../i18n/i18n';
import { formatInstallmentsDisplayRef } from '../../../utils/installmentsDisplay';
import {
  createInstallmentsMember,
  getNextInstallmentsMemberNumber,
  updateInstallmentsMember,
} from '../../../services/installmentsMemberService';
import CommitteePlanForm, {
  emptyCommittee,
  isCommitteeBlank,
  validateCommittee,
} from './CommitteePlanForm';
import { getBusinessDateInputValue } from '../../../utils/localDateTime';

const localDate = () => getBusinessDateInputValue();

const emptyForm = () => ({
  fullName: '', mobile: '', alternateMobile: '', address: '', cnic: '', memberNumber: '',
  joiningDate: localDate(), notes: '', status: 'active', openingBalanceAmount: '0',
  openingBalanceType: 'receivable', openingBalanceDate: localDate(),
});

const formatCnic = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
};

const validPakistaniPhone = (value) => /^(?:03\d{9}|923\d{9}|3\d{9})$/.test(String(value || '').replace(/\D/g, ''));

const MemberFormModal = ({ open, member, initialName = '', onClose, onSaved, canManageOpening, canManageCommittees }) => {
  const [form, setForm] = useState(emptyForm());
  const [committee, setCommittee] = useState(() => emptyCommittee({ blank: true }));
  const [saving, setSaving] = useState(false);
  const [numberLoading, setNumberLoading] = useState(false);
  const [numberManual, setNumberManual] = useState(false);
  const [proposedNumber, setProposedNumber] = useState('');
  const [numberError, setNumberError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [committeeErrors, setCommitteeErrors] = useState({});
  const [error, setError] = useState('');

  const loadNextNumber = async () => {
    try {
      setNumberLoading(true);
      setNumberError('');
      const result = await getNextInstallmentsMemberNumber();
      if (!result?.number) throw new Error(t('installments.members.numberLoadError'));
      setProposedNumber(result.number);
      setForm((current) => ({ ...current, memberNumber: result.number }));
    } catch (requestError) {
      setNumberError(requestError.response?.data?.message || t('installments.members.numberLoadError'));
    } finally {
      setNumberLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setForm(member ? {
      fullName: member.fullName || '', mobile: member.mobile || '', alternateMobile: member.alternateMobile || '',
      address: member.address || '', cnic: member.cnic || '', memberNumber: member.memberNumber || '',
      joiningDate: member.joiningDate || localDate(), notes: member.notes || '', status: member.status || 'active',
      openingBalanceAmount: String(member.openingBalanceAmount || 0), openingBalanceType: member.openingBalanceType || 'receivable',
      openingBalanceDate: member.openingBalanceDate || member.joiningDate || localDate(),
    } : { ...emptyForm(), fullName: initialName });
    setCommittee(emptyCommittee({ blank: true }));
    setNumberManual(false);
    setProposedNumber(member?.memberNumber || '');
    setNumberError('');
    setFieldErrors({});
    setCommitteeErrors({});
    setError('');
    if (!member) loadNextNumber();
  // Opening the modal or changing the selected member intentionally resets the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member, initialName]);

  if (!open) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const committeeConfigured = !isCommitteeBlank(committee);
  const setRegistrationDate = (value) => setForm((current) => ({
    ...current,
    joiningDate: value,
    ...(!member ? { openingBalanceDate: value } : {}),
  }));
  const clearForm = () => {
    if (member) return;
    setForm((current) => ({ ...emptyForm(), memberNumber: proposedNumber || current.memberNumber }));
    setNumberManual(false);
    setCommittee(emptyCommittee({ blank: true }));
    setFieldErrors({});
    setCommitteeErrors({});
    setError('');
  };
  const toggleNumberEditing = () => {
    if (numberError) {
      loadNextNumber();
      return;
    }
    if (numberManual) {
      setNumberManual(false);
      loadNextNumber();
      return;
    }
    setNumberManual(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = t('installments.validation.fullName');
    if (!form.mobile.trim()) nextErrors.mobile = t('installments.validation.mobileRequired');
    else if (!validPakistaniPhone(form.mobile)) nextErrors.mobile = t('installments.validation.mobileInvalid');
    if (form.cnic && !/^\d{13}$/.test(form.cnic.replace(/\D/g, ''))) nextErrors.cnic = t('installments.validation.cnic');
    if (!member && !form.memberNumber) nextErrors.memberNumber = t('installments.validation.memberNumber');
    const nextCommitteeErrors = !member && canManageCommittees ? validateCommittee(committee) : {};
    setFieldErrors(nextErrors);
    setCommitteeErrors(nextCommitteeErrors);
    if (Object.keys(nextErrors).length || Object.keys(nextCommitteeErrors).length) {
      setError(t('installments.validation.fixFields'));
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = { ...form };
      if (!canManageOpening) {
        delete payload.openingBalanceAmount;
        delete payload.openingBalanceType;
        delete payload.openingBalanceDate;
      }
      if (!member) {
        payload.memberNumberManual = numberManual;
        if (canManageOpening) payload.openingBalanceDate = form.joiningDate;
        if (committeeConfigured) payload.firstCommittee = { ...committee, committeeNumber: undefined, notes: '' };
      }
      const result = member
        ? await updateInstallmentsMember(member._id, payload)
        : await createInstallmentsMember(payload);
      onSaved(result.member, { committeeCreated: Boolean(result.firstCommittee) });
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('installments.members.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = member ? t('common.saveChanges') : t('installments.members.saveMember');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-1.5 sm:p-4" role="dialog" aria-modal="true">
      <form noValidate onSubmit={submit} className="flex max-h-[98vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[96vh]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <style>{`.installments-input{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:.65rem;background:#fff;padding:.55rem .75rem;font-size:14px;color:#0f172a;outline:none}.installments-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}.installments-input[readonly]{background:#f8fafc;color:#475569}`}</style>

          <FormSection title={t('installments.members.memberDetails')} action={<button type="button" onClick={onClose} aria-label={t('cancel')} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100 focus:bg-slate-100">×</button>}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('installments.members.fullName')} required error={fieldErrors.fullName}><input autoFocus required value={form.fullName} onChange={(event) => set('fullName', event.target.value)} placeholder={t('installments.members.fullNamePlaceholder')} className="installments-input" /></Field>
              <Field label={t('installments.members.sharedNumber')} required error={fieldErrors.memberNumber || numberError}>
                <div className="relative"><input required value={(member || !numberManual) ? formatInstallmentsDisplayRef(form.memberNumber, 'member') : form.memberNumber} readOnly={Boolean(member) || !numberManual} onChange={(event) => set('memberNumber', event.target.value.replace(/\D/g, '').slice(0, 12))} placeholder={t('installments.members.numberLoading')} className="installments-input pe-11 font-black tracking-wider" />{!member && <button type="button" onClick={toggleNumberEditing} aria-label={numberError ? t('installments.members.retryNumber') : t('installments.members.editNumber')} className="absolute end-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-indigo-600 hover:bg-indigo-50">{numberLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /> : numberError ? <FaRedo /> : <FaPen />}</button>}</div>
              </Field>
              <Field label={t('installments.members.mobile')} required error={fieldErrors.mobile}><input type="tel" inputMode="tel" required value={form.mobile} onChange={(event) => set('mobile', event.target.value)} placeholder={t('installments.members.mobilePlaceholder')} className="installments-input" /></Field>
              <Field label={t('installments.members.cnic')} error={fieldErrors.cnic}><input inputMode="numeric" value={form.cnic} onChange={(event) => set('cnic', formatCnic(event.target.value))} placeholder={t('installments.members.cnicPlaceholder')} className="installments-input" /></Field>
              <Field label={t('installments.members.address')}><input value={form.address} onChange={(event) => set('address', event.target.value)} placeholder={t('installments.members.addressPlaceholder')} className="installments-input" /></Field>
              <Field label={t('installments.members.registrationDate')}><input type="date" value={form.joiningDate} onChange={(event) => setRegistrationDate(event.target.value)} className="installments-input" /></Field>
              {member && <Field label={t('installments.members.status')}><select value={form.status} onChange={(event) => set('status', event.target.value)} className="installments-input"><option value="active">{t('installments.members.active')}</option><option value="inactive">{t('installments.members.inactive')}</option></select></Field>}
            </div>
          </FormSection>

          {canManageOpening && <div className="mb-3 grid grid-cols-1 gap-3 px-1 sm:grid-cols-2"><Field label={t('installments.members.openingAmount')}><input type="number" inputMode="decimal" min="0" step="0.01" value={form.openingBalanceAmount} onChange={(event) => set('openingBalanceAmount', event.target.value)} placeholder={t('installments.members.openingAmountPlaceholder')} className="installments-input" /></Field><Field label={t('installments.members.openingType')}><select value={form.openingBalanceType} onChange={(event) => set('openingBalanceType', event.target.value)} className="installments-input"><option value="receivable">{t('installments.members.openingReceivable')}</option><option value="advance">{t('installments.members.openingPayable')}</option></select></Field></div>}

          {!member && canManageCommittees && <div className="mb-3 px-1"><CommitteePlanForm value={committee} onChange={setCommittee} showNumber={false} showNotes={false} errors={committeeErrors} /></div>}
          <div className="px-1"><Field label={t('installments.members.notesCompact')}><textarea rows="2" value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder={t('installments.members.notesCompactPlaceholder')} className="installments-input resize-none" /></Field></div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t bg-white px-3 py-3 sm:px-4">{!member && <button type="button" onClick={clearForm} className="me-auto min-h-10 rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">{t('installments.members.clear')}</button>}<button type="button" onClick={onClose} className={`${member ? 'ms-auto' : ''} min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700`}>{t('cancel')}</button><button disabled={saving || numberLoading} className="min-h-10 flex-1 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60 sm:flex-none">{saving ? t('installments.members.saving') : saveLabel}</button></div>
      </form>
      <InstallmentsDialog open={Boolean(error)} type="error" message={error} onClose={() => setError('')} onConfirm={() => setError('')} />
    </div>
  );
};

const FormSection = ({ title, action = null, children }) => <section className="mb-3 rounded-xl border border-slate-200 bg-white p-3"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{title}</h3>{action}</div>{children}</section>;
const Field = ({ label, children, full = false, required = false }) => <label className={full ? 'sm:col-span-2' : ''}><span className="mb-1 block text-xs font-bold text-slate-600">{label}{required && <span className="ms-1 text-rose-600">*</span>}</span>{children}</label>;

export default MemberFormModal;
