// src/components/PurchaseInvoiceForm.js

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom'; // ✅ Edit mode کے لیے id لینے کے لیے
import { fetchSuppliers } from '../services/supplierService';
import { fetchProductsWithToken } from '../services/inventoryService';
import { getValidPaymentAccounts } from '../services/accountService';

import purchaseInvoiceService from '../services/purchaseInvoiceService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PurchaseInvoiceTable from './PurchaseInvoiceTable';
import { useLocation } from 'react-router-dom';

const PurchaseInvoiceForm = () => {
  const token = localStorage.getItem('token');
  const printRef = useRef();
  const fileInputRef = useRef();
  const { id } = useParams(); // ✅ URL سے invoice ID لینے کے لیے

  const [isEdit, setIsEdit] = useState(false); // ✅ edit mode check
  const [invoiceId, setInvoiceId] = useState(null); // ✅ current invoice ID

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);

  const [billNo, setBillNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTime, setInvoiceTime] = useState('');
  const [items, setItems] = useState([
    {
      itemNo: 1,
      search: '',
      productId: '',
      name: '',
      description: '',
      cost: 0,
      quantity: 1,
      rate: 0,
      amount: 0,
    },
  ]);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [attachment, setAttachment] = useState(null);

  const [paymentType, setPaymentType] = useState('credit');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const [productSuggestions, setProductSuggestions] = useState([]);
  const [selectedProductIndexByRow, setSelectedProductIndexByRow] = useState({});

  useEffect(() => {
    const now = new Date();
    setInvoiceDate(now.toISOString().split('T')[0]);
    setInvoiceTime(now.toTimeString().slice(0, 5));

    if (!token) return;
    fetchSuppliers().then(setSuppliers);
    fetchProductsWithToken(token).then(setProducts);
    getValidPaymentAccounts().then(setAccounts);

    // ✅ اگر id موجود ہو تو edit mode enable کریں
    if (id) {
      purchaseInvoiceService.getPurchaseInvoiceById(id).then((invoice) => {
        setIsEdit(true);
        setInvoiceId(invoice._id);
        setBillNo(invoice.billNo);
        setInvoiceDate(invoice.invoiceDate);
        setInvoiceTime(invoice.invoiceTime);
        setSupplierName(invoice.supplierName);
        setSupplierPhone(invoice.supplierPhone);
        setDiscountPercent(invoice.discountPercent || 0);
        setDiscountAmount(invoice.discountAmount || 0);
        setPaidAmount(invoice.paidAmount || 0);
        setPaymentType(invoice.paymentType || 'credit');
        setSelectedAccountId(invoice.accountId || '');
        setItems(invoice.items || []);
      });
    }
  }, [token, id]);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editMode = params.get('edit') === 'true';
    const id = params.get('id');

    if (editMode && id) {
      setIsEdit(true);
      setInvoiceId(id);

      const fetchInvoice = async () => {
        try {
          const data = await purchaseInvoiceService.getPurchaseInvoiceById(id);
          setBillNo(data.billNo);
          setInvoiceDate(data.invoiceDate);
          setInvoiceTime(data.invoiceTime);
          setSupplierName(data.supplierName);
          setSupplierPhone(data.supplierPhone);
          setDiscountPercent(data.discountPercent || 0);
          setDiscountAmount(data.discountAmount || 0);
          setPaidAmount(data.paidAmount || 0);
          setPaymentType(data.paymentType || 'credit');
          setSelectedAccountId(data.accountId || '');
          setItems(
            data.items.map((item, index) => ({
              itemNo: index + 1,
              productId: item.productId,
              search: item.name,
              name: item.name,
              description: item.description || '',
              cost: item.price,
              quantity: item.quantity,
              rate: item.price,
              amount: item.total,
            }))
          );
        } catch (err) {
          console.error('❌ Error loading invoice for edit:', err);
        }
      };

      fetchInvoice();
    }
  }, [location]);

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
    } else {
      const filtered = filterSuppliers(value);
      setSupplierSuggestions(filtered);
      setSelectedSupplierIndex(0);
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
      console.log('✅ Supplier account ID:', selected.account); // ✅ For journal entries
    }

    setSupplierSuggestions([]);
    setSelectedSupplierIndex(-1);
  };

  const clearOnFocus = (e) => {
    if (e.target.value === '0') e.target.select();
  };

  // ✅ Product Select Function (FIX)
  const handleProductSelect = (product, rowIndex) => {
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      productId: product._id,
      search: product.name,
      name: product.name,
      description: product.description || '',
      cost: product.unitCost || 0,
      rate: product.salePrice || 0,
      amount: (product.unitCost || 0) * updated[rowIndex].quantity,
    };

    setItems(updated);
    setProductSuggestions([]);
    setSelectedProductIndexByRow((prev) => ({ ...prev, [rowIndex]: -1 }));

    if (rowIndex === items.length - 1) {
      setItems((prev) => [
        ...prev,
        {
          itemNo: prev.length + 1,
          search: '',
          productId: '',
          name: '',
          description: '',
          cost: 0,
          quantity: 1,
          rate: 0,
          amount: 0,
        },
      ]);
    }
  };

  const handleCostChange = (index, value) => {
    const updated = [...items];
    updated[index].cost = +value;
    updated[index].amount = updated[index].quantity * updated[index].cost;
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const finalDiscount =
    discountPercent > 0 ? (totalAmount * discountPercent) / 100 : discountAmount;
  const grandTotal = totalAmount - finalDiscount;

  const handleFileChange = (e) => {
    setAttachment(e.target.files[0]);
  };

  const handleSaveAndClose = async () => {
    try {
      const selectedSupplier = suppliers.find((s) => s.name === supplierName);
      const supplierAccountId = selectedSupplier?.account || '';

      const validItems = items
        .filter((i) => i.productId && i.quantity > 0 && i.rate > 0)
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
        alert('✏️ Invoice updated successfully!');
      } else {
        await purchaseInvoiceService.addPurchaseInvoice(formData);
        alert('✅ Invoice saved successfully!');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error saving invoice:', err?.response?.data || err.message);
      alert('❌ Failed to save invoice.');
    }
  };

  const handleSaveAndNew = async () => {
    try {
      await handleSaveAndClose();
      setBillNo('');
      setSupplierName('');
      setSupplierPhone('');
      setItems([
        {
          itemNo: 1,
          search: '',
          productId: '',
          name: '',
          description: '',
          cost: 0,
          quantity: 1,
          rate: 0,
          amount: 0,
        },
      ]);
      setDiscountPercent(0);
      setDiscountAmount(0);
      setPaidAmount(0);
      setSelectedAccountId('');
      setAttachment(null);
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
      .filter((i) => i.productId && i.quantity > 0 && i.rate > 0)
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
      alert('✅ Invoice updated successfully!');
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error updating invoice:', err?.response?.data || err.message);
      alert('❌ Failed to update invoice.');
    }
  };

  const handleClear = () => {
    setBillNo('');
    setSupplierName('');
    setSupplierPhone('');
    setItems([
      {
        itemNo: 1,
        search: '',
        productId: '',
        name: '',
        description: '',
        cost: 0,
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ]);
    setDiscountPercent(0);
    setDiscountAmount(0);
    setPaidAmount(0);
    setSelectedAccountId('');
    setAttachment(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!billNo || billNo.trim() === '') {
      alert('⚠️ Bill number is required!');
      return;
    }

    if (paidAmount > 0 && (!selectedAccountId || selectedAccountId.trim() === '')) {
      alert('⚠️ Please select a valid account!');
      return;
    }

    document.querySelector('select[name="selectedAccountId"]')?.focus();

    const selectedSupplier = suppliers.find((s) => s.name === supplierName);
    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = items
      .filter((i) => i.productId && i.quantity > 0 && i.rate > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.amount,
      }));

    if (validItems.length === 0) {
      alert('⚠️ Please add at least one valid product.');
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
        alert('✏️ Purchase Invoice updated successfully!');
      } else {
        await purchaseInvoiceService.addPurchaseInvoice(formData);
        alert('✅ Purchase Invoice saved successfully!');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('❌ Error saving invoice:', err?.response?.data || err.message);
      alert('❌ Failed to save purchase invoice.');
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
    <form
      onSubmit={handleSubmit}
      className="max-w-6xl mx-auto p-6 bg-white rounded shadow space-y-6"
    >
      <div ref={printRef} id="print-section">
        <h2 className="text-2xl font-bold">📦 Purchase Invoice</h2>

        {/* Supplier Info + Date/Time/Bill No */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* Left Column */}
          <div>
            <div className="mb-3">
              <label>Supplier Name</label>
              <input
                type="text"
                value={supplierName}
                onChange={handleSupplierInput}
                onKeyDown={handleSupplierKeyDown}
                className="border p-2 w-full"
                autoComplete="off"
              />
              {supplierSuggestions.length > 0 && (
                <ul className="border rounded shadow bg-white absolute z-10 w-full max-w-full">
                  {supplierSuggestions.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => handleSupplierSelect(s.name, s.phone)}
                      className={`p-2 cursor-pointer hover:bg-gray-100 ${
                        i === selectedSupplierIndex ? 'bg-gray-200' : ''
                      }`}
                    >
                      {s.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label>Phone</label>
              <input
                id="supplier-phone"
                type="text"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                className="border p-2 w-full"
              />
            </div>
          </div>

          {/* Right Column */}
          <div>
            <div className="mb-3">
              <label>Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="border p-2 w-full"
              />
            </div>

            <div className="mb-3">
              <label>Time</label>
              <input
                type="time"
                value={invoiceTime}
                onChange={(e) => setInvoiceTime(e.target.value)}
                className="border p-2 w-full"
              />
            </div>

            <div>
              <label>Bill No</label>
              <input
                type="text"
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                className="border p-2 w-full"
                placeholder="Enter bill number"
              />
            </div>

            {/* ✅ Hidden Invoice ID for Edit Mode */}
            {isEdit && <input type="hidden" value={invoiceId} />}
          </div>
        </div>

        {/* PurchaseInvoice Table */}
        <PurchaseInvoiceTable
          items={items}
          setItems={setItems}
          productSuggestions={productSuggestions}
          selectedProductIndexByRow={selectedProductIndexByRow}
          handleSearchChange={(index, val) => {
            const updated = [...items];
            updated[index].search = val;

            if (val.trim() === '') {
              updated[index] = {
                ...updated[index],
                search: '',
                productId: '',
                name: '',
                description: '',
                cost: 0,
                rate: 0,
                amount: 0,
              };
              setProductSuggestions([]);
              setSelectedProductIndexByRow((prev) => ({ ...prev, [index]: -1 }));
            } else {
              const matches = products
                .filter((p) => p.name.toLowerCase().includes(val.toLowerCase()))
                .map((p) => ({ ...p, row: index }));
              setProductSuggestions(matches);
              setSelectedProductIndexByRow((prev) => ({ ...prev, [index]: 0 }));
            }

            setItems(updated);
          }}
          handleProductKeyDown={(e, index) => {
            const list = productSuggestions.filter((p) => p.row === index);
            if (list.length === 0) return;

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedProductIndexByRow((prev) => ({
                ...prev,
                [index]: prev[index] < list.length - 1 ? prev[index] + 1 : 0,
              }));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedProductIndexByRow((prev) => ({
                ...prev,
                [index]: prev[index] > 0 ? prev[index] - 1 : list.length - 1,
              }));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const selected = list[selectedProductIndexByRow[index]];
              if (selected) {
                handleProductSelect(selected, index);
                setTimeout(() => {
                  document.getElementById(`qty-${index}`)?.focus();
                }, 0);
              }
            }
          }}
          handleCostChange={handleCostChange}
          handleQtyRateChange={(index, field, value) => {
            const updated = [...items];
            updated[index][field] = +value;
            updated[index].amount = updated[index].quantity * updated[index].cost;
            setItems(updated);
          }}
          clearOnFocus={clearOnFocus}
        />

        {/* 🔘 Payment Type Dropdown */}
        <div className="mb-4">
          <label className="block font-medium text-sm">Payment Type</label>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            className="border p-2 w-full text-right"
          >
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
            <option value="cheque">Cheque</option>
            <option value="bank">Bank</option>
            <option value="online">Online</option>
          </select>
        </div>

        {/* 🏦 Select Account Dropdown */}
        <div className="mb-4">
          <label className="block font-medium text-sm">Select Account</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="border p-2 w-full rounded"
          >
            <option value="">-- Select --</option>
            {accounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* 🧮 Totals Section (Discount + Paid Amount) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-right">
          {/* Discount Percentage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount %</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => {
                setDiscountPercent(+e.target.value);
                setDiscountAmount(0);
              }}
              className="border p-2 w-full rounded text-right focus:outline-none focus:ring focus:border-blue-300"
              placeholder="e.g. 10"
            />
          </div>

          {/* Discount in Rupees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Rs</label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => {
                setDiscountAmount(+e.target.value);
                setDiscountPercent(0);
              }}
              className="border p-2 w-full rounded text-right focus:outline-none focus:ring focus:border-blue-300"
              placeholder="e.g. 500"
            />
          </div>

          {/* Paid Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(+e.target.value)}
              className="border p-2 w-full rounded text-right focus:outline-none focus:ring focus:border-blue-300"
              placeholder="e.g. 1500"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="text-right mt-4 font-semibold">
          <p>Total: Rs. {totalAmount.toFixed(2)}</p>
          <p>Discount: Rs. {finalDiscount.toFixed(2)}</p>
          <p>Grand Total: Rs. {grandTotal.toFixed(2)}</p>
          <p>Paid: Rs. {paidAmount.toFixed(2)}</p>
          <p className="text-red-600">Remaining: Rs. {(grandTotal - paidAmount).toFixed(2)}</p>
        </div>

        {/* Attachment */}
        <div className="mt-4 text-right">
          <label>Attachment</label>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="ml-2" />
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap justify-end gap-3 mt-4">
          {isEdit ? (
            <button
              type="button"
              onClick={handleUpdate}
              className="bg-orange-600 text-white px-4 py-2 rounded"
            >
              🔁 Update
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                💾 Save & Close
              </button>

              <button
                type="button"
                onClick={handleSaveAndNew}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                📄 Save & New
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleClear}
            className="bg-yellow-600 text-black px-4 py-2 rounded"
          >
            🧹 Clear
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="bg-purple-600 text-white px-4 py-2 rounded"
          >
            🖨 Print
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            📄 Download PDF
          </button>
        </div>
      </div>
    </form>
  );
};

export default PurchaseInvoiceForm;
