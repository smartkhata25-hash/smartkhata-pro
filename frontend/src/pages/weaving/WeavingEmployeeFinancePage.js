import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaBalanceScale,
  FaBook,
  FaEdit,
  FaFilter,
  FaHandHoldingUsd,
  FaMoneyBillWave,
  FaPlus,
  FaRedo,
  FaSearch,
  FaTimes,
  FaTrash,
  FaUserTie,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { getValidPaymentAccounts } from '../../services/accountService';
import {
  EMPLOYEE_MODULE_SCOPES,
  createAdvanceLoan,
  getAdvanceLoans,
  getEmployees,
  recoverAdvanceLoan,
  updateAdvanceLoan,
  voidAdvanceLoan,
} from '../../services/employeeService';
import {
  formatBusinessDateForDisplay,
  getBusinessDateInputValue,
  getBusinessTimeInputValue,
} from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';
import {
  formatWeavingPayrollCycleLabel,
  getWeavingPayrollCycleOptions,
} from '../../utils/weavingPayrollCycle';

const MODULE_SCOPE = EMPLOYEE_MODULE_SCOPES.WEAVING;
const EMPTY_FORM = {
  kind: 'advance',
  employeeId: '',
  amount: '',
  paymentAccountId: '',
  date: getBusinessDateInputValue(),
  time: getBusinessTimeInputValue(),
  description: '',
  recoveryFrequency: 'carry_forward',
  targetCycleKey: '',
  installmentAmount: '',
  firstCycleKey: '',
};
const EMPTY_RECOVERY_FORM = {
  amount: '',
  paymentAccountId: '',
  date: getBusinessDateInputValue(),
  time: getBusinessTimeInputValue(),
  description: '',
};

const money = (value) =>
  `${t('currency.rs')} ${Number(value || 0).toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  })}`;

const getId = (value) => String(value?._id || value || '');

const getEmployeeLabel = (employee = {}) =>
  [employee.employeeNo, employee.name].filter(Boolean).join(' - ') || '-';

const getEntryEmployee = (entry = {}) =>
  entry.employeeId && typeof entry.employeeId === 'object' ? entry.employeeId : {};

const getEntryAccount = (entry = {}) =>
  entry.paymentAccountId && typeof entry.paymentAccountId === 'object'
    ? entry.paymentAccountId
    : {};

const getAccountLabel = (account = {}) =>
  [account.code, account.name].filter(Boolean).join(' - ') || account.name || '-';

const isRecovered = (entry) =>
  Number(entry?.recoveredAmount || 0) > 0 || (entry?.recoveryHistory || []).length > 0;

const getPlanLabel = (entry, cycleOptions) => {
  const plan = entry.recoveryPlan || {};
  const findCycle = (key) => cycleOptions.find((cycle) => cycle.key === key);

  if (entry.kind === 'loan') {
    const cycle = findCycle(plan.firstCycleKey);
    return [
      plan.frequency === 'monthly'
        ? t('weaving.employeeFinance.monthly')
        : t('weaving.employeeFinance.everyCycle'),
      money(plan.installmentAmount),
      cycle?.label || plan.firstCycleKey,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  const cycle = findCycle(plan.targetCycleKey);
  return [
    plan.frequency === 'one_time'
      ? t('weaving.employeeFinance.oneTime')
      : t('weaving.employeeFinance.carryForward'),
    cycle?.label || plan.targetCycleKey,
  ]
    .filter(Boolean)
    .join(' | ');
};

const StatusBadge = ({ status }) => {
  const isClosed = status === 'closed';
  const isVoid = status === 'void';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-normal ${
        isVoid
          ? 'bg-slate-100 text-slate-500'
          : isClosed
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
      }`}
    >
      {t(`weaving.employeeFinance.status.${status || 'active'}`)}
    </span>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-black uppercase tracking-normal text-slate-500">
      {label}
    </span>
    {children}
  </label>
);

const baseInputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const FinanceModal = ({
  entry,
  employees,
  accounts,
  cycleOptions,
  defaultAccountId,
  saving,
  error,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(entry?._id);
  const originalLocked = isEdit;
  const recovered = isRecovered(entry);
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState('');
  useWeavingFeedback(localError, setLocalError, { type: 'error' });

  const resetForm = useCallback(() => {
    const plan = entry?.recoveryPlan || {};
    const nextCycle = cycleOptions[2] || cycleOptions[0] || {};

    setForm({
      ...EMPTY_FORM,
      kind: entry?.kind || 'advance',
      employeeId: getId(entry?.employeeId),
      amount: entry?.amount ? String(entry.amount) : '',
      paymentAccountId: getId(entry?.paymentAccountId) || defaultAccountId || '',
      date: entry?.date ? getBusinessDateInputValue(entry.date) : getBusinessDateInputValue(),
      time: entry?.time || getBusinessTimeInputValue(),
      description: entry?.description || '',
      recoveryFrequency:
        plan.frequency || (entry?.kind === 'loan' ? 'every_payroll_cycle' : 'carry_forward'),
      targetCycleKey: plan.targetCycleKey || nextCycle.key || '',
      installmentAmount: plan.installmentAmount ? String(plan.installmentAmount) : '',
      firstCycleKey: plan.firstCycleKey || nextCycle.key || '',
    });
    setLocalError('');
  }, [cycleOptions, defaultAccountId, entry]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const updateField = (name, value) => {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'kind'
        ? {
            recoveryFrequency: value === 'loan' ? 'every_payroll_cycle' : 'carry_forward',
          }
        : {}),
    }));
  };

  const validate = () => {
    if (!form.employeeId) return t('weaving.employeeFinance.validation.employee');
    if (Number(form.amount || 0) <= 0) return t('weaving.employeeFinance.validation.amount');
    if (!form.paymentAccountId) return t('weaving.employeeFinance.validation.paymentAccount');

    if (form.kind === 'loan') {
      if (Number(form.installmentAmount || 0) <= 0) {
        return t('weaving.employeeFinance.validation.installment');
      }
      if (!form.firstCycleKey) return t('weaving.employeeFinance.validation.firstCycle');
      if (!form.recoveryFrequency) return t('weaving.employeeFinance.validation.frequency');
    } else if (!form.targetCycleKey) {
      return t('weaving.employeeFinance.validation.targetCycle');
    }

    return '';
  };

  const submit = async (keepOpen = false) => {
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const payload = {
      kind: form.kind,
      employeeId: form.employeeId,
      amount: Number(form.amount || 0),
      paymentAccountId: form.paymentAccountId,
      date: form.date,
      time: form.time,
      description: form.description,
      recoveryPlan:
        form.kind === 'loan'
          ? {
              frequency: form.recoveryFrequency,
              installmentAmount: Number(form.installmentAmount || 0),
              firstCycleKey: form.firstCycleKey,
            }
          : {
              frequency: form.recoveryFrequency,
              targetCycleKey: form.targetCycleKey,
            },
    };

    try {
      await onSave(payload, keepOpen);
    } catch (submitError) {
      return;
    }

    if (keepOpen && !isEdit) {
      setForm({
        ...EMPTY_FORM,
        paymentAccountId: defaultAccountId || '',
        date: getBusinessDateInputValue(),
        time: getBusinessTimeInputValue(),
        targetCycleKey: cycleOptions[2]?.key || cycleOptions[0]?.key || '',
        firstCycleKey: cycleOptions[2]?.key || cycleOptions[0]?.key || '',
      });
    }
  };

  const selectedCycle =
    form.kind === 'loan'
      ? cycleOptions.find((cycle) => cycle.key === form.firstCycleKey)
      : cycleOptions.find((cycle) => cycle.key === form.targetCycleKey);
  const estimatedInstallments =
    form.kind === 'loan' && Number(form.installmentAmount || 0) > 0
      ? Math.ceil(Number(form.amount || 0) / Number(form.installmentAmount || 1))
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              {isEdit
                ? t('weaving.employeeFinance.editTitle')
                : t('weaving.employeeFinance.newTitle')}
            </h2>
            <p className="text-sm font-semibold text-slate-500">
              {t('weaving.employeeFinance.formSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label={t('common.close')}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-4 py-4">
          {recovered && (
            <p className="mb-3 text-sm font-semibold text-slate-600">
              {t('weaving.employeeFinance.lockedAfterRecovery')}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('weaving.employeeFinance.type')}>
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1">
                {[
                  ['advance', t('weaving.employeeFinance.advance')],
                  ['loan', t('weaving.employeeFinance.loan')],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={originalLocked}
                    onClick={() => updateField('kind', value)}
                    className={`rounded-md px-3 py-2 text-sm font-black ${
                      form.kind === value
                        ? 'bg-white text-cyan-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('weaving.employeeFinance.employee')}>
              <select
                value={form.employeeId}
                disabled={originalLocked}
                onChange={(event) => updateField('employeeId', event.target.value)}
                className={baseInputClass}
              >
                <option value="">{t('common.select')}</option>
                {employees.map((employee) => (
                  <option key={employee._id} value={employee._id}>
                    {getEmployeeLabel(employee)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('weaving.employeeFinance.amount')}>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={recovered}
                value={form.amount}
                onChange={(event) => updateField('amount', event.target.value)}
                className={baseInputClass}
              />
            </Field>

            <Field label={t('weaving.employeeFinance.paymentAccount')}>
              <select
                value={form.paymentAccountId}
                disabled={recovered}
                onChange={(event) => updateField('paymentAccountId', event.target.value)}
                className={baseInputClass}
              >
                <option value="">{t('common.select')}</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('weaving.employeeFinance.date')}>
              <input
                type="date"
                disabled={recovered}
                value={form.date}
                onChange={(event) => updateField('date', event.target.value)}
                className={baseInputClass}
              />
            </Field>

            <Field label={t('weaving.employeeFinance.time')}>
              <input
                type="time"
                disabled={recovered}
                value={form.time}
                onChange={(event) => updateField('time', event.target.value)}
                className={baseInputClass}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/60 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              {form.kind === 'loan' ? (
                <>
                  <Field label={t('weaving.employeeFinance.installmentAmount')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.installmentAmount}
                      onChange={(event) => updateField('installmentAmount', event.target.value)}
                      className={baseInputClass}
                    />
                  </Field>

                  <Field label={t('weaving.employeeFinance.frequency')}>
                    <select
                      value={form.recoveryFrequency}
                      onChange={(event) => updateField('recoveryFrequency', event.target.value)}
                      className={baseInputClass}
                    >
                      <option value="every_payroll_cycle">
                        {t('weaving.employeeFinance.everyCycle')}
                      </option>
                      <option value="monthly">{t('weaving.employeeFinance.monthly')}</option>
                    </select>
                  </Field>

                  <Field label={t('weaving.employeeFinance.firstDeduction')}>
                    <select
                      value={form.firstCycleKey}
                      onChange={(event) => updateField('firstCycleKey', event.target.value)}
                      className={baseInputClass}
                    >
                      {cycleOptions.map((cycle) => (
                        <option key={cycle.key} value={cycle.key}>
                          {cycle.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="rounded-lg border border-white bg-white/80 p-3 text-sm font-bold text-slate-600">
                    <p>
                      {t('weaving.employeeFinance.originalLoan')}: {money(form.amount)}
                    </p>
                    <p>
                      {t('weaving.employeeFinance.estimatedInstallments')}:{' '}
                      {estimatedInstallments || '-'}
                    </p>
                    <p>
                      {t('weaving.employeeFinance.firstPayDate')}:{' '}
                      {selectedCycle ? formatBusinessDateForDisplay(selectedCycle.dueDate) : '-'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Field label={t('weaving.employeeFinance.advanceFrequency')}>
                    <select
                      value={form.recoveryFrequency}
                      onChange={(event) => updateField('recoveryFrequency', event.target.value)}
                      className={baseInputClass}
                    >
                      <option value="carry_forward">
                        {t('weaving.employeeFinance.carryForward')}
                      </option>
                      <option value="one_time">{t('weaving.employeeFinance.oneTime')}</option>
                    </select>
                  </Field>

                  <Field label={t('weaving.employeeFinance.targetCycle')}>
                    <select
                      value={form.targetCycleKey}
                      onChange={(event) => updateField('targetCycleKey', event.target.value)}
                      className={baseInputClass}
                    >
                      {cycleOptions.map((cycle) => (
                        <option key={cycle.key} value={cycle.key}>
                          {cycle.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2 rounded-lg border border-white bg-white/80 p-3 text-sm font-bold text-slate-600">
                    {selectedCycle
                      ? `${t('weaving.employeeFinance.deductFrom')}: ${formatWeavingPayrollCycleLabel(
                          selectedCycle,
                          t('weaving.employeeFinance.pay')
                        )}`
                      : t('weaving.employeeFinance.chooseCycle')}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <Field label={t('weaving.employeeFinance.note')}>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                className={`${baseInputClass} h-auto py-2`}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          {!isEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={resetForm}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <FaRedo aria-hidden="true" />
              {t('weaving.employeeFinance.clear')}
            </button>
          )}
          {isEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={resetForm}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <FaRedo aria-hidden="true" />
              {t('weaving.employeeFinance.reset')}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('travel.common.cancel')}
          </button>
          {!isEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-200 bg-white px-4 text-sm font-black text-cyan-700 hover:bg-cyan-50 disabled:opacity-60"
            >
              <FaPlus aria-hidden="true" />
              {t('weaving.employeeFinance.saveAndNew')}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(false)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-black text-white shadow-sm hover:bg-cyan-700 disabled:opacity-60"
          >
            <FaMoneyBillWave aria-hidden="true" />
            {isEdit ? t('weaving.employeeFinance.saveChanges') : t('weaving.employeeFinance.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

const ManualRecoveryModal = ({
  entry,
  accounts,
  defaultAccountId,
  saving,
  error,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY_RECOVERY_FORM,
    amount: entry?.outstandingAmount ? String(entry.outstandingAmount) : '',
    paymentAccountId: defaultAccountId || '',
    date: getBusinessDateInputValue(),
    time: getBusinessTimeInputValue(),
  }));
  const [localError, setLocalError] = useState('');
  useWeavingFeedback(localError, setLocalError, { type: 'error' });

  const submit = async () => {
    if (
      Number(form.amount || 0) <= 0 ||
      Number(form.amount || 0) > Number(entry.outstandingAmount || 0)
    ) {
      setLocalError(t('weaving.employeeFinance.validation.recoveryAmount'));
      return;
    }
    if (!form.paymentAccountId) {
      setLocalError(t('weaving.employeeFinance.validation.paymentAccount'));
      return;
    }

    await onSave({
      amount: Number(form.amount || 0),
      paymentAccountId: form.paymentAccountId,
      date: form.date,
      time: form.time,
      description: form.description,
    });
  };

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-cyan-500" />
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              {t('weaving.employeeFinance.manualRecovery')}
            </h2>
            <p className="text-sm font-semibold text-slate-500">
              {getEmployeeLabel(getEntryEmployee(entry))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label={t('common.close')}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
            {t('weaving.employeeFinance.outstanding')}: {money(entry.outstandingAmount)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('weaving.employeeFinance.amount')}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, amount: event.target.value }))
                }
                className={baseInputClass}
              />
            </Field>
            <Field label={t('weaving.employeeFinance.paymentAccount')}>
              <select
                value={form.paymentAccountId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, paymentAccountId: event.target.value }))
                }
                className={baseInputClass}
              >
                <option value="">{t('common.select')}</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('weaving.employeeFinance.date')}>
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, date: event.target.value }))
                }
                className={baseInputClass}
              />
            </Field>
            <Field label={t('weaving.employeeFinance.time')}>
              <input
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm((current) => ({ ...current, time: event.target.value }))
                }
                className={baseInputClass}
              />
            </Field>
          </div>
          <Field label={t('weaving.employeeFinance.note')}>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className={`${baseInputClass} h-auto py-2`}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('travel.common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <FaHandHoldingUsd aria-hidden="true" />
            {t('weaving.employeeFinance.saveRecovery')}
          </button>
        </div>
      </div>
    </div>
  );
};

const WeavingEmployeeFinancePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const cycleOptions = useMemo(
    () => getWeavingPayrollCycleOptions({ payText: t('weaving.employeeFinance.pay') }),
    []
  );
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const [modalError, setModalError] = useState('');
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [recoveryEntry, setRecoveryEntry] = useState(null);

  const canCreate = hasPermission('payroll.create');
  const canEdit = hasPermission('payroll.edit');
  const canPay = hasPermission('payroll.pay');
  const canDelete = hasPermission('payroll.delete');
  const canViewLedger = hasPermission('employees.view_ledger');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [entryData, employeeData, accountData] = await Promise.all([
        getAdvanceLoans({ moduleScope: MODULE_SCOPE }),
        getEmployees({ moduleScope: MODULE_SCOPE }),
        getValidPaymentAccounts({ moduleScope: MODULE_SCOPE }),
      ]);
      setEntries(Array.isArray(entryData) ? entryData : []);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
      setAccounts(Array.isArray(accountData) ? accountData : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('weaving.employeeFinance.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1' && canCreate) {
      setEditingEntry(null);
      setFinanceModalOpen(true);
    }
  }, [canCreate, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');

    if (!editId || !canEdit || !entries.length) return;

    const entry = entries.find((item) => item._id === editId);
    if (entry) {
      setEditingEntry(entry);
      setFinanceModalOpen(true);
    }
  }, [canEdit, entries, location.search]);

  const defaultAccountId = useMemo(() => {
    const preferred = accounts.find((account) => {
      const code = String(account.code || '').toUpperCase();
      const name = String(account.name || '').toLowerCase();
      return code === 'HANDCASH' || name.includes('hand cash') || name.includes('cash in hand');
    });

    return getId(preferred || accounts[0]);
  }, [accounts]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      const employee = getEntryEmployee(entry);
      const searchable = [employee.name, employee.employeeNo, entry.description, entry.kind]
        .join(' ')
        .toLowerCase();

      if (kindFilter !== 'all' && entry.kind !== kindFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (query && !searchable.includes(query)) return false;

      return true;
    });
  }, [entries, kindFilter, search, statusFilter]);

  const summary = useMemo(
    () =>
      entries.reduce(
        (totals, entry) => {
          if (entry.status === 'void') return totals;
          const outstanding = Number(entry.outstandingAmount || 0);

          if (entry.kind === 'loan') {
            totals.loanOutstanding += outstanding;
          } else {
            totals.advanceOutstanding += outstanding;
          }

          if (entry.status === 'active') totals.activeCount += 1;

          return totals;
        },
        {
          loanOutstanding: 0,
          advanceOutstanding: 0,
          activeCount: 0,
        }
      ),
    [entries]
  );

  const closeFinanceModal = () => {
    setFinanceModalOpen(false);
    setEditingEntry(null);
    setModalError('');

    const params = new URLSearchParams(location.search);

    if (params.get('new') === '1' || params.get('edit')) {
      navigate('/weaving/employee-finance', { replace: true });
    }
  };

  const saveFinance = async (payload, keepOpen) => {
    setSaving(true);
    setModalError('');

    try {
      if (editingEntry?._id) {
        await updateAdvanceLoan(editingEntry._id, payload, { moduleScope: MODULE_SCOPE });
      } else {
        await createAdvanceLoan(payload, { moduleScope: MODULE_SCOPE });
      }

      await loadData();
      if (!keepOpen) closeFinanceModal();
    } catch (saveError) {
      setModalError(saveError?.response?.data?.message || t('weaving.employeeFinance.saveFailed'));
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  const saveManualRecovery = async (payload) => {
    setSaving(true);
    setModalError('');

    try {
      await recoverAdvanceLoan(recoveryEntry._id, payload, { moduleScope: MODULE_SCOPE });
      setRecoveryEntry(null);
      await loadData();
    } catch (saveError) {
      setModalError(
        saveError?.response?.data?.message || t('weaving.employeeFinance.recoveryFailed')
      );
    } finally {
      setSaving(false);
    }
  };

  const voidEntry = async (entry) => {
    if (!await requestWeavingConfirmation({ message: t('weaving.employeeFinance.confirmVoid') })) return;

    setSaving(true);
    setError('');

    try {
      await voidAdvanceLoan(entry._id, {
        moduleScope: MODULE_SCOPE,
        data: { reason: t('weaving.employeeFinance.voidReason') },
      });
      await loadData();
    } catch (voidError) {
      setError(voidError?.response?.data?.message || t('weaving.employeeFinance.voidFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/70 p-3 sm:p-4 md:p-5 lg:p-6">
      <section className="mb-1 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />

        <div className="flex flex-col gap-2 px-3 py-2.5 xl:flex-row xl:items-center">
          <div className="flex flex-shrink-0 items-center gap-2.5 xl:min-w-[190px]">
            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-cyan-700 text-white shadow-sm">
              <FaHandHoldingUsd aria-hidden="true" />
            </span>

            <h1 className="whitespace-nowrap text-xl font-black text-slate-950">Loan Finance</h1>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-slate-50 px-2.5 py-2">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-600 text-xs text-white">
                <FaMoneyBillWave aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase text-rose-700">Loan</p>
                <p className="truncate text-sm font-black text-slate-950">
                  {money(summary.loanOutstanding)}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-slate-50 px-2.5 py-2">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-600 text-xs text-white">
                <FaHandHoldingUsd aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase text-amber-700">Kharcha</p>
                <p className="truncate text-sm font-black text-slate-950">
                  {money(summary.advanceOutstanding)}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 px-2.5 py-2">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-700 text-xs text-white">
                <FaBalanceScale aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase text-cyan-700">
                  Recoverable
                </p>
                <p className="truncate text-sm font-black text-slate-950">
                  {money(summary.loanOutstanding + summary.advanceOutstanding)}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-2.5 py-2">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs text-white">
                <FaUserTie aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase text-slate-700">Active</p>
                <p className="truncate text-sm font-black text-slate-950">
                  {summary.activeCount.toLocaleString('en-GB')}
                </p>
              </div>
            </div>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setEditingEntry(null);
                setFinanceModalOpen(true);
              }}
              className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 text-sm font-black text-white shadow-sm hover:bg-cyan-700"
            >
              <FaPlus aria-hidden="true" />
              Finance
            </button>
          )}
        </div>
      </section>

      <section className="mb-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px]">
          <div className="relative">
            <FaSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('weaving.employeeFinance.search')}
              className={`${baseInputClass} pl-9`}
            />
          </div>

          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
            className={baseInputClass}
          >
            <option value="all">{t('weaving.employeeFinance.filters.allTypes')}</option>
            <option value="advance">{t('weaving.employeeFinance.advance')}</option>
            <option value="loan">{t('weaving.employeeFinance.loan')}</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={baseInputClass}
          >
            <option value="active">{t('weaving.employeeFinance.status.active')}</option>
            <option value="closed">{t('weaving.employeeFinance.status.closed')}</option>
            <option value="all">{t('weaving.employeeFinance.filters.allStatuses')}</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-slate-900 text-[11px] font-black uppercase tracking-normal text-white">
              <tr>
                <th className="w-[18%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.employee')}
                </th>

                <th className="w-[10%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.type')}
                </th>

                <th className="w-[10%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.date')}
                </th>

                <th className="w-[10%] border border-slate-700 px-3 py-2.5">Amount</th>

                <th className="w-[10%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.recovered')}
                </th>

                <th className="w-[10%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.outstanding')}
                </th>

                <th className="w-[18%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.recoveryPlan')}
                </th>

                <th className="w-[8%] border border-slate-700 px-3 py-2.5">
                  {t('weaving.employeeFinance.statusLabel')}
                </th>

                <th className="w-[12%] border border-slate-700 px-3 py-2.5 text-center">
                  {t('travel.common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    {t('travel.common.loading')}
                  </td>
                </tr>
              ) : filteredEntries.length ? (
                filteredEntries.map((entry) => {
                  const employee = getEntryEmployee(entry);
                  const account = getEntryAccount(entry);
                  const active = entry.status === 'active';

                  return (
                    <tr
                      key={entry._id}
                      className="border-b border-slate-200 odd:bg-white even:bg-slate-50/40 hover:bg-cyan-50/50"
                    >
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                            <FaUserTie aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-950">
                              {employee.name || '-'}
                            </p>
                            <p className="truncate text-xs font-semibold text-slate-500">
                              {employee.employeeNo || getAccountLabel(account)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-bold text-slate-700">
                        {entry.kind === 'loan'
                          ? t('weaving.employeeFinance.loan')
                          : t('weaving.employeeFinance.advance')}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-semibold text-slate-600">
                        {formatBusinessDateForDisplay(entry.date)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-black text-slate-900">
                        {money(entry.amount)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-black text-emerald-700">
                        {money(entry.recoveredAmount)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-black text-rose-700">
                        {money(entry.outstandingAmount)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600">
                        {getPlanLabel(entry, cycleOptions) || '-'}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {canEdit && active && (
                            <button
                              type="button"
                              title={t('travel.common.edit')}
                              onClick={() => {
                                setEditingEntry(entry);
                                setFinanceModalOpen(true);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            >
                              <FaEdit aria-hidden="true" />
                            </button>
                          )}
                          {canViewLedger && employee._id && (
                            <button
                              type="button"
                              title={t('weaving.employees.actions.viewLedger')}
                              onClick={() => navigate(`/weaving/employees/${employee._id}/ledger`)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                            >
                              <FaBook aria-hidden="true" />
                            </button>
                          )}
                          {canPay && active && Number(entry.outstandingAmount || 0) > 0 && (
                            <button
                              type="button"
                              title={t('weaving.employeeFinance.manualRecovery')}
                              onClick={() => {
                                setModalError('');
                                setRecoveryEntry(entry);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              <FaHandHoldingUsd aria-hidden="true" />
                            </button>
                          )}
                          {canDelete && active && (
                            <button
                              type="button"
                              title={t('travel.common.delete')}
                              disabled={saving}
                              onClick={() => voidEntry(entry)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <FaTrash aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-sm font-bold text-slate-500"
                  >
                    <FaFilter className="mx-auto mb-2 text-xl text-slate-300" aria-hidden="true" />
                    {t('weaving.employeeFinance.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {financeModalOpen && (
        <FinanceModal
          entry={editingEntry}
          employees={employees}
          accounts={accounts}
          cycleOptions={cycleOptions}
          defaultAccountId={defaultAccountId}
          saving={saving}
          error={modalError}
          onClose={closeFinanceModal}
          onSave={saveFinance}
        />
      )}

      {recoveryEntry && (
        <ManualRecoveryModal
          entry={recoveryEntry}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          saving={saving}
          error={modalError}
          onClose={() => {
            setRecoveryEntry(null);
            setModalError('');
          }}
          onSave={saveManualRecovery}
        />
      )}
    </div>
  );
};

export default WeavingEmployeeFinancePage;
