import React, { useState, useEffect, useRef, useCallback } from 'react';
import AttachmentViewerModal from './AttachmentViewerModal';
import { fetchSupplierLedger } from '../services/supplierService';
import { getPartyLedger } from '../services/partyLedgerService';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { createPayBill, updatePayBill, getPayBillById } from '../services/payBillService';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import Select from 'react-select';
import { t } from '../i18n/i18n';
import useFormPersist from '../hooks/useFormPersist';
import { hasPermission } from '../utils/permissionHelper';
import {
  formatBusinessDateForDisplay,
  getBusinessDateInputValue,
  getBusinessTimeInputValue,
} from '../utils/localDateTime';
const PayBillForm = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedSupplierType, setSelectedSupplierType] = useState('supplier');
  const [accounts, setAccounts] = useState([]);
  const [supplierLedger, setSupplierLedger] = useState([]);

  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [existingAttachments, setExistingAttachments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [modalAttachment, setModalAttachment] = useState(null);

  const fileInputRef = useRef(null);
  const printRef = useRef();

  const [formData, setFormData] = useState({
    supplier: '',
    partyId: '',
    date: getBusinessDateInputValue(),
    time: getBusinessTimeInputValue(),
    paymentType: 'Cash',
    discountAmount: '',
    description: '',
    attachment: '',
  });
  const [paymentEntries, setPaymentEntries] = useState([
    { account: '', amount: '', paymentType: 'Cash' },
  ]);

  const navigate = useNavigate();

  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get('id');
  const id = paramId || queryId;
  const canViewPayBills = hasPermission('pay_bills.view');
  const canCreatePayBills = hasPermission('pay_bills.create');
  const canEditPayBills = hasPermission('pay_bills.edit');

  const loadLedger = useCallback(async (recordId, type = 'supplier') => {
    if (!recordId) {
      setSupplierLedger([]);
      setLedgerLoading(false);
      return;
    }

    try {
      setLedgerLoading(true);

      if (type === 'party') {
        const res = await getPartyLedger(recordId);

        setSupplierLedger(Array.isArray(res?.ledger) ? res.ledger : []);

        return;
      }

      const res = await fetchSupplierLedger(recordId);

      setSupplierLedger(
        Array.isArray(res?.entries) ? res.entries : Array.isArray(res?.ledger) ? res.ledger : []
      );
    } catch (error) {
      console.error('❌ Supplier ledger load error:', error);

      setSupplierLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id && (!canViewPayBills || !canEditPayBills)) {
      alert('You do not have permission to edit pay bills');
      navigate('/pay-bills');
      return;
    }

    if (!id && !canCreatePayBills) {
      alert('You do not have permission to create pay bills');
      navigate('/dashboard');
    }
  }, [id, canViewPayBills, canEditPayBills, canCreatePayBills, navigate]);

  useEffect(() => {
    if (!id) return;

    if (!canViewPayBills || !canEditPayBills) return;

    let cancelled = false;

    const normalizePaymentType = (value) => {
      const type = String(value || 'cash').toLowerCase();

      if (type === 'online') return 'Online';
      if (type === 'cheque') return 'Cheque';

      return 'Cash';
    };

    const loadEditBill = async () => {
      try {
        setEditLoading(true);

        const existing = await getPayBillById(id);

        if (cancelled) return;

        const supplierObject =
          existing.supplier && typeof existing.supplier === 'object' ? existing.supplier : null;

        const partyObject =
          existing.partyId && typeof existing.partyId === 'object' ? existing.partyId : null;

        const existingSupplierId = supplierObject?._id || existing.supplier || '';

        const existingPartyId = partyObject?._id || existing.partyId || '';

        const supplierType = existingPartyId ? 'party' : 'supplier';

        setSelectedSupplierType(supplierType);

        setFormData({
          supplier: supplierType === 'supplier' ? existingSupplierId : '',

          partyId: supplierType === 'party' ? existingPartyId : '',

          date: getBusinessDateInputValue(existing.date),

          time: existing.time || getBusinessTimeInputValue(),

          paymentType: normalizePaymentType(
            existing.paymentEntries?.[0]?.paymentType || existing.paymentType
          ),

          discountAmount: existing.discountAmount ?? '',

          description: existing.description || '',

          attachment: '',
        });

        setExistingAttachments(Array.isArray(existing.attachments) ? existing.attachments : []);

        setAttachments([]);

        const restoredPayments =
          Array.isArray(existing.paymentEntries) && existing.paymentEntries.length > 0
            ? existing.paymentEntries.map((payment) => ({
                account:
                  typeof payment.account === 'object'
                    ? payment.account?._id || ''
                    : payment.account || '',

                amount: payment.amount ?? '',

                paymentType: normalizePaymentType(payment.paymentType || existing.paymentType),
              }))
            : [
                {
                  account: '',
                  amount: existing.amount || '',
                  paymentType: normalizePaymentType(existing.paymentType),
                },
              ];

        setPaymentEntries(restoredPayments);
      } catch (error) {
        if (cancelled) return;

        console.error('❌ Pay Bill edit loading error:', error?.response?.data || error.message);

        alert(error?.response?.data?.error || 'Pay Bill data could not be loaded');
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    };

    loadEditBill();

    return () => {
      cancelled = true;
    };
  }, [id, canViewPayBills, canEditPayBills]);

  useEffect(() => {
    if (id && (!canViewPayBills || !canEditPayBills)) return;
    if (!id && !canCreatePayBills) return;

    let cancelled = false;

    const applyOptions = (options) => {
      if (!options || cancelled) return;

      const supplierList = Array.isArray(options.suppliers) ? options.suppliers : [];

      const partyList = Array.isArray(options.parties) ? options.parties : [];

      const paymentAccounts = Array.isArray(options.paymentAccounts) ? options.paymentAccounts : [];

      setSuppliers(supplierList);
      setParties(partyList);
      setAccounts(paymentAccounts);

      if (!id) {
        const handCash = paymentAccounts.find(
          (account) =>
            account.name?.trim().toLowerCase() === 'hand cash' ||
            account.name?.trim().toLowerCase() === 'handcash' ||
            account.category?.toLowerCase() === 'cash'
        );

        setPaymentEntries((previousEntries) => {
          const isBlankDefault =
            previousEntries.length === 1 &&
            !previousEntries[0]?.account &&
            !previousEntries[0]?.amount;

          if (!isBlankDefault) {
            return previousEntries;
          }

          return [
            {
              account: handCash?._id || '',
              amount: '',
              paymentType: 'Cash',
            },
          ];
        });
      }
    };

    const cachedOptions = purchaseInvoiceService.getCachedPurchaseInvoiceFormOptions();

    if (cachedOptions) {
      applyOptions(cachedOptions);
    }

    const loadFormOptions = async () => {
      try {
        const options = await purchaseInvoiceService.fetchPurchaseInvoiceFormOptions();

        applyOptions(options);
      } catch (error) {
        console.error('Pay Bill form options load failed:', error);
      }
    };

    loadFormOptions();

    return () => {
      cancelled = true;
    };
  }, [id, canViewPayBills, canEditPayBills, canCreatePayBills]);

  useEffect(() => {
    const selectedId = selectedSupplierType === 'party' ? formData.partyId : formData.supplier;

    if (!selectedId) {
      setSupplierLedger([]);
      return;
    }

    loadLedger(selectedId, selectedSupplierType);
  }, [selectedSupplierType, formData.supplier, formData.partyId, loadLedger]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = (selected) => {
    const selectedId = selected?.value || '';
    const type = selected?.selectType || 'supplier';

    setSelectedSupplierType(type);

    setFormData((prev) => ({
      ...prev,
      supplier: type === 'supplier' ? selectedId : '',
      partyId: type === 'party' ? selectedId : '',
    }));

    if (!selectedId) {
      setSupplierLedger([]);
      setLedgerLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);

    if (!files.length) return;

    setAttachments((prev) => {
      const updated = [...prev, ...files];

      if (updated.length > 3) {
        alert('Maximum 3 attachments allowed');
        return prev;
      }

      return updated;
    });
  };

  const resetForm = () => {
    clear();

    setFormData({
      supplier: '',
      partyId: '',
      date: getBusinessDateInputValue(),
      time: getBusinessTimeInputValue(),
      paymentType: 'Cash',
      discountAmount: '',
      description: '',
      attachment: '',
    });

    setSelectedSupplierType('supplier');

    const handCash = accounts.find(
      (account) =>
        account.name?.trim().toLowerCase() === 'hand cash' ||
        account.name?.trim().toLowerCase() === 'handcash' ||
        account.category?.toLowerCase() === 'cash' ||
        account.type?.toLowerCase() === 'cash'
    );

    setPaymentEntries([
      {
        account: handCash?._id || '',
        amount: '',
        paymentType: 'Cash',
      },
    ]);

    setSupplierLedger([]);

    setExistingAttachments([]);
    setAttachments([]);
    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRevert = async () => {
    if (!id) {
      resetForm();
      return;
    }

    try {
      setEditLoading(true);

      const existing = await getPayBillById(id);

      const existingSupplierId =
        typeof existing.supplier === 'object' ? existing.supplier?._id : existing.supplier || '';

      const existingPartyId =
        typeof existing.partyId === 'object' ? existing.partyId?._id : existing.partyId || '';

      const supplierType = existingPartyId ? 'party' : 'supplier';

      setSelectedSupplierType(supplierType);

      setFormData({
        supplier: supplierType === 'supplier' ? existingSupplierId : '',
        partyId: supplierType === 'party' ? existingPartyId : '',
        date: getBusinessDateInputValue(existing.date),
        time: existing.time || getBusinessTimeInputValue(),
        paymentType: existing.paymentEntries?.[0]?.paymentType || existing.paymentType || 'Cash',
        discountAmount: existing.discountAmount ?? '',
        description: existing.description || '',
        attachment: '',
      });

      setExistingAttachments(Array.isArray(existing.attachments) ? existing.attachments : []);

      setAttachments([]);

      setPaymentEntries(
        Array.isArray(existing.paymentEntries) && existing.paymentEntries.length > 0
          ? existing.paymentEntries.map((payment) => {
              const rawPaymentType = payment.paymentType || existing.paymentType || 'cash';

              return {
                account:
                  typeof payment.account === 'object'
                    ? payment.account?._id || ''
                    : payment.account || '',
                amount: payment.amount ?? '',
                paymentType:
                  String(rawPaymentType).toLowerCase() === 'online'
                    ? 'Online'
                    : String(rawPaymentType).toLowerCase() === 'cheque'
                      ? 'Cheque'
                      : 'Cash',
              };
            })
          : [
              {
                account: '',
                amount: existing.amount || '',
                paymentType:
                  existing.paymentType === 'online'
                    ? 'Online'
                    : existing.paymentType === 'cheque'
                      ? 'Cheque'
                      : 'Cash',
              },
            ]
      );
    } catch (error) {
      console.error('❌ Pay Bill revert error:', error);

      alert(error?.message || 'Pay Bill could not be restored');
    } finally {
      setEditLoading(false);
    }
  };

  const formState = {
    formData: {
      ...formData,
      attachment: '',
    },
    selectedSupplierType,
    paymentEntries,
  };

  const restorePayBillDraft = useCallback((valueOrUpdater) => {
    const defaultState = {
      formData: {
        supplier: '',
        partyId: '',
        date: getBusinessDateInputValue(),
        time: getBusinessTimeInputValue(),
        paymentType: 'Cash',
        discountAmount: '',
        description: '',
        attachment: '',
      },
      selectedSupplierType: 'supplier',
      paymentEntries: [
        {
          account: '',
          amount: '',
          paymentType: 'Cash',
        },
      ],
    };

    const data =
      typeof valueOrUpdater === 'function' ? valueOrUpdater(defaultState) : valueOrUpdater;

    if (!data || typeof data !== 'object') return;

    const savedFormData = data.formData || {};

    setFormData({
      supplier: savedFormData.supplier || '',
      partyId: savedFormData.partyId || '',
      date: savedFormData.date || getBusinessDateInputValue(),
      time: savedFormData.time || getBusinessTimeInputValue(),
      paymentType: savedFormData.paymentType || 'Cash',
      discountAmount: savedFormData.discountAmount || '',
      description: savedFormData.description || '',
      attachment: '',
    });

    setSelectedSupplierType(data.selectedSupplierType || 'supplier');

    const restoredEntries =
      Array.isArray(data.paymentEntries) && data.paymentEntries.length > 0
        ? data.paymentEntries.map((entry) => ({
            account: entry?.account || '',
            amount: entry?.amount || '',
            paymentType: entry?.paymentType || 'Cash',
          }))
        : [
            {
              account: '',
              amount: '',
              paymentType: 'Cash',
            },
          ];

    setPaymentEntries(restoredEntries);
  }, []);

  const shouldSavePayBillDraft = useCallback((draft) => {
    if (!draft) return false;

    const hasSupplier = Boolean(draft.formData?.supplier) || Boolean(draft.formData?.partyId);

    const hasPayments =
      Array.isArray(draft.paymentEntries) &&
      draft.paymentEntries.some((entry) => Boolean(entry?.account) || Boolean(entry?.amount));

    const hasOtherData =
      Boolean(draft.formData?.description?.trim()) ||
      Number(draft.formData?.discountAmount || 0) > 0;

    return hasSupplier || hasPayments || hasOtherData;
  }, []);

  const { clear } = useFormPersist(!id ? 'pay_bill_draft' : null, formState, restorePayBillDraft, {
    expiryHours: 24,
    delay: 500,
    shouldSave: shouldSavePayBillDraft,
  });

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (id && !canEditPayBills) {
      alert('You do not have permission to edit pay bills');
      return;
    }

    if (!id && !canCreatePayBills) {
      alert('You do not have permission to create pay bills');
      return;
    }

    if (!formData.supplier && !formData.partyId) {
      alert(t('alerts.selectSupplier'));
      return;
    }

    if (!paymentEntries.length) {
      alert(t('alerts.addAtLeastOnePayment'));
      return;
    }

    for (const p of paymentEntries) {
      if (!p.account || !p.amount || Number(p.amount) <= 0) {
        alert(t('alerts.invalidPaymentEntry'));
        return;
      }
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key !== 'attachment' && value !== null) {
        data.append(key, value);
      }
    });

    // ✅ IMPORTANT: multiple payments backend ko bhejna
    data.append('paymentEntries', JSON.stringify(paymentEntries));

    data.append('discountAmount', formData.discountAmount || 0);

    attachments.forEach((file) => {
      data.append('attachments', file);
    });

    data.append('keepAttachmentKeys', JSON.stringify(existingAttachments.map((a) => a.key)));

    try {
      setLoading(true);

      if (id) {
        await updatePayBill(id, data);
      } else {
        await createPayBill(data);

        clear();
      }

      if (type === 'new') {
        if (id) {
          navigate('/pay-bills/new', {
            replace: true,
          });
        }

        resetForm();
        return;
      }

      if (type === 'close') {
        if (!id) {
          resetForm();
        }

        navigate('/dashboard');
        return;
      }
    } catch (err) {
      alert(t('alerts.error') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const docContent = `
    <div>
      <h2 style="text-align:center;">${t('payment.invoiceTitle')}</h2>
      <p><strong>${t('supplier.supplier')}:</strong> ${
        selectedSupplierType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.name || '-'
          : suppliers.find((s) => s._id === formData.supplier)?.name || '-'
      }</p>
      <p><strong>${t('common.date')}:</strong> ${formData.date} ${formData.time}</p>
      <p><strong>${t('common.amount')}:</strong> ${totalAmount}</p>
      <p><strong>${t('ledger.paymentType')}:</strong> ${formData.paymentType}</p>
      <p><strong>${t('common.description')}:</strong> ${formData.description || '-'}</p>
    </div>
  `;

    const win = window.open('', '', 'width=800,height=600');
    win.document.write(
      `<html><head><title>${t('print')}</title></head><body>${docContent}</body></html>`
    );
    win.document.close();
    win.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // 🔹 STEP 1: total amount calculate karo
    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // 🔹 STEP 2: PDF content
    doc.setFontSize(16);
    doc.text(t('payment.invoiceTitle'), 70, 15);

    doc.setFontSize(12);
    doc.text(
      `${t('supplier.supplier')}: ${
        selectedSupplierType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.name || '-'
          : suppliers.find((s) => s._id === formData.supplier)?.name || '-'
      }`,
      14,
      30
    );

    doc.text(`${t('common.date')}: ${formData.date} ${formData.time}`, 14, 38);
    doc.text(`${t('common.amount')}: ${totalAmount}`, 14, 46);
    doc.text(`${t('ledger.paymentType')}: ${formData.paymentType}`, 14, 54);
    doc.text(`${t('common.description')}: ${formData.description || '-'}`, 14, 62);

    doc.save(t('payment.invoiceFile'));
  };

  return (
    <>
      {editLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl font-semibold">
            Pay Bill Loading...
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => handleSubmit(e, 'close')}
        className="bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-xl rounded-xl md:rounded-2xl p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-3 border border-gray-200 content-start"
      >
        <h2 className="text-xl font-bold md:col-span-2 mb-2">
          {id ? t('payment.edit') : t('payment.new')}
        </h2>
        <div>
          <label>{t('supplier.supplier')}:</label>
          <Select
            name="supplier"
            options={[
              ...suppliers.map((s) => ({
                value: s._id,
                label: s.name,
                selectType: 'supplier',
              })),
              ...parties.map((p) => ({
                value: p._id,
                label: `${p.name} 🟣 Party`,
                selectType: 'party',
              })),
            ]}
            value={
              selectedSupplierType === 'party'
                ? parties.find((p) => p._id === formData.partyId)
                  ? {
                      value: formData.partyId,
                      label: `${parties.find((p) => p._id === formData.partyId)?.name} 🟣 Party`,
                      selectType: 'party',
                    }
                  : null
                : suppliers.find((s) => s._id === formData.supplier)
                  ? {
                      value: formData.supplier,
                      label: suppliers.find((s) => s._id === formData.supplier)?.name,
                      selectType: 'supplier',
                    }
                  : null
            }
            onChange={handleSupplierChange}
            placeholder={t('supplier.select')}
            isClearable
          />
        </div>
        {/* DATE */}
        <div>
          <label>{t('common.date')}:</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {/* TIME */}
        <div>
          <label>{t('common.time')}:</label>
          <input
            type="time"
            name="time"
            value={formData.time}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label>{t('common.attachment')}:</label>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={existingAttachments.length + attachments.length >= 3}
              className={`px-3 py-2 rounded-lg text-sm shadow ${
                existingAttachments.length + attachments.length >= 3
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              📎 Add Files ({existingAttachments.length + attachments.length}/3)
            </button>

            {existingAttachments.map((att, index) => (
              <div
                key={att.key || index}
                className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-xl text-xs"
              >
                <span className="text-blue-600">📎 File {index + 1}</span>

                <button
                  type="button"
                  onClick={() =>
                    setModalAttachment({
                      url: att.fullUrl || att.url || '',
                      type: att.type || '',
                    })
                  }
                  className="text-green-600 underline"
                >
                  👁 View
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('alerts.removeAttachment'))) {
                      setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
                    }
                  }}
                  className="text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}

            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-xl text-xs"
              >
                <span className="text-blue-600">📎 New {index + 1}</span>

                <button
                  type="button"
                  onClick={() =>
                    setModalAttachment({
                      url: URL.createObjectURL(file),
                      type: file.type || '',
                    })
                  }
                  className="text-green-600 underline"
                >
                  👁 View
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAttachments((prev) => prev.filter((_, i) => i !== index));

                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* DESCRIPTION (same width as Time) */}
        <div>
          <label>{t('common.description')}:</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
            rows="2"
          />
        </div>
        {/* PAYMENTS TABLE STYLE */}
        <div className="md:col-span-2">
          <label className="font-semibold">{t('payment.payments')}:</label>

          {paymentEntries.map((entry, index) => (
            <div key={index} className="grid grid-cols-12 gap-1 md:gap-2 items-center mb-1 md:mb-2">
              {/* ACCOUNT */}
              <select
                className="col-span-5 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
                value={entry.account}
                onChange={(e) =>
                  setPaymentEntries((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, account: e.target.value } : item
                    )
                  )
                }
                required
              >
                <option value="">{t('account.selectAccount')}</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>

              {/* PAYMENT TYPE */}
              <select
                className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm"
                value={entry.paymentType}
                onChange={(e) =>
                  setPaymentEntries((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, paymentType: e.target.value } : item
                    )
                  )
                }
              >
                <option>{t('payment.cash')}</option>
                <option>{t('payment.online')}</option>
                <option>{t('payment.cheque')}</option>
              </select>

              {/* AMOUNT */}
              <input
                type="text"
                inputMode="decimal"
                placeholder={t('common.amount')}
                className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-right shadow-sm"
                value={entry.amount}
                onChange={(e) => {
                  const value = e.target.value;

                  const handCash = accounts.find(
                    (a) => a.category?.toLowerCase() === 'cash' || a.type?.toLowerCase() === 'cash'
                  );

                  setPaymentEntries((prev) =>
                    prev.map((item, i) => {
                      if (i !== index) return item;

                      return {
                        ...item,
                        amount: value,

                        account:
                          Number(value) > 0 &&
                          !item.account &&
                          item.paymentType === 'Cash' &&
                          handCash
                            ? handCash._id
                            : item.account,
                      };
                    })
                  );
                }}
                required
              />

              {/* REMOVE */}
              <button
                type="button"
                onClick={() => setPaymentEntries((prev) => prev.filter((_, i) => i !== index))}
                className="col-span-1 text-red-500 text-sm md:text-lg"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setPaymentEntries((prev) => [
                ...prev,
                { account: '', amount: '', paymentType: formData.paymentType },
              ])
            }
            className="text-blue-600 text-sm mt-1 font-medium hover:text-blue-800"
          >
            + {t('payment.addAnother')}
          </button>
          <div className="flex justify-end mt-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Discount"
              className="w-32 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 text-xs md:text-sm text-right shadow-sm"
              name="discountAmount"
              value={formData.discountAmount || ''}
              onChange={handleChange}
            />
          </div>

          {/* TOTAL */}
          <div className="flex justify-end mt-4">
            <div className="w-full md:w-56 rounded-lg md:rounded-xl p-2 md:p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
              <div className="flex justify-between font-semibold text-sm">
                <span>{t('common.total')}</span>
                <span>
                  {(
                    paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0) +
                    Number(formData.discountAmount || 0)
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 flex flex-wrap justify-between md:justify-end items-center gap-2 md:gap-3 mt-3 md:mt-4">
          {((id && canEditPayBills) || (!id && canCreatePayBills)) && (
            <>
              <button
                type="submit"
                disabled={loading}
                className={`text-white px-3 py-1.5 rounded-xl shadow transition-all duration-200 ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed opacity-70'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-105'
                }`}
              >
                {loading ? t('saving') : id ? t('common.updateClose') : t('common.saveClose')}
              </button>

              <button
                type="button"
                onClick={(e) => handleSubmit(e, 'new')}
                disabled={loading}
                className={`text-white px-3 py-1.5 rounded-xl shadow transition-all duration-200 ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed opacity-70'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-105'
                }`}
              >
                {loading ? t('saving') : t('common.saveNew')}
              </button>
            </>
          )}

          {((id && canEditPayBills) || (!id && canCreatePayBills)) && (
            <button
              type="button"
              onClick={handleRevert}
              className="bg-gradient-to-r from-gray-400 to-gray-500 text-white px-3 py-1.5 rounded-xl shadow"
            >
              {id ? t('common.revert') : t('common.clear')}
            </button>
          )}

          {canViewPayBills &&
            (formData.supplier || formData.partyId) &&
            paymentEntries.length > 0 && (
              <>
                <button
                  onClick={handlePrint}
                  type="button"
                  className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-3 py-1.5 rounded-xl shadow"
                >
                  🖨 {t('common.print')}
                </button>
                <button
                  onClick={handleExportPDF}
                  type="button"
                  className="bg-gradient-to-r from-red-500 to-red-700 text-white px-3 py-1.5 rounded-xl shadow"
                >
                  ⬇️ {t('pdf')}
                </button>
              </>
            )}
        </div>
        {ledgerLoading && (
          <div className="md:col-span-2 text-center text-sm text-gray-500 py-3">
            Supplier Ledger Loading...
          </div>
        )}
        {supplierLedger.length > 0 && (
          <div className="md:col-span-2 border-t pt-4" ref={printRef}>
            <h3 className="text-lg font-semibold mb-2">{t('supplier.ledgerPreview')}</h3>
            <table className="w-full text-sm border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-1">{t('common.date')}</th>
                  <th className="border p-1">{t('common.billNo')}</th>
                  <th className="border p-1">{t('common.description')}</th>
                  <th className="border p-1">{t('common.debit')}</th>
                  <th className="border p-1">{t('common.credit')}</th>
                  <th className="border p-1">{t('common.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {supplierLedger.map((e, i) => (
                  <tr key={i}>
                    <td className="border p-1">{formatBusinessDateForDisplay(e.date)}</td>
                    <td className="border p-1">{e.billNo || '-'}</td>
                    <td className="border p-1">{e.description || '-'}</td>
                    <td className="border p-1 text-right">{e.debit?.toFixed(2) || '0.00'}</td>
                    <td className="border p-1 text-right">{e.credit?.toFixed(2) || '0.00'}</td>
                    <td className="border p-1 text-right">{e.balance?.toFixed(2) || '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AttachmentViewerModal
          attachment={modalAttachment}
          onClose={() => setModalAttachment(null)}
        />
      </form>
    </>
  );
};

export default PayBillForm;
