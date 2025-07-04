import React, { useState, useEffect } from 'react';
import { getAccounts } from '../services/accountService';
import { createExpense, updateExpense, getExpenseById } from '../services/expenseService';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';

const ExpenseForm = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().format('HH:mm'),
    paymentType: 'Cash',
    category: '',
    description: '',
    attachment: null,
  });

  const [creditEntries, setCreditEntries] = useState([
    { account: '', amount: '', paymentType: 'Cash' },
  ]);

  const navigate = useNavigate();
  const { id } = useParams();

  const expenseAccounts = accounts.filter((a) => a.type === 'Expense');
  const creditableAccounts = accounts.filter((a) =>
    ['Cash', 'Bank', 'Payable', 'Asset'].includes(a.type)
  );
  useEffect(() => {
    async function fetchData() {
      const aData = await getAccounts();
      setAccounts(aData);

      if (id) {
        const existing = await getExpenseById(id);
        setFormData({
          ...existing,
          attachment: null,
          category: existing.category || '',
        });

        // TODO: If journal lines are needed to prefill creditEntries, map them here.
      }
    }
    fetchData();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, attachment: file }));
    setShowPreview(false);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm'),
      paymentType: 'Cash',
      category: '',
      description: '',
      attachment: null,
    });
    setCreditEntries([{ account: '', amount: '' }]);
    setShowPreview(false);
  };

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (!formData.title || !formData.category) {
      alert('Please fill all required fields.');
      return;
    }

    const creditTotal = calculateCreditTotal();
    if (creditTotal <= 0 || !formData.category) {
      alert('Please enter valid credit entries and select a category.');
      return;
    }

    const journalEntries = [];

    // ✅ Debit: category (Expense Head)
    journalEntries.push({
      type: 'debit',
      accountId: formData.category,
      amount: creditTotal,
      narration: `Expense: ${formData.description || 'No Description'}`,
    });

    // ✅ Credit: All selected accounts
    creditEntries.forEach((entry) => {
      if (entry.account && entry.amount) {
        journalEntries.push({
          type: 'credit',
          accountId: entry.account,
          amount: parseFloat(entry.amount),
          narration: `Paid via ${entry.paymentType || 'Unknown'}`,
        });
      }
    });
    formData.amount = calculateCreditTotal().toFixed(2);
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null) data.append(key, value);
    });

    data.append('createJournal', 'true');
    data.append('creditEntries', JSON.stringify(creditEntries));

    console.log('▶️ Sending FormData:');
    for (let [key, value] of data.entries()) {
      console.log(`${key}:`, value);
    }
    try {
      setLoading(true);
      if (id) {
        await updateExpense(id, data);
        alert('Expense updated successfully.');
      } else {
        await createExpense(data);
        alert('Expense saved successfully.');
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

  const calculateCreditTotal = () => {
    return creditEntries.reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0);
  };

  const handlePrint = () => {
    const creditTotal = calculateCreditTotal();
    const win = window.open('', '', 'width=800,height=600');
    win.document.write(`
      <html><head><title>Print</title></head><body>
      <h2 style="text-align:center;">Expense Invoice</h2>
      <p><strong>Title:</strong> ${formData.title}</p>
      <p><strong>Date:</strong> ${formData.date} ${formData.time}</p>
      <p><strong>Amount:</strong> ${creditTotal.toFixed(2)}</p> 
      <p><strong>Payment Type:</strong> ${formData.paymentType}</p>
      <p><strong>Description:</strong> ${formData.description || '-'}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Expense Invoice', 70, 15);

    doc.setFontSize(12);
    doc.text(`Title: ${formData.title}`, 14, 30);
    doc.text(`Date: ${formData.date} ${formData.time}`, 14, 38);
    doc.text(`Amount: ${calculateCreditTotal().toFixed(2)}`, 14, 46);
    doc.text(`Payment Type: ${formData.paymentType}`, 14, 54);
    doc.text(`Description: ${formData.description || '-'}`, 14, 62);

    doc.save('expense-invoice.pdf');
  };

  return (
    <form
      onSubmit={(e) => handleSubmit(e, 'close')}
      className="p-6 bg-white shadow-md rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      <h2 className="text-2xl font-bold md:col-span-2">{id ? 'Edit Expense' : 'New Expense'}</h2>

      <div>
        <label>Title:</label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          className="w-full border rounded p-2"
          required
        />
      </div>

      <div>
        <label>Category (Expense Head):</label>
        <select
          name="category"
          value={formData.category}
          onChange={handleChange}
          className="w-full border rounded p-2"
          required
        >
          <option value="">Select Category</option>
          {expenseAccounts.map((a) => (
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
              if (window.confirm('Are you sure you want to remove the attachment?')) {
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

      <div className="md:col-span-2">
        <label>Credit Accounts:</label>
        {creditEntries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 mb-2 flex-wrap">
            <select
              name="account"
              value={entry.account}
              onChange={(e) =>
                setCreditEntries((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, account: e.target.value } : item))
                )
              }
              className="flex-1 border rounded p-2"
              required
            >
              <option value="">Select Account</option>
              {creditableAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Amount"
              value={entry.amount}
              onChange={(e) =>
                setCreditEntries((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item))
                )
              }
              className="w-32 border rounded p-2"
              required
            />

            <select
              value={entry.paymentType}
              onChange={(e) =>
                setCreditEntries((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, paymentType: e.target.value } : item
                  )
                )
              }
              className="w-32 border rounded p-2"
            >
              <option>Cash</option>
              <option>Cheque</option>
              <option>Bank</option>
            </select>

            {creditEntries.length > 1 && (
              <button
                type="button"
                onClick={() => setCreditEntries((prev) => prev.filter((_, i) => i !== index))}
                className="text-red-600 font-bold text-lg"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setCreditEntries((prev) => [...prev, { account: '', amount: '', paymentType: 'Cash' }])
          }
          className="mt-2 text-blue-600 underline"
        >
          + Add another credit entry
        </button>

        <div className="mt-2">
          <label>Total Credit:</label>
          <input
            type="text"
            value={`Total: ${calculateCreditTotal().toFixed(2)} (auto-calculated)`}
            readOnly
            className="w-full border rounded p-2 bg-gray-100 font-bold"
          />
        </div>
      </div>

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

        {formData.title && formData.category && (
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
    </form>
  );
};

export default ExpenseForm;
