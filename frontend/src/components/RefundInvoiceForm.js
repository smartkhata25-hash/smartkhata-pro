import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRefund, updateRefund, getRefundById } from '../services/refundService';
import { getInvoiceById } from '../services/salesService';
import { getCustomerBalance } from '../services/customerLedgerService';
import { getPartyBalance } from '../services/partyLedgerService';
import {
  fetchInvoiceFormOptions,
  getCachedInvoiceFormOptions,
} from '../services/invoiceFormOptionsService';
import InvoiceSearchModal from './InvoiceSearchModal';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPrintSettings,
  updatePrintSettings,
  resetPrintSettings,
} from '../services/printSettingService';
import ProductDropdown from './ProductDropdown';
import useFormPersist from '../hooks/useFormPersist';
import AttachmentViewerModal from './AttachmentViewerModal';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import {
  formatBusinessDateForDisplay,
  getBusinessDateInputValue,
  getBusinessTimeInputValue,
} from '../utils/localDateTime';
const API = process.env.REACT_APP_API_BASE_URL;

const RefundInvoiceForm = ({
  token,
  onCustomerChange,
  onProductChange,
  salesHistory = [],
  loadingHistory = false,
}) => {
  const getCurrentTime = () => getBusinessTimeInputValue();

  const [productList, setProductList] = useState([]);

  const populateForm = useCallback((data) => {
    if (!data) return;

    const customerObject =
      data.customerId && typeof data.customerId === 'object' ? data.customerId : null;

    const partyObject = data.partyId && typeof data.partyId === 'object' ? data.partyId : null;

    const customerRecordId = customerObject?._id || data.customerId || '';

    const partyRecordId = partyObject?._id || data.partyId || '';

    const isPartyRefund = Boolean(partyRecordId);

    const normalizedPaymentType = String(
      data.paymentMode || data.paymentType || 'credit'
    ).toLowerCase();

    const isCashRefund = Number(data.paidAmount || 0) > 0 && normalizedPaymentType !== 'credit';

    setBillNo(data.billNo || '');

    setCustomerName(data.customerName || partyObject?.name || customerObject?.name || '');

    setCustomerPhone(data.customerPhone || partyObject?.phone || customerObject?.phone || '');

    setCustomerId(isPartyRefund ? partyRecordId : customerRecordId);

    setSelectedCustomerType(isPartyRefund ? 'party' : 'customer');

    setInvoiceDate(getBusinessDateInputValue(data.invoiceDate) || '');

    setInvoiceTime(data.invoiceTime || getCurrentTime());

    setNotes(data.notes || '');

    setRefundMethod(isCashRefund ? 'cash' : 'credit');

    setPaymentType(isCashRefund ? normalizedPaymentType : 'cash');

    setAccountId(data.accountId?._id || data.accountId || data.account?._id || '');

    setOriginalInvoiceId(data.originalInvoiceId?._id || data.originalInvoiceId || '');

    const openingMode = data.isOpening === true;

    setIsOpeningRefund(openingMode);

    setOpeningRefundAmount(openingMode ? Number(data.totalAmount || 0) : 0);

    setAttachments(Array.isArray(data.attachments) ? data.attachments : []);

    const refundItems = Array.isArray(data.items) ? data.items : [];

    const loadedItems = refundItems.map((item) => {
      const populatedProduct =
        item.productId && typeof item.productId === 'object' ? item.productId : null;

      const productId = populatedProduct?._id || item.productId || '';

      const price = Number(
        item.price ??
          populatedProduct?.salePrice ??
          populatedProduct?.unitPrice ??
          populatedProduct?.price ??
          0
      );

      const quantity = Number(item.quantity || 0);

      return {
        productId,

        name: populatedProduct?.name || item.name || '',

        quantity,

        price,

        total: Number(item.total ?? quantity * price).toFixed(2),
      };
    });

    const emptyRows = Array.from(
      {
        length: Math.max(0, 20 - loadedItems.length),
      },
      () => blankRow()
    );

    setItems([...loadedItems, ...emptyRows]);
  }, []);

  const { id } = useParams();
  const navigate = useNavigate();

  const canViewRefunds = hasPermission('refunds.view');
  const canCreateRefunds = hasPermission('refunds.create');
  const canEditRefunds = hasPermission('refunds.edit');

  const [items, setItems] = useState([]);
  const [billNo, setBillNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(getBusinessDateInputValue());
  const [invoiceTime, setInvoiceTime] = useState(getCurrentTime());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [refundMethod, setRefundMethod] = useState('credit');
  const [accountId, setAccountId] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState('customer');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [accounts, setAccounts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [modalAttachment, setModalAttachment] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [isOpeningRefund, setIsOpeningRefund] = useState(false);
  const [openingRefundAmount, setOpeningRefundAmount] = useState(0);
  const [customerBalance, setCustomerBalance] = useState(0);

  const scrollRef = useRef();
  const fileInputRef = useRef(null);
  // 🔵 Print Settings States
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadPrintSettings = async () => {
    try {
      const data = await getPrintSettings();
      setPrintSettings(data);
    } catch (err) {
      console.error('Failed to load print settings');
    }
  };

  const blankRow = () => ({
    productId: '',
    name: '',
    quantity: '',
    price: '',
    total: '',
  });

  const generateLivePreview = useCallback(async () => {
    try {
      if (!printSettings?.saleReturn) return;

      const token = localStorage.getItem('token');

      const res = await fetch(`${API}/api/print/preview-settings-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'saleReturn',
          settings: printSettings.saleReturn,
        }),
      });

      const html = await res.text();
      setPreviewHtml(html);
    } catch (err) {
      console.error('Preview failed');
    }
  }, [printSettings]);

  useEffect(() => {
    setItems(Array.from({ length: 20 }, () => blankRow()));
  }, []);

  useEffect(() => {
    if (showPrintSettings && printSettings?.saleReturn) {
      generateLivePreview();
    }
  }, [showPrintSettings, printSettings, generateLivePreview]);

  // ✅ Load for Edit (after productList available)
  useEffect(() => {
    if (!id) return;

    if (!canViewRefunds || !canEditRefunds) {
      alert('You do not have permission to edit sale refunds');
      navigate('/refunds');
      return;
    }

    let cancelled = false;

    const loadForEdit = async () => {
      try {
        setEditLoading(true);

        const data = await getRefundById(id, token);

        if (cancelled) return;

        populateForm(data);
      } catch (err) {
        if (cancelled) return;

        console.error('❌ Refund Invoice edit load failed:', err?.response?.data || err.message);

        alert(err?.response?.data?.error || t('alerts.invoiceLoadFailed'));
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    };

    loadForEdit();

    return () => {
      cancelled = true;
    };
  }, [id, token, populateForm, canViewRefunds, canEditRefunds, navigate]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const applyOptions = (data) => {
      if (!data || cancelled) return;

      setCustomers(Array.isArray(data.customers) ? data.customers : []);

      setParties(Array.isArray(data.parties) ? data.parties : []);

      setProductList(Array.isArray(data.products) ? data.products : []);

      setAccounts(Array.isArray(data.paymentAccounts) ? data.paymentAccounts : []);
    };

    const cachedOptions = getCachedInvoiceFormOptions();

    if (cachedOptions) {
      applyOptions(cachedOptions);
    }

    const loadFormOptions = async () => {
      try {
        const options = await fetchInvoiceFormOptions();

        applyOptions(options);
      } catch (error) {
        console.error('Refund invoice form options load failed:', error);
      }
    };

    loadFormOptions();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (refundMethod !== 'cash') {
      setAccountId('');
      return;
    }

    if (accountId) return;

    if (accounts.length === 0) return;

    const handCash = accounts.find(
      (account) =>
        account.name?.trim().toLowerCase().includes('cash') ||
        account.category?.toLowerCase() === 'cash' ||
        account.type?.toLowerCase() === 'cash'
    );

    if (handCash) {
      setAccountId(handCash._id);
    }
  }, [refundMethod, accounts, accountId]);

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    if (field === 'quantity' || field === 'price') {
      const q = parseFloat(updated[index].quantity) || 0;
      const p = parseFloat(updated[index].price) || 0;
      updated[index].total = isNaN(q * p) ? '0.00' : (q * p).toFixed(2);
    }

    setItems(updated);

    const hasEmptyRow = updated.some(
      (row) => !row.productId && !row.name && !row.quantity && !row.price
    );

    if (index === items.length - 1 && field === 'name' && value.trim() !== '' && !hasEmptyRow) {
      setItems([...updated, blankRow()]);

      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    } else {
      setItems(updated);
    }
  };

  const handleClear = () => {
    clear();

    setItems(Array.from({ length: 20 }, () => blankRow()));

    setBillNo('');

    setInvoiceDate(getBusinessDateInputValue());
    setInvoiceTime(getCurrentTime());

    setCustomerName('');
    setCustomerPhone('');
    setCustomerId('');
    setSelectedCustomerType('customer');

    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);
    setCustomerBalance(0);

    setNotes('');

    setRefundMethod('credit');
    setPaymentType('cash');
    setAccountId('');

    setOriginalInvoiceId('');

    setIsOpeningRefund(false);
    setOpeningRefundAmount(0);

    setAttachments([]);
    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    onCustomerChange && onCustomerChange('');
  };

  const handleRevert = async () => {
    if (!id) {
      handleClear();
      return;
    }

    try {
      setEditLoading(true);

      const data = await getRefundById(id, token);

      populateForm(data);

      setCustomerBalance(0);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('❌ Refund Invoice revert failed:', err?.response?.data || err.message);

      alert(err?.response?.data?.error || t('alerts.invoiceLoadFailed'));
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (!id || !customerId) return;

    let cancelled = false;

    const loadEditCustomerBalance = async () => {
      try {
        let result;

        if (selectedCustomerType === 'party') {
          result = await getPartyBalance(customerId);
        } else {
          const customer = customers.find((item) => String(item._id) === String(customerId));

          const customerAccountId = customer?.account?._id || customer?.account;

          if (!customerAccountId) {
            if (!cancelled) {
              setCustomerBalance(0);
            }

            return;
          }

          result = await getCustomerBalance(customerAccountId);
        }

        if (cancelled) return;

        const balance = Number(
          result?.balance ?? result?.closingBalance ?? result?.currentBalance ?? 0
        );

        setCustomerBalance(balance);
      } catch (err) {
        if (cancelled) return;

        console.error('Refund customer balance load failed:', err);

        setCustomerBalance(0);
      }
    };

    if (selectedCustomerType === 'party' || customers.length > 0) {
      loadEditCustomerBalance();
    }

    return () => {
      cancelled = true;
    };
  }, [id, customerId, selectedCustomerType, customers]);
  const totalAmount = isOpeningRefund
    ? Number(openingRefundAmount || 0)
    : items.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);

  const refundCustomerTotalBalance =
    refundMethod === 'credit'
      ? Number(customerBalance || 0) - Number(totalAmount || 0)
      : Number(customerBalance || 0);

  const formState = {
    items,
    billNo,
    invoiceDate,
    invoiceTime,
    customerName,
    customerPhone,
    customerId,
    selectedCustomerType,
    notes,
    refundMethod,
    accountId,
    paymentType,
    originalInvoiceId,
    isOpeningRefund,
    openingRefundAmount,
  };

  const restoreRefundDraft = useCallback((valueOrUpdater) => {
    const defaultState = {
      items: [],
      billNo: '',
      invoiceDate: getBusinessDateInputValue(),
      invoiceTime: getCurrentTime(),
      customerName: '',
      customerPhone: '',
      customerId: '',
      selectedCustomerType: 'customer',
      notes: '',
      refundMethod: 'credit',
      accountId: '',
      paymentType: 'cash',
      originalInvoiceId: '',
      isOpeningRefund: false,
      openingRefundAmount: 0,
    };

    const data =
      typeof valueOrUpdater === 'function' ? valueOrUpdater(defaultState) : valueOrUpdater;

    if (!data || typeof data !== 'object') return;

    const loadedItems = Array.isArray(data.items) ? data.items : [];

    const emptyRows = Array.from({ length: Math.max(0, 20 - loadedItems.length) }, () =>
      blankRow()
    );

    setItems([...loadedItems, ...emptyRows]);

    setBillNo(data.billNo || '');

    setInvoiceDate(getBusinessDateInputValue(data.invoiceDate) || getBusinessDateInputValue());

    setInvoiceTime(data.invoiceTime || getCurrentTime());

    setCustomerName(data.customerName || '');
    setCustomerPhone(data.customerPhone || '');

    setCustomerId(data.customerId || '');

    setSelectedCustomerType(data.selectedCustomerType || 'customer');

    setNotes(data.notes || '');

    setRefundMethod(data.refundMethod || 'credit');

    setAccountId(data.accountId || '');

    setPaymentType(data.paymentType || 'cash');

    setOriginalInvoiceId(data.originalInvoiceId || '');

    setIsOpeningRefund(data.isOpeningRefund === true);

    setOpeningRefundAmount(Number(data.openingRefundAmount || 0));
  }, []);

  const shouldSaveRefundDraft = useCallback((draft) => {
    if (!draft) return false;

    const hasCustomer = Boolean(draft.customerName?.trim()) || Boolean(draft.customerId);

    const hasItems =
      Array.isArray(draft.items) &&
      draft.items.some(
        (item) =>
          item?.productId ||
          item?.name?.trim() ||
          Number(item?.quantity || 0) > 0 ||
          Number(item?.price || 0) > 0
      );

    const hasOtherData =
      Boolean(draft.billNo?.trim()) ||
      Boolean(draft.notes?.trim()) ||
      Boolean(draft.originalInvoiceId) ||
      draft.isOpeningRefund === true ||
      Number(draft.openingRefundAmount || 0) > 0;

    return hasCustomer || hasItems || hasOtherData;
  }, []);

  const { clear } = useFormPersist(
    !id ? 'refund_invoice_draft' : null,
    formState,
    restoreRefundDraft,
    {
      expiryHours: 24,
      delay: 500,
      shouldSave: shouldSaveRefundDraft,
    }
  );

  const handleSubmit = async (action) => {
    if (saveLoading) return false;

    if (id && !canEditRefunds) {
      alert('You do not have permission to edit sale refunds');
      return false;
    }

    if (!id && !canCreateRefunds) {
      alert('You do not have permission to create sale refunds');
      return false;
    }

    const filteredItems = items.filter((item) => item.name && Number(item.quantity) > 0);

    const safeTime = invoiceTime || getCurrentTime();

    if (!invoiceDate) {
      alert(t('alerts.fillRequiredFields'));
      return false;
    }

    if (!customerName.trim()) {
      alert(t('alerts.customerRequired'));
      return false;
    }

    const calculatedTotalAmount = isOpeningRefund
      ? Number(openingRefundAmount || 0)
      : items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

    if (filteredItems.length === 0 && !isOpeningRefund) {
      alert(t('alerts.addProduct'));
      return false;
    }

    if (refundMethod === 'cash' && !accountId) {
      alert(t('alerts.selectAccount'));
      return false;
    }

    const selectedCustomer =
      selectedCustomerType === 'party'
        ? parties.find((party) => String(party._id) === String(customerId))
        : customers.find((customer) => String(customer._id) === String(customerId));

    if (!selectedCustomer) {
      alert(t('alerts.customerRequired'));
      return false;
    }

    try {
      setSaveLoading(true);

      const formData = new FormData();

      formData.append('billNo', billNo || '');

      if (originalInvoiceId) {
        formData.append('originalInvoiceId', originalInvoiceId);
      }

      if (selectedCustomerType === 'party') {
        formData.append('partyId', customerId);
      } else {
        formData.append('customerId', selectedCustomer._id);
      }

      formData.append('customerName', selectedCustomer.name);
      formData.append('customerPhone', customerPhone || '');
      formData.append('invoiceDate', invoiceDate);
      formData.append('invoiceTime', safeTime);
      formData.append('notes', notes || '');
      formData.append('totalAmount', calculatedTotalAmount);

      formData.append('paidAmount', refundMethod === 'cash' ? calculatedTotalAmount : 0);

      formData.append('paymentType', refundMethod === 'cash' ? paymentType : 'credit');

      formData.append('accountId', refundMethod === 'cash' ? accountId : '');

      formData.append(
        'items',
        JSON.stringify(
          filteredItems.map((item) => ({
            productId: item.productId?._id || item.productId,

            quantity: Number(item.quantity),
            price: Number(item.price),
            total: Number(item.total),
          }))
        )
      );

      attachments.forEach((file) => {
        if (file instanceof File) {
          formData.append('attachments', file);
        }
      });

      const keepAttachmentKeys = attachments
        .filter((file) => !(file instanceof File))
        .map((file) => file.key)
        .filter(Boolean);

      formData.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));

      formData.append('isOpening', isOpeningRefund ? 'true' : 'false');

      let savedRefund;

      if (id) {
        savedRefund = await updateRefund(id, formData, token);
      } else {
        savedRefund = await createRefund(formData, token);
      }

      clear();

      if (action === 'new') {
        if (id) {
          navigate('/refunds/new', { replace: true });
        }

        handleClear();
      } else if (action === 'close') {
        if (!id) {
          handleClear();
        }

        navigate('/dashboard');
      }

      return savedRefund || true;
    } catch (err) {
      console.error('Refund Error:', err);

      if (
        err?.response?.data?.detail?.includes('E11000 duplicate key') ||
        err?.message?.includes('E11000')
      ) {
        alert(t('alerts.billRequired'));
      } else {
        alert(
          err?.response?.data?.error || err?.response?.data?.detail || t('alerts.invoiceSaveFailed')
        );
      }

      return false;
    } finally {
      setSaveLoading(false);
    }
  };

  const handleInvoiceSelect = async (invoice) => {
    if (!invoice) return;

    let selectedInvoice = invoice;

    if (!Array.isArray(selectedInvoice.items) || selectedInvoice.items.length === 0) {
      try {
        selectedInvoice = await getInvoiceById(invoice._id, token);
      } catch (err) {
        console.error('Refund original invoice load failed:', err?.response?.data || err.message);
        alert(err?.response?.data?.message || t('alerts.invoiceLoadFailed'));
        return;
      }
    }

    setShowSearchModal(false);
    setOriginalInvoiceId(selectedInvoice._id || invoice._id);

    const partyId = selectedInvoice.partyId?._id || selectedInvoice.partyId || '';
    const customerRecordId = selectedInvoice.customerId?._id || selectedInvoice.customerId || '';
    setCustomerId(partyId || customerRecordId);
    setSelectedCustomerType(partyId ? 'party' : 'customer');

    setBillNo(`REF-${selectedInvoice.billNo || invoice.billNo || ''}`);
    setCustomerName(
      selectedInvoice.customerName ||
        selectedInvoice.partyId?.name ||
        selectedInvoice.customerId?.name ||
        ''
    );
    setCustomerPhone(
      selectedInvoice.customerPhone ||
        selectedInvoice.partyId?.phone ||
        selectedInvoice.customerId?.phone ||
        ''
    );

    const loadedItems = (selectedInvoice.items || []).map((item) => {
      const populatedProduct =
        item.productId && typeof item.productId === 'object' ? item.productId : null;

      const productId = populatedProduct?._id || item.productId || '';

      const fallbackProduct = !populatedProduct
        ? productList.find((product) => String(product._id) === String(productId))
        : null;

      const price = Number(
        item.price ??
          item.rate ??
          populatedProduct?.salePrice ??
          fallbackProduct?.salePrice ??
          fallbackProduct?.unitPrice ??
          fallbackProduct?.price ??
          0
      );
      const quantity = Number(item.quantity || 0);
      const total = Number(item.total ?? item.amount ?? quantity * price);
      const name = populatedProduct?.name || fallbackProduct?.name || item.search || item.name || '';

      return {
        productId,

        name,

        search: name,

        description:
          populatedProduct?.description || fallbackProduct?.description || item.description || '',

        uom:
          populatedProduct?.uom ||
          populatedProduct?.unit ||
          fallbackProduct?.uom ||
          fallbackProduct?.unit ||
          item.uom ||
          '',

        quantity,

        price,

        rate: price,

        total: total.toFixed(2),

        amount: total,
      };
    });

    const emptyRows = Array.from(
      {
        length: Math.max(0, 20 - loadedItems.length),
      },
      () => blankRow()
    );

    setItems([...loadedItems, ...emptyRows]);
  };

  const handleCustomerInput = (e) => {
    const value = e.target.value;
    setCustomerName(value);

    if (value.trim() === '') {
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);

      setCustomerPhone('');
      setCustomerId('');
      setSelectedCustomerType('customer');
      setCustomerBalance(0);

      onCustomerChange && onCustomerChange('');
    } else {
      const customerResults = customers.map((c) => ({
        ...c,
        selectType: 'customer',
      }));

      const partyResults = parties.map((p) => ({
        ...p,
        phone: p.phone || '',
        selectType: 'party',
      }));

      const searchValue = value.toLowerCase();

      const filtered = [...customerResults, ...partyResults]
        .filter((item) => {
          const name = String(item?.name || '').toLowerCase();
          const phone = String(item?.phone || '');

          return name.includes(searchValue) || phone.includes(value);
        })
        .slice(0, 50);

      setCustomerSuggestions(filtered);
      setSelectedCustomerIndex(-1);
    }
  };

  const handleCustomerKeyDown = (e) => {
    if (customerSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCustomerIndex((prev) => (prev < customerSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCustomerIndex((prev) => (prev > 0 ? prev - 1 : customerSuggestions.length - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = customerSuggestions[selectedCustomerIndex];
      if (selected) {
        handleCustomerSelect(selected.name, selected.phone, selected._id, selected.selectType);
      }
    }
  };

  const handleCustomerSelect = async (name, phone, id, type = 'customer') => {
    setCustomerName(name || '');
    setCustomerPhone(phone || '');
    setCustomerId(id);
    setSelectedCustomerType(type);

    onCustomerChange && onCustomerChange(id);

    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);

    try {
      let result;

      if (type === 'party') {
        result = await getPartyBalance(id);
      } else {
        const selectedCustomer = customers.find((customer) => String(customer?._id) === String(id));

        const selectedAccountId = selectedCustomer?.account?._id || selectedCustomer?.account;

        if (!selectedAccountId) {
          setCustomerBalance(0);
          return;
        }

        result = await getCustomerBalance(selectedAccountId);
      }

      const balance = Number(
        result?.balance ?? result?.closingBalance ?? result?.currentBalance ?? 0
      );

      setCustomerBalance(balance);
    } catch (err) {
      console.error('Refund customer balance load failed:', err);

      setCustomerBalance(0);
    }
  };

  return (
    <>
      {editLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl font-semibold">
            Refund Invoice Loading...
          </div>
        </div>
      )}

      <div className="refund-invoice-form p-2 md:p-4 bg-white rounded shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {id ? `✏️ ${t('purchase.editRefund')}` : `🔁 ${t('purchase.newRefund')}`}
          </h2>

          <button
            type="button"
            onClick={async () => {
              await loadPrintSettings();
              setShowPrintSettings(true);
            }}
            className="px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200"
          >
            ⚙️
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="relative">
            <input
              type="text"
              className="border p-1 text-sm w-full"
              placeholder={t('customerName')}
              value={customerName}
              onChange={handleCustomerInput}
              onKeyDown={handleCustomerKeyDown}
              autoComplete="off"
            />
            {customerSuggestions.length > 0 && (
              <ul className="absolute bg-white border mt-1 w-full max-h-32 overflow-auto z-10">
                {customerSuggestions.map((c, i) => (
                  <li
                    key={i}
                    onClick={() => handleCustomerSelect(c.name, c.phone, c._id, c.selectType)}
                    style={{
                      backgroundColor: selectedCustomerIndex === i ? '#e0f2fe' : 'white',
                      fontWeight: selectedCustomerIndex === i ? 'bold' : 'normal',
                      padding: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    {c.name}
                    {c.selectType === 'party' && ' 🟣 Party'}
                    {' - '}
                    {c.phone}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            type="date"
            className="border p-1 text-sm"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <input
            type="time"
            className="border p-1 text-sm"
            value={invoiceTime}
            onChange={(e) => setInvoiceTime(e.target.value)}
          />
          <input
            className="border p-1 text-sm bg-gray-100"
            placeholder={t('purchase.refundBillNo')}
            value={billNo}
            readOnly
          />

          <input
            className="border p-1 text-sm"
            placeholder={t('phone')}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
          <select
            className="border p-1 text-sm"
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
          >
            <option value="cash">{t('purchase.cashRefund')}</option>
            <option value="credit">{t('purchase.adjustCredit')}</option>
          </select>
          {refundMethod === 'cash' && (
            <select
              className="border p-1 text-sm"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option value="cash">{t('payment.cash')}</option>
              <option value="online">{t('payment.online')}</option>
              <option value="cheque">{t('payment.cheque')}</option>
            </select>
          )}

          {refundMethod === 'cash' && (
            <select
              className="border p-1 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">-- {t('expense.selectAccount')} --</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.code} - {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          )}

          <textarea
            className="border p-1 col-span-2 text-sm"
            placeholder={t('description')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="col-span-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);

                if (attachments.length + newFiles.length > 3) {
                  alert('Maximum 3 attachments allowed');
                  e.target.value = '';
                  return;
                }

                setAttachments((prev) => [...prev, ...newFiles]);
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= 3}
              className={`px-3 py-2 rounded-lg text-sm shadow ${
                attachments.length >= 3
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              📎 Add Files ({attachments.length}/3)
            </button>

            {attachments.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {attachments.map((file, index) => {
                  const isNewFile = file instanceof File;
                  const fileUrl = isNewFile
                    ? URL.createObjectURL(file)
                    : file.fullUrl || file.url || '';

                  return (
                    <div
                      key={file.key || index}
                      className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-xl text-xs"
                    >
                      <span className="text-blue-600">📎 File {index + 1}</span>

                      {fileUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setModalAttachment({
                              url: fileUrl,
                              type: file.type || '',
                            })
                          }
                          className="text-green-600 underline"
                        >
                          👁 View
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t('alerts.removeAttachment'))) {
                            setAttachments((prev) => prev.filter((_, i) => i !== index));

                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }
                        }}
                        className="text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {isOpeningRefund && (
          <div className="mb-2 px-3 py-2 rounded bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-semibold">
            ⚠️ Opening Refund Entry
          </div>
        )}

        {isOpeningRefund && (
          <div className="mb-3 p-3 border rounded bg-blue-50">
            <label className="block text-sm font-semibold mb-2">Opening Refund Amount</label>

            <input
              type="text"
              inputMode="decimal"
              value={openingRefundAmount}
              onChange={(e) => setOpeningRefundAmount(e.target.value)}
              className="border px-3 py-2 w-64 rounded no-spinner"
            />
          </div>
        )}

        {!isOpeningRefund && (
          <div
            ref={scrollRef}
            className="border overflow-y-auto mb-4"
            style={{ maxHeight: '50vh', minHeight: '300px' }}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="p-2 border">{t('item')}</th>
                  <th className="p-2 border">{t('qty')}</th>
                  <th className="p-2 border">{t('rate')}</th>
                  <th className="p-2 border">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    <td className="border p-1">
                      <ProductDropdown
                        productList={productList}
                        value={item.name}
                        onSelect={(selectedProduct) => {
                          const updated = [...items];
                          const qty = parseFloat(updated[idx].quantity) || 1;
                          updated[idx] = {
                            ...updated[idx],
                            name: selectedProduct.name,
                            productId: selectedProduct._id,
                            price:
                              selectedProduct.salePrice ||
                              selectedProduct.unitPrice ||
                              selectedProduct.price ||
                              0,
                            quantity: qty,
                            total: (
                              (selectedProduct.salePrice ||
                                selectedProduct.unitPrice ||
                                selectedProduct.price ||
                                0) * qty
                            ).toFixed(2),
                          };
                          setItems(updated);
                          onProductChange && onProductChange(selectedProduct._id);
                        }}
                      />
                    </td>
                    <td className="border p-1">
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        className="w-full text-center no-spinner"
                      />
                    </td>
                    <td className="border p-1">
                      <input
                        type="number"
                        value={item.price || ''}
                        onChange={(e) => {
                          handleItemChange(idx, 'price', e.target.value);
                        }}
                        onWheel={(e) => e.target.blur()}
                        onBlur={() => {
                          const updated = [...items];
                          const q = parseFloat(updated[idx].quantity) || 0;
                          const p = parseFloat(updated[idx].price) || 0;
                          updated[idx].total = (q * p).toFixed(2);
                          setItems(updated);
                        }}
                        className="w-full text-center no-spinner"
                      />
                    </td>
                    <td className="border p-1 text-center">{item.total || '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="sticky bottom-0 bg-white border-t py-3 flex flex-col md:flex-row md:justify-between md:items-center gap-2 px-4">
          {/* LEFT SIDE — Find + Print + PDF */}
          <div className="flex flex-wrap items-center gap-2 order-2 md:order-none">
            {canViewRefunds && (
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                className="flex items-center gap-1 px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl
bg-gradient-to-r from-blue-700 to-blue-500
text-white
hover:from-blue-800 hover:to-blue-600
transition-all duration-300 text-xs md:text-sm font-semibold
shadow-md hover:shadow-lg"
              >
                <span>🔍</span>
              </button>
            )}
            {/* 📖 Mobile History Button */}
            {canViewRefunds && (
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="md:hidden flex items-center gap-2 px-3 py-2 rounded-xl
    bg-yellow-600 text-white text-sm font-semibold shadow"
              >
                <span>📖</span>
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                const previewItems = items
                  .filter((i) => i.productId && i.quantity > 0)
                  .map((i) => ({
                    productId: i.productId,
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                    total: i.total,
                  }));
                const printData = {
                  lang: localStorage.getItem('lang') || 'en',
                  invoiceDate,
                  invoiceTime,
                  billNo,
                  customerName,
                  customerPhone,
                  items: previewItems,
                  totalAmount,
                  paidAmount: refundMethod === 'cash' ? totalAmount : 0,
                  paymentType: refundMethod === 'cash' ? paymentType : 'credit',

                  customerTotalBalance: refundCustomerTotalBalance,
                };

                const saved = await handleSubmit('print');

                if (!saved) return;

                navigate('/print/refund/preview', {
                  replace: true,
                  state: {
                    autoPrint: true,
                    isPreview: true,
                    type: 'refund',
                    invoiceData: printData,
                  },
                });
              }}
              className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl
bg-gradient-to-r from-gray-800 to-gray-600
text-white
hover:from-black hover:to-gray-700
transition-all duration-300 text-xs md:text-sm font-semibold
shadow-md hover:shadow-lg"
            >
              🖨 <span>{t('print')}</span>
            </button>
            <button
              type="button"
              disabled={pdfLoading}
              onClick={async () => {
                try {
                  setPdfLoading(true);

                  const previewItems = items
                    .filter((i) => i.productId && i.quantity > 0)
                    .map((i) => ({
                      productId: i.productId,
                      name: i.name,
                      quantity: Number(i.quantity),
                      price: Number(i.price),
                      total: Number(i.total),
                    }));

                  if (previewItems.length === 0 && !isOpeningRefund) {
                    alert(t('alerts.addProduct'));
                    return;
                  }

                  if (!customerName.trim()) {
                    alert(t('alerts.customerRequired'));
                    return;
                  }

                  const payload = {
                    lang: localStorage.getItem('lang') || 'en',
                    invoiceDate,
                    invoiceTime,
                    billNo,
                    customerName,
                    customerPhone,
                    items: previewItems,
                    totalAmount,
                    paidAmount: refundMethod === 'cash' ? totalAmount : 0,
                    paymentType: refundMethod === 'cash' ? paymentType : 'credit',
                    customerTotalBalance: refundCustomerTotalBalance,
                  };

                  const token = localStorage.getItem('token');

                  const res = await fetch(`${API}/api/print/sale-return-pdf`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                  });

                  if (!res.ok) {
                    throw new Error('PDF generation failed');
                  }

                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);

                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Sale-Return-${billNo || 'Preview'}.pdf`;

                  document.body.appendChild(a);
                  a.click();
                  a.remove();

                  window.URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Refund PDF Error:', err);
                  alert(t('alerts.pdfFailed'));
                } finally {
                  setPdfLoading(false);
                }
              }}
              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl
text-white transition-all duration-300 text-xs md:text-sm font-semibold shadow-md hover:shadow-lg ${
                pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {pdfLoading ? `⏳ ${t('pdf.preparing')}` : `📄 ${t('pdf.download')}`}
            </button>
          </div>

          {/* RIGHT SIDE — Save Buttons */}
          <div className="flex flex-wrap gap-2 justify-end order-3 md:order-none">
            {((id && canEditRefunds) || (!id && canCreateRefunds)) && (
              <>
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={() => handleSubmit('close')}
                  className={`px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
    bg-gradient-to-r from-emerald-700 to-green-600
    text-white
    transition-all duration-300 font-semibold
    shadow-md
    ${
      saveLoading
        ? 'opacity-60 cursor-not-allowed'
        : 'hover:from-emerald-800 hover:to-green-700 hover:shadow-lg'
    }`}
                >
                  {saveLoading ? '⏳ Saving...' : id ? t('updateClose') : t('saveClose')}
                </button>

                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={() => handleSubmit('new')}
                  className={`px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
    bg-gradient-to-r from-blue-700 to-indigo-600
    text-white
    transition-all duration-300 font-semibold
    shadow-md
    ${
      saveLoading
        ? 'opacity-60 cursor-not-allowed'
        : 'hover:from-blue-800 hover:to-indigo-700 hover:shadow-lg'
    }`}
                >
                  {saveLoading ? '⏳ Saving...' : t('saveNew')}
                </button>
              </>
            )}

            <button
              type="button"
              disabled={editLoading || saveLoading}
              onClick={handleRevert}
              className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
bg-gradient-to-r from-gray-600 to-gray-500
text-white
hover:from-gray-700 hover:to-gray-600
transition-all duration-300 font-medium
shadow-sm hover:shadow-md
disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {editLoading ? '⏳ Loading...' : id ? t('common.revert') : t('clear')}
            </button>
            {/* 💰 Total Amount */}
            <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-gray-700 order-1 md:order-none">
              <span>{t('total')}:</span>
              <span className="bg-gray-100 px-2 py-1 rounded">Rs. {totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {showPrintSettings && printSettings?.saleReturn && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded shadow-lg w-[98vw] h-[96vh] overflow-hidden flex gap-4">
              {/* LEFT SIDE */}
              <div className="w-[32%] space-y-4 text-sm overflow-y-auto pr-2">
                <h3 className="text-lg font-bold">{t('print.salesSettings')}</h3>

                {/* HEADER */}
                <div className="space-y-2">
                  <h4 className="font-semibold">{t('print.header')}</h4>

                  <input
                    type="text"
                    placeholder={t('print.companyName')}
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.header.companyName}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          header: {
                            ...printSettings.saleReturn.header,
                            companyName: e.target.value,
                          },
                        },
                      })
                    }
                  />

                  <input
                    type="text"
                    placeholder={t('print.companyAddress')}
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.header.address || ''}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          header: {
                            ...printSettings.saleReturn.header,
                            address: e.target.value,
                          },
                        },
                      })
                    }
                  />

                  <input
                    type="text"
                    placeholder={t('print.companyPhone')}
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.header.phone || ''}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          header: {
                            ...printSettings.saleReturn.header,
                            phone: e.target.value,
                          },
                        },
                      })
                    }
                  />

                  <textarea
                    placeholder={t('print.footerMessage')}
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.header.footerMessage}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          header: {
                            ...printSettings.saleReturn.header,
                            footerMessage: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>

                {/* COLUMN VISIBILITY */}
                <div className="space-y-2">
                  <h4 className="font-semibold">{t('print.columnWidth')}</h4>

                  {Object.keys(printSettings.saleReturn.settings).map((key) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={printSettings.saleReturn.settings[key]}
                        onChange={(e) =>
                          setPrintSettings({
                            ...printSettings,
                            saleReturn: {
                              ...printSettings.saleReturn,
                              settings: {
                                ...printSettings.saleReturn.settings,
                                [key]: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      {key}
                    </label>
                  ))}
                </div>

                {/* LAYOUT */}
                <div className="space-y-2">
                  <h4 className="font-semibold">{t('print.columnWidth')}</h4>

                  <select
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.layout.headerSize}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          layout: {
                            ...printSettings.saleReturn.layout,
                            headerSize: e.target.value,
                          },
                        },
                      })
                    }
                  >
                    <option value="compact">{t('print.headerCompact')}</option>
                    <option value="normal">{t('print.headerNormal')}</option>
                    <option value="spacious">{t('print.headerSpacious')}</option>
                  </select>

                  <select
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.layout.rowHeight}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          layout: {
                            ...printSettings.saleReturn.layout,
                            rowHeight: e.target.value,
                          },
                        },
                      })
                    }
                  >
                    <option value="small">{t('print.rowSmall')}</option>
                    <option value="medium">{t('print.rowMedium')}</option>
                    <option value="large">{t('print.rowLarge')}</option>
                  </select>

                  <select
                    className="border w-full px-2 py-1"
                    value={printSettings.saleReturn.layout.footerSize}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: {
                          ...printSettings.saleReturn,
                          layout: {
                            ...printSettings.saleReturn.layout,
                            footerSize: e.target.value,
                          },
                        },
                      })
                    }
                  >
                    <option value="compact">{t('print.footerCompact')}</option>
                    <option value="normal">{t('print.footerNormal')}</option>
                    <option value="spacious">{t('print.footerSpacious')}</option>
                  </select>
                </div>

                {/* COLUMN WIDTH */}
                <div className="space-y-2">
                  <h4 className="font-semibold">{t('print.columnWidth')}</h4>

                  {['name', 'description', 'uom', 'quantity', 'price', 'total'].map((field) => (
                    <div key={field} className="flex justify-between items-center gap-2">
                      <label className="capitalize w-1/2">{t(`inventory.${field}`) || field}</label>

                      <select
                        className="border px-2 py-1 w-1/2"
                        value={printSettings.saleReturn.layout.columnSizes?.[field] || 'medium'}
                        onChange={(e) =>
                          setPrintSettings({
                            ...printSettings,
                            saleReturn: {
                              ...printSettings.saleReturn,
                              layout: {
                                ...printSettings.saleReturn.layout,
                                columnSizes: {
                                  ...printSettings.saleReturn.layout.columnSizes,
                                  [field]: e.target.value,
                                },
                              },
                            },
                          })
                        }
                      >
                        <option value="small">{t('print.small')}</option>
                        <option value="compact">{t('print.compact')}</option>
                        <option value="medium">{t('print.medium')}</option>
                        <option value="large">{t('print.large')}</option>
                      </select>
                    </div>
                  ))}
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex gap-2 pt-3">
                  <button
                    onClick={async () => {
                      await updatePrintSettings('saleReturn', {
                        header: printSettings.saleReturn.header,
                        settings: printSettings.saleReturn.settings,
                        layout: printSettings.saleReturn.layout,
                      });
                      alert(t('print.saveSettings'));
                      setShowPrintSettings(false);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded w-1/2"
                  >
                    {t('save')}
                  </button>

                  <button
                    onClick={async () => {
                      const resetData = await resetPrintSettings('saleReturn');
                      setPrintSettings({
                        ...printSettings,
                        saleReturn: resetData,
                      });
                    }}
                    className="px-4 py-2 bg-yellow-500 text-white rounded w-1/2"
                  >
                    {t('reset')}
                  </button>

                  <button
                    onClick={() => setShowPrintSettings(false)}
                    className="px-4 py-2 bg-red-500 text-white rounded w-1/2"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>

              {/* RIGHT SIDE PREVIEW */}
              <div className="w-[68%] bg-gray-100 p-2 overflow-auto h-full flex justify-center">
                <div
                  className="bg-white shadow"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>
        )}
        {/* 📖 Mobile History Popup */}
        {canViewRefunds && showHistoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 md:hidden">
            <div className="bg-white rounded shadow-lg w-[90%] max-h-[70vh] overflow-auto p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-sm">{t('sales.previous')}</h3>

                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-red-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {loadingHistory && (
                <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>
              )}

              {!loadingHistory && salesHistory.length === 0 && (
                <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
              )}

              {salesHistory.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {salesHistory.map((h) => {
                    const safeDate = h.invoiceDate
                      ? formatBusinessDateForDisplay(h.invoiceDate)
                      : 'N/A';

                    return (
                      <li key={h._id} className="border rounded p-2 hover:bg-yellow-50">
                        <div className="text-xs text-gray-600">
                          {safeDate} | Bill #{h.billNo}
                        </div>

                        <div className="font-semibold text-gray-800">Rs. {h.rate}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {canViewRefunds && showSearchModal && (
          <InvoiceSearchModal
            onSelect={handleInvoiceSelect}
            onClose={() => setShowSearchModal(false)}
          />
        )}

        <AttachmentViewerModal
          attachment={modalAttachment}
          onClose={() => setModalAttachment(null)}
        />
      </div>
    </>
  );
};
export default RefundInvoiceForm;
