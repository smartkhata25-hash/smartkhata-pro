import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaDownload, FaPrint } from 'react-icons/fa';

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

  return (
    <TravelMasterPageFrame
      titleKey="employees.ledgerTitle"
      subtitleKey={moduleScope === 'travel' ? 'travel.employees.subtitle' : 'employees.subtitle'}
      actions={
        <>
          <TravelActionButton icon={FaArrowLeft} variant="secondary" onClick={() => navigate(moduleScope === 'travel' ? '/travel/employees' : '/employees')}>
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

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-auto">
              <table className="min-w-[760px] w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-normal text-slate-600">
                  <tr>
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.date')}</th>
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.description')}</th>
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.debit')}</th>
                    <th className="border border-slate-300 px-3 py-3">{t('payroll.columns.credit')}</th>
                    <th className="border border-slate-300 px-3 py-3">{t('employees.columns.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger?.rows || []).map((row, index) => (
                    <tr key={`${row._id}-${index}`} className="odd:bg-white even:bg-slate-50/40">
                      <td className="border-x border-slate-200 px-3 py-2.5">{row.formattedDate || '-'}</td>
                      <td className="border-x border-slate-200 px-3 py-2.5">{row.description || '-'}</td>
                      <td className="border-x border-slate-200 px-3 py-2.5">{formatTravelMoney(row.debit || 0)}</td>
                      <td className="border-x border-slate-200 px-3 py-2.5">{formatTravelMoney(row.credit || 0)}</td>
                      <td className="border-x border-slate-200 px-3 py-2.5">{formatTravelMoney(row.balance || 0)}</td>
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
