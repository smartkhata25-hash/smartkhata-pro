import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createCounterparty,
  listCounterparties,
  mergeCounterparties,
  updateCounterparty,
} from '../../services/weavingCommercialService';
import { hasPermission } from '../../utils/permissionHelper';

export const COUNTERPARTY_TYPES = {
  customer: { label: 'Customer', role: 'customer', serviceTypes: [] },
  supplier: { label: 'Supplier', role: 'supplier', serviceTypes: [] },
  both: { label: 'Party', role: 'both', serviceTypes: [] },
  sizing: { label: 'Sizing Party', role: 'supplier', serviceTypes: ['sizing'] },
};

export const normalizeCounterpartyName = (value) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const counterpartyTypeOf = (record = {}) =>
  record.serviceTypes?.includes('sizing') ? 'sizing' : record.role || 'both';

export const createCounterpartyDraft = (type = 'customer', initialName = '') => ({
  ...COUNTERPARTY_TYPES[type],
  type,
  name: initialName,
  phone: '',
  email: '',
  address: '',
  openingBalance: '',
  balanceType: 'receivable',
  openingDate: '',
  notes: '',
  isActive: true,
});

export const buildCounterpartyUpgradePayload = (record, launchContext) => ({
  ...record,
  role:
    launchContext === 'sizing'
      ? record.role === 'customer' ? 'both' : record.role
      : 'both',
  serviceTypes: [
    ...new Set([
      ...(record.serviceTypes || []),
      ...(launchContext === 'sizing' ? ['sizing'] : []),
    ]),
  ],
  openingBalance: record.openingBalance,
  balanceType: record.balanceType,
  openingDate: record.openingDate || '',
});

const field =
  'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

export default function WeavingCounterpartyFormModal({
  initialName = '',
  initialType = 'customer',
  allowedTypes = ['customer', 'supplier', 'both', 'sizing'],
  initialRecord = null,
  launchContext = 'parties',
  focusField = '',
  onSaved,
  onClose,
  onError,
  canCreate = hasPermission('weaving.counterparties.create'),
  canEdit = hasPermission('weaving.counterparties.edit'),
  canMerge = hasPermission('weaving.counterparties.merge'),
}) {
  const safeTypes = allowedTypes.filter((type) => COUNTERPARTY_TYPES[type]);
  const safeInitialType = safeTypes.includes(initialType) ? initialType : safeTypes[0] || 'customer';
  const [form, setForm] = useState(() =>
    initialRecord
      ? { ...initialRecord, type: counterpartyTypeOf(initialRecord) }
      : createCounterpartyDraft(safeInitialType, initialName)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [duplicateMerge, setDuplicateMerge] = useState(null);
  const [contextConflict, setContextConflict] = useState(null);
  const savingRef = useRef(false);
  const nameInputRef = useRef(null);
  const openingInputRef = useRef(null);
  const primaryConflictRef = useRef(null);
  const contextual = launchContext !== 'parties';

  const reportError = (value) => {
    const text = value?.response?.data?.message || value?.message || value || 'Could not save party';
    setMessage(String(text));
    onError?.(String(text));
  };

  const loadDuplicate = async (currentForm) => {
    const activeParties = await listCounterparties({ status: 'active' });
    const wantedName = normalizeCounterpartyName(currentForm.name);
    return (activeParties || []).find(
      (row) =>
        (!currentForm._id || String(row._id) !== String(currentForm._id)) &&
        normalizeCounterpartyName(row.name) === wantedName
    );
  };

  useEffect(() => {
    if (focusField === 'opening') openingInputRef.current?.focus();
    else nameInputRef.current?.focus();
  }, [focusField]);

  useEffect(() => {
    if (!contextual || !initialName.trim()) return;
    let active = true;
    listCounterparties({ status: 'active' })
      .then((rows) => {
        const exact = (rows || []).find(
          (row) => normalizeCounterpartyName(row.name) === normalizeCounterpartyName(initialName)
        );
        if (active && exact) setContextConflict({ target: exact });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [contextual, initialName]);

  useEffect(() => {
    if (contextConflict) primaryConflictRef.current?.focus();
  }, [contextConflict]);

  const finish = async (saved) => {
    try {
      await onSaved?.(saved);
    } finally {
      onClose();
    }
  };

  const runOnce = async (work) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      reportError(error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const performNormalSave = async (currentForm) => {
    const saved = currentForm._id
      ? await updateCounterparty(currentForm._id, currentForm)
      : await createCounterparty(currentForm);
    await finish(saved);
  };

  const save = () => {
    if (form?._id ? !canEdit : !canCreate) {
      reportError('You do not have permission for this action');
      return;
    }
    if (!form?.name?.trim()) {
      reportError('Name is required');
      nameInputRef.current?.focus();
      return;
    }

    runOnce(async () => {
      const duplicate = await loadDuplicate(form);
      if (duplicate) {
        if (contextual) {
          setContextConflict({ target: duplicate });
          return;
        }
        if (!canMerge) {
          reportError(`"${duplicate.name}" already exists. Please use a different name.`);
          return;
        }
        setDuplicateMerge({ target: duplicate, pendingForm: { ...form }, mode: form._id ? 'edit' : 'create' });
        return;
      }
      await performNormalSave(form);
    });
  };

  const confirmDuplicateMerge = () => {
    if (!duplicateMerge || !canMerge) {
      reportError('You do not have permission to merge parties');
      return;
    }
    runOnce(async () => {
      const { target, pendingForm, mode } = duplicateMerge;
      const source = mode === 'edit'
        ? await updateCounterparty(pendingForm._id, pendingForm)
        : await createCounterparty(pendingForm);
      const result = await mergeCounterparties(source._id, target._id);
      await finish(result.target);
    });
  };

  const upgradeExisting = () => {
    const target = contextConflict?.target;
    if (!target || !canEdit) {
      reportError('You do not have permission to update counterparties');
      return;
    }
    runOnce(async () => {
      const updated = await updateCounterparty(
        target._id,
        buildCounterpartyUpgradePayload(target, launchContext)
      );
      await finish(updated);
    });
  };

  const keepSeparate = () => {
    const target = contextConflict?.target;
    setContextConflict(null);
    setMessage(`A record named ${target?.name || form.name} already exists. Please use a slightly different name for a separate ${COUNTERPARTY_TYPES[form.type]?.label || 'Party'}.`);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const conflictDescription = useMemo(() => {
    const target = contextConflict?.target;
    if (!target) return '';
    if (launchContext === 'sizing') {
      return `${target.name} will keep the same record and existing details. Sizing service will be added${target.role === 'customer' ? ' and its type will become Party' : ''}.`;
    }
    return `${target.name} will become a Party usable as both Customer and Supplier. Its existing ledger, opening balance and history will remain unchanged.`;
  }, [contextConflict, launchContext]);

  const conflictAction = launchContext === 'sizing' ? 'Enable Sizing' : 'Make Party';
  const conflictType = contextConflict?.target
    ? COUNTERPARTY_TYPES[counterpartyTypeOf(contextConflict.target)]?.label || 'Party'
    : 'Party';
  const visibleTypes = safeTypes.length ? safeTypes : Object.keys(COUNTERPARTY_TYPES);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="counterparty-form-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-md bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-md">
          <h2 id="counterparty-form-title" className="mb-4 text-lg font-bold">
            {form._id ? 'Edit' : 'Add'} {COUNTERPARTY_TYPES[form.type]?.label || 'Party'}
          </h2>

          {message && <p role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{message}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Party Type
              <select
                className={field}
                value={form.type}
                onChange={(event) => {
                  const type = event.target.value;
                  setForm({ ...form, type, role: COUNTERPARTY_TYPES[type].role, serviceTypes: COUNTERPARTY_TYPES[type].serviceTypes });
                }}
              >
                {visibleTypes.map((type) => <option key={type} value={type}>{COUNTERPARTY_TYPES[type].label}</option>)}
              </select>
            </label>

            {[
              ['name', 'Name *'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['address', 'Address'],
            ].map(([key, label]) => (
              <label key={key} className="text-sm font-medium">
                {label}
                <input
                  ref={key === 'name' ? nameInputRef : undefined}
                  className={field}
                  value={form[key] || ''}
                  onChange={(event) => { setForm({ ...form, [key]: event.target.value }); setMessage(''); }}
                />
              </label>
            ))}

            <label className="text-sm font-medium">
              Opening Balance
              <input ref={openingInputRef} type="number" min="0" className={field} value={form.openingBalance || ''} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Opening Date
              <input type="date" className={field} value={form.openingDate || ''} onChange={(event) => setForm({ ...form, openingDate: event.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Balance Type
              <select className={field} value={form.balanceType} onChange={(event) => setForm({ ...form, balanceType: event.target.value })}>
                <option value="receivable">Receivable</option>
                <option value="payable">Payable</option>
              </select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Notes
              <textarea className={`${field} h-20 py-2`} value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="h-10 rounded-md border px-4">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="h-10 rounded-md bg-teal-700 px-4 font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>

      {duplicateMerge && (
        <div className="fixed inset-0 z-[270] flex items-center justify-center bg-slate-950/45 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Same Name Already Exists</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600"><strong>{duplicateMerge.target.name}</strong> پہلے سے موجود ہے۔</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">اگر یہ وہی Customer / Supplier / Party ہے تو آپ دونوں records کو Merge کر سکتے ہیں۔</p>
            <p className="mt-2 text-xs text-slate-500">اگر یہ الگ record ہے تو Cancel کریں اور نام میں مناسب تبدیلی کر دیں۔</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setDuplicateMerge(null)} className="h-10 rounded-md border px-4 text-sm font-medium">Cancel</button>
              <button type="button" disabled={saving} onClick={confirmDuplicateMerge} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Merging...' : 'Merge'}</button>
            </div>
          </div>
        </div>
      )}

      {contextConflict && (
        <div className="fixed inset-0 z-[275] flex items-center justify-center bg-slate-950/55 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="counterparty-conflict-title" className="w-full max-w-md rounded-md bg-white p-5 shadow-2xl">
            <h2 id="counterparty-conflict-title" className="text-lg font-bold text-slate-900">{contextConflict.target.name} already exists as {conflictType}.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{conflictDescription}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {canCreate && <button type="button" disabled={saving} onClick={keepSeparate} className="h-10 rounded-md border px-4 text-sm font-medium">Keep Separate</button>}
              {canEdit && <button ref={primaryConflictRef} type="button" disabled={saving} onClick={upgradeExisting} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Updating...' : conflictAction}</button>}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
