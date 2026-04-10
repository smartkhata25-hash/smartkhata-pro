import React, { useEffect, useState, useRef, useCallback } from 'react';
import { t } from '../i18n/i18n';
import { getPrintSettings, updatePrintSettings } from '../services/printSettingService';
import { resetPrintSettings } from '../services/printSettingService';
import {
  createInvoice,
  updateInvoice,
  getInvoiceById,
  navigateInvoice,
  getLastInvoiceNo,
} from '../services/salesService';
import { fetchProductsWithToken } from '../services/inventoryService';
import { fetchCustomers } from '../services/customerService';
import { getAccounts } from '../services/accountService';

import InvoiceTable from './InvoiceTable';
import { useLocation } from 'react-router-dom'; // ✅ ضروری import
import InvoiceSearchModal from './InvoiceSearchModal';
import { useNavigate } from 'react-router-dom';
import CustomerForm from './CustomerForm';

const InvoiceForm = ({
  token,
  onSuccess,
  editingInvoice = null,
  invoiceId,
  onCustomerChange,
  onProductChange,
  salesHistory = [],
  loadingHistory = false,
}) => {
  const printRef = useRef();
  const fileInputRef = useRef();
  const location = useLocation(); // ✅ location setup

  const [editingInvoiceFromAPI, setEditingInvoiceFromAPI] = useState(null);

  const [billNo, setBillNo] = useState('Auto');

  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTime, setInvoiceTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [by, setBy] = useState('');

  const [attachment, setAttachment] = useState(null);

  const [footerText, setFooterText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerFormName, setCustomerFormName] = useState('');
  const [showCustomerAddOptions, setShowCustomerAddOptions] = useState(false);
  const [showOverpayModal, setShowOverpayModal] = useState(false);
  const [overpayAmount, setOverpayAmount] = useState(0);

  const [showSearchModal, setShowSearchModal] = useState(false);

  const navigate = useNavigate();
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);

  const [previewHtml, setPreviewHtml] = useState('');
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);

  const [historyAutoMode, setHistoryAutoMode] = useState(
    localStorage.getItem('mobileHistoryMode') === 'on'
  );

  const loadPrintSettings = async () => {
    try {
      const data = await getPrintSettings();
      if (!data.sales.layout.columnSizes) {
        data.sales.layout.columnSizes = {};
      }
      setPrintSettings(data);

      setFooterText(data?.sales?.header?.footerMessage || '');
    } catch (err) {
      console.error('Failed to load print settings');
    } finally {
    }
  };

  const handleResetSettings = async () => {
    const confirmReset = window.confirm(t('print.resetConfirm'));

    if (!confirmReset) return;

    try {
      const resetData = await resetPrintSettings('sales');

      setPrintSettings((prev) => ({
        ...prev,
        sales: resetData,
      }));

      alert(t('print.resetSuccess'));

      generateLivePreview();
    } catch (err) {
      alert(t('print.resetFailed'));
    }
  };

  // 🔁 Invoice Navigation (Next / Previous)
  const handleInvoiceNavigation = async (direction) => {
    try {
      if (!billNo || billNo === 'Auto') return;

      const data = await navigateInvoice(billNo, direction, token);

      setEditingInvoiceFromAPI(data);

      navigate(`/create-sale?invoiceId=${data._id}`);
    } catch (err) {
      console.log('No more invoices');
    }
  };

  const blankRow = () => ({
    itemNo: '',
    search: '',
    productId: '',
    name: '',
    description: '',
    uom: '',
    cost: 0,
    quantity: '',
    rate: '',
    amount: 0,
  });

  const [items, setItems] = useState(Array.from({ length: 20 }, () => blankRow()));

  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);

  const [paymentType, setPaymentType] = useState('credit');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    const handler = () => {
      const mode = localStorage.getItem('mobileHistoryMode');

      if (mode === 'on' && window.innerWidth < 768) {
        setShowHistoryPopup(true);
      }
    };

    window.addEventListener('show-history', handler);
    const toggleHandler = () => {
      setHistoryAutoMode((prev) => {
        const newMode = !prev;

        if (newMode) {
          localStorage.setItem('mobileHistoryMode', 'on');
        } else {
          localStorage.setItem('mobileHistoryMode', 'off');
          setShowHistoryPopup(false);
        }

        return newMode;
      });
    };

    window.addEventListener('toggle-history-mode', toggleHandler);

    return () => {
      window.removeEventListener('show-history', handler);
      window.removeEventListener('toggle-history-mode', toggleHandler);
    };
  }, [historyAutoMode]);

  useEffect(() => {
    if (paidAmount > 0 && paymentType === 'cash' && accounts.length > 0) {
      const handCash = accounts.find((a) => a.category === 'cash');
      if (handCash) {
        setSelectedAccountId(handCash._id);
      }
    }
  }, [paidAmount, paymentType, accounts]);

  useEffect(() => {
    const now = new Date();
    const params = new URLSearchParams(location.search);
    const invoiceIdFromURL = params.get('invoiceId');

    const loadInvoice = async () => {
      // 🆕 NEW INVOICE
      if (!invoiceIdFromURL) {
        setInvoiceDate(now.toISOString().split('T')[0]);
        setInvoiceTime(now.toTimeString().slice(0, 5));

        try {
          const lastBillNo = await getLastInvoiceNo(token);
          const nextBill = parseInt(lastBillNo || 1000) + 1;
          setBillNo(nextBill.toString());
        } catch (err) {
          console.error('❌ Failed to fetch last bill number');
          setBillNo('Auto');
        }

        return;
      }

      // ✏️ EDIT MODE
      try {
        const data = await getInvoiceById(invoiceIdFromURL, token);
        setEditingInvoiceFromAPI(data);
      } catch (err) {
        console.error('❌ Error loading invoice for editing:', err);
        alert(t('alerts.loadInvoiceFailed'));
      }
    };

    if (token) loadInvoice();
  }, [location.search, token]);

  useEffect(() => {
    if (!editingInvoiceFromAPI) return;

    setBillNo(editingInvoiceFromAPI.billNo);
    setInvoiceDate(editingInvoiceFromAPI.invoiceDate?.split('T')[0] || '');
    setInvoiceTime(editingInvoiceFromAPI.invoiceTime?.slice(0, 5) || '');
    setCustomerName(editingInvoiceFromAPI.customerName);
    setCustomerPhone(editingInvoiceFromAPI.customerPhone);
    setBy(editingInvoiceFromAPI.by || '');
    setPaidAmount(editingInvoiceFromAPI.paidAmount || 0);
    setPaymentType(editingInvoiceFromAPI.paymentType || 'credit');
    setSelectedAccountId(editingInvoiceFromAPI.accountId || '');
  }, [editingInvoiceFromAPI]);
  useEffect(() => {
    if (!editingInvoiceFromAPI || products.length === 0) return;

    const enrichedItems = editingInvoiceFromAPI.items.map((item, i) => {
      const matchedProduct = products.find((p) => p._id === item.productId);
      return {
        itemNo: i + 1,
        search: matchedProduct?.name || '',
        productId: item.productId,
        name: matchedProduct?.name || '',
        description: matchedProduct?.description || '',
        cost: matchedProduct?.unitCost || 0,
        quantity: item.quantity,
        rate: item.price,
        amount: item.total,
      };
    });

    setItems([
      ...enrichedItems,
      ...Array.from({ length: 20 - enrichedItems.length }, () => blankRow()),
    ]);
  }, [editingInvoiceFromAPI, products]);

  useEffect(() => {
    if (!token) return;

    fetchCustomers(token).then(setCustomers);
    fetchProductsWithToken(token).then(setProducts);

    getAccounts(token).then((all) => {
      setAccounts(all);
    });
  }, [token]);

  const filterCustomers = (value) => {
    const query = value.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(query) || c.phone.includes(query));
  };

  const handleCustomerInput = (e) => {
    const value = e.target.value;
    setCustomerName(value);

    if (value.trim() === '') {
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);
      setShowCustomerAddOptions(false);
    } else {
      const filtered = filterCustomers(value);
      setCustomerSuggestions(filtered);
      setSelectedCustomerIndex(-1);
      setShowCustomerAddOptions(true);
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
        handleCustomerSelect(selected.name, selected.phone, selected._id);

        setTimeout(() => {
          document.getElementById('customer-phone')?.focus();
        }, 0);
      }
    }
  };

  const handleCustomerSelect = (name, phone, id) => {
    setCustomerName(name);
    setCustomerPhone(phone);

    onCustomerChange && onCustomerChange(id);

    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);
    setShowCustomerAddOptions(false);
  };

  // ⚡ Quick Add Customer (sirf name se)
  const quickAddCustomer = async (name) => {
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || t('alerts.customerAddFailed'));
        return;
      }

      // ✅ customer set
      setCustomerName(data.name);
      setCustomerPhone(data.phone || '');

      // ✅ dropdown hide
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);
      setShowCustomerAddOptions(false);

      // ✅ cursor Search Item میں
      setTimeout(() => {
        const firstItemInput = document.querySelector('input[placeholder="Search Item..."]');
        firstItemInput?.focus();
      }, 0);
    } catch (err) {
      console.error(err);
      alert(t('alerts.quickAddFailed'));
    }
  };

  // 📝 Full Form open
  const openCustomerForm = (name) => {
    setCustomerFormName(name);
    setShowCustomerAddOptions(false);
    setCustomerSuggestions([]);
    setShowCustomerForm(true);
  };

  const handleQtyRateChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = Number(value);
    updated[index].amount = updated[index].quantity * updated[index].rate;
    setItems(updated);
  };

  const clearOnFocus = (e) => {
    if (e.target.value === '0') e.target.select();
  };

  const toggleEditable = (e, setter) => {
    const current = e.target.innerText;
    const newValue = prompt(t('common.renameField'), current);
    if (newValue !== null) setter(newValue);
  };

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);

  const generateLivePreview = useCallback(async () => {
    try {
      if (!printSettings?.sales) return;

      const response = await fetch('/api/print/preview-settings-html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'sales',
          settings: printSettings.sales,
        }),
      });

      const html = await response.text();
      setPreviewHtml(html);
    } catch (err) {
      console.error('Preview fetch failed', err);
    }
  }, [printSettings, token]);

  useEffect(() => {
    if (showPrintSettings && printSettings?.sales) {
      generateLivePreview();
    }
  }, [printSettings, showPrintSettings, generateLivePreview]);
  const finalDiscount =
    discountPercent > 0 ? (totalAmount * discountPercent) / 100 : discountAmount;
  const grandTotal = totalAmount - finalDiscount;

  const handleFileChange = (e) => {
    setAttachment(e.target.files[0]);
  };
  const handleSubmit = async (e, mode = 'close') => {
    e.preventDefault();

    if (!customerName.trim()) {
      alert(t('alerts.customerRequired'));
      return;
    }

    const mappedItems = items
      .filter((i) => i.productId && i.quantity > 0 && i.rate > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.quantity * i.rate,
      }));

    if (mappedItems.length === 0) {
      alert(t('alerts.addProduct'));
      return;
    }

    const remaining = grandTotal - paidAmount;

    if (remaining < 0 && !showOverpayModal) {
      setOverpayAmount(Math.abs(remaining));
      setShowOverpayModal(true);
      return;
    }

    if (paidAmount > 0) {
      // payment type required
      if (!paymentType) {
        alert(t('alerts.selectPaymentType'));
        return;
      }

      // credit not allowed when paid amount exists
      if (paymentType === 'credit') {
        alert(t('alerts.creditNotAllowed'));
        return;
      }

      // cash has auto account, others need manual account
      if (paymentType !== 'cash' && !selectedAccountId) {
        alert(t('alerts.selectAccount'));
        return;
      }
    }

    const formData = new FormData();

    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('customerName', customerName);
    formData.append('customerPhone', customerPhone);
    formData.append('by', by);
    formData.append('totalAmount', grandTotal);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', finalDiscount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);

    // ✅ FINAL paymentType decision
    const finalPaymentType = paidAmount > 0 ? paymentType : 'credit';

    formData.append('paymentType', finalPaymentType);

    // ✅ Only send accountId if paymentType demands it
    if (paidAmount > 0 && paymentType !== 'credit' && selectedAccountId) {
      formData.append('accountId', selectedAccountId);
    }

    if (attachment) formData.append('attachment', attachment);
    formData.append('items', JSON.stringify(mappedItems));

    try {
      if (editingInvoiceFromAPI) {
        await updateInvoice(editingInvoiceFromAPI._id, formData, token);
      } else {
        const response = await createInvoice(formData, token);

        if (response?.invoice?.billNo) {
          setBillNo(response.invoice.billNo);
        }
      }

      if (onSuccess) onSuccess();

      if (mode === 'new' && !editingInvoice) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        setInvoiceDate(today);
        setInvoiceTime(currentTime);

        setItems(Array.from({ length: 20 }, () => blankRow()));

        setCustomerName('');
        setCustomerPhone('');
        setBy('');
        setDiscountPercent(0);
        setDiscountAmount(0);
        setPaidAmount(0);
        setAttachment(null);
        setShowPreview(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      console.error('Save error:', err);
      alert(t('alerts.invoiceSaveFailed'));
    }
  };

  if (!token) return <p className="text-red-600 p-4">{t('alerts.loginFirst')}</p>;

  return (
    <>
      <form
        onSubmit={(e) => handleSubmit(e)}
        className="max-w-6xl mx-auto p-2 md:p-3 bg-white rounded shadow space-y-2 text-xs md:text-sm"
      >
        <div ref={printRef} id="print-section">
          {/* 🧾 Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-2xl font-bold">{t('saleInvoice')}</h2>

            <div className="flex flex-wrap items-center gap-1 md:gap-2">
              <input
                type="text"
                placeholder={t('invoice.by')}
                value={by}
                onChange={(e) => setBy(e.target.value)}
                className="border px-2 py-1 h-8 text-sm w-40"
              />

              {/* ⚙️ Settings Icon */}
              <button
                type="button"
                onClick={async () => {
                  await loadPrintSettings();
                  setShowPrintSettings(true);
                }}
                className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-history-mode'))}
                className={`px-3 py-1 border rounded ${
                  historyAutoMode ? 'bg-green-500 text-white' : 'bg-gray-200'
                }`}
              >
                📖
              </button>

              {/* Previous */}
              <button
                type="button"
                onClick={() => handleInvoiceNavigation('previous')}
                className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
              >
                ⬅️
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => handleInvoiceNavigation('next')}
                className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
              >
                ➡️
              </button>
            </div>
          </div>

          {/* 🔹 All 5 fields in ONE ROW */}
          <div className="grid grid-cols-12 md:grid-cols-12 gap-2 items-start">
            <div className="col-span-4 relative">
              <input
                type="text"
                placeholder={t('customerName')}
                value={customerName}
                onChange={handleCustomerInput}
                onKeyDown={handleCustomerKeyDown}
                className="border px-2 py-1 h-8 md:h-9 w-full text-xs md:text-sm"
                autoComplete="off"
              />

              {customerSuggestions.length > 0 && (
                <ul
                  className="absolute left-0 right-0 bg-white border mt-1 max-h-40 overflow-auto shadow-lg"
                  style={{ zIndex: 9999 }}
                >
                  {customerSuggestions.map((c, i) => (
                    <li
                      key={i}
                      onMouseDown={() => handleCustomerSelect(c.name, c.phone, c._id)}
                      onTouchStart={() => handleCustomerSelect(c.name, c.phone, c._id)}
                      className={`px-2 py-2 cursor-pointer ${
                        selectedCustomerIndex === i ? 'bg-blue-100 font-bold' : ''
                      }`}
                    >
                      {c.name} – {c.phone}
                    </li>
                  ))}
                </ul>
              )}
              {showCustomerAddOptions &&
                customerSuggestions.length === 0 &&
                customerName.trim() !== '' && (
                  <ul
                    className="absolute left-0 right-0 bg-white border mt-1 shadow-lg"
                    style={{ zIndex: 9999 }}
                  >
                    <li
                      onPointerDown={(e) => {
                        e.preventDefault();
                        quickAddCustomer(customerName);
                      }}
                      className="px-2 py-2 cursor-pointer hover:bg-green-100 text-green-600 font-semibold"
                    >
                      ➕ Quick add "{customerName}"
                    </li>

                    <li
                      onPointerDown={(e) => {
                        e.preventDefault();
                        openCustomerForm(customerName);
                      }}
                      className="px-2 py-2 cursor-pointer hover:bg-blue-100 text-blue-600"
                    >
                      📝 Add with details
                    </li>
                  </ul>
                )}
            </div>

            {/* Phone – زیادہ چوڑا */}
            <div className="col-span-3">
              <input
                id="customer-phone"
                type="text"
                placeholder={t('phone')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="border px-2 py-1 h-8 md:h-9 w-full text-xs md:text-sm"
              />
            </div>

            {/* Bill No – کم چوڑا */}
            <div className="col-span-2">
              <input
                type="text"
                placeholder={t('billNo')}
                value={billNo || 'Auto'}
                readOnly
                className="border px-2 py-1 h-8 w-full text-sm bg-gray-100"
              />
            </div>

            {/* Date – کم چوڑا */}
            <div className="col-span-2">
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="border px-2 py-1 h-8 w-full text-xs md:text-sm"
              />
            </div>

            {/* Time – سب سے کم چوڑا */}
            <div className="col-span-1">
              <input
                type="text"
                placeholder={t('time')}
                value={invoiceTime}
                onChange={(e) => setInvoiceTime(e.target.value)}
                className="border px-2 py-1 h-8 w-full text-xs md:text-sm"
              />
            </div>
          </div>

          <div className="mb-0">
            <InvoiceTable
              items={items}
              setItems={setItems}
              products={products}
              handleQtyRateChange={handleQtyRateChange}
              clearOnFocus={clearOnFocus}
              onProductChange={onProductChange}
              historyAutoMode={historyAutoMode}
            />
          </div>

          {/* Totals + Buttons */}
          <div className="bg-gray-100 p-3 md:p-4 rounded mt-4 text-xs md:text-sm">
            <div className="grid grid-cols-12 gap-3 md:gap-6 items-start">
              {/* 🔹 LEFT SIDE */}
              <div className="col-span-8 flex flex-col gap-2">
                {/* Discount / Payment / Attachment */}
                <div className="flex gap-3 items-center flex-wrap">
                  {/* Discount % */}
                  <input
                    type="number"
                    placeholder={t('discountPercent')}
                    value={discountPercent === 0 ? '' : discountPercent}
                    onChange={(e) => {
                      setDiscountPercent(+e.target.value || 0);
                      setDiscountAmount(0);
                    }}
                    className="border px-2 py-0 text-sm h-8 w-28 appearance-none"
                  />

                  {/* Discount Amount */}
                  <input
                    type="number"
                    placeholder={t('discountRS')}
                    value={discountAmount === 0 ? '' : discountAmount}
                    onChange={(e) => {
                      setDiscountAmount(+e.target.value || 0);
                      setDiscountPercent(0);
                    }}
                    className="border px-2 py-0 text-sm h-8 w-28 appearance-none"
                  />
                  {/* Paid Amount */}
                  <input
                    type="number"
                    placeholder={t('amount')}
                    value={paidAmount === 0 ? '' : paidAmount}
                    onChange={(e) => setPaidAmount(+e.target.value || 0)}
                    className="border px-2 py-0 text-sm h-8 w-24 appearance-none"
                  />

                  {/* Payment Type */}
                  <select
                    className="border px-2 py-1 h-8 text-sm cursor-pointer"
                    value={paymentType}
                    onChange={(e) => {
                      setPaymentType(e.target.value);
                      setSelectedAccountId('');
                    }}
                  >
                    <option value="cash">{t('payment.cash')}</option>

                    <option value="online">{t('payment.online')}</option>
                    <option value="cheque">{t('payment.cheque')}</option>
                  </select>

                  {/* Account dropdown صرف تب */}
                  {paidAmount > 0 && paymentType !== 'credit' && (
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="border px-2 py-1 h-8 w-32 cursor-pointer"
                    >
                      <option value="">{t('account')}</option>

                      {accounts
                        .filter((acc) => {
                          const type = acc.type?.toLowerCase();
                          const category = acc.category?.toLowerCase();
                          const name = acc.name?.toLowerCase();

                          // ❌ customer / supplier accounts exclude
                          if (name?.startsWith('customer:')) return false;

                          // ❌ non-asset accounts exclude
                          if (type !== 'asset') return false;

                          // ✅ CASH → only cash
                          if (paymentType === 'cash') {
                            return category === 'cash';
                          }

                          // ✅ ONLINE / CHEQUE → bank, online, cheque
                          if (paymentType === 'online' || paymentType === 'cheque') {
                            return ['bank', 'online', 'cheque', 'cash'].includes(category);
                          }

                          return false;
                        })
                        .map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name}
                          </option>
                        ))}
                    </select>
                  )}

                  {/* Attachment + Preview + Remove */}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="border px-2 py-0 text-sm h-8 w-28 relative z-10"
                    />

                    {attachment && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowPreview((prev) => !prev)}
                          className="text-blue-600 text-xs underline"
                        >
                          {showPreview ? t('hide') : t('preview')}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('alerts.removeAttachment'))) {
                              setAttachment(null);
                              setShowPreview(false);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }
                          }}
                          className="text-red-500 text-xs"
                        >
                          ✖
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Attachment Preview */}
                {attachment && showPreview && (
                  <div>
                    <img
                      src={URL.createObjectURL(attachment)}
                      alt="Attachment Preview"
                      className="max-h-32 border rounded"
                    />
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-wrap gap-2 md:gap-3 no-print mt-6 md:mt-8">
                  <button
                    type="submit"
                    className="bg-green-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm"
                  >
                    {editingInvoiceFromAPI ? t('updateClose') : t('saveClose')}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, 'new')}
                    className="bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm"
                  >
                    {t('saveNew')}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (editingInvoiceFromAPI?._id) {
                        const data = await getInvoiceById(editingInvoiceFromAPI._id, token);
                        setEditingInvoiceFromAPI(data);
                      } else {
                        window.location.reload();
                      }
                    }}
                    className="bg-gray-500 text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm"
                  >
                    {editingInvoiceFromAPI ? t('common.revert') : t('clear')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (editingInvoiceFromAPI?._id) {
                        // ✅ Saved invoice → direct backend route
                        navigate(`/print/sale/${editingInvoiceFromAPI._id}`);
                      } else {
                        // ✅ Preview mode (unsaved invoice) → backend preview API

                        const previewItems = items
                          .filter((i) => i.productId && i.quantity > 0)
                          .map((i) => ({
                            productId: i.productId,
                            name: i.name, // 🔥 یہ add کریں
                            description: i.description,
                            uom: i.uom,
                            quantity: i.quantity,
                            price: i.rate,
                            total: i.amount,
                          }));

                        navigate(`/print/sale/preview`, {
                          state: {
                            isPreview: true,
                            invoiceData: {
                              invoiceDate,
                              invoiceTime,
                              billNo,
                              customerName: customerName || '-',
                              customerPhone: customerPhone || '',
                              by,
                              items: previewItems,
                              totalAmount,
                              discountAmount: finalDiscount,
                              grandTotal,
                              paidAmount,
                              paymentType,
                            },
                          },
                        });
                      }
                    }}
                    className="bg-purple-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm"
                  >
                    {t('printInvoice')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSearchModal(true)}
                    className="
    flex items-center gap-2
    px-4 py-2
    rounded-lg
    bg-blue-50 text-blue-700
    border border-blue-200
    hover:bg-blue-600 hover:text-white
    transition-all duration-200
    text-sm font-medium
    shadow-sm hover:shadow-md
  "
                  >
                    🔍 <span>{t('findInvoice')}</span>
                  </button>
                </div>
              </div>

              {/* 🔹 RIGHT SIDE – Totals */}
              <div className="col-span-4 text-right space-y-1">
                <p>
                  {t('total')}: Rs. {totalAmount.toFixed(2)}
                </p>
                <p>
                  {t('discount')}: Rs. {finalDiscount.toFixed(2)}
                </p>
                <p className="text-xl font-bold">
                  {t('netTotal')}: Rs. {grandTotal.toFixed(2)}
                </p>
                <p>
                  {t('paid')}: Rs. {paidAmount.toFixed(2)}
                </p>
                <p className="text-red-600 font-semibold">
                  {t('remaining')}: Rs. {(grandTotal - paidAmount).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Text */}
          <div
            className="mt-4 text-center italic text-sm text-gray-500 cursor-pointer"
            onDoubleClick={(e) => toggleEditable(e, setFooterText)}
          >
            {footerText}
          </div>
        </div>
        {showSearchModal && (
          <InvoiceSearchModal
            onClose={() => setShowSearchModal(false)}
            onSelect={(invoice) => {
              setShowSearchModal(false);

              // 🔁 Sale Invoice edit mode

              navigate(`/create-sale?invoiceId=${invoice._id}`);
            }}
          />
        )}
        {showOverpayModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-96 animate-scaleIn">
              <h3 className="text-lg font-bold text-yellow-600 mb-3">{t('invoice.overpayment')}</h3>

              <p className="text-sm text-gray-700 mb-4">{t('invoice.overpaymentMessage')}</p>

              <p className="text-sm font-semibold text-green-600 mb-6">
                Extra Rs. {overpayAmount.toFixed(2)} {t('invoice.adjustPrevious')}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowOverpayModal(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  {t('cancel')}
                </button>

                <button
                  onClick={() => {
                    setShowOverpayModal(false);
                    document.querySelector('form')?.requestSubmit();
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {t('continue')}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
      {showPrintSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg w-[98vw] h-[96vh] overflow-hidden flex gap-4">
            {/* LEFT SIDE — SETTINGS */}
            <div className="w-[32%] space-y-4 text-sm overflow-y-auto pr-2">
              <h3 className="text-lg font-bold">{t('print.salesSettings')}</h3>

              {/* HEADER */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.header')}</h4>

                <input
                  type="text"
                  placeholder={t('print.companyName')}
                  className="border w-full px-2 py-1"
                  value={printSettings?.sales?.header?.companyName || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          companyName: e.target.value,
                        },
                      },
                    })
                  }
                />
                {/* Company Address */}
                <input
                  type="text"
                  placeholder={t('print.companyAddress')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.address || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          address: e.target.value,
                        },
                      },
                    })
                  }
                />

                {/* Company Phone */}
                <input
                  type="text"
                  placeholder={t('print.companyPhone')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.phone || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          phone: e.target.value,
                        },
                      },
                    })
                  }
                />

                <textarea
                  placeholder={t('print.footerMessage')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.footerMessage}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          footerMessage: e.target.value,
                        },
                      },
                    })
                  }
                />
              </div>

              {/* COLUMN VISIBILITY */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.columnVisibility')}</h4>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showDescription}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showDescription: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showDescription')}
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showUOM}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showUOM: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showUom')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showBy ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showBy: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showBy')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showFooter ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showFooter: e.target.checked,
                          },
                        },
                      })
                    }
                  />

                  {t('print.showFooter')}
                </label>
              </div>

              {/* LAYOUT */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.layout')}</h4>

                <select
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.layout.headerSize}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
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
                  value={printSettings.sales.layout.rowHeight}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
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
                  value={printSettings.sales.layout.footerSize}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
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
              {/* COLUMN WIDTHS */}
              <div className="space-y-2 mt-4">
                <h4 className="font-semibold">{t('print.columnWidth')}</h4>

                {['name', 'description', 'uom', 'quantity', 'price', 'total'].map((field) => (
                  <div key={field} className="flex justify-between items-center gap-2">
                    <label className="capitalize w-1/2">{field}</label>

                    <select
                      className="border px-2 py-1 w-1/2"
                      value={printSettings.sales.layout.columnSizes?.[field] || 'medium'}
                      onChange={(e) =>
                        setPrintSettings({
                          ...printSettings,
                          sales: {
                            ...printSettings.sales,
                            layout: {
                              ...printSettings.sales.layout,
                              columnSizes: {
                                ...printSettings.sales.layout.columnSizes,
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
                    try {
                      await updatePrintSettings('sales', {
                        header: printSettings.sales.header,
                        settings: printSettings.sales.settings,
                        layout: printSettings.sales.layout,
                      });

                      alert(t('print.settingsSaved'));
                      setShowPrintSettings(false);
                    } catch (err) {
                      alert(t('print.settingsSaveFailed'));
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded w-1/2"
                >
                  {t('print.saveSettings')}
                </button>
                <button
                  onClick={handleResetSettings}
                  className="px-4 py-2 bg-yellow-500 text-white rounded w-1/2"
                >
                  {t('print.resetDefault')}
                </button>

                <button
                  onClick={() => setShowPrintSettings(false)}
                  className="px-4 py-2 bg-red-500 text-white rounded w-1/2"
                >
                  {t('close')}
                </button>
              </div>
            </div>

            {/* RIGHT SIDE — LIVE PREVIEW */}
            <div className="w-[68%] bg-gray-100 p-2 overflow-auto h-full flex justify-center">
              <div className="bg-white shadow" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
      {showHistoryPopup && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md pointer-events-none">
          <div className="bg-white border rounded-lg shadow-xl p-3 pointer-events-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">{t('sales.previous')}</h3>

              <button onClick={() => setShowHistoryPopup(false)} className="text-red-500 text-sm">
                ✖
              </button>
            </div>

            {loadingHistory && <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>}

            {!loadingHistory && salesHistory.length === 0 && (
              <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
            )}

            {salesHistory.length > 0 && (
              <ul className="space-y-2 text-sm mt-2 max-h-28 overflow-auto">
                {salesHistory.map((h) => {
                  const safeDate = h.invoiceDate
                    ? new Date(h.invoiceDate).toLocaleDateString()
                    : h.createdAt
                      ? new Date(h.createdAt).toLocaleDateString()
                      : 'N/A';

                  return (
                    <li key={h._id} className="border rounded p-2 bg-gray-50">
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
      {showCustomerForm && (
        <CustomerForm
          initialData={{ name: customerFormName }}
          onSubmit={async (data) => {
            await fetch('/api/customers', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(data),
            });

            setCustomerName(data.name);
            setCustomerPhone(data.phone || '');

            setShowCustomerForm(false);
            setShowCustomerAddOptions(false);

            // cursor Search Item میں
            setTimeout(() => {
              const firstItemInput = document.querySelector('input[placeholder="Search Item..."]');
              firstItemInput?.focus();
            }, 0);
          }}
          onCancel={() => {
            setShowCustomerForm(false);
            setShowCustomerAddOptions(false);
          }}
        />
      )}
    </>
  );
};

export default InvoiceForm;
