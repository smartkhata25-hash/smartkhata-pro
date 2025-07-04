import React, { useState, useEffect, useRef } from 'react';
import { fetchSuppliers as getSuppliers, fetchSupplierLedger } from '../services/supplierService';
import { getAccounts } from '../services/accountService';
import { createPayBill, updatePayBill, getPayBillById } from '../services/payBillService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import Select from 'react-select';

const PayBillForm = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [supplierLedger, setSupplierLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef();

  const [formData, setFormData] = useState({
    supplier: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().format('HH:mm'),
    amount: '',
    paymentType: 'Cash',
    account: '',
    description: '',
    attachment: null,
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');

  useEffect(() => {
    async function fetchData() {
      const sData = await getSuppliers();
      const aData = await getAccounts();
      setSuppliers(sData);
      setAccounts(aData);

      if (id) {
        const existing = await getPayBillById(id);

        setFormData({
          supplier: existing.supplier?._id || '',
          account: existing.account?._id || '',
          date: existing.date?.slice(0, 10) || '',
          time: existing.time || '',
          amount: existing.amount?.toString() || '',
          paymentType: existing.paymentType || 'Cash',
          description: existing.description || '',
          attachment: null,
        });

        loadLedger(existing.supplier?._id);
      }
    }
    fetchData();
  }, [id]);

  const loadLedger = async (supplierId) => {
    if (supplierId) {
      const res = await fetchSupplierLedger(supplierId);
      setSupplierLedger(res.entries || []);
    } else {
      setSupplierLedger([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = async (e) => {
    const supplierId = e.target.value;
    setFormData((prev) => ({ ...prev, supplier: supplierId }));
    loadLedger(supplierId);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, attachment: file }));
    setShowPreview(false);
  };

  const resetForm = () => {
    setFormData({
      supplier: '',
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm'),
      amount: '',
      paymentType: 'Cash',
      account: '',
      description: '',
      attachment: null,
    });
    setSupplierLedger([]);
    setShowPreview(false);
  };

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (!formData.supplier || !formData.amount || !formData.account) {
      alert('Please fill all required fields.');
      return;
    }

    const journalEntries = [];

    if (parseFloat(formData.amount) > 0 && formData.account) {
      journalEntries.push({
        type: 'debit',
        accountId: formData.account,
        amount: parseFloat(formData.amount),
        narration: `Paid to supplier`,
      });

      journalEntries.push({
        type: 'credit',
        accountId: formData.supplier,
        amount: parseFloat(formData.amount),
        narration: `Payment against supplier account`,
      });
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null) data.append(key, value);
    });

    data.append('createJournal', 'true');
    data.append('journalEntries', JSON.stringify(journalEntries));

    try {
      setLoading(true);
      if (id) {
        await updatePayBill(id, data);
        alert('Payment updated successfully.');
      } else {
        await createPayBill(data);
        alert('Payment saved successfully.');
      }

      if (type === 'close') {
        navigate('/dashboard');
      } else if (type === 'new') {
        resetForm();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const docContent = `
      <div>
        <h2 style="text-align:center;">PayBill Invoice</h2>
        <p><strong>Supplier:</strong> ${
          suppliers.find((s) => s._id === formData.supplier)?.name || '-'
        }</p>
        <p><strong>Date:</strong> ${formData.date} ${formData.time}</p>
        <p><strong>Amount:</strong> ${formData.amount}</p>
        <p><strong>Payment Type:</strong> ${formData.paymentType}</p>
        <p><strong>Description:</strong> ${formData.description || '-'}</p>
      </div>
    `;
    const win = window.open('', '', 'width=800,height=600');
    win.document.write(`<html><head><title>Print</title></head><body>${docContent}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('PayBill Invoice', 70, 15);
    doc.setFontSize(12);
    doc.text(
      `Supplier: ${suppliers.find((s) => s._id === formData.supplier)?.name || '-'}`,
      14,
      30
    );
    doc.text(`Date: ${formData.date} ${formData.time}`, 14, 38);
    doc.text(`Amount: ${formData.amount}`, 14, 46);
    doc.text(`Payment Type: ${formData.paymentType}`, 14, 54);
    doc.text(`Description: ${formData.description || '-'}`, 14, 62);
    doc.save('paybill-invoice.pdf');
  };

  return (
    <form
      onSubmit={(e) => handleSubmit(e, 'close')}
      className="p-6 bg-white shadow-md rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      <h2 className="text-2xl font-bold md:col-span-2">{id ? 'Edit Payment' : 'New Payment'}</h2>

      <div>
        <label>Supplier:</label>
        <Select
          name="supplier"
          options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
          value={
            suppliers.find((s) => s._id === formData.supplier)
              ? {
                  value: formData.supplier,
                  label: suppliers.find((s) => s._id === formData.supplier)?.name,
                }
              : null
          }
          onChange={(selected) =>
            handleSupplierChange({ target: { name: 'supplier', value: selected?.value } })
          }
          placeholder="Select Supplier..."
          isClearable
        />
      </div>

      <div>
        <label>Account:</label>
        <select
          name="account"
          value={formData.account}
          onChange={handleChange}
          className="w-full border rounded p-2"
          required
        >
          <option value="">Select Account</option>
          {accounts.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>Date:</label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label>Time:</label>
        <input
          type="time"
          name="time"
          value={formData.time}
          onChange={handleChange}
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label>Amount:</label>
        <input
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          className="w-full border rounded p-2"
          required
        />
      </div>

      <div>
        <label>Payment Type:</label>
        <select
          name="paymentType"
          value={formData.paymentType}
          onChange={handleChange}
          className="w-full border rounded p-2"
        >
          <option>Cash</option>
          <option>Cheque</option>
          <option>Bank</option>
        </select>
      </div>

      <div className="md:col-span-2">
        <label>Description:</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full border rounded p-2"
          rows="2"
        />
      </div>

      <div className="md:col-span-2">
        <label>Attachment:</label>
        <input type="file" onChange={handleFileChange} className="w-full border rounded p-2" />
      </div>

      {formData.attachment && (
        <div className="md:col-span-2 flex items-center justify-between bg-gray-100 px-3 py-2 rounded">
          <span
            onClick={() => setShowPreview(!showPreview)}
            className="text-blue-700 cursor-pointer underline"
          >
            Preview
          </span>
          <span
            onClick={() => {
              if (window.confirm('Remove attachment?')) {
                setFormData((prev) => ({ ...prev, attachment: null }));
                setShowPreview(false);
              }
            }}
            className="text-red-600 font-bold cursor-pointer"
          >
            ✕
          </span>
        </div>
      )}

      {showPreview && formData.attachment && (
        <div className="md:col-span-2">
          <iframe
            src={URL.createObjectURL(formData.attachment)}
            title="Preview"
            className="w-full h-64 border rounded"
          />
        </div>
      )}

      <div className="md:col-span-2 flex flex-wrap justify-end items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={loading}
          className={`bg-green-600 text-white px-4 py-2 rounded ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Saving...' : id ? 'Update & Close' : 'Save & Close'}
        </button>

        <button
          type="button"
          onClick={(e) => handleSubmit(e, 'new')}
          disabled={loading}
          className={`bg-blue-600 text-white px-4 py-2 rounded ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Saving...' : 'Save & New'}
        </button>

        <button
          type="button"
          onClick={resetForm}
          className="bg-gray-400 text-white px-4 py-2 rounded"
        >
          Clear
        </button>

        {formData.supplier && formData.amount && (
          <>
            <button
              onClick={handlePrint}
              type="button"
              className="bg-gray-700 text-white px-4 py-2 rounded"
            >
              🖨 Print
            </button>
            <button
              onClick={handleExportPDF}
              type="button"
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              ⬇️ PDF
            </button>
          </>
        )}
      </div>

      {supplierLedger.length > 0 && (
        <div className="md:col-span-2 border-t pt-4" ref={printRef}>
          <h3 className="text-lg font-semibold mb-2">Supplier Ledger Preview</h3>
          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-1">Date</th>
                <th className="border p-1">Bill No</th>
                <th className="border p-1">Description</th>
                <th className="border p-1">Debit</th>
                <th className="border p-1">Credit</th>
                <th className="border p-1">Balance</th>
              </tr>
            </thead>
            <tbody>
              {supplierLedger.map((e, i) => (
                <tr key={i}>
                  <td className="border p-1">{new Date(e.date).toLocaleDateString()}</td>
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
    </form>
  );
};

export default PayBillForm;
