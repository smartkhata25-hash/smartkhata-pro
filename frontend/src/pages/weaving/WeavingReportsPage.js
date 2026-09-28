import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  FaFilePdf,
  FaArrowLeft,
  FaFileInvoiceDollar,
  FaFilter,
  FaPrint,
  FaTimes,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';

import { getWeavingUnits } from '../../services/employeeService';

import { getValidPaymentAccounts } from '../../services/accountService';

import { payWeavingPayroll } from '../../services/weavingPayrollService';

import {
  downloadSalaryClosingPdf,
  fetchSalaryClosingPrintHtml,
  getSalaryClosingReport,
} from '../../services/weavingReportService';

import { hasPermission } from '../../utils/permissionHelper';

import { getBusinessDateInputValue, getBusinessTimeInputValue } from '../../utils/localDateTime';

import {
  showWeavingSuccess,
  showWeavingWarning,
  useWeavingFeedback,
} from '../../components/weaving/WeavingFeedbackModal';

import {
  deriveWeavingPayrollCycle,
  formatWeavingPayrollCycleLabel,
  getCurrentWeavingCycleKey,
  getWeavingPayrollCycleOptions,
} from '../../utils/weavingPayrollCycle';

const money = (value) =>
  Number(value || 0).toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  });

const emptySummary = {
  employees: 0,
  salary: 0,
  plus: 0,
  deduction: 0,
  loan: 0,
  kharcha: 0,
  netSalary: 0,
  paid: 0,
  payable: 0,
};

const buildPdfFilename = ({ cycleKey, unitName, unitId, segmentNo }) => {
  const safeUnit = String(unitId ? unitName || 'Unit' : 'All Units')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  const segmentSuffix = Number(segmentNo || 0) > 1 ? `-C${segmentNo}` : '';

  return `Salary-Closing-${cycleKey}${segmentSuffix}-${safeUnit || 'All-Units'}.pdf`;
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

const Amount = ({ value, important = false, mutedZero = true, grand = false }) => (
  <span
    className={`inline-block w-full text-center font-black ${
      grand ? 'text-lg text-slate-950' : important ? 'text-[15px] text-slate-950' : 'text-sm'
    } ${mutedZero && Number(value || 0) === 0 ? 'text-slate-400' : 'text-slate-900'}`}
  >
    {money(value)}
  </span>
);

const TableAmount = ({ value, payable = false, grand = false }) => (
  <td className="border-x border-slate-200 px-2.5 py-2 text-center align-middle">
    <Amount value={value} important={payable} grand={grand} />
  </td>
);

const TotalsRow = ({ label, totals, grand = false }) => (
  <tr className={grand ? 'bg-white' : 'bg-slate-100'}>
    <td
      colSpan={3}
      className={`border-y border-slate-300 px-3 py-2 font-black uppercase text-slate-900 ${
        grand ? 'border-t-4 border-slate-900 text-base' : ''
      }`}
    >
      {label}
    </td>

    <TableAmount value={totals.salary} />
    <TableAmount value={totals.plus} />
    <TableAmount value={totals.deduction} />
    <TableAmount value={totals.loan} />
    <TableAmount value={totals.kharcha} />

    <TableAmount value={totals.payable} payable grand={grand} />

    <td
      className={`border-y border-slate-300 px-2 ${grand ? 'border-t-4 border-slate-900' : ''}`}
    />
  </tr>
);

const WeavingSalaryClosingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const queryCycleKey = searchParams.get('cycleKey') || getCurrentWeavingCycleKey();

  const queryUnitId = searchParams.get('unitId') || '';

  const querySegmentNo = searchParams.get('segmentNo') || '';

  const [cycleKey, setCycleKey] = useState(() => deriveWeavingPayrollCycle(queryCycleKey).key);

  const [unitId, setUnitId] = useState(queryUnitId);

  const [segmentNo, setSegmentNo] = useState(querySegmentNo);

  const [report, setReport] = useState(null);

  const [units, setUnits] = useState([]);

  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const [payOpen, setPayOpen] = useState(false);

  const [selectedPayrollIds, setSelectedPayrollIds] = useState([]);

  const [payForm, setPayForm] = useState({
    paymentAccountId: '',
    paymentDate: getBusinessDateInputValue(),
    paymentTime: getBusinessTimeInputValue(),
  });

  const [loading, setLoading] = useState(true);

  const [printing, setPrinting] = useState(false);

  const [error, setError] = useState('');

  useWeavingFeedback(error, setError, { type: 'error' });

  const canPrint = hasPermission('payroll.print');

  const cycleOptions = useMemo(
    () =>
      getWeavingPayrollCycleOptions({
        baseCycleKey: cycleKey,
        before: 6,
        after: 6,
        payText: t('weaving.reports.pay'),
      }),
    [cycleKey]
  );

  const selectedCycle =
    cycleOptions.find((cycle) => cycle.key === cycleKey) || deriveWeavingPayrollCycle(cycleKey);

  const summary = report?.summary || emptySummary;

  const status = report?.status || {};

  const selection = report?.selection || {};

  const reportSegments = Array.isArray(report?.segments) ? report.segments : [];

  const activeSegmentNo = String(segmentNo || report?.cycle?.segmentNo || '');

  const periodValue =
    reportSegments.length > 1 && activeSegmentNo
      ? `segment:${activeSegmentNo}`
      : `cycle:${cycleKey}`;

  const officialBlocked = !status.canOfficialPrint;

  const syncUrl = useCallback(
    (nextCycleKey, nextUnitId, nextSegmentNo = segmentNo) => {
      const next = {};

      if (nextCycleKey) {
        next.cycleKey = nextCycleKey;
      }

      if (nextSegmentNo) {
        next.segmentNo = nextSegmentNo;
      }

      if (nextUnitId) {
        next.unitId = nextUnitId;
      }

      setSearchParams(next, { replace: true });
    },
    [segmentNo, setSearchParams]
  );

  const loadReport = useCallback(async () => {
    setLoading(true);

    setError('');

    try {
      const [reportData, unitData, accountData] = await Promise.all([
        getSalaryClosingReport({
          cycleKey,
          segmentNo,
          unitId,
        }),

        getWeavingUnits({
          moduleScope: 'weaving',
        }),

        getValidPaymentAccounts({
          moduleScope: 'weaving',
        }),
      ]);

      setReport(reportData || null);

      setUnits(Array.isArray(unitData) ? unitData : []);

      setPaymentAccounts(Array.isArray(accountData) ? accountData : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('weaving.reports.loadFailed'));

      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [cycleKey, segmentNo, unitId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const changeCycle = (nextCycleKey) => {
    setCycleKey(nextCycleKey);

    setSegmentNo('');

    syncUrl(nextCycleKey, unitId, '');
  };

  const changeUnit = (nextUnitId) => {
    setUnitId(nextUnitId);

    syncUrl(cycleKey, nextUnitId, segmentNo);
  };

  const changeSegment = (nextSegmentNo) => {
    setSegmentNo(nextSegmentNo);

    syncUrl(cycleKey, unitId, nextSegmentNo);
  };

  const changePeriod = (value) => {
    if (value.startsWith('segment:')) {
      changeSegment(value.slice('segment:'.length));

      return;
    }

    if (value.startsWith('cycle:')) {
      changeCycle(value.slice('cycle:'.length));
    }
  };

  const printReport = async () => {
    if (!canPrint || officialBlocked) {
      return;
    }

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      showWeavingWarning(t('alerts.printWindowBlocked'));

      return;
    }

    setPrinting(true);

    setError('');

    try {
      const html = await fetchSalaryClosingPrintHtml({
        cycleKey,
        segmentNo: activeSegmentNo,
        unitId,
      });

      printWindow.document.open();

      printWindow.document.write(html);

      printWindow.document.close();

      printWindow.focus();

      setTimeout(() => printWindow.print(), 350);
    } catch (printError) {
      printWindow.close();

      setError(printError?.response?.data?.message || t('weaving.reports.printFailed'));
    } finally {
      setPrinting(false);
    }
  };

  const downloadPdf = async () => {
    if (!canPrint || officialBlocked) {
      return;
    }

    setPrinting(true);

    setError('');

    try {
      const blob = await downloadSalaryClosingPdf({
        cycleKey,
        segmentNo: activeSegmentNo,
        unitId,
      });

      downloadBlob(
        blob,
        buildPdfFilename({
          cycleKey,
          segmentNo: activeSegmentNo,
          unitId,
          unitName: selection.unitName,
        })
      );
    } catch (pdfError) {
      setError(pdfError?.response?.data?.message || t('weaving.reports.pdfFailed'));
    } finally {
      setPrinting(false);
    }
  };

  const printDisabled = !canPrint || officialBlocked || loading || printing;

  const openPayment = () => {
    const ids = (report?.rows || [])
      .filter((row) => Number(row.payable || 0) > 0)
      .map((row) => row.payrollId);

    setSelectedPayrollIds(ids);

    setPayForm((current) => ({
      ...current,

      paymentAccountId: current.paymentAccountId || paymentAccounts[0]?._id || '',
    }));

    setPayOpen(true);
  };

  const paySelected = async () => {
    setPrinting(true);

    setError('');

    try {
      for (const row of (report?.rows || []).filter(
        (item) => selectedPayrollIds.includes(item.payrollId) && Number(item.payable || 0) > 0
      )) {
        await payWeavingPayroll(row.payrollId, {
          amount: row.payable,

          ...payForm,

          receivedBy: 'self',

          note: 'Paid from Salary Closing',
        });
      }

      setPayOpen(false);

      showWeavingSuccess('Salary payments saved.');

      await loadReport();
    } catch (payError) {
      setError(payError?.response?.data?.message || 'Salary payment failed.');

      await loadReport();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-5 lg:p-6">
      {/* Compact Salary Closing Header */}
      <section className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />

        <div className="flex flex-col gap-2 px-3 py-2.5 xl:flex-row xl:items-center">
          {/* LEFT */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/weaving/payroll')}
              title="Back"
              aria-label="Back"
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <FaArrowLeft aria-hidden="true" />
            </button>

            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-cyan-700 text-white shadow-sm">
              <FaFileInvoiceDollar aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-black leading-tight text-slate-950">
                  Salary Closing
                </h1>

                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    Number(summary.payable || 0) <= 0 && Number(summary.netSalary || 0) > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : Number(summary.paid || 0) > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-cyan-100 text-cyan-800'
                  }`}
                >
                  {Number(summary.payable || 0) <= 0 && Number(summary.netSalary || 0) > 0
                    ? 'Paid'
                    : Number(summary.paid || 0) > 0
                      ? 'Partially Paid'
                      : 'Finalized'}
                </span>
              </div>

              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                {report?.cycle?.periodLabel ||
                  formatWeavingPayrollCycleLabel(selectedCycle, t('weaving.reports.pay'))}
              </p>
            </div>
          </div>

          {/* CENTER — EMP + Payable Amount */}
          <div className="flex flex-shrink-0 items-center gap-3 whitespace-nowrap rounded-md bg-slate-50 px-3 py-1.5 xl:bg-transparent xl:px-2">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">
              EMP <span className="text-base text-slate-950">{money(summary.employees)}</span>
            </span>

            <span className="h-5 w-px bg-slate-300" />

            <span className="text-xl font-black tracking-tight text-emerald-700" title="Payable">
              {money(summary.payable)}
            </span>
          </div>

          {/* RIGHT — Period + Unit + Icons + Pay */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:ml-auto xl:justify-end">
            {/* PERIOD */}
            <div className="flex items-center gap-1.5">
              <span className="hidden text-[10px] font-black uppercase text-slate-400 sm:inline">
                {t('weaving.reports.period')}
              </span>

              <label className="relative block">
                <FaFilter
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"
                  aria-hidden="true"
                />

                <select
                  value={periodValue}
                  onChange={(event) => changePeriod(event.target.value)}
                  className="h-9 w-[180px] appearance-none rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-black text-slate-700 outline-none transition hover:border-slate-300 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                  title="Period"
                >
                  {reportSegments.length > 1 ? (
                    <optgroup label="Closing Ranges">
                      {reportSegments.map((segment) => (
                        <option
                          key={`segment-${segment.segmentNo}`}
                          value={`segment:${segment.segmentNo}`}
                        >
                          {segment.segmentStart === segment.segmentEnd
                            ? segment.segmentStart
                            : `${segment.segmentStart} to ${segment.segmentEnd}`}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}

                  <optgroup label="Payroll Cycles">
                    {cycleOptions.map((cycle) => (
                      <option key={`cycle-${cycle.key}`} value={`cycle:${cycle.key}`}>
                        {String(cycle.label || '').split(' - Pay')[0]}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            </div>

            {/* UNIT */}
            <div className="flex items-center gap-1.5">
              <span className="hidden text-[10px] font-black uppercase text-slate-400 sm:inline">
                {t('weaving.reports.unit')}
              </span>

              <label className="relative block">
                <FaFilter
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"
                  aria-hidden="true"
                />

                <select
                  value={unitId}
                  onChange={(event) => changeUnit(event.target.value)}
                  className="h-9 w-[125px] appearance-none rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-black text-slate-700 outline-none transition hover:border-slate-300 focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                  title="Unit"
                >
                  <option value="">{t('weaving.reports.allUnits')}</option>

                  {units.map((unit) => (
                    <option key={unit._id} value={unit._id}>
                      {unit.name || `Unit ${unit.unitNo}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* PRINT ICON */}
            <button
              type="button"
              onClick={printReport}
              disabled={printDisabled}
              title="Print"
              aria-label="Print Salary Closing"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaPrint aria-hidden="true" />
            </button>

            {/* PDF ICON */}
            <button
              type="button"
              onClick={downloadPdf}
              disabled={printDisabled}
              title="PDF"
              aria-label="Download Salary Closing PDF"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-rose-600 text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaFilePdf aria-hidden="true" />
            </button>

            {/* PAY */}
            <button
              type="button"
              disabled={loading || printing || Number(summary.payable || 0) <= 0}
              onClick={openPayment}
              className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-700 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Pay
            </button>
          </div>
        </div>
      </section>

      {/* PAYMENT MODAL */}
      {payOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Pay salary closing"
        >
          <section className="w-full max-w-2xl rounded-lg border border-emerald-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-black text-slate-950">Pay Salary Closing</h2>

                <p className="text-xs font-bold text-slate-500">
                  {report?.cycle?.periodLabel || '-'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100"
                aria-label="Close payment"
              >
                <FaTimes />
              </button>
            </header>

            <div className="p-4">
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  value={payForm.paymentAccountId}
                  onChange={(event) =>
                    setPayForm({
                      ...payForm,
                      paymentAccountId: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                >
                  <option value="">Payment Account</option>

                  {paymentAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.code ? `${account.code} - ` : ''}
                      {account.name}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={(event) =>
                    setPayForm({
                      ...payForm,
                      paymentDate: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                />

                <input
                  type="time"
                  value={payForm.paymentTime}
                  onChange={(event) =>
                    setPayForm({
                      ...payForm,
                      paymentTime: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                />
              </div>

              <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {(report?.rows || [])
                  .filter((row) => Number(row.payable || 0) > 0)
                  .map((row) => (
                    <label
                      key={row.payrollId}
                      className="flex items-center gap-2 rounded border p-2 text-sm font-bold"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPayrollIds.includes(row.payrollId)}
                        onChange={() =>
                          setSelectedPayrollIds((current) =>
                            current.includes(row.payrollId)
                              ? current.filter((id) => id !== row.payrollId)
                              : [...current, row.payrollId]
                          )
                        }
                      />

                      {row.employeeName}
                      {' — '}
                      {money(row.payable)}
                    </label>
                  ))}
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayOpen(false)}
                  className="h-10 rounded-lg border px-4 font-bold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    !payForm.paymentAccountId || selectedPayrollIds.length === 0 || printing
                  }
                  onClick={paySelected}
                  className="h-10 rounded-lg bg-emerald-700 px-4 font-black text-white disabled:opacity-40"
                >
                  Pay Selected
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* SALARY CLOSING TABLE */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm font-black text-slate-500">
            {t('travel.common.loading')}
          </div>
        ) : report?.rows?.length ? (
          <div className="overflow-auto">
            <table className="min-w-[1120px] w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-xs font-black uppercase tracking-normal text-white">
                <tr>
                  <th className="w-12 border border-slate-700 px-2 py-3 text-center">#</th>

                  <th className="w-[220px] border border-slate-700 px-3 py-3 text-left">
                    {t('weaving.reports.employee')}
                  </th>

                  <th className="w-[135px] border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.department')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.salary')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.plus')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.deduction')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.loan')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.kharcha')}
                  </th>

                  <th className="border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.payable')}
                  </th>

                  <th className="w-[135px] border border-slate-700 px-3 py-3 text-center">
                    {t('weaving.reports.signThumb')}
                  </th>
                </tr>
              </thead>

              {(report.groups || []).map((group) => (
                <tbody key={group.unitId || group.unitName}>
                  <tr className="bg-slate-100">
                    <td
                      colSpan={10}
                      className="border-y border-slate-300 px-3 py-2 font-black uppercase text-slate-900"
                    >
                      {group.unitName || t('weaving.reports.noUnit')}
                    </td>
                  </tr>

                  {(group.rows || []).map((row, index) => (
                    <tr
                      key={row.payrollId}
                      className="odd:bg-white even:bg-slate-50/50 hover:bg-cyan-50/40"
                    >
                      <td className="border-x border-slate-200 px-2 py-2.5 text-center text-xs font-black text-slate-400">
                        {index + 1}
                      </td>

                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <p className="truncate font-black text-slate-950">
                          {row.employeeName || '-'}
                        </p>

                        <p className="truncate text-xs font-bold text-slate-500">
                          {row.employeeNo || '-'}

                          {row.isHidden ? ` | ${t('weaving.reports.hidden')}` : ''}
                        </p>
                      </td>

                      <td className="border-x border-slate-200 px-3 py-2.5 text-center font-bold text-slate-700">
                        {row.departmentName || '-'}
                      </td>

                      <TableAmount value={row.salary} />

                      <TableAmount value={row.plus} />

                      <TableAmount value={row.deduction} />

                      <TableAmount value={row.loan} />

                      <TableAmount value={row.kharcha} />

                      <td className="border-x border-slate-200 px-2.5 py-2 text-center align-middle">
                        <Amount value={row.payable} important />

                        <p className="mt-0.5 text-center text-[11px] font-bold text-slate-500">
                          {t('weaving.reports.paid')}: {money(row.paidAmount)}
                        </p>
                      </td>

                      <td className="border-x border-slate-200 px-3 py-2.5 text-center text-xs font-bold text-slate-300">
                        {t('weaving.reports.signThumb')}
                      </td>
                    </tr>
                  ))}

                  <TotalsRow
                    label={`${group.unitName || t('weaving.reports.unit')} ${t(
                      'weaving.reports.unitTotal'
                    )}`}
                    totals={group.totals || emptySummary}
                  />
                </tbody>
              ))}

              <tbody>
                <TotalsRow label={t('weaving.reports.grandTotal')} totals={summary} grand />
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-sm font-black text-slate-500">
            {t('weaving.reports.noPayrollFound')}
          </div>
        )}
      </section>
    </div>
  );
};

export default WeavingSalaryClosingPage;
