// src/components/PurchaseInvoiceForm.js

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSuppliers } from '../services/supplierService';
import { fetchProductsWithToken } from '../services/inventoryService';
import { getValidPaymentAccounts } from '../services/accountService';

import purchaseInvoiceService from '../services/purchaseInvoiceService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import InvoiceTable from './InvoiceTable';
import SupplierForm from './SupplierForm';
import PurchaseInvoiceSearchModal from './PurchaseInvoiceSearchModal';
import { t } from '../i18n/i18n';
const PurchaseInvoiceForm = () => {
  const token = localStorage.getItem('token');
  const printRef = useRef();
  const fileInputRef = useRef();
  const { id } = useParams();

  const [isEdit, setIsEdit] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);
  const [showSupplierAddOptions, setShowSupplierAddOptions] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierFormName, setSupplierFormName] = useState('');

  const [billNo, setBillNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTime, setInvoiceTime] = useState('');
  const generateEmptyRow = (i) => ({
    itemNo: i + 1,
    search: '',
    productId: '',
    name: '',
    description: '',
    cost: 0,
    quantity: 1,
    rate: 0,
    amount: 0,
  });

  const [items, setItems] = useState(() =>
    Array.from({ length: 15 }, (_, i) => generateEmptyRow(i))
  );

  const [discountPercent, setDiscountPercent] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [attachment, setAttachment] = useState(null);

  const [paymentType, setPaymentType] = useState('cash');

  const [selectedAccountId, setSelectedAccountId] = useState('');
  // 📊 Item History States

  const [itemHistory, setItemHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    if (!selectedProductId || !showHistory) return;

    const loadHistory = async () => {
      setLoadingHistory(true);

      const history = await purchaseInvoiceService.getItemPurchaseHistory(selectedProductId);

      setItemHistory(history);
      setLoadingHistory(false);
    };

    loadHistory();
  }, [selectedProductId, showHistory]);

  useEffect(() => {
    const now = new Date();
    setInvoiceDate(now.toISOString().split('T')[0]);
    setInvoiceTime(now.toTimeString().slice(0, 5));

    if (!token) return;

    fetchSuppliers().then(setSuppliers);
    fetchProductsWithToken(token).then(setProducts);
    getValidPaymentAccounts().then(setAccounts);
  }, [token]);

  useEffect(() => {
    if (!id || products.length === 0) return;

    const loadInvoice = async () => {
      const invoice = await purchaseInvoiceService.getPurchaseInvoiceById(id);

      setIsEdit(true);
      setInvoiceId(invoice._id);
      setBillNo(invoice.billNo);
      setInvoiceDate(invoice.invoiceDate?.slice(0, 10));
      setInvoiceTime(invoice.invoiceTime);
      setSupplierName(invoice.supplierName);
      setSupplierPhone(invoice.supplierPhone);

      setDiscountPercent(invoice.discountPercent || 0);
      setDiscountAmount(invoice.discountAmount || 0);
      setPaidAmount(invoice.paidAmount || 0);
      setPaymentType(invoice.paymentType || 'credit');
      setSelectedAccountId(invoice.accountId || '');

      const loadedItems = (invoice.items || []).map((item, index) => {
        const product =
          typeof item.productId === 'object'
            ? item.productId
            : products.find((p) => p._id === item.productId);

        return {
          itemNo: index + 1,
          productId: product?._id || item.productId || '',
          search: product?.name || '',
          name: product?.name || '',
          description: product?.description || '',
          cost: Number(item.price ?? 0),
          rate: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          amount: Number(item.total ?? 0),
        };
      });

      const emptyRows = Array.from({ length: 10 }, (_, i) => ({
        itemNo: loadedItems.length + i + 1,
        search: '',
        productId: '',
        name: '',
        description: '',
        cost: 0,
        quantity: 1,
        rate: 0,
        amount: 0,
      }));

      setItems([...loadedItems, ...emptyRows]);
    };

    loadInvoice();
  }, [id, products]);

  const filterSuppliers = (value) => {
    const query = value.toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(query));
  };

  const handleSupplierInput = (e) => {
    const value = e.target.value;
    setSupplierName(value);

    if (value.trim() === '') {
      setSupplierSuggestions([]);
      setSelectedSupplierIndex(-1);
      setShowSupplierAddOptions(false);
    } else {
      const filtered = filterSuppliers(value);
      setSupplierSuggestions(filtered);
      setSelectedSupplierIndex(0);

      if (filtered.length === 0) {
        setShowSupplierAddOptions(true);
      } else {
        setShowSupplierAddOptions(false);
      }
    }
  };

  const handleSupplierKeyDown = (e) => {
    if (supplierSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSupplierIndex((prev) => (prev < supplierSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSupplierIndex((prev) => (prev > 0 ? prev - 1 : supplierSuggestions.length - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = supplierSuggestions[selectedSupplierIndex];
      if (selected) {
        handleSupplierSelect(selected.name, selected.phone);
        setTimeout(() => {
          document.getElementById('supplier-phone')?.focus();
        }, 0);
      }
    }
  };

  const handleSupplierSelect = (name, phone) => {
    setSupplierName(name);
    setSupplierPhone(phone || '');
    const selected = suppliers.find((s) => s.name === name);
    if (selected && selected.account) {
    }

    setSupplierSuggestions([]);
    setSelectedSupplierIndex(-1);
  };

  const quickAddSupplier = async (name) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || t('alerts.supplierAddFailed'));
        return;
      }

      setSupplierName(data.name);
      setSupplierPhone(data.phone || '');

      const updatedSuppliers = await fetchSuppliers();
      setSuppliers(updatedSuppliers);

      setSupplierSuggestions([]);
      setSelectedSupplierIndex(-1);
      setShowSupplierAddOptions(false);

      setTimeout(() => {
        const firstItemInput = document.querySelector('input[placeholder="Search Item..."]');
        firstItemInput?.focus();
      }, 0);
    } catch (err) {
      console.error(err);
      alert(t('alerts.quickAddFailed'));
    }
  };

  const clearOnFocus = (e) => {
    if (e.target.value === '0') e.target.select();
  };

  const handleQtyRateChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = Number(value);

    if (field === 'cost') {
      updated[index].amount = updated[index].quantity * updated[index].cost;
    } else if (field === 'rate') {
      updated[index].amount = updated[index].quantity * updated[index].rate;
    } else if (field === 'quantity') {
      const price = updated[index].cost || updated[index].rate;
      updated[index].amount = updated[index].quantity * price;
    }

    setItems(updated);
  };

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const finalDiscount =
    discountPercent > 0 ? (totalAmount * discountPercent) / 100 : discountAmount;
  const grandTotal = totalAmount - finalDiscount;

  // 📊 Product select ہونے پر صرف ID محفوظ کریں
  const handleProductHistory = (productId) => {
    if (!productId) return;

    setSelectedProductId(productId);
  };

  const handleFileChange = (e) => {
    setAttachment(e.target.files[0]);
  };
  const savePurchaseInvoice = async () => {
    const selectedSupplier = suppliers.find((s) => s.name === supplierName);
    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = items
      .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.amount || i.quantity * i.rate,
      }));

    const journalEntries = [];

    if (paidAmount > 0 && selectedAccountId) {
      journalEntries.push({
        type: 'debit',
        accountId: selectedAccountId,
        amount: paidAmount,
        narration: `Paid to supplier ${supplierName}`,
      });

      journalEntries.push({
        type: 'credit',
        accountId: supplierAccountId,
        amount: paidAmount,
        narration: `Payment for purchase invoice #${billNo}`,
      });
    }

    const formData = new FormData();

    formData.append('billNo', billNo);
    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('supplierName', supplierName);
    formData.append('supplierPhone', supplierPhone);
    formData.append('supplierId', selectedSupplier?._id || '');
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', discountAmount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);

    if (attachment) formData.append('attachment', attachment);

    formData.append('items', JSON.stringify(validItems));
    formData.append('createJournal', 'true');
    formData.append('journalEntries', JSON.stringify(journalEntries));

    if (isEdit) {
      await purchaseInvoiceService.updatePurchaseInvoice(invoiceId, formData);
    } else {
      await purchaseInvoiceService.addPurchaseInvoice(formData);
    }
  };

  const handleSaveAndClose = async () => {
    try {
      await savePurchaseInvoice();

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error saving invoice:', err);
    }
  };
  const handleSaveAndNew = async () => {
    try {
      await savePurchaseInvoice();

      setBillNo('');
      setSupplierName('');
      setSupplierPhone('');

      setItems(Array.from({ length: 15 }, (_, i) => generateEmptyRow(i)));

      setDiscountPercent(0);
      setDiscountAmount(0);
      setPaidAmount(0);
      setSelectedAccountId('');

      setAttachment(null);
      setShowHistory(false);
      setItemHistory([]);
      setSelectedProductId(null);

      const now = new Date();
      setInvoiceDate(now.toISOString().split('T')[0]);
      setInvoiceTime(now.toTimeString().slice(0, 5));
    } catch (err) {
      console.error('❌ Error in Save & New:', err?.response?.data || err.message);
    }
  };

  const handleUpdate = async () => {
    const selectedSupplier = suppliers.find((s) => s.name === supplierName);
    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = items
      .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))

      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.amount || i.quantity * i.rate,
      }));

    const journalEntries = [];
    if (paidAmount > 0 && selectedAccountId) {
      journalEntries.push({
        type: 'debit',
        accountId: selectedAccountId,
        amount: paidAmount,
        narration: `Paid to supplier ${supplierName}`,
      });
      journalEntries.push({
        type: 'credit',
        accountId: supplierAccountId,
        amount: paidAmount,
        narration: `Payment for purchase invoice #${billNo}`,
      });
    }

    const formData = new FormData();
    formData.append('billNo', billNo);
    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('supplierName', supplierName);
    formData.append('supplierPhone', supplierPhone);
    formData.append('supplierId', selectedSupplier?._id || '');
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', finalDiscount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);
    if (attachment) formData.append('attachment', attachment);
    formData.append('items', JSON.stringify(validItems));
    formData.append('createJournal', 'true');
    formData.append('journalEntries', JSON.stringify(journalEntries));

    try {
      await purchaseInvoiceService.updatePurchaseInvoice(invoiceId, formData);
      alert(t('alerts.invoiceUpdated'));
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error updating invoice:', err?.response?.data || err.message);
      alert(t('alerts.invoiceUpdateFailed'));
    }
  };

  const handleClear = async () => {
    if (isEdit && invoiceId) {
      const invoice = await purchaseInvoiceService.getPurchaseInvoiceById(invoiceId);

      setBillNo(invoice.billNo);
      setInvoiceDate(invoice.invoiceDate?.slice(0, 10));
      setInvoiceTime(invoice.invoiceTime);
      setSupplierName(invoice.supplierName);
      setSupplierPhone(invoice.supplierPhone);

      setDiscountPercent(invoice.discountPercent || 0);
      setDiscountAmount(invoice.discountAmount || 0);
      setPaidAmount(invoice.paidAmount || 0);
      setPaymentType(invoice.paymentType || 'credit');
      setSelectedAccountId(invoice.accountId || '');

      const loadedItems = (invoice.items || []).map((item, index) => {
        const product =
          typeof item.productId === 'object'
            ? item.productId
            : products.find((p) => p._id === item.productId);

        return {
          itemNo: index + 1,
          productId: product?._id || item.productId || '',
          search: product?.name || '',
          name: product?.name || '',
          description: product?.description || '',
          cost: Number(item.price ?? 0),
          rate: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          amount: Number(item.total ?? 0),
        };
      });

      const emptyRows = Array.from({ length: 10 }, (_, i) => ({
        itemNo: loadedItems.length + i + 1,
        search: '',
        productId: '',
        name: '',
        description: '',
        cost: 0,
        quantity: 1,
        rate: 0,
        amount: 0,
      }));

      setItems([...loadedItems, ...emptyRows]);

      return;
    }

    setBillNo('');
    setSupplierName('');
    setSupplierPhone('');
    setItems(Array.from({ length: 15 }, (_, i) => generateEmptyRow(i)));
    setDiscountPercent(0);
    setDiscountAmount(0);
    setPaidAmount(0);
    setSelectedAccountId('');
    setAttachment(null);
    setShowHistory(false);
    setItemHistory([]);
    setSelectedProductId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!billNo || billNo.trim() === '') {
      alert(t('alerts.billRequired'));
      return;
    }

    if (paidAmount > 0 && (!selectedAccountId || selectedAccountId.trim() === '')) {
      alert(t('alerts.selectAccount'));
      return;
    }

    document.querySelector('select[name="selectedAccountId"]')?.focus();

    const selectedSupplier = suppliers.find((s) => s.name === supplierName);
    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = items
      .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))

      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.amount,
      }));

    if (validItems.length === 0) {
      alert(t('alerts.addProduct'));
      return;
    }

    const journalEntries = [];
    if (paidAmount > 0 && selectedAccountId) {
      journalEntries.push({
        type: 'debit',
        accountId: selectedAccountId,
        amount: paidAmount,
        narration: `Paid to supplier ${supplierName}`,
      });

      journalEntries.push({
        type: 'credit',
        accountId: supplierAccountId,
        amount: paidAmount,
        narration: `Payment for purchase invoice #${billNo}`,
      });
    }

    const formData = new FormData();
    formData.append('billNo', billNo);
    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('supplierName', supplierName);
    formData.append('supplierPhone', supplierPhone);
    formData.append('supplierId', selectedSupplier?._id || '');
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', finalDiscount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);
    if (attachment) formData.append('attachment', attachment);
    formData.append('items', JSON.stringify(validItems));
    formData.append('createJournal', 'true');
    formData.append('journalEntries', JSON.stringify(journalEntries));

    try {
      if (isEdit) {
        await purchaseInvoiceService.updatePurchaseInvoice(invoiceId, formData);
        alert(t('alerts.invoiceUpdated'));
      } else {
        await purchaseInvoiceService.addPurchaseInvoice(formData);
        alert(t('alerts.invoiceSaved'));
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error saving invoice:', err?.response?.data || err.message);
      alert(t('alerts.invoiceSaveFailed'));
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    window.print(content);
  };

  const handleDownloadPDF = () => {
    const content = printRef.current;
    html2canvas(content).then((canvas) => {
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(img);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(img, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`purchase_invoice_${billNo}.pdf`);
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto p-6 bg-white rounded shadow">
        <div className="grid grid-cols-12 gap-6">
          {/* 🧾 Main Invoice Section */}
          <div className={showHistory ? 'col-span-10' : 'col-span-12'}>
            <div ref={printRef} id="print-section">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">📦 {t('purchase.invoice')}</h2>

                <div className="flex gap-2">
                  {/* 🔍 Find Invoice */}
                  <button
                    type="button"
                    onClick={() => setShowSearchModal(true)}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
                  >
                    🔍 {t('findInvoice')}
                  </button>

                  {/* 📊 History */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (showHistory) {
                        setShowHistory(false);
                        return;
                      }

                      if (!selectedProductId) return;

                      setLoadingHistory(true);

                      const history =
                        await purchaseInvoiceService.getItemPurchaseHistory(selectedProductId);

                      setItemHistory(history);
                      setShowHistory(true);
                      setLoadingHistory(false);
                    }}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    {showHistory ? t('hide') : t('sales.previous')}
                  </button>
                </div>
              </div>

              {/* 🔹 All 5 fields in ONE ROW – Sales Style */}
              <div className="grid grid-cols-12 gap-2 items-start mb-4">
                {/* Supplier Name – wide */}
                <div className="col-span-4 relative">
                  <input
                    type="text"
                    value={supplierName}
                    onChange={handleSupplierInput}
                    onKeyDown={handleSupplierKeyDown}
                    className="border px-2 py-1 h-9 w-full text-sm"
                    placeholder={t('supplier.supplier')}
                    autoComplete="off"
                  />

                  {supplierSuggestions.length > 0 && (
                    <ul
                      className="absolute left-0 right-0 bg-white border mt-1 max-h-40 overflow-auto shadow-lg"
                      style={{ zIndex: 9999 }}
                    >
                      {supplierSuggestions.map((s, i) => (
                        <li
                          key={i}
                          onMouseDown={() => handleSupplierSelect(s.name, s.phone)}
                          className={`px-2 py-2 cursor-pointer ${
                            selectedSupplierIndex === i ? 'bg-blue-100 font-bold' : ''
                          }`}
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showSupplierAddOptions &&
                    supplierSuggestions.length === 0 &&
                    supplierName.trim() !== '' && (
                      <ul
                        className="absolute left-0 right-0 bg-white border mt-1 shadow-lg"
                        style={{ zIndex: 9999 }}
                      >
                        <li
                          onPointerDown={(e) => {
                            e.preventDefault();
                            quickAddSupplier(supplierName);
                          }}
                          className="px-3 py-2 cursor-pointer 
             bg-gradient-to-r from-green-50 to-green-100
             hover:from-green-100 hover:to-green-200
             text-green-700 font-semibold 
             rounded-t-md transition-all duration-150"
                        >
                          ➕ <span className="font-bold">{t('product.addNew')}</span> "
                          {supplierName}"
                        </li>

                        <li
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setSupplierFormName(supplierName);
                            setShowSupplierAddOptions(false);
                            setSupplierSuggestions([]);
                            setShowSupplierForm(true);
                          }}
                          className="px-3 py-2 cursor-pointer 
             bg-gradient-to-r from-blue-50 to-blue-100
             hover:from-blue-100 hover:to-blue-200
             text-blue-700 font-medium 
             rounded-b-md transition-all duration-150"
                        >
                          📝 <span className="font-semibold">{t('product.addNew')}</span>
                        </li>
                      </ul>
                    )}
                </div>

                {/* Phone */}
                <div className="col-span-3">
                  <input
                    id="supplier-phone"
                    type="text"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="border px-2 py-1 h-9 w-full text-sm"
                    placeholder={t('phone')}
                  />
                </div>

                {/* Bill No */}
                <div className="col-span-2">
                  <input
                    type="text"
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value)}
                    className="border px-2 py-1 h-8 w-full text-sm"
                    placeholder={t('billNo')}
                  />
                </div>

                {/* Date */}
                <div className="col-span-2">
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="border px-2 py-1 h-8 w-full text-sm"
                  />
                </div>

                {/* Time */}
                <div className="col-span-1">
                  <input
                    type="text"
                    value={invoiceTime}
                    onChange={(e) => setInvoiceTime(e.target.value)}
                    className="border px-2 py-1 h-8 w-full text-sm"
                    placeholder={t('time')}
                  />
                </div>
              </div>

              {isEdit && <input type="hidden" value={invoiceId} />}

              {/* PurchaseInvoice Table */}
              <InvoiceTable
                items={items}
                setItems={setItems}
                products={products}
                handleQtyRateChange={handleQtyRateChange}
                clearOnFocus={clearOnFocus}
                mode="purchase" // ✅ VERY IMPORTANT
                onProductChange={handleProductHistory}
              />

              {/* 🔹 Totals + Buttons – Sales Style */}
              <div className="bg-gray-100 p-4 rounded mt-6">
                <div className="grid grid-cols-12 gap-6 items-start">
                  {/* LEFT SIDE */}
                  <div className="col-span-8 flex flex-col gap-4">
                    {/* TOP ROW — Discount / Paid / File */}
                    <div className="flex gap-3 items-center flex-wrap">
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

                      <input
                        type="number"
                        placeholder={t('discountRS')}
                        value={discountAmount === 0 ? '' : discountAmount}
                        onChange={(e) => {
                          setDiscountAmount(+e.target.value || 0);
                          setDiscountPercent(0);
                        }}
                        className="border px-2 py-0 text-sm h-8 w-24 appearance-none"
                      />

                      <input
                        type="number"
                        placeholder={t('paid')}
                        value={paidAmount === 0 ? '' : paidAmount}
                        onChange={(e) => setPaidAmount(+e.target.value || 0)}
                        className="border px-2 py-0 text-sm h-8 w-24 appearance-none"
                      />

                      <select
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value)}
                        className="border px-2 py-1 h-8 text-sm cursor-pointer"
                      >
                        <option value="cash">{t('payment.cash')}</option>
                        <option value="cheque">{t('payment.cheque')}</option>
                        <option value="online">{t('payment.online')}</option>
                      </select>

                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        disabled={paidAmount === 0}
                        className="border px-2 py-1 h-8 w-28 text-sm cursor-pointer"
                      >
                        <option value="">{t('alerts.selectAccount')}</option>
                        {accounts.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="border px-2 py-0 text-sm h-8 w-36"
                      />
                    </div>

                    {/* SECOND ROW — Buttons */}
                    <div className="flex flex-wrap gap-3 mt-8">
                      {isEdit ? (
                        <button
                          type="button"
                          onClick={handleUpdate}
                          className="bg-orange-600 text-white px-4 py-2 rounded"
                        >
                          🔁 {t('updateClose')}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={handleSaveAndClose}
                            className="bg-green-600 text-white px-4 py-2 rounded"
                          >
                            💾 {t('saveClose')}
                          </button>

                          <button
                            type="button"
                            onClick={handleSaveAndNew}
                            className="bg-blue-600 text-white px-4 py-2 rounded"
                          >
                            📄 {t('saveNew')}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={handleClear}
                        className="bg-gray-500 text-white px-4 py-2 rounded"
                      >
                        {isEdit ? t('common.revert') : t('clear')}
                      </button>

                      <button
                        type="button"
                        onClick={handlePrint}
                        className="bg-purple-600 text-white px-4 py-2 rounded"
                      >
                        🖨 {t('print')}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadPDF}
                        className="bg-indigo-600 text-white px-4 py-2 rounded"
                      >
                        📄 {t('pdf')}
                      </button>
                    </div>
                  </div>

                  {/* RIGHT SIDE — Totals */}
                  <div className="col-span-4 text-right space-y-1 text-sm">
                    <p>
                      {t('total')}: Rs. {totalAmount.toFixed(2)}
                    </p>
                    <p>
                      {t('discount')}: Rs. {finalDiscount.toFixed(2)}
                    </p>
                    <p className="text-lg font-bold">
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
            </div>
          </div>
          {/* 📊 History Panel */}
          {showHistory && (
            <div className="col-span-2 bg-gray-50 border rounded p-3 h-fit">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-sm">📊 {t('inventory.stockHistory')}</h3>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-red-500 text-xs"
                >
                  {t('hide')}
                </button>
              </div>

              {loadingHistory ? (
                <p className="text-xs text-gray-500">{t('common.loading')}</p>
              ) : itemHistory.length === 0 ? (
                <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {itemHistory.map((record, index) => (
                    <div key={index} className="border rounded p-2 bg-white shadow-sm">
                      <p className="font-semibold">{record.supplierName}</p>
                      <p>
                        {t('date')}: {new Date(record.invoiceDate).toLocaleDateString()}
                      </p>
                      <p>
                        {t('rate')}: Rs. {record.price}
                      </p>
                      <p>
                        {t('qty')}: {record.quantity}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
      {showSearchModal && (
        <PurchaseInvoiceSearchModal
          onClose={() => setShowSearchModal(false)}
          onSelect={(invoice) => {
            setShowSearchModal(false);

            // 🔥 Update mode activate
            setIsEdit(true);
            setInvoiceId(invoice._id);

            setBillNo(invoice.billNo);
            setInvoiceDate(invoice.invoiceDate?.slice(0, 10));
            setInvoiceTime(invoice.invoiceTime || '');

            setSupplierName(invoice.supplierName);
            setSupplierPhone(invoice.supplierPhone);

            setDiscountPercent(invoice.discountPercent || 0);
            setDiscountAmount(invoice.discountAmount || 0);
            setPaidAmount(invoice.paidAmount || 0);
            setPaymentType(invoice.paymentType || 'cash');
            setSelectedAccountId(invoice.accountId || '');

            // 🔥 Items load کریں
            const loadedItems = (invoice.items || []).map((item, index) => {
              const product =
                typeof item.productId === 'object'
                  ? item.productId
                  : products.find((p) => p._id === item.productId);

              return {
                itemNo: index + 1,
                productId: product?._id || item.productId || '',
                search: product?.name || '',
                name: product?.name || '',
                description: product?.description || '',
                cost: Number(item.price ?? 0),
                rate: Number(item.price ?? 0),
                quantity: Number(item.quantity ?? 1),
                amount: Number(item.total ?? 0),
              };
            });

            const emptyRows = Array.from({ length: 10 }, (_, i) => ({
              itemNo: loadedItems.length + i + 1,
              search: '',
              productId: '',
              name: '',
              description: '',
              cost: 0,
              quantity: 1,
              rate: 0,
              amount: 0,
            }));

            setItems([...loadedItems, ...emptyRows]);
          }}
        />
      )}
      {showSupplierForm && (
        <SupplierForm
          initialData={{ name: supplierFormName }}
          onSubmit={async (data) => {
            try {
              const res = await fetch('/api/suppliers', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(data),
              });

              const newSupplier = await res.json();

              if (!res.ok) {
                alert(newSupplier.message || 'Supplier add failed');
                return;
              }

              // ✅ Auto select supplier
              setSupplierName(newSupplier.name);
              setSupplierPhone(newSupplier.phone || '');

              // ✅ Refresh suppliers list
              const updatedSuppliers = await fetchSuppliers();
              setSuppliers(updatedSuppliers);

              setShowSupplierForm(false);

              // ✅ Cursor item search میں
              setTimeout(() => {
                const firstItemInput = document.querySelector(
                  'input[placeholder="Search Item..."]'
                );
                firstItemInput?.focus();
              }, 0);
            } catch (err) {
              console.error(err);
              alert(t('alerts.supplierAddFailed'));
            }
          }}
          onCancel={() => {
            setShowSupplierForm(false);
            setShowSupplierAddOptions(false);
          }}
        />
      )}
    </>
  );
};

export default PurchaseInvoiceForm;
