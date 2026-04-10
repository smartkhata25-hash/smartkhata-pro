import React, { useState, useEffect, useRef } from 'react';

import { getAccounts } from '../services/accountService';
import { createExpense, updateExpense, getExpenseById } from '../services/expenseService';
import { getExpenseTitles, createExpenseTitle } from '../services/expenseTitleService';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import { t } from '../i18n/i18n';

const ExpenseForm = () => {
  const [accounts, setAccounts] = useState([]);
  const [titles, setTitles] = useState([]);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  const [showModal, setShowModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: '', category: '' });
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    titleId: null,
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
  const creditableAccounts = accounts.filter(
    (a) =>
      ['Cash', 'Bank', 'Payable', 'Asset'].includes(a.type) &&
      !a.name?.toLowerCase().startsWith('customer:')
  );

  useEffect(() => {
    async function fetchData() {
      const aData = await getAccounts();
      setAccounts(aData);

      if (id) {
        const existing = await getExpenseById(id);

        // 🛠 Extract IDs from populated objects
        const fixedCategoryId = existing.category?._id || existing.category || '';
        const fixedCreditEntries =
          existing.creditEntries?.map((entry) => ({
            account: entry.account?._id || entry.account || '',
            amount: entry.amount || '',
            paymentType: entry.paymentType || 'Cash',
          })) || [];

        setFormData({
          title: existing.title || '',
          titleId: existing.titleId || null,
          date: existing.date || '',
          time: existing.time || '',
          description: existing.description || '',
          attachment: null,
          paymentType: existing.paymentType || 'Cash',
          category: fixedCategoryId,
        });

        setCreditEntries(fixedCreditEntries);
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
  const fetchAccounts = async () => {
    const data = await getAccounts();
    setAccounts(data);
  };

  const fetchTitles = async (query = '') => {
    try {
      const data = await getExpenseTitles(query);

      setTitles(data || []);
    } catch (err) {
      console.error('Title fetch error', err);
    }
  };
  const resetForm = () => {
    setFormData({
      title: '',
      titleId: null,
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm'),
      paymentType: 'Cash',
      category: '',
      description: '',
      attachment: null,
    });
    setCreditEntries([{ account: '', amount: '', paymentType: 'Cash' }]);
    setShowPreview(false);
  };

  useEffect(() => {
    fetchAccounts();
    fetchTitles();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setTitles([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (!formData.title && !formData.titleId) {
      alert(t('alerts.fillRequiredFields'));
      return;
    }

    const creditTotal = calculateCreditTotal();
    if (creditTotal <= 0 || !formData.category) {
      alert(t('alerts.invalidCreditEntries'));
      return;
    }

    const journalEntries = [];

    // ✅ Debit: category (Expense Head)
    journalEntries.push({
      type: 'debit',
      accountId: formData.category,
      amount: creditTotal,
      narration: `Expense: ${formData.description || t('common.noDescription')}`,
    });

    // ✅ Credit: All selected accounts
    creditEntries.forEach((entry) => {
      if (entry.account && entry.amount) {
        journalEntries.push({
          type: 'credit',
          accountId: entry.account,
          amount: parseFloat(entry.amount),
          narration: `Paid via ${entry.paymentType || t('common.unknown')}`,
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

    for (let [key, value] of data.entries()) {
      console.log(`${key}:`, value);
    }
    try {
      setLoading(true);
      if (id) {
        await updateExpense(id, data);
        alert(t('expense.updated'));
      } else {
        await createExpense(data);
        alert(t('expense.saved'));
      }

      if (type === 'close') {
        navigate('/dashboard');
      } else if (type === 'new') {
        resetForm();
      }
    } catch (err) {
      alert(t('alerts.error') + err.message);
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
      <html><head><title>${t('print')}</title></head><body>
      <h2 style="text-align:center;">${t('expense.invoiceTitle')}</h2>
      <p><strong>${t('title')}:</strong> ${formData.title}</p>
      <p><strong>${t('date')}:</strong> ${formData.date} ${formData.time}</p>
      <p><strong>${t('amount')}:</strong> ${creditTotal.toFixed(2)}</p> 
      <p><strong>${t('paymentType')}:</strong> ${formData.paymentType}</p>
      <p><strong>${t('description')}:</strong> ${formData.description || '-'}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(t('expense.invoiceTitle'), 70, 15);

    doc.setFontSize(12);
    doc.text(`${t('title')}: ${formData.title}`, 14, 30);
    doc.text(`${t('date')}: ${formData.date} ${formData.time}`, 14, 38);
    doc.text(`${t('amount')}: ${calculateCreditTotal().toFixed(2)}`, 14, 46);
    doc.text(`${t('paymentType')}: ${formData.paymentType}`, 14, 54);
    doc.text(`${t('description')}: ${formData.description || '-'}`, 14, 62);

    doc.save('expense-invoice.pdf');
  };

  return (
    <>
      <form
        onSubmit={(e) => handleSubmit(e, 'close')}
        className="bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-xl rounded-xl md:rounded-2xl p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-3 border border-gray-200 content-start"
      >
        <h2 className="text-xl font-bold md:col-span-2 mb-2">
          {id ? t('expense.edit') : t('expense.new')}
        </h2>

        <div className="relative" ref={dropdownRef}>
          <label className="font-semibold text-gray-700">{t('title')}:</label>

          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              fetchTitles(e.target.value);
            }}
            placeholder={t('expense.searchPlaceholder')}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />

          {titles.length > 0 && (
            <div className="absolute z-10 bg-white w-full border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto mt-1">
              {titles.map((item) => (
                <div
                  key={item._id}
                  onClick={() => {
                    setSearch(item.name);

                    setFormData((prev) => ({
                      ...prev,
                      title: item.name,
                      titleId: item._id,
                      category: item.categoryId?._id || '',
                    }));
                    setTitles([]);
                  }}
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b"
                >
                  {item.name}
                </div>
              ))}
              <div
                onClick={() => setShowModal(true)}
                className="p-3 text-blue-600 font-semibold cursor-pointer hover:bg-gray-100"
              >
                + {t('expense.addNewTitle')} "{search}"
              </div>
            </div>
          )}
        </div>

        <div>
          <label>{t('date')}:</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label>{t('time')}:</label>
          <input
            type="time"
            name="time"
            value={formData.time}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label>{t('description')}:</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
            rows="2"
          />
        </div>

        <div className="md:col-span-2">
          <label>{t('attachment')}:</label>
          <input
            type="file"
            onChange={handleFileChange}
            className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {formData.attachment && (
          <div className="md:col-span-2 flex items-center justify-between bg-gray-100 px-3 py-2 rounded">
            <span
              onClick={() => setShowPreview(!showPreview)}
              className="text-blue-700 cursor-pointer underline"
            >
              {t('preview')}
            </span>
            <span
              onClick={() => {
                if (window.confirm(t('alerts.removeAttachment'))) {
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
          <label>{t('expense.creditAccounts')}:</label>
          {creditEntries.map((entry, index) => (
            <div key={index} className="grid grid-cols-12 gap-1 md:gap-2 items-center mb-1 md:mb-2">
              <select
                name="account"
                value={entry.account}
                onChange={(e) =>
                  setCreditEntries((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, account: e.target.value } : item
                    )
                  )
                }
                className="col-span-5 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">{t('expense.selectAccount')}</option>
                {creditableAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder={t('amount')}
                value={entry.amount}
                onChange={(e) =>
                  setCreditEntries((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, amount: e.target.value } : item
                    )
                  )
                }
                className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-right shadow-sm"
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
                className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm"
              >
                <option value="Cash">{t('payment.cash')}</option>
                <option value="Cheque">{t('payment.cheque')}</option>
                <option value="Online">{t('payment.online')}</option>
              </select>

              {creditEntries.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCreditEntries((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-1 text-red-500 text-sm md:text-lg"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setCreditEntries((prev) => [
                ...prev,
                { account: '', amount: '', paymentType: 'Cash' },
              ])
            }
            className="text-blue-600 text-sm mt-1 font-medium hover:text-blue-800"
          >
            + {t('expense.addCreditEntry')}
          </button>

          <div className="flex justify-end mt-4">
            <div className="w-full md:w-56 rounded-lg md:rounded-xl p-2 md:p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
              <div className="flex justify-between font-semibold text-sm">
                <span>{t('total')}</span>
                <span>{calculateCreditTotal().toFixed(2)}</span>
              </div>
            </div>
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
            {loading ? t('saving') : id ? t('expense.updateClose') : t('expense.saveClose')}
          </button>

          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'new')}
            disabled={loading}
            className={`bg-blue-600 text-white px-4 py-2 rounded ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? t('saving') : t('expense.saveNew')}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="bg-gray-400 text-white px-4 py-2 rounded"
          >
            {t('clear')}
          </button>

          {formData.title && formData.category && (
            <>
              <button
                onClick={handlePrint}
                type="button"
                className="bg-gray-700 text-white px-4 py-2 rounded"
              >
                🖨 {t('print')}
              </button>

              <button
                onClick={handleExportPDF}
                type="button"
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                ⬇️ {t('pdf')}
              </button>
            </>
          )}
        </div>
      </form>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{t('expense.addNewTitle')}</h3>

            <input
              placeholder={t('common.enterTitle')}
              value={newAccount.name}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-lg p-2 mb-3"
            />

            <select
              value={newAccount.category}
              onChange={(e) => setNewAccount({ ...newAccount, category: e.target.value })}
              className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-lg p-2 mb-4"
            >
              <option value="">{t('expense.selectCategory')}</option>
              {expenseAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-300 rounded-lg"
              >
                {t('cancel')}
              </button>

              <button
                onClick={async () => {
                  const res = await createExpenseTitle({
                    name: newAccount.name,
                    categoryId: newAccount.category,
                  });

                  setShowModal(false);
                  setSearch(res.name);

                  setFormData((prev) => ({
                    ...prev,
                    title: res.name,
                    titleId: res._id,
                    category: res.categoryId,
                  }));

                  fetchTitles();
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExpenseForm;
