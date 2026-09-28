import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch, FaSpinner, FaTimes } from 'react-icons/fa';
import { t } from '../../i18n/i18n';
import { listWeavingContracts } from '../../services/weavingOperationsService';
import { hasPermission } from '../../utils/permissionHelper';
import { getOperationalProgress } from './WeavingProductionContext';

const tr = (key) => t(`weaving.partyProduction.${key}`);
const numeric = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const format = (value) => numeric(value) === null ? '-' : Number(value).toLocaleString('en-GB', { maximumFractionDigits: 3 });
const columns = ['party', 'contract', 'type', 'quality', 'target', 'gross', 'aGrade', 'bGrade', 'rejected', 'external', 'supplied', 'gap'];
const control = 'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

export default function PartyWiseProductionModal({ onClose }) {
  const [contracts, setContracts] = useState([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const closeRef = useRef(null);
  const canView = hasPermission('weaving.reports.view') || hasPermission('weaving.reports.production');

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    listWeavingContracts({ type: 'sales' }).then((rows) => {
      if (!cancelled) setContracts((Array.isArray(rows) ? rows : []).filter((row) => ['fabric_sale', 'conversion'].includes(row.contractType)));
    }).catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canView]);

  useEffect(() => {
    if (!canView) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [canView]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contracts.map((contract) => {
      const p = contract.progress || {};
      const operational = getOperationalProgress(contract);
      const party = contract.partyName || contract.partyId?.name || contract.productionContext?.customerName || '-';
      const quality = contract.itemName || contract.itemId?.name || contract.productionContext?.qualityName || '-';
      const target = numeric(contract.quantity) === null ? null : numeric(operational.targetMeter);
      const gross = numeric(p.grossProducedMeter);
      const supplied = gross === null ? null : numeric(operational.supplied);
      return { contract, party, quality, target, gross, supplied,
        aGrade: numeric(p.goodMeter), bGrade: numeric(p.bGradeMeter), rejected: numeric(p.rejectedMeter),
        external: contract.contractType === 'fabric_sale' ? numeric(p.externalPurchasedMeter) : null,
        gap: target === null || supplied === null ? null : numeric(operational.gap),
      };
    }).filter((row) => (!type || row.contract.contractType === type) &&
      (!term || [row.party, row.contract.contractNo, row.quality].some((value) => String(value || '').toLowerCase().includes(term))))
      .sort((a, b) => a.party.localeCompare(b.party) || String(a.contract.contractNo || '').localeCompare(String(b.contract.contractNo || ''), undefined, { numeric: true }));
  }, [contracts, search, type]);

  const totals = useMemo(() => ['target', 'supplied', 'gap'].reduce((result, key) => {
    const values = rows.map((row) => row[key]).filter((value) => value !== null);
    result[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    return result;
  }, {}), [rows]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]');
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  if (!canView) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="party-production-title" onKeyDown={handleKeyDown}>
    <section className="flex max-h-[92vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-cyan-800 px-4 py-4 text-white sm:px-5">
        <div><h2 id="party-production-title" className="text-xl font-black">{tr('title')}</h2><p className="mt-1 max-w-4xl text-xs text-cyan-100">{t('weaving.fabricStock.operationalNote')}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={tr('close')} className="rounded-md p-2 hover:bg-white/10"><FaTimes /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[tr('totalContracts'), loading || error ? null : rows.length], [tr('totalTarget'), totals.target], [tr('totalSupplied'), totals.supplied], [tr('totalGap'), totals.gap]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">{label}</div><div className="mt-1 text-xl font-black tabular-nums text-slate-900">{format(value)}</div></div>)}
        </div>
        <div className="my-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1 text-xs font-bold text-slate-600">{tr('search')}<span className="relative mt-1 block"><FaSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={`${control} w-full pl-9`} placeholder={tr('search')} /></span></label>
          <label className="text-xs font-bold text-slate-600">{tr('type')}<select className={`${control} mt-1 block w-full sm:w-48`} value={type} onChange={(event) => setType(event.target.value)}><option value="">{tr('allTypes')}</option><option value="fabric_sale">{t('weaving.sales.fabricSale')}</option><option value="conversion">{t('weaving.sales.conversion')}</option></select></label>
        </div>
        <p className="mb-2 text-xs text-slate-500">{tr('totalsNote')}</p>
        <div className="max-h-[52vh] overflow-auto rounded-lg border border-slate-200" tabIndex={0} aria-label={tr('title')}>
          <table className="min-w-[1250px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900 text-xs text-white"><tr>{columns.map((key, index) => <th key={key} scope="col" className={`px-3 py-3 ${index < 4 ? 'text-left' : 'text-right'}`}>{tr(key)}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={12} className="p-10 text-center"><span role="status" className="inline-flex items-center gap-2 text-cyan-700"><FaSpinner className="animate-spin" />{tr('loading')}</span></td></tr> : error ? <tr><td colSpan={12} role="alert" className="p-8 text-center text-rose-700">{t('weaving.fabricStock.progressError')}</td></tr> : !rows.length ? <tr><td colSpan={12} className="p-8 text-center text-slate-500">{tr('empty')}</td></tr> : rows.map((row, index) => <tr key={row.contract._id || index} className={`hover:bg-cyan-50/50 ${index > 0 && rows[index - 1].party !== row.party ? 'border-t-2 border-slate-200' : ''}`}>
                <td className="px-3 py-3 font-bold text-slate-900">{row.party}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{row.contract.contractNo || '-'}</td><td className="px-3 py-3 text-slate-600">{t(row.contract.contractType === 'conversion' ? 'weaving.sales.conversion' : 'weaving.sales.fabricSale')}</td><td className="px-3 py-3">{row.quality}</td>
                {['target', 'gross', 'aGrade', 'bGrade', 'rejected', 'external', 'supplied', 'gap'].map((key) => <td key={key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${key === 'gap' ? 'bg-cyan-50/60 font-bold text-cyan-900' : key === 'supplied' ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{format(row[key])}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-5 py-3"><button type="button" onClick={onClose} className="h-10 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100">{tr('close')}</button></footer>
    </section>
  </div>;
}
