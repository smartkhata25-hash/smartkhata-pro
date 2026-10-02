import { t } from '../../i18n/i18n';
import WeavingProductionContext, {
  contractIsOpen,
  ContractProgress,
} from '../../components/weaving/WeavingProductionContext';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaChevronDown,
  FaEdit,
  FaEye,
  FaFile,
  FaPaperclip,
  FaPlus,
  FaPrint,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeavingRecordDetailModal from '../../components/weaving/WeavingRecordDetailModal';
import WeightKgLbsInput from '../../components/weaving/WeightKgLbsInput';
import { autoYarnWeight, defaultPackageProfileFor, packageProfilesFor } from '../../utils/weaving/yarnPackaging';
import {
  requestWeavingConfirmation,
  showWeavingFeedback,
  useWeavingFeedback,
} from '../../components/weaving/WeavingFeedbackModal';

import {
  createPurchase,
  createWeavingItem,
  getCommercialMeta,
  getPurchaseById,
  listPurchases,
  updatePurchase,
  voidPurchase,
} from '../../services/weavingCommercialService';

import { createWeavingMaster } from '../../services/weavingOperationsService';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';

const controlBase =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 hover:border-teal-400 hover:bg-teal-50/20 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const control = `mt-1 ${controlBase}`;

const yarnRow = () => ({
  yarnId: '',
  brandName: '',

  packageType: 'bag',
  packageQty: '',
  packageWeight: 100,
  smallConesPerPackage: 40,
  largeConesPerPackage: 24,

  // Legacy compatibility
  coneSize: '',
  conesPerPackage: '',
  extraCones: '',
  totalCones: 0,

  smallCones: 0,
  largeCones: 0,

  kg: '',
  lbs: '',
  sourceEntryUnit: 'LBS',

  rateBasis: 'lbs',
  rate: '',

  purchaseContractId: '',
  productionContractId: '',
  productionFabricQualityId: '',

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
  purchaseContractId: '',
  fulfillmentContractId: '',
  unit: 'Meter',
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
  const listType = ['yarn', 'fabric', 'general'].includes(params.get('type'))
    ? params.get('type')
    : '';
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
  const [filters, setFilters] = useState({
    search: '',
    date: 'all',
    from: '',
    to: '',
    status: '',
    type: '',
  });
  const [notice, setNotice] = useState('');
  useWeavingFeedback(notice, setNotice, { type: 'error' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const canEdit = hasPermission('weaving.purchases.edit');
  const canVoid = hasPermission('weaving.purchases.void');

  const [yarnDetails, setYarnDetails] = useState(null);
  const [purchaseDetail, setPurchaseDetail] = useState(null);
  const [, setPackingOpen] = useState({});

  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

  const [partyContractPicker, setPartyContractPicker] = useState(null);

  useEffect(() => {
    if (requestedKind === kind) return;
    setKind(requestedKind);
    setPackingOpen({});
    setForm(restorePurchase(requestedKind));
  }, [requestedKind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hasValues =
        form.partyId || form.paidNow || form.notes || form.lines.some((row) => started(row, kind));
      if (hasValues)
        localStorage.setItem(recoveryKey(kind), JSON.stringify({ ...form, attachments: [] }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, kind]);

  useEffect(() => {
    getCommercialMeta({ force: true })
      .then((data) => {
        setMeta(data);

        if (data?.nextPurchaseNo) {
          setForm((current) => ({
            ...current,
            purchaseNo: current.purchaseNo || data.nextPurchaseNo,
            ...(current.purchaseType === 'fabric' &&
            data.godowns?.length === 1 &&
            !current.lines?.[0]?.godownId
              ? {
                  lines: current.lines.map((line, index) =>
                    index === 0 ? { ...line, godownId: data.godowns[0]._id } : line
                  ),
                }
              : {}),
          }));
        }
      })
      .catch(() => setNotice('Could not load purchase options'));
  }, []);

  // If there is only one active Godown,
  // select it immediately when the form/meta loads.
  useEffect(() => {
    if (kind !== 'yarn' || meta.godowns.length !== 1) return;

    const onlyGodownId = meta.godowns[0]._id;

    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.destinationType === 'godown' && !line.godownId
          ? {
              ...line,
              godownId: onlyGodownId,
            }
          : line
      ),
    }));
  }, [kind, meta.godowns]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const now = new Date();
      const iso = (value) => value.toISOString().slice(0, 10);
      const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
      const weekStart = new Date(start(now));
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      const lastWeekEnd = new Date(weekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      const ranges = {
        today: [iso(now), iso(now)],
        yesterday: [
          iso(new Date(start(now).getTime() - 86400000)),
          iso(new Date(start(now).getTime() - 86400000)),
        ],
        thisWeek: [iso(weekStart), iso(now)],
        lastWeek: [iso(lastWeekStart), iso(lastWeekEnd)],
        thisMonth: [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)],
        lastMonth: [
          iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
          iso(new Date(now.getFullYear(), now.getMonth(), 0)),
        ],
        thisYear: [`${now.getFullYear()}-01-01`, iso(now)],
        lastYear: [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`],
      };
      const range =
        filters.date === 'custom' ? [filters.from, filters.to] : ranges[filters.date] || [];
      listPurchases({
        ...(listMode
          ? listType
            ? { type: listType === 'general' ? 'parts' : listType }
            : {}
          : { type: kind === 'general' ? 'parts' : kind }),
        ...(listMode
          ? {
              search: filters.search,
              status: filters.status,
              ...(listType
                ? {}
                : filters.type
                  ? { type: filters.type === 'general' ? 'parts' : filters.type }
                  : {}),
              from: range[0],
              to: range[1],
            }
          : { includeVoided: true }),
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

  const contractLinks = (line) => {
    const legacy = meta.contracts.find(
      (contract) => String(contract._id) === String(line.contractId?._id || line.contractId)
    );
    return {
      purchaseContractId:
        line.purchaseContractId || (legacy?.type === 'purchase' ? legacy._id : ''),
      productionContractId:
        line.productionContractId ||
        (line.itemKind === 'yarn' && legacy?.type === 'sales' ? legacy._id : ''),
      fulfillmentContractId:
        line.fulfillmentContractId ||
        (line.itemKind === 'fabric' &&
        legacy?.type === 'sales' &&
        legacy.contractType === 'fabric_sale'
          ? legacy._id
          : ''),
      contractId: legacy ? '' : line.contractId || '',
    };
  };
  const purchaseForm = (row) => {
    const nextKind =
      row.purchaseType === 'yarn' ? 'yarn' : row.purchaseType === 'fabric' ? 'fabric' : 'general';
    const activePayment = [...(row.paymentTransactionIds || [])]
      .reverse()
      .find((payment) => payment?.status !== 'void');
    return {
      ...initial(nextKind),
      purchaseType: row.purchaseType,
      entryMode: row.entryMode,
      purchaseNo: row.purchaseNo,
      purchaseDate: row.purchaseDate,
      partyId: row.partyId?._id || row.partyId,
      supplierInvoiceNo: row.supplierInvoiceNo || '',
      creditDays: row.creditDays || '',
      dueDate: row.dueDate || '',
      gatePassNo: row.gatePassNo || '',
      yarnSource: row.yarnSource || 'own',
      quickAmount: row.quickAmount || '',
      quickNature: row.quickNature || 'expense',
      quickDebitAccountId: row.quickDebitAccountId || '',
      paidNow: row.paidAmount || '',
      paymentMethod: activePayment?.paymentMethod || 'cash',
      paymentAccountId: activePayment?.paymentAccountId || '',
      notes: row.notes || '',
      attachments: row.attachments || [],
      lines: (row.lines || []).map((line) =>
        row.purchaseType === 'yarn'
          ? {
              ...yarnRow(),
              ...line,
              yarnId: line.yarnId?._id || line.yarnId,
              kg: line.quantity,
              lbs: line.quantityLbs || (Number(line.quantity || 0) * 2.2046226218).toFixed(3),
              brandName: line.brandName || line.yarnId?.millBrand || '',
              ...contractLinks(line),
              godownId: line.godownId?._id || line.godownId || '',
              sizingPartyId: line.sizingPartyId?._id || line.sizingPartyId || '',
            }
          : row.purchaseType === 'fabric'
            ? {
                ...fabricRow(),
                ...line,
                ...contractLinks(line),
                quantity:
                  line.sourceEntryUnit === 'KG'
                    ? line.quantity
                    : (line.sourceQuantity ?? line.quantity),
                rate: line.sourceRate ?? line.rate,
                unit: line.sourceEntryUnit || line.unit || 'Meter',
                fabricQualityId: line.fabricQualityId?._id || line.fabricQualityId,
                godownId: line.godownId?._id || line.godownId || '',
              }
            : {
                ...itemRow(),
                ...line,
                itemId: line.itemId?._id || line.itemId,
                loomId: line.loomId?._id || line.loomId || '',
              }
      ),
    };
  };

  const beginEdit = async (row) => {
    try {
      const detail = row.lines ? row : await getPurchaseById(row._id);
      const nextKind =
        detail.purchaseType === 'yarn'
          ? 'yarn'
          : detail.purchaseType === 'fabric'
            ? 'fabric'
            : 'general';
      setKind(nextKind);
      setParams({ tab: nextKind });
      setEditingId(detail._id);
      setForm(purchaseForm(detail));
      setPurchaseDetail(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open purchase for editing');
    }
  };

  const removePurchase = async (row) => {
    const reason = await requestWeavingConfirmation({
      message: `Reason for voiding ${row.purchaseNo}`,
      inputLabel: `Reason for voiding ${row.purchaseNo}`,
      inputRequired: true,
    });
    if (!reason) return;
    setSaving(true);
    try {
      await voidPurchase(row._id, reason);
      setNotice('');
      closePurchaseDetail();
      setHistory(
        await listPurchases(
          listMode
            ? {
                ...(listType ? { type: listType === 'general' ? 'parts' : listType } : {}),
                ...(listType
                  ? {}
                  : filters.type
                    ? { type: filters.type === 'general' ? 'parts' : filters.type }
                    : {}),
              }
            : { type: kind === 'general' ? 'parts' : kind, includeVoided: true }
        )
      );
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not void purchase');
    } finally {
      setSaving(false);
    }
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

      if (kind === 'yarn' && next.yarnId) {
        const yarn = meta.yarns.find((item) => String(item._id) === String(next.yarnId));

        const profile = defaultPackageProfileFor(yarn);

        const incomingBrand = typeof next.brandName === 'string' ? next.brandName.trim() : '';

        const yarnBrand = yarn?.millBrand || yarn?.brandName || yarn?.brand || '';

        merged = {
          ...merged,

          brandName: incomingBrand || yarnBrand || merged.brandName || '',

          packageType:
            next.packageType || profile?.packageType || yarn?.defaultPackageType || 'bag',

          packageWeight: next.packageWeight ?? profile?.packageWeight ?? yarn?.packageWeight ?? 100,

          smallConesPerPackage:
            next.smallConesPerPackage ??
            profile?.smallConesPerPackage ??
            yarn?.smallConesPerPackage ??
            40,

          largeConesPerPackage:
            next.largeConesPerPackage ??
            profile?.largeConesPerPackage ??
            yarn?.largeConesPerPackage ??
            24,

          rateBasis: 'lbs',

          godownId:
            merged.godownId ||
            (merged.destinationType === 'godown' && meta.godowns.length === 1
              ? meta.godowns[0]._id
              : ''),
        };
      }

      if (kind === 'yarn') {
        const packingChanged = [
          'yarnId',
          'packageType',
          'packageQty',
          'packageWeight',
          'smallCones',
          'largeCones',
          'smallConesPerPackage',
          'largeConesPerPackage',
        ].some((key) => Object.prototype.hasOwnProperty.call(next, key));

        merged = {
          ...merged,
          totalCones: Number(merged.smallCones || 0) + Number(merged.largeCones || 0),
        };

        if (packingChanged) {
          merged = {
            ...merged,
            ...autoYarnWeight(merged),
          };
        }
      }

      const lines = value.lines.map((row, i) => (i === index ? merged : row));

      if (kind === 'general') {
        if (started(lines.at(-1), kind)) {
          const commonPosting = lines[0] || itemRow();

          lines.push({
            ...itemRow(),
            loomId: commonPosting.loomId || '',
            nature: commonPosting.nature || 'expense',
            debitAccountId: commonPosting.debitAccountId || '',
          });
        }

        while (lines.length > 1 && !started(lines.at(-1), kind) && !started(lines.at(-2), kind)) {
          lines.pop();
        }
      }

      return {
        ...value,
        lines,
      };
    });
  };
  const chooseContract = (index, field, contractId) => {
    const contract = meta.contracts.find((row) => String(row._id) === String(contractId));

    const supplierLink =
      field === 'purchaseContractId' ||
      (field === 'productionContractId' && form.yarnSource === 'party');

    if (
      contract &&
      supplierLink &&
      form.lines.some((line, position) => {
        if (position === index) return false;

        const linked = meta.contracts.find(
          (row) =>
            String(row._id) ===
            String(
              line.purchaseContractId ||
                (form.yarnSource === 'party' ? line.productionContractId : '')
            )
        );

        const linkedPartyId = linked?.partyId?._id || linked?.partyId;
        const contractPartyId = contract.partyId?._id || contract.partyId;

        return linked && String(linkedPartyId) !== String(contractPartyId);
      })
    ) {
      setNotice(t('weaving.production.sameInvoiceParty'));
      return;
    }

    if (contract && supplierLink) {
      patch({
        partyId: contract.partyId?._id || contract.partyId,
        creditDays: contract.creditDays || 0,
        dueDate: dueFrom(form.purchaseDate, contract.creditDays),
      });
    }

    const next = {
      [field]: contractId,
      contractId: '',
    };

    if (contract && field === 'purchaseContractId') {
      if (kind === 'yarn') {
        const yarn = meta.yarns.find(
          (item) => String(item._id) === String(contract.itemId?._id || contract.itemId)
        );

        const profile = defaultPackageProfileFor(yarn);

        Object.assign(next, {
          yarnId: contract.itemId?._id || contract.itemId,
          rate: contract.rate,
          rateBasis: 'lbs',

          brandName:
            yarn?.millBrand ||
            yarn?.brandName ||
            yarn?.brand ||
            contract.itemId?.millBrand ||
            contract.itemId?.brandName ||
            '',

          packageType: profile?.packageType || yarn?.defaultPackageType || 'bag',

          packageWeight: profile?.packageWeight ?? yarn?.packageWeight ?? 100,

          smallConesPerPackage: profile?.smallConesPerPackage ?? yarn?.smallConesPerPackage ?? 40,

          largeConesPerPackage: profile?.largeConesPerPackage ?? yarn?.largeConesPerPackage ?? 24,

          ...(meta.godowns.length === 1 ? { godownId: meta.godowns[0]._id } : {}),
        });
      } else {
        Object.assign(next, {
          fabricQualityId: contract.itemId?._id || contract.itemId,
          rate: contract.rate,
          unit: contract.unit,
        });
      }
    }

    if (contract && field === 'productionContractId') {
      next.productionFabricQualityId = contract.productionContext?.fabricQualityId || '';
    }

    if (contract && field === 'fulfillmentContractId') {
      next.fabricQualityId = contract.itemId?._id || contract.itemId;
    }

    linePatch(index, next);
  };

  const purchaseContractOptions = (row) =>
    meta.contracts.filter((contract) => {
      if (contract.type !== 'purchase') return false;

      if ((contract.purchaseItemType || 'yarn') !== kind) {
        return false;
      }

      const selected = String(contract._id) === String(row.purchaseContractId);

      if (!contractIsOpen(contract) && !selected) {
        return false;
      }

      // Old KG Fabric Contracts may remain available only
      // when that legacy Contract is already selected/editing.
      if (kind === 'fabric' && contract.unit === 'KG' && !selected) {
        return false;
      }

      const contractPartyId = contract.partyId?._id || contract.partyId;

      if (form.partyId && String(contractPartyId) !== String(form.partyId) && !selected) {
        return false;
      }

      return true;
    });

  const handlePurchasePartyChange = (partyId, index = 0) => {
    patch({ partyId });

    if (kind === 'general') {
      return;
    }

    if (kind === 'yarn' && form.yarnSource === 'party') {
      return;
    }

    const row = form.lines[index] || (kind === 'fabric' ? fabricRow() : yarnRow());

    if (!partyId) {
      linePatch(index, {
        purchaseContractId: '',
      });

      setPartyContractPicker(null);
      return;
    }

    const itemType = kind === 'fabric' ? 'fabric' : 'yarn';

    const matchingContracts = meta.contracts.filter((contract) => {
      if (contract.type !== 'purchase') return false;

      if ((contract.purchaseItemType || 'yarn') !== itemType) {
        return false;
      }

      if (!contractIsOpen(contract)) {
        return false;
      }

      // Never offer an old KG Fabric Contract
      // for a brand-new Fabric Purchase.
      if (itemType === 'fabric' && contract.unit === 'KG') {
        return false;
      }

      const contractPartyId = contract.partyId?._id || contract.partyId;

      return String(contractPartyId) === String(partyId);
    });

    if (matchingContracts.length === 1) {
      setPartyContractPicker(null);

      chooseContract(index, 'purchaseContractId', matchingContracts[0]._id);

      return;
    }

    if (
      row.purchaseContractId &&
      !matchingContracts.some((contract) => String(contract._id) === String(row.purchaseContractId))
    ) {
      linePatch(index, {
        purchaseContractId: '',
      });
    }

    if (matchingContracts.length > 1) {
      setPartyContractPicker({
        index,
        partyId,
        contracts: matchingContracts,
      });

      return;
    }

    setPartyContractPicker(null);
  };

  const fabricFulfillmentOptions = (row) =>
    meta.contracts.filter((contract) => {
      if (contract.type !== 'sales' || contract.contractType !== 'fabric_sale') {
        return false;
      }

      const selected = String(contract._id) === String(row.fulfillmentContractId);

      if (!contractIsOpen(contract) && !selected) {
        return false;
      }

      const contractItemId = contract.itemId?._id || contract.itemId;

      if (row.fabricQualityId && String(contractItemId) !== String(row.fabricQualityId)) {
        return false;
      }

      return true;
    });

  const productionOptions = (row) =>
    meta.contracts.filter(
      (contract) =>
        contract.type === 'sales' &&
        (form.yarnSource === 'party'
          ? contract.contractType === 'conversion'
          : contract.contractType === 'fabric_sale') &&
        (contractIsOpen(contract) || String(contract._id) === String(row.productionContractId))
    );

  const contractSelect = (row, index, field, label, options, className = '') => (
    <div className={`min-w-0 ${className}`}>
      <SearchableCreatableSelect
        label={label}
        placeholder="Search contract"
        options={options}
        value={row[field] || ''}
        getLabel={(contract) =>
          [contract.contractNo, contract.partyName, contract.itemName].filter(Boolean).join(' | ')
        }
        onChange={(contractId) => chooseContract(index, field, contractId)}
      />
    </div>
  );

  const removeLine = (index) => {
    setForm((value) => {
      if ((kind === 'yarn' || kind === 'fabric') && index === 0) {
        return value;
      }

      const lines = value.lines.filter((_, i) => i !== index);

      if (!lines.length) {
        lines.push(kind === 'yarn' ? yarnRow() : kind === 'fabric' ? fabricRow() : itemRow());
      }

      if (kind === 'general' && started(lines.at(-1), kind)) {
        lines.push(itemRow());
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

  const addYarnLine = () => {
    setForm((value) => ({
      ...value,
      lines: [...value.lines, yarnRow()],
    }));
  };

  const addFabricLine = () => {
    setForm((value) => ({
      ...value,
      lines: [
        ...value.lines,
        {
          ...fabricRow(),
          ...(meta.godowns.length === 1 ? { godownId: meta.godowns[0]._id } : {}),
        },
      ],
    }));
  };

  const activeLines = form.lines.filter((row) => started(row, kind));

  const lineAmount = (row) => {
    if (kind === 'yarn') {
      const quantity = row.rateBasis === 'lbs' ? Number(row.lbs || 0) : Number(row.kg || 0);

      return quantity * Number(row.rate || 0);
    }

    return (
      Number(kind === 'fabric' && row.unit === 'KG' ? row.weightKg || 0 : row.quantity || 0) *
      Number(row.rate || 0)
    );
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

  const defaultExpenseAccountId =
    meta.debitAccounts.find((row) => row.code === 'WEAVING_OTHER_EXP')?._id ||
    meta.debitAccounts.find(
      (row) =>
        row.type === 'Expense' &&
        String(row.name || '')
          .trim()
          .toLowerCase() === 'other expense'
    )?._id ||
    '';

  useEffect(() => {
    if (kind !== 'general' || !defaultExpenseAccountId) return;

    setForm((current) => {
      let changed = false;

      const lines = current.lines.map((row) => {
        if (row.nature === 'expense' && !row.debitAccountId) {
          changed = true;

          return {
            ...row,
            debitAccountId: defaultExpenseAccountId,
          };
        }

        return row;
      });

      const quickNeedsDefault = current.quickNature === 'expense' && !current.quickDebitAccountId;

      if (!changed && !quickNeedsDefault) {
        return current;
      }

      return {
        ...current,

        quickDebitAccountId: quickNeedsDefault
          ? defaultExpenseAccountId
          : current.quickDebitAccountId,

        lines,
      };
    });
  }, [kind, defaultExpenseAccountId]);

  const generalPosting = form.lines[0] || itemRow();

  const patchGeneralPosting = (next) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((row) => ({
        ...row,
        ...next,
      })),
    }));
  };

  const quickAddItem = async (name, index) => {
    const cleanName = String(name || '').trim();

    if (!cleanName) return;

    const existing = meta.items.find(
      (item) =>
        String(item.name || '')
          .trim()
          .toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      linePatch(index, {
        itemId: existing._id,
        unit: existing.unit || 'Nos',
      });

      return;
    }

    try {
      const item = await createWeavingItem({
        name: cleanName,
        category: 'part',
        unit: 'Nos',
      });

      setMeta((current) => ({
        ...current,
        items: [...current.items, item],
      }));

      linePatch(index, {
        itemId: item._id,
        unit: item.unit || 'Nos',
      });
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not add Product / Part');
    }
  };

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
      const commonGeneralPosting = form.lines[0] || itemRow();

      const linesForSave = activeLines.map((row) => ({
        ...row,

        ...(kind === 'general' && form.entryMode === 'detailed'
          ? {
              loomId: commonGeneralPosting.loomId || '',
              nature: commonGeneralPosting.nature || 'expense',
              debitAccountId: commonGeneralPosting.debitAccountId || '',
            }
          : {}),

        quantityKg: row.kg,
        quantityLbs: row.lbs,
      }));

      await (editingId
        ? updatePurchase(editingId, {
            ...form,
            lines: linesForSave,
          })
        : createPurchase({
            ...form,
            lines: linesForSave,
          }));

      setNotice('');
      localStorage.removeItem(recoveryKey(kind));
      setPackingOpen({});
      setForm(initial(kind));
      setEditingId(null);
      const freshMeta = await getCommercialMeta({ force: true });
      setMeta(freshMeta);
      const savedContracts = new Set(
        activeLines.map((line) => line.purchaseContractId).filter(Boolean)
      );
      const reached = freshMeta.contracts.filter(
        (contract) => savedContracts.has(contract._id) && contract.progress?.targetReached
      );
      if (reached.length)
        showWeavingFeedback({
          type: 'info',
          message:
            t('weaving.production.targetReached') +
            ': ' +
            reached.map((contract) => contract.contractNo).join(', '),
        });
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
    <label className={`block min-w-0 text-sm font-medium text-slate-700 ${className}`}>
      <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
        {text}
      </span>

      {control}
    </label>
  );

  const packingSummary = (row) => {
    const parts = [];

    if (Number(row.packageQty) > 0) {
      const type = String(row.packageType || 'Package').replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );

      parts.push(`${row.packageQty} ${type}`);
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
        {!listMode && (
          <>
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
                        setMoreDetailsOpen(false);
                        setPartyContractPicker(null);

                        setForm({
                          ...initial(key),
                          purchaseNo: meta.nextPurchaseNo || '',
                        });
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

              <div className="grid gap-x-3 gap-y-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {field(
                  'PN No. *',
                  <input
                    className={control}
                    value={form.purchaseNo}
                    placeholder="WP-00001"
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

                {kind === 'yarn' ? (
                  (() => {
                    const row = form.lines[0] || yarnRow();

                    const selectedYarn = meta.yarns.find(
                      (yarn) => String(yarn._id) === String(row.yarnId)
                    );

                    const profiles = packageProfilesFor(selectedYarn);

                    const amount = lineAmount(row);

                    const linkedParty = Boolean(
                      row.purchaseContractId ||
                      (form.yarnSource === 'party' && row.productionContractId)
                    );

                    const showProduction =
                      row.destinationType === 'direct_sizing' ||
                      form.yarnSource === 'party' ||
                      row.productionContractId;

                    return (
                      <>
                        {form.yarnSource !== 'party' ? (
                          contractSelect(
                            row,
                            0,
                            'purchaseContractId',
                            'Purchase Contract',
                            purchaseContractOptions(row)
                          )
                        ) : (
                          <div />
                        )}

                        <fieldset disabled={linkedParty} className="min-w-0">
                          <SearchableCreatableSelect
                            label={
                              form.yarnSource === 'party'
                                ? 'Yarn Owner / Party *'
                                : 'Supplier / Party *'
                            }
                            placeholder="Search supplier or party"
                            options={meta.parties.filter(
                              (party) =>
                                !party.isHidden &&
                                !party.serviceTypes?.includes('sizing') &&
                                (party.role === 'both' ||
                                  party.role ===
                                    (form.yarnSource === 'party' ? 'customer' : 'supplier'))
                            )}
                            value={form.partyId}
                            required
                            onChange={(partyId) => handlePurchasePartyChange(partyId, 0)}
                          />
                        </fieldset>

                        {field(
                          'Yarn Source',
                          <select
                            className={control}
                            value={form.yarnSource}
                            disabled={form.lines.some(
                              (line) => line.purchaseContractId || line.productionContractId
                            )}
                            onChange={(event) =>
                              patch({
                                yarnSource: event.target.value,
                              })
                            }
                          >
                            <option value="own">Own Purchase</option>

                            <option value="party">Party / Conversion Yarn</option>
                          </select>
                        )}

                        <fieldset disabled={Boolean(row.purchaseContractId)} className="min-w-0">
                          <SearchableCreatableSelect
                            label="Yarn *"
                            placeholder="Search yarn"
                            options={meta.yarns}
                            value={row.yarnId}
                            required
                            onChange={(yarnId) => linePatch(0, { yarnId })}
                            onQuickAdd={(name) => quickAddYarn(name, 0)}
                            onAddDetails={(name) => openYarnDetails(name, 0)}
                          />
                        </fieldset>

                        {field(
                          'Brand Name',
                          <input
                            className={control}
                            placeholder="Brand Name"
                            value={row.brandName || ''}
                            onChange={(event) =>
                              linePatch(0, {
                                brandName: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Supplier Invoice No.',
                          <input
                            className={control}
                            placeholder="Supplier Invoice No."
                            value={form.supplierInvoiceNo}
                            onChange={(event) =>
                              patch({
                                supplierInvoiceNo: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Package Type',
                          <select
                            className={control}
                            value={row.packageType || 'bag'}
                            onChange={(event) => {
                              const profile =
                                profiles.find((item) => item.packageType === event.target.value) ||
                                {};

                              linePatch(0, {
                                packageType: event.target.value,

                                packageWeight: profile.packageWeight ?? 100,

                                smallConesPerPackage: profile.smallConesPerPackage ?? 40,

                                largeConesPerPackage: profile.largeConesPerPackage ?? 24,
                              });
                            }}
                          >
                            {profiles.map((profile) => (
                              <option key={profile.packageType} value={profile.packageType}>
                                {profile.packageType.replace(/\b\w/g, (letter) =>
                                  letter.toUpperCase()
                                )}
                              </option>
                            ))}
                          </select>
                        )}

                        {field(
                          'Quantity',
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={control}
                            placeholder="Quantity"
                            value={row.packageQty}
                            onChange={(event) =>
                              linePatch(0, {
                                packageQty: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Small Cones',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            placeholder="Small Cones"
                            value={row.smallCones || ''}
                            onChange={(event) =>
                              linePatch(0, {
                                smallCones: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Large Cones',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            placeholder="Large Cones"
                            value={row.largeCones || ''}
                            onChange={(event) =>
                              linePatch(0, {
                                largeCones: event.target.value,
                              })
                            }
                          />
                        )}

                        <div className="sm:col-span-2 xl:col-span-2">
                          <WeightKgLbsInput
                            kg={row.kg}
                            lbs={row.lbs}
                            onChange={(value) => linePatch(0, value)}
                          />
                        </div>

                        {field(
                          'Rate / LBS',
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            placeholder="Rate / LBS"
                            value={row.rate}
                            onChange={(event) =>
                              linePatch(0, {
                                rate: event.target.value,
                                rateBasis: 'lbs',
                              })
                            }
                          />
                        )}

                        <div className="min-w-0">
                          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
                            Amount
                          </span>

                          <div className="mt-1 flex h-9 items-center rounded-md border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-3 text-sm font-bold text-teal-950">
                            Rs. {money(amount)}
                          </div>
                        </div>

                        {field(
                          'Destination',
                          <select
                            className={control}
                            value={row.destinationType}
                            onChange={(event) => {
                              const destinationType = event.target.value;

                              linePatch(0, {
                                destinationType,

                                godownId:
                                  destinationType === 'godown' && meta.godowns.length === 1
                                    ? meta.godowns[0]._id
                                    : '',

                                sizingPartyId: '',
                              });
                            }}
                          >
                            <option value="godown">Godown</option>

                            <option value="direct_sizing">Direct Sizing</option>
                          </select>
                        )}

                        <div className="min-w-0">
                          {row.destinationType === 'direct_sizing' ? (
                            <SearchableCreatableSelect
                              label="Sizing Party *"
                              placeholder="Search sizing party"
                              options={sizing}
                              value={row.sizingPartyId}
                              required
                              onChange={(sizingPartyId) =>
                                linePatch(0, {
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
                                onChange={(event) =>
                                  linePatch(0, {
                                    godownId: event.target.value,
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

                        {showProduction &&
                          contractSelect(
                            row,
                            0,
                            'productionContractId',
                            'Production Contract',
                            productionOptions(row)
                          )}

                        {showProduction && !row.productionContractId && (
                          <div className="min-w-0">
                            <SearchableCreatableSelect
                              label="Production Quality"
                              placeholder="Search quality"
                              options={meta.fabrics}
                              value={row.productionFabricQualityId || ''}
                              onChange={(productionFabricQualityId) =>
                                linePatch(0, {
                                  productionFabricQualityId,
                                })
                              }
                            />
                          </div>
                        )}

                        {row.purchaseContractId && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ContractProgress
                              contract={meta.contracts.find(
                                (contract) =>
                                  String(contract._id) === String(row.purchaseContractId)
                              )}
                              currentQuantity={row.kg}
                            />
                          </div>
                        )}

                        {showProduction && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <WeavingProductionContext
                              context={
                                row.productionContractId
                                  ? meta.contracts.find(
                                      (contract) =>
                                        String(contract._id) === String(row.productionContractId)
                                    )?.productionContext
                                  : {
                                      fabricQualityId: row.productionFabricQualityId,

                                      ownershipType: form.yarnSource === 'party' ? 'party' : 'own',

                                      ownerPartyId: form.yarnSource === 'party' ? form.partyId : '',
                                    }
                              }
                              fabrics={meta.fabrics}
                              parties={meta.parties}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : kind === 'fabric' ? (
                  (() => {
                    const row = form.lines[0] || fabricRow();
                    const amount = lineAmount(row);

                    const linkedParty = Boolean(row.purchaseContractId);

                    const displayUnit =
                      row.unit === 'Yard' ? 'Yard' : row.unit === 'KG' ? 'KG' : 'Meter';

                    return (
                      <>
                        {contractSelect(
                          row,
                          0,
                          'purchaseContractId',
                          'Fabric Purchase Contract',
                          purchaseContractOptions(row)
                        )}

                        <fieldset disabled={linkedParty} className="min-w-0">
                          <SearchableCreatableSelect
                            label="Supplier / Party *"
                            placeholder="Search supplier or party"
                            options={meta.parties.filter(
                              (party) =>
                                !party.isHidden &&
                                !party.serviceTypes?.includes('sizing') &&
                                (party.role === 'both' || party.role === 'supplier')
                            )}
                            value={form.partyId}
                            required
                            onChange={(partyId) => handlePurchasePartyChange(partyId, 0)}
                          />
                        </fieldset>

                        <fieldset
                          disabled={Boolean(row.purchaseContractId || row.fulfillmentContractId)}
                          className="min-w-0"
                        >
                          <SearchableCreatableSelect
                            label="Fabric Quality *"
                            placeholder="Search Fabric Quality"
                            options={meta.fabrics}
                            value={row.fabricQualityId}
                            required
                            onChange={(fabricQualityId) =>
                              linePatch(0, {
                                fabricQualityId,
                              })
                            }
                          />
                        </fieldset>

                        {field(
                          'Grade',
                          <select
                            className={control}
                            value={row.fabricGrade}
                            onChange={(event) =>
                              linePatch(0, {
                                fabricGrade: event.target.value,
                              })
                            }
                          >
                            <option value="normal">Normal / A</option>
                            <option value="b">B Grade</option>
                            <option value="rejected">Rejected</option>
                            <option value="cut_piece">Cut Piece</option>
                            <option value="waste">Waste / Scrap</option>
                          </select>
                        )}

                        {field(
                          'Supplier Invoice No.',
                          <input
                            className={control}
                            placeholder="Supplier Invoice No."
                            value={form.supplierInvoiceNo}
                            onChange={(event) =>
                              patch({
                                supplierInvoiceNo: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Godown *',
                          <select
                            className={control}
                            value={row.godownId}
                            onChange={(event) =>
                              linePatch(0, {
                                godownId: event.target.value,
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
                        )}

                        {field(
                          'Quantity *',
                          <div className="mt-1 flex h-9 overflow-hidden rounded-md border border-slate-300 bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
                            <select
                              className="h-full w-[92px] shrink-0 border-0 border-r border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none"
                              value={row.unit || 'Meter'}
                              disabled={Boolean(row.purchaseContractId)}
                              onChange={(event) =>
                                linePatch(0, {
                                  unit: event.target.value,
                                })
                              }
                            >
                              {row.unit === 'KG' && <option value="KG">Legacy KG</option>}

                              <option value="Meter">Meter</option>

                              <option value="Yard">Yard</option>
                            </select>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-full min-w-0 flex-1 border-0 bg-white px-3 text-sm text-slate-800 outline-none"
                              placeholder={displayUnit}
                              value={row.quantity}
                              onChange={(event) =>
                                linePatch(0, {
                                  quantity: event.target.value,
                                })
                              }
                            />
                          </div>
                        )}

                        {field(
                          'Than',
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={control}
                            placeholder="Than"
                            value={row.thanCount}
                            onChange={(event) =>
                              linePatch(0, {
                                thanCount: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          `Rate / ${
                            row.unit === 'Yard' ? 'Yard' : row.unit === 'KG' ? 'KG' : 'Meter'
                          }`,
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            placeholder="Rate"
                            value={row.rate}
                            onChange={(event) =>
                              linePatch(0, {
                                rate: event.target.value,
                              })
                            }
                          />
                        )}

                        <div className="min-w-0">
                          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
                            Amount
                          </span>

                          <div className="mt-1 flex h-9 items-center rounded-md border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-3 text-sm font-bold text-teal-950">
                            Rs. {money(amount)}
                          </div>
                        </div>

                        {row.purchaseContractId && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ContractProgress
                              contract={meta.contracts.find(
                                (contract) =>
                                  String(contract._id) === String(row.purchaseContractId)
                              )}
                              currentQuantity={row.unit === 'KG' ? row.weightKg : row.quantity}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <>
                    <fieldset>
                      <SearchableCreatableSelect
                        label="Supplier / Party *"
                        placeholder="Search supplier or party"
                        options={meta.parties.filter(
                          (row) =>
                            !row.isHidden &&
                            !row.serviceTypes?.includes('sizing') &&
                            (row.role === 'both' || row.role === 'supplier')
                        )}
                        value={form.partyId}
                        required
                        onChange={(partyId) =>
                          patch({
                            partyId,
                          })
                        }
                      />
                    </fieldset>

                    {field(
                      'Supplier Invoice No.',
                      <input
                        className={control}
                        value={form.supplierInvoiceNo}
                        placeholder="Supplier Invoice No."
                        onChange={(event) =>
                          patch({
                            supplierInvoiceNo: event.target.value,
                          })
                        }
                      />
                    )}
                  </>
                )}
              </div>
            </section>

            {/* PARTS / GENERAL MODE */}
            {kind === 'general' && (
              <section className="overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                {/* HEADER */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-gradient-to-r from-teal-50 via-white to-emerald-50 px-3 py-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Parts / General Purchase</h2>

                    <p className="text-[11px] text-slate-500">Quick Bill or Item Details</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          entryMode: form.entryMode === 'quick' ? 'detailed' : 'quick',
                        })
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-300 bg-white px-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                    >
                      {form.entryMode === 'quick' ? 'Item Details' : 'Quick Bill'}

                      <FaChevronDown />
                    </button>

                    <button
                      type="button"
                      onClick={() => setMoreDetailsOpen((current) => !current)}
                      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                        moreDetailsOpen
                          ? 'border-teal-300 bg-teal-50 text-teal-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'
                      }`}
                    >
                      More Detail
                      <FaChevronDown
                        className={`text-xs transition-transform ${
                          moreDetailsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* QUICK BILL */}
                {form.entryMode === 'quick' && (
                  <div className="grid gap-3 p-3 sm:grid-cols-3">
                    {field(
                      'Bill Amount *',
                      <input
                        type="number"
                        min="0"
                        className={control}
                        placeholder="Bill Amount"
                        value={form.quickAmount}
                        onChange={(event) =>
                          patch({
                            quickAmount: event.target.value,
                          })
                        }
                      />
                    )}

                    {field(
                      'Nature *',
                      <select
                        className={control}
                        value={form.quickNature}
                        onChange={(event) => {
                          const nature = event.target.value;

                          patch({
                            quickNature: nature,

                            quickDebitAccountId:
                              nature === 'expense' ? defaultExpenseAccountId : '',
                          });
                        }}
                      >
                        <option value="expense">Expense</option>

                        <option value="asset">Asset</option>
                      </select>
                    )}

                    {field(
                      'Account *',
                      <select
                        className={control}
                        value={form.quickDebitAccountId}
                        onChange={(event) =>
                          patch({
                            quickDebitAccountId: event.target.value,
                          })
                        }
                      >
                        <option value="">Select Account</option>

                        {debitAccounts(form.quickNature).map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* ITEM DETAILS */}
                {form.entryMode === 'detailed' && (
                  <div className="space-y-2 p-3">
                    {form.lines.map((row, index) => {
                      const amount = Number(row.quantity || 0) * Number(row.rate || 0);

                      return (
                        <div
                          key={index}
                          className="grid items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 sm:grid-cols-2 xl:grid-cols-12"
                        >
                          <div className="xl:col-span-5">
                            <SearchableCreatableSelect
                              label="Product / Part"
                              placeholder="Search product / part"
                              options={meta.items}
                              value={row.itemId}
                              onChange={(itemId, item) =>
                                linePatch(index, {
                                  itemId,
                                  unit: item?.unit || row.unit || 'Nos',
                                })
                              }
                              onQuickAdd={(name) => quickAddItem(name, index)}
                            />
                          </div>

                          {field(
                            'Qty',
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={control}
                              placeholder="Qty"
                              value={row.quantity}
                              onChange={(event) =>
                                linePatch(index, {
                                  quantity: event.target.value,
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
                              step="0.01"
                              className={control}
                              placeholder="Rate"
                              value={row.rate}
                              onChange={(event) =>
                                linePatch(index, {
                                  rate: event.target.value,
                                })
                              }
                            />,
                            'xl:col-span-2'
                          )}

                          <div className="xl:col-span-2">
                            <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
                              Amount
                            </span>

                            <div className="mt-1 flex h-9 items-center rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-950">
                              Rs. {money(amount)}
                            </div>
                          </div>

                          <div className="flex h-9 items-center justify-center xl:col-span-1">
                            <button
                              type="button"
                              title="Delete Row"
                              aria-label="Delete Row"
                              disabled={!started(row, kind)}
                              onClick={() => removeLine(index)}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50 disabled:opacity-20"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* ONE COMMON POSTING ROW */}
                    <div className="grid gap-2 rounded-lg border border-teal-100 bg-gradient-to-r from-teal-50/70 via-white to-emerald-50/60 p-2.5 sm:grid-cols-3">
                      {field(
                        'For Loom',
                        <select
                          className={control}
                          value={generalPosting.loomId || ''}
                          onChange={(event) =>
                            patchGeneralPosting({
                              loomId: event.target.value,
                            })
                          }
                        >
                          <option value="">General</option>

                          {meta.looms.map((loom) => (
                            <option key={loom._id} value={loom._id}>
                              {loom.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {field(
                        'Nature',
                        <select
                          className={control}
                          value={generalPosting.nature || 'expense'}
                          onChange={(event) => {
                            const nature = event.target.value;

                            patchGeneralPosting({
                              nature,

                              debitAccountId: nature === 'expense' ? defaultExpenseAccountId : '',
                            });
                          }}
                        >
                          <option value="expense">Expense</option>

                          <option value="asset">Asset</option>
                        </select>
                      )}

                      {field(
                        'Account',
                        <select
                          className={control}
                          value={generalPosting.debitAccountId || ''}
                          onChange={(event) =>
                            patchGeneralPosting({
                              debitAccountId: event.target.value,
                            })
                          }
                        >
                          <option value="">Default</option>

                          {debitAccounts(generalPosting.nature || 'expense').map((account) => (
                            <option key={account._id} value={account._id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* MORE DETAIL */}
                {moreDetailsOpen && (
                  <div className="border-t border-teal-100 p-2">
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                      {/* DUE DATE */}
                      <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white pl-3">
                        <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
                          Due Date
                        </span>

                        <input
                          type="date"
                          className="h-[34px] w-[140px] border-0 bg-transparent px-2 text-sm outline-none"
                          value={form.dueDate}
                          onChange={(event) =>
                            patch({
                              dueDate: event.target.value,
                            })
                          }
                        />
                      </div>

                      {/* CREDIT DAYS */}
                      <input
                        type="number"
                        min="0"
                        className="h-9 w-[110px] shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        placeholder="Credit Days"
                        value={form.creditDays}
                        onChange={(event) =>
                          patch({
                            creditDays: event.target.value,

                            dueDate: dueFrom(form.purchaseDate, event.target.value),
                          })
                        }
                      />

                      {/* NOTES */}
                      <input
                        className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        placeholder="Notes (optional)"
                        value={form.notes}
                        onChange={(event) =>
                          patch({
                            notes: event.target.value,
                          })
                        }
                      />

                      {/* ATTACHMENT ICON */}
                      <div className="relative shrink-0">
                        <label
                          title="Add Files"
                          aria-label="Add Files"
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-teal-300 bg-white text-teal-700 transition hover:bg-teal-50"
                        >
                          <FaPaperclip />

                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            multiple
                            className="hidden"
                            onChange={(event) =>
                              patch({
                                attachments: [
                                  ...form.attachments,
                                  ...Array.from(event.target.files || []),
                                ].slice(0, 3),
                              })
                            }
                          />
                        </label>

                        {form.attachments.length > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
                            {form.attachments.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {form.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.attachments.map((file, index) => (
                          <span
                            key={`${file.name}-${index}`}
                            className="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-md bg-slate-100 px-2 text-[11px] text-slate-600"
                          >
                            <FaFile className="shrink-0 text-teal-600" />

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
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <FaTimes />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {/* ADDITIONAL FABRIC LINES */}
            {kind === 'fabric' && (
              <section className="space-y-2">
                {form.lines.slice(1).map((row, offset) => {
                  const index = offset + 1;
                  const amount = lineAmount(row);

                  const selectedQuality = meta.fabrics.find(
                    (quality) => String(quality._id) === String(row.fabricQualityId)
                  );

                  const displayUnit =
                    row.unit === 'Yard' ? 'Yard' : row.unit === 'KG' ? 'KG' : 'Meter';

                  return (
                    <div
                      key={index}
                      className="overflow-visible rounded-lg border border-teal-100 bg-white shadow-sm"
                    >
                      <div className="flex h-10 items-center justify-between border-b border-teal-100 bg-gradient-to-r from-teal-50 via-white to-emerald-50 px-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">
                            Fabric {index + 1}
                          </span>

                          {selectedQuality?.name && (
                            <span className="truncate text-sm font-semibold text-slate-700">
                              {selectedQuality.name}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          title="Remove Fabric"
                          aria-label="Remove Fabric"
                          onClick={() => removeLine(index)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50"
                        >
                          <FaTrash />
                        </button>
                      </div>

                      <div className="grid gap-x-3 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                        {contractSelect(
                          row,
                          index,
                          'purchaseContractId',
                          'Fabric Purchase Contract',
                          purchaseContractOptions(row)
                        )}

                        <fieldset
                          disabled={Boolean(row.purchaseContractId || row.fulfillmentContractId)}
                        >
                          <SearchableCreatableSelect
                            label="Fabric Quality *"
                            placeholder="Search Fabric Quality"
                            options={meta.fabrics}
                            value={row.fabricQualityId}
                            required
                            onChange={(fabricQualityId) =>
                              linePatch(index, {
                                fabricQualityId,
                              })
                            }
                          />
                        </fieldset>

                        {field(
                          'Grade',
                          <select
                            className={control}
                            value={row.fabricGrade}
                            onChange={(event) =>
                              linePatch(index, {
                                fabricGrade: event.target.value,
                              })
                            }
                          >
                            <option value="normal">Normal / A</option>
                            <option value="b">B Grade</option>
                            <option value="rejected">Rejected</option>
                            <option value="cut_piece">Cut Piece</option>
                            <option value="waste">Waste / Scrap</option>
                          </select>
                        )}

                        {field(
                          'Godown *',
                          <select
                            className={control}
                            value={row.godownId}
                            onChange={(event) =>
                              linePatch(index, {
                                godownId: event.target.value,
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
                        )}

                        {field(
                          'Quantity *',
                          <div className="mt-1 flex h-9 overflow-hidden rounded-md border border-slate-300 bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
                            <select
                              className="h-full w-[92px] shrink-0 border-0 border-r border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none"
                              value={row.unit || 'Meter'}
                              disabled={Boolean(row.purchaseContractId)}
                              onChange={(event) =>
                                linePatch(index, {
                                  unit: event.target.value,
                                })
                              }
                            >
                              {row.unit === 'KG' && <option value="KG">Legacy KG</option>}

                              <option value="Meter">Meter</option>

                              <option value="Yard">Yard</option>
                            </select>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-full min-w-0 flex-1 border-0 px-3 text-sm outline-none"
                              placeholder={displayUnit}
                              value={row.quantity}
                              onChange={(event) =>
                                linePatch(index, {
                                  quantity: event.target.value,
                                })
                              }
                            />
                          </div>
                        )}

                        {field(
                          'Than',
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={control}
                            placeholder="Than"
                            value={row.thanCount}
                            onChange={(event) =>
                              linePatch(index, {
                                thanCount: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          `Rate / ${displayUnit}`,
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            placeholder="Rate"
                            value={row.rate}
                            onChange={(event) =>
                              linePatch(index, {
                                rate: event.target.value,
                              })
                            }
                          />
                        )}

                        <div className="min-w-0">
                          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
                            Amount
                          </span>

                          <div className="mt-1 flex h-9 items-center rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-950">
                            Rs. {money(amount)}
                          </div>
                        </div>

                        {field(
                          'Against Sale Contract',
                          <select
                            className={control}
                            value={row.fulfillmentContractId || ''}
                            onChange={(event) =>
                              chooseContract(index, 'fulfillmentContractId', event.target.value)
                            }
                          >
                            <option value="">Optional</option>

                            {fabricFulfillmentOptions(row).map((contract) => (
                              <option key={contract._id} value={contract._id}>
                                {contract.contractNo} | {contract.itemName}
                              </option>
                            ))}
                          </select>
                        )}

                        {field(
                          'Weight KG (optional)',
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            placeholder="Optional"
                            value={row.weightKg}
                            onChange={(event) =>
                              linePatch(index, {
                                weightKg: event.target.value,
                              })
                            }
                          />
                        )}

                        {row.purchaseContractId && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ContractProgress
                              contract={meta.contracts.find(
                                (contract) =>
                                  String(contract._id) === String(row.purchaseContractId)
                              )}
                              currentQuantity={row.unit === 'KG' ? row.weightKg : row.quantity}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* FABRIC ACTIONS + MORE DETAIL */}
                <section className="overflow-visible">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={addFabricLine}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-300 bg-white px-3 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
                    >
                      <FaPlus />
                      Add Another Fabric / Contract
                    </button>

                    <button
                      type="button"
                      onClick={() => setMoreDetailsOpen((current) => !current)}
                      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-all ${
                        moreDetailsOpen
                          ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800'
                      }`}
                    >
                      More Detail
                      <FaChevronDown
                        className={`text-xs transition-transform duration-200 ${
                          moreDetailsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {moreDetailsOpen && (
                    <div className="mt-2 rounded-lg border border-teal-100 bg-gradient-to-r from-white via-slate-50/70 to-teal-50/40 p-2 shadow-sm">
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                        {/* DUE DATE */}
                        <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white pl-3">
                          <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
                            Due Date
                          </span>

                          <input
                            type="date"
                            className="h-[34px] w-[140px] border-0 bg-transparent px-2 text-sm outline-none"
                            value={form.dueDate}
                            onChange={(event) =>
                              patch({
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </div>

                        {/* CREDIT DAYS */}
                        <input
                          type="number"
                          min="0"
                          className="h-9 w-[105px] shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Credit Days"
                          value={form.creditDays}
                          onChange={(event) =>
                            patch({
                              creditDays: event.target.value,
                              dueDate: dueFrom(form.purchaseDate, event.target.value),
                            })
                          }
                        />

                        {/* AGAINST FABRIC SALE CONTRACT */}
                        <select
                          className="h-9 min-w-[210px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          value={form.lines[0]?.fulfillmentContractId || ''}
                          onChange={(event) =>
                            chooseContract(0, 'fulfillmentContractId', event.target.value)
                          }
                        >
                          <option value="">Against Fabric Sale Contract</option>

                          {fabricFulfillmentOptions(form.lines[0] || fabricRow()).map(
                            (contract) => (
                              <option key={contract._id} value={contract._id}>
                                {contract.contractNo} | {contract.itemName}
                              </option>
                            )
                          )}
                        </select>

                        {/* GATE PASS */}
                        <input
                          className="h-9 min-w-[165px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Gate Pass / Challan No."
                          value={form.gatePassNo}
                          onChange={(event) =>
                            patch({
                              gatePassNo: event.target.value,
                            })
                          }
                        />

                        {/* OPTIONAL KG REFERENCE */}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-9 w-[135px] shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Weight KG"
                          title="Weight KG (optional)"
                          value={form.lines[0]?.weightKg || ''}
                          onChange={(event) =>
                            linePatch(0, {
                              weightKg: event.target.value,
                            })
                          }
                        />

                        {/* NOTES */}
                        <input
                          className="h-9 min-w-[170px] flex-[1.2] rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Notes (optional)"
                          value={form.notes}
                          onChange={(event) =>
                            patch({
                              notes: event.target.value,
                            })
                          }
                        />

                        {/* ATTACHMENT ICON */}
                        <div className="relative shrink-0">
                          <label
                            title="Add Files"
                            aria-label="Add Files"
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-teal-300 bg-white text-teal-700 shadow-sm transition hover:bg-teal-50"
                          >
                            <FaPaperclip />

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              multiple
                              className="hidden"
                              onChange={(event) =>
                                patch({
                                  attachments: [
                                    ...form.attachments,
                                    ...Array.from(event.target.files || []),
                                  ].slice(0, 3),
                                })
                              }
                            />
                          </label>

                          {form.attachments.length > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
                              {form.attachments.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {form.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {form.attachments.map((file, index) => (
                            <span
                              key={`${file.name}-${index}`}
                              className="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-md bg-slate-100 px-2 text-[11px] text-slate-600"
                            >
                              <FaFile className="shrink-0 text-teal-600" />

                              <span className="truncate">{file.name}</span>

                              <button
                                type="button"
                                title="Remove File"
                                onClick={() =>
                                  patch({
                                    attachments: form.attachments.filter((_, i) => i !== index),
                                  })
                                }
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <FaTimes />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </section>
            )}

            {/* ADDITIONAL YARN LINES */}
            {kind === 'yarn' && (
              <section className="space-y-2">
                {form.lines.slice(1).map((row, offset) => {
                  const index = offset + 1;

                  const amount = lineAmount(row);

                  const selectedYarn = meta.yarns.find(
                    (yarn) => String(yarn._id) === String(row.yarnId)
                  );

                  const profiles = packageProfilesFor(selectedYarn);

                  const showProduction =
                    row.destinationType === 'direct_sizing' ||
                    form.yarnSource === 'party' ||
                    row.productionContractId;

                  return (
                    <div
                      key={index}
                      className="overflow-visible rounded-lg border border-teal-100 bg-white shadow-sm"
                    >
                      <div className="flex min-h-[38px] items-center justify-between gap-2 border-b border-teal-100 bg-gradient-to-r from-teal-50 via-white to-emerald-50 px-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">
                            Yarn {index + 1}
                          </span>

                          {selectedYarn?.name && (
                            <span className="truncate text-sm font-semibold text-slate-700">
                              {selectedYarn.name}
                            </span>
                          )}

                          {packingSummary(row) && (
                            <span className="hidden rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800 lg:inline">
                              {packingSummary(row)}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          title="Remove Yarn"
                          aria-label="Remove Yarn"
                          onClick={() => removeLine(index)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50"
                        >
                          <FaTrash />
                        </button>
                      </div>

                      <div className="grid gap-x-3 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
                        {form.yarnSource !== 'party' &&
                          contractSelect(
                            row,
                            index,
                            'purchaseContractId',
                            'Purchase Contract',
                            purchaseContractOptions(row)
                          )}

                        <fieldset disabled={Boolean(row.purchaseContractId)} className="min-w-0">
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
                        </fieldset>

                        {field(
                          'Brand Name',
                          <input
                            className={control}
                            placeholder="Brand Name"
                            value={row.brandName || ''}
                            onChange={(event) =>
                              linePatch(index, {
                                brandName: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Package Type',
                          <select
                            className={control}
                            value={row.packageType || 'bag'}
                            onChange={(event) => {
                              const profile =
                                profiles.find((item) => item.packageType === event.target.value) ||
                                {};

                              linePatch(index, {
                                packageType: event.target.value,

                                packageWeight: profile.packageWeight ?? 100,

                                smallConesPerPackage: profile.smallConesPerPackage ?? 40,

                                largeConesPerPackage: profile.largeConesPerPackage ?? 24,
                              });
                            }}
                          >
                            {profiles.map((profile) => (
                              <option key={profile.packageType} value={profile.packageType}>
                                {profile.packageType.replace(/\b\w/g, (letter) =>
                                  letter.toUpperCase()
                                )}
                              </option>
                            ))}
                          </select>
                        )}

                        {field(
                          'Quantity',
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={control}
                            placeholder="Quantity"
                            value={row.packageQty}
                            onChange={(event) =>
                              linePatch(index, {
                                packageQty: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Small Cones',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            placeholder="Small Cones"
                            value={row.smallCones || ''}
                            onChange={(event) =>
                              linePatch(index, {
                                smallCones: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Large Cones',
                          <input
                            type="number"
                            min="0"
                            className={control}
                            placeholder="Large Cones"
                            value={row.largeCones || ''}
                            onChange={(event) =>
                              linePatch(index, {
                                largeCones: event.target.value,
                              })
                            }
                          />
                        )}

                        {field(
                          'Lot / Reference',
                          <input
                            className={control}
                            placeholder="Lot / Reference"
                            value={row.lotReference || ''}
                            onChange={(event) =>
                              linePatch(index, {
                                lotReference: event.target.value,
                              })
                            }
                          />
                        )}

                        <div className="sm:col-span-2 xl:col-span-2">
                          <WeightKgLbsInput
                            kg={row.kg}
                            lbs={row.lbs}
                            onChange={(value) => linePatch(index, value)}
                          />
                        </div>

                        {field(
                          'Rate / LBS',
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            placeholder="Rate / LBS"
                            value={row.rate}
                            onChange={(event) =>
                              linePatch(index, {
                                rate: event.target.value,
                                rateBasis: 'lbs',
                              })
                            }
                          />
                        )}

                        <div className="min-w-0">
                          <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
                            Amount
                          </span>

                          <div className="mt-1 flex h-9 items-center rounded-md border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-3 text-sm font-bold text-teal-950">
                            Rs. {money(amount)}
                          </div>
                        </div>

                        {field(
                          'Destination',
                          <select
                            className={control}
                            value={row.destinationType}
                            onChange={(event) => {
                              const destinationType = event.target.value;

                              linePatch(index, {
                                destinationType,

                                godownId:
                                  destinationType === 'godown' && meta.godowns.length === 1
                                    ? meta.godowns[0]._id
                                    : '',

                                sizingPartyId: '',
                              });
                            }}
                          >
                            <option value="godown">Godown</option>

                            <option value="direct_sizing">Direct Sizing</option>
                          </select>
                        )}

                        <div className="min-w-0">
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
                                onChange={(event) =>
                                  linePatch(index, {
                                    godownId: event.target.value,
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

                        {showProduction &&
                          contractSelect(
                            row,
                            index,
                            'productionContractId',
                            'Production Contract',
                            productionOptions(row)
                          )}

                        {showProduction && !row.productionContractId && (
                          <div className="min-w-0">
                            <SearchableCreatableSelect
                              label="Production Quality"
                              placeholder="Search quality"
                              options={meta.fabrics}
                              value={row.productionFabricQualityId || ''}
                              onChange={(productionFabricQualityId) =>
                                linePatch(index, {
                                  productionFabricQualityId,
                                })
                              }
                            />
                          </div>
                        )}

                        {row.purchaseContractId && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ContractProgress
                              contract={meta.contracts.find(
                                (contract) =>
                                  String(contract._id) === String(row.purchaseContractId)
                              )}
                              currentQuantity={row.kg}
                            />
                          </div>
                        )}

                        {showProduction && (
                          <div className="sm:col-span-2 xl:col-span-4">
                            <WeavingProductionContext
                              context={
                                row.productionContractId
                                  ? meta.contracts.find(
                                      (contract) =>
                                        String(contract._id) === String(row.productionContractId)
                                    )?.productionContext
                                  : {
                                      fabricQualityId: row.productionFabricQualityId,

                                      ownershipType: form.yarnSource === 'party' ? 'party' : 'own',

                                      ownerPartyId: form.yarnSource === 'party' ? form.partyId : '',
                                    }
                              }
                              fabrics={meta.fabrics}
                              parties={meta.parties}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* YARN ACTIONS + MORE DETAIL */}
                <section className="overflow-visible">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={addYarnLine}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-300 bg-white px-3 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
                    >
                      <FaPlus />
                      Add Another Yarn / Contract
                    </button>

                    <button
                      type="button"
                      onClick={() => setMoreDetailsOpen((current) => !current)}
                      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-all ${
                        moreDetailsOpen
                          ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800'
                      }`}
                    >
                      More Detail
                      <FaChevronDown
                        className={`text-xs transition-transform duration-200 ${
                          moreDetailsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {moreDetailsOpen && (
                    <div className="mt-2 rounded-lg border border-teal-100 bg-gradient-to-r from-white via-slate-50/70 to-teal-50/40 p-2 shadow-sm">
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                        {/* DUE DATE */}
                        <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white pl-3">
                          <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
                            Due Date
                          </span>

                          <input
                            type="date"
                            className="h-[34px] w-[145px] border-0 bg-transparent px-2 text-sm text-slate-800 outline-none focus:ring-0"
                            value={form.dueDate}
                            onChange={(event) =>
                              patch({
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </div>

                        {/* CREDIT DAYS */}
                        <input
                          type="number"
                          min="0"
                          className="h-9 w-[110px] shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Credit Days"
                          title="Credit Days"
                          value={form.creditDays}
                          onChange={(event) =>
                            patch({
                              creditDays: event.target.value,
                              dueDate: dueFrom(form.purchaseDate, event.target.value),
                            })
                          }
                        />

                        {/* GATE PASS */}
                        <input
                          className="h-9 min-w-[175px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Gate Pass / Challan No."
                          title="Gate Pass / Challan No."
                          value={form.gatePassNo}
                          onChange={(event) =>
                            patch({
                              gatePassNo: event.target.value,
                            })
                          }
                        />

                        {/* LOT / REFERENCE */}
                        <input
                          className="h-9 min-w-[150px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Lot / Reference"
                          title="Lot / Reference"
                          value={form.lines[0]?.lotReference || ''}
                          onChange={(event) =>
                            linePatch(0, {
                              lotReference: event.target.value,
                            })
                          }
                        />

                        {/* NOTES */}
                        <input
                          className="h-9 min-w-[180px] flex-[1.3] rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                          placeholder="Notes (optional)"
                          title="Notes"
                          value={form.notes}
                          onChange={(event) =>
                            patch({
                              notes: event.target.value,
                            })
                          }
                        />

                        {/* ATTACHMENT - ICON ONLY */}
                        <div className="relative shrink-0">
                          <label
                            title="Add Files"
                            aria-label="Add Files"
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-teal-300 bg-white text-teal-700 shadow-sm transition hover:bg-teal-50 hover:text-teal-900"
                          >
                            <FaPaperclip />

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              multiple
                              className="hidden"
                              onChange={(event) =>
                                patch({
                                  attachments: [
                                    ...form.attachments,
                                    ...Array.from(event.target.files || []),
                                  ].slice(0, 3),
                                })
                              }
                            />
                          </label>

                          {form.attachments.length > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
                              {form.attachments.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* SELECTED ATTACHMENTS */}
                      {form.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {form.attachments.map((file, index) => (
                            <span
                              key={`${file.name}-${index}`}
                              className="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-md bg-slate-100 px-2 text-[11px] text-slate-600"
                            >
                              <FaFile className="shrink-0 text-teal-600" />

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
                                className="shrink-0 text-slate-400 transition hover:text-rose-600"
                              >
                                <FaTimes />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
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

                    <div className="mt-1 text-lg font-bold text-amber-950">
                      Rs. {money(balanceDue)}
                    </div>
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

                  setForm({
                    ...initial(kind),
                    purchaseNo: meta.nextPurchaseNo || '',
                  });

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
          </>
        )}

        {/* PURCHASE LIST */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {listMode && (
            <div className="grid gap-2 border-b p-3 sm:grid-cols-3 lg:grid-cols-6">
              <input
                className={control}
                placeholder="Search purchase or supplier"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
              <select
                className={control}
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              >
                {[
                  ['all', 'All Dates'],
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['thisWeek', 'This Week'],
                  ['lastWeek', 'Last Week'],
                  ['thisMonth', 'This Month'],
                  ['lastMonth', 'Last Month'],
                  ['thisYear', 'This Year'],
                  ['lastYear', 'Last Year'],
                  ['custom', 'Custom Date'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {filters.date === 'custom' && (
                <>
                  <input
                    type="date"
                    className={control}
                    value={filters.from}
                    onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  />
                  <input
                    type="date"
                    className={control}
                    value={filters.to}
                    onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  />
                </>
              )}
              <select
                className={control}
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Payment Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
              </select>
              {!listType && (
                <select
                  className={control}
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                  <option value="">All Types</option>
                  <option value="yarn">Yarn</option>
                  <option value="fabric">Fabric</option>
                  <option value="general">Parts / Other</option>
                </select>
              )}
              <button
                type="button"
                className="rounded-md border px-3 text-sm"
                onClick={() =>
                  setFilters({ search: '', date: 'all', from: '', to: '', status: '', type: '' })
                }
              >
                Clear Filters
              </button>
            </div>
          )}
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-800">
              {listMode
                ? `${listType === 'yarn' ? 'Yarn' : listType === 'fabric' ? 'Fabric' : listType === 'general' ? 'Parts / Other' : 'All'} Purchase List`
                : 'Purchase Invoices'}{' '}
              <span className="ml-2 text-xs font-normal text-slate-500">Recent first</span>
            </h2>
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
                    {!listMode && <th className="px-4 py-3 text-left">Status</th>}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((row) => (
                    <tr
                      key={row._id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        listMode ? beginEdit(row) : setParams({ tab: kind, purchaseId: row._id })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          listMode ? beginEdit(row) : setParams({ tab: kind, purchaseId: row._id });
                        }
                      }}
                      className="cursor-pointer border-t border-slate-100 hover:bg-teal-50"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.purchaseNo}</td>

                      {listMode && <td className="px-4 py-3">{row.purchaseDate}</td>}

                      <td className="px-4 py-3">{row.partyName}</td>

                      {listMode && <td className="px-4 py-3">{row.supplierInvoiceNo || '-'}</td>}

                      <td className="px-4 py-3 capitalize">{row.purchaseType}</td>

                      <td className="px-4 py-3 text-right font-semibold">
                        Rs. {money(row.grandTotal)}
                      </td>
                      {(listMode || !listMode) && (
                        <>
                          {!listMode && <td className="px-4 py-3 capitalize">{row.status}</td>}
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {!listMode && (
                                <button
                                  type="button"
                                  title="View"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setParams({ tab: kind, purchaseId: row._id });
                                  }}
                                  className="rounded-md border p-2 text-slate-600 hover:bg-white"
                                >
                                  <FaEye />
                                </button>
                              )}
                              {canEdit && row.status === 'posted' && (
                                <button
                                  type="button"
                                  title="Edit"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    beginEdit(row);
                                  }}
                                  className="rounded-md border p-2 text-teal-700 hover:bg-white"
                                >
                                  <FaEdit />
                                </button>
                              )}
                              {canVoid && row.status === 'posted' && (
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removePurchase(row);
                                  }}
                                  className="rounded-md border p-2 text-rose-700 hover:bg-rose-50"
                                >
                                  <FaTrash />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
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
            actions={
              <>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FaPrint />
                  Print
                </button>
                {canEdit && purchaseDetail.status === 'posted' && (
                  <button
                    type="button"
                    onClick={() => beginEdit(purchaseDetail)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    <FaEdit />
                    Edit
                  </button>
                )}
                {canVoid && purchaseDetail.status === 'posted' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removePurchase(purchaseDetail)}
                    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <FaTrash />
                    Void
                  </button>
                )}
              </>
            }
            onClose={closePurchaseDetail}
          />
        )}

        {partyContractPicker && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-teal-100 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-teal-100 bg-gradient-to-r from-teal-100 via-cyan-50 to-emerald-50 px-4 py-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {kind === 'fabric'
                      ? 'Select Fabric Purchase Contract'
                      : 'Select Purchase Contract'}
                  </h3>

                  <p className="mt-0.5 text-xs text-slate-500">
                    This Party has more than one open contract.
                  </p>
                </div>

                <button
                  type="button"
                  title="Close"
                  aria-label="Close"
                  onClick={() => setPartyContractPicker(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-800"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {partyContractPicker.contracts.map((contract) => (
                  <button
                    key={contract._id}
                    type="button"
                    onClick={() => {
                      chooseContract(partyContractPicker.index, 'purchaseContractId', contract._id);

                      setPartyContractPicker(null);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal-400 hover:bg-teal-50"
                  >
                    <div className="font-bold text-teal-800">{contract.contractNo}</div>

                    <div className="mt-1 text-sm text-slate-700">
                      {contract.itemName || (kind === 'fabric' ? 'Fabric' : 'Yarn')}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {contract.partyName}

                      {kind === 'yarn' && contract.yarnCount
                        ? ` • Count ${contract.yarnCount}`
                        : ''}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-end border-t border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPartyContractPicker(null)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
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
