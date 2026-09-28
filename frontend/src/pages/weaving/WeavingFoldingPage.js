import WeavingProductionContext, { contextForRun, contractIsOpen } from '../../components/weaving/WeavingProductionContext';
import WeightKgLbsInput from '../../components/weaving/WeightKgLbsInput';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaEdit, FaPrint, FaSpinner } from 'react-icons/fa';
import { requestWeavingConfirmation, showWeavingError, showWeavingSuccess, showWeavingWarning } from '../../components/weaving/WeavingFeedbackModal';
import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import { t } from '../../i18n/i18n';
import {
  createFoldingEntry,
  updateFoldingEntry,
  getFoldingMeta,
  listFoldingEntries,
  resolveFoldingLoom,
  voidFoldingEntry,
} from '../../services/weavingFoldingService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';

const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const qualityLabel = (quality) => [quality?.name, quality?.code].filter(Boolean).join(' - ');
const emptyForm = (keep = {}) => ({
  date: keep.date || getBusinessDateInputValue(),
  loomId: keep.loomId || '',
  contractId: keep.contractId || '',
  customerPartyId: keep.customerPartyId || '',
  fabricQualityId: keep.fabricQualityId || '',
  meter: '',
  weightKg: '',
  weightLbs: '',
  ownershipType: keep.ownershipType || '',
  ownerPartyId: keep.ownerPartyId || '',
  grade: 'a',
  goodMeter: '',
  bGradeMeter: '',
  rejectedMeter: '',
  defectReason: '',
  checkedByEmployeeId: keep.checkedByEmployeeId || '',
  godownId: keep.godownId || '',
  notes: '',
  beamCompletionTriggered: false,
});

const Detail = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className="truncate font-black text-slate-900" title={value || '-'}>{value || '-'}</div>
  </div>
);

export default function WeavingFoldingPage() {
  const [meta, setMeta] = useState({ looms: [], employees: [], godowns: [], fabrics: [], parties: [], contracts: [], nextThanNo: '' });
  const [form, setForm] = useState(emptyForm());
  const [resolved, setResolved] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const savePending = useRef(false);
  const meterRef = useRef(null);
  const [resolving, setResolving] = useState(false);
  const [showAllLooms, setShowAllLooms] = useState(false);
  const [manualContext, setManualContext] = useState(false);

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
  const ownerValue = (context) => context?.ownershipType === 'own' ? 'own' : String(context?.ownerPartyId?._id || context?.ownerPartyId || '');
  const ownerLabel = (context) => context?.ownershipType === 'own' ? t('weaving.production.own')
    : context?.ownerParty?.name || context?.ownerPartyId?.name || meta.parties?.find((party) => String(party._id) === ownerValue(context))?.name ||
      (ownerValue(context) === ownerValue(resolved) ? resolved?.ownerParty?.name : '') || '-';
  const partyForRun = (run) => String(run?.contract?.partyId || run?.ownerPartyId || '');
  const knownRun = Boolean(resolved?.contract || (resolved?.beam && resolved?.quality && resolved?.ownershipType));
  const selectedContract = meta.contracts?.find((contract) => String(contract._id) === String(form.contractId));
  const visibleLooms = meta.looms.filter((loom) => showAllLooms || String(loom._id) === String(form.loomId) || (
    (!form.contractId || String(loom.currentRun?.contract?._id || '') === String(form.contractId)) &&
    (!form.customerPartyId || partyForRun(loom.currentRun) === String(form.customerPartyId)) &&
    (!form.ownershipType || form.customerPartyId || ownerValue(loom.currentRun) === ownerValue(form)) &&
    (!form.fabricQualityId || String(loom.currentRun?.quality?._id || '') === String(form.fabricQualityId))
  ));
  const visibleContracts = (meta.contracts || []).filter((contract) => String(contract._id) === String(form.contractId) ||
    ((contractIsOpen(contract) || meta.looms.some((loom) => String(loom.currentRun?.contract?._id) === String(contract._id))) &&
    (!form.customerPartyId || String(contract.partyId) === String(form.customerPartyId)) &&
    (!form.fabricQualityId || String(contract.itemId) === String(form.fabricQualityId))));
  const visibleQualities = meta.fabrics.filter((quality) => !form.customerPartyId || manualContext || form.contractId || String(quality._id) === String(form.fabricQualityId) ||
    meta.looms.some((loom) => partyForRun(loom.currentRun) === String(form.customerPartyId) && String(loom.currentRun?.quality?._id) === String(quality._id)));
  const chooseContract = (contractId) => {
    if (knownRun && String(contractId) !== String(resolved.contract?._id || '')) { showWeavingWarning(t('weaving.production.contextMismatch')); return; }
    const contract = meta.contracts.find((row) => String(row._id) === String(contractId));
    setForm((current) => ({ ...current, contractId, ...(contract ? {
      customerPartyId: contract.partyId, fabricQualityId: contract.productionContext?.fabricQualityId || '',
      ownershipType: contract.productionContext?.ownershipType || '', ownerPartyId: contract.productionContext?.ownerPartyId || '',
    } : {}) }));
  };
  const chooseCustomer = (value) => {
    const customerPartyId = value === 'own' ? '' : value;
    if ((knownRun && customerPartyId !== partyForRun(resolved)) || (form.contractId && customerPartyId !== String(selectedContract?.partyId || ''))) {
      showWeavingWarning(t('weaving.production.contextMismatch')); return;
    }
    setForm((current) => ({ ...current, customerPartyId, ownershipType: value === 'own' ? 'own' : '', ownerPartyId: '' }));
  };
  const chooseOwner = (value) => {
    if (resolved?.ownershipType && value !== ownerValue(resolved)) {
      showWeavingWarning(t('weaving.production.ownerMismatch'));
      return;
    }
    setForm((current) => ({ ...current, ownershipType: value === 'own' ? 'own' : value ? 'party' : '', ownerPartyId: value === 'own' ? '' : value, customerPartyId: value === 'own' ? '' : value }));
  };
  const chooseQuality = (fabricQualityId) => {
    if ((resolvedQualityId || (!resolved && selectedContract)) && String(fabricQualityId) !== String(resolvedQualityId || selectedContract?.itemId)) {
      showWeavingWarning(t('weaving.folding.qualityMismatch'));
      return;
    }
    setForm((current) => ({ ...current, fabricQualityId }));
  };
  const chooseLoom = async (loomId) => {
    if (resolving || saving) return;
    if (!loomId) {
      setForm((current) => ({ ...current, loomId }));
      setResolved(null);
      setCurrentRun(null);
      setShowPrevious(false);
      return;
    }
    setResolving(true);
    try {
      const nextResolved = await resolveFoldingLoom(loomId);
      const conflicts = ((nextResolved.contract || (nextResolved.quality && nextResolved.ownershipType)) && String(form.contractId || '') !== String(nextResolved.contract?._id || '') && form.contractId) ||
        (form.customerPartyId && partyForRun(nextResolved) && String(form.customerPartyId) !== partyForRun(nextResolved)) ||
        (nextResolved.quality?._id && form.fabricQualityId && String(nextResolved.quality._id) !== String(form.fabricQualityId)) ||
        (nextResolved.ownershipType && form.ownershipType && ownerValue(nextResolved) !== ownerValue(form));
      if (conflicts && !await requestWeavingConfirmation({ message: t('weaving.production.useRunContext') + '\n' +
        [nextResolved.contract?.contractNo, nextResolved.contract?.partyName || ownerLabel(nextResolved), nextResolved.beam?.beamNo, qualityLabel(nextResolved.quality)].filter(Boolean).join(' / ') })) return;
      setCurrentRun(nextResolved);
      setShowPrevious(false);
      setResolved(nextResolved);
      setManualContext(!nextResolved.quality || !nextResolved.ownershipType);
      setForm((current) => ({ ...current, loomId,
        contractId: nextResolved.contract?._id || (nextResolved.quality && nextResolved.ownershipType ? '' : current.contractId),
        customerPartyId: nextResolved.contract?.partyId || nextResolved.ownerPartyId || (nextResolved.quality && nextResolved.ownershipType ? '' : current.customerPartyId),
        fabricQualityId: nextResolved.quality?._id || current.fabricQualityId,
        ownershipType: nextResolved.ownershipType || current.ownershipType,
        ownerPartyId: nextResolved.ownershipType ? nextResolved.ownerPartyId || '' : current.ownerPartyId,
      }));
      if (!nextResolved.quality) showWeavingWarning(t('weaving.production.missingQuality').replace('{loom}', nextResolved.loom.loomNumber));
    } catch (error) {
      showWeavingError(error, t('weaving.folding.noBeam'));
    } finally {
      setResolving(false);
    }
  };

  const chooseRun = (beamId) => {
    const historical = beamId ? currentRun?.previousRuns?.find((run) => String(run.beam._id) === beamId) : null;
    const run = historical ? { ...historical, loom: currentRun.loom, historical: true } : currentRun;
    if (!run) return;
    setResolved(run);
    setManualContext(!run.quality || !run.ownershipType);
    setForm((current) => ({ ...current, contractId: run.contract?._id || '',
      customerPartyId: run.contract?.partyId || run.ownerPartyId || '',
      fabricQualityId: run.quality?._id || '', ownershipType: run.ownershipType || '', ownerPartyId: run.ownerPartyId || '',
    }));
  };

  const save = async (closeAfterSave) => {
    if (savePending.current || saving) return;
    savePending.current = true;
    setSaving(true);
    try {
      if (form.beamCompletionTriggered && !editing?.beamCompletionTriggered && !await requestWeavingConfirmation({ message: 'This is the last Than. Complete this Beam and free the Loom?' })) return;
      const payload = { ...form, expectedBeamId: resolved?.beam?._id || null, historicalBeamId: resolved?.historical ? resolved.beam._id : null };
      const savedEntry = editing ? await updateFoldingEntry(editing._id, payload) : await createFoldingEntry(payload);

      // Saving must complete independently of the optional list/meta refresh. A slow refresh
      // previously held `saving` forever even though the Than had already been posted.
      if (closeAfterSave || editing || form.beamCompletionTriggered) {
        setEditing(null);
        setForm(emptyForm());
        setResolved(null);
        setCurrentRun(null);
        setShowPrevious(false);
        setManualContext(false);
      } else {
        setForm(emptyForm({
          date: form.date,
          loomId: form.loomId,
          contractId: form.contractId, customerPartyId: form.customerPartyId,
          fabricQualityId: form.fabricQualityId,
          ownershipType: form.ownershipType,
          ownerPartyId: form.ownerPartyId,
          checkedByEmployeeId: form.checkedByEmployeeId,
          godownId: form.godownId,
        }));
        window.setTimeout(() => meterRef.current?.focus(), 0);
      }

      showWeavingSuccess(`${t('weaving.folding.saved')} ${savedEntry?.thanNo || ''}`.trim());

      // Keep the screen current without making a successful save appear stuck if the
      // independent refresh is slow or unavailable.
      load().catch((error) => showWeavingError(error, t('weaving.folding.loadFailed')));
    } catch (error) {
      if (error?.response?.status === 409) showWeavingWarning(error.response.data?.message || t('weaving.production.runChanged'));
      else showWeavingError(error, t('weaving.folding.saveFailed'));
    } finally {
      setSaving(false);
      savePending.current = false;
    }
  };

  const partial = form.grade === 'partial';
  const canSave = form.loomId && form.fabricQualityId && form.ownershipType &&
    (form.ownershipType !== 'party' || form.ownerPartyId) && resolved && !hasMismatch && !saving && !resolving && hasPermission(editing ? 'weaving.folding.edit' : 'weaving.folding.create');
  const setValue = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const edit = (row) => {
    if (saving || resolving) return;
    const refId = (value) => value?._id || value || '';
    setEditing(row);
    setForm({ ...emptyForm(), ...row, loomId: refId(row.loomId), contractId: refId(row.contractId), fabricQualityId: refId(row.fabricQualityId), godownId: refId(row.godownId), checkedByEmployeeId: refId(row.checkedByEmployeeId), ownerPartyId: refId(row.ownerPartyId), customerPartyId: refId(row.contractId?.partyId), beamCompletionTriggered: Boolean(row.beamCompletionTriggered) });
    setResolved({ loom: { _id: refId(row.loomId), loomNumber: row.loomNumberSnapshot }, beam: row.beamId ? { _id: refId(row.beamId), beamNo: row.beamNoSnapshot } : null, beamSet: { _id: row.beamSetId, setNo: row.setNoSnapshot }, contract: row.contractId ? { ...row.contractId, _id: refId(row.contractId), contractNo: row.contractNoSnapshot } : null, quality: { ...row.qualitySnapshot, _id: refId(row.fabricQualityId) }, ownershipType: row.ownershipType, ownerPartyId: refId(row.ownerPartyId) });
    setCurrentRun(null);
    setShowPrevious(false);
    setManualContext(false);
    meterRef.current?.focus();
  };

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
              <input readOnly className={`${inputClass} cursor-not-allowed bg-slate-100 font-bold text-slate-700`} value={editing?.thanNo || meta.nextThanNo || '-'} />
            </label>
            <label className="text-sm font-bold">
              {t('weaving.folding.date')}
              <input type="date" className={inputClass} value={form.date} onChange={setValue('date')} />
            </label>
            <label className="text-sm font-bold">
              {t('weaving.production.contract')}
              <select className={inputClass} value={form.contractId} disabled={saving || resolving || knownRun} onChange={(event) => chooseContract(event.target.value)}>
                <option value="">{t('weaving.production.noContract')}</option>
                {visibleContracts.map((contract) => <option key={contract._id} value={contract._id}>{contract.contractNo} - {contract.partyName}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">
              {t('weaving.production.customer')}
              <select className={inputClass} value={form.customerPartyId || (form.ownershipType === 'own' && !form.contractId ? 'own' : '')}
                disabled={saving || resolving || knownRun || Boolean(form.contractId)} onChange={(event) => chooseCustomer(event.target.value)}>
                <option value="">-</option><option value="own">{t('weaving.production.ownStock')}</option>
                {(meta.parties || []).map((party) => <option key={party._id} value={party._id}>{party.name}</option>)}
                {resolved?.contract?.partyId && !meta.parties.some((party) => String(party._id) === String(resolved.contract.partyId)) && <option value={resolved.contract.partyId}>{resolved.contract.partyName}</option>}
              </select>
            </label>
            {manualContext && !knownRun && !form.contractId && <label className="text-sm font-bold">
              {t('weaving.production.owner')}
              <select className={inputClass} value={ownerValue(form)} disabled={saving || resolving} onChange={(event) => chooseOwner(event.target.value)}>
                <option value="">{t('weaving.production.selectOwner')}</option>
                <option value="own">{t('weaving.production.own')}</option>
                {(meta.parties || []).map((party) => <option key={party._id} value={party._id}>{party.name}</option>)}
                {resolved?.ownerParty && !meta.parties?.some((party) => String(party._id) === String(resolved.ownerParty._id)) &&
                  <option value={resolved.ownerParty._id}>{resolved.ownerParty.name}</option>}
              </select>
            </label>}
            <label className="text-sm font-bold">
              {t('weaving.folding.loom')}
              <select required disabled={saving || resolving || Boolean(editing)} className={inputClass} value={form.loomId} onChange={(event) => chooseLoom(event.target.value)}>
                <option value="">{t('weaving.folding.selectLoom')}</option>
                {visibleLooms.map((loom) => <option key={loom._id} value={loom._id}>{loom.loomNumber} - {loom.name}</option>)}
              </select>
            </label>
            <fieldset disabled={Boolean(resolvedQualityId || (!resolved && form.contractId)) || resolving || saving}>
            <SearchableCreatableSelect
              required
              label={t('weaving.folding.quality')}
              placeholder={t('weaving.folding.selectQuality')}
              options={resolved?.quality && !meta.fabrics.some((quality) => String(quality._id) === String(resolvedQualityId)) ? [...visibleQualities, resolved.quality] : visibleQualities}
              value={form.fabricQualityId}
              onChange={chooseQuality}
              getLabel={qualityLabel}
            />
            </fieldset>
            <label className="col-span-full flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={showAllLooms} onChange={(event) => setShowAllLooms(event.target.checked)} />
              {t('weaving.production.showAllLooms')}
            </label>
            {!!currentRun?.previousRuns?.length && <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 p-3">
              <button type="button" disabled={saving || resolving} className="text-xs font-bold text-amber-900" onClick={() => setShowPrevious(!showPrevious)}>{t('weaving.folding.previousRuns')}</button>
              {showPrevious && <select aria-label={t('weaving.folding.previousRuns')} className={inputClass} disabled={saving || resolving} value={resolved?.historical ? resolved.beam._id : ''} onChange={(event) => chooseRun(event.target.value)}>
                <option value="">{t('weaving.folding.currentRun')} - {currentRun.beam?.beamNo || '-'}</option>
                {currentRun.previousRuns.map((run) => <option key={run.beam._id} value={run.beam._id}>{[run.beam.beamNo, run.contract?.contractNo, run.contract?.partyName || run.ownerParty?.name, run.quality?.name, String(run.beam.completedAt || '').slice(0, 10)].filter(Boolean).join(' / ')}</option>)}
              </select>}
            </div>}
            {resolved?.beam && <div className="col-span-full text-sm font-bold text-teal-800">{t(resolved.historical ? 'weaving.folding.previousRun' : 'weaving.folding.currentRun')}: {resolved.beam.beamNo}</div>}
            {!knownRun && !form.contractId && <label className="col-span-full flex items-center gap-2 text-xs"><input type="checkbox" checked={manualContext} onChange={(event) => setManualContext(event.target.checked)} />{t('weaving.production.manual')}</label>}
            <WeavingProductionContext context={{ ...(resolved?.contract ? contextForRun(resolved) : selectedContract?.productionContext), fabricQualityId: form.fabricQualityId, ownershipType: form.ownershipType, ownerPartyId: form.ownerPartyId }} fabrics={meta.fabrics} parties={meta.parties}><span>{t('weaving.folding.loom')}: <strong>{resolved?.loom?.loomNumber || '-'}</strong></span><span>{t('weaving.production.beam')}: <strong>{resolved?.beam?.beamNo || '-'}</strong></span></WeavingProductionContext>

            {(selectedQuality || resolved?.beam) && (
              <div className="col-span-full grid gap-3 rounded-lg border border-teal-100 bg-teal-50/50 p-4 sm:grid-cols-4">
                <Detail label={t('weaving.folding.count')} value={[selectedQuality?.warpCount, selectedQuality?.weftCount].filter(Boolean).join(' / ')} />
                <Detail label={t('weaving.folding.construction')} value={selectedQuality?.construction} />
                <Detail label={t('weaving.folding.width')} value={selectedQuality?.width} />
                <Detail label={t('weaving.folding.contractSet')} value={[resolved?.contract?.contractNo, resolved?.beamSet?.setNo].filter(Boolean).join(' / ')} />
              </div>
            )}

            <label className="text-sm font-bold">
              {t('weaving.folding.meter')}
              <input ref={meterRef} required type="number" min="0.001" step="0.001" className={inputClass} value={form.meter} onChange={setValue('meter')} />
            </label>
            <div className="sm:col-span-2">
              <WeightKgLbsInput required kg={form.weightKg} lbs={form.weightLbs}
                onChange={({ kg, lbs }) => setForm((current) => ({ ...current, weightKg: kg, weightLbs: lbs }))} />
            </div>
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

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <label className="mr-auto flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.beamCompletionTriggered} disabled={saving || resolving || !resolved?.beam || (resolved?.historical && !editing)} onChange={(event) => setForm((current) => ({ ...current, beamCompletionTriggered: event.target.checked }))} />Last Than — Complete Beam</label>
            {editing && <button type="button" disabled={saving} className="h-10 rounded-md border px-4 font-bold" onClick={() => { setEditing(null); setForm(emptyForm()); setResolved(null); setCurrentRun(null); }}>Cancel Edit</button>}
            <button type="button" disabled={!canSave} onClick={() => save(true)} className="h-10 rounded-md border px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50">{t('weaving.folding.save')}</button>
            {!editing && <button type="button" disabled={!canSave} onClick={() => save(false)} className="inline-flex h-10 min-w-28 items-center justify-center rounded-md bg-teal-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <FaSpinner className="animate-spin" /> : t('weaving.folding.saveNew')}
            </button>}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-white">
          <div className="flex justify-between border-b p-4">
            <h2 className="font-black">{t('weaving.folding.recent')}</h2>
            <button type="button" onClick={() => window.open(`${process.env.REACT_APP_API_BASE_URL}/api/weaving/folding/parchi?date=${form.date}&token=${localStorage.getItem('token')}`, '_blank')} className="inline-flex items-center gap-2 text-sm font-bold text-teal-700"><FaPrint />{t('weaving.folding.print')}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs text-white"><tr><th className="p-3">Than</th><th className="p-3">Loom</th><th className="p-3">{t('weaving.production.contract')}</th><th className="p-3">{t('weaving.production.customer')}</th><th className="p-3">Quality</th><th className="p-3">Meter</th><th className="p-3">KG</th><th className="p-3">Grade</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y">
                {rows.map((row) => <tr key={row._id}>
                  <td className="p-3 font-bold">{row.thanNo}</td><td className="p-3">{row.loomId?.loomNumber}</td>
                  <td className="p-3">{row.contractId?.type === 'purchase' ? '-' : row.contractNoSnapshot || row.contractId?.contractNo || '-'}</td><td className="p-3">{row.contractId?.type === 'sales' ? row.contractId.partyName : ownerLabel(row)}</td>
                  <td className="p-3">{row.qualitySnapshot?.name}</td><td className="p-3">{row.meter}</td>
                  <td className="p-3">{row.weightKg}</td><td className="p-3 uppercase">{row.grade}</td>
                  <td className="p-3">{hasPermission('weaving.folding.edit') && !row.activeKacchiId && <button type="button" aria-label={`Edit ${row.thanNo}`} disabled={saving || resolving} onClick={() => edit(row)} className="mr-3 text-teal-700"><FaEdit /></button>}<button type="button" className="text-xs font-bold text-rose-600" onClick={async () => { if (await requestWeavingConfirmation({ message: t('weaving.folding.voidConfirm') })) { try { await voidFoldingEntry(row._id, 'Voided from Folding'); await load(); } catch (error) { showWeavingError(error, t('weaving.folding.saveFailed')); } } }}>Void</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
