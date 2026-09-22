import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaDownload,
  FaFileInvoiceDollar,
  FaFilter,
  FaPrint,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { getWeavingUnits } from '../../services/employeeService';
import {
  downloadSalaryClosingPdf,
  fetchSalaryClosingPrintHtml,
  getSalaryClosingReport,
} from '../../services/weavingReportService';
import { hasPermission } from '../../utils/permissionHelper';
import { showWeavingWarning, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';
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
    } ${
      mutedZero && Number(value || 0) === 0 ? 'text-slate-400' : 'text-slate-900'
    }`}
  >
    {money(value)}
  </span>
);

const SummaryMetric = ({ label, value, dominant = false }) => (
  <div
    className={`rounded-lg border px-3 py-2 ${
      dominant
        ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-emerald-50'
        : 'border-slate-200 bg-white/85'
    }`}
  >
    <p className="text-center text-[11px] font-black uppercase tracking-normal text-slate-500">
      {label}
    </p>
    <p
      className={`mt-1 truncate text-center font-black ${
        dominant ? 'text-2xl text-slate-950' : 'text-lg text-slate-900'
      }`}
    >
      {money(value)}
    </p>
  </div>
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
    <td className={`border-y border-slate-300 px-2 ${grand ? 'border-t-4 border-slate-900' : ''}`} />
  </tr>
);

const WeavingReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryCycleKey = searchParams.get('cycleKey') || getCurrentWeavingCycleKey();
  const queryUnitId = searchParams.get('unitId') || '';
  const querySegmentNo = searchParams.get('segmentNo') || '';
  const [cycleKey, setCycleKey] = useState(() => deriveWeavingPayrollCycle(queryCycleKey).key);
  const [unitId, setUnitId] = useState(queryUnitId);
  const [segmentNo, setSegmentNo] = useState(querySegmentNo);
  const [report, setReport] = useState(null);
  const [units, setUnits] = useState([]);
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
  const reportWarning = !loading
    ? [
        status.draftCount > 0
          ? `${status.draftCount} ${t('weaving.reports.pendingFinalizationWarning')}`
          : '',
        status.provisionalPrintBlocked ? t('weaving.reports.provisionalPrintBlocked') : '',
        report?.cycle?.earlyClosed
          ? `${t('weaving.reports.earlyClosed')} | ${t('weaving.reports.originalCycle')}: ${report.cycle.originalPeriodLabel || '-'}${report.cycle.earlyCloseReason ? ` | ${t('weaving.reports.reason')}: ${report.cycle.earlyCloseReason}` : ''}`
          : '',
      ].filter(Boolean).join('\n')
    : '';
  useWeavingFeedback(reportWarning, null, { type: 'warning', showNonErrors: true });
  const selection = report?.selection || {};
  const reportSegments = Array.isArray(report?.segments) ? report.segments : [];
  const activeSegmentNo = String(segmentNo || report?.cycle?.segmentNo || '');
  const officialBlocked = !status.canOfficialPrint;

  const syncUrl = useCallback(
    (nextCycleKey, nextUnitId, nextSegmentNo = segmentNo) => {
      const next = {};
      if (nextCycleKey) next.cycleKey = nextCycleKey;
      if (nextSegmentNo) next.segmentNo = nextSegmentNo;
      if (nextUnitId) next.unitId = nextUnitId;
      setSearchParams(next, { replace: true });
    },
    [segmentNo, setSearchParams]
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [reportData, unitData] = await Promise.all([
        getSalaryClosingReport({ cycleKey, segmentNo, unitId }),
        getWeavingUnits({ moduleScope: 'weaving' }),
      ]);

      setReport(reportData || null);
      setUnits(Array.isArray(unitData) ? unitData : []);
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

  const printReport = async () => {
    if (!canPrint || officialBlocked) return;

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
    if (!canPrint || officialBlocked) return;

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

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/70 p-3 sm:p-4 md:p-5 lg:p-6">
      <section className="mb-3 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        <div className="grid gap-3 px-3 py-3 xl:grid-cols-[minmax(240px,0.9fr)_minmax(0,2.5fr)_auto] xl:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-cyan-700 text-white shadow-sm">
              <FaFileInvoiceDollar aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-slate-950">
                {t('weaving.reports.salaryClosingSheet')}
              </h1>
              <p className="truncate text-xs font-black uppercase tracking-normal text-slate-400">
                {report?.cycle?.periodLabel ||
                  formatWeavingPayrollCycleLabel(selectedCycle, t('weaving.reports.pay'))}
              </p>

              {report?.cycle?.earlyClosed ? (
                <p
                  className="mt-1 truncate text-xs font-black text-amber-700"
                  title={report.cycle.earlyCloseReason || undefined}
                >
                  {t('weaving.reports.earlyClosed')} | {t('weaving.reports.through')}{' '}
                  {report.cycle.earlyCloseThroughDateLabel ||
                    report.cycle.earlyCloseThroughDate ||
                    '-'}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white/85 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-normal text-slate-500">
                {t('weaving.reports.period')}
              </p>
              <p className="mt-1 truncate text-lg font-black text-slate-900">
                {report?.cycle?.periodLabel || '-'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/85 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-normal text-slate-500">
                {t('weaving.reports.dueDate')}
              </p>
              <p className="mt-1 truncate text-lg font-black text-slate-900">
                {report?.cycle?.dueDateLabel || '-'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/85 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-normal text-slate-500">
                {t('weaving.reports.unit')}
              </p>
              <p className="mt-1 truncate text-lg font-black text-slate-900">
                {selection.unitName || t('weaving.reports.allUnits')}
              </p>
            </div>
            <SummaryMetric label={t('weaving.reports.employees')} value={summary.employees} />
            <SummaryMetric
              label={t('weaving.reports.totalPayable')}
              value={summary.payable}
              dominant
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[520px]">
            <label className="relative block">
              <FaFilter
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={cycleKey}
                onChange={(event) => changeCycle(event.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
              >
                {cycleOptions.map((cycle) => (
                  <option key={cycle.key} value={cycle.key}>
                    {cycle.label}
                  </option>
                ))}
              </select>
            </label>

            {reportSegments.length > 1 ? (
              <label className="relative block">
                <FaFilter
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <select
                  value={activeSegmentNo || '1'}
                  onChange={(event) => changeSegment(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                >
                  {reportSegments.map((segment) => (
                    <option key={segment.segmentNo} value={segment.segmentNo}>
                      {segment.earlyClosed
                        ? `${t('weaving.reports.closing')} ${segment.segmentNo} - ${segment.segmentEnd}`
                        : `${t('weaving.reports.continuation')} ${segment.segmentNo} - ${segment.segmentStart} to ${segment.segmentEnd}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="relative block">
              <FaFilter
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={unitId}
                onChange={(event) => changeUnit(event.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">{t('weaving.reports.allUnits')}</option>
                {units.map((unit) => (
                  <option key={unit._id} value={unit._id}>
                    {unit.name || `Unit ${unit.unitNo}`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={printReport}
              disabled={printDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 text-sm font-black text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaPrint aria-hidden="true" />
              {t('weaving.reports.print')}
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={printDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaDownload aria-hidden="true" />
              PDF
            </button>
          </div>
        </div>
      </section>

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
                    <td colSpan={10} className="border-y border-slate-300 px-3 py-2 font-black uppercase text-slate-900">
                      {group.unitName || t('weaving.reports.noUnit')}
                    </td>
                  </tr>
                  {(group.rows || []).map((row, index) => (
                    <tr key={row.payrollId} className="odd:bg-white even:bg-slate-50/50 hover:bg-cyan-50/40">
                      <td className="border-x border-slate-200 px-2 py-2.5 text-center text-xs font-black text-slate-400">
                        {index + 1}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <p className="truncate font-black text-slate-950">{row.employeeName || '-'}</p>
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
                  <TotalsRow label={`${group.unitName || t('weaving.reports.unit')} ${t('weaving.reports.unitTotal')}`} totals={group.totals || emptySummary} />
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

export default WeavingReportsPage;
