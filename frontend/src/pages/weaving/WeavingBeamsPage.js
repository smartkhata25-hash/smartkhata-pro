import WeavingProductionContext from '../../components/weaving/WeavingProductionContext';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaEye as Eye,
  FaSpinner as Loader2,
  FaRedo as RefreshCw,
  FaTimes as X,
} from 'react-icons/fa';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  requestWeavingConfirmation,
  showWeavingError,
  showWeavingSuccess,
  showWeavingWarning,
} from '../../components/weaving/WeavingFeedbackModal';
import {
  createManualKnottingJob,
  createKnottingJob,
  completeBeam,
  getBeamMeta,
  getBeamSet,
  listBeamSets,
  syncBeamReceipts,
  voidKnottingJob,
} from '../../services/weavingBeamService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';

const tr = (key) => t(`weaving.beams.${key}`);
const money = (value) =>
  new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(Number(value || 0));
const badge = {
  available: 'bg-emerald-50 text-emerald-700',
  knotting: 'bg-cyan-50 text-cyan-700',
  loaded: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-slate-100 text-slate-700',
  approved: 'bg-emerald-50 text-emerald-700',
  draft: 'bg-amber-50 text-amber-700',
  void: 'bg-rose-50 text-rose-700',
};
const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100';
const freshJob = (approve) => ({
  employeeId: '',
  beamIds: [],
  loomNumbers: {},
  workDate: getBusinessDateInputValue(),
  rate: '',
  approve,
  notes: '',
});
const Status = ({ value }) => (
  <span className={`rounded-full px-2 py-1 text-xs font-bold ${badge[value] || ''}`}>
    {tr(`status.${value}`)}
  </span>
);

export default function WeavingBeamsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resolvingActiveRuns = searchParams.get('resolveActiveRuns') === '1';
  const canApprove = hasPermission('weaving.beams.approve');
  const canCreate = hasPermission('weaving.beams.create');
  const canSave = canCreate || canApprove;
  const canLoad = hasPermission('weaving.beams.load');
  const canVoid = hasPermission('weaving.beams.void');
  const [sets, setSets] = useState([]);
  const [meta, setMeta] = useState({ employees: [], looms: [] });
  const [selected, setSelected] = useState(null);
  const [job, setJob] = useState(() => freshJob(canApprove));
  const [startLoom, setStartLoom] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualEmployeeId, setManualEmployeeId] = useState('');
  const [manualQuantities, setManualQuantities] = useState({});
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, setup] = await Promise.all([listBeamSets(), getBeamMeta()]);
      setSets(rows || []);
      setMeta(setup || { employees: [], looms: [] });
    } catch (error) {
      showWeavingError(error, tr('loadError'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const manualEmployees = useMemo(
    () => meta.employees.filter((row) => row.knottingPaymentMethod === 'per_beam'),
    [meta.employees]
  );
  const mode = meta.productionTrackingMode === 'detailed' ? 'detailed' : 'manual';
  const activeRuns = useMemo(() => (meta.currentRuns || []).slice().sort((left, right) =>
    String(left.beam?.loomNumber || '').localeCompare(String(right.beam?.loomNumber || ''), undefined, { numeric: true, sensitivity: 'base' })
  ), [meta.currentRuns]);
  useEffect(() => {
    setManualEmployeeId((current) => {
      if (manualEmployees.length === 1) return manualEmployees[0]._id;
      return manualEmployees.some((row) => row._id === current) ? current : '';
    });
  }, [manualEmployees]);
  useEffect(() => {
    setManualQuantities((current) => {
      const next = { ...current };
      sets.forEach((row) => {
        const available = Number(row.beamCounts?.available || 0);
        if (available > 0 && (next[row._id] === undefined || Number(next[row._id]) > available))
          next[row._id] = String(available);
      });
      return next;
    });
  }, [sets]);
  const openSet = async (id) => {
    if (opening || saving) return;
    setOpening(true);
    try {
      const row = await getBeamSet(id);
      setJob(freshJob(canApprove));
      setStartLoom('');
      setSelected(row);
    } catch (error) {
      showWeavingError(error, tr('setError'));
    } finally {
      setOpening(false);
    }
  };
  const selectedWorker = useMemo(
    () => meta.employees.find((row) => row._id === job.employeeId),
    [job.employeeId, meta.employees]
  );
  const method = selectedWorker?.knottingPaymentMethod || 'monthly';
  const perBeam = ['per_beam', 'monthly_per_beam'].includes(method);
  const needsRate = perBeam || ['per_set', 'monthly_per_set'].includes(method);

  const selectable = selected?.beams?.filter(
    (beam) =>
      (beam.status === 'available' && !beam.knottingJobId) ||
      (beam.status === 'knotting' && beam.knottingJobId)
  ) || [];
  const selectedBeams = selected?.beams?.filter((beam) => job.beamIds.includes(beam._id)) || [];
  const needsNewKnotting = selectedBeams.some(
    (beam) => beam.status === 'available' && !beam.knottingJobId
  );
  const newBeamCount = selectedBeams.filter((beam) => beam.status === 'available' && !beam.knottingJobId).length;
  const amount = newBeamCount && needsRate ? (perBeam ? newBeamCount : 1) * Number(job.rate || 0) : 0;
  const hasNewBeams = selectable.some((beam) => beam.status === 'available' && !beam.knottingJobId);
  const closeSet = async () => {
    if (saving) return;
    const dirty = job.employeeId || job.beamIds.length || Object.values(job.loomNumbers).some(Boolean) || job.notes || startLoom || job.rate !== '' || job.workDate !== getBusinessDateInputValue() || job.approve !== canApprove;
    if (dirty && !await requestWeavingConfirmation({ message: tr('discardChanges') })) return;
    setSelected(null);
  };
  const completeLoadedBeam = async ({ beam, context = {}, qualityName = '', reference = '', selectedId = '' }) => {
    if (saving || !canLoad) return;
    const details = [
      t('weaving.folding.loom') + ': ' + (beam.activeLoomId?.loomNumber || beam.loomNumber || '-'),
      t('weaving.production.beam') + ': ' + beam.beamNo,
      'Sizing / Set Reference: ' + (reference || '-'),
      t('weaving.production.contract') + ': ' + (context.contractNo || '-'),
      t('weaving.production.customer') + ': ' + (context.customerName || context.ownerName || '-'),
      t('weaving.folding.quality') + ': ' + (qualityName || context.qualityName || '-'),
    ].join('\n');
    if (!await requestWeavingConfirmation({ message: tr('completeConfirm') + '\n\n' + details })) return;
    setSaving(true);
    try {
      await completeBeam(beam._id);
      await load();
      if (selectedId) setSelected(await getBeamSet(selectedId));
      showWeavingSuccess(tr('completedSuccess'));
    } catch (error) { showWeavingError(error, tr('saveError')); }
    finally { setSaving(false); }
  };
  const unload = (beam) => completeLoadedBeam({
    beam,
    context: selected.productionContext || {},
    qualityName: selected.fabricQualityId?.name,
    reference: selected.setNo || selected.receiptNo,
    selectedId: selected._id,
  });
  const completeActiveRun = (run) => completeLoadedBeam({
    beam: run.beam,
    context: { contractNo: run.contract?.contractNo, customerName: run.customerName, ownerName: run.ownerParty?.name },
    qualityName: run.quality?.name,
    reference: run.beamSet?.setNo || run.beamSet?.receiptNo,
  });
  const toggleBeam = (id) =>
    setJob((current) => ({
      ...current,
      beamIds: current.beamIds.includes(id)
        ? current.beamIds.filter((value) => value !== id)
        : [...current.beamIds, id],
    }));
  const autoFill = () => {
    const start = Number(startLoom);
    if (startLoom === '' || !Number.isSafeInteger(start) || start < 0) return;
    setJob((current) => {
      const loomNumbers = { ...current.loomNumbers };
      selected.beams
        .filter((beam) => current.beamIds.includes(beam._id))
        .forEach((beam, index) => {
          loomNumbers[beam._id] = String(start + index);
        });
      return { ...current, loomNumbers };
    });
  };
  const submitJob = async (event) => {
    event.preventDefault();
    if (!selected || saving || !canSave || !canLoad) return;
    if (!job.beamIds.length) { showWeavingWarning(tr('selectBeamWarning')); return; }
    if (needsNewKnotting && !job.employeeId) { showWeavingWarning(tr('selectWorker')); return; }
    if (needsNewKnotting && needsRate && (job.rate === '' || !Number.isFinite(Number(job.rate)) || Number(job.rate) < 0)) { showWeavingWarning(tr('rateWarning')); return; }
    if (job.beamIds.some((id) => !String(job.loomNumbers[id] || '').trim())) { showWeavingWarning(tr('loomWarning')); return; }
    if (!job.workDate) { showWeavingWarning(tr('dateWarning')); return; }
    setSaving(true);
    try {
      let completeBeamIds = [];
      const setup = await getBeamMeta();
      setMeta(setup);
      const numbers = new Set(job.beamIds.map((id) => String(job.loomNumbers[id] || '').trim()));
      const occupied = (setup.currentRuns || []).filter((run) => {
        const loom = setup.looms.find((row) => String(row._id) === String(run.beam.activeLoomId));
        return numbers.has(loom?.loomNumber || run.beam.loomNumber);
      });
      if (occupied.length) {
        const details = occupied.map((run) => {
          const loom = setup.looms.find((row) => String(row._id) === String(run.beam.activeLoomId));
          return [t('weaving.folding.loom') + ' ' + (loom?.loomNumber || run.beam.loomNumber), run.beam.beamNo,
            run.contract?.contractNo || '-', run.contract?.partyName || run.ownerParty?.name || '-', run.ownershipType === 'own' ? t('weaving.production.own') : t('weaving.production.partyOwned'), run.quality?.name || '-'].join(' / ');
        }).join('\n');
        if (!await requestWeavingConfirmation({ message: t('weaving.production.replaceRun') + '\n\n' + details })) return;
        completeBeamIds = occupied.map((run) => run.beam._id);
      }
      await createKnottingJob({
        completeBeamIds,
        employeeId: needsNewKnotting ? job.employeeId : '',
        beamSetId: selected._id,
        beamIds: job.beamIds,
        workDate: job.workDate,
        rate: needsNewKnotting && needsRate ? Number(job.rate || 0) : 0,
        approve: canApprove && job.approve,
        notes: job.notes,
        load: true,
        beamAssignments: job.beamIds.map((beamId) => ({
          beamId,
          loomNumber: job.loomNumbers[beamId] || '',
        })),
      });
      setSelected(null);
      setJob(freshJob(canApprove));
      showWeavingSuccess('Selected Beams loaded successfully.');

      // The Knotting/Beam Load request is already server-confirmed. Refresh the
      // list in the background so a slow optional refresh cannot trap the modal
      // in its saving state.
      load();
    } catch (error) {
      showWeavingError(error, tr('saveError'));
    } finally {
      setSaving(false);
    }
  };
  const voidJob = async (id) => {
    if (!(await requestWeavingConfirmation({ message: tr('voidConfirm') }))) return;
    setSaving(true);
    try {
      await voidKnottingJob(id, tr('voidReason'));
      setSelected(await getBeamSet(selected._id));
      setJob(freshJob(canApprove));
      await load();
    } catch (error) {
      showWeavingError(error, tr('voidError'));
    } finally {
      setSaving(false);
    }
  };
  const sync = async () => {
    setLoading(true);
    try {
      await syncBeamReceipts();
      await load();
    } catch (error) {
      showWeavingError(error, tr('syncError'));
      setLoading(false);
    }
  };
  const saveManual = async (row) => {
    if (saving || !canSave || !canLoad) return;
    const available = Number(row.beamCounts?.available || 0);
    const quantity = Number(manualQuantities[row._id]);
    if (manualEmployees.length && !manualEmployeeId) {
      showWeavingWarning('Select a Per-Beam Knotting Worker.');
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available) {
      showWeavingWarning(`Qty to Load must be between 1 and ${available}.`);
      return;
    }
    setSaving(true);
    try {
      await createManualKnottingJob({
        beamSetId: row._id,
        employeeId: manualEmployeeId,
        quantity,
        workDate: getBusinessDateInputValue(),
        approve: canApprove,
      });
      showWeavingSuccess(`${quantity} Beams loaded successfully.`);
      await load();
    } catch (error) {
      showWeavingError(error, 'Could not save Manual Knotting.');
    } finally {
      setSaving(false);
    }
  };
  const disabledSave = saving || !canSave || !canLoad;
  const manualRows = sets.filter((row) => Number(row.beamCounts?.available || 0) > 0);
  const manualWorker = manualEmployees.find((row) => row._id === manualEmployeeId);

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{tr('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{tr('subtitle')}</p>
        </div>
        {canCreate && (
          <button
            onClick={sync}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {tr('sync')}
          </button>
        )}
      </div>
      <div className="mb-5 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
        Production Mode: {meta.productionTrackingMode === 'loom_wise' ? 'Loom-wise' : meta.productionTrackingMode === 'quality_total' ? 'Total Production' : 'Detailed'}
      </div>
      {mode === 'detailed' && (activeRuns.length > 0 || resolvingActiveRuns) && (
        <section className={`mb-5 rounded-xl border bg-white p-4 shadow-sm ${resolvingActiveRuns ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}>
          {activeRuns.length ? <>
            <div className="mb-3"><h2 className="font-black text-slate-900">Active Loom Runs</h2><p className="mt-1 text-sm text-slate-600">Complete / unload active Detailed runs before changing the Production Tracking Method.</p></div>
            <div className="grid gap-3 lg:grid-cols-2">
              {activeRuns.map((run) => <div key={run.beam?._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="min-w-0 text-sm"><div className="font-black text-slate-900">Loom {run.beam?.loomNumber || '-'} · Beam {run.beam?.beamNo || '-'}</div><div className="mt-1 text-slate-600">{run.beamSet?.setNo || run.beamSet?.receiptNo || '-'} · {run.quality?.name || '-'}</div></div>
                {canLoad && <button type="button" disabled={saving} onClick={() => completeActiveRun(run)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Complete / Unload</button>}
              </div>)}
            </div>
          </> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4"><div><h2 className="font-black text-emerald-900">All active Detailed Loom runs are cleared</h2><p className="mt-1 text-sm text-emerald-700">You can now change the Production Tracking Method.</p></div><button type="button" onClick={() => navigate('/weaving/settings')} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Back to Settings</button></div>}
        </section>
      )}
      {mode === 'detailed' && <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {['available', 'knotting', 'loaded', 'completed'].map((status) => (
          <div key={status} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase text-slate-500">
              {tr(`status.${status}`)}
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {sets.reduce((total, row) => total + (row.beamCounts?.[status] || 0), 0)}
            </div>
          </div>
        ))}
      </div>
      {opening && (
        <div role="status" className="mb-3 flex items-center gap-2 text-sm text-cyan-700">
          <Loader2 className="animate-spin" />
          {tr('opening')}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase text-white">
            <tr>
              {['reference', 'party', 'quality', 'beams', 'statusLabel', 'action'].map((key) => (
                <th key={key} className="px-4 py-3">
                  {key === 'party' ? t('weaving.production.customer') : tr(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="6" className="p-10 text-center">
                  <Loader2 className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : (
              sets.map((row) => (
                <tr
                  key={row._id}
                  tabIndex={0}
                  onClick={() => openSet(row._id)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      ['Enter', ' '].includes(event.key)
                    ) {
                      event.preventDefault();
                      openSet(row._id);
                    }
                  }}
                  className="cursor-pointer hover:bg-cyan-50 focus:bg-cyan-50 focus:outline-none"
                >
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {row.setNo || row.receiptNo}
                    {row.setNo && (
                      <div className="text-xs font-normal text-slate-500">{row.receiptNo}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.productionContext?.customerName || row.productionContext?.ownerName || '-'}</div>
                    <div className="text-xs text-slate-500">{row.productionContext?.contractNo || t('weaving.production.noContract')}</div>
                    <div className="text-xs text-slate-500">{t('weaving.production.sizingVendor')}: {row.sizingPartyId?.name || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {row.fabricQualityId?.qualityName ||
                      row.fabricQualityId?.name ||
                      row.count ||
                      '-'}
                  </td>
                  <td className="px-4 py-3"><strong>{tr('totalBeams')}: {row.beamCounts?.total || 0}</strong><div className="mt-1 text-xs text-slate-600">{['loaded', 'available', 'knotting', 'completed'].map((status) => tr('status.' + status) + ': ' + (row.beamCounts?.[status] || 0)).join(' / ')}</div></td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold">{tr(row.beamCounts?.total && row.beamCounts.completed === row.beamCounts.total ? 'status.completed' : row.beamCounts?.loaded ? (row.beamCounts.loaded === row.beamCounts.total ? 'fullyLoaded' : 'partiallyLoaded') : row.beamCounts?.knotting ? 'status.knotting' : 'status.available')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title={tr('view')}
                      aria-label={tr('view')}
                      disabled={opening}
                      onClick={(event) => {
                        event.stopPropagation();
                        openSet(row._id);
                      }}
                      className="rounded-md p-2 text-cyan-700 hover:bg-cyan-100"
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))
            )}
            {!loading && !sets.length && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">
                  {tr('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>}
      {mode === 'manual' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-100 bg-white p-4 shadow-sm">
            {!!manualEmployees.length && <div className="grid items-end gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                Per-Beam Knotting Worker
                {manualEmployees.length === 1 ? (
                  <div className={`${inputClass} flex items-center font-bold`}>
                    {manualEmployees[0].name}
                  </div>
                ) : (
                  <select
                    value={manualEmployeeId}
                    onChange={(event) => setManualEmployeeId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select Worker</option>
                    {manualEmployees.map((row) => (
                      <option key={row._id} value={row._id}>{row.name}</option>
                    ))}
                  </select>
                )}
              </label>
              <div className="rounded-lg bg-cyan-50 px-3 py-2">
                <div className="text-xs font-bold text-cyan-700">Per-Beam Rate</div>
                <div className="mt-1 font-black text-slate-900">
                  Rs. {money(manualWorker?.knottingDefaultRate)}
                </div>
              </div>
            </div>}
            {!manualEmployees.length && <p className="text-sm font-semibold text-cyan-700">Load Only: no per-beam earning will be created.</p>}
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
              <Loader2 className="mx-auto animate-spin" />
            </div>
          ) : manualRows.length ? (
            <div className="grid gap-3">
              {manualRows.map((row) => {
                const received = Number(row.beamCounts?.total || 0);
                const remaining = Number(row.beamCounts?.available || 0);
                const loaded = received - remaining;
                const quantity = Number(manualQuantities[row._id] || 0);
                const amount = quantity * Number(manualWorker?.knottingDefaultRate || 0);
                return (
                  <div key={row._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-7">
                      <div className="lg:col-span-2">
                        <div className="text-xs font-bold uppercase text-slate-500">Sizing Ref</div>
                        <div className="mt-1 text-lg font-black text-slate-900">
                          {row.setNo || row.receiptNo}
                        </div>
                        {row.setNo && <div className="text-xs text-slate-500">{row.receiptNo}</div>}
                      </div>
                      {[
                        ['Received', received],
                        ['Loaded', loaded],
                        ['Remaining', remaining],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                          <div className="text-xs font-bold text-slate-500">{label}</div>
                          <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
                        </div>
                      ))}
                      <label className="text-xs font-bold text-slate-600">
                        Qty to Load
                        <input
                          type="number"
                          min="1"
                          max={remaining}
                          step="1"
                          value={manualQuantities[row._id] ?? String(remaining)}
                          onChange={(event) =>
                            setManualQuantities((current) => ({
                              ...current,
                              [row._id]: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={disabledSave || (manualEmployees.length > 0 && !manualEmployeeId) || quantity < 1 || quantity > remaining}
                        onClick={() => saveManual(row)}
                        className="h-10 rounded-lg bg-gradient-to-r from-slate-900 to-cyan-800 px-4 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {saving ? tr('saving') : manualEmployees.length ? `Save · Rs. ${money(amount)}` : 'Load Beams'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
              No Sizing Beams are currently available for Manual loading.
            </div>
          )}
        </div>
      )}
      {mode === 'detailed' && selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knotting-title"
        >
          <form
            noValidate
            onSubmit={submitJob}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-cyan-800 px-5 py-4 text-white">
              <div>
                <h2 id="knotting-title" className="text-lg font-black">
                  {tr('formTitle')}
                </h2>
                <p className="mt-1 text-xs text-cyan-100">
                  {selected.setNo || selected.receiptNo} · {selected.sizingPartyId?.name} ·{' '}
                  {selected.beamCount} {tr('beams')}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                aria-label={tr('close')}
                onClick={closeSet}
                className="rounded-lg p-2 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-5">
              <fieldset disabled={saving || !canSave}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    {tr('worker')}
                    <select
                      required={needsNewKnotting}
                      disabled={!hasNewBeams || !canSave}
                      value={job.employeeId}
                      onChange={(event) => {
                        const worker = meta.employees.find((row) => row._id === event.target.value);
                        setJob({
                          ...job,
                          employeeId: event.target.value,
                          rate: worker?.knottingDefaultRate ?? '',
                        });
                      }}
                      className={inputClass}
                    >
                      <option value="">{tr('selectWorker')}</option>
                      {meta.employees.map((row) => (
                        <option key={row._id} value={row._id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    {tr('date')}
                    <input
                      required
                      type="date"
                      value={job.workDate}
                      onChange={(event) => setJob({ ...job, workDate: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                </div>
                {hasNewBeams && selectedWorker && (
                  <div className="mt-4 grid items-end gap-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-bold text-cyan-700">{tr('paymentBasis')}</div>
                      <div className="mt-1 font-bold text-slate-900">{tr(`methods.${method}`)}</div>
                      {!needsRate && (
                        <p className="mt-1 text-xs text-slate-500">{tr('monthlyNote')}</p>
                      )}
                    </div>
                    {needsRate && (
                      <label className="text-xs font-bold text-slate-600">
                        {tr(perBeam ? 'ratePerBeam' : 'ratePerSet')}
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={job.rate}
                          onChange={(event) => setJob({ ...job, rate: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                    )}
                    {needsRate && (
                      <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-emerald-700 sm:col-span-2">
                        {perBeam ? `${newBeamCount} ${tr('beams')}` : `${newBeamCount ? 1 : 0} ${tr('set')}`} ×{' '}
                        {tr('rs')} {money(job.rate)} = {tr('rs')} {money(amount)}
                      </div>
                    )}
                  </div>
                )}
                <div className="mb-2 mt-5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-bold text-slate-800">
                    {tr('selectBeams')}{' '}
                    <span className="text-cyan-700">({job.beamIds.length})</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setJob({ ...job, beamIds: selectable.map((beam) => beam._id) })
                      }
                      className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-bold text-cyan-700"
                    >
                      {tr('selectAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setJob({ ...job, beamIds: [] })}
                      className="px-2 text-xs text-slate-500"
                    >
                      {tr('clear')}
                    </button>
                  </div>
                </div>
                {canLoad && (
                  <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                    <label className="text-xs font-bold text-slate-500">
                      {tr('startLoom')}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={startLoom}
                        onChange={(event) => setStartLoom(event.target.value)}
                        className={`${inputClass} max-w-32`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!job.beamIds.length || startLoom === ''}
                      onClick={autoFill}
                      className="h-10 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 disabled:opacity-50"
                    >
                      {tr('autoFill')}
                    </button>
                  </div>
                )}
                <datalist id="knotting-looms">
                  {meta.looms.map((loom) => (
                    <option key={loom._id} value={loom.loomNumber}>
                      {loom.name}
                    </option>
                  ))}
                </datalist>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selected.beams?.map((beam) => {
                    const available = (beam.status === 'available' && !beam.knottingJobId) ||
                      (beam.status === 'knotting' && beam.knottingJobId);
                    const checked = job.beamIds.includes(beam._id);
                    return (
                      <div
                        key={beam._id}
                        className={`flex flex-wrap items-center justify-between gap-2 p-3 ${checked ? 'bg-cyan-50/50' : ''}`}
                      >
                        <label className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!available || !canSave}
                            onChange={() => toggleBeam(beam._id)}
                            className="h-4 w-4 accent-cyan-700"
                          />
                          <span className="text-sm font-bold text-slate-800">{beam.beamNo}</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <Status value={beam.status} />
                          {available && canLoad ? (
                            <input
                              type="text"
                              list="knotting-looms"
                              aria-label={`${beam.beamNo} ${tr('loomRequired')}`}
                              placeholder={tr('loomRequired')}
                              disabled={!checked}
                              value={job.loomNumbers[beam._id] || ''}
                              onChange={(event) =>
                                setJob({
                                  ...job,
                                  loomNumbers: {
                                    ...job.loomNumbers,
                                    [beam._id]: event.target.value,
                                  },
                                })
                              }
                              className="h-9 w-36 rounded-lg border border-slate-300 px-2 text-sm disabled:bg-slate-100"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">
                              {beam.activeLoomId?.loomNumber || beam.loomNumber || ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <label className="mt-4 block text-xs font-bold text-slate-600">
                  {tr('notes')}
                  <input
                    value={job.notes}
                    onChange={(event) => setJob({ ...job, notes: event.target.value })}
                    className={inputClass}
                  />
                </label>
                {canApprove && (
                  <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={job.approve}
                      onChange={(event) => setJob({ ...job, approve: event.target.checked })}
                      className="accent-emerald-600"
                    />
                    {tr('approve')}
                  </label>
                )}
              </fieldset>
              {canLoad && selected.beams?.some((beam) => beam.status === 'loaded' && (beam.activeLoomId || beam.loomNumber)) && <div className="mt-4 space-y-2 border-t pt-3">
                {selected.beams.filter((beam) => beam.status === 'loaded' && (beam.activeLoomId || beam.loomNumber)).map((beam) => <div key={beam._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3">
                  <span className="text-sm font-bold">{beam.beamNo} / {tr('loomRequired')} {beam.activeLoomId?.loomNumber || beam.loomNumber}</span>
                  <button type="button" disabled={saving} onClick={() => unload(beam)} className="rounded border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800">{tr('completeUnload')}</button>
                </div>)}
              </div>}
              {!!selected.jobs?.length && (
                <details className="mt-5 border-t border-slate-200 pt-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-700">
                    {tr('history')}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {selected.jobs.map((row) => (
                      <div key={row._id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold">
                              {row.employeeId?.name} · {row.workDate}
                            </div>
                            <div className="text-xs text-slate-500">
                              {row.completedBeams} {tr('beams')} ·{' '}
                              {tr(`methods.${row.paymentMethod}`)} · {tr('rs')} {money(row.amount)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Status value={row.status} />
                            {row.status !== 'void' && canVoid && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => voidJob(row._id)}
                                className="text-xs font-bold text-rose-600"
                              >
                                {tr('void')}
                              </button>
                            )}
                          </div>
                        </div>
                        {row.beamAssignments?.some((entry) => entry.loomNumber) && (
                          <div className="mt-2 text-xs text-slate-500">
                            {row.beamAssignments
                              .filter((entry) => entry.loomNumber)
                              .map(
                                (entry) =>
                                  `${selected.beams.find((beam) => beam._id === entry.beamId)?.beamNo || '-'} → ${entry.loomNumber}`
                              )
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <WeavingProductionContext context={selected.productionContext} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={closeSet}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold"
              >
                {tr('close')}
              </button>
              {canSave && canLoad && (
                <button
                  type="submit"
                  disabled={disabledSave}
                  className="h-10 rounded-lg bg-gradient-to-r from-slate-900 to-cyan-800 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? tr('saving') : 'Load Selected Beams'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
