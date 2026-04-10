import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRefund, updateRefund, getRefundById } from '../services/refundService';
import { fetchCustomers } from '../services/customerService';
import InvoiceSearchModal from './InvoiceSearchModal';
import { fetchProductsWithToken as getProducts } from '../services/inventoryService';
import { getAccounts } from '../services/accountService';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPrintSettings,
  updatePrintSettings,
  resetPrintSettings,
} from '../services/printSettingService';
import ProductDropdown from './ProductDropdown';
import { t } from '../i18n/i18n';

const RefundInvoiceForm = ({
  token,
  onCustomerChange,
  onProductChange,
  salesHistory = [],
  loadingHistory = false,
}) => {
  const getCurrentTime = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  };

  const [productList, setProductList] = useState([]);

  const populateForm = useCallback(
    (data) => {
      setBillNo(data.billNo || '');
      setCustomerName(data.customerName || '');
      setCustomerPhone(data.customerPhone || '');
      setInvoiceDate(data.invoiceDate?.slice(0, 10) || '');
      setInvoiceTime(data.invoiceTime || '');
      setNotes(data.notes || '');
      setRefundMethod(data.paymentType === 'cash' ? 'cash' : 'credit');
      setPaymentType(data.paymentType || 'cash');

      setAccountId(data.accountId || data.account?._id || '');

      setItems(
        (data.items || []).map((i) => {
          const matchedProduct = productList.find(
            (p) => p._id === (i.productId?._id || i.productId)
          );
          return {
            productId: i.productId,
            name: matchedProduct?.name || i.name || '',
            quantity: i.quantity,
            price: i.price,
            total: (i.quantity * i.price).toFixed(2),
          };
        })
      );
    },
    [productList]
  );

  const { id } = useParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [billNo, setBillNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceTime, setInvoiceTime] = useState(getCurrentTime());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [refundMethod, setRefundMethod] = useState('credit');
  const [accountId, setAccountId] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [accounts, setAccounts] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState('cash');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');

  const scrollRef = useRef();
  // 🔵 Print Settings States
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

      const res = await fetch('/api/print/preview-settings-html', {
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
    async function loadForEdit() {
      if (id) {
        try {
          const data = await getRefundById(id, token);
          populateForm(data);
        } catch (err) {
          alert(t('alerts.invoiceSaveFailed'));
        }
      }
    }

    loadForEdit();
  }, [id, token, populateForm]);

  // ✅ Load Products, Customers, Accounts
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const products = await getProducts(token);
        setProductList(products);
      } catch (err) {
        console.error('Failed to load products', err);
      }
    };

    fetchProducts();

    fetchCustomers(token).then(setCustomers);

    getAccounts(token).then((all) => {
      const filtered = all.filter(
        (acc) =>
          ['Cash', 'Bank', 'Asset'].includes(acc.type) &&
          !acc.name?.toLowerCase().startsWith('customer:')
      );

      setAccounts(filtered);

      // 🟢 default cash account
      if (refundMethod === 'cash') {
        const handCash = filtered.find((a) => a.name.toLowerCase().includes('cash'));
        if (handCash) setAccountId(handCash._id);
      }
    });
  }, [token, refundMethod]);

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    if (field === 'quantity' || field === 'price') {
      const q = parseFloat(updated[index].quantity) || 0;
      const p = parseFloat(updated[index].price) || 0;
      updated[index].total = isNaN(q * p) ? '0.00' : (q * p).toFixed(2);
    }

    setItems(updated);

    if (index === items.length - 1 && field === 'name' && value.trim() !== '') {
      setItems([...items, blankRow()]);
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  };

  const handleClear = () => {
    setItems(Array.from({ length: 20 }, () => blankRow()));
    setBillNo('');
    setCustomerName('');
    setCustomerPhone('');
    setInvoiceTime(getCurrentTime());

    setNotes('');
    setAccountId('');
  };

  const handleRevert = async () => {
    if (!id) {
      // 🆕 New Refund → clear form
      handleClear();
      return;
    }

    // 🔁 Edit mode → original refund دوبارہ load
    try {
      const data = await getRefundById(id, token);
      populateForm(data);
    } catch (err) {
      alert(t('alerts.invoiceLoadFailed'));
    }
  };

  const totalAmount = items.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);

  const handleSubmit = async (action) => {
    const filteredItems = items.filter((item) => item.name && item.quantity > 0);
    const safeTime = invoiceTime || getCurrentTime();

    if (!invoiceDate) return alert(t('alerts.fillRequiredFields'));
    if (!customerName.trim()) return alert(t('alerts.customerRequired'));

    if (filteredItems.length === 0) return alert(t('alerts.addProduct'));
    if (refundMethod === 'cash' && !accountId) return alert(t('alerts.selectAccount'));

    try {
      const customer = customers.find((c) => c._id === customerId);

      if (!customer) return alert(t('alerts.customerRequired'));

      const formData = new FormData();
      formData.append('billNo', billNo || '');
      formData.append('originalInvoiceId', originalInvoiceId);

      formData.append('customerId', customer._id);
      formData.append('customerName', customer.name);
      formData.append('customerPhone', customerPhone);
      formData.append('invoiceDate', invoiceDate);
      formData.append('invoiceTime', safeTime);

      formData.append('notes', notes);
      formData.append('totalAmount', totalAmount);
      formData.append('paidAmount', refundMethod === 'cash' ? totalAmount : 0);
      formData.append('paymentType', refundMethod === 'cash' ? paymentType : 'credit');

      formData.append('accountId', refundMethod === 'cash' ? accountId : '');
      formData.append(
        'items',
        JSON.stringify(
          filteredItems.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            price: Number(i.price),
            total: Number(i.total),
          }))
        )
      );

      if (attachment) formData.append('attachment', attachment);

      if (id) {
        await updateRefund(id, formData, token);
        alert(t('alerts.invoiceUpdated'));
      } else {
        await createRefund(formData, token);
        alert(t('alerts.invoiceSaved'));
      }

      if (action === 'new') {
        handleClear(); // form reset
      } else if (action === 'close') {
        navigate('/dashboard'); // ✅ Correct route for dashboard
      }
    } catch (err) {
      console.error('Refund Error:', err);

      if (
        err?.response?.data?.detail?.includes('E11000 duplicate key') ||
        err?.message?.includes('E11000')
      ) {
        alert(t('alerts.billRequired'));
      } else {
        alert(t('alerts.invoiceSaveFailed'));
      }
    }
  };

  const handleInvoiceSelect = (invoice) => {
    if (!invoice) return;
    setShowSearchModal(false);
    setOriginalInvoiceId(invoice._id);
    setCustomerId(invoice.customerId?._id || invoice.customerId);
    setBillNo(`REF-${invoice.billNo}`);
    setCustomerName(invoice.customerName);
    setCustomerPhone(invoice.customerPhone);

    const loadedItems = invoice.items.map((i) => {
      const matchedProduct = productList.find((p) => p._id === (i.productId?._id || i.productId));

      return {
        productId: i.productId,
        name: matchedProduct?.name || '',
        quantity: i.quantity,
        price: i.price,
        total: (i.quantity * i.price).toFixed(2),
      };
    });

    // 👉 باقی empty rows add کریں (20 تک)
    const emptyRows = Array.from({ length: 20 - loadedItems.length }, () => blankRow());

    setItems([...loadedItems, ...emptyRows]);
  };

  const handleCustomerInput = (e) => {
    const value = e.target.value;
    setCustomerName(value);

    if (value.trim() === '') {
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);
      setCustomerPhone(''); // ✅ فون نمبر بھی خالی کریں
    } else {
      const filtered = customers.filter(
        (c) => c.name.toLowerCase().includes(value.toLowerCase()) || c.phone.includes(value)
      );
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
        handleCustomerSelect(selected.name, selected.phone);
      }
    }
  };

  const handleCustomerSelect = (name, phone, id) => {
    setCustomerName(name);
    setCustomerPhone(phone);
    setCustomerId(id);
    onCustomerChange && onCustomerChange(id);
    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);
  };

  return (
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
                  onClick={() => handleCustomerSelect(c.name, c.phone, c._id)}
                  style={{
                    backgroundColor: selectedCustomerIndex === i ? '#e0f2fe' : 'white',
                    fontWeight: selectedCustomerIndex === i ? 'bold' : 'normal',
                    padding: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {c.name} – {c.phone}
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

        <input
          type="file"
          onChange={(e) => setAttachment(e.target.files[0])}
          className="border p-1 text-sm col-span-2"
        />
      </div>

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
                    className="w-full text-center"
                  />
                </td>
                <td className="border p-1">
                  <input
                    type="number"
                    value={item.price || ''}
                    onChange={(e) => {
                      handleItemChange(idx, 'price', e.target.value);
                    }}
                    onBlur={() => {
                      const updated = [...items];
                      const q = parseFloat(updated[idx].quantity) || 0;
                      const p = parseFloat(updated[idx].price) || 0;
                      updated[idx].total = (q * p).toFixed(2);
                      setItems(updated);
                    }}
                    className="w-full text-center"
                  />
                </td>
                <td className="border p-1 text-center">{item.total || '0.00'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 bg-white border-t py-3 flex flex-col md:flex-row md:justify-between md:items-center gap-2 px-4">
        {/* LEFT SIDE — Find + Print + PDF */}
        <div className="flex flex-wrap items-center gap-2 order-2 md:order-none">
          <button
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
          {/* 📖 Mobile History Button */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="md:hidden flex items-center gap-2 px-3 py-2 rounded-xl
  bg-yellow-600 text-white text-sm font-semibold shadow"
          >
            <span>📖</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const previewItems = items
                .filter((i) => i.productId && i.quantity > 0)
                .map((i) => ({
                  productId: i.productId,
                  name: i.name,
                  quantity: i.quantity,
                  price: i.price,
                  total: i.total,
                }));

              if (id) {
                navigate(`/print/refund/${id}`);
              } else {
                navigate(`/print/refund/preview`, {
                  state: {
                    isPreview: true,
                    invoiceData: {
                      invoiceDate,
                      invoiceTime,
                      billNo,
                      customerName,
                      customerPhone,
                      items: previewItems,
                      totalAmount,
                      paidAmount: totalAmount,
                      paymentType,
                    },
                  },
                });
              }
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
        </div>

        {/* RIGHT SIDE — Save Buttons */}
        <div className="flex flex-wrap gap-2 justify-end order-3 md:order-none">
          <button
            onClick={() => handleSubmit('close')}
            className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
           bg-gradient-to-r from-emerald-700 to-green-600
           text-white
           hover:from-emerald-800 hover:to-green-700
           transition-all duration-300 font-semibold
           shadow-md hover:shadow-lg"
          >
            {id ? t('updateClose') : t('saveClose')}
          </button>

          <button
            onClick={() => handleSubmit('new')}
            className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
           bg-gradient-to-r from-blue-700 to-indigo-600
           text-white
           hover:from-blue-800 hover:to-indigo-700
           transition-all duration-300 font-semibold
           shadow-md hover:shadow-lg"
          >
            {t('saveNew')}
          </button>

          <button
            onClick={handleRevert}
            className="px-3 md:px-5 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm
bg-gradient-to-r from-gray-600 to-gray-500
text-white
hover:from-gray-700 hover:to-gray-600
transition-all duration-300 font-medium
shadow-sm hover:shadow-md"
          >
            {id ? t('common.revert') : t('clear')}
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
              <div className="bg-white shadow" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
      {/* 📖 Mobile History Popup */}
      {showHistoryModal && (
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

            {loadingHistory && <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>}

            {!loadingHistory && salesHistory.length === 0 && (
              <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
            )}

            {salesHistory.length > 0 && (
              <ul className="space-y-2 text-sm">
                {salesHistory.map((h) => {
                  const safeDate = h.invoiceDate
                    ? new Date(h.invoiceDate).toLocaleDateString()
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

      {showSearchModal && (
        <InvoiceSearchModal
          onSelect={handleInvoiceSelect}
          onClose={() => setShowSearchModal(false)}
        />
      )}
    </div>
  );
};

export default RefundInvoiceForm;
