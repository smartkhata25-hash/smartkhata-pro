import React, { useEffect, useState, useRef } from 'react';
import { createInvoice, updateInvoice, getLastInvoiceNo } from '../services/salesService'; // ✅ updateInvoice بھی شامل کیا گیا
import { fetchProductsWithToken } from '../services/inventoryService';
import { fetchCustomers } from '../services/customerService';
import { getAccounts } from '../services/accountService'; // ✅ new import
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import InvoiceTable from './InvoiceTable';
import { getInvoiceById } from '../services/salesService';

const InvoiceForm = ({ token, onSuccess, editingInvoice = null, invoiceId }) => {
  // ✅ editingInvoice prop بھی شامل کیا گیا
  const printRef = useRef();
  const fileInputRef = useRef();

  const [editingInvoiceFromAPI, setEditingInvoiceFromAPI] = useState(null);
  const [billNo, setBillNo] = useState(1001);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTime, setInvoiceTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [headerText, setHeaderText] = useState('🧾 Sales Invoice');
  const [footerText, setFooterText] = useState('Thank you for your business!');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [selectedProductIndexByRow, setSelectedProductIndexByRow] = useState({});
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

  // ✅ Step 1: New States
  const [paymentType, setPaymentType] = useState('credit'); // default value
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);

  // ✅ Step 2: Updated useEffect to load accounts & prefill if editing
  useEffect(() => {
    const now = new Date();

    if (!editingInvoice && !editingInvoiceFromAPI) {
      setInvoiceDate(now.toISOString().split('T')[0]);
      setInvoiceTime(now.toTimeString().slice(0, 5));
    }

    const params = new URLSearchParams(window.location.search);
    const invoiceIdFromURL = params.get('invoiceId');

    // ✅ اگر props سے نہیں آیا تو URL سے لاؤ
    if (!editingInvoice && invoiceIdFromURL && token) {
      getInvoiceById(invoiceIdFromURL, token).then((data) => {
        setEditingInvoiceFromAPI(data);
      });
    }

    const invoiceToUse = editingInvoice || editingInvoiceFromAPI;

    if (invoiceToUse) {
      setBillNo(invoiceToUse.billNo);
      setInvoiceDate(invoiceToUse.invoiceDate);
      setInvoiceTime(invoiceToUse.invoiceTime || '');
      setCustomerName(invoiceToUse.customerName);
      setCustomerPhone(invoiceToUse.customerPhone);
      setPaidAmount(invoiceToUse.paidAmount || 0);
      setPaymentType(invoiceToUse.paymentType || '');
      setSelectedAccountId(invoiceToUse.accountId || '');

      setItems(
        invoiceToUse.items.map((item, i) => ({
          itemNo: i + 1,
          search: '',
          productId: item.productId,
          name: '',
          description: '',
          cost: 0,
          quantity: item.quantity,
          rate: item.price,
          amount: item.total,
        }))
      );
    }
  }, [editingInvoice, editingInvoiceFromAPI, token]);

  useEffect(() => {
    if (!token) return;

    fetchCustomers(token).then(setCustomers);
    fetchProductsWithToken(token).then(setProducts);
    getLastInvoiceNo(token).then((lastNo) => {
      const safeBillNo = parseInt(lastNo, 10);
      setBillNo(isNaN(safeBillNo) ? 1001 : safeBillNo + 1);
    });

    // ✅ Filter only cash & bank accounts
    getAccounts(token).then((all) => {
      const filtered = all.filter((acc) => ['cash', 'bank'].includes(acc.category));
      setAccounts(filtered);
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
    } else {
      const filtered = filterCustomers(value);
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
        setTimeout(() => {
          document.getElementById('customer-phone')?.focus(); // ✅ move to phone
        }, 0);
      }
    }
  };

  const handleCustomerSelect = (name, phone) => {
    setCustomerName(name);
    setCustomerPhone(phone);
    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);
  };
  const filterProducts = (value) => {
    const query = value.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(query) || p.sku?.toLowerCase() === query
    );
  };

  const handleSearchChange = (index, value) => {
    const updated = [...items];
    updated[index].search = value;
    if (value.trim() === '') {
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
      const matches = filterProducts(value);
      const filteredWithRow = matches.map((p) => ({ ...p, row: index }));
      setProductSuggestions(filteredWithRow);
      setSelectedProductIndexByRow((prev) => ({ ...prev, [index]: 0 }));
    }
    setItems(updated);
  };

  const handleProductKeyDown = (e, index) => {
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
          document.getElementById(`qty-${index}`)?.focus(); // ✅ Move to quantity input
        }, 0);
      }
    }
  };

  const handleProductSelect = (product, rowIndex) => {
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      search: product.name,
      productId: product._id,
      name: product.name,
      description: product.description || '',
      cost: product.unitCost || 0,
      rate: product.salePrice || 0,
      amount: (product.salePrice || 0) * updated[rowIndex].quantity,
    };
    setItems(updated);
    setProductSuggestions([]);
    setSelectedProductIndexByRow((prev) => ({ ...prev, [rowIndex]: -1 }));

    if (rowIndex === items.length - 1) addRow();
  };

  const handleQtyRateChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = Number(value);
    updated[index].amount = updated[index].quantity * updated[index].rate;
    setItems(updated);
  };

  const addRow = () => {
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
  };
  const clearOnFocus = (e) => {
    if (e.target.value === '0') e.target.select();
  };

  const toggleEditable = (e, setter) => {
    const current = e.target.innerText;
    const newValue = prompt('Rename field:', current);
    if (newValue !== null) setter(newValue);
  };

  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const finalDiscount =
    discountPercent > 0 ? (totalAmount * discountPercent) / 100 : discountAmount;
  const grandTotal = totalAmount - finalDiscount;

  const handleFileChange = (e) => {
    setAttachment(e.target.files[0]);
  };
  const handleSubmit = async (e, mode = 'close') => {
    e.preventDefault();

    const mappedItems = items
      .filter((i) => i.productId && i.quantity > 0 && i.rate > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        total: i.quantity * i.rate,
      }));

    if (mappedItems.length === 0) {
      alert('⚠️ Please add at least one valid product.');
      return;
    }

    // 🔎 Validate paymentType only if payment is made
    const validPaymentTypes = ['cash', 'credit', 'bank', 'cheque', 'online'];
    if (paidAmount > 0) {
      if (!validPaymentTypes.includes(paymentType)) {
        alert('⚠️ Invalid or missing payment type.');
        return;
      }

      // ✅ For non-credit types, accountId must be present
      if (paymentType !== 'credit' && !selectedAccountId) {
        alert('⚠️ Please select an account for the selected payment method.');
        return;
      }
    }

    const formData = new FormData();
    formData.append('billNo', billNo);
    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('customerName', customerName);
    formData.append('customerPhone', customerPhone);
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', finalDiscount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);

    // 💡 Always append paymentType to stay consistent with schema default
    formData.append('paymentType', paymentType || 'credit');

    // ✅ Only send accountId if paymentType demands it
    if (
      paidAmount > 0 &&
      ['cash', 'bank', 'cheque', 'online'].includes(paymentType) &&
      selectedAccountId
    ) {
      formData.append('accountId', selectedAccountId);
    }

    if (attachment) formData.append('attachment', attachment);
    formData.append('items', JSON.stringify(mappedItems));

    try {
      if (editingInvoice) {
        await updateInvoice(editingInvoice._id, formData, token);
      } else {
        await createInvoice(formData, token);
      }

      if (onSuccess) onSuccess();

      if (mode === 'new' && !editingInvoice) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const latestNo = await getLastInvoiceNo(token);
        setBillNo((latestNo || 1000) + 1);
        setInvoiceDate(today);
        setInvoiceTime(currentTime);

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
        setCustomerName('');
        setCustomerPhone('');
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
      alert('❌ Failed to save the invoice. Please try again.');
    }
  };

  const handlePrint = () => {
    const original = printRef.current;

    // ❌ Hide empty rows
    const rows = original.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const productInput = row.querySelector('input[value]');
      if (!productInput || !productInput.value.trim()) row.style.display = 'none';
    });

    // ❌ Hide cost column
    const costEls = original.querySelectorAll('th:nth-child(4), td:nth-child(4)');
    costEls.forEach((el) => (el.style.display = 'none'));

    // ✅ Prepare printable content
    const printContent = original.innerHTML;
    const newWindow = window.open('', '', 'width=800,height=600');

    newWindow.document.write(`
    <html>
      <head>
        <title>Invoice</title>
        <style>
          @media print { .no-print { display: none !important; } }
          body { font-family: Arial; padding: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; }
        </style>
      </head>
      <body>${printContent}</body>
    </html>
  `);

    // ✅ Print actions
    newWindow.document.close();
    newWindow.focus();
    newWindow.print();
    newWindow.close();

    // ♻️ Restore hidden elements
    rows.forEach((row) => (row.style.display = ''));
    costEls.forEach((el) => (el.style.display = ''));
  };

  const handleDownloadPDF = () => {
    const original = printRef.current;
    const rows = original.querySelectorAll('tbody tr');
    const removedRows = [];
    rows.forEach((row) => {
      const productInput = row.querySelector('input[value]');
      if (!productInput || !productInput.value.trim()) {
        removedRows.push(row);
        row.style.display = 'none';
      }
    });

    const costEls = original.querySelectorAll('th:nth-child(4), td:nth-child(4)');
    costEls.forEach((el) => (el.style.display = 'none'));

    const inputs = original.querySelectorAll('input');
    const originalInputStyles = [];
    inputs.forEach((input) => {
      const span = document.createElement('span');
      span.textContent = input.value;
      span.style.padding = '4px';
      span.style.border = '1px solid #ccc';
      span.style.display = 'inline-block';
      span.style.minWidth = input.offsetWidth + 'px';
      span.style.fontSize = '12px';
      span.style.lineHeight = '1.4';
      span.style.verticalAlign = 'middle';
      input.parentNode.replaceChild(span, input);
      originalInputStyles.push({ span, input });
    });

    html2canvas(original).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`invoice_${billNo}.pdf`);

      removedRows.forEach((row) => (row.style.display = ''));
      costEls.forEach((el) => (el.style.display = ''));
      originalInputStyles.forEach(({ span, input }) => {
        span.parentNode.replaceChild(input, span);
      });
    });
  };
  if (!token) return <p className="text-red-600 p-4">⚠️ Please login first.</p>;

  return (
    <form
      onSubmit={(e) => handleSubmit(e)}
      className="max-w-6xl mx-auto p-6 bg-white rounded shadow space-y-6"
    >
      <div ref={printRef} id="print-section">
        {/* 🧾 Header */}
        <h2
          className="text-2xl font-bold cursor-pointer"
          onDoubleClick={(e) => toggleEditable(e, setHeaderText)}
        >
          {headerText}
        </h2>

        {/* Invoice Info */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <label>Bill No</label>
            <input
              type="number"
              value={billNo}
              onChange={(e) => setBillNo(+e.target.value)}
              className="border p-2 w-full"
            />
          </div>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="border p-2 w-full"
            />
          </div>
          <div>
            <label>Time</label>
            <input
              type="text"
              value={invoiceTime}
              onChange={(e) => setInvoiceTime(e.target.value)}
              className="border p-2 w-full"
            />
          </div>
        </div>

        {/* Payment Info */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* ✅ Payment Type Dropdown */}
          <div>
            <label>Payment Type</label>
            <select
              value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value);
                setSelectedAccountId(''); // reset account selection on type change
              }}
              className="border p-2 w-full"
            >
              <option value="">-- Select --</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
            </select>
          </div>

          {/* ✅ Account Selection Dropdown */}
          <div>
            <label>Select Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="border p-2 w-full"
            >
              <option value="">-- Select --</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.code} - {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-4 relative mt-4">
          <div className="relative">
            <label>Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={handleCustomerInput}
              onKeyDown={handleCustomerKeyDown}
              className="border p-2 w-full"
              autoComplete="off"
            />
            {customerSuggestions.length > 0 && (
              <ul className="absolute bg-white border mt-1 w-full max-h-32 overflow-auto z-10">
                {customerSuggestions.map((c, i) => (
                  <li
                    key={i}
                    onClick={() => handleCustomerSelect(c.name, c.phone)}
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
          <div>
            <label>Phone</label>
            <input
              id="customer-phone"
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="border p-2 w-full"
            />
          </div>
        </div>

        {/* 📎 Attachment */}
        <div className="mt-4 relative">
          <label className="block mb-1">📎 Attachment</label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="border p-2 w-full"
          />
          {attachment && (
            <div className="flex items-center justify-between mt-2">
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                className="text-blue-600 underline"
              >
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove this attachment?')) {
                    setAttachment(null);
                    setShowPreview(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }
                }}
                className="text-red-500 ml-4"
              >
                ❌ Remove
              </button>
            </div>
          )}
          {attachment && showPreview && (
            <div className="mt-3 border rounded p-2 max-h-64 overflow-auto">
              <img
                src={URL.createObjectURL(attachment)}
                alt="Attachment Preview"
                className="max-w-full h-auto mx-auto"
              />
            </div>
          )}
        </div>

        {/* Items Table using InvoiceTable.js */}
        <InvoiceTable
          items={items}
          setItems={setItems}
          productSuggestions={productSuggestions}
          selectedProductIndexByRow={selectedProductIndexByRow}
          handleSearchChange={handleSearchChange}
          handleProductKeyDown={handleProductKeyDown}
          handleProductSelect={handleProductSelect}
          handleQtyRateChange={handleQtyRateChange}
          clearOnFocus={clearOnFocus}
        />

        {/* Discount + Paid */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <label>Discount %</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => {
                setDiscountPercent(+e.target.value);
                setDiscountAmount(0);
              }}
              onFocus={clearOnFocus}
              className="border p-2 w-full"
            />
          </div>
          <div>
            <label>OR Discount Amount</label>
            <input
              type="number"
              value={discountAmount}
              onChange={(e) => {
                setDiscountAmount(+e.target.value);
                setDiscountPercent(0);
              }}
              onFocus={clearOnFocus}
              className="border p-2 w-full"
            />
          </div>
          <div>
            <label>Paid Amount</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(+e.target.value)}
              onFocus={clearOnFocus}
              className="border p-2 w-full"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="bg-gray-100 p-4 rounded text-right mt-6 space-y-1">
          <p>Total: Rs. {totalAmount.toFixed(2)}</p>
          <p>Discount: Rs. {finalDiscount.toFixed(2)}</p>
          <p className="text-xl font-bold">Net Total: Rs. {grandTotal.toFixed(2)}</p>
          <p>Paid: Rs. {paidAmount.toFixed(2)}</p>
          <p className="text-red-600 font-semibold">
            Remaining: Rs. {(grandTotal - paidAmount).toFixed(2)}
          </p>
        </div>

        {/* Footer Text */}
        <div
          className="mt-4 text-center italic text-sm text-gray-500 cursor-pointer"
          onDoubleClick={(e) => toggleEditable(e, setFooterText)}
        >
          {footerText}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mt-6 no-print">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">
          💾 Save & Close
        </button>
        <button
          type="button"
          onClick={(e) => handleSubmit(e, 'new')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          💾 Save & New
        </button>
        <button
          type="reset"
          onClick={() => window.location.reload()}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Clear
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
    </form>
  );
};

export default InvoiceForm;
