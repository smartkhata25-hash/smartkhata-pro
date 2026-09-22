import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPrint, FaSpinner } from 'react-icons/fa';
import { requestWeavingConfirmation, showWeavingError, showWeavingWarning } from '../../components/weaving/WeavingFeedbackModal';
import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import { t } from '../../i18n/i18n';
import {
  createFoldingEntry,
  getFoldingMeta,
  listFoldingEntries,
  resolveFoldingLoom,
  voidFoldingEntry,
} from '../../services/weavingFoldingService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';

const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const qualityLabel = (quality) => [quality?.name, quality?.code].filter(Boolean).join(' - ');
const emptyForm = (keep = {}) => ({
  date: keep.date || getBusinessDateInputValue(),
  loomId: keep.loomId || '',
  fabricQualityId: keep.fabricQualityId || '',
  meter: '',
  weightKg: '',
  grade: 'a',
  goodMeter: '',
  bGradeMeter: '',
  rejectedMeter: '',
  defectReason: '',
  checkedByEmployeeId: keep.checkedByEmployeeId || '',
  godownId: keep.godownId || '',
  notes: '',
});

const Detail = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className="truncate font-black text-slate-900" title={value || '-'}>{value || '-'}</div>
  </div>
);

export default function WeavingFoldingPage() {
  const [meta, setMeta] = useState({ looms: [], employees: [], godowns: [], fabrics: [], nextThanNo: '' });
  const [form, setForm] = useState(emptyForm());
  const [resolved, setResolved] = useState(null);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const meterRef = useRef(null);

  const load = async () => {
    const [nextMeta, nextRows] = await Promise.all([getFoldingMeta(), listFoldingEntries()]);
    setMeta(nextMeta);
    setRows(nextRows);
    return nextMeta;
  };

  useEffect(() => {
    load().catch((error) => showWeavingError(error, t('weaving.folding.loadFailed')));
  }, []);

  const selectedQuality = useMemo(
    () => meta.fabrics.find((quality) => String(quality._id) === String(form.fabricQualityId)) || resolved?.quality || null,
    [form.fabricQualityId, meta.fabrics, resolved],
  );
  const resolvedQualityId = resolved?.quality?._id;
  const hasMismatch = Boolean(
    resolvedQualityId && form.fabricQualityId && String(resolvedQualityId) !== String(form.fabricQualityId),
  );
  useEffect(() => {
    if (hasMismatch) showWeavingError(t('weaving.folding.qualityMismatch'));
  }, [hasMismatch]);
  useEffect(() => {
    if (form.loomId && resolved && !resolved.quality) {
      showWeavingWarning(t('weaving.folding.manualQuality'));
    }
  }, [form.loomId, resolved]);

  const chooseLoom = async (loomId) => {
    setForm((current) => ({ ...current, loomId, fabricQualityId: '' }));
    setResolved(null);
    if (!loomId) return;
    try {
      const nextResolved = await resolveFoldingLoom(loomId);
      setResolved(nextResolved);
      if (nextResolved.quality?._id) {
        setForm((current) => ({ ...current, fabricQualityId: nextResolved.quality._id }));
      }
    } catch (error) {
      showWeavingError(error, t('weaving.folding.noBeam'));
    }
  };

  const save = async (closeAfterSave) => {
    setSaving(true);
    try {
      await createFoldingEntry(form);
      const nextMeta = await load();
      if (closeAfterSave) {
        setForm(emptyForm());
        setResolved(null);
      } else {
        setForm(emptyForm({
          date: form.date,
          loomId: form.loomId,
          fabricQualityId: form.fabricQualityId,
          checkedByEmployeeId: form.checkedByEmployeeId,
          godownId: form.godownId,
        }));
        setMeta(nextMeta);
        window.setTimeout(() => meterRef.current?.focus(), 0);
      }
    } catch (error) {
      showWeavingError(error, t('weaving.folding.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const partial = form.grade === 'partial';
  const canSave = form.loomId && form.fabricQualityId && !hasMismatch && !saving;
  const setValue = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/50 p-3 sm:p-5">
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-black text-slate-900">{t('weaving.folding.title')}</h1>
          <p className="text-sm text-slate-500">{t('weaving.folding.subtitle')}</p>
        </header>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-bold">
              {t('weaving.folding.thanNo')}
              <input readOnly className={`${inputClass} cursor-not-allowed bg-slate-100 font-bold text-slate-700`} value={meta.nextThanNo || '-'} />
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.date')}
              <input type="date" className={inputClass} value={form.date} onChange={setValue('date')} />
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.loom')}
              <select required className={inputClass} value={form.loomId} onChange={(event) => chooseLoom(event.target.value)}>
                <option value="">{t('weaving.folding.selectLoom')}</option>
                {meta.looms.map((loom) => <option key={loom._id} value={loom._id}>{loom.loomNumber} - {loom.name}</option>)}
              </select>
            </label>
            <SearchableCreatableSelect
              required
              label={t('weaving.folding.quality')}
              placeholder={t('weaving.folding.selectQuality')}
              options={meta.fabrics}
              value={form.fabricQualityId}
              onChange={(fabricQualityId) => setForm((current) => ({ ...current, fabricQualityId }))}
              getLabel={qualityLabel}
            />

            {selectedQuality && (
              <div className="col-span-full grid gap-3 rounded-lg border border-teal-100 bg-teal-50/50 p-4 sm:grid-cols-3 lg:grid-cols-7">
                <Detail label={t('weaving.folding.quality')} value={selectedQuality.name} />
                <Detail label={t('weaving.folding.count')} value={[selectedQuality.warpCount, selectedQuality.weftCount].filter(Boolean).join(' / ')} />
                <Detail label={t('weaving.folding.construction')} value={selectedQuality.construction} />
                <Detail label={t('weaving.folding.width')} value={selectedQuality.width} />
                <Detail label={t('weaving.folding.brand')} value={selectedQuality.brand} />
                <Detail label={t('weaving.folding.cadReference')} value={selectedQuality.cadReference} />
                <Detail label={t('weaving.folding.contractSet')} value={[resolved?.contract?.contractNo, resolved?.beamSet?.setNo].filter(Boolean).join(' / ')} />
              </div>
            )}

            <label className="text-sm font-bold">
              {t('weaving.folding.meter')}
              <input ref={meterRef} required type="number" min="0.001" step="0.001" className={inputClass} value={form.meter} onChange={setValue('meter')} />
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.weightKg')}
              <input required type="number" min="0.001" step="0.001" className={inputClass} value={form.weightKg} onChange={setValue('weightKg')} />
              <span className="text-xs text-slate-500">{(Number(form.weightKg || 0) * 2.2046226218).toFixed(3)} LBS</span>
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.grade')}
              <select className={inputClass} value={form.grade} onChange={setValue('grade')}>
                <option value="a">A Grade</option><option value="b">B Grade</option>
                <option value="rejected">Rejected</option><option value="partial">Partial</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.checker')}
              <select className={inputClass} value={form.checkedByEmployeeId} onChange={setValue('checkedByEmployeeId')}>
                <option value="">-</option>
                {meta.employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.godown')}
              <select className={inputClass} value={form.godownId} onChange={setValue('godownId')}>
                <option value="">Folding / Unassigned</option>
                {meta.godowns.map((godown) => <option key={godown._id} value={godown._id}>{godown.name}</option>)}
              </select>
            </label>
            {partial && <>
              <label className="text-sm font-bold">{t('weaving.folding.goodMeter')}<input type="number" className={inputClass} value={form.goodMeter} onChange={setValue('goodMeter')} /></label>
              <label className="text-sm font-bold">{t('weaving.folding.bMeter')}<input type="number" className={inputClass} value={form.bGradeMeter} onChange={setValue('bGradeMeter')} /></label>
              <label className="text-sm font-bold">{t('weaving.folding.rejectMeter')}<input type="number" className={inputClass} value={form.rejectedMeter} onChange={setValue('rejectedMeter')} /></label>
            </>}
            {(partial || form.grade === 'rejected') && (
              <label className="text-sm font-bold">
                {t('weaving.folding.reason')}
                <select className={inputClass} value={form.defectReason} onChange={setValue('defectReason')}>
                  <option value="">-</option>
                  {['Weaving Fault', 'Hole', 'Oil Mark', 'Stain', 'Width Issue', 'Broken Pick', 'Other'].map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm font-bold sm:col-span-2">
              {t('weaving.folding.notes')}
              <input className={inputClass} value={form.notes} onChange={setValue('notes')} />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={!canSave} onClick={() => save(true)} className="h-10 rounded-md border px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50">{t('weaving.folding.save')}</button>
            <button type="button" disabled={!canSave} onClick={() => save(false)} className="inline-flex h-10 min-w-28 items-center justify-center rounded-md bg-teal-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <FaSpinner className="animate-spin" /> : t('weaving.folding.saveNew')}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-white">
          <div className="flex justify-between border-b p-4">
            <h2 className="font-black">{t('weaving.folding.recent')}</h2>
            <button type="button" onClick={() => window.open(`${process.env.REACT_APP_API_BASE_URL}/api/weaving/folding/parchi?date=${form.date}&token=${localStorage.getItem('token')}`, '_blank')} className="inline-flex items-center gap-2 text-sm font-bold text-teal-700"><FaPrint />{t('weaving.folding.print')}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs text-white"><tr><th className="p-3">Than</th><th className="p-3">Loom</th><th className="p-3">Quality</th><th className="p-3">Meter</th><th className="p-3">KG</th><th className="p-3">Grade</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y">
                {rows.map((row) => <tr key={row._id}>
                  <td className="p-3 font-bold">{row.thanNo}</td><td className="p-3">{row.loomId?.loomNumber}</td>
                  <td className="p-3">{row.qualitySnapshot?.name}</td><td className="p-3">{row.meter}</td>
                  <td className="p-3">{row.weightKg}</td><td className="p-3 uppercase">{row.grade}</td>
                  <td className="p-3"><button type="button" className="text-xs font-bold text-rose-600" onClick={async () => { if (await requestWeavingConfirmation({ message: t('weaving.folding.voidConfirm') })) { try { await voidFoldingEntry(row._id, 'Voided from Folding'); await load(); } catch (error) { showWeavingError(error, t('weaving.folding.saveFailed')); } } }}>Void</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
