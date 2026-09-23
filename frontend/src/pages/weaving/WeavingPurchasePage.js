import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaChevronDown, FaChevronUp, FaEdit, FaEye, FaFile, FaPaperclip, FaPrint, FaTimes, FaTrash } from 'react-icons/fa';

import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeavingRecordDetailModal from '../../components/weaving/WeavingRecordDetailModal';
import WeightKgLbsInput from '../../components/weaving/WeightKgLbsInput';
import { requestWeavingConfirmation, useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

import {
  createPurchase,
  getCommercialMeta,
  getPurchaseById,
  listPurchases,
  updatePurchase,
  voidPurchase,
} from '../../services/weavingCommercialService';

import { createWeavingMaster } from '../../services/weavingOperationsService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';

const control =
  'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const yarnRow = () => ({
  yarnId: '',
  packageType: '',
  packageQty: '',
  coneSize: '',
  conesPerPackage: '',
  extraCones: '',
  totalCones: 0,
  smallCones: 0,
  largeCones: 0,
  kg: '',
  lbs: '',
  rateBasis: 'kg',
  rate: '',
  contractId: '',
  destinationType: 'godown',
  godownId: '',
  sizingPartyId: '',
  lotReference: '',
});

const itemRow = () => ({
  itemId: '',
  description: '',
  quantity: '',
  unit: 'Nos',
  rate: '',
  loomId: '',
  nature: 'expense',
  debitAccountId: '',
});

const fabricRow = () => ({
  fabricQualityId: '',
  fabricGrade: 'normal',
  godownId: '',
  quantity: '',
  weightKg: '',
  thanCount: '',
  pieceCount: '',
  rate: '',
});

const initial = (kind = 'yarn') => ({
  requestKey: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  purchaseType: kind === 'yarn' ? 'yarn' : kind === 'fabric' ? 'fabric' : 'parts',
  entryMode: kind === 'general' ? 'quick' : 'detailed',

  purchaseNo: '',
  purchaseDate: getBusinessDateInputValue(),

  partyId: '',
  supplierInvoiceNo: '',

  creditDays: '',
  dueDate: '',
  gatePassNo: '',

  yarnSource: 'own',

  quickAmount: '',
  quickNature: 'expense',
  quickDebitAccountId: '',

  paidNow: '',
  paymentMethod: 'cash',
  paymentAccountId: '',

  notes: '',
  attachments: [],

  lines: [kind === 'yarn' ? yarnRow() : kind === 'fabric' ? fabricRow() : itemRow()],
});

const started = (row, kind) =>
  kind === 'yarn'
    ? Boolean(row.yarnId || row.kg || row.lbs || row.rate)
    : kind === 'fabric'
      ? Boolean(row.fabricQualityId || row.quantity || row.weightKg || row.rate)
      : Boolean(row.itemId || row.quantity || row.rate);

const dueFrom = (date, days) => {
  if (!date || !Number(days)) return '';

  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days));

  return value.toISOString().slice(0, 10);
};

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

const recoveryKey = (kind) => `weaving:purchase:unsaved:${kind}`;
const restorePurchase = (kind) => {
  try {
    const saved = JSON.parse(localStorage.getItem(recoveryKey(kind)) || 'null');
    return saved?.purchaseType ? saved : initial(kind);
  } catch {
    return initial(kind);
  }
};

export default function WeavingPurchasePage() {
  const [params, setParams] = useSearchParams();
  const requestedKind = ['yarn', 'fabric', 'general'].includes(params.get('tab'))
    ? params.get('tab')
    : 'yarn';
  const listMode = params.get('view') === 'list';
  const listType = ['yarn', 'fabric', 'general'].includes(params.get('type')) ? params.get('type') : '';
  const [kind, setKind] = useState(requestedKind);
  const [form, setForm] = useState(() => restorePurchase(requestedKind));

  const [meta, setMeta] = useState({
    parties: [],
    yarns: [],
    fabrics: [],
    items: [],
    godowns: [],
    contracts: [],
    looms: [],
    paymentAccounts: [],
    debitAccounts: [],
  });

  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({ search: '', date: 'all', from: '', to: '', status: '', type: '' });
  const [notice, setNotice] = useState('');
  useWeavingFeedback(notice, setNotice, { type: 'error' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const canEdit = hasPermission('weaving.purchases.edit');
  const canVoid = hasPermission('weaving.purchases.void');

  const [yarnDetails, setYarnDetails] = useState(null);
  const [purchaseDetail, setPurchaseDetail] = useState(null);
  const [packingOpen, setPackingOpen] = useState({});

  useEffect(() => {
    if (requestedKind === kind) return;
    setKind(requestedKind);
    setPackingOpen({});
    setForm(restorePurchase(requestedKind));
  }, [requestedKind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hasValues = form.partyId || form.paidNow || form.notes || form.lines.some((row) => started(row, kind));
      if (hasValues) localStorage.setItem(recoveryKey(kind), JSON.stringify({ ...form, attachments: [] }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, kind]);

  useEffect(() => {
    getCommercialMeta()
      .then((data) => {
        setMeta(data);

        if (data?.nextPurchaseNo) {
          setForm((current) => ({
            ...current,
            purchaseNo: current.purchaseNo || data.nextPurchaseNo,
          }));
        }
      })
      .catch(() => setNotice('Could not load purchase options'));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const now = new Date(); const iso = (value) => value.toISOString().slice(0, 10); const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()); const weekStart = new Date(start(now)); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1); const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setDate(lastWeekStart.getDate() - 6); const ranges = { today: [iso(now), iso(now)], yesterday: [iso(new Date(start(now).getTime() - 86400000)), iso(new Date(start(now).getTime() - 86400000))], thisWeek: [iso(weekStart), iso(now)], lastWeek: [iso(lastWeekStart), iso(lastWeekEnd)], thisMonth: [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)], lastMonth: [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))], thisYear: [`${now.getFullYear()}-01-01`, iso(now)], lastYear: [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`] }; const range = filters.date === 'custom' ? [filters.from, filters.to] : ranges[filters.date] || [];
      listPurchases({
        ...(listMode ? (listType ? { type: listType === 'general' ? 'parts' : listType } : {}) : { type: kind === 'general' ? 'parts' : kind }),
        ...(listMode ? { search: filters.search, status: filters.status, ...(listType ? {} : filters.type ? { type: filters.type === 'general' ? 'parts' : filters.type } : {}), from: range[0], to: range[1] } : { includeVoided: true }),
      })
        .then(setHistory)
        .catch(() => {});
    }, 375);

    return () => clearTimeout(timer);
  }, [kind, listMode, listType, filters]);

  useEffect(() => {
    const purchaseId = params.get('purchaseId');
    if (!purchaseId) {
      setPurchaseDetail(null);
      return;
    }
    getPurchaseById(purchaseId)
      .then(setPurchaseDetail)
      .catch((error) =>
        setNotice(
          error.response?.status === 404
            ? 'Source record is no longer available.'
            : error.response?.data?.message || 'Could not load purchase'
        )
      );
  }, [params]);

  const closePurchaseDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('purchaseId');
    setParams(next, { replace: true });
    setPurchaseDetail(null);
  };

  const purchaseForm = (row) => {
    const nextKind = row.purchaseType === 'yarn' ? 'yarn' : row.purchaseType === 'fabric' ? 'fabric' : 'general';
    const activePayment = [...(row.paymentTransactionIds || [])].reverse().find((payment) => payment?.status !== 'void');
    return {
      ...initial(nextKind), purchaseType: row.purchaseType, entryMode: row.entryMode,
      purchaseNo: row.purchaseNo, purchaseDate: row.purchaseDate, partyId: row.partyId?._id || row.partyId,
      supplierInvoiceNo: row.supplierInvoiceNo || '', creditDays: row.creditDays || '', dueDate: row.dueDate || '',
      gatePassNo: row.gatePassNo || '', yarnSource: row.yarnSource || 'own', quickAmount: row.quickAmount || '',
      quickNature: row.quickNature || 'expense', quickDebitAccountId: row.quickDebitAccountId || '',
      paidNow: row.paidAmount || '', paymentMethod: activePayment?.paymentMethod || 'cash', paymentAccountId: activePayment?.paymentAccountId || '', notes: row.notes || '',
      attachments: row.attachments || [],
      lines: (row.lines || []).map((line) => row.purchaseType === 'yarn' ? {
        ...yarnRow(), ...line, yarnId: line.yarnId?._id || line.yarnId, kg: line.quantity,
        lbs: line.quantityLbs, contractId: line.contractId?._id || line.contractId || '',
        godownId: line.godownId?._id || line.godownId || '', sizingPartyId: line.sizingPartyId?._id || line.sizingPartyId || '',
      } : row.purchaseType === 'fabric' ? {
        ...fabricRow(), ...line, fabricQualityId: line.fabricQualityId?._id || line.fabricQualityId,
        godownId: line.godownId?._id || line.godownId || '',
      } : { ...itemRow(), ...line, itemId: line.itemId?._id || line.itemId, loomId: line.loomId?._id || line.loomId || '' }),
    };
  };

  const beginEdit = async (row) => {
    try {
      const detail = row.lines ? row : await getPurchaseById(row._id);
      const nextKind = detail.purchaseType === 'yarn' ? 'yarn' : detail.purchaseType === 'fabric' ? 'fabric' : 'general';
      setKind(nextKind); setParams({ tab: nextKind }); setEditingId(detail._id); setForm(purchaseForm(detail)); setPurchaseDetail(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { setNotice(error.response?.data?.message || 'Could not open purchase for editing'); }
  };

  const removePurchase = async (row) => {
    const reason = await requestWeavingConfirmation({
      message: `Reason for voiding ${row.purchaseNo}`,
      inputLabel: `Reason for voiding ${row.purchaseNo}`,
      inputRequired: true,
    });
    if (!reason) return;
    setSaving(true);
    try { await voidPurchase(row._id, reason); setNotice(''); closePurchaseDetail(); setHistory(await listPurchases(listMode ? { ...(listType ? { type: listType === 'general' ? 'parts' : listType } : {}), ...(listType ? {} : filters.type ? { type: filters.type === 'general' ? 'parts' : filters.type } : {}) } : { type: kind === 'general' ? 'parts' : kind, includeVoided: true })); }
    catch (error) { setNotice(error.response?.data?.message || 'Could not void purchase'); }
    finally { setSaving(false); }
  };

  const patch = (next) =>
    setForm((value) => ({
      ...value,
      ...next,
    }));

  const linePatch = (index, next) => {
    setForm((value) => {
      const current = value.lines[index];

      let merged = {
        ...current,
        ...next,
      };

      if (next.yarnId) {
        const yarn = meta.yarns.find((row) => String(row._id) === String(next.yarnId));

        merged = {
          ...merged,
          packageType: merged.packageType || yarn?.defaultPackageType || '',
          conesPerPackage:
            merged.conesPerPackage ||
            (merged.coneSize === 'small'
              ? yarn?.smallConesPerPackage
              : merged.coneSize === 'large'
                ? yarn?.largeConesPerPackage
                : '') ||
            '',
        };
      }

      const totalCones =
        Number(merged.packageQty || 0) * Number(merged.conesPerPackage || 0) +
        Number(merged.extraCones || 0);

      merged = {
        ...merged,
        totalCones,
        smallCones: merged.coneSize === 'small' ? totalCones : 0,
        largeCones: merged.coneSize === 'large' ? totalCones : 0,
      };

      const lines = value.lines.map((row, i) => (i === index ? merged : row));

      /*
       * Always keep one clean trailing blank row.
       */
      if (started(lines.at(-1), kind)) {
        lines.push(kind === 'yarn' ? yarnRow() : kind === 'fabric' ? fabricRow() : itemRow());
      }

      while (lines.length > 1 && !started(lines.at(-1), kind) && !started(lines.at(-2), kind)) {
        lines.pop();
      }

      return {
        ...value,
        lines,
      };
    });
  };

  const removeLine = (index) => {
    setForm((value) => {
      const lines = value.lines.filter((_, i) => i !== index);

      if (!lines.length || started(lines.at(-1), kind)) {
        lines.push(kind === 'yarn' ? yarnRow() : kind === 'fabric' ? fabricRow() : itemRow());
      }

      return {
        ...value,
        lines,
      };
    });

    setPackingOpen((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const activeLines = form.lines.filter((row) => started(row, kind));

  const lineAmount = (row) => {
    if (kind === 'yarn') {
      const quantity = row.rateBasis === 'lbs' ? Number(row.lbs || 0) : Number(row.kg || 0);

      return quantity * Number(row.rate || 0);
    }

    return Number(row.quantity || 0) * Number(row.rate || 0);
  };

  const total =
    form.entryMode === 'quick'
      ? Number(form.quickAmount || 0)
      : activeLines.reduce((sum, row) => sum + lineAmount(row), 0);

  const sizing = meta.parties.filter(
    (row) => row.serviceTypes?.includes('sizing') && !row.isHidden
  );

  const debitAccounts = (nature) =>
    meta.debitAccounts.filter((row) => row.type === (nature === 'asset' ? 'Asset' : 'Expense'));

  const paid = (value) => {
    const handcash =
      meta.paymentAccounts.find((row) => row.code === 'HANDCASH') ||
      meta.paymentAccounts.find((row) => row.category === 'cash');

    patch({
      paidNow: value,

      ...(Number(value) > 0 && !form.paymentAccountId
        ? {
            paymentMethod: 'cash',
            paymentAccountId: handcash?._id || '',
          }
        : {}),
    });
  };

  const selectCreatedYarn = (index, yarn) => {
    setMeta((value) => ({
      ...value,
      yarns: [...value.yarns, yarn],
    }));

    linePatch(index, {
      yarnId: yarn._id,
    });
  };

  const quickAddYarn = async (name, index) => {
    const existing = meta.yarns.find(
      (row) => row.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (existing) {
      linePatch(index, {
        yarnId: existing._id,
      });
      return;
    }

    const count = await requestWeavingConfirmation({
      type: 'info',
      message: 'Enter the Yarn Count for this new Yarn.',
      inputLabel: 'Yarn Count',
      inputRequired: true,
    });

    if (!count?.trim()) return;

    try {
      const yarn = await createWeavingMaster('yarn', {
        name,
        count: count.trim(),
        isActive: true,
      });

      selectCreatedYarn(index, yarn);
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not add yarn');
    }
  };

  const openYarnDetails = (name, index) => {
    setYarnDetails({
      index,
      name,
      count: '',
      millBrand: '',
      quality: '',
      lotReference: '',
      defaultPackageType: '',
      smallConesPerPackage: '',
      largeConesPerPackage: '',
    });
  };

  const saveYarnDetails = async () => {
    if (!yarnDetails?.name.trim() || !yarnDetails.count.trim()) {
      setNotice('Yarn Name and Count are required');
      return;
    }

    try {
      const { index, ...payload } = yarnDetails;

      const yarn = await createWeavingMaster('yarn', {
        ...payload,
        isActive: true,
      });

      selectCreatedYarn(index, yarn);
      setYarnDetails(null);
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not add yarn');
    }
  };

  const save = async () => {
    setSaving(true);

    try {
      await (editingId ? updatePurchase(editingId, {
        ...form,
        lines: activeLines.map((row) => ({ ...row, quantityKg: row.kg, quantityLbs: row.lbs })),
      }) : createPurchase({
        ...form,

        lines: activeLines.map((row) => ({
          ...row,
          quantityKg: row.kg,
          quantityLbs: row.lbs,
        })),
      }));

      setNotice('');
      localStorage.removeItem(recoveryKey(kind));
      setPackingOpen({});
      setForm(initial(kind));
      setEditingId(null);
      const freshMeta = await getCommercialMeta({ force: true });
      setMeta(freshMeta);
      setForm((current) => ({ ...current, purchaseNo: freshMeta.nextPurchaseNo || '' }));

      listPurchases({
        type: kind === 'general' ? 'parts' : kind,
        includeVoided: true,
      })
        .then(setHistory)
        .catch(() => {});
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not save purchase');
    } finally {
      setSaving(false);
    }
  };

  const field = (text, control, className = '') => (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      <span className="block min-h-[20px]">{text}</span>
      {control}
    </label>
  );

  const togglePacking = (index) => {
    setPackingOpen((current) => ({
      ...current,
      [index]: !current[index],
    }));
  };

  const packageLabel = (row) => {
    if (row.packageType === 'bag') return 'Bags';
    if (row.packageType === 'carton') return 'Cartons';
    return 'Packages';
  };

  const packingSummary = (row) => {
    const parts = [];

    if (Number(row.packageQty) > 0) {
      parts.push(
        `${row.packageQty} ${
          row.packageType === 'carton' ? 'Cartons' : row.packageType === 'bag' ? 'Bags' : 'Packages'
        }`
      );
    }

    if (Number(row.smallCones) > 0) {
      parts.push(`${row.smallCones} Small Cones`);
    }

    if (Number(row.largeCones) > 0) {
      parts.push(`${row.largeCones} Large Cones`);
    }

    return parts.join(' • ');
  };

  const balanceDue = Math.max(0, total - Number(form.paidNow || 0));

  const paymentStatus =
    total > 0 && Number(form.paidNow || 0) >= total
      ? 'Paid'
      : Number(form.paidNow || 0) > 0
        ? 'Partial'
        : 'Unpaid';

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/50 px-2 pb-3 pt-1 sm:px-3 sm:pb-4">
      <div className="mx-auto max-w-[1700px] space-y-2">
        {!listMode && <>
        {/* PURCHASE DETAILS */}
        <section className="overflow-visible rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-gradient-to-r from-teal-100 via-cyan-50 to-emerald-50 px-3 py-1.5">
            <h2 className="font-bold text-teal-950">Purchase Details</h2>

            <div className="flex rounded-md border border-teal-100 bg-white/70 p-0.5 shadow-sm">
              {[
                ['yarn', 'Yarn'],
                ['fabric', 'Fabric'],
                ['general', 'Parts / General'],
              ].map(([key, text]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setParams({ tab: key });
                    setKind(key);
                    setPackingOpen({});
                    setForm(initial(key));
                  }}
                  className={`h-8 rounded-md px-3 text-sm font-semibold transition-all ${
                    kind === key
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-teal-700'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {field(
              'Purchase No. *',
              <input
                className={control}
                value={form.purchaseNo}
                placeholder="e.g. WP-00001"
                disabled
              />
            )}

            {field(
              'Purchase Date *',
              <input
                type="date"
                className={control}
                value={form.purchaseDate}
                onChange={(e) =>
                  patch({
                    purchaseDate: e.target.value,
                    dueDate: dueFrom(e.target.value, form.creditDays),
                  })
                }
              />
            )}

            <SearchableCreatableSelect
              label={
                kind === 'yarn' && form.yarnSource === 'party'
                  ? 'Yarn Owner / Party *'
                  : 'Supplier / Party *'
              }
              placeholder="Search supplier or party"
              options={meta.parties.filter((row) =>
                !row.isHidden && !row.serviceTypes?.includes('sizing') && (
                  row.role === 'both' ||
                  row.role === (kind === 'yarn' && form.yarnSource === 'party' ? 'customer' : 'supplier')
                )
              )}
              value={form.partyId}
              required
              onChange={(partyId) =>
                patch({
                  partyId,
                })
              }
            />

            {field(
              'Supplier Invoice No.',
              <input
                className={control}
                value={form.supplierInvoiceNo}
                placeholder="e.g. INV-786"
                onChange={(e) =>
                  patch({
                    supplierInvoiceNo: e.target.value,
                  })
                }
              />
            )}

            {kind === 'yarn' &&
              field(
                'Yarn Source',
                <select
                  className={control}
                  value={form.yarnSource}
                  onChange={(e) =>
                    patch({
                      yarnSource: e.target.value,
                    })
                  }
                >
                  <option value="own">Own Purchase</option>
                  <option value="party">Party / Conversion Yarn</option>
                </select>
              )}

            {field(
              'Credit Days',
              <input
                type="number"
                min="0"
                className={control}
                placeholder="e.g. 30"
                value={form.creditDays}
                onChange={(e) =>
                  patch({
                    creditDays: e.target.value,
                    dueDate: dueFrom(form.purchaseDate, e.target.value),
                  })
                }
              />
            )}

            {field(
              'Due Date',
              <input
                type="date"
                className={control}
                value={form.dueDate}
                onChange={(e) =>
                  patch({
                    dueDate: e.target.value,
                  })
                }
              />
            )}

            {kind === 'yarn' &&
              field(
                'Gate Pass / Challan No.',
                <input
                  className={control}
                  value={form.gatePassNo}
                  placeholder="Optional"
                  onChange={(e) =>
                    patch({
                      gatePassNo: e.target.value,
                    })
                  }
                />
              )}

            <div className="text-sm font-medium text-slate-700">
              <span className="block min-h-[20px]">Attachment</span>

              <div className="mt-1 flex min-h-10 flex-wrap items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-teal-700 transition hover:border-teal-400 hover:bg-teal-50">
                  <FaPaperclip className="mr-2" />
                  Add Files
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) =>
                      patch({
                        attachments: [
                          ...form.attachments,
                          ...Array.from(e.target.files || []),
                        ].slice(0, 3),
                      })
                    }
                  />
                </label>

                {form.attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex h-10 max-w-[210px] items-center gap-2 rounded-md bg-slate-100 px-3 text-xs text-slate-700"
                  >
                    <FaFile className="shrink-0" />

                    <span className="truncate">{file.name}</span>

                    <button
                      type="button"
                      title="Remove File"
                      aria-label="Remove File"
                      onClick={() =>
                        patch({
                          attachments: form.attachments.filter((_, i) => i !== index),
                        })
                      }
                      className="shrink-0 text-slate-400 hover:text-rose-600"
                    >
                      <FaTimes />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {field(
              'Notes',
              <textarea
                className="mt-1 min-h-[40px] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                placeholder="Optional purchase note"
                value={form.notes}
                onChange={(e) =>
                  patch({
                    notes: e.target.value,
                  })
                }
              />,
              'sm:col-span-2'
            )}
          </div>
        </section>

        {/* PARTS / GENERAL MODE */}
        {kind === 'general' && (
          <section className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-800">Parts / General Purchase</h2>

                <p className="text-xs text-slate-500">Use Quick Bill or enter item details</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  patch({
                    entryMode: form.entryMode === 'quick' ? 'detailed' : 'quick',
                  })
                }
                className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"
              >
                {form.entryMode === 'quick' ? 'Item Details' : 'Quick Bill'}

                <FaChevronDown />
              </button>
            </div>

            {form.entryMode === 'quick' && (
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {field(
                  'Bill Amount *',
                  <input
                    type="number"
                    min="0"
                    className={control}
                    placeholder="e.g. 25000"
                    value={form.quickAmount}
                    onChange={(e) =>
                      patch({
                        quickAmount: e.target.value,
                      })
                    }
                  />
                )}

                {field(
                  'Nature *',
                  <select
                    className={control}
                    value={form.quickNature}
                    onChange={(e) =>
                      patch({
                        quickNature: e.target.value,
                        quickDebitAccountId: '',
                      })
                    }
                  >
                    <option value="expense">Expense</option>

                    <option value="asset">Asset</option>
                  </select>
                )}

                {field(
                  'Post To Account *',
                  <select
                    className={control}
                    value={form.quickDebitAccountId}
                    onChange={(e) =>
                      patch({
                        quickDebitAccountId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Account</option>

                    {debitAccounts(form.quickNature).map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {form.entryMode === 'detailed' && (
              <div className="space-y-3 p-4">
                {form.lines.map((row, index) => {
                  const amount = Number(row.quantity || 0) * Number(row.rate || 0);

                  return (
                    <div
                      key={index}
                      className="relative overflow-visible rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
                        <div className="xl:col-span-4">
                          <SearchableCreatableSelect
                            label="Product / Part"
                            placeholder="Search product / part"
                            options={meta.items}
                            value={row.itemId}
                            onChange={(itemId) =>
                              linePatch(index, {
                                itemId,
                              })
                            }
                          />
                        </div>

                        {field(
                          'Qty',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            value={row.quantity}
                            placeholder="e.g. 4"
                            onChange={(e) =>
                              linePatch(index, {
                                quantity: e.target.value,
                              })
                            }
                          />,
                          'xl:col-span-2'
                        )}

                        {field(
                          'Rate',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            value={row.rate}
                            placeholder="e.g. 850"
                            onChange={(e) =>
                              linePatch(index, {
                                rate: e.target.value,
                              })
                            }
                          />,
                          'xl:col-span-2'
                        )}

                        <div className="xl:col-span-2">
                          <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                            Amount
                          </span>

                          <div className="mt-1 flex h-10 items-center rounded-md bg-teal-50 px-3 font-bold text-teal-900">
                            Rs. {money(amount)}
                          </div>
                        </div>

                        <div className="flex items-end justify-end xl:col-span-2">
                          <button
                            type="button"
                            title="Delete Row"
                            aria-label="Delete Row"
                            disabled={!started(row, kind)}
                            onClick={() => removeLine(index)}
                            className="flex h-10 w-10 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50 disabled:opacity-20"
                          >
                            <FaTrash />
                          </button>
                        </div>

                        {field(
                          'For Loom',
                          <select
                            className={control}
                            value={row.loomId}
                            onChange={(e) =>
                              linePatch(index, {
                                loomId: e.target.value,
                              })
                            }
                          >
                            <option value="">General</option>

                            {meta.looms.map((loom) => (
                              <option key={loom._id} value={loom._id}>
                                {loom.name}
                              </option>
                            ))}
                          </select>,
                          'xl:col-span-4'
                        )}

                        {field(
                          'Nature',
                          <select
                            className={control}
                            value={row.nature}
                            onChange={(e) =>
                              linePatch(index, {
                                nature: e.target.value,
                                debitAccountId: '',
                              })
                            }
                          >
                            <option value="expense">Expense</option>

                            <option value="asset">Asset</option>
                          </select>,
                          'xl:col-span-3'
                        )}

                        {field(
                          'Account',
                          <select
                            className={control}
                            value={row.debitAccountId}
                            onChange={(e) =>
                              linePatch(index, {
                                debitAccountId: e.target.value,
                              })
                            }
                          >
                            <option value="">Default</option>

                            {debitAccounts(row.nature).map((account) => (
                              <option key={account._id} value={account._id}>
                                {account.name}
                              </option>
                            ))}
                          </select>,
                          'xl:col-span-5'
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* FABRIC PURCHASE */}
        {kind === 'fabric' && (
          <section className="space-y-3">
            {form.lines.map((row, index) => {
              const amount = lineAmount(row);
              const selectedQuality = meta.fabrics.find(
                (quality) => String(quality._id) === String(row.fabricQualityId)
              );

              return (
                <div
                  key={index}
                  className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-teal-100 bg-gradient-to-r from-teal-100 via-cyan-50 to-white px-4 py-2.5">
                    <div className="text-sm font-semibold text-slate-700">
                      {selectedQuality?.name || `Fabric Entry ${index + 1}`}
                    </div>
                    <button
                      type="button"
                      title="Delete Fabric Row"
                      aria-label="Delete Fabric Row"
                      disabled={!started(row, kind)}
                      onClick={() => removeLine(index)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 disabled:opacity-20"
                    >
                      <FaTrash />
                    </button>
                  </div>
                  <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-12">
                    <div className="xl:col-span-3">
                      <SearchableCreatableSelect
                        label="Fabric Quality *"
                        placeholder="Search Fabric Quality"
                        options={meta.fabrics}
                        value={row.fabricQualityId}
                        required
                        onChange={(fabricQualityId) => linePatch(index, { fabricQualityId })}
                      />
                    </div>
                    {field(
                      'Grade',
                      <select
                        className={control}
                        value={row.fabricGrade}
                        onChange={(event) => linePatch(index, { fabricGrade: event.target.value })}
                      >
                        <option value="normal">Normal / A</option>
                        <option value="b">B Grade</option>
                        <option value="rejected">Rejected</option>
                        <option value="cut_piece">Cut Piece</option>
                        <option value="waste">Waste / Scrap</option>
                      </select>,
                      'xl:col-span-2'
                    )}
                    {field(
                      'Godown *',
                      <select
                        className={control}
                        value={row.godownId}
                        onChange={(event) => linePatch(index, { godownId: event.target.value })}
                      >
                        <option value="">Select Godown</option>
                        {meta.godowns.map((godown) => (
                          <option key={godown._id} value={godown._id}>
                            {godown.name}
                          </option>
                        ))}
                      </select>,
                      'xl:col-span-2'
                    )}
                    {field(
                      'Meter *',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        value={row.quantity}
                        onChange={(event) => linePatch(index, { quantity: event.target.value })}
                      />,
                      'xl:col-span-1'
                    )}
                    {field(
                      'KG',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        value={row.weightKg}
                        onChange={(event) => linePatch(index, { weightKg: event.target.value })}
                      />,
                      'xl:col-span-1'
                    )}
                    {field(
                      'Than',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        value={row.thanCount}
                        onChange={(event) => linePatch(index, { thanCount: event.target.value })}
                      />,
                      'xl:col-span-1'
                    )}
                    {field(
                      'Rate / M *',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        value={row.rate}
                        onChange={(event) => linePatch(index, { rate: event.target.value })}
                      />,
                      'xl:col-span-1'
                    )}
                    <div className="xl:col-span-1">
                      <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                        Amount
                      </span>
                      <div className="mt-1 flex h-10 items-center whitespace-nowrap rounded-md bg-teal-50 px-3 text-sm font-bold text-teal-900">
                        Rs. {money(amount)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* YARN PURCHASE */}
        {kind === 'yarn' && (
          <section className="space-y-3">
            {form.lines.map((row, index) => {
              const amount = lineAmount(row);

              const selectedYarn = meta.yarns.find(
                (yarn) => String(yarn._id) === String(row.yarnId)
              );

              const packingIsOpen = Boolean(packingOpen[index]);

              return (
                <div
                  key={index}
                  className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  {/* YARN ROW HEADER */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-gradient-to-r from-teal-100 via-cyan-50 to-emerald-50 px-4 py-2.5">
                    <div className="text-sm font-semibold text-slate-700">
                      {selectedYarn?.name ? selectedYarn.name : `Yarn Entry ${index + 1}`}
                    </div>

                    <div className="flex items-center gap-2">
                      {packingSummary(row) && (
                        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800">
                          {packingSummary(row)}
                        </span>
                      )}

                      {row.yarnId && (
                        <button
                          type="button"
                          onClick={() => togglePacking(index)}
                          className="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
                        >
                          Packing Details
                          {packingIsOpen ? <FaChevronUp /> : <FaChevronDown />}
                        </button>
                      )}

                      <button
                        type="button"
                        title="Delete Yarn Row"
                        aria-label="Delete Yarn Row"
                        disabled={!started(row, kind)}
                        onClick={() => removeLine(index)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50 disabled:opacity-20"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>

                  {/* ROW 1 */}
                  <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-12">
                    <div className="xl:col-span-3">
                      <SearchableCreatableSelect
                        label="Yarn *"
                        placeholder="Search yarn"
                        options={meta.yarns}
                        value={row.yarnId}
                        required
                        onChange={(yarnId) =>
                          linePatch(index, {
                            yarnId,
                          })
                        }
                        onQuickAdd={(name) => quickAddYarn(name, index)}
                        onAddDetails={(name) => openYarnDetails(name, index)}
                      />
                    </div>

                    {field(
                      packageLabel(row),
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={control}
                        placeholder="e.g. 10"
                        value={row.packageQty}
                        onChange={(e) =>
                          linePatch(index, {
                            packageQty: e.target.value,
                          })
                        }
                      />,
                      'xl:col-span-1'
                    )}

                    <div className="xl:col-span-3">
                      <WeightKgLbsInput
                        kg={row.kg}
                        lbs={row.lbs}
                        onChange={(value) => linePatch(index, value)}
                      />
                    </div>

                    {field(
                      'Rate Basis',
                      <select
                        className={control}
                        value={row.rateBasis}
                        onChange={(e) =>
                          linePatch(index, {
                            rateBasis: e.target.value,
                          })
                        }
                      >
                        <option value="kg">Per KG</option>

                        <option value="lbs">Per LBS</option>
                      </select>,
                      'xl:col-span-2'
                    )}

                    {field(
                      'Rate',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        placeholder="e.g. 850"
                        value={row.rate}
                        onChange={(e) =>
                          linePatch(index, {
                            rate: e.target.value,
                          })
                        }
                      />,
                      'xl:col-span-1'
                    )}

                    <div className="xl:col-span-2">
                      <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                        Amount
                      </span>

                      <div className="mt-1 flex h-10 items-center rounded-md bg-teal-50 px-3 font-bold text-teal-900">
                        Rs. {money(amount)}
                      </div>
                    </div>

                    {/* ROW 2 */}

                    {field(
                      'Contract',
                      <select
                        className={control}
                        value={row.contractId}
                        onChange={(e) =>
                          linePatch(index, {
                            contractId: e.target.value,
                          })
                        }
                      >
                        <option value="">No Contract / Direct Purchase</option>

                        {meta.contracts.map((contract) => (
                          <option key={contract._id} value={contract._id}>
                            {contract.contractNo}
                          </option>
                        ))}
                      </select>,
                      'xl:col-span-3'
                    )}

                    {field(
                      'Destination',
                      <select
                        className={control}
                        value={row.destinationType}
                        onChange={(e) =>
                          linePatch(index, {
                            destinationType: e.target.value,
                            godownId: '',
                            sizingPartyId: '',
                          })
                        }
                      >
                        <option value="godown">Godown</option>

                        <option value="direct_sizing">Direct Sizing</option>
                      </select>,
                      'xl:col-span-2'
                    )}

                    <div className="xl:col-span-4">
                      {row.destinationType === 'direct_sizing' ? (
                        <SearchableCreatableSelect
                          label="Sizing Party *"
                          placeholder="Search sizing party"
                          options={sizing}
                          value={row.sizingPartyId}
                          required
                          onChange={(sizingPartyId) =>
                            linePatch(index, {
                              sizingPartyId,
                            })
                          }
                        />
                      ) : (
                        field(
                          'Godown *',
                          <select
                            className={control}
                            value={row.godownId}
                            onChange={(e) =>
                              linePatch(index, {
                                godownId: e.target.value,
                              })
                            }
                          >
                            <option value="">Select Godown</option>

                            {meta.godowns.map((godown) => (
                              <option key={godown._id} value={godown._id}>
                                {godown.name}
                              </option>
                            ))}
                          </select>
                        )
                      )}
                    </div>

                    {field(
                      'Lot / Reference',
                      <input
                        className={control}
                        value={row.lotReference}
                        placeholder="Optional"
                        onChange={(e) =>
                          linePatch(index, {
                            lotReference: e.target.value,
                          })
                        }
                      />,
                      'xl:col-span-3'
                    )}
                  </div>

                  {/* PACKING DETAILS */}
                  {packingIsOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Packing Details</h3>

                          <p className="text-xs text-slate-500">
                            Optional physical packing information
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {field(
                          'Package Type',
                          <select
                            className={control}
                            value={row.packageType}
                            onChange={(e) =>
                              linePatch(index, {
                                packageType: e.target.value,
                              })
                            }
                          >
                            <option value="">None</option>

                            <option value="bag">Bag</option>

                            <option value="carton">Carton</option>
                          </select>
                        )}

                        {field(
                          'Cone Size',
                          <select
                            className={control}
                            value={row.coneSize}
                            onChange={(e) => {
                              const yarn = meta.yarns.find(
                                (item) => String(item._id) === String(row.yarnId)
                              );

                              const coneSize = e.target.value;

                              linePatch(index, {
                                coneSize,
                                conesPerPackage:
                                  coneSize === 'small'
                                    ? yarn?.smallConesPerPackage || ''
                                    : coneSize === 'large'
                                      ? yarn?.largeConesPerPackage || ''
                                      : '',
                              });
                            }}
                          >
                            <option value="">None</option>

                            <option value="small">Small</option>

                            <option value="large">Large</option>
                          </select>
                        )}

                        {field(
                          'Cones / Package',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            value={row.conesPerPackage}
                            placeholder="e.g. 15"
                            onChange={(e) =>
                              linePatch(index, {
                                conesPerPackage: e.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Extra Loose Cones',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            value={row.extraCones}
                            placeholder="e.g. 4"
                            onChange={(e) =>
                              linePatch(index, {
                                extraCones: e.target.value,
                              })
                            }
                          />
                        )}

                        <div>
                          <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                            Total Cones
                          </span>

                          <div className="mt-1 flex h-10 items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-3">
                            <span className="text-sm text-teal-700">Total</span>

                            <span className="font-bold text-teal-900">{row.totalCones || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* PAYMENT SUMMARY */}
        {kind !== 'yarn' || form.yarnSource !== 'party' ? (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3">
              <h2 className="font-semibold text-slate-800">Payment Summary</h2>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-lg bg-teal-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-teal-700">
                  Bill Total
                </div>

                <div className="mt-1 text-lg font-bold text-teal-950">Rs. {money(total)}</div>
              </div>

              {field(
                'Paid Now',
                <input
                  type="number"
                  min="0"
                  className={control}
                  placeholder="e.g. 10000"
                  value={form.paidNow}
                  onChange={(e) => paid(e.target.value)}
                />
              )}

              {field(
                'Payment Method',
                <select
                  className={control}
                  value={form.paymentMethod}
                  onChange={(e) =>
                    patch({
                      paymentMethod: e.target.value,
                      paymentAccountId: '',
                    })
                  }
                >
                  <option value="cash">Cash</option>

                  <option value="bank">Bank</option>

                  <option value="online">Online</option>

                  <option value="cheque">Cheque</option>
                </select>
              )}

              {field(
                'Payment Account',
                <select
                  className={control}
                  value={form.paymentAccountId}
                  onChange={(e) =>
                    patch({
                      paymentAccountId: e.target.value,
                    })
                  }
                >
                  <option value="">Select Account</option>

                  {meta.paymentAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  Balance Due
                </div>

                <div className="mt-1 text-lg font-bold text-amber-950">Rs. {money(balanceDue)}</div>
              </div>

              <div
                className={`rounded-lg px-4 py-3 ${
                  paymentStatus === 'Paid'
                    ? 'bg-emerald-50'
                    : paymentStatus === 'Partial'
                      ? 'bg-blue-50'
                      : 'bg-slate-100'
                }`}
              >
                <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  Status
                </div>

                <div className="mt-1 text-lg font-bold text-slate-900">{paymentStatus}</div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ACTIONS */}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(recoveryKey(kind));
              setPackingOpen({});
              setForm(initial(kind));
              setEditingId(null);
            }}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {editingId ? 'Cancel Edit' : 'Clear'}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-teal-600 px-5 py-2 font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : editingId ? 'Update Purchase' : 'Save & Close'}
          </button>
        </div>

        </>}

        {/* PURCHASE LIST */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {listMode && <div className="grid gap-2 border-b p-3 sm:grid-cols-3 lg:grid-cols-6"><input className={control} placeholder="Search purchase or supplier" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /><select className={control} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })}>{[['all','All Dates'],['today','Today'],['yesterday','Yesterday'],['thisWeek','This Week'],['lastWeek','Last Week'],['thisMonth','This Month'],['lastMonth','Last Month'],['thisYear','This Year'],['lastYear','Last Year'],['custom','Custom Date']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{filters.date === 'custom' && <><input type="date" className={control} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /><input type="date" className={control} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></>}<select className={control} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All Payment Status</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></select>{!listType && <select className={control} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All Types</option><option value="yarn">Yarn</option><option value="fabric">Fabric</option><option value="general">Parts / Other</option></select>}<button type="button" className="rounded-md border px-3 text-sm" onClick={() => setFilters({ search: '', date: 'all', from: '', to: '', status: '', type: '' })}>Clear Filters</button></div>}
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-800">{listMode ? `${listType === 'yarn' ? 'Yarn' : listType === 'fabric' ? 'Fabric' : listType === 'general' ? 'Parts / Other' : 'All'} Purchase List` : 'Purchase Invoices'} <span className="ml-2 text-xs font-normal text-slate-500">Recent first</span></h2>
          </div>

          {history.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Purchase No.</th>

                    {listMode && <th className="px-4 py-3 text-left">Date</th>}

                    <th className="px-4 py-3 text-left">Supplier / Party</th>

                    {listMode && <th className="px-4 py-3 text-left">Supplier Invoice No.</th>}

                    <th className="px-4 py-3 text-left">Type</th>

                    <th className="px-4 py-3 text-right">Total</th>
                    {!listMode && <th className="px-4 py-3 text-left">Status</th>}<th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((row) => (
                    <tr key={row._id} role="button" tabIndex={0} onClick={() => listMode ? beginEdit(row) : setParams({ tab: kind, purchaseId: row._id })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); listMode ? beginEdit(row) : setParams({ tab: kind, purchaseId: row._id }); } }} className="cursor-pointer border-t border-slate-100 hover:bg-teal-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.purchaseNo}</td>

                      {listMode && <td className="px-4 py-3">{row.purchaseDate}</td>}

                      <td className="px-4 py-3">{row.partyName}</td>

                      {listMode && <td className="px-4 py-3">{row.supplierInvoiceNo || '-'}</td>}

                      <td className="px-4 py-3 capitalize">{row.purchaseType}</td>

                      <td className="px-4 py-3 text-right font-semibold">
                        Rs. {money(row.grandTotal)}
                      </td>
                      {(listMode || !listMode) && <>{!listMode && <td className="px-4 py-3 capitalize">{row.status}</td>}<td className="px-4 py-3"><div className="flex justify-end gap-2">{!listMode && <button type="button" title="View" onClick={(event) => { event.stopPropagation(); setParams({ tab: kind, purchaseId: row._id }); }} className="rounded-md border p-2 text-slate-600 hover:bg-white"><FaEye /></button>}{canEdit && row.status === 'posted' && <button type="button" title="Edit" onClick={(event) => { event.stopPropagation(); beginEdit(row); }} className="rounded-md border p-2 text-teal-700 hover:bg-white"><FaEdit /></button>}{canVoid && row.status === 'posted' && <button type="button" title="Delete" onClick={(event) => { event.stopPropagation(); removePurchase(row); }} className="rounded-md border p-2 text-rose-700 hover:bg-rose-50"><FaTrash /></button>}</div></td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No purchases yet</div>
          )}
        </section>

        {/* ADD YARN DETAILS MODAL */}
        {purchaseDetail && (
          <WeavingRecordDetailModal
            title={`Purchase ${purchaseDetail.purchaseNo}`}
            fields={[
              ['Date', purchaseDetail.purchaseDate],
              ['Supplier / Party', purchaseDetail.partyId?.name || purchaseDetail.partyName],
              ['Purchase Type', purchaseDetail.purchaseType],
              ['Supplier Invoice', purchaseDetail.supplierInvoiceNo],
              ['Gate Pass', purchaseDetail.gatePassNo],
              ['Entry Mode', purchaseDetail.entryMode],
              ['Credit Days', purchaseDetail.creditDays],
              ['Grand Total', `Rs. ${money(purchaseDetail.grandTotal)}`],
              ['Paid', `Rs. ${money(purchaseDetail.paidAmount)}`],
              ['Balance', `Rs. ${money(purchaseDetail.balanceDue)}`],
              ['Payment Status', purchaseDetail.paymentStatus],
              ['Document Status', purchaseDetail.status],
              ['Due Date', purchaseDetail.dueDate],
              ['Notes', purchaseDetail.notes],
            ]}
            lines={purchaseDetail.lines || []}
            columns={[
              { key: 'name', label: 'Item' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'unit', label: 'Unit' },
              { key: 'rate', label: 'Rate' },
              { key: 'amount', label: 'Amount' },
            ]}
            actions={<><button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FaPrint />Print</button>{canEdit && purchaseDetail.status === 'posted' && <button type="button" onClick={() => beginEdit(purchaseDetail)} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"><FaEdit />Edit</button>}{canVoid && purchaseDetail.status === 'posted' && <button type="button" disabled={saving} onClick={() => removePurchase(purchaseDetail)} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"><FaTrash />Void</button>}</>}
            onClose={closePurchaseDetail}
          />
        )}

        {yarnDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Add Yarn Details</h2>

                  <p className="text-xs text-slate-500">
                    Save once and reuse it in future purchases
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={() => setYarnDetails(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['name', 'Yarn Name *'],
                  ['count', 'Count *'],
                  ['millBrand', 'Mill / Brand'],
                  ['quality', 'Quality'],
                  ['lotReference', 'Lot / Reference'],
                  ['smallConesPerPackage', 'Small Cones / Package'],
                  ['largeConesPerPackage', 'Large Cones / Package'],
                ].map(([key, text]) =>
                  field(
                    text,
                    <input
                      type={key.includes('Cones') ? 'number' : 'text'}
                      className={control}
                      value={yarnDetails[key]}
                      onChange={(event) =>
                        setYarnDetails((value) => ({
                          ...value,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )
                )}

                {field(
                  'Default Package Type',
                  <select
                    className={control}
                    value={yarnDetails.defaultPackageType}
                    onChange={(event) =>
                      setYarnDetails((value) => ({
                        ...value,
                        defaultPackageType: event.target.value,
                      }))
                    }
                  >
                    <option value="">None</option>

                    <option value="bag">Bag</option>

                    <option value="carton">Carton</option>
                  </select>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setYarnDetails(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveYarnDetails}
                  className="rounded-md bg-teal-600 px-4 py-2 font-bold text-white"
                >
                  Add Yarn
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
