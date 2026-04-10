// src/components/ReceivePaymentForm.js

import React, { useState, useEffect, useRef } from 'react';
import {
  createReceivePayment,
  updateReceivePayment,
  getReceivePaymentById,
} from '../services/receivePaymentService';
import { getAccounts } from '../services/accountService';
import { fetchCustomers, fetchCustomerLedger } from '../services/customerService';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n';

const ReceivePaymentForm = () => {
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerLedger, setCustomerLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef();

  const [formData, setFormData] = useState({
    customer: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().format('HH:mm'),
    amount: '',
    paymentType: 'Cash',
    account: '',
    description: '',
    attachment: null,
  });
  const [printSize, setPrintSize] = useState(localStorage.getItem('receivePrintSize') || 'narrow');
  const [paymentEntries, setPaymentEntries] = useState([
    { account: '', amount: '', paymentType: 'Cash' },
  ]);

  const navigate = useNavigate();
  const { id } = useParams();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const cData = await fetchCustomers();

        const aData = await getAccounts();

        // ✅ Sirf Receive Payment ke liye valid accounts
        const paymentAccounts = aData.filter(
          (acc) =>
            ['Cash', 'Bank', 'Asset'].includes(acc.type) &&
            !acc.name?.toLowerCase().startsWith('customer:')
        );

        setCustomers(cData);
        setAccounts(paymentAccounts);

        // ✅🔥 Default HANDCASH select
        const handCashAccount = paymentAccounts.find(
          (acc) => acc.name?.toLowerCase() === 'handcash'
        );

        if (handCashAccount) {
          setPaymentEntries([
            {
              account: handCashAccount._id,
              amount: '',
              paymentType: 'Cash',
            },
          ]);
        }

        if (id) {
          const existing = await getReceivePaymentById(id);

          setFormData({
            customer: existing.customer,
            date: existing.date,
            time: existing.time,
            paymentType: existing.paymentType || 'Cash',
            description: existing.description || '',
            attachment: null,
          });

          // ✅ IMPORTANT: customer name set for search input
          setCustomerName(cData.find((c) => c._id === existing.customer)?.name || '');

          setPaymentEntries(
            existing.paymentEntries && existing.paymentEntries.length > 0
              ? existing.paymentEntries.map((p) => ({
                  account: p.account || '',
                  amount: p.amount || '',
                  paymentType: p.paymentType || existing.paymentType || 'Cash',
                }))
              : [{ account: '', amount: '', paymentType: existing.paymentType || 'Cash' }]
          );

          loadLedger(existing.customer);
        }
      } catch (err) {
        console.error('❌ Error fetching accounts/customers:', err.message);
      }
    }

    fetchData();
  }, [id]);

  const loadLedger = async (customerId) => {
    if (customerId) {
      const res = await fetchCustomerLedger(customerId);
      setCustomerLedger(res.ledger || []);
    } else {
      setCustomerLedger([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'paymentType' ? value.toLowerCase() : value,
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, attachment: file }));
    setShowPreview(false);
  };

  const resetForm = () => {
    setFormData({
      customer: '',
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm'),
      amount: '',
      paymentType: 'Cash',
      account: '',
      description: '',
      attachment: null,
    });

    setCustomerName('');

    const handCash = accounts.find((acc) => acc.name?.toLowerCase() === 'handcash');

    setPaymentEntries([
      {
        account: handCash?._id || '',
        amount: '',
        paymentType: 'Cash',
      },
    ]);

    setCustomerLedger([]);

    setShowPreview(false);
  };

  const handleRevert = async () => {
    if (!id) {
      resetForm();
      return;
    }

    try {
      const existing = await getReceivePaymentById(id);

      setFormData({
        customer: existing.customer,
        date: existing.date,
        time: existing.time,
        paymentType: existing.paymentType || 'Cash',
        description: existing.description || '',
        attachment: null,
      });

      setPaymentEntries(
        existing.paymentEntries && existing.paymentEntries.length > 0
          ? existing.paymentEntries.map((p) => ({
              account: p.account || '',
              amount: p.amount || '',
              paymentType: p.paymentType || existing.paymentType || 'Cash',
            }))
          : [{ account: '', amount: '', paymentType: existing.paymentType || 'Cash' }]
      );

      loadLedger(existing.customer);
    } catch (err) {
      console.error('Revert error:', err);
    }
  };
  const handlePrint = () => {
    if (id) {
      window.open(
        `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/${id}/html?size=${printSize}`,
        '_blank'
      );
      return;
    }

    const previewData = {
      ...formData,

      customer: formData.customer,

      customerName: customers.find((c) => c._id === formData.customer)?.name || '',

      customerPhone: customers.find((c) => c._id === formData.customer)?.phone || '',

      paymentEntries: paymentEntries.map((p) => ({
        ...p,
        accountName: accounts.find((a) => a._id === p.account)?.name || '',
      })),
    };
    const encoded = encodeURIComponent(JSON.stringify(previewData));

    window.open(
      `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/preview/html?size=${printSize}&data=${encoded}`,
      '_blank'
    );
  };

  const handleExportPDF = () => {
    if (id) {
      window.location.href = `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/${id}/pdf?size=${printSize}`;
      return;
    }

    const previewData = {
      ...formData,

      customerName: customers.find((c) => c._id === formData.customer)?.name || '',

      customerPhone: customers.find((c) => c._id === formData.customer)?.phone || '',

      paymentEntries: paymentEntries.map((p) => ({
        ...p,
        accountName: accounts.find((a) => a._id === p.account)?.name || '',
      })),
    };

    const encoded = encodeURIComponent(JSON.stringify(previewData));

    window.location.href = `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/preview/pdf?size=${printSize}&data=${encoded}`;
  };

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (!formData.customer || paymentEntries.length === 0) {
      alert(t('alerts.addAtLeastOnePayment'));
      return;
    }

    const totalDebit = customerLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = customerLedger.reduce((sum, e) => sum + (e.credit || 0), 0);
    const currentBalance = totalDebit - totalCredit;

    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    if (currentBalance <= 0 && totalAmount > 0) {
      const ok = window.confirm(
        '⚠️ This customer has no pending balance. This payment will be recorded as advance. Do you want to continue?'
      );
      if (!ok) return;
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null) data.append(key, value);
    });
    data.append('paymentEntries', JSON.stringify(paymentEntries));

    try {
      setLoading(true);
      if (id) {
        await updateReceivePayment(id, data);
        alert(t('alerts.paymentUpdated'));
      } else {
        await createReceivePayment(data);
      }

      if (type === 'close') {
        navigate('/dashboard');
      } else if (type === 'new') {
        resetForm();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };
  const totalDebit = customerLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = customerLedger.reduce((sum, e) => sum + (e.credit || 0), 0);

  const closingBalance =
    customerLedger.length > 0 ? customerLedger[customerLedger.length - 1].runningBalance || 0 : 0;

  return (
    <div className="p-3 md:p-6 bg-gray-50 h-full overflow-auto md:overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT SIDE - FORM */}
        <form
          onSubmit={(e) => handleSubmit(e, 'close')}
          className="lg:col-span-2 bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-xl rounded-xl md:rounded-2xl p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-3 border border-gray-200 content-start"
        >
          <h2 className="text-xl font-bold md:col-span-2 mb-2">
            {id ? t('payment.edit') : t('payment.new')}
          </h2>

          {/* CUSTOMER (SEARCH + SUGGESTIONS) */}
          <div style={{ position: 'relative' }}>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('customer')}
            </label>

            <input
              placeholder={t('customer.search')}
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
            />

            {showSuggestions && customerName && (
              <div
                style={{
                  position: 'absolute',
                  top: 38,
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  maxHeight: 180,
                  overflowY: 'auto',
                  zIndex: 50,
                }}
              >
                {customers
                  .filter((c) => c.name.toLowerCase().includes(customerName.toLowerCase()))
                  .slice(0, 10)
                  .map((c) => (
                    <div
                      key={c._id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setFormData((prev) => ({ ...prev, customer: c._id }));
                        setShowSuggestions(false);
                        loadLedger(c._id);
                      }}
                      style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      {c.name}
                    </div>
                  ))}
              </div>
            )}
          </div>
          {/* DATE + TIME (MOBILE SAME ROW) */}
          <div className="grid grid-cols-2 gap-2 md:contents">
            {/* DATE */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">{t('date')}</label>
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
              <label className="text-xs font-semibold text-gray-600 mb-1 block">{t('time')}</label>
              <input
                type="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          {/* ATTACHMENT */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('attachment')}
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm"
            />
          </div>

          {/* DESCRIPTION */}
          {formData.attachment && (
            <div className="md:col-span-2 flex items-center justify-between bg-gray-100 px-3 py-2 rounded-xl">
              <span
                onClick={() => setShowPreview(!showPreview)}
                className="text-blue-600 cursor-pointer text-sm"
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
                className="text-red-500 cursor-pointer"
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
                className="w-full h-64 border rounded-xl"
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              {t('description')}
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
              rows="2"
            />
          </div>

          {/* PAYMENTS */}
          <div className="md:col-span-2">
            <label className="text-sm font-semibold mb-2 block">{t('payment.payments')}</label>

            {paymentEntries.map((entry, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-1 md:gap-2 items-center mb-1 md:mb-2"
              >
                <select
                  className="col-span-5 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500"
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
                  <option value="">{t('expense.selectAccount')}</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>

                <select
                  className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm"
                  value={entry.paymentType || formData.paymentType}
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

                <input
                  type="number"
                  placeholder={t('amount')}
                  className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-right shadow-sm"
                  value={entry.amount}
                  onChange={(e) =>
                    setPaymentEntries((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, amount: e.target.value } : item
                      )
                    )
                  }
                  required
                />

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

            <div className="flex justify-end mt-4">
              <div className="w-full md:w-56 rounded-lg md:rounded-xl p-2 md:p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
                <div className="flex justify-between font-semibold text-sm">
                  <span>{t('total')}</span>
                  <span>
                    {paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="md:col-span-2 flex flex-wrap justify-between md:justify-end items-center gap-2 md:gap-3 mt-3 md:mt-4">
            <button
              type="submit"
              disabled={loading}
              className={`bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-1.5 rounded-xl shadow ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {id ? t('updateClose') : t('saveClose')}
            </button>

            <button
              type="button"
              onClick={(e) => handleSubmit(e, 'new')}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-1.5 rounded-xl shadow"
            >
              {t('saveNew')}
            </button>

            <button
              type="button"
              onClick={handleRevert}
              className="bg-gradient-to-r from-gray-400 to-gray-500 text-white px-3 py-1.5 rounded-xl shadow"
            >
              {id ? t('common.revert') : t('clear')}
            </button>

            <select
              value={printSize}
              onChange={(e) => {
                setPrintSize(e.target.value);
                localStorage.setItem('receivePrintSize', e.target.value);
              }}
              className="border border-gray-200 rounded-xl px-2 py-1 text-sm"
            >
              <option value="standard">A4</option>
              <option value="narrow">A5</option>
              <option value="thermal">Thermal</option>
            </select>

            <button
              type="button"
              onClick={handlePrint}
              className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-3 py-1.5 rounded-xl shadow"
            >
              🖨
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="bg-gradient-to-r from-red-500 to-red-700 text-white px-3 py-1.5 rounded-xl shadow"
            >
              PDF
            </button>
          </div>
        </form>

        {/* RIGHT SIDE - LEDGER */}
        {!isMobile && (
          <div
            ref={printRef}
            className="lg:col-span-2 bg-white shadow-xl rounded-2xl p-4 h-[calc(100vh-120px)] overflow-y-auto"
          >
            <h3 className="text-lg font-semibold mb-3">{t('customer.ledgerPreview')}</h3>

            <table className="w-full text-xs border rounded-xl overflow-hidden">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="p-2 border">{t('date')}</th>
                  <th className="p-2 border">{t('billNo')}</th>
                  <th className="p-2 border">{t('description')}</th>
                  <th className="p-2 border">{t('debit')}</th>
                  <th className="p-2 border">{t('credit')}</th>
                  <th className="p-2 border">{t('balance')}</th>
                </tr>
              </thead>

              <tbody>
                {customerLedger.map((e, i) => (
                  <tr key={i} className="hover:bg-blue-50 even:bg-gray-50 transition">
                    <td className="p-2 border">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="p-2 border">{e.billNo || '-'}</td>
                    <td className="p-2 border">{e.description || '-'}</td>
                    <td className="p-2 border text-right font-medium text-green-700">
                      {e.debit?.toFixed(2) || '0.00'}
                    </td>
                    <td className="p-2 border text-right font-medium text-red-600">
                      {e.credit?.toFixed(2) || '0.00'}
                    </td>
                    <td className="p-2 border text-right font-bold text-blue-700">
                      {e.runningBalance?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 font-semibold">
                  <td className="p-2 border" colSpan="3">
                    Total
                  </td>

                  <td className="p-2 border text-right text-green-700">{totalDebit.toFixed(2)}</td>

                  <td className="p-2 border text-right text-red-600">{totalCredit.toFixed(2)}</td>

                  <td className="p-2 border text-right text-blue-700 font-bold">
                    {closingBalance.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceivePaymentForm;
