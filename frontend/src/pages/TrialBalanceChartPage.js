import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaBalanceScale } from 'react-icons/fa';

import TrialBalanceComparisonChart from '../components/TrialBalanceComparisonChart';
import { getTrialBalance } from '../services/journalService';
import {
  getTrialBalancePath,
  normalizeTrialBalanceScope,
} from './trialBalanceUtils';

const PRESENTATION = Object.freeze({
  trading: { page: 'from-slate-100 via-white to-blue-50', header: 'from-slate-950 via-slate-900 to-blue-900', button: 'bg-blue-600 hover:bg-blue-700' },
  travel: { page: 'from-cyan-50 via-white to-blue-50', header: 'from-cyan-700 via-sky-700 to-blue-800', button: 'bg-cyan-600 hover:bg-cyan-700' },
  weaving: { page: 'from-teal-50 via-white to-indigo-50', header: 'from-teal-800 via-emerald-800 to-indigo-900', button: 'bg-teal-600 hover:bg-teal-700' },
});

const TrialBalanceChartPage = ({ moduleScope = 'trading' }) => {
  const scope = normalizeTrialBalanceScope(moduleScope);
  const theme = PRESENTATION[scope];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const [trialData, setTrialData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getTrialBalance(startDate, endDate, { moduleScope: scope });
      setTrialData(Array.isArray(data?.trialBalance) ? data.trialBalance : []);
    } catch (requestError) {
      console.error('Trial balance chart load failed:', requestError);
      setError(requestError?.response?.data?.message || 'Unable to load the Trial Balance chart.');
    } finally {
      setLoading(false);
    }
  }, [endDate, scope, startDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const returnToTrialBalance = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    navigate(`${getTrialBalancePath(scope)}${query ? `?${query}` : ''}`);
  };

  const period = startDate || endDate
    ? `${startDate || 'Beginning'} to ${endDate || 'Today'}`
    : '';

  return (
    <main className={`h-full min-h-0 overflow-hidden bg-gradient-to-br ${theme.page} p-2 sm:p-3 lg:p-4`}>
      <div className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col gap-3">
        <header className={`flex shrink-0 items-center justify-between gap-3 rounded-xl bg-gradient-to-r ${theme.header} px-3 py-2.5 text-white shadow-md sm:px-4`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={returnToTrialBalance} title="Back to Trial Balance" aria-label="Back to Trial Balance" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25 transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70"><FaArrowLeft /></button>
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/15 text-base ring-1 ring-white/20"><FaBalanceScale /></span>
            <h1 className="truncate text-xl font-black sm:text-2xl">Trial Balance Chart</h1>
          </div>
          {period && <p className="hidden flex-shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-extrabold ring-1 ring-white/20 sm:block">{period}</p>}
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
          {loading ? <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" aria-label="Loading Trial Balance chart">{[1, 2, 3, 4, 5].map((row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : error ? <div className="m-auto text-center" role="alert"><p className="font-bold text-rose-700">{error}</p><button type="button" onClick={fetchData} className={`mt-4 rounded-lg px-4 py-2 text-sm font-extrabold text-white ${theme.button}`}>Retry</button></div>
              : trialData.length === 0 ? <div className="m-auto text-center"><FaBalanceScale className="mx-auto text-4xl text-slate-300" /><p className="mt-3 font-bold text-slate-600">No Trial Balance activity found for this period.</p></div>
                : <TrialBalanceComparisonChart data={trialData} scope={scope} />}
        </section>
      </div>
    </main>
  );
};

export default TrialBalanceChartPage;
