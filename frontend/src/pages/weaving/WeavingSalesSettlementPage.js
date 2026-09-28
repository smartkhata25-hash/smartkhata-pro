import React, { useCallback, useEffect, useMemo, useState } from 'react';
import WeavingSaleSaveOutput, { useSaleSaveOutput, savedSaleOutputUrl } from '../../components/weaving/WeavingSaleSaveOutput';
import { useSearchParams } from 'react-router-dom';
import {
  FaDownload,
  FaEdit,
  FaEye,
  FaFileInvoiceDollar,
  FaPlus,
  FaPrint,
  FaTimes,
  FaTrashAlt,
  FaUndo,
} from 'react-icons/fa';

import SearchableCreatableSelect from '../../components/weaving/SearchableCreatableSelect';
import WeavingDirectSaleModal from '../../components/weaving/WeavingDirectSaleModal';
import WeavingPostedSaleEditModal from '../../components/weaving/WeavingPostedSaleEditModal';

import {
  requestWeavingConfirmation,
  useWeavingFeedback,
} from '../../components/weaving/WeavingFeedbackModal';

import {
  confirmDirectSale,
  createKacchiParchi,
  confirmPakkiInvoice,
  updatePakkiSettlement,
  getSalesInvoiceById,
  getSalesWorkspace,
  parchiOutputUrl,
  receiveRejection,
  reverseRejectionReceipt,
  salesInvoiceOutputUrl,
  updateKacchiParchi,
  voidKacchiParchi,
  voidPakkiSettlement,
  voidSalesInvoice,
  updateSalesInvoiceDraft,
} from '../../services/weavingSalesService';

import WeavingSalePaymentSection, {
  paymentError,
  paymentReceived,
  confirmExcessPayment,
} from '../../components/weaving/WeavingSalePaymentSection';

import { t, getCurrentLanguage } from '../../i18n/i18n';
import { getBusinessDateInputValue } from '../../utils/localDateTime';
import { hasPermission } from '../../utils/permissionHelper';

const input =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100';

const today = () => getBusinessDateInputValue();

const key = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const money = (value) =>
  Number(value || 0).toLocaleString('en-PK', {
    maximumFractionDigits: 2,
  });

const Field = ({ label, children, className = '' }) => (
  <label className={`block text-sm font-medium text-slate-700 ${className}`}>
    <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
    {children}
  </label>
);

const Button = ({ children, tone = 'teal', className = '', ...props }) => (
  <button
    type="button"
    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
      tone === 'teal'
        ? 'bg-teal-700 text-white hover:bg-teal-800'
        : tone === 'danger'
          ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    } ${className}`}
    {...props}
  >
    {children}
  </button>
);

const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-2 sm:p-3">
    <section
      className={`max-h-[95vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${
        wide ? 'max-w-6xl' : 'max-w-4xl'
      }`}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>

        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <FaTimes />
        </button>
      </header>

      {children}
    </section>
  </div>
);

const Empty = () => (
  <div className="p-10 text-center text-sm text-slate-500">{t('weaving.sales.noRecords')}</div>
);

const Status = ({ value, payment = false }) => {
  const tone =
    value === 'paid' || value === 'posted' || value === 'pakki_finalized'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === 'partial'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : value === 'void' || value === 'reversed'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : payment
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase ${tone}`}
    >
      {t(`weaving.salesPro.status_${value || 'unknown'}`)}
    </span>
  );
};

const Table = ({ headers, rows, render, onView }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm [&_td]:border-r [&_td]:border-slate-200 [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-slate-700 [&_th:last-child]:border-r-0">
        <thead className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-start text-[11px] uppercase tracking-wide text-white">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-3.5 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => {
            const element = render(row);

            const rowClass = `${element.props.className || ''} ${
              index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
            } border-b border-slate-200 transition-colors hover:bg-teal-50/70`;

            if (!onView) {
              return React.cloneElement(element, {
                className: rowClass,
              });
            }

            return React.cloneElement(element, {
              className: rowClass,
              role: 'button',
              tabIndex: 0,

              onClick: (event) => {
                if (!event.target.closest('button, a, input, select')) {
                  onView(row);
                }
              },

              onKeyDown: (event) => {
                if (event.target === event.currentTarget && event.key === 'Enter') {
                  onView(row);
                }
              },
            });
          })}
        </tbody>
      </table>

      {!rows.length && <Empty />}
    </div>
  </section>
);

export default function WeavingSalesSettlementPage() {
  const [params, setParams] = useSearchParams();

  const requestedTab = ['kacchi', 'pakki', 'invoices', 'fabric', 'yarn', 'other'].includes(
    params.get('tab')
  )
    ? params.get('tab')
    : ['ready', 'pending', 'receipts'].includes(params.get('tab'))
      ? 'pakki'
      : 'invoices';

  const [data, setData] = useState({
    kacchis: [],
    pakkis: [],
    ready: [],
    invoices: [],
    pending: [],
    receipts: [],

    meta: {
      parties: [],
      contracts: [],
      qualities: [],
      yarns: [],
      godowns: [],
      paymentAccounts: [],
      availableThans: [],
      fabricStock: [],
      yarnStock: [],
    },

    metrics: {},
  });

  const [tab, setTab] = useState(requestedTab);
  const [modal, setModal] = useState(null);
  const [formReset, setFormReset] = useState(0);

  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');

  const [showReceipts, setShowReceipts] = useState(params.get('tab') === 'receipts');

  const [notice, setNotice] = useState(null);

  useWeavingFeedback(notice, setNotice);

  const can = useMemo(
    () => ({
      create: hasPermission('weaving.sales.create'),
      edit: hasPermission('weaving.sales.edit'),
      post: hasPermission('weaving.sales.post'),
      void: hasPermission('weaving.sales.void'),
      print: hasPermission('weaving.sales.print'),

      receive: hasPermission('weaving.rejection_return.receive'),

      reverse: hasPermission('weaving.rejection_return.reverse'),
    }),
    []
  );

  useEffect(() => {
    if (requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const action = params.get('new');

    if (!can.create || !action) return;

    if (action === 'kacchi') {
      setModal({ type: 'kacchi' });
    } else if (action === 'pakki' && can.post) {
      setModal({ type: 'pakki' });
    } else if (can.post && ['fabric', 'yarn', 'other', 'direct'].includes(action)) {
      setModal({
        type: 'direct',
        kind: action === 'direct' ? 'fabric' : action,
      });
    }

    const next = new URLSearchParams(params);

    next.delete('new');

    setParams(next, {
      replace: true,
    });
  }, [can.create, can.post, params, setParams]);

  const load = useCallback(async () => {
    try {
      setData(await getSalesWorkspace());
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || t('weaving.sales.loadFailed'),
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const invoiceId = params.get('invoiceId');

    if (!invoiceId) return;

    getSalesInvoiceById(invoiceId)
      .then((row) => {
        setTab('invoices');

        setModal({
          type: 'invoice',
          row,
        });
      })
      .catch((error) =>
        setNotice({
          error: true,

          text:
            error.response?.status === 404
              ? 'Source record is no longer available.'
              : error.response?.data?.message || 'Could not load Invoice',
        })
      );
  }, [params]);

  const openInvoice = async (row) => {
    try {
      const full = await getSalesInvoiceById(row._id);

      setModal({
        type: 'invoice',
        row: full,
      });
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || t('weaving.sales.loadFailed'),
      });
    }
  };

  const pakkiFor = (row) =>
    data.pakkis.find((pakki) => String(pakki._id) === String(row.sourcePakkiId || row.pakkiId));

  const editInvoice = (row) =>
    row.saleSource === 'pakki'
      ? setModal({
          type: 'pakki',
          current: row.pakki || pakkiFor(row),
          invoice: row,
        })
      : setModal({
          type: 'direct-edit',
          row,
        });

  const closeInvoice = () => {
    setModal(null);

    const next = new URLSearchParams(params);

    next.delete('invoiceId');

    setParams(next, {
      replace: true,
    });
  };

  const act = async (work) => {
    setSaving(true);

    try {
      const result = await work();

      await load();

      return result;
    } catch (error) {
      setNotice({
        error: true,
        text: error.response?.data?.message || t('weaving.sales.saveFailed'),
      });

      return null;
    } finally {
      setSaving(false);
    }
  };

  const openOutput = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  const tabs = [
    ['invoices', t('weaving.salesPro.allSales')],
    ['kacchi', t('weaving.salesPro.kacchiList')],
    ['pakki', t('weaving.salesPro.pakkiList')],
    ['fabric', t('weaving.sales.fabricSale')],
    ['yarn', t('weaving.sales.yarnSale')],
    ['other', t('weaving.sales.otherSale')],
  ];

  const matches = (row) =>
    (!search ||
      [
        row.invoiceNo,
        row.pakkiNo,
        row.kacchiNo,
        row.partyName,
        row.partyId?.name,
        row.contractId?.contractNo,
        row.qualitySnapshot?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase())) &&
    (!date || (row.invoiceDate || row.pakkiDate || row.dispatchDate) === date) &&
    (!status || row.paymentStatus === status || row.status === status);

  const visibleInvoices = data.invoices.filter(
    (row) =>
      ['posted', 'void', 'draft'].includes(row.status) &&
      (tab === 'invoices' || (row.saleSource === 'direct' && row.saleNature === tab)) &&
      matches(row)
  );

  const outputInvoice = (row, format) => {
    const pakki = pakkiFor(row);

    openOutput(
      pakki ? parchiOutputUrl('pakki', pakki._id, format) : salesInvoiceOutputUrl(row._id, format)
    );
  };

  const pendingKacchi = (data.meta.pendingKacchis || data.kacchis).filter(
    (row) => row.status === 'confirmed'
  ).length;

  return (
    <div
      dir={getCurrentLanguage() === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-full bg-gradient-to-br from-slate-50 via-white to-teal-50/40 p-3 sm:p-4"
    >
      <div className="mx-auto max-w-[1750px] space-y-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-[180px] items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
                <FaFileInvoiceDollar />
              </div>

              <h1 className="text-2xl font-black text-slate-900">
                {getCurrentLanguage() === 'ur' ? 'سیلز' : 'Sales'}
              </h1>
            </div>

            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                tone="amber"
                label={t('weaving.salesPro.pendingKacchi')}
                value={pendingKacchi}
              />

              <Metric
                tone="emerald"
                label={t('weaving.sales.periodSales')}
                value={`Rs. ${money(data.metrics.salesAmount)}`}
              />

              <Metric
                tone="rose"
                label={t('weaving.sales.pendingMeter')}
                value={`${money(data.metrics.pendingRejectionMeter)} M`}
              />

              <Metric
                tone="cyan"
                label={t('weaving.sales.recovered')}
                value={`${money(data.metrics.recoveredRejectionMeter)} M`}
              />
            </div>
          </div>
        </section>

        {can.create && (
          <div className="overflow-x-auto rounded-xl border border-teal-800 bg-gradient-to-r from-teal-800 via-teal-700 to-cyan-700 shadow-sm">
            <div className="flex min-w-[950px] divide-x divide-white/20">
              {[
                ['kacchi', 'kacchi'],
                ['pakki', 'pakkiFinal'],
                ['fabric', 'fabricSale'],
                ['yarn', 'yarnSale'],
                ['other', 'otherSale'],
              ].map(([kind, label]) => (
                <button
                  type="button"
                  key={kind}
                  disabled={kind !== 'kacchi' && !can.post}
                  onClick={() =>
                    setModal({
                      type: ['kacchi', 'pakki'].includes(kind) ? kind : 'direct',

                      kind,
                    })
                  }
                  className="group flex h-12 flex-1 items-center justify-center gap-2 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 group-hover:bg-white/25">
                    <FaPlus className="text-xs" />
                  </span>

                  {t(
                    label === 'pakkiFinal'
                      ? 'weaving.salesPro.pakkiFinal'
                      : `weaving.sales.${label}`
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex overflow-x-auto bg-slate-900 p-1.5">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setParams({
                    tab: value,
                  });

                  setTab(value);
                }}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
                  tab === value
                    ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 border-t border-slate-200 bg-gradient-to-r from-white to-teal-50/50 p-2.5 sm:grid-cols-3">
            <input
              className={input}
              aria-label={t('weaving.salesPro.search')}
              placeholder={t('weaving.salesPro.search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <input
              type="date"
              aria-label={t('weaving.sales.date')}
              className={input}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />

            <select
              aria-label={t('weaving.sales.status')}
              className={input}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t('weaving.salesPro.allStatuses')}</option>

              {['paid', 'partial', 'unpaid', 'void'].map((value) => (
                <option key={value} value={value}>
                  {t(`weaving.salesPro.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {tab === 'kacchi' && (
          <Table
            headers={[
              t('weaving.sales.date'),
              t('weaving.sales.kacchiNo'),
              t('weaving.sales.party'),
              t('weaving.sales.quality'),
              'Than',
              'Meter',
              'KG',
              t('weaving.sales.status'),
              t('weaving.sales.actions'),
            ]}
            rows={data.kacchis.filter(matches)}
            onView={(row) =>
              setModal({
                type: 'kacchi-view',
                row,
              })
            }
            render={(row) => (
              <tr key={row._id}>
                <td className="px-3 py-3">{row.dispatchDate}</td>

                <td className="px-3 py-3 font-bold text-slate-900">{row.kacchiNo}</td>

                <td className="px-3 py-3">{row.partyId?.name}</td>

                <td className="px-3 py-3">
                  {row.fabricQualityId?.name || row.qualitySnapshot?.name}
                </td>

                <td className="px-3 py-3 text-center">{money(row.totalThan)}</td>

                <td className="px-3 py-3 text-center">{money(row.totalMeter)}</td>

                <td className="px-3 py-3 text-center">{money(row.totalKg)}</td>

                <td className="px-3 py-3">
                  <Status value={row.status} />
                </td>

                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      tone="light"
                      onClick={() =>
                        setModal({
                          type: 'kacchi-view',
                          row,
                        })
                      }
                    >
                      {t('weaving.sales.view')}
                    </Button>

                    {can.edit && row.status !== 'void' && (
                      <Button
                        tone="light"
                        onClick={() =>
                          row.status === 'confirmed'
                            ? setModal({
                                type: 'kacchi',
                                row,
                              })
                            : setNotice({
                                error: true,
                                text: t('weaving.salesCleanup.kacchiLinked'),
                              })
                        }
                      >
                        <FaEdit />
                      </Button>
                    )}

                    {can.create && can.post && row.status === 'confirmed' && (
                      <Button
                        onClick={() =>
                          setModal({
                            type: 'pakki',
                            row,
                          })
                        }
                      >
                        {t('weaving.sales.makePakki')}
                      </Button>
                    )}

                    {can.print && <KacchiOutputOptions row={row} onOpen={openOutput} />}

                    {can.void && row.status === 'confirmed' && (
                      <Button
                        tone="danger"
                        onClick={async () => {
                          const reason = await requestWeavingConfirmation({
                            message: t('weaving.sales.voidReason'),

                            inputLabel: t('weaving.sales.voidReason'),

                            inputRequired: true,
                          });

                          if (reason) {
                            act(() => voidKacchiParchi(row._id, reason));
                          }
                        }}
                      >
                        {t('weaving.sales.void')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          />
        )}

        {tab === 'pakki' && (
          <>
            <div className="flex justify-end">
              <Button tone="light" onClick={() => setShowReceipts(!showReceipts)}>
                {t('weaving.sales.receipts')}
              </Button>
            </div>

            <Table
              headers={[
                t('weaving.sales.date'),
                t('weaving.salesPro.pakkiFinal'),
                t('weaving.sales.party'),
                t('weaving.sales.billableMeter'),
                t('weaving.salesPro.finalAmount'),
                t('weaving.salesPro.balance'),
                t('weaving.salesPro.returnPending'),
                t('weaving.sales.actions'),
              ]}
              rows={data.pakkis.filter(matches)}
              onView={async (row) =>
                row.invoiceId
                  ? openInvoice({
                      _id: row.invoiceId._id || row.invoiceId,
                    })
                  : setModal({
                      type: 'pakki-view',
                      row,
                    })
              }
              render={(row) => {
                const due = data.pending.find(
                  (item) => String(item.pakkiId?._id || item.pakkiId) === String(row._id)
                );

                return (
                  <tr key={row._id}>
                    <td className="px-3 py-3">{row.pakkiDate}</td>

                    <td className="px-3 py-3">
                      <b className="text-slate-900">{row.pakkiNo}</b>

                      <div className="text-xs text-slate-500">{row.kacchiReference}</div>
                    </td>

                    <td className="px-3 py-3">{row.partyId?.name}</td>

                    <td className="px-3 py-3 text-center">{money(row.billableMeter)} M</td>

                    <td className="px-3 py-3 font-bold">
                      Rs. {money(row.invoiceId?.grandTotal ?? row.settlementAmount)}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-bold text-amber-700">
                        Rs. {money(row.invoiceId?.balanceDue ?? row.settlementAmount)}
                      </div>

                      <div className="mt-1">
                        <Status
                          value={
                            row.status === 'void'
                              ? 'void'
                              : row.invoiceId?.paymentStatus || 'unpaid'
                          }
                          payment
                        />
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {due ? (
                        <>
                          <b className="text-amber-700">{money(due.pendingMeter)} M</b>

                          {can.receive && (
                            <div className="mt-1">
                              <Button
                                tone="light"
                                onClick={() =>
                                  setModal({
                                    type: 'receive',
                                    row: due,
                                  })
                                }
                              >
                                {t('weaving.sales.receiveRejection')}
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {row.invoiceId && can.edit && row.status === 'finalized' && (
                          <Button
                            tone="light"
                            onClick={async () => {
                              try {
                                const invoice = await getSalesInvoiceById(
                                  row.invoiceId._id || row.invoiceId
                                );

                                setModal({
                                  type: 'pakki',
                                  current: row,
                                  invoice,
                                });
                              } catch {
                                setNotice({
                                  error: true,
                                  text: t('weaving.sales.loadFailed'),
                                });
                              }
                            }}
                          >
                            <FaEdit />
                          </Button>
                        )}

                        {row.invoiceId && (
                          <Button
                            tone="light"
                            onClick={async () => {
                              try {
                                setModal({
                                  type: 'invoice',

                                  row: await getSalesInvoiceById(
                                    row.invoiceId._id || row.invoiceId
                                  ),
                                });
                              } catch {
                                setNotice({
                                  error: true,
                                  text: t('weaving.sales.loadFailed'),
                                });
                              }
                            }}
                          >
                            {t('weaving.sales.view')}
                          </Button>
                        )}

                        {!row.invoiceId && row.status === 'finalized' && can.create && can.post && (
                          <Button
                            onClick={() =>
                              setModal({
                                type: 'pakki',

                                row: data.kacchis.find(
                                  (kacchi) =>
                                    String(kacchi._id) ===
                                    String(row.kacchiId || row.sourceKacchiId)
                                ),
                              })
                            }
                          >
                            {t('weaving.salesPro.confirmPakki')}
                          </Button>
                        )}

                        {can.print && (
                          <>
                            <Button
                              tone="light"
                              onClick={() => openOutput(parchiOutputUrl('pakki', row._id, 'print'))}
                            >
                              <FaPrint />
                            </Button>

                            <Button
                              tone="light"
                              onClick={() => openOutput(parchiOutputUrl('pakki', row._id, 'pdf'))}
                            >
                              <FaDownload />
                            </Button>
                          </>
                        )}

                        {can.void && !row.invoiceId && row.status === 'finalized' && (
                          <Button
                            tone="danger"
                            onClick={async () => {
                              const reason = await requestWeavingConfirmation({
                                message: t('weaving.sales.pakkiVoidReason'),

                                inputLabel: t('weaving.sales.pakkiVoidReason'),

                                inputRequired: true,
                              });

                              if (reason) {
                                act(() => voidPakkiSettlement(row._id, reason));
                              }
                            }}
                          >
                            {t('weaving.sales.void')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          </>
        )}

        {['invoices', 'fabric', 'yarn', 'other'].includes(tab) && (
          <Table
            headers={[
              'Invoice No.',
              'Date',
              'Party',
              'Type',
              'Qty',
              'Amount',
              'R.Amount',
              'Balance',
              'Payment',
              'Actions',
            ]}
            rows={visibleInvoices}
            render={(row) => {
              const shortDate = row.invoiceDate
                ? row.invoiceDate.split('-').slice(1).reverse().join('-')
                : '—';

              const saleType =
                row.saleNature === 'fabric'
                  ? 'Fabric'
                  : row.saleNature === 'yarn'
                    ? 'Yarn'
                    : row.saleNature === 'other'
                      ? 'Waste'
                      : row.saleNature === 'conversion'
                        ? 'Pakki'
                        : row.saleNature || '—';

              const unit = row.uom === 'Meter' ? 'M' : row.uom === 'KG' ? 'KG' : row.uom;

              return (
                <tr
                  key={row._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openInvoice(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openInvoice(row);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-900">
                    {pakkiFor(row)?.pakkiNo || row.invoiceNo}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-center">{shortDate}</td>

                  <td className="whitespace-nowrap px-3 py-2">{row.partyName}</td>

                  <td className="whitespace-nowrap px-3 py-2 font-medium">{saleType}</td>

                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {row.accountingOnly && row.uom === 'Job'
                      ? '—'
                      : `${money(row.quantity)} ${unit}`}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-center font-bold">
                    {money(row.grandTotal)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-center font-bold text-emerald-700">
                    {money(row.paidAmount)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-center font-bold text-amber-700">
                    {money(row.balanceDue)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    <Status value={row.paymentStatus} payment />
                  </td>

                  <td className="whitespace-nowrap px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        tone="light"
                        className="!h-8 !w-8 !p-0"
                        title="View"
                        aria-label="View"
                        onClick={(event) => {
                          event.stopPropagation();
                          openInvoice(row);
                        }}
                      >
                        <FaEye />
                      </Button>

                      {can.edit && row.status === 'posted' && (
                        <Button
                          tone="light"
                          className="!h-8 !w-8 !p-0"
                          title="Edit"
                          aria-label="Edit"
                          onClick={async (event) => {
                            event.stopPropagation();

                            try {
                              editInvoice(await getSalesInvoiceById(row._id));
                            } catch {
                              setNotice({
                                error: true,
                                text: t('weaving.sales.loadFailed'),
                              });
                            }
                          }}
                        >
                          <FaEdit />
                        </Button>
                      )}

                      {can.print && (
                        <>
                          <Button
                            tone="light"
                            className="!h-8 !w-8 !p-0"
                            title="Print"
                            aria-label="Print"
                            onClick={(event) => {
                              event.stopPropagation();
                              outputInvoice(row, 'print');
                            }}
                          >
                            <FaPrint />
                          </Button>

                          <Button
                            tone="light"
                            className="!h-8 !w-8 !p-0"
                            title="PDF"
                            aria-label="PDF"
                            onClick={(event) => {
                              event.stopPropagation();
                              outputInvoice(row, 'pdf');
                            }}
                          >
                            <FaDownload />
                          </Button>
                        </>
                      )}

                      {can.void && row.status === 'posted' && row.paidAmount <= 0 && (
                        <Button
                          tone="danger"
                          className="!h-8 !w-8 !p-0"
                          title="Void"
                          aria-label="Void"
                          onClick={async (event) => {
                            event.stopPropagation();

                            const reason = await requestWeavingConfirmation({
                              message: t('weaving.sales.voidReason'),
                              inputLabel: t('weaving.sales.voidReason'),
                              inputRequired: true,
                            });

                            if (reason) {
                              act(() => voidSalesInvoice(row._id, reason));
                            }
                          }}
                        >
                          <FaTrashAlt />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }}
          />
        )}
        {tab === 'pakki' && showReceipts && (
          <Table
            headers={[
              t('weaving.sales.receiptDate'),
              t('weaving.sales.party'),
              t('weaving.sales.quality'),
              'Meter',
              'KG',
              'Pieces',
              t('weaving.sales.status'),
              t('weaving.sales.actions'),
            ]}
            rows={data.receipts}
            onView={(row) =>
              setModal({
                type: 'receipt-view',
                row,
              })
            }
            render={(row) => (
              <tr key={row._id}>
                <td className="px-3 py-3">{row.receiptDate}</td>

                <td className="px-3 py-3">{row.partyId?.name}</td>

                <td className="px-3 py-3">{row.fabricQualityId?.name}</td>

                <td className="px-3 py-3 text-center">{money(row.receivedMeter)}</td>

                <td className="px-3 py-3 text-center">{money(row.receivedKg)}</td>

                <td className="px-3 py-3 text-center">{money(row.pieceCount)}</td>

                <td className="px-3 py-3">
                  <Status value={row.status} />
                </td>

                <td className="px-3 py-2">
                  {can.reverse && row.status === 'posted' && (
                    <Button
                      tone="danger"
                      onClick={async () => {
                        const reason = await requestWeavingConfirmation({
                          message: t('weaving.sales.reversalReason'),

                          inputLabel: t('weaving.sales.reversalReason'),

                          inputRequired: true,
                        });

                        if (reason) {
                          act(() => reverseRejectionReceipt(row._id, reason));
                        }
                      }}
                    >
                      <FaUndo />

                      {t('weaving.sales.reverse')}
                    </Button>
                  )}
                </td>
              </tr>
            )}
          />
        )}
      </div>

      {modal?.type === 'kacchi' && (
        <KacchiModal
          key={formReset}
          onReset={() => setFormReset((value) => value + 1)}
          meta={data.meta}
          current={modal.row}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(form) =>
            act(() =>
              modal.row ? updateKacchiParchi(modal.row._id, form) : createKacchiParchi(form)
            ).then((result) => { if (result) setModal(null); return result; })
          }
        />
      )}

      {modal?.type === 'pakki' && (
        <PakkiModal
          key={formReset}
          current={modal.current}
          invoice={modal.invoice}
          onReset={() => setFormReset((value) => value + 1)}
          initialKacchi={modal.row}
          kacchis={data.meta.pendingKacchis || data.kacchis}
          pakkis={[
            ...data.pakkis,

            ...data.ready.filter((row) => !data.pakkis.some((pakki) => pakki._id === row._id)),
          ]}
          meta={data.meta}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(form) =>
            act(() =>
              modal.current
                ? updatePakkiSettlement(modal.current._id, form)
                : confirmPakkiInvoice(form)
            ).then((result) => { if (result) openInvoice(result); return result; })
          }
        />
      )}

      {modal?.type === 'direct' && (
        <WeavingDirectSaleModal
          key={modal.kind || 'fabric'}
          kind={modal.kind || 'fabric'}
          meta={data.meta}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(form) =>
            act(() => confirmDirectSale(form)).then((invoice) => {
              if (invoice) {
                openInvoice(invoice);
              }

              return invoice;
            })
          }
        />
      )}

      {modal?.type === 'direct-edit' && (
        <WeavingDirectSaleModal
          meta={data.meta}
          current={modal.row}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(form) =>
            act(() => updateSalesInvoiceDraft(modal.row._id, form)).then((invoice) => {
              if (invoice) {
                setModal({
                  type: 'invoice',
                  row: invoice,
                });
              }

              return invoice;
            })
          }
        />
      )}

      {modal?.type === 'invoice-edit' && (
        <WeavingPostedSaleEditModal
          meta={data.meta}
          invoice={modal.row}
          saving={saving}
          onClose={() =>
            setModal({
              type: 'invoice',
              row: modal.row,
            })
          }
          onSave={(form) =>
            act(() => updateSalesInvoiceDraft(modal.row._id, form)).then((invoice) => {
              if (invoice) {
                setModal({
                  type: 'invoice',
                  row: invoice,
                });
              }

              return invoice;
            })
          }
        />
      )}

      {modal?.type === 'invoice' && (
        <InvoiceModal
          invoice={modal.row}
          pakki={modal.row.pakki || pakkiFor(modal.row)}
          accounts={data.meta.paymentAccounts}
          onClose={closeInvoice}
          onEdit={can.edit && modal.row.status === 'posted' ? () => editInvoice(modal.row) : null}
          onPrint={can.print ? (format) => outputInvoice(modal.row, format) : null}
          onVoid={
            can.void && modal.row.status === 'posted' && !modal.row.paidAmount
              ? async () => {
                  const reason = await requestWeavingConfirmation({
                    message: t('weaving.sales.voidReason'),

                    inputLabel: t('weaving.sales.voidReason'),

                    inputRequired: true,
                  });

                  if (reason) {
                    const result = await act(() => voidSalesInvoice(modal.row._id, reason));

                    if (result) {
                      closeInvoice();
                    }
                  }
                }
              : null
          }
        />
      )}

      {['kacchi-view', 'pakki-view', 'receipt-view'].includes(modal?.type) && (
        <RecordView
          kind={modal.type}
          row={modal.row}
          onClose={() => setModal(null)}
          onEdit={
            can.edit && modal.type === 'kacchi-view' && modal.row.status !== 'void'
              ? () =>
                  modal.row.status === 'confirmed'
                    ? setModal({
                        type: 'kacchi',
                        row: modal.row,
                      })
                    : setNotice({
                        error: true,
                        text: t('weaving.salesCleanup.kacchiLinked'),
                      })
              : null
          }
          onPrint={
            can.print && modal.type !== 'receipt-view'
              ? (format) =>
                  openOutput(
                    parchiOutputUrl(
                      modal.type === 'kacchi-view' ? 'kacchi' : 'pakki',

                      modal.row._id,

                      format,

                      'quick'
                    )
                  )
              : null
          }
        />
      )}

      {modal?.type === 'receive' && (
        <ReceiveModal
          key={formReset}
          onReset={() => setFormReset((value) => value + 1)}
          due={modal.row}
          godowns={data.meta.godowns}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={(form) =>
            act(() => receiveRejection(modal.row._id, form)).then(
              (result) => result && setModal(null)
            )
          }
        />
      )}
    </div>
  );
}

const Metric = ({ label, value, tone = 'teal' }) => {
  const tones = {
    teal: 'border-teal-200 bg-teal-50 text-teal-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  };

  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${tones[tone] || tones.teal}`}>
      <div className="truncate text-[10px] font-extrabold uppercase tracking-wide opacity-75">
        {label}
      </div>

      <div className="mt-0.5 truncate text-lg font-black">{value}</div>
    </div>
  );
};

const KacchiOutputOptions = ({ row, onOpen }) => {
  const [open, setOpen] = useState(false);

  const output = (mode, format) => {
    onOpen(parchiOutputUrl('kacchi', row._id, format, mode));

    setOpen(false);
  };

  return (
    <>
      <Button tone="light" onClick={() => setOpen(true)}>
        <FaPrint />
        {t('weaving.salesPro.output')}
      </Button>

      {open && (
        <Modal title={`Kacchi Output - ${row.kacchiNo}`} onClose={() => setOpen(false)}>
          <div className="space-y-2 p-4">
            {[
              ['quick', t('weaving.salesPro.quick')],
              [
                'detailed',
                t(
                  row.entryMode === 'manual'
                    ? 'weaving.salesPro.manualMeter'
                    : 'weaving.salesPro.thanDetail'
                ),
              ],
            ].map(([mode, label]) => (
              <div
                key={mode}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <strong className="text-sm text-slate-800">{label}</strong>

                <div className="flex gap-2">
                  <Button
                    tone={mode === 'quick' ? 'teal' : 'light'}
                    onClick={() => output(mode, 'print')}
                  >
                    <FaPrint />
                    Print
                  </Button>

                  <Button tone="light" onClick={() => output(mode, 'pdf')}>
                    <FaDownload />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
};

const KacchiModal = ({ meta, current, saving, onClose, onSave, onReset }) => {
  const [validation, setValidation] = useState('');

  const [form, setForm] = useState({
    entryMode: current?.entryMode || 'than',

    totalMeter: current?.totalMeter || '',

    totalKg: current?.totalKg || '',

    totalThan: current?.totalThan || '',

    requestKey: current?.requestKey || key(),

    dispatchDate: current?.dispatchDate || today(),

    partyId: current?.partyId?._id || current?.partyId || '',

    contractId: current?.contractId?._id || current?.contractId || '',

    fabricQualityId: current?.fabricQualityId?._id || current?.fabricQualityId || '',

    godownId: current ? current.godownId?._id || current.godownId || '__folding__' : '',

    foldingEntryIds: current?.lines?.map((line) => String(line.foldingEntryId)) || [],

    notes: current?.notes || '',
  });

  const currentSources = (current?.lines || []).map((line) => ({
    _id: line.foldingEntryId,

    thanNo: line.thanNo,

    meter: line.meter,

    weightKg: line.weightKg,

    fabricQualityId: line.fabricQualityId,

    godownId: line.godownId,

    ownershipType: line.ownershipType,

    ownerPartyId: line.ownerPartyId,

    contractId: line.contractId,

    qualitySnapshot: line.qualitySnapshot,
  }));

  const available = [
    ...meta.availableThans,

    ...currentSources.filter(
      (source) => !meta.availableThans.some((row) => String(row._id) === String(source._id))
    ),
  ];

  const contract = meta.contracts.find((row) => String(row._id) === String(form.contractId));

  const chooseContract = (contractId) => {
    const row = meta.contracts.find((item) => String(item._id) === String(contractId));

    setForm((value) => ({
      ...value,

      contractId,

      partyId: row?.partyId?._id || row?.partyId || '',

      fabricQualityId: row?.itemId?._id || row?.itemId || '',

      foldingEntryIds: [],
    }));
  };

  const sourceSelected =
    form.godownId === '__folding__' ||
    meta.godowns.some((row) => row.isActive !== false && String(row._id) === form.godownId);

  const sourceId = form.godownId === '__folding__' ? '' : form.godownId;

  const ownershipType = contract?.contractType === 'conversion' ? 'party' : 'own';

  const thans =
    contract && sourceSelected
      ? available.filter(
          (row) =>
            (!row.grade || row.grade === 'a') &&
            (!row.contractId ||
              String(row.contractId?._id || row.contractId) === String(form.contractId)) &&
            String(row.fabricQualityId?._id || row.fabricQualityId || '') ===
              String(form.fabricQualityId) &&
            String(row.godownId?._id || row.godownId || '') === sourceId &&
            row.ownershipType === ownershipType &&
            (ownershipType !== 'party' ||
              String(row.ownerPartyId?._id || row.ownerPartyId || '') === String(form.partyId))
        )
      : [];

  const manualAvailable = (meta.manualStock || []).find(
    (row) =>
      String(row.fabricQualityId) === String(form.fabricQualityId) &&
      String(row.godownId || '') === sourceId &&
      row.category === 'normal' &&
      row.ownershipType === ownershipType &&
      (ownershipType !== 'party' || String(row.ownerPartyId) === String(form.partyId))
  );

  const selected = thans.filter((row) => form.foldingEntryIds.includes(String(row._id)));

  const toggle = (sourceIdValue) =>
    setForm((value) => ({
      ...value,

      foldingEntryIds: value.foldingEntryIds.includes(sourceIdValue)
        ? value.foldingEntryIds.filter((idValue) => idValue !== sourceIdValue)
        : [...value.foldingEntryIds, sourceIdValue],
    }));

  const performSave = () => {
    if (saving) return;

    if (!contract) {
      setValidation('Select a valid Contract.');

      return;
    }

    if (!sourceSelected) {
      setValidation('Select a valid Source Location.');

      return;
    }

    if (form.entryMode === 'manual' && Number(form.totalMeter) <= 0) {
      setValidation(t('weaving.salesPro.validAmount'));

      return;
    }

    if (form.entryMode !== 'manual' && !form.foldingEntryIds.length) {
      setValidation('Select at least one available Than.');

      return;
    }

    if (form.entryMode !== 'manual' && selected.length !== form.foldingEntryIds.length) {
      setValidation('Selected Thans no longer match the selected source.');

      return;
    }

    if (!form.dispatchDate) {
      setValidation('Select a Dispatch Date.');

      return;
    }

    setValidation('');

    return onSave({
      ...form,

      godownId: form.godownId === '__folding__' ? null : form.godownId,
    });
  };
  const save = useSaleSaveOutput(performSave, (record, format) => parchiOutputUrl('kacchi', record._id, format, 'quick'), saving);

  return (
    <Modal
      title={current ? t('weaving.sales.editKacchi') : t('weaving.sales.newKacchi')}
      onClose={onClose}
      wide
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="col-span-full flex rounded-xl bg-slate-100 p-1">
          {[
            ['than', 'thanWise'],
            ['manual', 'manualMeter'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={Boolean(current)}
              className={`flex-1 rounded-lg p-2.5 text-sm font-bold ${
                form.entryMode === value ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'
              }`}
              onClick={() =>
                setForm({
                  ...form,

                  entryMode: value,

                  foldingEntryIds: [],
                })
              }
            >
              {t(`weaving.salesPro.${label}`)}
            </button>
          ))}
        </div>

        <Field label={t('weaving.sales.dispatchDate')}>
          <input
            type="date"
            className={input}
            value={form.dispatchDate}
            onChange={(event) =>
              setForm({
                ...form,
                dispatchDate: event.target.value,
              })
            }
          />
        </Field>

        <Field label={t('weaving.sales.contract')}>
          <select
            className={input}
            value={form.contractId}
            onChange={(event) => chooseContract(event.target.value)}
          >
            <option value="">{t('weaving.sales.selectContract')}</option>

            {meta.contracts.map((row) => (
              <option key={row._id} value={row._id}>
                {row.contractNo}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('weaving.sales.party')}>
          <select disabled className={input} value={form.partyId}>
            <option value="">-</option>

            {meta.parties.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('weaving.sales.quality')}>
          <select disabled className={input} value={form.fabricQualityId}>
            <option value="">-</option>

            {meta.qualities.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('weaving.salesPro.sourceLocation')}>
          <select
            className={input}
            value={form.godownId}
            onChange={(event) =>
              setForm({
                ...form,

                godownId: event.target.value,

                foldingEntryIds: [],
              })
            }
          >
            <option value="">{t('weaving.salesPro.selectSource')}</option>

            <option value="__folding__">{t('weaving.salesPro.folding')}</option>

            {meta.godowns
              .filter((row) => row.isActive !== false)
              .map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name}
                </option>
              ))}
          </select>
        </Field>

        <div className="rounded-xl bg-teal-50 p-3 text-sm lg:col-span-3">
          <b>{contract?.contractNo || t('weaving.sales.selectContract')}</b>

          <div className="mt-1 text-slate-600">
            {form.entryMode === 'manual' ? money(form.totalThan) : selected.length}{' '}
            {t('weaving.salesPro.thanCount')}
            {' · '}
            {money(
              form.entryMode === 'manual'
                ? form.totalMeter
                : selected.reduce((sum, row) => sum + Number(row.meter || 0), 0)
            )}{' '}
            M{' · '}
            {money(
              form.entryMode === 'manual'
                ? form.totalKg
                : selected.reduce((sum, row) => sum + Number(row.weightKg || 0), 0)
            )}{' '}
            KG
          </div>
        </div>

        {form.entryMode === 'manual' ? (
          <>
            <div className="col-span-full rounded-xl bg-cyan-50 px-3 py-2 text-sm">
              <b>
                {t('weaving.sales.available')}:{' '}
                {money(
                  Number(manualAvailable?.meter || 0) +
                    (current?.entryMode === 'manual' &&
                    String(current.fabricQualityId?._id || current.fabricQualityId) ===
                      form.fabricQualityId &&
                    String(current.godownId?._id || current.godownId || '') === sourceId
                      ? current.totalMeter
                      : 0)
                )}{' '}
                M
              </b>
            </div>

            {[
              ['totalMeter', 'saleMeter'],
              ['totalKg', 'optionalKg'],
              ['totalThan', 'optionalThan'],
            ].map(([field, label]) => (
              <input
                key={field}
                type="number"
                min="0"
                step="any"
                className={input}
                placeholder={t(`weaving.salesPro.${label}`)}
                value={form[field]}
                onChange={(event) =>
                  setForm({
                    ...form,
                    [field]: event.target.value,
                  })
                }
              />
            ))}
          </>
        ) : (
          <div className="col-span-full overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2.5">
              <b className="text-sm">{t('weaving.sales.availableThans')}</b>

              <div className="flex gap-2">
                <Button
                  tone="light"
                  onClick={() =>
                    setForm({
                      ...form,

                      foldingEntryIds: thans.map((row) => String(row._id)),
                    })
                  }
                >
                  {t('weaving.sales.selectAll')}
                </Button>

                <Button
                  tone="light"
                  onClick={() =>
                    setForm({
                      ...form,
                      foldingEntryIds: [],
                    })
                  }
                >
                  {t('weaving.sales.clear')}
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="border-b p-3" />
                    <th className="border-b p-3 text-start">Than No.</th>
                    <th className="border-b p-3">Meter</th>
                    <th className="border-b p-3">KG</th>
                    <th className="border-b p-3 text-start">Quality</th>
                  </tr>
                </thead>

                <tbody>
                  {thans.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100 hover:bg-teal-50">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={form.foldingEntryIds.includes(String(row._id))}
                          onChange={() => toggle(String(row._id))}
                        />
                      </td>

                      <td className="p-3 font-bold">{row.thanNo}</td>

                      <td className="p-3 text-center">{money(row.meter)}</td>

                      <td className="p-3 text-center">{money(row.weightKg)}</td>

                      <td className="p-3">{row.qualitySnapshot?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!thans.length && <Empty />}
            </div>
          </div>
        )}

        <textarea
          className={`${input} col-span-full h-16 py-2`}
          placeholder={t('weaving.sales.notes')}
          value={form.notes}
          onChange={(event) =>
            setForm({
              ...form,
              notes: event.target.value,
            })
          }
        />

        {validation && (
          <p
            role="alert"
            className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
          >
            {validation}
          </p>
        )}

        <div className="col-span-full flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <Button tone="light" onClick={onReset}>
            {t('weaving.sales.clear')}
          </Button>

          <Button tone="light" onClick={onClose}>
            {t('weaving.sales.cancel')}
          </Button>

          <WeavingSaleSaveOutput onSave={save} disabled={saving} />
          <Button disabled={saving} onClick={save}>
            {saving ? t('weaving.sales.saving') : t('weaving.sales.confirmKacchi')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const PakkiModal = ({
  initialKacchi,
  kacchis,
  pakkis,
  meta,
  saving,
  onClose,
  onSave,
  current,
  invoice,
  onReset,
}) => {
  const [selectedId, setSelectedId] = useState(
    initialKacchi?._id || current?.sourceKacchiId || current?.kacchiId || ''
  );

  const [error, setError] = useState('');

  const [form, setForm] = useState({
    pakkiDate: today(),

    oilKamiMeter: '',
    shortageMeter: '',
    rejectionMeter: '',
    otherMeterDeduction: '',
    amountDeduction: '',

    creditDays: '',

    commercialRemarks: '',

    receivedNow: invoice?.receivedNowRequested || '',

    paymentAccountId: invoice?.paymentAccountId || '',

    paymentMethod: invoice?.paymentMethod || '',

    ...(invoice?.paymentDetails || {}),

    editRequestKey: key(),

    expectedUpdatedAt: invoice?.updatedAt,
  });

  const patch = (next) =>
    setForm((old) => ({
      ...old,
      ...next,
    }));

  const candidates = kacchis.filter(
    (row) =>
      row.status === 'confirmed' ||
      pakkis.some(
        (pakki) =>
          !pakki.invoiceId &&
          pakki.status === 'finalized' &&
          String(pakki.kacchiId || pakki.sourceKacchiId) === String(row._id)
      )
  );

  const chosenKacchi = candidates.find((row) => String(row._id) === String(selectedId));

  const kacchi =
    chosenKacchi ||
    (current
      ? {
          _id: selectedId,

          kacchiNo: current.kacchiReference,

          totalMeter: current.grossMeter,

          totalKg: current.grossKg,

          dispatchDate: current.dispatchDate,

          partyId: current.partyId,

          contractId: current.contractId,

          qualitySnapshot: current.qualitySnapshot,
        }
      : null);

  const historical =
    current ||
    (kacchi &&
      pakkis.find(
        (pakki) =>
          pakki.status === 'finalized' &&
          String(pakki.kacchiId || pakki.sourceKacchiId) === String(kacchi._id)
      ));

  const contract =
    kacchi &&
    (meta.contracts.find(
      (row) => String(row._id) === String(kacchi.contractId?._id || kacchi.contractId)
    ) ||
      kacchi.contractId);

  useEffect(() => {
    if (!kacchi) return;

    setForm((old) => ({
      ...old,

      creditDays: historical?.creditDays ?? contract?.creditDays ?? 0,

      dueDate: historical?.dueDate || '',

      pakkiDate: historical?.pakkiDate || today(),

      oilKamiMeter: historical?.oilKamiMeter || '',

      shortageMeter: historical?.shortageMeter || '',

      rejectionMeter: historical?.rejectionMeter || '',

      otherMeterDeduction: historical?.otherMeterDeduction || '',

      amountDeduction: historical?.amountDeduction || '',

      commercialRemarks: historical?.commercialRemarks || '',
    }));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const deductions = [
    'oilKamiMeter',
    'shortageMeter',
    'rejectionMeter',
    'otherMeterDeduction',
  ].reduce((sum, field) => sum + Number(form[field] || 0), 0);

  const billable = Number(kacchi?.totalMeter || 0) - deductions;

  const rate = Number(historical?.rate ?? contract?.rate ?? 0);

  const subtotal = Math.round(billable * rate * 100) / 100;

  const total = Math.round((subtotal - Number(form.amountDeduction || 0)) * 100) / 100;

  const performSave = async () => {
    if (saving) return;

    let message = !kacchi ? t('weaving.salesPro.selectKacchi') : '';

    if (billable <= 0 || total <= 0 || deductions < 0) {
      message = t('weaving.salesPro.validSettlement');
    }

    message ||= paymentError(form, total);

    if (message) {
      setError(message);
      return;
    }

    if (!(await confirmExcessPayment(form, total))) {
      return;
    }

    return onSave({
      ...form,

      kacchiId: selectedId,

      receivedNow: paymentReceived(form),
    });
  };
  const save = useSaleSaveOutput(performSave, savedSaleOutputUrl, saving);

  return (
    <Modal title={t('weaving.salesPro.pakkiFinal')} onClose={onClose} wide>
      <div className="space-y-3 p-4">
        {!current && (
          <SearchableCreatableSelect
            label={t('weaving.salesPro.pendingKacchi')}
            options={candidates.map((row) => ({
              _id: row._id,

              name: [row.kacchiNo, row.partyId?.name, row.contractId?.contractNo]
                .filter(Boolean)
                .join(' · '),
            }))}
            value={selectedId}
            onChange={(value) => {
              setSelectedId(value);
              setError('');
            }}
          />
        )}

        {kacchi && (
          <>
            <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [t('weaving.sales.dispatchDate'), kacchi.dispatchDate],

                [t('weaving.sales.party'), kacchi.partyId?.name],

                [t('weaving.sales.contract'), contract?.contractNo],

                [t('weaving.sales.quality'), kacchi.qualitySnapshot?.name],
              ].map(([label, value]) => (
                <div key={label}>
                  <small className="text-slate-500">{label}</small>

                  <b className="block">{value || '—'}</b>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('weaving.sales.pakkiDate')}>
                <input
                  type="date"
                  disabled={Boolean(historical) && !current}
                  className={input}
                  value={form.pakkiDate}
                  onChange={(event) =>
                    patch({
                      pakkiDate: event.target.value,

                      dueDate: '',
                    })
                  }
                />
              </Field>

              {[
                ['oilKamiMeter', 'oilKami'],
                ['shortageMeter', 'shortage'],
                ['rejectionMeter', 'rejection'],
                ['otherMeterDeduction', 'otherDeduction'],
                ['amountDeduction', 'amountDeduction'],
              ].map(([field, label]) => (
                <input
                  key={field}
                  disabled={Boolean(historical) && !current}
                  type="number"
                  min="0"
                  step="any"
                  className={input}
                  placeholder={t(`weaving.salesPro.${label}`)}
                  value={form[field]}
                  onChange={(event) =>
                    patch({
                      [field]: event.target.value,
                    })
                  }
                />
              ))}
            </div>

            <div className="grid gap-2 rounded-xl bg-teal-50 p-3 sm:grid-cols-3 lg:grid-cols-7">
              {[
                ['grossMeter', `${money(kacchi.totalMeter)} M`],

                ['grossKg', `${money(kacchi.totalKg)} KG`],

                ['deductions', `${money(deductions)} M`],

                ['billable', `${money(billable)} M`],

                ['contractRate', `Rs. ${money(rate)}`],

                ['subtotal', `Rs. ${money(subtotal)}`],

                ['finalAmount', `Rs. ${money(total)}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <small className="text-[10px] font-semibold text-teal-700">
                    {t(`weaving.salesPro.${label}`)}
                  </small>

                  <b className="block text-base text-teal-950">{value}</b>
                </div>
              ))}
            </div>

            <WeavingSalePaymentSection
              form={form}
              onChange={patch}
              total={total}
              accounts={meta.paymentAccounts}
              date={form.pakkiDate}
            />

            <input
              className={input}
              placeholder={t('weaving.sales.remarks')}
              value={form.commercialRemarks}
              onChange={(event) =>
                patch({
                  commercialRemarks: event.target.value,
                })
              }
            />
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {error}
          </p>
        )}

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <Button tone="light" onClick={onReset}>
            {t(current ? 'weaving.salesCleanup.reset' : 'weaving.sales.clear')}
          </Button>

          <Button tone="light" onClick={onClose}>
            {t('weaving.sales.cancel')}
          </Button>

          <WeavingSaleSaveOutput onSave={save} disabled={saving || !kacchi} />
          <Button disabled={saving || !kacchi} onClick={save}>
            {t(
              saving
                ? 'weaving.sales.saving'
                : current
                  ? 'weaving.salesCleanup.save'
                  : 'weaving.salesPro.confirmPakki'
            )}
          </Button>
        </footer>
      </div>
    </Modal>
  );
};

const DetailGrid = ({ values }) => (
  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
    {values.map(([label, value]) => (
      <div key={String(label)} className="rounded-lg bg-white px-3 py-2">
        <small className="text-xs text-slate-500">{label}</small>

        <b className="block break-words text-sm text-slate-900">{value ?? '—'}</b>
      </div>
    ))}
  </div>
);

const InvoiceModal = ({ invoice, accounts, onClose, onEdit, onPrint, onVoid, pakki }) => {
  const receipt = Number(invoice.receivedNowRequested || 0);

  const account = accounts.find(
    (row) => String(row._id) === String(invoice.paymentAccountId?._id || invoice.paymentAccountId)
  );

  const details = invoice.paymentDetails || {};

  return (
    <Modal title={pakki?.pakkiNo || invoice.invoiceNo} onClose={onClose}>
      <div className="space-y-3 p-4">
        <DetailGrid
          values={[
            [t('weaving.sales.invoiceNo'), invoice.invoiceNo],

            [t('weaving.sales.date'), invoice.invoiceDate],

            [t('weaving.sales.party'), invoice.partyName],

            [t('weaving.sales.saleType'), t(`weaving.salesCleanup.type_${invoice.saleNature}`)],

            [
              t('weaving.sales.quantity'),

              invoice.accountingOnly && invoice.uom === 'Job'
                ? '—'
                : `${money(invoice.quantity)} ${invoice.uom}`,
            ],

            [t('weaving.sales.rate'), money(invoice.finalRate)],

            [t('weaving.salesCleanup.invoiceAmount'), `Rs. ${money(invoice.grandTotal)}`],

            [t('weaving.salesCleanup.applied'), `Rs. ${money(invoice.paidAmount)}`],

            [t('weaving.salesCleanup.totalReceipt'), `Rs. ${money(receipt)}`],

            [
              t('weaving.salesCleanup.excess'),
              `Rs. ${money(Math.max(0, receipt - invoice.grandTotal))}`,
            ],

            [t('weaving.salesPro.balance'), `Rs. ${money(invoice.balanceDue)}`],

            [t('weaving.sales.status'), <Status value={invoice.paymentStatus} payment />],

            [
              t('weaving.sales.paymentMethod'),
              invoice.paymentMethod ? t(`weaving.salesPro.${invoice.paymentMethod}`) : '—',
            ],

            [t('weaving.sales.paymentAccount'), invoice.paymentAccountName || account?.name || '—'],

            ...(pakki
              ? [
                  [t('weaving.salesPro.pakkiFinal'), pakki.pakkiNo],

                  [t('weaving.sales.kacchiNo'), pakki.kacchiReference],

                  [t('weaving.salesPro.rejection'), money(pakki.rejectionMeter)],
                ]
              : []),

            ...(invoice.paymentMethod === 'cheque'
              ? ['chequeNo', 'chequeBank', 'chequeDate', 'chequeDueDate'].map((field) => [
                  t(`weaving.salesPro.${field}`),

                  details[field] || invoice[field] || '—',
                ])
              : []),
          ]}
        />

        {invoice.lines?.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full border-collapse text-sm">
              <tbody>
                {invoice.lines.map((line, index) => (
                  <tr key={line._id || index} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{line.description}</td>

                    <td className="px-3 py-2 text-center">
                      {money(line.quantity)} {line.uom}
                    </td>

                    <td className="px-3 py-2 text-center">× {money(line.rate)}</td>

                    <td className="px-3 py-2 text-end font-bold">Rs. {money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoice.notes && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {invoice.notes}
          </div>
        )}

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          {onEdit && (
            <Button tone="light" onClick={onEdit}>
              <FaEdit />
              {t('weaving.sales.edit')}
            </Button>
          )}

          {onPrint && (
            <>
              <Button tone="light" onClick={() => onPrint('print')}>
                <FaPrint />
                Print
              </Button>

              <Button tone="light" onClick={() => onPrint('pdf')}>
                <FaDownload />
                PDF
              </Button>
            </>
          )}

          {onVoid && (
            <Button tone="danger" onClick={onVoid}>
              {t('weaving.sales.void')}
            </Button>
          )}

          <Button onClick={onClose}>{t('weaving.sales.close')}</Button>
        </footer>
      </div>
    </Modal>
  );
};

const RecordView = ({ kind, row, onClose, onEdit, onPrint }) => (
  <Modal title={row.kacchiNo || row.pakkiNo || row.receiptNo} onClose={onClose}>
    <div className="space-y-3 p-4">
      <DetailGrid
        values={[
          [t('weaving.sales.date'), row.dispatchDate || row.pakkiDate || row.receiptDate],

          [t('weaving.sales.party'), row.partyId?.name || '—'],

          [t('weaving.sales.quality'), row.qualitySnapshot?.name || row.fabricQualityId?.name],

          [
            t('weaving.salesPro.sourceLocation'),
            row.godownId?.name || t('weaving.salesPro.folding'),
          ],

          [
            t('weaving.sales.quantity'),
            `${money(row.totalMeter ?? row.grossMeter ?? row.receivedMeter)} M`,
          ],

          [t('weaving.salesPro.grossKg'), money(row.totalKg ?? row.grossKg ?? row.receivedKg)],

          [t('weaving.sales.status'), <Status value={row.status} />],
        ]}
      />

      {row.lines?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {row.lines.map((line, index) => (
            <div
              className="flex justify-between border-b border-slate-100 px-3 py-2 last:border-0"
              key={line._id || line.foldingEntryId || index}
            >
              <b>{line.thanNo || line.description}</b>

              <span className="text-sm text-slate-600">
                {money(line.meter)} M · {money(line.weightKg)} KG
              </span>
            </div>
          ))}
        </div>
      )}

      {kind === 'receipt-view' && (
        <DetailGrid
          values={['normal', 'rejected', 'cutPiece', 'waste'].map((category) => [
            t(`weaving.sales.${category}`),

            `${money(row[`${category}Meter`])} M`,
          ])}
        />
      )}

      {row.notes && <div className="rounded-xl bg-slate-50 p-3 text-sm">{row.notes}</div>}

      <footer className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        {onEdit && <Button onClick={onEdit}>{t('weaving.sales.edit')}</Button>}

        {onPrint && (
          <>
            <Button tone="light" onClick={() => onPrint('print')}>
              <FaPrint />
              Print
            </Button>

            <Button tone="light" onClick={() => onPrint('pdf')}>
              <FaDownload />
              PDF
            </Button>
          </>
        )}

        <Button tone="light" onClick={onClose}>
          {t('weaving.sales.close')}
        </Button>
      </footer>
    </div>
  </Modal>
);

const ReceiveModal = ({ due, godowns, saving, onClose, onSave, onReset }) => {
  const [form, setForm] = useState({
    receiptDate: today(),

    requestKey: key(),

    godownId: due.godownId || '',

    receivedMeter: '',
    receivedKg: '',
    pieceCount: '',

    normalMeter: '',
    normalKg: '',
    normalPieces: '',

    rejectedMeter: '',
    rejectedKg: '',
    rejectedPieces: '',

    cutPieceMeter: '',
    cutPieceKg: '',
    cutPiecePieces: '',

    wasteMeter: '',
    wasteKg: '',
    wastePieces: '',

    notes: '',
  });

  const meterTotal = ['normalMeter', 'rejectedMeter', 'cutPieceMeter', 'wasteMeter'].reduce(
    (sum, field) => sum + Number(form[field] || 0),
    0
  );

  return (
    <Modal title={t('weaving.sales.receiveRejection')} onClose={onClose} wide>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('weaving.sales.receiptDate')}>
          <input
            type="date"
            className={input}
            value={form.receiptDate}
            onChange={(event) =>
              setForm({
                ...form,

                receiptDate: event.target.value,
              })
            }
          />
        </Field>

        <Field label={t('weaving.sales.godown')}>
          <select
            className={input}
            value={form.godownId}
            onChange={(event) =>
              setForm({
                ...form,

                godownId: event.target.value,
              })
            }
          >
            <option value="">Select Godown</option>

            {godowns.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <input
          type="number"
          min="0"
          max={due.pendingMeter}
          className={input}
          placeholder="Received Meter"
          value={form.receivedMeter}
          onChange={(event) =>
            setForm({
              ...form,

              receivedMeter: event.target.value,
            })
          }
        />

        <input
          type="number"
          min="0"
          className={input}
          placeholder="Received KG"
          value={form.receivedKg}
          onChange={(event) =>
            setForm({
              ...form,

              receivedKg: event.target.value,
            })
          }
        />

        <input
          type="number"
          min="0"
          className={input}
          placeholder="Piece Count"
          value={form.pieceCount}
          onChange={(event) =>
            setForm({
              ...form,

              pieceCount: event.target.value,
            })
          }
        />

        {[
          ['normal', t('weaving.sales.normal')],

          ['rejected', t('weaving.sales.second')],

          ['cutPiece', t('weaving.sales.cutPiece')],

          ['waste', t('weaving.sales.waste')],
        ].map(([prefix, label]) => (
          <div key={prefix} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <b className="text-sm">{label}</b>

            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ['M', `${prefix}Meter`],
                ['KG', `${prefix}Kg`],
                ['PCS', `${prefix}Pieces`],
              ].map(([name, field]) => (
                <input
                  key={field}
                  type="number"
                  min="0"
                  className={input}
                  placeholder={name}
                  value={form[field]}
                  onChange={(event) =>
                    setForm({
                      ...form,

                      [field]: event.target.value,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}

        <div
          className={`rounded-xl p-3 text-sm font-bold ${
            meterTotal === Number(form.receivedMeter || 0)
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {t('weaving.sales.classified')}: {money(meterTotal)} M
        </div>

        <input
          className={`${input} col-span-full`}
          placeholder={t('weaving.sales.notes')}
          value={form.notes}
          onChange={(event) =>
            setForm({
              ...form,

              notes: event.target.value,
            })
          }
        />

        <div className="col-span-full flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button tone="light" onClick={onReset}>
            {t('weaving.sales.clear')}
          </Button>

          <Button tone="light" onClick={onClose}>
            {t('weaving.sales.cancel')}
          </Button>

          <Button
            disabled={saving || meterTotal !== Number(form.receivedMeter || 0)}
            onClick={() => onSave(form)}
          >
            {saving ? t('weaving.sales.saving') : t('weaving.sales.receive')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
