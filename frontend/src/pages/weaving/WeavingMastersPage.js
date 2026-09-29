import WeavingProductionContext, { contextForRun } from '../../components/weaving/WeavingProductionContext';
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { FaEdit, FaIndustry, FaPlus, FaSave, FaSearch, FaSpinner, FaTimes } from 'react-icons/fa';

import { t as translate } from '../../i18n/i18n';

import WeightKgLbsInput, { KG_TO_LBS } from '../../components/weaving/WeightKgLbsInput';

import WeavingFormActions from '../../components/weaving/WeavingFormActions';
import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

import {
  bulkCreateWeavingLooms,
  createWeavingGodown,
  createWeavingLoom,
  createWeavingMaster,
  listWeavingGodowns,
  listWeavingLooms,
  listWeavingMaster,
  listWeavingMasterOptions,
  quickAddWeavingMasterOption,
  updateWeavingLoom,
  updateWeavingMaster,
  updateWeavingYarnPackaging,
} from '../../services/weavingOperationsService';
import { hasPermission } from '../../utils/permissionHelper';

const emptyOpening = () => ({
  godownId: '',
  kg: '',
  lbs: '',
  quantity: '',
  sourceEntryUnit: 'KG',
  packageType: '',
  packageQty: '',
  smallCones: '',
  largeCones: '',
});

const initial = {
  yarn: {
    name: '',
    count: '',
    quality: '',
    millBrand: '',
    lotReference: '',
    defaultPackageType: 'bag',
    packagingProfiles: [{ packageType: 'bag', packageWeight: 100, smallConesPerPackage: 40, largeConesPerPackage: 24 }],
    packageWeight: 100,
    largeConesPerPackage: 24,
    smallConesPerPackage: 40,
    openingRate: '',
    notes: '',
    isActive: true,
    openingStock: [emptyOpening()],
  },

  fabric: {
    name: '',
    code: '',
    construction: '',
    width: '',
    weave: '',
    warpCount: '',
    weftCount: '',
    brand: '',
    cadReference: '',
    primaryUnit: 'Meter',
    openingRate: '',
    notes: '',
    isActive: true,
    openingStock: [emptyOpening()],
  },

  loom: {
    loomNumber: '',
    brand: '',
    model: '',
    loomType: '',
    reedSpace: '',
    notes: '',
    isActive: true,
  },
};

const OPTION_TYPES_BY_FIELD = Object.freeze({
  millBrand: 'yarn_mill_brand',
  quality: 'yarn_quality',
  weave: 'fabric_weave',
  brand: 'loom_brand',
  model: 'loom_model',
  loomType: 'loom_type',
});

const inputClass = `
  mt-1
  h-9
  w-full
  rounded-md
  border
  border-slate-300
  bg-white
  px-3
  text-sm
  text-slate-800
  outline-none
  transition-all
  duration-150
  placeholder:text-slate-400
  hover:border-teal-400
  hover:bg-teal-50/20
  focus:border-teal-500
  focus:bg-white
  focus:ring-2
  focus:ring-teal-100
  disabled:cursor-not-allowed
  disabled:bg-slate-100
  disabled:text-slate-500
`;

const Field = ({ label, children, required, className = '' }) => (
  <label className={`block min-w-0 text-xs font-semibold text-slate-600 ${className}`}>
    <span className="block min-h-[18px] leading-[18px]">
      {label}

      {required && <span className="ml-0.5 text-rose-500">*</span>}
    </span>

    {children}
  </label>
);

const TextInput = forwardRef(({ label, required, className = '', ...props }, ref) => (
  <Field label={label} required={required} className={className}>
    <input ref={ref} className={inputClass} required={required} {...props} />
  </Field>
));

TextInput.displayName = 'TextInput';

const packageDisplayName = (value) => String(value || '').trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
const packageProfilesFor = (form) => {
  const profiles = Array.isArray(form.packagingProfiles) && form.packagingProfiles.length ? form.packagingProfiles : [];
  return profiles.length ? profiles : [{ packageType: form.defaultPackageType || 'bag', packageWeight: form.packageWeight ?? 100, smallConesPerPackage: form.smallConesPerPackage ?? 40, largeConesPerPackage: form.largeConesPerPackage ?? 24 }];
};

const OpeningStock = ({ form, setForm, godowns, t, canAddGodown, onAddGodown }) => {
  const unit = form.primaryUnit || 'KG';
  const isYarn = Object.prototype.hasOwnProperty.call(form, 'defaultPackageType');
  const rows = form.openingStock?.length ? form.openingStock : [emptyOpening()];
  const packageType = String(form.defaultPackageType || 'bag').trim();
  const packageLabel = packageType.toLowerCase() === 'bag' ? 'Bags' : packageType.toLowerCase() === 'carton' ? 'Cartons' : `Package Qty (${packageType || 'Package'})`;
  const defaultProfile = packageProfilesFor(form).find((profile) => profile.packageType === packageType.toLowerCase()) || packageProfilesFor(form)[0];
  const packageWeight = Number(defaultProfile.packageWeight ?? 100);
  const smallPerPackage = Number(defaultProfile.smallConesPerPackage ?? 40);
  const largePerPackage = Number(defaultProfile.largeConesPerPackage ?? 24);
  const calculateWeight = useCallback((row) => {
    const packages = Number(row.packageQty || 0);
    const small = Number(row.smallCones || 0);
    const large = Number(row.largeCones || 0);
    const total = (packages + (smallPerPackage ? small / smallPerPackage : 0) + (largePerPackage ? large / largePerPackage : 0)) * packageWeight;
    const lbs = total;
    const kg = lbs / KG_TO_LBS;
    return { kg: String(Math.round(kg * 1000) / 1000), lbs: String(Math.round(lbs * 1000) / 1000), sourceEntryUnit: 'LBS', packageType: packageType.toLowerCase() };
  }, [packageType, packageWeight, smallPerPackage, largePerPackage]);
  useEffect(() => {
    if (!isYarn) return;
    setForm((current) => {
      const openingStock = (current.openingStock || []).map((row) => ({ ...row, ...calculateWeight(row) }));
      const changed = openingStock.some((row, index) => row.kg !== current.openingStock[index]?.kg || row.lbs !== current.openingStock[index]?.lbs || row.packageType !== current.openingStock[index]?.packageType);
      return changed ? { ...current, openingStock } : current;
    });
  }, [isYarn, calculateWeight, setForm]);
  const update = async (index, patch) => {
    const row = { ...rows[index], ...patch };
    let extraPackages = 0;
    let message = '';
    if (isYarn && smallPerPackage && Number(row.smallCones || 0) >= smallPerPackage) {
      extraPackages += Math.floor(Number(row.smallCones) / smallPerPackage);
      message = `${smallPerPackage} Small Cones make 1 full ${packageType}.`;
    }
    if (isYarn && largePerPackage && Number(row.largeCones || 0) >= largePerPackage) {
      extraPackages += Math.floor(Number(row.largeCones) / largePerPackage);
      message = `${largePerPackage} Large Cones make 1 full ${packageType}.`;
    }
    if (extraPackages && !(await requestWeavingConfirmation({ message: `${message}\nConvert to full ${packageType}s?`, confirmLabel: 'Convert' }))) return;
    if (extraPackages) {
      if (smallPerPackage) row.smallCones = String(Number(row.smallCones || 0) % smallPerPackage);
      if (largePerPackage) row.largeCones = String(Number(row.largeCones || 0) % largePerPackage);
      row.packageQty = String(Number(row.packageQty || 0) + extraPackages);
    }
    setForm((current) => ({ ...current, openingStock: current.openingStock.map((item, i) => i === index ? { ...item, ...row, ...(isYarn ? calculateWeight(row) : {}) } : item) }));
  };
  const addGodown = () => setForm((current) => ({ ...current, openingStock: [...(current.openingStock || []), emptyOpening()] }));
  const removeGodown = (index) => setForm((current) => ({ ...current, openingStock: current.openingStock.filter((_, i) => i !== index) }));
  return <div className="col-span-full overflow-visible rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 p-3 shadow-sm"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">{t('weaving.operations.openingStock')}</h3><button type="button" onClick={addGodown} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"><FaPlus className="text-xs" />{t('weaving.operations.addGodown')}</button></div><div className="space-y-2">{rows.map((row, index) => <div key={index} className="rounded-md border border-slate-200 bg-white/90 p-2.5 transition hover:border-teal-200 hover:shadow-sm"><div className={`grid items-end gap-2 ${isYarn ? 'md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr_auto]' : unit === 'KG' ? 'md:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_auto]' : 'md:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_auto]'}`}><Field label={t('weaving.operations.godown')}><div className="flex items-center gap-1.5"><select className={inputClass} value={row.godownId} onChange={(event) => update(index, { godownId: event.target.value })}><option value="">{t('weaving.operations.selectGodown')}</option>{godowns.filter((godown) => godown.isActive).map((godown) => <option key={godown._id} value={godown._id}>{godown.name}</option>)}</select>{canAddGodown && <button type="button" title={t('weaving.operations.newGodown')} aria-label={t('weaving.operations.newGodown')} onClick={() => onAddGodown(index)} className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-teal-200 text-teal-700 transition hover:bg-teal-50"><FaPlus className="text-[10px]" /></button>}</div></Field>{isYarn ? <><TextInput label={packageLabel} type="number" min="0" value={row.packageQty || ''} onChange={(event) => update(index, { packageQty: event.target.value })} /><TextInput label="Small Cones" type="number" min="0" value={row.smallCones || ''} onChange={(event) => update(index, { smallCones: event.target.value })} /><TextInput label="Large Cones" type="number" min="0" value={row.largeCones || ''} onChange={(event) => update(index, { largeCones: event.target.value })} /><WeightKgLbsInput kg={row.kg} lbs={row.lbs} disabled /></> : unit === 'KG' ? <WeightKgLbsInput kg={row.kg} lbs={row.lbs} onChange={(value) => update(index, value)} /> : <TextInput label={`${t('weaving.operations.quantity')} (${unit})`} type="number" min="0" step="0.001" value={row.quantity} onChange={(event) => update(index, { quantity: event.target.value, sourceEntryUnit: unit })} />}{rows.length > 1 && <button type="button" title={t('weaving.operations.remove')} aria-label={t('weaving.operations.remove')} onClick={() => removeGodown(index)} className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-rose-600 transition hover:border-rose-100 hover:bg-rose-50"><FaTimes /></button>}</div></div>)}</div></div>;
};

const WeavingMastersPage = ({ initialTab = 'yarn', embedded = false, listMode = false, onNew }) => {
  const navigate = useNavigate();
  const t = useCallback(
    (key, values = {}) =>
      Object.entries(values).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, value),
        translate(key)
      ),
    []
  );

  const [tab, setTab] = useState(initialTab);

  const [rows, setRows] = useState([]);

  const [godowns, setGodowns] = useState([]);

  const [yarnOptions, setYarnOptions] = useState([]);

  const [masterOptions, setMasterOptions] = useState({});

  const [form, setForm] = useState(initial.yarn);

  const [editingId, setEditingId] = useState('');
  const [selectedYarnId, setSelectedYarnId] = useState('');

  const [formOpen, setFormOpen] = useState(true);

  const [search, setSearch] = useState('');
  const [showMachineDetails, setShowMachineDetails] = useState(false);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState(null);
  useWeavingFeedback(notice, setNotice);

  const [bulk, setBulk] = useState(false);

  const [godownQuickAdd, setGodownQuickAdd] = useState(null);

  const [yarnQuickAdd, setYarnQuickAdd] = useState(null);

  const [quickSaving, setQuickSaving] = useState(false);

  const firstInput = useRef(null);

  const quickSavingRef = useRef(false);

  const canAddGodown = hasPermission('weaving.settings.manage');

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const data =
        tab === 'loom'
          ? await listWeavingLooms()
          : await listWeavingMaster(tab, {
              search,
            });

      const term = search.trim().toLocaleLowerCase('en');
      setRows(tab === 'loom' && term
        ? data.filter((row) => [row.loomNumber, row.name, row.brand, row.model, row.loomType, row.currentRun?.contract?.contractNo, row.currentRun?.contract?.partyName, row.currentRun?.ownerParty?.name, row.currentRun?.quality?.name, row.currentRun?.beam?.beamNo]
          .some((value) => String(value || '').toLocaleLowerCase('en').includes(term)))
        : data);
    } catch (error) {
      setNotice({
        type: 'error',

        text: error.response?.data?.message || t('weaving.operations.loadFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [search, t, tab]);

  useEffect(() => {
    listWeavingGodowns()
      .then(setGodowns)
      .catch(() => setGodowns([]));
  }, []);

  const loadYarnOptions = useCallback(async () => {
    try {
      const data = await listWeavingMaster('yarn');
      setYarnOptions(data);
      return data;
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.message || t('weaving.operations.loadFailed'),
      });
      return [];
    }
  }, [t]);

  useEffect(() => {
    if (tab === 'yarn') loadYarnOptions();
  }, [loadYarnOptions, tab]);

  useEffect(() => {
    listWeavingMasterOptions()
      .then(setMasterOptions)
      .catch((error) =>
        setNotice({
          type: 'error',
          text: error.response?.data?.message || t('weaving.operations.loadFailed'),
        })
      );
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(load, 250);

    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setForm(initial[tab]);

    setEditingId('');
    setSelectedYarnId('');
    setBulk(false);
    setFormOpen(true);
    setNotice(null);
  }, [tab]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const reset = (focus = false) => {
    setForm(initial[tab]);

    setEditingId('');
    setSelectedYarnId('');
    setBulk(false);

    if (focus) {
      setTimeout(() => firstInput.current?.focus(), 0);
    }
  };

  const save = async (close) => {
    setSaving(true);
    setNotice(null);

    try {
      if (tab === 'loom' && bulk && !editingId) {
        await bulkCreateWeavingLooms(form);
      } else if (tab === 'loom') {
        if (editingId) {
          await updateWeavingLoom(editingId, form);
        } else {
          await createWeavingLoom(form);
        }
      } else if (editingId) {
        await updateWeavingMaster(tab, editingId, form);
      } else {
        await createWeavingMaster(tab, form);
      }

      if (tab !== 'loom') {
        setNotice({
          type: 'success',
          text: t('weaving.operations.saved'),
        });
      } else {
      }

      await load();

      reset(!close);
      setFormOpen(!close);
    } catch (error) {
      setNotice({
        type: 'error',

        text: error.response?.data?.message || t('weaving.operations.saveFailed'),
      });
    } finally {
      setSaving(false);
    }
  };

  const edit = (row) => {
    const openingStock = (row.openingStock?.length ? row.openingStock : [emptyOpening()]).map(
      (stock) => ({
        ...stock,

        godownId: stock.godownId?._id || stock.godownId || '',

        kg: stock.unit === 'KG' ? stock.quantity : '',

        lbs: stock.unit === 'KG' ? Math.round(stock.quantity * KG_TO_LBS * 1000) / 1000 : '',
      })
    );

    setForm({
      ...initial[tab],
      ...row,
      openingStock,
    });

    setEditingId(row._id);
    setSelectedYarnId(row._id);

    setBulk(false);
    setFormOpen(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const tabs = [
    ['yarn', t('weaving.operations.yarnMaster')],

    ['fabric', t('weaving.operations.fabricQuality')],

    ['loom', t('weaving.operations.loomMaster')],
  ];

  const title = tabs.find(([key]) => key === tab)?.[1];

  const options = (field) =>
    (masterOptions[OPTION_TYPES_BY_FIELD[field]] || []).map((option) => ({
      _id: option.value,
      name: option.value,
    }));

  const quickAddOption = async (field, name) => {
    try {
      const saved = await quickAddWeavingMasterOption({
        type: OPTION_TYPES_BY_FIELD[field],
        value: name,
      });

      setMasterOptions((current) => {
        const type = OPTION_TYPES_BY_FIELD[field];
        const existing = current[type] || [];
        const next = existing.some(
          (option) => option.normalizedValue === saved.normalizedValue
        )
          ? existing.map((option) =>
              option.normalizedValue === saved.normalizedValue ? saved : option
            )
          : [...existing, saved].sort((left, right) =>
              left.value.localeCompare(right.value, undefined, { sensitivity: 'base' })
            );

        return { ...current, [type]: next };
      });

      setForm((current) => ({ ...current, [field]: saved.value }));
      return saved;
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.message || t('weaving.operations.saveFailed'),
      });
      throw error;
    }
  };

  const creative = (field) => ({
    value: form[field] || '',

    onChange: (_, item) =>
      setForm((current) => ({
        ...current,
        [field]: item?.name || '',
      })),

    onQuickAdd: (name) => quickAddOption(field, name),
  });

  const openGodownQuickAdd = (rowIndex) => {
    setGodownQuickAdd({ rowIndex, name: '', note: '' });
  };

  const saveQuickGodown = async () => {
    if (quickSavingRef.current || !godownQuickAdd?.name.trim()) return;

    quickSavingRef.current = true;
    setQuickSaving(true);
    setNotice(null);

    try {
      const saved = await createWeavingGodown({
        name: godownQuickAdd.name.trim(),
        note: godownQuickAdd.note.trim(),
        isActive: true,
      });
      const refreshed = await listWeavingGodowns();
      setGodowns(refreshed);
      setForm((current) => ({
        ...current,
        openingStock: current.openingStock.map((stock, index) =>
          index === godownQuickAdd.rowIndex
            ? { ...stock, godownId: saved._id }
            : stock
        ),
      }));
      setGodownQuickAdd(null);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.message || t('weaving.operations.saveFailed'),
      });
    } finally {
      quickSavingRef.current = false;
      setQuickSaving(false);
    }
  };

  const saveQuickYarn = async () => {
    if (
      quickSavingRef.current ||
      !yarnQuickAdd?.name.trim() ||
      !yarnQuickAdd?.count.trim()
    ) {
      return;
    }

    quickSavingRef.current = true;
    setQuickSaving(true);
    setNotice(null);

    try {
      const saved = await createWeavingMaster('yarn', {
        name: yarnQuickAdd.name.trim(),
        count: yarnQuickAdd.count.trim(),
        isActive: true,
      });
      const refreshed = await loadYarnOptions();
      setYarnOptions((current) =>
        refreshed.some((item) => String(item._id) === String(saved._id))
          ? refreshed
          : [...current, saved]
      );
      setForm((current) => ({
        ...current,
        name: saved.name,
        count: saved.count,
      }));
      setSelectedYarnId(saved._id);
      setEditingId('');
      setYarnQuickAdd(null);
      await load();
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.message || t('weaving.operations.saveFailed'),
      });
    } finally {
      quickSavingRef.current = false;
      setQuickSaving(false);
    }
  };

  const activePackagingProfile = packageProfilesFor(form).find((profile) => profile.packageType === (form.defaultPackageType || 'bag').toLowerCase()) || packageProfilesFor(form)[0];
  const updateActivePackaging = (patch) => setForm((current) => {
    const packageType = (current.defaultPackageType || 'bag').toLowerCase();
    const packagingProfiles = packageProfilesFor(current).map((profile) => profile.packageType === packageType ? { ...profile, ...patch } : profile);
    const active = packagingProfiles.find((profile) => profile.packageType === packageType) || packagingProfiles[0];
    return { ...current, defaultPackageType: active.packageType, packagingProfiles, packageWeight: active.packageWeight, smallConesPerPackage: active.smallConesPerPackage, largeConesPerPackage: active.largeConesPerPackage, packageWeightUnit: 'LBS' };
  });
  const selectPackaging = (value) => {
    if (value === '__add__') {
      const name = window.prompt('Packaging name');
      const packageType = String(name || '').trim().toLowerCase();
      if (!packageType) return;
      setForm((current) => {
        const packagingProfiles = packageProfilesFor(current);
        const existing = packagingProfiles.find((profile) => profile.packageType === packageType);
        const active = existing || { packageType, packageWeight: 100, smallConesPerPackage: 40, largeConesPerPackage: 24 };
        return { ...current, defaultPackageType: active.packageType, packagingProfiles: existing ? packagingProfiles : [...packagingProfiles, active], packageWeight: active.packageWeight, smallConesPerPackage: active.smallConesPerPackage, largeConesPerPackage: active.largeConesPerPackage, packageWeightUnit: 'LBS' };
      });
      return;
    }
    setForm((current) => {
      const packagingProfiles = packageProfilesFor(current);
      const existing = packagingProfiles.find((profile) => profile.packageType === value);
      const active = existing || { packageType: value, packageWeight: 100, smallConesPerPackage: 40, largeConesPerPackage: 24 };
      return { ...current, defaultPackageType: active.packageType, packagingProfiles: existing ? packagingProfiles : [...packagingProfiles, active], packageWeight: active.packageWeight, smallConesPerPackage: active.smallConesPerPackage, largeConesPerPackage: active.largeConesPerPackage, packageWeightUnit: 'LBS' };
    });
  };
  const savePackaging = async () => {
    if (!editingId) {
      setNotice({ type: 'success', text: 'Package profile will be saved with this Yarn.' });
      return;
    }
    setSaving(true);
    try {
      const saved = await updateWeavingYarnPackaging(editingId, { defaultPackageType: form.defaultPackageType, packagingProfiles: packageProfilesFor(form) });
      setForm((current) => ({ ...current, ...saved }));
      setNotice({ type: 'success', text: 'Package profile saved.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || t('weaving.operations.saveFailed') });
    } finally { setSaving(false); }
  };

  return (
    <div
      className={
        embedded
          ? ''
          : 'min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/50 px-3 pb-4 pt-1 sm:px-4'
      }
    >
      <div className="mx-auto max-w-[1600px] space-y-2">
        {/* STANDALONE HEADER */}
        {!embedded && (
          <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-gradient-to-r from-white via-teal-50/50 to-emerald-50/40 px-4 py-3 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {t('weaving.operations.masters')}
              </h1>

              <p className="mt-0.5 text-xs text-slate-500">
                {t('weaving.operations.mastersSubtitle')}
              </p>
            </div>

            {!formOpen && (
              <button
                type="button"
                onClick={() => {
                  setFormOpen(true);

                  setTimeout(() => firstInput.current?.focus(), 0);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
              >
                <FaPlus />

                {t('weaving.operations.newRecord')}
              </button>
            )}
          </header>
        )}

        {/* STANDALONE TABS */}
        {!embedded && (
          <div className="flex overflow-x-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`min-w-max flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-all ${
                  tab === key
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-teal-50 hover:text-teal-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* FORM */}
        {formOpen && !listMode && (
          <section className="overflow-visible rounded-md border border-slate-200 bg-white shadow-sm">
            {/* FORM HEADER */}
            <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-teal-50/60 px-4 py-2">
              <h2 className="font-bold text-slate-900">
                {editingId
                  ? t('weaving.operations.editRecord', {
                      name: title,
                    })
                  : t('weaving.operations.newRecordNamed', {
                      name: title,
                    })}
              </h2>

              {tab === 'loom' && !editingId && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={bulk}
                    onChange={(event) => {
                      setBulk(event.target.checked);

                      setForm(initial.loom);
                    }}
                    className="h-4 w-4 accent-teal-600"
                  />

                  {t('weaving.operations.bulkCreate')}
                </label>
              )}
            </div>

            {/* FORM BODY */}
            <form
              onSubmit={(event) => event.preventDefault()}
              className="grid gap-x-3 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {/* YARN */}
              {tab === 'yarn' && (
                <>
                  <SearchableCreatableSelect
                    label={`${t('weaving.operations.yarnName')} / ${t('weaving.operations.count')}`}
                    placeholder="Search yarn name or count"
                    required
                    options={yarnOptions}
                    value={selectedYarnId}
                    getLabel={(item) => [item.name, item.count].filter(Boolean).join(' / ')}
                    onChange={(_, item) => {
                      if (item) {
                        edit(item);
                      } else {
                        setEditingId('');
                        setSelectedYarnId('');
                      }
                    }}
                    onQuickAdd={(name) => {
                      setYarnQuickAdd({ name, count: '' });
                      return { name };
                    }}
                  />

                  <SearchableCreatableSelect
                    label={t('weaving.operations.millBrand')}
                    placeholder="Search or add brand / mill"
                    options={options('millBrand')}
                    {...creative('millBrand')}
                  />

                  <SearchableCreatableSelect
                    label={t('weaving.operations.quality')}
                    placeholder="Select or add quality"
                    options={options('quality')}
                    {...creative('quality')}
                  />

                  <TextInput
                    label={t('weaving.operations.count')}
                    placeholder="e.g. 30/1"
                    required
                    value={form.count}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        count: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.operations.lotReference')}
                    placeholder="e.g. LOT-105"
                    value={form.lotReference}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        lotReference: event.target.value,
                      })
                    }
                  />

                  <OpeningStock
                    form={form}
                    setForm={setForm}
                    godowns={godowns}
                    t={t}
                    canAddGodown={canAddGodown}
                    onAddGodown={openGodownQuickAdd}
                  />
                </>
              )}

              {/* YARN PACKAGE SETTINGS */}
              {tab === 'yarn' && (
                <div className="col-span-full grid gap-3 rounded-lg border border-teal-100 bg-gradient-to-r from-teal-50/60 via-white to-emerald-50/50 p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                  <Field label="Package Type">
                    <select className={inputClass} value={activePackagingProfile.packageType} onChange={(event) => selectPackaging(event.target.value)}>
                      {packageProfilesFor(form).map((profile) => <option key={profile.packageType} value={profile.packageType}>{packageDisplayName(profile.packageType)}</option>)}
                      {!packageProfilesFor(form).some((profile) => profile.packageType === 'bag') && <option value="bag">Bag</option>}
                      {!packageProfilesFor(form).some((profile) => profile.packageType === 'carton') && <option value="carton">Carton</option>}
                      <option value="__add__">Add New Packaging</option>
                    </select>
                  </Field>
                  <Field label="Package Weight"><div className="mt-1 flex h-9 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100"><input className="min-w-0 flex-1 px-3 text-sm outline-none" type="number" min="0" value={activePackagingProfile.packageWeight ?? 100} onChange={(event) => updateActivePackaging({ packageWeight: event.target.value })} /><span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">LBS</span></div></Field>
                  <TextInput label="Small Cones / Package" type="number" min="0" value={activePackagingProfile.smallConesPerPackage ?? 40} onChange={(event) => updateActivePackaging({ smallConesPerPackage: event.target.value })} />
                  <TextInput label="Large Cones / Package" type="number" min="0" value={activePackagingProfile.largeConesPerPackage ?? 24} onChange={(event) => updateActivePackaging({ largeConesPerPackage: event.target.value })} />
                  <button type="button" title="Save package profile" aria-label="Save package profile" disabled={saving} onClick={savePackaging} className="mt-6 inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-600 text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"><FaSave /></button>
                </div>
              )}

              {/* FABRIC */}
              {tab === 'fabric' && (
                <>
                  <TextInput
                    ref={firstInput}
                    label={t('weaving.operations.qualityName')}
                    placeholder="e.g. Grey Cloth"
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        name: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.operations.qualityCode')}
                    placeholder="e.g. GC-01"
                    value={form.code}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        code: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.operations.construction')}
                    placeholder="e.g. 76 x 68"
                    value={form.construction}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        construction: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.operations.width')}
                    placeholder="e.g. 63 in"
                    value={form.width}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        width: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.folding.warpCount')}
                    value={form.warpCount}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        warpCount: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.folding.weftCount')}
                    value={form.weftCount}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        weftCount: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.folding.brand')}
                    value={form.brand}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        brand: event.target.value,
                      })
                    }
                  />

                  <TextInput
                    label={t('weaving.folding.cadReference')}
                    value={form.cadReference}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        cadReference: event.target.value,
                      })
                    }
                  />

                  <SearchableCreatableSelect
                    label={t('weaving.operations.weave')}
                    placeholder="Select or add weave"
                    options={options('weave')}
                    {...creative('weave')}
                  />

                  <Field label={t('weaving.operations.primaryUnit')} required>
                    <select
                      className={inputClass}
                      value={form.primaryUnit}
                      onChange={(event) =>
                        setForm({
                          ...form,

                          primaryUnit: event.target.value,

                          openingStock: [emptyOpening()],
                        })
                      }
                    >
                      <option>Meter</option>

                      <option>Yard</option>

                      <option>KG</option>
                    </select>
                  </Field>

                  <OpeningStock form={form} setForm={setForm} godowns={godowns} t={t} />
                </>
              )}

              {/* LOOM */}
              {tab === 'loom' && editingId && <WeavingProductionContext context={contextForRun(form.currentRun)}><span>{t('weaving.production.beam')}: <strong>{form.currentRun?.beam?.beamNo || '-'}</strong></span><span>{t(form.currentRun ? 'weaving.beams.status.loaded' : 'weaving.production.free')}</span></WeavingProductionContext>}
              {tab === 'loom' && (
                <>
                  {bulk ? (
                    <>
                      <TextInput
                        ref={firstInput}
                        label={t('weaving.operations.startingNumber')}
                        placeholder="e.g. 1"
                        required
                        type="number"
                        min="1"
                        value={form.startingNumber || ''}
                        onChange={(event) =>
                          setForm({
                            ...form,

                            startingNumber: event.target.value,
                          })
                        }
                      />

                      <TextInput
                        label={t('weaving.operations.numberOfLooms')}
                        placeholder="e.g. 10"
                        required
                        type="number"
                        min="1"
                        max="200"
                        value={form.count || ''}
                        onChange={(event) =>
                          setForm({
                            ...form,

                            count: event.target.value,
                          })
                        }
                      />
                    </>
                  ) : (
                    <TextInput
                      ref={firstInput}
                      label={t('weaving.operations.loomNo')}
                      placeholder="e.g. 15"
                      required
                      value={form.loomNumber}
                      onChange={(event) =>
                        setForm({
                          ...form,

                          loomNumber: event.target.value,
                        })
                      }
                    />
                  )}

                  <SearchableCreatableSelect
                    label={t('weaving.operations.brand')}
                    placeholder="Select or add brand"
                    options={options('brand')}
                    {...creative('brand')}
                  />

                  <SearchableCreatableSelect
                    label={t('weaving.operations.model')}
                    placeholder="Select or add model"
                    options={options('model')}
                    {...creative('model')}
                  />

                  <SearchableCreatableSelect
                    label={t('weaving.operations.loomType')}
                    placeholder="Select or add Loom Type"
                    options={options('loomType')}
                    {...creative('loomType')}
                  />

                  <TextInput
                    label={t('weaving.operations.reedSpace')}
                    placeholder="e.g. 153 in"
                    value={form.reedSpace}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        reedSpace: event.target.value,
                      })
                    }
                  />
                </>
              )}

              {/* OPENING RATE */}
              {tab !== 'loom' && (
                <TextInput
                  label={t('weaving.operations.openingRate')}
                  placeholder={tab === 'yarn' ? 'e.g. 620 per KG' : 'e.g. 145 per meter'}
                  type="number"
                  min="0"
                  value={form.openingRate}
                  onChange={(event) =>
                    setForm({
                      ...form,

                      openingRate: event.target.value,
                    })
                  }
                />
              )}

              {/* NOTES */}
              <Field label={t('weaving.operations.notes')}>
                <textarea
                  className={`${inputClass} h-16 resize-none py-2`}
                  placeholder="Optional note"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({
                      ...form,

                      notes: event.target.value,
                    })
                  }
                />
              </Field>

              {/* ACTIVE */}
              <label className="flex min-h-[58px] items-end">
                <span className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm({
                        ...form,

                        isActive: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-teal-600"
                  />

                  {t('weaving.operations.active')}
                </span>
              </label>

              {/* ACTIONS */}
              <div className="col-span-full border-t border-slate-100 pt-2">
                <WeavingFormActions
                  editing={!!editingId}
                  saving={saving}
                  onSaveClose={() => save(true)}
                  onSaveNew={() => save(false)}
                  onClear={() => reset(true)}
                  onCancel={() => {
                    reset();
                    setFormOpen(false);
                  }}
                />
              </div>
            </form>
          </section>
        )}

        {tab === 'loom' && <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={showMachineDetails} onChange={(event) => setShowMachineDetails(event.target.checked)} />
          {t('weaving.production.showMachineDetails')}
        </label>}
        {/* LIST / TABLE */}
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
            <h2 className="font-bold text-slate-900">{title}</h2>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              {listMode && (
                <button type="button" onClick={onNew} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-teal-600 px-3 text-sm font-semibold text-white hover:bg-teal-700">
                  <FaPlus /> {t('weaving.operations.newRecord')}
                </button>
              )}
              <div className="relative min-w-0 flex-1 sm:w-72">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('weaving.operations.search')}
                className={`${inputClass} mt-0 pl-8`}
              />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-100 to-teal-50 text-left text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">{t(tab === 'loom' ? 'weaving.folding.loom' : 'weaving.operations.name')}</th>
                  {tab === 'loom' && <>
                    <th className="px-4 py-2.5">{t('weaving.production.contract')}</th>
                    <th className="px-4 py-2.5">{t('weaving.production.customer')}</th>
                    <th className="px-4 py-2.5">{t('weaving.folding.quality')}</th>
                    <th className="px-4 py-2.5">{t('weaving.production.beam')}</th>
                  </>}

                  {(tab !== 'loom' || showMachineDetails) && <th className="px-4 py-2.5">
                    {tab === 'yarn'
                      ? t('weaving.operations.typeBrand')
                      : tab === 'fabric'
                        ? t('weaving.operations.unitConstruction')
                        : t('weaving.production.machineDetails')}
                  </th>}

                  <th className="px-4 py-2.5">{t('weaving.operations.status')}</th>

                  <th className="px-4 py-2.5 text-right">{t('weaving.operations.actions')}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={tab === 'loom' ? (showMachineDetails ? 8 : 7) : 4} className="p-10 text-center">
                      <FaSpinner className="mx-auto animate-spin text-xl text-teal-600" />
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((row) => (
                    <tr
                      key={row._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(tab === 'loom'
                        ? `/weaving/looms?loomId=${row._id}`
                        : tab === 'yarn'
                          ? `/weaving/yarn-stock?yarnId=${row._id}`
                          : `/weaving/fabric-stock?fabricQualityId=${row._id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(tab === 'loom'
                            ? `/weaving/looms?loomId=${row._id}`
                            : tab === 'yarn'
                              ? `/weaving/yarn-stock?yarnId=${row._id}`
                              : `/weaving/fabric-stock?fabricQualityId=${row._id}`);
                        }
                      }}
                      className="cursor-pointer transition hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-500"
                    >
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{tab === 'loom' ? row.loomNumber || row.name : row.name}</td>
                      {tab === 'loom' && <>
                        <td className="px-4 py-2.5">{row.currentRun?.contract?.contractNo || '-'}
                          {row.currentRun?.contract && <div className="text-xs text-slate-500">{t(row.currentRun.contract.contractType === 'conversion' ? 'weaving.sales.conversion' : 'weaving.sales.fabricSale')}</div>}
                        </td>
                        <td className="px-4 py-2.5">{row.currentRun?.contract?.partyName || row.currentRun?.ownerParty?.name || '-'}
                          {row.currentRun?.ownershipType && <div className="text-xs text-slate-500">{t('weaving.production.ownership')}: {t(row.currentRun.ownershipType === 'own' ? 'weaving.production.own' : 'weaving.production.partyOwned')}</div>}
                        </td>
                        <td className="px-4 py-2.5">{row.currentRun?.quality?.name || '-'}</td>
                        <td className="px-4 py-2.5">{row.currentRun?.beam?.beamNo || '-'}</td>
                      </>}

                      {(tab !== 'loom' || showMachineDetails) && <td className="px-4 py-2.5 text-slate-600">
                        {tab === 'yarn'
                          ? [row.yarnType, row.millBrand].filter(Boolean).join(' / ') || '-'
                          : tab === 'fabric'
                            ? [row.primaryUnit, row.construction].filter(Boolean).join(' / ') || '-'
                            : [row.brand, row.model, row.loomType, row.reedSpace].filter(Boolean).join(' / ') || '-'}
                      </td>}

                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            row.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {tab === 'loom' && row.currentRun ? t('weaving.beams.status.loaded') : !row.isActive ? t('weaving.operations.inactive')
                            : tab === 'loom' ? t('weaving.production.free') : t('weaving.operations.active')}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          title={t('weaving.operations.edit')}
                          onClick={(event) => {
                            event.stopPropagation();
                            edit(row);
                            if (listMode) onNew();
                          }}
                          className="rounded-md p-2 text-teal-700 transition hover:bg-teal-100"
                        >
                          <FaEdit />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tab === 'loom' ? (showMachineDetails ? 8 : 7) : 4} className="p-10 text-center text-slate-500">
                      <FaIndustry className="mx-auto mb-2 text-2xl text-slate-300" />

                      {t('weaving.operations.noRecords')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {godownQuickAdd && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="font-bold text-slate-900">{t('weaving.operations.newGodown')}</h3>
                <button
                  type="button"
                  title={t('weaving.operations.cancel')}
                  onClick={() => setGodownQuickAdd(null)}
                  disabled={quickSaving}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                >
                  <FaTimes />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <TextInput
                  autoFocus
                  label={t('weaving.operations.godownName')}
                  required
                  value={godownQuickAdd.name}
                  onChange={(event) =>
                    setGodownQuickAdd((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <Field label={t('weaving.operations.shortNote')}>
                  <textarea
                    rows="2"
                    className={`${inputClass} h-auto py-2`}
                    value={godownQuickAdd.note}
                    onChange={(event) =>
                      setGodownQuickAdd((current) => ({ ...current, note: event.target.value }))
                    }
                  />
                </Field>
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => setGodownQuickAdd(null)} disabled={quickSaving} className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    {t('weaving.operations.cancel')}
                  </button>
                  <button type="button" onClick={saveQuickGodown} disabled={quickSaving || !godownQuickAdd.name.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                    {quickSaving && <FaSpinner className="animate-spin" />} {t('weaving.operations.save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {yarnQuickAdd && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="font-bold text-slate-900">{t('weaving.operations.quickAdd')}</h3>
                <button type="button" title={t('weaving.operations.cancel')} onClick={() => setYarnQuickAdd(null)} disabled={quickSaving} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
                  <FaTimes />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <TextInput label={t('weaving.operations.yarnName')} required value={yarnQuickAdd.name} onChange={(event) => setYarnQuickAdd((current) => ({ ...current, name: event.target.value }))} />
                <TextInput autoFocus label={t('weaving.operations.count')} required placeholder="e.g. 30/1" value={yarnQuickAdd.count} onChange={(event) => setYarnQuickAdd((current) => ({ ...current, count: event.target.value }))} />
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => setYarnQuickAdd(null)} disabled={quickSaving} className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    {t('weaving.operations.cancel')}
                  </button>
                  <button type="button" onClick={saveQuickYarn} disabled={quickSaving || !yarnQuickAdd.name.trim() || !yarnQuickAdd.count.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                    {quickSaving && <FaSpinner className="animate-spin" />} {t('weaving.operations.save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeavingMastersPage;
