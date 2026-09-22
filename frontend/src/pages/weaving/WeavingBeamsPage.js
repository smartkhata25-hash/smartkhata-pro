import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle as CheckCircle2,
  FaEye as Eye,
  FaSpinner as Loader2,
  FaRedo as RefreshCw,
  FaTools as Scissors,
  FaTimes as X,
} from 'react-icons/fa';
import { requestWeavingConfirmation, showWeavingError } from '../../components/weaving/WeavingFeedbackModal';
import {
  createKnottingJob,
  getBeamMeta,
  getBeamSet,
  listBeamSets,
  syncBeamReceipts,
  voidKnottingJob,
} from '../../services/weavingBeamService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';

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
const emptyJob = {
  employeeId: '',
  beamIds: [],
  loomId: '',
  workDate: getBusinessDateInputValue(),
  rate: '',
  approve: true,
  notes: '',
};

export default function WeavingBeamsPage() {
  const [sets, setSets] = useState([]);
  const [meta, setMeta] = useState({ employees: [], looms: [] });
  const [selected, setSelected] = useState(null);
  const [job, setJob] = useState(emptyJob);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showJob, setShowJob] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, setup] = await Promise.all([listBeamSets(), getBeamMeta()]);
      setSets(rows || []);
      setMeta(setup || { employees: [], looms: [] });
    } catch (error) {
      showWeavingError(error, 'Failed to load Beam Sets');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const openSet = async (id) => {
    try {
      setSelected(await getBeamSet(id));
    } catch (error) {
      showWeavingError(error, 'Failed to load Beam Set');
    }
  };
  const selectedWorker = useMemo(
    () => meta.employees.find((row) => row._id === job.employeeId),
    [job.employeeId, meta.employees]
  );

  const paymentMethodRaw = String(selectedWorker?.knottingPaymentMethod || '');

  const paymentMethodKey = paymentMethodRaw.toLowerCase().replace(/[\s-]+/g, '_');

  const isPerBeamMethod =
    paymentMethodKey.includes('per_beam') || paymentMethodKey.includes('perbeam');

  const isPerSetMethod =
    paymentMethodKey.includes('per_set') || paymentMethodKey.includes('perset');

  const isBonusMethod = paymentMethodKey.includes('bonus');

  const needsKnottingRate = isPerBeamMethod || isPerSetMethod;

  const paymentMethodLabel = paymentMethodRaw
    ? paymentMethodRaw.replaceAll('_', ' ')
    : 'Not configured';

  const rateLabel = isPerBeamMethod
    ? isBonusMethod
      ? 'Bonus Rate Per Beam (Rs)'
      : 'Rate Per Beam (Rs)'
    : isPerSetMethod
      ? isBonusMethod
        ? 'Bonus Rate Per Set (Rs)'
        : 'Rate Per Set (Rs)'
      : '';

  const calculatedAmount = isPerBeamMethod
    ? job.beamIds.length * Number(job.rate || 0)
    : isPerSetMethod
      ? Number(job.rate || 0)
      : 0;

  const selectableBeams = selected?.beams?.filter((beam) => beam.status !== 'completed') || [];

  const toggleBeam = (id) =>
    setJob((current) => ({
      ...current,
      beamIds: current.beamIds.includes(id)
        ? current.beamIds.filter((value) => value !== id)
        : [...current.beamIds, id],
    }));

  const selectAllBeams = () =>
    setJob((current) => ({
      ...current,
      beamIds: selectableBeams.map((beam) => beam._id),
    }));

  const clearBeams = () =>
    setJob((current) => ({
      ...current,
      beamIds: [],
    }));

  const submitJob = async (event) => {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);

    try {
      await createKnottingJob({
        ...job,
        beamSetId: selected._id,
        completedBeams: job.beamIds.length,
        rate: needsKnottingRate ? Number(job.rate || 0) : 0,
      });


      setShowJob(false);
      setJob(emptyJob);

      await openSet(selected._id);
      await load();
    } catch (error) {
      showWeavingError(error, 'Failed to save Knotting Job');
    } finally {
      setSaving(false);
    }
  };
  const voidJob = async (id) => {
    if (!await requestWeavingConfirmation({ message: 'Void this knotting job and reverse its employee payable?' })) return;
    try {
      await voidKnottingJob(id, 'Voided from Beam page');
      await openSet(selected._id);
      await load();
    } catch (error) {
      showWeavingError(error, 'Failed to void job');
    }
  };
  const sync = async () => {
    setLoading(true);
    try {
      await syncBeamReceipts();
      await load();
    } catch (error) {
      showWeavingError(error, 'Sync failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Beam & Knotting</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sizing receipt beams, knotting earnings and loom loading
          </p>
        </div>
        <button
          onClick={sync}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white"
        >
          <RefreshCw size={16} />
          Sync Receipts
        </button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {['available', 'knotting', 'loaded', 'completed'].map((status) => (
          <div key={status} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase text-slate-500">{status}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {sets.filter((row) => row.status === status).length}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-3">Set / Receipt</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Quality</th>
                <th className="px-4 py-3">Beams</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
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
                  <tr key={row._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {row.setNo || 'No set'}
                      <div className="text-xs font-normal text-slate-500">{row.receiptNo}</div>
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
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${badge[row.status]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        title="View set"
                        onClick={() => openSet(row._id)}
                        className="rounded-md p-2 text-cyan-700 hover:bg-cyan-50"
                      >
                        <Eye size={17} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-black">{selected.setNo || selected.receiptNo}</h2>
                <p className="text-xs text-slate-500">
                  {selected.receiptNo} · {selected.sizingPartyId?.name || ''}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-6 p-5">
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setJob(emptyJob);
                    setShowJob(true);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white"
                >
                  <Scissors size={16} />
                  Knotting / Load
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selected.beams?.map((beam) => (
                  <div key={beam._id} className="rounded-lg border border-slate-200 p-3">
                    <div className="font-black text-slate-900">{beam.beamNo}</div>
                    <span
                      className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-bold capitalize ${badge[beam.status]}`}
                    >
                      {beam.status}
                    </span>
                    {beam.activeLoomId && (
                      <div className="mt-2 text-xs text-slate-500">
                        Loom {beam.activeLoomId.loomNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-3 font-black text-slate-900">Knotting History</h3>
                <div className="space-y-2">
                  {selected.jobs?.map((row) => (
                    <div
                      key={row._id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <div className="font-bold">
                          {row.employeeId?.name || 'Employee'} · {row.workDate}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.completedBeams} beam(s) · {row.paymentMethod.replaceAll('_', ' ')} ·
                          Rs {money(row.amount)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${badge[row.status]}`}
                        >
                          {row.status}
                        </span>
                        {row.status !== 'void' && (
                          <button
                            onClick={() => voidJob(row._id)}
                            className="text-xs font-bold text-rose-600"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showJob && selected && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={submitJob}
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-cyan-800 px-5 py-4 text-white">
              <div>
                <h2 className="text-lg font-black">Beam Knotting Job</h2>

                <p className="mt-1 text-xs text-slate-200">
                  Set: {selected.setNo || selected.receiptNo}
                  {' · '}
                  {selected.beamCount || selected.beams?.length || 0} Beams
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowJob(false)}
                className="rounded-lg p-2 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">
                  Knotting Worker
                  <select
                    required
                    value={job.employeeId}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        employeeId: e.target.value,
                        rate: '',
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    <option value="">Select worker</option>

                    {meta.employees.map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-600">
                  Work Date
                  <input
                    required
                    type="date"
                    value={job.workDate}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        workDate: e.target.value,
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
              </div>

              {selectedWorker && (
                <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-3">
                  <div className="text-xs font-bold uppercase text-cyan-700">Payment Method</div>

                  <div className="mt-1 font-black capitalize text-slate-900">
                    {paymentMethodLabel}
                  </div>

                  {!needsKnottingRate && (
                    <div className="mt-1 text-xs text-slate-600">
                      This worker is salary based. Knotting will be recorded, but no extra Knotting
                      earning will be created.
                    </div>
                  )}
                </div>
              )}

              {selectedWorker && needsKnottingRate && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    {rateLabel}

                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={job.rate}
                      onChange={(e) =>
                        setJob({
                          ...job,
                          rate: e.target.value,
                        })
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </label>

                  <div>
                    <div className="text-xs font-bold text-slate-600">Calculated Amount</div>

                    <div className="mt-1 flex h-11 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-lg font-black text-emerald-700">
                      Rs {money(calculatedAmount)}
                    </div>
                  </div>

                  <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {isPerBeamMethod
                      ? `${job.beamIds.length} selected beam(s) × Rs ${money(job.rate)}`
                      : `Per Set charge: Rs ${money(job.rate)} — beam quantity will not multiply the Set rate.`}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-600">Select Beams</div>

                    <div className="text-xs text-slate-400">{job.beamIds.length} selected</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllBeams}
                      className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-50"
                    >
                      Select All
                    </button>

                    <button
                      type="button"
                      onClick={clearBeams}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectableBeams.map((beam) => {
                    const checked = job.beamIds.includes(beam._id);

                    return (
                      <label
                        key={beam._id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold transition ${
                          checked
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBeam(beam._id)}
                        />

                        {beam.beamNo}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-600">
                  Load on Loom
                  <select
                    value={job.loomId}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        loomId: e.target.value,
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    <option value="">Knotting only / Load later</option>

                    {meta.looms.map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.loomNumber} · {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-600">
                  Notes
                  <input
                    type="text"
                    value={job.notes}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Optional notes"
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={job.approve}
                  onChange={(e) =>
                    setJob({
                      ...job,
                      approve: e.target.checked,
                    })
                  }
                  className="mt-1"
                />

                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />

                <span>
                  {needsKnottingRate
                    ? 'Approve and post Knotting earning to Employee Ledger'
                    : 'Approve Knotting work — salary will continue through normal Payroll'}
                </span>
              </label>

              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowJob(false)}
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  disabled={
                    saving ||
                    !job.employeeId ||
                    !job.beamIds.length ||
                    (needsKnottingRate && Number(job.rate || 0) <= 0)
                  }
                  className="h-10 rounded-lg bg-gradient-to-r from-slate-900 to-cyan-800 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : job.approve ? 'Approve & Save' : 'Save Draft'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
