import React, { useEffect, useState } from 'react';
import { fetchIncomeStatement, fetchMonthVsMonthIncome } from '../services/journalService';
import { t } from '../i18n/i18n';

/*
  PRO LEVEL INCOME STATEMENT
  - Auto current month on load
  - Date range presets (month / quarter / FY)
  - Custom date filter
  - Revenue → COGS → Gross Profit → Expenses → Net Profit
  - Drill-down ready
*/

const IncomeStatementPage = () => {
  const [rangeType, setRangeType] = useState('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statement, setStatement] = useState(null);
  const [monthCompare, setMonthCompare] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ================= DATE RANGE HELPER ================= */
  const getDateRange = (type) => {
    const today = new Date();
    let start, end;

    switch (type) {
      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;

      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;

      case 'this_fy': {
        const fyStartMonth = 6; // July
        const year =
          today.getMonth() >= fyStartMonth ? today.getFullYear() : today.getFullYear() - 1;
        start = new Date(year, fyStartMonth, 1);
        end = today;
        break;
      }

      case 'last_fy': {
        const fyStartMonth = 6;
        const year =
          today.getMonth() >= fyStartMonth ? today.getFullYear() - 1 : today.getFullYear() - 2;
        start = new Date(year, fyStartMonth, 1);
        end = new Date(year + 1, fyStartMonth, 0);
        break;
      }

      case 'last_quarter': {
        const currentQuarter = Math.floor(today.getMonth() / 3);
        const startQuarterMonth = (currentQuarter - 1) * 3;
        start = new Date(today.getFullYear(), startQuarterMonth, 1);
        end = new Date(today.getFullYear(), startQuarterMonth + 3, 0);
        break;
      }

      default:
        return null;
    }

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  };

  /* ================= GENERATE STATEMENT ================= */
  const generateStatement = async (sDate, eDate) => {
    if (!sDate || !eDate) return;

    setLoading(true);
    try {
      // ✅ Income Statement ہمیشہ فنکشن والی dates سے
      const data = await fetchIncomeStatement(sDate, eDate);
      setStatement(data);

      // ✅ Month-wise بھی انہی dates سے year لے گا
      const year = sDate.slice(0, 4);
      const mc = await fetchMonthVsMonthIncome(year);

      // ⚠️ journalService میں mc direct data دیتا ہے
      setMonthCompare(mc.months || []);
    } catch (err) {
      alert(t('alerts.incomeStatementFailed'));
    }
    setLoading(false);
  };

  /* ================= AUTO LOAD (THIS MONTH) ================= */

  useEffect(() => {
    const range = getDateRange('this_month');
    if (range) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);

      generateStatement(range.startDate, range.endDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= HANDLE DROPDOWN ================= */
  const handleRangeChange = (e) => {
    const value = e.target.value;
    setRangeType(value);

    if (value === 'custom') {
      setStatement(null);
      return;
    }

    const range = getDateRange(value);
    if (range) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      generateStatement(range.startDate, range.endDate);
    }
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      alert(t('alerts.selectStartEndDate'));
      return;
    }
    generateStatement(startDate, endDate);
  };

  const isProfit = statement?.netProfit >= 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ================= HEADER ================= */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">📊 {t('reports.incomeStatement')}</h1>
        <p className="text-gray-500 text-sm">{t('reports.businessPerformanceReport')}</p>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="bg-white p-4 rounded shadow mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium">{t('reports.reportType')}</label>
          <select className="border rounded p-2" value={rangeType} onChange={handleRangeChange}>
            <option value="this_month">{t('date.thisMonth')}</option>
            <option value="last_month">{t('date.lastMonth')}</option>
            <option value="last_quarter">{t('date.lastQuarter')}</option>
            <option value="this_fy">{t('date.thisFinancialYear')}</option>
            <option value="last_fy">{t('date.lastFinancialYear')}</option>
            <option value="custom">{t('date.custom')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">{t('date.startDate')}</label>
          <input
            type="date"
            className="border rounded p-2"
            value={startDate}
            disabled={rangeType !== 'custom'}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">{t('date.endDate')}</label>
          <input
            type="date"
            className="border rounded p-2"
            value={endDate}
            disabled={rangeType !== 'custom'}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {rangeType === 'custom' && (
          <button
            onClick={handleGenerate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            {loading ? t('common.generating') : t('common.generate')}
          </button>
        )}
      </div>

      {!statement && (
        <div className="text-center text-gray-400 mt-12">
          {t('reports.selectRangeForIncomeStatement')}
        </div>
      )}

      {statement && (
        <>
          {/* ================= KPI CARDS ================= */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <KpiCard
              title={t('reports.netSales')}
              value={statement.revenue?.netSales}
              color="green"
            />

            <KpiCard title={t('reports.cogs')} value={statement.cogs?.total} color="red" />
            <KpiCard
              title={t('reports.grossProfit')}
              value={statement.grossProfit}
              color="emerald"
            />
            <KpiCard
              title={isProfit ? t('reports.netProfit') : t('reports.netLoss')}
              value={statement.netProfit}
              color={isProfit ? 'emerald' : 'orange'}
            />
          </div>

          {/* ================= MAIN STATEMENT ================= */}
          <div className="bg-white rounded shadow p-6 text-center">
            <Section title={t('reports.revenue')}>
              <Row label={t('sales')} value={statement.revenue.sales} />
              <Row
                label={t('reports.salesReturn')}
                value={statement.revenue.salesReturn}
                negative
              />
              <TotalRow label={t('reports.netSales')} value={statement.revenue.netSales} />
            </Section>

            <Section title={t('reports.cogsSection')}>
              {statement.cogs.breakdown.map((r, i) => (
                <Row key={i} label={r.accountName} value={r.amount} negative />
              ))}
              <TotalRow label={t('reports.totalCogs')} value={statement.cogs.total} negative />
            </Section>

            <HighlightRow label={t('reports.grossProfit')} value={statement.grossProfit} />

            <Section title={t('reports.operatingExpenses')}>
              {statement.operatingExpenses.breakdown.map((r, i) => (
                <Row key={i} label={r.accountName} value={r.amount} negative />
              ))}
              <TotalRow
                label={t('reports.totalOperatingExpenses')}
                value={statement.operatingExpenses.total}
                negative
              />
            </Section>

            <HighlightRow
              label={isProfit ? t('reports.netProfit') : t('reports.netLoss')}
              value={statement.netProfit}
              danger={!isProfit}
            />
          </div>

          {/* ================= INSIGHTS ================= */}
          <div className="mt-6 bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-2">📌 {t('reports.businessInsights')}</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              <li>
                {t('reports.grossMargin')}:{' '}
                <b>
                  {statement.revenue.netSales > 0
                    ? ((statement.grossProfit / statement.revenue.netSales) * 100).toFixed(1)
                    : 0}
                  %
                </b>
              </li>
              <li>
                {t('reports.expenseRatio')}:{' '}
                <b>
                  {statement.revenue.netSales > 0
                    ? (
                        (statement.operatingExpenses.total / statement.revenue.netSales) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </b>
              </li>
              <li>
                {isProfit ? t('reports.businessProfitable') : t('reports.expenseHigherThanIncome')}
              </li>
            </ul>
          </div>
          {/* ================= MONTH COMPARISON ================= */}
          {monthCompare.length > 0 && (
            <div className="bg-white rounded shadow p-6 mt-8">
              <h3 className="text-lg font-semibold mb-4">📊 {t('reports.monthVsMonth')}</h3>

              <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-center">{t('month')}</th>
                    <th className="border p-2 text-center">{t('sales')}</th>
                    <th className="border p-2 text-center">{t('reports.cogs')}</th>
                    <th className="border p-2 text-center">{t('reports.profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthCompare.map((m) => (
                    <tr key={m.month}>
                      <td className="border p-2 text-center">{m.month}</td>
                      <td className="border p-2 text-center">
                        {t('currency.rs')} {Number(m.sales || 0).toFixed(2)}
                      </td>
                      <td className="border p-2 text-center text-red-600">
                        {t('currency.rs')} {Number(m.cogs || 0).toFixed(2)}
                      </td>
                      <td className="border p-2 text-center font-semibold">
                        {t('currency.rs')} {Number(m.profit || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ================= UI COMPONENTS ================= */

const Section = ({ title, children }) => (
  <div className="mb-4">
    <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
    <div className="border-t">{children}</div>
  </div>
);

const Row = ({ label, value, negative }) => (
  <div className="flex justify-between py-1">
    <span>{label}</span>
    <span className={negative ? 'text-red-600' : ''}>
      {negative && value > 0 ? '-' : ''}
      {t('currency.rs')} {Number(value || 0).toFixed(2)}
    </span>
  </div>
);

const TotalRow = ({ label, value, negative }) => (
  <div className="flex justify-between py-2 font-semibold border-t mt-1">
    <span>{label}</span>
    <span className={negative ? 'text-red-700' : ''}>
      {negative && value > 0 ? '-' : ''}
      {t('currency.rs')} {Number(value || 0).toFixed(2)}
    </span>
  </div>
);

const HighlightRow = ({ label, value, danger }) => (
  <div
    className={`flex justify-between py-3 px-3 my-3 rounded font-bold ${
      danger ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
    }`}
  >
    <span>{label}</span>
    <span>
      {t('currency.rs')} {Number(value || 0).toFixed(2)}
    </span>
  </div>
);

const KpiCard = ({ title, value, color }) => {
  const colors = {
    green: 'bg-green-600',
    red: 'bg-red-600',
    emerald: 'bg-emerald-600',
    orange: 'bg-orange-600',
  };

  return (
    <div className={`${colors[color]} text-white p-4 rounded shadow text-center`}>
      <p className="text-sm">{title}</p>
      <h2 className="text-xl font-bold">
        {t('currency.rs')} {Number(value || 0).toFixed(2)}
      </h2>
    </div>
  );
};

export default IncomeStatementPage;
