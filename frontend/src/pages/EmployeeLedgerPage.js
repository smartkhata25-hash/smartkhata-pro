import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBalanceScale,
  FaDownload,
  FaEdit,
  FaHandHoldingUsd,
  FaMoneyBillWave,
  FaPrint,
  FaUserTie,
} from 'react-icons/fa';

import { t } from '../i18n/i18n';
import {
  TravelActionButton,
  TravelMasterPageFrame,
  formatTravelMoney,
} from '../components/travel/master/TravelMasterUI';
import {
  fetchEmployeePdf,
  fetchEmployeePrintHtml,
  getEmployeeLedger,
} from '../services/employeeService';

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

const ledgerTypeLabels = {
  salary_due: 'weaving.employeeLedger.types.salaryDue',
  salary_paid: 'weaving.employeeLedger.types.salaryPaid',
  loan_given: 'weaving.employeeLedger.types.loanGiven',
  advance_given: 'weaving.employeeLedger.types.advanceGiven',
  loan_recovery: 'weaving.employeeLedger.types.loanRecovery',
  advance_recovery: 'weaving.employeeLedger.types.advanceRecovery',
  adjustment: 'weaving.employeeLedger.types.adjustment',
  reversal: 'weaving.employeeLedger.types.reversal',
};

const SummaryCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
  };

  return (
    <div className={`rounded-lg border ${tones[tone] || tones.slate} p-3 shadow-sm`}>
      <div className="flex items-center gap-2">
        <Icon className="flex-shrink-0" aria-hidden="true" />
        <span className="truncate text-xs font-black uppercase tracking-normal">{label}</span>
      </div>
      <p className="mt-1 text-base font-black text-slate-950">{value}</p>
    </div>
  );
};

const EmployeeLedgerPage = ({ moduleScope = 'trading' }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getEmployeeLedger(id, { moduleScope });
      setLedger(data || null);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('employees.ledgerLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id, moduleScope]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const openPrint = async () => {
    const printWindow = window.open('', '_blank');
    const html = await fetchEmployeePrintHtml(`/${id}/ledger/print`, { moduleScope });
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const downloadPdf = async () => {
    const blob = await fetchEmployeePdf(`/${id}/ledger/pdf`, { moduleScope });
    downloadBlob(blob, 'Employee-Ledger.pdf');
  };

  const totals = ledger?.totals || {};
  const isWeaving = moduleScope === 'weaving';
  const weavingTotals = totals.weaving || {};
  const backPath =
    moduleScope === 'travel'
      ? '/travel/employees'
      : isWeaving
        ? '/weaving/employees'
        : '/employees';
  const titleKey = isWeaving ? 'weaving.employeeLedger.title' : 'employees.ledgerTitle';
  const subtitleKey = isWeaving
    ? 'weaving.employeeLedger.subtitle'
    : moduleScope === 'travel'
      ? 'travel.employees.subtitle'
      : 'employees.subtitle';

  const getTypeLabel = (row) =>
    t(ledgerTypeLabels[row.transactionType] || 'weaving.employeeLedger.types.transaction');

  return (
    <TravelMasterPageFrame
      titleKey={titleKey}
      subtitleKey={subtitleKey}
      actions={
        <>
          <TravelActionButton icon={FaArrowLeft} variant="secondary" onClick={() => navigate(backPath)}>
            {t('travel.common.back')}
          </TravelActionButton>
          <TravelActionButton icon={FaPrint} variant="soft" onClick={openPrint}>
            {t('travel.common.print')}
          </TravelActionButton>
          <TravelActionButton icon={FaDownload} variant="secondary" onClick={downloadPdf}>
            PDF
          </TravelActionButton>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
          {t('travel.common.loading')}
        </div>
      ) : (
        <>
          {isWeaving ? (
            <section className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              <SummaryCard icon={FaUserTie} label={t('employees.columns.employee')} value={ledger?.employee?.name || '-'} tone="cyan" />
              <SummaryCard icon={FaMoneyBillWave} label={t('weaving.employeeLedger.salaryEarned')} value={formatTravelMoney(weavingTotals.salaryEarned || 0)} tone="emerald" />
              <SummaryCard icon={FaMoneyBillWave} label={t('weaving.employeeLedger.salaryPaid')} value={formatTravelMoney(weavingTotals.salaryPaid || 0)} tone="emerald" />
              <SummaryCard icon={FaBalanceScale} label={t('weaving.employeeLedger.salaryBalance')} value={formatTravelMoney(weavingTotals.salaryBalance || 0)} tone="amber" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.loanRemaining')} value={formatTravelMoney(weavingTotals.loanRemaining || 0)} tone="rose" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.advanceRemaining')} value={formatTravelMoney(weavingTotals.advanceRemaining || 0)} tone="amber" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.loanGiven')} value={formatTravelMoney(weavingTotals.loanGiven || 0)} tone="slate" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.loanRecovered')} value={formatTravelMoney(weavingTotals.loanRecovered || 0)} tone="emerald" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.advanceGiven')} value={formatTravelMoney(weavingTotals.advanceGiven || 0)} tone="slate" />
              <SummaryCard icon={FaHandHoldingUsd} label={t('weaving.employeeLedger.advanceRecovered')} value={formatTravelMoney(weavingTotals.advanceRecovered || 0)} tone="emerald" />
              <SummaryCard icon={FaBalanceScale} label={t('weaving.employeeLedger.companyPayable')} value={formatTravelMoney(weavingTotals.companyPayable || 0)} tone="emerald" />
              <SummaryCard icon={FaBalanceScale} label={t('weaving.employeeLedger.employeeReceivable')} value={formatTravelMoney(weavingTotals.employeeReceivable || 0)} tone="rose" />
              <SummaryCard icon={FaBalanceScale} label={t('weaving.employeeLedger.openingBalance')} value={formatTravelMoney(weavingTotals.openingBalance || 0)} tone="slate" />
              <SummaryCard icon={FaMoneyBillWave} label={t('weaving.employeeLedger.salaryDeductions')} value={formatTravelMoney(weavingTotals.salaryDeductions || 0)} tone="slate" />
              <SummaryCard icon={FaMoneyBillWave} label={t('weaving.employeeLedger.extras')} value={formatTravelMoney(weavingTotals.salaryExtras || 0)} tone="cyan" />
            </section>
          ) : (
            <section className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t('employees.columns.employee')}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{ledger?.employee?.name || '-'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t('employees.summary.payable')}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{formatTravelMoney(totals.payableBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t('employees.summary.recoverable')}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{formatTravelMoney(totals.recoverableBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-extrabold uppercase tracking-normal text-slate-400">{t('employees.summary.netPosition')}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{formatTravelMoney(totals.closingBalance || 0)}</p>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-auto">
              <table className={`${isWeaving ? 'min-w-[980px]' : 'min-w-[760px]'} w-full table-fixed border-collapse text-left text-sm`}>
                <thead className={`${isWeaving ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'} text-xs font-extrabold uppercase tracking-normal`}>
                  <tr>
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.date')}</th>
                    {isWeaving && (
                      <th className="border border-slate-300 px-3 py-3">{t('weaving.employeeLedger.transactionType')}</th>
                    )}
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.description')}</th>
                    <th className="border border-slate-300 px-3 py-3">
                      {isWeaving ? t('weaving.employeeLedger.employeeReceivable') : t('payroll.columns.debit')}
                    </th>
                    <th className="border border-slate-300 px-3 py-3">
                      {isWeaving ? t('weaving.employeeLedger.companyPayable') : t('payroll.columns.credit')}
                    </th>
                    <th className="border border-slate-300 px-3 py-3">{t('employees.columns.balance')}</th>
                    {isWeaving && (
                      <th className="border border-slate-300 px-3 py-3 text-center">{t('travel.common.actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(ledger?.rows || []).map((row, index) => (
                    <tr key={`${row._id}-${index}`} className="odd:bg-white even:bg-slate-50/40">
                      <td className="border-x border-slate-200 px-3 py-2.5">{row.formattedDate || '-'}</td>
                      {isWeaving && (
                        <td className="border-x border-slate-200 px-3 py-2.5">
                          <span className="inline-flex rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-700">
                            {getTypeLabel(row)}
                          </span>
                        </td>
                      )}
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <div className="font-semibold text-slate-700">{row.description || '-'}</div>
                        {row.informational && (
                          <div className="mt-1 text-xs font-black text-amber-700">
                            {t('weaving.employeeLedger.informationalRecovery')}
                          </div>
                        )}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-bold text-rose-700">
                        {formatTravelMoney(row.informational ? row.amount || 0 : row.debit || 0)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-bold text-emerald-700">
                        {row.informational ? '-' : formatTravelMoney(row.credit || 0)}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 font-black text-slate-900">{formatTravelMoney(row.balance || 0)}</td>
                      {isWeaving && (
                        <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                          {row.referenceModel === 'EmployeeAdvanceLoan' && row.referenceId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/weaving/employee-finance?edit=${row.referenceId}`)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              title={t('travel.common.edit')}
                            >
                              <FaEdit aria-hidden="true" />
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(ledger?.rows || []).length === 0 && (
              <div className="border-t border-slate-100 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                {t('employees.ledgerEmpty')}
              </div>
            )}
          </section>
        </>
      )}
    </TravelMasterPageFrame>
  );
};

export default EmployeeLedgerPage;
