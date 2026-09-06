import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaDownload, FaEdit, FaMoneyBillWave, FaPlus, FaPrint, FaTrash } from 'react-icons/fa';

import { t } from '../i18n/i18n';
import {
  TravelActionButton,
  TravelCardLine,
  TravelFormModal,
  TravelMasterList,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  formatTravelMoney,
} from '../components/travel/master/TravelMasterUI';
import { getValidPaymentAccounts } from '../services/accountService';
import {
  createAdvanceLoan,
  createPayroll,
  fetchEmployeePdf,
  fetchEmployeePrintHtml,
  getAdvanceLoans,
  getEmployeeSummary,
  getEmployees,
  getPayrolls,
  payPayroll,
  recoverAdvanceLoan,
  updatePayroll,
  voidAdvanceLoan,
  voidPayroll,
} from '../services/employeeService';
import { hasPermission } from '../utils/permissionHelper';

const todayKey = () => new Date().toISOString().slice(0, 10);
const currentPeriodKey = () => todayKey().slice(0, 7);

const EMPTY_PAYROLL_FORM = {
  employeeId: '',
  periodKey: currentPeriodKey(),
  salaryDate: todayKey(),
  salaryTime: '',
  baseSalary: '',
  additionType: 'bonus',
  additionAmount: '',
  additionDescription: '',
  deductionAmount: '',
  deductionDescription: '',
  recoveryAdvanceLoanId: '',
  recoveryAmount: '',
  paidAmount: '',
  paymentAccountId: '',
  notes: '',
};

const EMPTY_PAY_FORM = {
  amount: '',
  paymentAccountId: '',
  paymentDate: todayKey(),
  paymentTime: '',
};

const EMPTY_ADVANCE_FORM = {
  employeeId: '',
  kind: 'advance',
  amount: '',
  paymentAccountId: '',
  date: todayKey(),
  time: '',
  description: '',
};

const EMPTY_RECOVERY_FORM = {
  amount: '',
  paymentAccountId: '',
  date: todayKey(),
  time: '',
  description: '',
};

const dateLabel = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-GB');
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const EmployeePayrollPage = ({ moduleScope = 'trading' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'advance' ? 'advance' : 'payroll'
  );
  const [employees, setEmployees] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [advanceLoans, setAdvanceLoans] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [payrollFormOpen, setPayrollFormOpen] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState(null);
  const [payrollForm, setPayrollForm] = useState(EMPTY_PAYROLL_FORM);
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [payForm, setPayForm] = useState(EMPTY_PAY_FORM);
  const [advanceFormOpen, setAdvanceFormOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState(EMPTY_ADVANCE_FORM);
  const [recoveryFormOpen, setRecoveryFormOpen] = useState(false);
  const [selectedAdvanceLoan, setSelectedAdvanceLoan] = useState(null);
  const [recoveryForm, setRecoveryForm] = useState(EMPTY_RECOVERY_FORM);
  const [formError, setFormError] = useState('');

  const canCreate = hasPermission('payroll.create');
  const canEdit = hasPermission('payroll.edit');
  const canPay = hasPermission('payroll.pay');
  const canDelete = hasPermission('payroll.delete');
  const canPrint = hasPermission('payroll.print');

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError('');

    try {
      const [employeeRows, payrollRows, advanceRows, accounts, summaryData] = await Promise.all([
        getEmployees({ moduleScope, status: 'active' }),
        getPayrolls({ moduleScope }),
        getAdvanceLoans({ moduleScope }),
        getValidPaymentAccounts({ moduleScope, forceRefresh: false }),
        getEmployeeSummary({ moduleScope }),
      ]);

      setEmployees(Array.isArray(employeeRows) ? employeeRows : []);
      setPayrolls(Array.isArray(payrollRows) ? payrollRows : []);
      setAdvanceLoans(Array.isArray(advanceRows) ? advanceRows : []);
      setPaymentAccounts(Array.isArray(accounts) ? accounts : []);
      setSummary(summaryData || null);
    } catch (error) {
      setPageError(error?.response?.data?.message || t('payroll.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [moduleScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'advance' ? 'advance' : 'payroll');
  }, [searchParams]);

  const changeActiveTab = (tab) => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);

    if (tab === 'advance') {
      nextParams.set('tab', 'advance');
    } else {
      nextParams.delete('tab');
    }

    setSearchParams(nextParams, { replace: true });
  };

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({ value: employee._id, label: employee.name })),
    [employees]
  );

  const paymentAccountOptions = useMemo(
    () =>
      paymentAccounts.map((account) => ({
        value: account._id,
        label: `${account.name || account.code} (${account.category || 'account'})`,
      })),
    [paymentAccounts]
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee._id) === String(payrollForm.employeeId)),
    [employees, payrollForm.employeeId]
  );

  const recoveryOptions = useMemo(
    () =>
      advanceLoans
        .filter((entry) => {
          const sameEmployee = !payrollForm.employeeId || String(entry.employeeId?._id || entry.employeeId) === String(payrollForm.employeeId);
          return sameEmployee && Number(entry.outstandingAmount || 0) > 0;
        })
        .map((entry) => ({
          value: entry._id,
          label: `${entry.kind} - ${entry.employeeId?.name || '-'} - ${formatTravelMoney(entry.outstandingAmount || 0)}`,
        })),
    [advanceLoans, payrollForm.employeeId]
  );

  const openCreatePayroll = () => {
    setEditingPayroll(null);
    setPayrollForm(EMPTY_PAYROLL_FORM);
    setFormError('');
    setPayrollFormOpen(true);
  };

  const openEditPayroll = (payroll) => {
    setEditingPayroll(payroll);
    setPayrollForm({
      employeeId: payroll.employeeId?._id || payroll.employeeId || '',
      periodKey: payroll.periodKey || currentPeriodKey(),
      salaryDate: payroll.salaryDate ? new Date(payroll.salaryDate).toISOString().slice(0, 10) : todayKey(),
      salaryTime: payroll.salaryTime || '',
      baseSalary: payroll.baseSalary || '',
      additionType: payroll.additions?.[0]?.type || 'bonus',
      additionAmount: payroll.additions?.[0]?.amount || '',
      additionDescription: payroll.additions?.[0]?.description || '',
      deductionAmount: payroll.deductions?.[0]?.amount || '',
      deductionDescription: payroll.deductions?.[0]?.description || '',
      recoveryAdvanceLoanId: payroll.recoveryApplications?.[0]?.advanceLoanId || '',
      recoveryAmount: payroll.recoveryApplications?.[0]?.amount || '',
      paidAmount: payroll.paidAmount || '',
      paymentAccountId: payroll.paymentAccountId?._id || payroll.paymentAccountId || '',
      notes: payroll.notes || '',
    });
    setFormError('');
    setPayrollFormOpen(true);
  };

  const handlePayrollChange = (name, value) => {
    setPayrollForm((current) => {
      const next = { ...current, [name]: value };

      if (name === 'employeeId') {
        const employee = employees.find((item) => String(item._id) === String(value));
        if (employee && !editingPayroll) {
          next.baseSalary = employee.baseSalary || '';
        }
      }

      return next;
    });
  };

  const submitPayroll = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const selectedRecovery = advanceLoans.find(
        (entry) => String(entry._id) === String(payrollForm.recoveryAdvanceLoanId)
      );
      const payload = {
        moduleScope,
        employeeId: payrollForm.employeeId,
        periodKey: payrollForm.periodKey,
        salaryDate: payrollForm.salaryDate,
        salaryTime: payrollForm.salaryTime,
        baseSalary: Number(payrollForm.baseSalary || 0),
        additions: Number(payrollForm.additionAmount || 0) > 0
          ? [{ type: payrollForm.additionType || 'other', amount: Number(payrollForm.additionAmount), description: payrollForm.additionDescription }]
          : [],
        deductions: Number(payrollForm.deductionAmount || 0) > 0
          ? [{ amount: Number(payrollForm.deductionAmount), description: payrollForm.deductionDescription }]
          : [],
        recoveryApplications:
          selectedRecovery && Number(payrollForm.recoveryAmount || 0) > 0
            ? [{
                advanceLoanId: selectedRecovery._id,
                kind: selectedRecovery.kind,
                amount: Number(payrollForm.recoveryAmount),
                description: t('payroll.recoveredFromSalary'),
              }]
            : [],
        paidAmount: Number(payrollForm.paidAmount || 0),
        paymentAccountId: payrollForm.paymentAccountId,
        notes: payrollForm.notes,
      };

      if (editingPayroll?._id) {
        await updatePayroll(editingPayroll._id, payload, { moduleScope });
      } else {
        await createPayroll(payload, { moduleScope });
      }

      setPayrollFormOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error?.response?.data?.message || t('payroll.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openPayForm = (payroll) => {
    setSelectedPayroll(payroll);
    setPayForm({
      ...EMPTY_PAY_FORM,
      amount: payroll.remainingDue || '',
      paymentDate: todayKey(),
    });
    setFormError('');
    setPayFormOpen(true);
  };

  const submitPay = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      await payPayroll(
        selectedPayroll._id,
        {
          ...payForm,
          moduleScope,
          amount: Number(payForm.amount || 0),
        },
        { moduleScope }
      );
      setPayFormOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error?.response?.data?.message || t('payroll.payFailed'));
    } finally {
      setSaving(false);
    }
  };

  const submitAdvanceLoan = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      await createAdvanceLoan(
        {
          ...advanceForm,
          moduleScope,
          amount: Number(advanceForm.amount || 0),
        },
        { moduleScope }
      );
      setAdvanceFormOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error?.response?.data?.message || t('payroll.advanceSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openRecoveryForm = (entry) => {
    setSelectedAdvanceLoan(entry);
    setRecoveryForm({
      ...EMPTY_RECOVERY_FORM,
      amount: entry.outstandingAmount || '',
      date: todayKey(),
    });
    setFormError('');
    setRecoveryFormOpen(true);
  };

  const submitRecovery = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      await recoverAdvanceLoan(
        selectedAdvanceLoan._id,
        {
          ...recoveryForm,
          moduleScope,
          amount: Number(recoveryForm.amount || 0),
        },
        { moduleScope }
      );
      setRecoveryFormOpen(false);
      await loadData();
    } catch (error) {
      setFormError(error?.response?.data?.message || t('payroll.recoveryFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openPrint = async (path) => {
    const printWindow = window.open('', '_blank');
    const html = await fetchEmployeePrintHtml(path, { moduleScope });
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const downloadPdf = async (path, filename) => {
    const blob = await fetchEmployeePdf(path, { moduleScope });
    downloadBlob(blob, filename);
  };

  const handleVoidPayroll = async (payroll) => {
    if (!window.confirm(`${t('payroll.voidConfirm')}: ${payroll.employeeId?.name || '-'}`)) return;
    await voidPayroll(payroll._id, { moduleScope });
    await loadData();
  };

  const handleVoidAdvanceLoan = async (entry) => {
    if (!window.confirm(`${t('payroll.voidConfirm')}: ${entry.employeeId?.name || '-'}`)) return;
    await voidAdvanceLoan(entry._id, { moduleScope });
    await loadData();
  };

  const payrollColumns = [
    {
      key: 'employee',
      labelKey: 'employees.columns.employee',
      render: (payroll) => payroll.employeeId?.name || '-',
    },
    { key: 'periodKey', labelKey: 'payroll.columns.period' },
    {
      key: 'netSalary',
      labelKey: 'payroll.columns.netSalary',
      render: (payroll) => formatTravelMoney(payroll.netSalary || 0),
    },
    {
      key: 'paidAmount',
      labelKey: 'payroll.columns.paid',
      render: (payroll) => formatTravelMoney(payroll.paidAmount || 0),
    },
    {
      key: 'remainingDue',
      labelKey: 'payroll.columns.due',
      render: (payroll) => formatTravelMoney(payroll.remainingDue || 0),
    },
    {
      key: 'status',
      labelKey: 'employees.columns.status',
      render: (payroll) => payroll.status || '-',
    },
    {
      key: 'actions',
      labelKey: 'travel.common.actions',
      render: (payroll) => (
        <div className="flex flex-wrap gap-1.5">
          {canPay && Number(payroll.remainingDue || 0) > 0 && (
            <TravelActionButton icon={FaMoneyBillWave} variant="success" onClick={() => openPayForm(payroll)}>
              {t('payroll.pay')}
            </TravelActionButton>
          )}
          {canEdit && (
            <TravelActionButton icon={FaEdit} variant="secondary" onClick={() => openEditPayroll(payroll)}>
              {t('travel.common.edit')}
            </TravelActionButton>
          )}
          {canPrint && (
            <>
              <TravelActionButton icon={FaPrint} variant="soft" onClick={() => openPrint(`/payroll/${payroll._id}/print`)}>
                {t('travel.common.print')}
              </TravelActionButton>
              <TravelActionButton icon={FaDownload} variant="secondary" onClick={() => downloadPdf(`/payroll/${payroll._id}/pdf`, `Salary-${payroll.periodKey}.pdf`)}>
                PDF
              </TravelActionButton>
            </>
          )}
          {canDelete && (
            <TravelActionButton icon={FaTrash} variant="danger" onClick={() => handleVoidPayroll(payroll)}>
              {t('travel.common.delete')}
            </TravelActionButton>
          )}
        </div>
      ),
    },
  ];

  const advanceColumns = [
    {
      key: 'employee',
      labelKey: 'employees.columns.employee',
      render: (entry) => entry.employeeId?.name || '-',
    },
    { key: 'kind', labelKey: 'payroll.columns.type' },
    {
      key: 'amount',
      labelKey: 'payroll.columns.amount',
      render: (entry) => formatTravelMoney(entry.amount || 0),
    },
    {
      key: 'outstandingAmount',
      labelKey: 'payroll.columns.outstanding',
      render: (entry) => formatTravelMoney(entry.outstandingAmount || 0),
    },
    {
      key: 'date',
      labelKey: 'payroll.columns.date',
      render: (entry) => dateLabel(entry.date),
    },
    {
      key: 'actions',
      labelKey: 'travel.common.actions',
      render: (entry) => (
        <div className="flex flex-wrap gap-1.5">
          {canPay && Number(entry.outstandingAmount || 0) > 0 && (
            <TravelActionButton icon={FaMoneyBillWave} variant="success" onClick={() => openRecoveryForm(entry)}>
              {t('payroll.recover')}
            </TravelActionButton>
          )}
          {canDelete && (
            <TravelActionButton icon={FaTrash} variant="danger" onClick={() => handleVoidAdvanceLoan(entry)}>
              {t('travel.common.delete')}
            </TravelActionButton>
          )}
        </div>
      ),
    },
  ];

  const payrollFields = [
    { name: 'employeeId', labelKey: 'employees.fields.name', type: 'select', required: true, placeholderKey: 'payroll.placeholders.employee', options: employeeOptions },
    { name: 'periodKey', labelKey: 'payroll.fields.period', type: 'month', required: true },
    { name: 'salaryDate', labelKey: 'payroll.fields.salaryDate', type: 'date', required: true },
    { name: 'salaryTime', labelKey: 'payroll.fields.salaryTime', type: 'time' },
    { name: 'baseSalary', labelKey: 'employees.fields.baseSalary', type: 'number', min: 0, step: '0.01', required: true },
    {
      name: 'additionType',
      labelKey: 'payroll.fields.additionType',
      type: 'select',
      options: [
        { value: 'bonus', labelKey: 'payroll.additionTypes.bonus' },
        { value: 'commission', labelKey: 'payroll.additionTypes.commission' },
        { value: 'overtime', labelKey: 'payroll.additionTypes.overtime' },
        { value: 'other', labelKey: 'payroll.additionTypes.other' },
      ],
    },
    { name: 'additionAmount', labelKey: 'payroll.fields.additionAmount', type: 'number', min: 0, step: '0.01' },
    { name: 'additionDescription', labelKey: 'payroll.fields.additionDescription' },
    { name: 'deductionAmount', labelKey: 'payroll.fields.deductionAmount', type: 'number', min: 0, step: '0.01' },
    { name: 'deductionDescription', labelKey: 'payroll.fields.deductionDescription' },
    { name: 'recoveryAdvanceLoanId', labelKey: 'payroll.fields.recovery', type: 'select', placeholderKey: 'payroll.placeholders.recovery', options: recoveryOptions },
    { name: 'recoveryAmount', labelKey: 'payroll.fields.recoveryAmount', type: 'number', min: 0, step: '0.01' },
    { name: 'paidAmount', labelKey: 'payroll.fields.payNow', type: 'number', min: 0, step: '0.01' },
    { name: 'paymentAccountId', labelKey: 'payroll.fields.paymentAccount', type: 'select', placeholderKey: 'payroll.placeholders.paymentAccount', options: paymentAccountOptions },
    { name: 'notes', labelKey: 'employees.fields.notes', type: 'textarea', fullWidth: true },
  ];

  return (
    <TravelMasterPageFrame
      titleKey={moduleScope === 'travel' ? 'travel.payroll.title' : 'payroll.title'}
      subtitleKey={moduleScope === 'travel' ? 'travel.payroll.subtitle' : 'payroll.subtitle'}
      actions={
        <>
          {canCreate && (
            <TravelActionButton icon={FaPlus} onClick={openCreatePayroll}>
              {t('payroll.add')}
            </TravelActionButton>
          )}
          {canCreate && (
            <TravelActionButton icon={FaPlus} variant="secondary" onClick={() => { setAdvanceForm(EMPTY_ADVANCE_FORM); setAdvanceFormOpen(true); }}>
              {t('payroll.addAdvanceLoan')}
            </TravelActionButton>
          )}
        </>
      }
      filters={
        <TravelMasterToolbar>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {['payroll', 'advance'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => changeActiveTab(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${activeTab === tab ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}
              >
                {t(`payroll.tabs.${tab}`)}
              </button>
            ))}
          </div>
        </TravelMasterToolbar>
      }
    >
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['employees.summary.payable', formatTravelMoney(summary?.totalPayable || 0)],
          ['employees.summary.recoverable', formatTravelMoney(summary?.totalRecoverable || 0)],
          ['employees.summary.advanceOutstanding', formatTravelMoney(summary?.advanceOutstanding || 0)],
          ['employees.summary.loanOutstanding', formatTravelMoney(summary?.loanOutstanding || 0)],
        ].map(([labelKey, value]) => (
          <div key={labelKey} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t(labelKey)}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      ) : activeTab === 'payroll' ? (
        <TravelMasterList
          columns={payrollColumns}
          records={payrolls}
          emptyKey="payroll.empty"
          renderMobileCard={(payroll) => (
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-black text-slate-950">{payroll.employeeId?.name || '-'}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TravelCardLine labelKey="payroll.columns.period" value={payroll.periodKey} />
                <TravelCardLine labelKey="payroll.columns.due" value={formatTravelMoney(payroll.remainingDue || 0)} />
              </div>
            </div>
          )}
        />
      ) : (
        <TravelMasterList
          columns={advanceColumns}
          records={advanceLoans}
          emptyKey="payroll.advanceEmpty"
          renderMobileCard={(entry) => (
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-black text-slate-950">{entry.employeeId?.name || '-'}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TravelCardLine labelKey="payroll.columns.type" value={entry.kind} />
                <TravelCardLine labelKey="payroll.columns.outstanding" value={formatTravelMoney(entry.outstandingAmount || 0)} />
              </div>
            </div>
          )}
        />
      )}

      <TravelFormModal
        open={payrollFormOpen}
        titleKey="payroll.formTitle"
        modeKey={editingPayroll ? 'travel.common.edit' : 'travel.common.addWithDetails'}
        fields={payrollFields}
        values={payrollForm}
        onChange={handlePayrollChange}
        onClose={() => setPayrollFormOpen(false)}
        onSubmit={submitPayroll}
        submitting={saving}
        error={formError}
      >
        {selectedEmployee && (
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-900">
            {t('employees.columns.balance')}: {getEmployeeBalance(selectedEmployee)}
          </div>
        )}
      </TravelFormModal>

      <TravelFormModal
        open={payFormOpen}
        titleKey="payroll.paySalary"
        fields={[
          { name: 'amount', labelKey: 'payroll.fields.amount', type: 'number', min: 0, step: '0.01', required: true },
          { name: 'paymentAccountId', labelKey: 'payroll.fields.paymentAccount', type: 'select', required: true, placeholderKey: 'payroll.placeholders.paymentAccount', options: paymentAccountOptions },
          { name: 'paymentDate', labelKey: 'payroll.fields.paymentDate', type: 'date', required: true },
          { name: 'paymentTime', labelKey: 'payroll.fields.paymentTime', type: 'time' },
        ]}
        values={payForm}
        onChange={(name, value) => setPayForm((current) => ({ ...current, [name]: value }))}
        onClose={() => setPayFormOpen(false)}
        onSubmit={submitPay}
        submitting={saving}
        error={formError}
      />

      <TravelFormModal
        open={advanceFormOpen}
        titleKey="payroll.advanceLoanFormTitle"
        fields={[
          { name: 'employeeId', labelKey: 'employees.fields.name', type: 'select', required: true, placeholderKey: 'payroll.placeholders.employee', options: employeeOptions },
          { name: 'kind', labelKey: 'payroll.fields.type', type: 'select', options: [{ value: 'advance', labelKey: 'payroll.kind.advance' }, { value: 'loan', labelKey: 'payroll.kind.loan' }] },
          { name: 'amount', labelKey: 'payroll.fields.amount', type: 'number', min: 0, step: '0.01', required: true },
          { name: 'paymentAccountId', labelKey: 'payroll.fields.paymentAccount', type: 'select', required: true, placeholderKey: 'payroll.placeholders.paymentAccount', options: paymentAccountOptions },
          { name: 'date', labelKey: 'payroll.columns.date', type: 'date', required: true },
          { name: 'time', labelKey: 'payroll.fields.paymentTime', type: 'time' },
          { name: 'description', labelKey: 'employees.fields.notes', type: 'textarea', fullWidth: true },
        ]}
        values={advanceForm}
        onChange={(name, value) => setAdvanceForm((current) => ({ ...current, [name]: value }))}
        onClose={() => setAdvanceFormOpen(false)}
        onSubmit={submitAdvanceLoan}
        submitting={saving}
        error={formError}
      />

      <TravelFormModal
        open={recoveryFormOpen}
        titleKey="payroll.recoverAdvanceLoan"
        fields={[
          { name: 'amount', labelKey: 'payroll.fields.amount', type: 'number', min: 0, step: '0.01', required: true },
          { name: 'paymentAccountId', labelKey: 'payroll.fields.paymentAccount', type: 'select', required: true, placeholderKey: 'payroll.placeholders.paymentAccount', options: paymentAccountOptions },
          { name: 'date', labelKey: 'payroll.columns.date', type: 'date', required: true },
          { name: 'time', labelKey: 'payroll.fields.paymentTime', type: 'time' },
          { name: 'description', labelKey: 'employees.fields.notes', type: 'textarea', fullWidth: true },
        ]}
        values={recoveryForm}
        onChange={(name, value) => setRecoveryForm((current) => ({ ...current, [name]: value }))}
        onClose={() => setRecoveryFormOpen(false)}
        onSubmit={submitRecovery}
        submitting={saving}
        error={formError}
      />
    </TravelMasterPageFrame>
  );
};

const getEmployeeBalance = (employee) => {
  const payable = Number(employee.payableBalance || 0);
  const recoverable = Number(employee.recoverableBalance || 0);
  if (payable > 0) return `${formatTravelMoney(payable)} ${t('employees.payable')}`;
  if (recoverable > 0) return `${formatTravelMoney(recoverable)} ${t('employees.recoverable')}`;
  return t('employees.settled');
};

export default EmployeePayrollPage;
