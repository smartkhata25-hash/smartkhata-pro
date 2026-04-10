import React, { useState, useEffect, useRef } from 'react';
import { fetchSuppliers as getSuppliers, fetchSupplierLedger } from '../services/supplierService';
import { getAccounts } from '../services/accountService';
import { createPayBill, updatePayBill, getPayBillById } from '../services/payBillService';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'; // ⬅️ updated import
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import Select from 'react-select';
import { t } from '../i18n/i18n';
const PayBillForm = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  // ✅ Sirf payment walay accounts (Cash / Bank / Asset)
  const paymentAccounts = accounts.filter(
    (a) =>
      ['Cash', 'Bank', 'Asset'].includes(a.type) && !a.name?.toLowerCase().startsWith('customer:')
  );

  const [supplierLedger, setSupplierLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef();

  const [formData, setFormData] = useState({
    supplier: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().format('HH:mm'),

    paymentType: 'Cash',

    description: '',
    attachment: null,
  });
  const [paymentEntries, setPaymentEntries] = useState([
    { account: '', amount: '', paymentType: 'Cash' },
  ]);

  const navigate = useNavigate();

  // ✅ Dual support: /pay-bills/edit/:id AND /pay-bill?id=xxx
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get('id');
  const id = paramId || queryId;

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

          date: existing.date?.slice(0, 10) || '',
          time: existing.time || '',

          paymentType: existing.paymentEntries?.[0]?.paymentType || 'cash',
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
            : [{ account: '', amount: '', paymentType: 'Cash' }]
        );

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

  const handleRevert = async () => {
    if (!id) {
      // 🆕 New Bill → Clear form
      resetForm();
      return;
    }

    try {
      const existing = await getPayBillById(id);

      setFormData({
        supplier: existing.supplier?._id || '',
        date: existing.date?.slice(0, 10) || '',
        time: existing.time || '',
        paymentType: existing.paymentEntries?.[0]?.paymentType || 'Cash',
        description: existing.description || '',
        attachment: null,
      });

      setPaymentEntries(
        existing.paymentEntries && existing.paymentEntries.length > 0
          ? existing.paymentEntries.map((p) => ({
              account: p.account || '',
              amount: p.amount || '',
              paymentType: p.paymentType || 'Cash',
            }))
          : [{ account: '', amount: '', paymentType: 'Cash' }]
      );

      loadLedger(existing.supplier?._id);
    } catch (err) {
      console.error('Revert error:', err);
    }
  };

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (!formData.supplier) {
      alert(t('alerts.selectSupplier'));
      return;
    }

    if (!paymentEntries.length) {
      alert(t('alerts.addAtLeastOnePayment'));
      return;
    }

    for (const p of paymentEntries) {
      if (!p.account || !p.amount || Number(p.amount) <= 0) {
        alert(t('alerts.invalidPaymentEntry'));
        return;
      }
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null) data.append(key, value);
    });

    // ✅ IMPORTANT: multiple payments backend ko bhejna
    data.append('paymentEntries', JSON.stringify(paymentEntries));

    try {
      setLoading(true);
      if (id) {
        await updatePayBill(id, data);
        alert(t('alerts.paymentUpdated'));
      } else {
        await createPayBill(data);
        alert(t('alerts.paymentSaved'));
      }

      if (type === 'close') {
        navigate('/dashboard');
      } else if (type === 'new') {
        resetForm();
      }
    } catch (err) {
      alert(t('alerts.error') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    // 🔹 STEP 1: payments table se total amount nikalo
    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // 🔹 STEP 2: print content
    const docContent = `
    <div>
      <h2 style="text-align:center;">${t('payment.invoiceTitle')}</h2>
      <p><strong>${t('supplier.supplier')}:</strong> ${
        suppliers.find((s) => s._id === formData.supplier)?.name || '-'
      }</p>
      <p><strong>${t('common.date')}:</strong> ${formData.date} ${formData.time}</p>
      <p><strong>${t('common.amount')}:</strong> ${totalAmount}</p>
      <p><strong>${t('ledger.paymentType')}:</strong> ${formData.paymentType}</p>
      <p><strong>${t('common.description')}:</strong> ${formData.description || '-'}</p>
    </div>
  `;

    const win = window.open('', '', 'width=800,height=600');
    win.document.write(
      `<html><head><title>${t('print')}</title></head><body>${docContent}</body></html>`
    );
    win.document.close();
    win.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // 🔹 STEP 1: total amount calculate karo
    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // 🔹 STEP 2: PDF content
    doc.setFontSize(16);
    doc.text(t('payment.invoiceTitle'), 70, 15);

    doc.setFontSize(12);
    doc.text(
      `${t('supplier.supplier')}: ${suppliers.find((s) => s._id === formData.supplier)?.name || '-'}`,
      14,
      30
    );

    doc.text(`${t('common.date')}: ${formData.date} ${formData.time}`, 14, 38);
    doc.text(`${t('common.amount')}: ${totalAmount}`, 14, 46);
    doc.text(`${t('ledger.paymentType')}: ${formData.paymentType}`, 14, 54);
    doc.text(`${t('common.description')}: ${formData.description || '-'}`, 14, 62);

    doc.save(t('payment.invoiceFile'));
  };

  return (
    <form
      onSubmit={(e) => handleSubmit(e, 'close')}
      className="bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-xl rounded-xl md:rounded-2xl p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-3 border border-gray-200 content-start"
    >
      <h2 className="text-xl font-bold md:col-span-2 mb-2">
        {id ? t('payment.edit') : t('payment.new')}
      </h2>
      <div>
        <label>{t('supplier.supplier')}:</label>
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
          placeholder={t('supplier.select')}
          isClearable
        />
      </div>
      \{/* DATE */}
      <div>
        <label>{t('common.date')}:</label>
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
        <label>{t('common.time')}:</label>
        <input
          type="time"
          name="time"
          value={formData.time}
          onChange={handleChange}
          className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div>
        <label>{t('common.attachment')}:</label>
        <input
          type="file"
          onChange={handleFileChange}
          className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      {/* DESCRIPTION (same width as Time) */}
      <div>
        <label>{t('common.description')}:</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
          rows="2"
        />
      </div>
      {/* PAYMENTS TABLE STYLE */}
      <div className="md:col-span-2">
        <label className="font-semibold">{t('payment.payments')}:</label>

        {paymentEntries.map((entry, index) => (
          <div key={index} className="grid grid-cols-12 gap-1 md:gap-2 items-center mb-1 md:mb-2">
            {/* ACCOUNT */}
            <select
              className="col-span-5 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
              value={entry.account}
              onChange={(e) =>
                setPaymentEntries((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, account: e.target.value } : item))
                )
              }
              required
            >
              <option value="">{t('account.selectAccount')}</option>
              {paymentAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>

            {/* PAYMENT TYPE */}
            <select
              className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm"
              value={entry.paymentType}
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

            {/* AMOUNT */}
            <input
              type="number"
              placeholder={t('common.amount')}
              className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-right shadow-sm"
              value={entry.amount}
              onChange={(e) =>
                setPaymentEntries((prev) =>
                  prev.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item))
                )
              }
              required
            />

            {/* REMOVE */}
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

        {/* TOTAL */}
        <div className="flex justify-end mt-4">
          <div className="w-full md:w-56 rounded-lg md:rounded-xl p-2 md:p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
            <div className="flex justify-between font-semibold text-sm">
              <span>{t('common.total')}</span>
              <span>
                {paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {formData.attachment && (
        <div className="md:col-span-2 flex items-center justify-between bg-gray-100 px-3 py-2 rounded-xl">
          <span
            onClick={() => setShowPreview(!showPreview)}
            className="text-blue-700 cursor-pointer underline"
          >
            {t('common.preview')}
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
      <div className="md:col-span-2 flex flex-wrap justify-between md:justify-end items-center gap-2 md:gap-3 mt-3 md:mt-4">
        <button
          type="submit"
          disabled={loading}
          className={`bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-1.5 rounded-xl shadow ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? t('saving') : id ? t('common.updateClose') : t('common.saveClose')}
        </button>

        <button
          type="button"
          onClick={(e) => handleSubmit(e, 'new')}
          disabled={loading}
          className={`bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-1.5 rounded-xl shadow ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? t('saving') : t('common.saveNew')}
        </button>

        <button
          type="button"
          onClick={handleRevert}
          className="bg-gradient-to-r from-gray-400 to-gray-500 text-white px-3 py-1.5 rounded-xl shadow"
        >
          {id ? t('common.revert') : t('common.clear')}
        </button>

        {formData.supplier && paymentEntries.length > 0 && (
          <>
            <button
              onClick={handlePrint}
              type="button"
              className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-3 py-1.5 rounded-xl shadow"
            >
              🖨 {t('common.print')}
            </button>
            <button
              onClick={handleExportPDF}
              type="button"
              className="bg-gradient-to-r from-red-500 to-red-700 text-white px-3 py-1.5 rounded-xl shadow"
            >
              ⬇️ {t('pdf')}
            </button>
          </>
        )}
      </div>
      {supplierLedger.length > 0 && (
        <div className="md:col-span-2 border-t pt-4" ref={printRef}>
          <h3 className="text-lg font-semibold mb-2">{t('supplier.ledgerPreview')}</h3>
          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-1">{t('common.date')}</th>
                <th className="border p-1">{t('common.billNo')}</th>
                <th className="border p-1">{t('common.description')}</th>
                <th className="border p-1">{t('common.debit')}</th>
                <th className="border p-1">{t('common.credit')}</th>
                <th className="border p-1">{t('common.balance')}</th>
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
