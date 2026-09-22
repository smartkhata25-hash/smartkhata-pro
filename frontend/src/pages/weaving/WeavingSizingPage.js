import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaBoxes,
  FaChevronDown,
  FaChevronUp,
  FaFileInvoiceDollar,
  FaIndustry,
  FaListAlt,
  FaRedoAlt,
  FaTruckLoading,
} from 'react-icons/fa';

import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeavingRecordDetailModal from '../../components/weaving/WeavingRecordDetailModal';
import WeightKgLbsInput from '../../components/weaving/WeightKgLbsInput';
import { useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

import {
  createSizingBill,
  createSizingIssue,
  createSizingReceipt,
  createSizingReturn,
  getCommercialMeta,
  getSizingMaterialLedger,
  getSizingMeta,
  getSizingBillById,
  getSizingStock,
} from '../../services/weavingCommercialService';

import { getBusinessDateInputValue } from '../../utils/localDateTime';

const control =
  'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const textarea =
  'mt-1 min-h-[78px] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const today = () => getBusinessDateInputValue();

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;

const dueFrom = (date, days) => {
  if (!date || !Number(days)) return '';

  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days));

  return value.toISOString().slice(0, 10);
};

const Field = ({ label, children, className = '' }) => (
  <label className={`block min-w-0 text-sm font-medium text-slate-700 ${className}`}>
    <span className="block min-h-[20px] leading-5">{label}</span>
    {children}
  </label>
);

const WeavingSizingPage = () => {
  const [params, setParams] = useSearchParams();
  const requestedTab = ['issue', 'receiving', 'stock', 'ledger'].includes(params.get('tab')) ? params.get('tab') : 'issue';
  const [tab, setTab] = useState(requestedTab);

  const [meta, setMeta] = useState({
    parties: [],
    yarns: [],
    godowns: [],
    contracts: [],
    issues: [],
    receipts: [],
  });

  const [commercial, setCommercial] = useState({
    paymentAccounts: [],
  });

  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState(null);
  useWeavingFeedback(notice, setNotice);
  const [saving, setSaving] = useState(false);

  const [packingOpen, setPackingOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [billDetail, setBillDetail] = useState(null);

  const [issue, setIssue] = useState({
    issueNo: '',
    date: today(),

    sizingPartyId: '',
    contractId: '',

    sourceGodownId: '',
    yarnId: '',

    quantityKg: '',
    quantityLbs: '',

    gatePassNo: '',
    lotReference: '',
    notes: '',

    packageType: '',
    packageQty: '',
    coneSize: '',
    conesPerPackage: '',
    extraCones: '',
  });

  const [receipt, setReceipt] = useState({
    receiptNo: '',
    date: today(),

    sizingPartyId: '',
    issueId: '',

    beamCount: '',
    length: '',
    ends: '',

    yarnGrossWeightKg: '',
    gullaWeightKg: '',
    packingWeightKg: '',
    bardanaWeightKg: '',
    netWeightKg: '',

    notes: '',
  });

  const [yarnReturn, setYarnReturn] = useState({
    returnNo: '',
    date: today(),

    sizingPartyId: '',
    yarnId: '',
    destinationGodownId: '',

    returnedKg: '',
    returnedLbs: '',

    packageType: '',
    packageQty: '',

    returnedSmallCones: '',
    returnedLargeCones: '',

    issueId: '',
    lotReference: '',
    notes: '',
  });

  const [bill, setBill] = useState({
    billNo: '',
    billDate: today(),

    sizingPartyId: '',
    receiptId: '',

    billableWeightKg: '',
    ratePerKg: '',
    gstPercent: '',

    creditDays: '',
    dueDate: '',

    paidNow: '',
    paymentMethod: 'cash',
    paymentAccountId: '',

    notes: '',
  });

  const loadMeta = async () => {
    const [sizingMeta, commercialMeta] = await Promise.all([getSizingMeta(), getCommercialMeta()]);

    setMeta(sizingMeta);
    setCommercial(commercialMeta);

    setIssue((value) => ({
      ...value,
      issueNo: value.issueNo || sizingMeta.nextIssueNo || '',
    }));

    setReceipt((value) => ({
      ...value,
      receiptNo: value.receiptNo || sizingMeta.nextReceiptNo || '',
    }));

    setYarnReturn((value) => ({
      ...value,
      returnNo: value.returnNo || sizingMeta.nextReturnNo || '',
    }));

    setBill((value) => ({
      ...value,
      billNo: value.billNo || sizingMeta.nextBillNo || '',
    }));
  };

  const loadRows = async (nextTab = tab) => {
    if (nextTab === 'stock') {
      setRows(await getSizingStock());
      return;
    }

    if (nextTab === 'ledger') {
      setRows(await getSizingMaterialLedger());
      return;
    }

    setRows([]);
  };

  useEffect(() => {
    loadMeta().catch((error) =>
      setNotice({
        error: true,
        text: error.response?.data?.message || 'Could not load Sizing',
      })
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRows(tab).catch(() => setRows([]));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (requestedTab !== tab) setTab(requestedTab);
  }, [requestedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const billId = params.get('billId');
    if (!billId) {
      setBillDetail(null);
      return;
    }
    getSizingBillById(billId)
      .then(setBillDetail)
      .catch((error) => setNotice({ error: true, text: error.response?.status === 404 ? 'Source record is no longer available.' : error.response?.data?.message || 'Could not load Sizing bill' }));
  }, [params]);

  const closeBillDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('billId');
    setParams(next, { replace: true });
    setBillDetail(null);
  };

  const totalCones =
    Number(issue.packageQty || 0) * Number(issue.conesPerPackage || 0) +
    Number(issue.extraCones || 0);

  const gross = Number(bill.billableWeightKg || 0) * Number(bill.ratePerKg || 0);

  const gstAmount = gross * (Number(bill.gstPercent || 0) / 100);

  const billTotal = gross + gstAmount;

  const options = (items, label = 'name') =>
    items.map((row) => (
      <option key={row._id} value={row._id}>
        {row[label] || row.name}
      </option>
    ));

  const selectIssueYarn = (yarnId, yarn) => {
    setIssue((current) => ({
      ...current,

      yarnId,

      packageType: current.packageType || yarn?.defaultPackageType || '',

      conesPerPackage:
        current.coneSize === 'small'
          ? yarn?.smallConesPerPackage || ''
          : current.coneSize === 'large'
            ? yarn?.largeConesPerPackage || ''
            : current.conesPerPackage,
    }));
  };

  const chooseReceiptIssue = (issueId) => {
    const selectedIssue = meta.issues.find((row) => String(row._id) === String(issueId));

    const issuePartyId = selectedIssue?.sizingPartyId?._id || selectedIssue?.sizingPartyId || '';

    const issueYarnId =
      selectedIssue?.lines?.[0]?.yarnId?._id ||
      selectedIssue?.lines?.[0]?.yarnId ||
      selectedIssue?.yarnId?._id ||
      selectedIssue?.yarnId ||
      '';

    setReceipt((current) => ({
      ...current,
      issueId,
      sizingPartyId: current.sizingPartyId || issuePartyId,
    }));

    setYarnReturn((current) => ({
      ...current,
      issueId,
      sizingPartyId: issuePartyId || receipt.sizingPartyId || current.sizingPartyId,
      yarnId: current.yarnId || issueYarnId,
    }));
  };

  const clearReceiving = () => {
    setReturnOpen(false);
    setBillOpen(false);

    setReceipt({
      receiptNo: meta.nextReceiptNo || '',
      date: today(),

      sizingPartyId: '',
      issueId: '',

      beamCount: '',
      length: '',
      ends: '',

      yarnGrossWeightKg: '',
      gullaWeightKg: '',
      packingWeightKg: '',
      bardanaWeightKg: '',
      netWeightKg: '',

      notes: '',
    });

    setYarnReturn({
      returnNo: meta.nextReturnNo || '',
      date: today(),

      sizingPartyId: '',
      yarnId: '',
      destinationGodownId: '',

      returnedKg: '',
      returnedLbs: '',

      packageType: '',
      packageQty: '',

      returnedSmallCones: '',
      returnedLargeCones: '',

      issueId: '',
      lotReference: '',
      notes: '',
    });

    setBill({
      billNo: meta.nextBillNo || '',
      billDate: today(),

      sizingPartyId: '',
      receiptId: '',

      billableWeightKg: '',
      ratePerKg: '',
      gstPercent: '',

      creditDays: '',
      dueDate: '',

      paidNow: '',
      paymentMethod: 'cash',
      paymentAccountId: '',

      notes: '',
    });
  };

  const saveIssue = async () => {
    setSaving(true);
    setNotice(null);

    try {
      await createSizingIssue({
        ...issue,

        lines: [
          {
            yarnId: issue.yarnId,

            quantityKg: issue.quantityKg,
            quantityLbs: issue.quantityLbs,

            packageType: issue.packageType,

            packageQty: issue.packageQty,

            coneSize: issue.coneSize,

            conesPerPackage: issue.conesPerPackage,

            extraCones: issue.extraCones,

            sourceGodownId: issue.sourceGodownId,

            lotReference: issue.lotReference,
          },
        ],
      });

      setNotice({
        text: 'Yarn Issue saved successfully',
      });

      await loadMeta();
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || 'Could not save Yarn Issue',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveReceivingAll = async () => {
    setSaving(true);
    setNotice(null);

    try {
      /*
       * 1. MAIN RECEIVING
       */
      const savedReceipt = await createSizingReceipt({
        ...receipt,
      });

      const savedReceiptId = savedReceipt?._id || savedReceipt?.data?._id || '';

      /*
       * 2. OPTIONAL YARN RETURN
       */
      if (returnOpen) {
        await createSizingReturn({
          ...yarnReturn,

          date: yarnReturn.date || receipt.date,

          sizingPartyId: yarnReturn.sizingPartyId || receipt.sizingPartyId,

          issueId: yarnReturn.issueId || receipt.issueId,
        });
      }

      /*
       * 3. OPTIONAL SIZING BILL
       */
      if (billOpen) {
        await createSizingBill({
          ...bill,

          billDate: bill.billDate || receipt.date,

          sizingPartyId: bill.sizingPartyId || receipt.sizingPartyId,

          receiptId: savedReceiptId || bill.receiptId,

          billableWeightKg:
            bill.billableWeightKg || receipt.netWeightKg || receipt.yarnGrossWeightKg,
        });
      }

      setNotice({
        text:
          returnOpen && billOpen
            ? 'Receiving, Yarn Return and Bill saved successfully'
            : returnOpen
              ? 'Receiving and Yarn Return saved successfully'
              : billOpen
                ? 'Receiving and Bill saved successfully'
                : 'Receiving saved successfully',
      });

      await loadMeta();
      clearReceiving();
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || 'Could not save Sizing Receiving',
      });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    ['issue', 'Yarn Issue', FaTruckLoading],
    ['receiving', 'Sizing Receiving', FaIndustry],
    ['stock', 'Stock at Sizing', FaBoxes],
    ['ledger', 'Material Ledger', FaListAlt],
  ];

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/60 p-3 sm:p-5">
      <div className="mx-auto max-w-[1650px] space-y-4">
        {/* ===================================================
            TOP HEADER
        =================================================== */}
        <header className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-200 to-emerald-100 text-teal-800">
            <FaIndustry className="text-xl" />
          </div>

          <h1 className="mr-auto text-xl font-bold text-slate-900">Sizing</h1>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            {tabs.map(([key, label, Icon]) => (
              <button
                type="button"
                key={key}
                onClick={() => { setTab(key); setParams({ tab: key }); }}
                className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
                  tab === key
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-white hover:text-teal-700'
                }`}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* ===================================================
            YARN ISSUE
        =================================================== */}
        {tab === 'issue' && (
          <section className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-teal-200 bg-gradient-to-r from-teal-200 via-cyan-100 to-emerald-100 px-4 py-3">
              <h2 className="font-bold text-teal-950">Yarn Issue to Sizing</h2>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Issue No.">
                <input
                  className={control}
                  value={issue.issueNo}
                  placeholder="e.g. SI-00001"
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      issueNo: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Date *">
                <input
                  type="date"
                  className={control}
                  value={issue.date}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      date: e.target.value,
                    })
                  }
                />
              </Field>

              <SearchableCreatableSelect
                label="Sizing Party"
                required
                placeholder="Search sizing party"
                options={meta.parties}
                value={issue.sizingPartyId}
                onChange={(sizingPartyId) =>
                  setIssue({
                    ...issue,
                    sizingPartyId,
                  })
                }
              />

              <Field label="Contract">
                <select
                  className={control}
                  value={issue.contractId}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      contractId: e.target.value,
                    })
                  }
                >
                  <option value="">No Contract</option>

                  {options(meta.contracts, 'contractNo')}
                </select>
              </Field>

              <Field label="Source Godown *">
                <select
                  className={control}
                  value={issue.sourceGodownId}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      sourceGodownId: e.target.value,
                    })
                  }
                >
                  <option value="">Select Godown</option>

                  {options(meta.godowns)}
                </select>
              </Field>

              <SearchableCreatableSelect
                label="Yarn"
                required
                placeholder="Search yarn"
                options={meta.yarns}
                value={issue.yarnId}
                onChange={selectIssueYarn}
              />

              <div className="sm:col-span-2">
                <WeightKgLbsInput
                  kg={issue.quantityKg}
                  lbs={issue.quantityLbs}
                  required
                  onChange={({ kg, lbs }) =>
                    setIssue({
                      ...issue,
                      quantityKg: kg,
                      quantityLbs: lbs,
                    })
                  }
                />
              </div>

              <Field label="Gate Pass">
                <input
                  className={control}
                  placeholder="Optional"
                  value={issue.gatePassNo}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      gatePassNo: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Lot / Reference">
                <input
                  className={control}
                  placeholder="Optional"
                  value={issue.lotReference}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      lotReference: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Notes" className="sm:col-span-2">
                <textarea
                  className={textarea}
                  placeholder="Optional note"
                  value={issue.notes}
                  onChange={(e) =>
                    setIssue({
                      ...issue,
                      notes: e.target.value,
                    })
                  }
                />
              </Field>
            </div>

            {/* PACKING DETAILS */}
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setPackingOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-lg border border-teal-200 bg-gradient-to-r from-teal-100 via-cyan-50 to-emerald-100 px-4 py-3 text-left text-sm font-bold text-teal-950 transition hover:from-teal-200 hover:to-emerald-200"
              >
                <span>Packing Details</span>

                {packingOpen ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {packingOpen && (
                <div className="mt-3 grid gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label="Package Type">
                    <select
                      className={control}
                      value={issue.packageType}
                      onChange={(e) =>
                        setIssue({
                          ...issue,
                          packageType: e.target.value,
                        })
                      }
                    >
                      <option value="">None</option>

                      <option value="bag">Bag</option>

                      <option value="carton">Carton</option>
                    </select>
                  </Field>

                  <Field
                    label={
                      issue.packageType === 'bag'
                        ? 'Bags'
                        : issue.packageType === 'carton'
                          ? 'Cartons'
                          : 'Packages'
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      className={control}
                      placeholder="e.g. 10"
                      value={issue.packageQty}
                      onChange={(e) =>
                        setIssue({
                          ...issue,
                          packageQty: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Cone Size">
                    <select
                      className={control}
                      value={issue.coneSize}
                      onChange={(e) => {
                        const coneSize = e.target.value;

                        const yarn = meta.yarns.find(
                          (row) => String(row._id) === String(issue.yarnId)
                        );

                        setIssue({
                          ...issue,

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
                  </Field>

                  <Field label="Cones / Package">
                    <input
                      type="number"
                      min="0"
                      className={control}
                      placeholder="e.g. 15"
                      value={issue.conesPerPackage}
                      onChange={(e) =>
                        setIssue({
                          ...issue,
                          conesPerPackage: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Extra Loose Cones">
                    <input
                      type="number"
                      min="0"
                      className={control}
                      placeholder="e.g. 4"
                      value={issue.extraCones}
                      onChange={(e) =>
                        setIssue({
                          ...issue,
                          extraCones: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <div>
                    <span className="block min-h-[20px] text-sm font-medium leading-5 text-slate-700">
                      Total Cones
                    </span>

                    <div className="mt-1 flex h-10 items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-3">
                      <span className="text-xs text-teal-700">Total</span>

                      <span className="font-bold text-teal-950">{totalCones}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-4 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={saveIssue}
                className="rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:from-teal-700 hover:to-emerald-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </section>
        )}

        {/* ===================================================
            COMBINED SIZING RECEIVING
        =================================================== */}
        {tab === 'receiving' && (
          <section className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* MAIN HEADER */}
            <div className="border-b border-teal-200 bg-gradient-to-r from-teal-200 via-cyan-100 to-emerald-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <FaIndustry className="text-teal-800" />

                <div>
                  <h2 className="font-bold text-teal-950">Sizing Receiving</h2>
                </div>
              </div>
            </div>

            {/* =================================================
                RECEIVING DETAILS
            ================================================= */}
            <div className="border-b border-slate-100">
              <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-2.5">
                <h3 className="font-bold text-slate-800">Receiving Details</h3>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Receipt No.">
                  <input
                    className={control}
                    value={receipt.receiptNo}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        receiptNo: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Date *">
                  <input
                    type="date"
                    className={control}
                    value={receipt.date}
                    onChange={(e) => {
                      const date = e.target.value;

                      setReceipt({
                        ...receipt,
                        date,
                      });

                      setYarnReturn((current) => ({
                        ...current,
                        date,
                      }));

                      setBill((current) => ({
                        ...current,
                        billDate: date,

                        dueDate: dueFrom(date, current.creditDays),
                      }));
                    }}
                  />
                </Field>

                <SearchableCreatableSelect
                  label="Sizing Party"
                  required
                  placeholder="Search sizing party"
                  options={meta.parties}
                  value={receipt.sizingPartyId}
                  onChange={(sizingPartyId) => {
                    setReceipt({
                      ...receipt,
                      sizingPartyId,
                      issueId: '',
                    });

                    setYarnReturn((current) => ({
                      ...current,
                      sizingPartyId,
                      issueId: '',
                    }));

                    setBill((current) => ({
                      ...current,
                      sizingPartyId,
                    }));
                  }}
                />

                <Field label="Issue / Job *">
                  <select
                    className={control}
                    value={receipt.issueId}
                    onChange={(e) => chooseReceiptIssue(e.target.value)}
                  >
                    <option value="">Select Issue / Job</option>

                    {meta.issues
                      .filter((row) => {
                        if (!receipt.sizingPartyId) return true;

                        return (
                          String(row.sizingPartyId?._id || row.sizingPartyId) ===
                          String(receipt.sizingPartyId)
                        );
                      })
                      .map((row) => (
                        <option key={row._id} value={row._id}>
                          {row.issueNo}
                        </option>
                      ))}
                  </select>
                </Field>

                <Field label="Beam Count *">
                  <input
                    type="number"
                    min="0"
                    className={control}
                    placeholder="e.g. 8"
                    value={receipt.beamCount}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        beamCount: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Length">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 13400"
                    value={receipt.length}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        length: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Ends / Taars">
                  <input
                    type="number"
                    min="0"
                    className={control}
                    placeholder="e.g. 6880"
                    value={receipt.ends}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        ends: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Gross Weight KG">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 1684.160"
                    value={receipt.yarnGrossWeightKg}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        yarnGrossWeightKg: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Gulla Weight KG">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 105"
                    value={receipt.gullaWeightKg}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        gullaWeightKg: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Packing Weight KG">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 2"
                    value={receipt.packingWeightKg}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        packingWeightKg: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Bardana Weight KG">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 1"
                    value={receipt.bardanaWeightKg}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        bardanaWeightKg: e.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="Net Weight KG">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className={control}
                    placeholder="e.g. 1576.160"
                    value={receipt.netWeightKg}
                    onChange={(e) => {
                      const value = e.target.value;

                      setReceipt({
                        ...receipt,
                        netWeightKg: value,
                      });

                      if (!bill.billableWeightKg) {
                        setBill((current) => ({
                          ...current,
                          billableWeightKg: value,
                        }));
                      }
                    }}
                  />
                </Field>

                <Field label="Notes" className="sm:col-span-2 xl:col-span-4">
                  <textarea
                    className={textarea}
                    placeholder="Optional receiving note"
                    value={receipt.notes}
                    onChange={(e) =>
                      setReceipt({
                        ...receipt,
                        notes: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            {/* =================================================
                OPTIONAL YARN RETURN
            ================================================= */}
            <div className="border-b border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setReturnOpen((current) => !current)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  returnOpen
                    ? 'border-amber-200 bg-gradient-to-r from-amber-100 via-yellow-50 to-orange-100 text-amber-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-amber-50'
                }`}
              >
                <span className="flex items-center gap-2 font-bold">
                  <FaRedoAlt />
                  Yarn / Material Returned
                  <span className="text-xs font-normal opacity-70">Optional</span>
                </span>

                {returnOpen ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {returnOpen && (
                <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                  <div className="mb-4">
                    <h3 className="font-bold text-slate-800">Returned Yarn Details</h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Yarn, bags or loose cones returned from this Sizing
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Return No.">
                      <input
                        className={control}
                        value={yarnReturn.returnNo}
                        placeholder="e.g. SRN-00001"
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            returnNo: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <SearchableCreatableSelect
                      label="Yarn"
                      required
                      placeholder="Search yarn"
                      options={meta.yarns}
                      value={yarnReturn.yarnId}
                      onChange={(yarnId) =>
                        setYarnReturn({
                          ...yarnReturn,
                          yarnId,
                        })
                      }
                    />

                    <Field label="Destination Godown *">
                      <select
                        className={control}
                        value={yarnReturn.destinationGodownId}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            destinationGodownId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select Godown</option>

                        {options(meta.godowns)}
                      </select>
                    </Field>

                    <Field label="Lot / Reference">
                      <input
                        className={control}
                        placeholder="Optional"
                        value={yarnReturn.lotReference}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            lotReference: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <WeightKgLbsInput
                        kg={yarnReturn.returnedKg}
                        lbs={yarnReturn.returnedLbs}
                        required
                        onChange={({ kg, lbs }) =>
                          setYarnReturn({
                            ...yarnReturn,
                            returnedKg: kg,
                            returnedLbs: lbs,
                          })
                        }
                      />
                    </div>

                    <Field label="Package Type">
                      <select
                        className={control}
                        value={yarnReturn.packageType}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            packageType: e.target.value,
                          })
                        }
                      >
                        <option value="">None</option>

                        <option value="bag">Bag</option>

                        <option value="carton">Carton</option>
                      </select>
                    </Field>

                    <Field
                      label={
                        yarnReturn.packageType === 'bag'
                          ? 'Returned Bags'
                          : yarnReturn.packageType === 'carton'
                            ? 'Returned Cartons'
                            : 'Package Qty'
                      }
                    >
                      <input
                        type="number"
                        min="0"
                        className={control}
                        value={yarnReturn.packageQty}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            packageQty: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Returned Small Cones">
                      <input
                        type="number"
                        min="0"
                        className={control}
                        value={yarnReturn.returnedSmallCones}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            returnedSmallCones: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Returned Large Cones">
                      <input
                        type="number"
                        min="0"
                        className={control}
                        value={yarnReturn.returnedLargeCones}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            returnedLargeCones: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Return Notes" className="sm:col-span-2">
                      <textarea
                        className={textarea}
                        placeholder="Optional return note"
                        value={yarnReturn.notes}
                        onChange={(e) =>
                          setYarnReturn({
                            ...yarnReturn,
                            notes: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* =================================================
                OPTIONAL BILL
            ================================================= */}
            <div className="border-b border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setBillOpen((current) => !current)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  billOpen
                    ? 'border-blue-200 bg-gradient-to-r from-blue-100 via-cyan-50 to-indigo-100 text-blue-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50'
                }`}
              >
                <span className="flex items-center gap-2 font-bold">
                  <FaFileInvoiceDollar />
                  Sizing Bill
                  <span className="text-xs font-normal opacity-70">Optional</span>
                </span>

                {billOpen ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {billOpen && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                  <div className="mb-4">
                    <h3 className="font-bold text-slate-800">Bill Details</h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Bill will remain linked with this Receiving
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Bill No. *">
                      <input
                        className={control}
                        value={bill.billNo}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            billNo: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Bill Date *">
                      <input
                        type="date"
                        className={control}
                        value={bill.billDate}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            billDate: e.target.value,

                            dueDate: dueFrom(e.target.value, bill.creditDays),
                          })
                        }
                      />
                    </Field>

                    <Field label="Weight KG *">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className={control}
                        placeholder="e.g. 1576.160"
                        value={bill.billableWeightKg}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            billableWeightKg: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Rate / KG *">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        placeholder="e.g. 40"
                        value={bill.ratePerKg}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            ratePerKg: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="GST %">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={control}
                        placeholder="e.g. 18"
                        value={bill.gstPercent}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            gstPercent: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <div>
                      <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                        Gross Amount
                      </span>

                      <div className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-800">
                        {money(gross)}
                      </div>
                    </div>

                    <div>
                      <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                        GST Amount
                      </span>

                      <div className="mt-1 flex h-10 items-center rounded-md border border-blue-100 bg-blue-50 px-3 font-bold text-blue-900">
                        {money(gstAmount)}
                      </div>
                    </div>

                    <div>
                      <span className="block min-h-[20px] text-sm font-medium text-slate-700">
                        Bill Total
                      </span>

                      <div className="mt-1 flex h-10 items-center rounded-md border border-teal-200 bg-teal-50 px-3 font-bold text-teal-950">
                        {money(billTotal)}
                      </div>
                    </div>

                    <Field label="Credit Days">
                      <input
                        type="number"
                        min="0"
                        className={control}
                        placeholder="e.g. 30"
                        value={bill.creditDays}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            creditDays: e.target.value,

                            dueDate: dueFrom(bill.billDate, e.target.value),
                          })
                        }
                      />
                    </Field>

                    <Field label="Due Date">
                      <input
                        type="date"
                        className={control}
                        value={bill.dueDate}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            dueDate: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Paid Now">
                      <input
                        type="number"
                        min="0"
                        className={control}
                        placeholder="Optional"
                        value={bill.paidNow}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            paidNow: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Payment Method">
                      <select
                        className={control}
                        value={bill.paymentMethod}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            paymentMethod: e.target.value,
                          })
                        }
                      >
                        <option value="cash">Cash</option>

                        <option value="bank">Bank</option>

                        <option value="online">Online</option>

                        <option value="cheque">Cheque</option>
                      </select>
                    </Field>

                    <Field label="Payment Account">
                      <select
                        className={control}
                        value={bill.paymentAccountId}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            paymentAccountId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select Account</option>

                        {options(commercial.paymentAccounts)}
                      </select>
                    </Field>

                    <Field label="Bill Notes" className="sm:col-span-2 xl:col-span-4">
                      <textarea
                        className={textarea}
                        placeholder="Optional bill note"
                        value={bill.notes}
                        onChange={(e) =>
                          setBill({
                            ...bill,
                            notes: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* =================================================
                ONE SAVE FOR COMPLETE RECEIVING
            ================================================= */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-teal-50/50 px-4 py-4">
              <div className="text-sm text-slate-500">
                {returnOpen || billOpen ? (
                  <>
                    Saving will create <strong className="text-slate-700">Receiving</strong>
                    {returnOpen && (
                      <>
                        {' + '}
                        <strong className="text-amber-700">Yarn Return</strong>
                      </>
                    )}
                    {billOpen && (
                      <>
                        {' + '}
                        <strong className="text-blue-700">Sizing Bill</strong>
                      </>
                    )}
                  </>
                ) : (
                  'Only Receiving will be saved'
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearReceiving}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveReceivingAll}
                  className="rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md transition hover:from-teal-700 hover:to-emerald-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Receiving'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================
            STOCK AT SIZING
        =================================================== */}
        {tab === 'stock' && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-teal-200 bg-gradient-to-r from-teal-200 via-cyan-100 to-emerald-100 px-4 py-3">
              <h2 className="font-bold text-teal-950">Stock at Sizing</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    {[
                      'Sizing Party',
                      'Yarn',
                      'Ownership',
                      'Owner',
                      'Balance KG',
                      'Packages',
                      'Small Cones',
                      'Large Cones',
                    ].map((head) => (
                      <th
                        key={head}
                        className="whitespace-nowrap border border-slate-200 px-4 py-3 text-center"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="hover:bg-teal-50/40">
                      <td className="border border-slate-200 px-4 py-3">
                        {row.sizingParty?.name || '-'}
                      </td>

                      <td className="border border-slate-200 px-4 py-3">{row.yarn?.name || '-'}</td>

                      <td className="border border-slate-200 px-4 py-3 text-center">
                        {row.ownershipType || '-'}
                      </td>

                      <td className="border border-slate-200 px-4 py-3">
                        {row.owner?.name || '-'}
                      </td>

                      <td className="border border-slate-200 px-4 py-3 text-right font-bold">
                        {row.balanceKg ?? 0}
                      </td>

                      <td className="border border-slate-200 px-4 py-3 text-right font-semibold">
                        {row.balancePackages ?? row.packageBalance ?? 0}
                      </td>

                      <td className="border border-slate-200 px-4 py-3 text-right">
                        {row.balanceSmallCones ?? row.smallConeBalance ?? 0}
                      </td>

                      <td className="border border-slate-200 px-4 py-3 text-right">
                        {row.balanceLargeCones ?? row.largeConeBalance ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!rows.length && (
                <div className="p-10 text-center text-sm text-slate-400">No records found</div>
              )}
            </div>
          </section>
        )}

        {/* ===================================================
            MATERIAL LEDGER
        =================================================== */}
        {tab === 'ledger' && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-teal-200 bg-gradient-to-r from-teal-200 via-cyan-100 to-emerald-100 px-4 py-3">
              <h2 className="font-bold text-teal-950">Material Ledger</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    {[
                      'Date',
                      'Movement',
                      'Sizing Party',
                      'Yarn',
                      'In KG',
                      'Out KG',
                      'Pkg In',
                      'Pkg Out',
                      'Small In',
                      'Small Out',
                      'Large In',
                      'Large Out',
                      'Balance KG',
                      'Contract',
                    ].map((head) => (
                      <th
                        key={head}
                        className="whitespace-nowrap border border-slate-200 px-3 py-3 text-center"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row._id || index} className="hover:bg-teal-50/40">
                      <td className="whitespace-nowrap border border-slate-200 px-3 py-3">
                        {row.date}
                      </td>

                      <td className="whitespace-nowrap border border-slate-200 px-3 py-3">
                        {row.movementLabel}
                      </td>

                      <td className="border border-slate-200 px-3 py-3">
                        {row.sizingPartyId?.name || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3">
                        {row.yarnId?.name || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right font-semibold text-emerald-700">
                        {row.inKg || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right font-semibold text-rose-700">
                        {row.outKg || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.packageIn || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.packageOut || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.smallConesIn || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.smallConesOut || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.largeConesIn || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right">
                        {row.largeConesOut || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right font-bold">
                        {row.balanceKg ?? '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3">
                        {row.contractId?.contractNo || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!rows.length && (
                <div className="p-10 text-center text-sm text-slate-400">No records found</div>
              )}
            </div>
          </section>
        )}
        {billDetail && (
          <WeavingRecordDetailModal
            title={`Sizing Bill ${billDetail.billNo}`}
            fields={[
              ['Bill Date', billDetail.billDate],
              ['Sizing Party', billDetail.sizingPartyId?.name],
              ['Linked Receipt', billDetail.receiptId?.receiptNo],
              ['Billable KG', billDetail.billableWeightKg],
              ['Rate / KG', money(billDetail.ratePerKg)],
              ['Gross Amount', money(billDetail.grossAmount)],
              ['GST', `${billDetail.gstPercent || 0}% (${money(billDetail.gstAmount)})`],
              ['Total', money(billDetail.billAmount)],
              ['Paid', money(billDetail.paidAmount)],
              ['Balance', money(billDetail.balanceDue)],
              ['Payment Status', billDetail.paymentStatus],
              ['Due Date', billDetail.dueDate],
              ['Document Status', billDetail.status],
              ['Notes', billDetail.notes],
            ]}
            onClose={closeBillDetail}
          />
        )}
      </div>
    </div>
  );
};

export default WeavingSizingPage;
