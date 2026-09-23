import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaEye as Eye,
  FaSpinner as Loader2,
  FaRedo as RefreshCw,
  FaTimes as X,
} from 'react-icons/fa';
import {
  requestWeavingConfirmation,
  showWeavingError,
} from '../../components/weaving/WeavingFeedbackModal';
import {
  createKnottingJob,
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
  const amount =
    job.beamIds.length && needsRate
      ? (perBeam ? job.beamIds.length : 1) * Number(job.rate || 0)
      : 0;
  const selectable =
    selected?.beams?.filter((beam) => beam.status === 'available' && !beam.knottingJobId) || [];
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
    if (!selected || saving || !canSave || !job.beamIds.length) return;
    const loadBeams = event.nativeEvent.submitter?.value === 'load';
    if (loadBeams && !canLoad) return;
    setSaving(true);
    try {
      await createKnottingJob({
        employeeId: job.employeeId,
        beamSetId: selected._id,
        beamIds: job.beamIds,
        workDate: job.workDate,
        rate: needsRate ? Number(job.rate || 0) : 0,
        approve: canApprove && job.approve,
        notes: job.notes,
        load: loadBeams,
        beamAssignments: job.beamIds.map((beamId) => ({
          beamId,
          loomNumber: job.loomNumbers[beamId] || '',
        })),
      });
      setSelected(null);
      setJob(freshJob(canApprove));
      await load();
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
  const disabledSave =
    saving ||
    !canSave ||
    !job.employeeId ||
    !job.beamIds.length ||
    (needsRate && (job.rate === '' || !Number.isFinite(Number(job.rate)) || Number(job.rate) < 0));

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
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {['available', 'knotting', 'loaded', 'completed'].map((status) => (
          <div key={status} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase text-slate-500">
              {tr(`status.${status}`)}
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {sets.filter((row) => row.status === status).length}
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
                  {tr(key)}
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
                  <td className="px-4 py-3">{row.sizingPartyId?.name || '-'}</td>
                  <td className="px-4 py-3">
                    {row.fabricQualityId?.qualityName ||
                      row.fabricQualityId?.name ||
                      row.count ||
                      '-'}
                  </td>
                  <td className="px-4 py-3 font-bold">{row.beamCount}</td>
                  <td className="px-4 py-3">
                    <Status value={row.status} />
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
      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knotting-title"
        >
          <form
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
                onClick={() => setSelected(null)}
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
                      required
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
                {selectedWorker && (
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
                        {perBeam ? `${job.beamIds.length} ${tr('beams')}` : `1 ${tr('set')}`} ×{' '}
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
                    const available = beam.status === 'available' && !beam.knottingJobId;
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
                            disabled={!available}
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
                              aria-label={`${beam.beamNo} ${tr('loomOptional')}`}
                              placeholder={tr('loomOptional')}
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
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSelected(null)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold"
              >
                {tr('close')}
              </button>
              {canSave && (
                <button
                  type="submit"
                  value="knotting"
                  disabled={disabledSave}
                  className="h-10 rounded-lg border border-cyan-700 bg-white px-4 text-sm font-bold text-cyan-800 disabled:opacity-50"
                >
                  {saving ? tr('saving') : tr('saveKnotting')}
                </button>
              )}
              {canSave && canLoad && (
                <button
                  type="submit"
                  value="load"
                  disabled={disabledSave}
                  className="h-10 rounded-lg bg-gradient-to-r from-slate-900 to-cyan-800 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? tr('saving') : tr('saveLoad')}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
