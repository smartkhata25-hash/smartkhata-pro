import React, { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../i18n/i18n';
import { previewInstallmentsSchedule } from '../../../services/installmentsMemberService';
import { formatInstallmentsMoney } from '../../../utils/installmentsMoney';
import { getBusinessDateInputValue } from '../../../utils/localDateTime';

const localDate = () => getBusinessDateInputValue();

const initialSchedule = (blank = false) => ({
  frequency: blank ? '' : 'daily', startDate: localDate(), weekday: 1,
  twiceMonthlyDays: [7, 22], monthlyDay: 1, intervalDays: 2,
});

export const emptyCommittee = ({ blank = false } = {}) => ({
  committeeNumber: '', targetAmount: blank ? '' : '50000',
  contributionAmount: blank ? '' : '500', status: 'active', notes: '',
  schedule: initialSchedule(blank),
});

export const isCommitteeBlank = (committee = {}) => (
  !String(committee.targetAmount || '').trim()
  && !String(committee.contributionAmount || '').trim()
  && !String(committee.schedule?.frequency || '').trim()
);

export const validateCommittee = (committee = {}) => {
  if (isCommitteeBlank(committee)) return {};
  const errors = {};
  const target = Number(committee.targetAmount);
  const contribution = Number(committee.contributionAmount);
  const schedule = committee.schedule || {};
  if (!Number.isFinite(target) || target <= 0) errors.targetAmount = t('installments.validation.committeeAmount');
  if (!Number.isFinite(contribution) || contribution <= 0) errors.contributionAmount = t('installments.validation.installmentAmount');
  if (!schedule.frequency) errors.frequency = t('installments.validation.frequency');
  if (!schedule.startDate) errors.startDate = t('installments.validation.startDate');
  if (schedule.frequency === 'weekly' && (!Number.isInteger(Number(schedule.weekday)) || Number(schedule.weekday) < 0 || Number(schedule.weekday) > 6)) errors.weekday = t('installments.validation.weekday');
  if (schedule.frequency === 'twice_monthly') {
    const days = schedule.twiceMonthlyDays || [];
    if (days.length !== 2 || days.some((day) => !Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 31) || Number(days[0]) === Number(days[1])) errors.twiceMonthlyDays = t('installments.validation.monthDays');
  }
  if (schedule.frequency === 'monthly' && (!Number.isInteger(Number(schedule.monthlyDay)) || Number(schedule.monthlyDay) < 1 || Number(schedule.monthlyDay) > 31)) errors.monthlyDay = t('installments.validation.monthDay');
  if (schedule.frequency === 'custom_days' && (!Number.isInteger(Number(schedule.intervalDays)) || Number(schedule.intervalDays) < 1 || Number(schedule.intervalDays) > 365)) errors.intervalDays = t('installments.validation.intervalDays');
  return errors;
};

const TARGET_PRESETS = ['30000', '50000', '70000', '100000'];
const INSTALLMENT_PRESETS = ['200', '300', '400', '500', '1000'];

const CommitteePlanForm = ({ value, onChange, showStatus = false, showNumber = true, showNotes = true, errors = {} }) => {
  const committee = value || emptyCommittee();
  const schedule = committee.schedule || initialSchedule();
  const [preview, setPreview] = useState(null);
  const [targetMode, setTargetMode] = useState(() => TARGET_PRESETS.includes(String(committee.targetAmount)) ? String(committee.targetAmount) : committee.targetAmount ? 'custom' : '');
  const [installmentMode, setInstallmentMode] = useState(() => INSTALLMENT_PRESETS.includes(String(committee.contributionAmount)) ? String(committee.contributionAmount) : committee.contributionAmount ? 'custom' : '');
  const customTargetRef = useRef(null);
  const customInstallmentRef = useRef(null);
  const setField = (key, next) => onChange({ ...committee, [key]: next });
  const setSchedule = (key, next) => setField('schedule', { ...schedule, [key]: next });
  const frequencyOptions = useMemo(() => ['daily', 'every_other_day', 'every_3_days', 'weekly', 'every_15_days', 'twice_monthly', 'monthly', 'custom_days'], []);

  useEffect(() => { if (targetMode === 'custom') customTargetRef.current?.focus(); }, [targetMode]);
  useEffect(() => { if (installmentMode === 'custom') customInstallmentRef.current?.focus(); }, [installmentMode]);

  useEffect(() => {
    setPreview(null);
    if (isCommitteeBlank(committee) || Object.keys(validateCommittee(committee)).length) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await previewInstallmentsSchedule({ targetAmount: Number(committee.targetAmount), contributionAmount: Number(committee.contributionAmount), schedule });
        if (active) setPreview(result);
      } catch {
        if (active) setPreview(null);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  // Only schedule-driving primitives should refresh the preview; notes/status must not.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee.targetAmount, committee.contributionAmount, schedule.frequency, schedule.startDate, schedule.weekday, schedule.monthlyDay, schedule.intervalDays, schedule.twiceMonthlyDays]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <style>{`.installments-input{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:.65rem;background:#fff;padding:.55rem .75rem;font-size:14px;color:#0f172a;outline:none}.installments-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}`}</style>
      {showNumber && <Field label={t('installments.committees.number')}><input value={committee.committeeNumber || ''} onChange={(event) => setField('committeeNumber', event.target.value.toUpperCase())} placeholder={t('installments.committees.automatic')} className="installments-input" /></Field>}
      {showStatus && <Field label={t('installments.committees.status')}><select value={committee.status === 'paused' ? 'paused' : 'active'} onChange={(event) => setField('status', event.target.value)} className="installments-input">{['active', 'paused'].map((item) => <option key={item} value={item}>{t(`installments.committees.statuses.${item}`)}</option>)}</select></Field>}
      <Field label={t('installments.committees.committeeAmount')} required error={errors.targetAmount}>
        <select value={targetMode} onChange={(event) => { const mode = event.target.value; setTargetMode(mode); setField('targetAmount', mode === 'custom' ? '' : mode); }} className="installments-input"><option value="">{t('installments.committees.selectCommitteeAmount')}</option>{TARGET_PRESETS.map((amount) => <option key={amount} value={amount}>{formatInstallmentsMoney(amount)}</option>)}<option value="custom">{t('installments.committees.custom')}</option></select>
        {targetMode === 'custom' && <input ref={customTargetRef} type="number" inputMode="decimal" min="1" step="0.01" value={committee.targetAmount || ''} onChange={(event) => setField('targetAmount', event.target.value)} placeholder={t('installments.committees.enterCustomCommitteeAmount')} className="installments-input mt-2" />}
      </Field>
      <Field label={t('installments.committees.paymentFrequency')} required error={errors.frequency}>
        <select value={schedule.frequency || ''} onChange={(event) => setSchedule('frequency', event.target.value)} className="installments-input"><option value="">{t('installments.committees.selectFrequency')}</option>{frequencyOptions.map((item) => <option key={item} value={item}>{t(`installments.committees.frequencies.${item}`)}</option>)}</select>
      </Field>
      <Field label={t('installments.committees.installmentAmount')} required error={errors.contributionAmount}>
        <select value={installmentMode} onChange={(event) => { const mode = event.target.value; setInstallmentMode(mode); setField('contributionAmount', mode === 'custom' ? '' : mode); }} className="installments-input"><option value="">{t('installments.committees.selectInstallmentAmount')}</option>{INSTALLMENT_PRESETS.map((amount) => <option key={amount} value={amount}>{formatInstallmentsMoney(amount)}</option>)}<option value="custom">{t('installments.committees.custom')}</option></select>
        {installmentMode === 'custom' && <input ref={customInstallmentRef} type="number" inputMode="decimal" min="1" step="0.01" value={committee.contributionAmount || ''} onChange={(event) => setField('contributionAmount', event.target.value)} placeholder={t('installments.committees.enterInstallmentAmount')} className="installments-input mt-2" />}
      </Field>
      <Field label={t('installments.committees.startDate')} required error={errors.startDate}><input type="date" value={schedule.startDate || ''} onChange={(event) => setSchedule('startDate', event.target.value)} className="installments-input" /></Field>
      {schedule.frequency === 'weekly' && <Field label={t('installments.committees.weekday')} required error={errors.weekday}><select value={schedule.weekday} onChange={(event) => setSchedule('weekday', Number(event.target.value))} className="installments-input">{[0, 1, 2, 3, 4, 5, 6].map((day) => <option key={day} value={day}>{t(`installments.committees.weekdays.${day}`)}</option>)}</select></Field>}
      {schedule.frequency === 'twice_monthly' && <Field label={t('installments.committees.monthDays')} required error={errors.twiceMonthlyDays}><div className="grid grid-cols-2 gap-2"><input aria-label={t('installments.committees.firstMonthDay')} type="number" inputMode="numeric" min="1" max="31" value={schedule.twiceMonthlyDays?.[0] || ''} onChange={(event) => setSchedule('twiceMonthlyDays', [Number(event.target.value), schedule.twiceMonthlyDays?.[1] || 22])} className="installments-input" /><input aria-label={t('installments.committees.secondMonthDay')} type="number" inputMode="numeric" min="1" max="31" value={schedule.twiceMonthlyDays?.[1] || ''} onChange={(event) => setSchedule('twiceMonthlyDays', [schedule.twiceMonthlyDays?.[0] || 7, Number(event.target.value)])} className="installments-input" /></div></Field>}
      {schedule.frequency === 'monthly' && <Field label={t('installments.committees.monthDay')} required error={errors.monthlyDay}><input type="number" inputMode="numeric" min="1" max="31" value={schedule.monthlyDay || ''} onChange={(event) => setSchedule('monthlyDay', Number(event.target.value))} className="installments-input" /></Field>}
      {schedule.frequency === 'custom_days' && <Field label={t('installments.committees.intervalDays')} required error={errors.intervalDays}><input type="number" inputMode="numeric" min="1" max="365" value={schedule.intervalDays || ''} onChange={(event) => setSchedule('intervalDays', Number(event.target.value))} className="installments-input" /></Field>}
      {showNotes && <Field label={t('installments.committees.notesOptional')} full><textarea rows="2" value={committee.notes || ''} onChange={(event) => setField('notes', event.target.value)} placeholder={t('installments.committees.notesPlaceholder')} className="installments-input resize-none" /></Field>}
      {preview && <p className="sm:col-span-2 text-sm font-black text-indigo-700" aria-live="polite">{t('installments.committees.totalInstallments')}: {preview.totalOccurrences}</p>}
    </div>
  );
};

const Field = ({ label, children, full = false, required = false }) => <label className={full ? 'sm:col-span-2' : ''}><span className="mb-1 block text-xs font-bold text-slate-600">{label}{required && <span className="ms-1 text-rose-600">*</span>}</span>{children}</label>;

export default CommitteePlanForm;
