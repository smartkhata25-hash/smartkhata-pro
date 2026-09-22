import React, { useMemo, useState } from 'react';
import { FaMinus, FaPlus, FaSpinner, FaTimes } from 'react-icons/fa';
import { t } from '../../i18n/i18n';
import { createWeftConsumption } from '../../services/weavingYarnStockService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import SearchableCreatableSelect from './SearchableCreatableSelect';
import { useWeavingFeedback } from './WeavingFeedbackModal';

const input = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100';
const requestKey = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const number = (value) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 });
const emptyLine = () => ({ source: null, quantityKg: '' });

export default function WeftConsumptionModal({ meta, onClose, onDone }) {
  const [form, setForm] = useState({ requestKey: requestKey(), date: getBusinessDateInputValue(), loomId: '', notes: '', lines: [emptyLine()] });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const production = useMemo(() => meta.activeProduction?.find((row) => String(row.loomId) === String(form.loomId)) || null, [form.loomId, meta.activeProduction]);
  const stockOptions = useMemo(() => (meta.stockRows || []).filter((row) => Number(row.kg) > 0).map((row) => ({ ...row, _id: [row.yarnId, row.godownId, row.ownershipType, row.ownerPartyId || 'own'].join('|'), label: `${row.yarn?.name || '-'} / ${row.godownName} / ${row.ownerName} / ${number(row.kg)} KG` })), [meta.stockRows]);
  const looms = useMemo(() => (meta.looms || []).filter((loom) => meta.activeProduction?.some((row) => String(row.loomId) === String(loom._id))), [meta.activeProduction, meta.looms]);
  const updateLine = (index, patch) => setForm((current) => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  const removeLine = (index) => setForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }));
  const submit = async () => {
    if (!production) return;
    setSaving(true); setError('');
    try {
      await createWeftConsumption({ ...form, beamId: production.beamId, beamSetId: production.beamSetId, lines: form.lines.map((line) => ({ yarnId: line.source?.yarnId, godownId: line.source?.godownId, ownershipType: line.source?.ownershipType, ownerPartyId: line.source?.ownerPartyId, quantityKg: line.quantityKg })) });
      await onDone();
    } catch (requestError) { setError(requestError.response?.data?.message || requestError.message); }
    finally { setSaving(false); }
  };
  const valid = production && form.lines.length && form.lines.every((line) => line.source && Number(line.quantityKg) > 0 && Number(line.quantityKg) <= Number(line.source.kg));

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-3"><section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl"><header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-white px-5 py-4"><h2 className="mr-auto text-lg font-black text-slate-900">{t('weaving.yarnStock.weftConsumption')}</h2><button type="button" title={t('weaving.stock.close')} onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900"><FaTimes /></button></header>
    <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold text-slate-700">{t('weaving.yarnStock.consumptionDate')}<input type="date" className={input} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><div className="lg:col-span-3"><SearchableCreatableSelect label={t('weaving.yarnStock.loom')} placeholder={t('weaving.yarnStock.selectActiveLoom')} options={looms} value={form.loomId} onChange={(value) => setForm({ ...form, loomId: value })} getLabel={(row) => `${row.loomNumber} - ${row.name}`} required /></div>
      <div className="rounded-md bg-slate-50 p-3"><span className="text-xs font-bold text-slate-500">{t('weaving.yarnStock.activeBeamSet')}</span><b className="block">{production ? `${production.beamNo} / ${production.setNo}` : '-'}</b></div><div className="rounded-md bg-slate-50 p-3"><span className="text-xs font-bold text-slate-500">{t('weaving.yarnStock.contract')}</span><b className="block">{production?.contract?.contractNo || '-'}</b></div><div className="rounded-md bg-slate-50 p-3 sm:col-span-2"><span className="text-xs font-bold text-slate-500">{t('weaving.yarnStock.fabricQuality')}</span><b className="block">{production?.quality?.name || '-'}</b></div>
      <div className="col-span-full overflow-hidden rounded-md border"><div className="flex items-center border-b bg-slate-900 px-4 py-3 text-white"><b className="mr-auto text-sm">{t('weaving.yarnStock.actualWeftLines')}</b><button type="button" title={t('weaving.yarnStock.addYarnLine')} onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} className="grid h-8 w-8 place-items-center rounded-md bg-teal-600 hover:bg-teal-500"><FaPlus /></button></div><div className="divide-y">{form.lines.map((line, index) => <div key={index} className="grid items-end gap-3 p-4 md:grid-cols-[minmax(0,1fr)_180px_42px]"><SearchableCreatableSelect label={t('weaving.yarnStock.availableYarn')} placeholder={t('weaving.yarnStock.selectYarnStock')} options={stockOptions} value={line.source?._id || ''} onChange={(_, source) => updateLine(index, { source })} getLabel={(row) => row.label} required /><label className="text-sm font-semibold text-slate-700">{t('weaving.yarnStock.actualConsumedKg')}<input type="number" min="0.001" step="0.001" max={line.source?.kg || ''} className={input} value={line.quantityKg} onChange={(event) => updateLine(index, { quantityKg: event.target.value })} /><span className="mt-1 block text-xs text-slate-500">{t('weaving.yarnStock.available')}: {number(line.source?.kg)} KG</span></label><button type="button" disabled={form.lines.length === 1} title={t('weaving.yarnStock.removeLine')} onClick={() => removeLine(index)} className="mb-5 grid h-10 w-10 place-items-center rounded-md border text-rose-600 hover:bg-rose-50 disabled:opacity-30"><FaMinus /></button></div>)}</div></div>
      <label className="col-span-full text-sm font-semibold text-slate-700">{t('weaving.stock.notes')}<textarea rows="2" className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><div className="col-span-full flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm font-bold">{t('weaving.stock.cancel')}</button><button type="button" disabled={saving || !valid} onClick={submit} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50">{saving && <FaSpinner className="animate-spin" />}{t('weaving.yarnStock.saveConsumption')}</button></div>
    </div></section></div>;
}
