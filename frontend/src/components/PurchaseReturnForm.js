import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createPurchaseReturn,
  updatePurchaseReturn,
  getPurchaseReturnById,
} from '../services/purchaseReturnService';
import { fetchSuppliers } from '../services/supplierService';
import { fetchProductsWithToken as getProducts } from '../services/inventoryService';
import { getAccounts } from '../services/accountService';
import { useNavigate, useParams } from 'react-router-dom';
import ProductDropdown from './ProductDropdown';
import PurchaseInvoiceSearchModal from './PurchaseInvoiceSearchModal';
import { t } from '../i18n/i18n';

const PurchaseReturnForm = ({ token }) => {
  const getCurrentTime = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  };

  const { id } = useParams();
  const navigate = useNavigate();
  const scrollRef = useRef();

  const [productList, setProductList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);

  const [items, setItems] = useState([]);
  const [billNo, setBillNo] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnTime, setReturnTime] = useState(getCurrentTime());
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [returnMethod, setReturnMethod] = useState('adjust');
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const [paymentType, setPaymentType] = useState('cash');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');

  const blankRow = () => ({
    productId: '',
    name: '',
    quantity: '',
    price: '',
    total: '',
  });

  useEffect(() => {
    setItems(Array.from({ length: 20 }, () => blankRow()));
  }, []);

  // 🔁 Populate (Edit Mode)
  const populateForm = useCallback(
    (data) => {
      setBillNo(data.billNo || '');
      setSupplierName(data.supplierName || '');
      setSupplierPhone(data.supplierPhone || '');
      setSupplierId(data.supplier?._id || data.supplier || '');
      setReturnDate(data.returnDate?.slice(0, 10) || '');
      setReturnTime(data.returnTime || '');
      setNotes(data.notes || '');
      setReturnMethod(data.paymentType ? 'cash' : 'adjust');
      setPaymentType(data.paymentType || 'cash');
      setAccountId(data.accountId || '');

      const mappedItems = (data.items || []).map((i) => {
        const matchedProduct = productList.find((p) => p._id === (i.productId?._id || i.productId));

        return {
          productId: i.productId,
          name: matchedProduct?.name || '',
          quantity: i.quantity,
          price: i.price,
          total: (i.quantity * i.price).toFixed(2),
        };
      });

      const emptyRows = Array.from({ length: 10 }, () => blankRow());

      setItems([...mappedItems, ...emptyRows]);
    },
    [productList]
  );

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const data = await getPurchaseReturnById(id, token);
      populateForm(data);
    };
    load();
  }, [id, token, populateForm]);

  useEffect(() => {
    getProducts(token).then(setProductList);
    fetchSuppliers().then(setSuppliers);

    getAccounts(token).then((all) => {
      const filtered = all.filter((acc) =>
        ['cash', 'bank', 'asset'].includes(acc.type?.toLowerCase())
      );

      setAccounts(filtered); // 👈 یہ add کریں

      // 🟢 Default Cash Account Auto Select
      if (returnMethod === 'cash') {
        const cashAcc = filtered.find((a) => a.name?.toLowerCase().includes('cash'));
        if (cashAcc) setAccountId(cashAcc._id);
      }
    });
  }, [token, returnMethod]);

  // 🔁 Auto select cash account when method changes
  useEffect(() => {
    if (returnMethod === 'cash' && accounts.length > 0) {
      const cashAcc = accounts.find((a) => a.name?.toLowerCase().includes('cash'));
      if (cashAcc) setAccountId(cashAcc._id);
    }

    if (returnMethod === 'adjust') {
      setAccountId('');
    }
  }, [returnMethod, accounts]);

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    if (field === 'quantity' || field === 'price') {
      const q = parseFloat(updated[index].quantity) || 0;
      const p = parseFloat(updated[index].price) || 0;
      updated[index].total = (q * p).toFixed(2);
    }

    setItems(updated);

    if (index === items.length - 1 && field === 'name' && value.trim() !== '') {
      setItems([...items, blankRow()]);
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  };

  const totalAmount = items.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);

  const handleRevert = async () => {
    if (!id) {
      // 🆕 New return → clear form
      setBillNo('');
      setSupplierName('');
      setSupplierPhone('');
      setSupplierId('');
      setNotes('');
      setReturnMethod('adjust');
      setAccountId('');
      setPaymentType('cash');
      setItems(Array.from({ length: 20 }, () => blankRow()));
      return;
    }

    // 🔁 Edit mode → original return دوبارہ load
    const data = await getPurchaseReturnById(id, token);
    populateForm(data);
  };

  const handleSubmit = async (action) => {
    const filteredItems = items.filter((i) => i.productId && i.quantity > 0);

    if (!returnDate) return alert(t('alerts.fillRequiredFields'));
    if (!supplierName.trim()) return alert(t('alerts.selectSupplier'));
    if (filteredItems.length === 0) return alert(t('alerts.addProduct'));
    if (returnMethod === 'cash' && !accountId) return alert(t('alerts.selectAccount'));

    const supplier = suppliers.find((s) => s._id === supplierId);
    if (!supplier) return alert(t('alerts.supplierAddFailed'));

    const formData = new FormData();
    formData.append('billNo', billNo || `PR-${Math.floor(Math.random() * 10000)}`);
    formData.append('supplierId', supplier._id);
    formData.append('supplierPhone', supplierPhone);
    formData.append('returnDate', returnDate);
    formData.append('returnTime', returnTime);
    formData.append('notes', notes);
    formData.append('totalAmount', totalAmount);
    formData.append('paidAmount', returnMethod === 'cash' ? totalAmount : 0);
    formData.append('paymentType', returnMethod === 'cash' ? paymentType : '');
    formData.append('accountId', returnMethod === 'cash' ? accountId : '');
    if (originalInvoiceId) {
      formData.append('originalInvoiceId', originalInvoiceId);
    }
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
      await updatePurchaseReturn(id, formData, token);
      alert(t('alerts.invoiceUpdated'));
    } else {
      await createPurchaseReturn(formData, token);
      alert(t('alerts.invoiceSaved'));
    }

    if (action === 'close') navigate('/dashboard');

    if (action === 'new') {
      setItems(Array.from({ length: 20 }, () => blankRow()));
      setBillNo('');
      setSupplierName('');
      setSupplierPhone('');
      setSupplierId('');
      setOriginalInvoiceId('');
      setNotes('');
      setReturnDate(new Date().toISOString().slice(0, 10));
      setReturnTime(getCurrentTime());
      setReturnMethod('adjust');
      setAccountId('');
    }
  }; // 🔥 یہ bracket missing تھا

  const handleSupplierInput = (e) => {
    const value = e.target.value;
    setSupplierName(value);

    if (!value.trim()) {
      setSupplierSuggestions([]);
      setSupplierPhone('');
    } else {
      const filtered = suppliers.filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) || s.phone?.includes(value)
      );
      setSupplierSuggestions(filtered);
    }
  };

  const handleSupplierSelect = (name, phone, id) => {
    setSupplierName(name || '');
    setSupplierPhone(phone || '');
    setSupplierId(id || '');

    setSupplierSuggestions([]);
  };
  // ⌨️ Supplier Keyboard Navigation
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
        handleSupplierSelect(selected.name, selected.phone, selected._id);
      }
    }
  };

  // 🔍 When Purchase Invoice Selected
  const handleInvoiceSelect = (invoice) => {
    if (!invoice) return;

    setShowSearchModal(false);
    setOriginalInvoiceId(invoice._id);

    setBillNo(`PR-${invoice.billNo}`);
    setSupplierName(invoice.supplierName);
    setSupplierPhone(invoice.supplierPhone);
    setSupplierId(invoice.supplier?._id || invoice.supplier);

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

    // 🔥 10 empty rows add کریں
    const emptyRows = Array.from({ length: 10 }, () => blankRow());

    setItems([...loadedItems, ...emptyRows]);
  };

  return (
    <div className="p-4 bg-white rounded shadow-md">
      <h2 className="text-xl font-semibold mb-4">
        {id ? `✏️ ${t('purchase.editReturn')}` : `🔁 ${t('purchase.newReturn')}`}
      </h2>

      <div className="grid grid-cols-4 gap-2 mb-4 relative">
        <div className="relative">
          <input
            type="text"
            className="border p-1 text-sm w-full"
            placeholder={t('supplier.supplier')}
            value={supplierName}
            onChange={handleSupplierInput}
            onKeyDown={handleSupplierKeyDown}
            autoComplete="off"
          />

          {supplierSuggestions.length > 0 && (
            <ul className="absolute bg-white border mt-1 w-full max-h-32 overflow-auto z-10">
              {supplierSuggestions.map((s, i) => (
                <li
                  key={s._id || i}
                  onClick={() => handleSupplierSelect(s.name, s.phone, s._id)}
                  style={{
                    backgroundColor: selectedSupplierIndex === i ? '#e0f2fe' : 'white',
                    fontWeight: selectedSupplierIndex === i ? 'bold' : 'normal',
                    padding: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {s.name} – {s.phone}
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          type="date"
          className="border p-1 text-sm"
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
        />

        <input
          type="time"
          className="border p-1 text-sm"
          value={returnTime}
          onChange={(e) => setReturnTime(e.target.value)}
        />

        <input
          className="border p-1 text-sm"
          placeholder={t('purchase.returnBillNo')}
          value={billNo}
          onChange={(e) => setBillNo(e.target.value)}
        />

        <input
          className="border p-1 text-sm"
          placeholder={t('phone')}
          value={supplierPhone || ''}
          onChange={(e) => setSupplierPhone(e.target.value)}
        />

        <select
          className="border p-1 text-sm"
          value={returnMethod}
          onChange={(e) => setReturnMethod(e.target.value)}
        >
          <option value="adjust">{t('purchase.adjustPayable')}</option>
          <option value="cash">{t('purchase.cashReceived')}</option>
        </select>

        {returnMethod === 'cash' && (
          <>
            <select
              className="border p-1 text-sm"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option value="cash">{t('payment.cash')}</option>
              <option value="cheque">{t('payment.cheque')}</option>
              <option value="online">{t('payment.online')}</option>
            </select>

            <select
              className="border p-1 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">-- {t('alerts.selectAccount')} --</option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </>
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
                    onSelect={(product) => {
                      const updated = [...items];
                      const qty = parseFloat(updated[idx].quantity) || 1;
                      updated[idx] = {
                        ...updated[idx],
                        name: product.name,
                        productId: product._id,
                        price: product.purchasePrice || product.costPrice || product.price || 0,
                        quantity: qty,
                        total: (
                          (product.purchasePrice || product.costPrice || product.price || 0) * qty
                        ).toFixed(2),
                      };
                      setItems(updated);
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
                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                    className="w-full text-center"
                  />
                </td>
                <td className="border p-1 text-center">{item.total || '0.00'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 bg-white border-t py-3 flex justify-between items-center">
        <div className="font-semibold text-lg">
          {t('total')}: {totalAmount.toFixed(2)}
        </div>

        <div className="flex gap-2">
          <button onClick={() => handleSubmit('close')} className="btn btn-success">
            💾 {t('saveClose')}
          </button>

          <button onClick={() => handleSubmit('new')} className="btn btn-primary">
            💾 {t('saveNew')}
          </button>
          <button onClick={handleRevert} className="btn btn-warning">
            {id ? `↩️ ${t('common.revert')}` : `🧹 ${t('clear')}`}
          </button>

          <button onClick={() => setShowSearchModal(true)} className="btn btn-secondary">
            🔍 {t('purchase.findInvoice')}
          </button>
        </div>
      </div>
      {showSearchModal && (
        <PurchaseInvoiceSearchModal
          onSelect={handleInvoiceSelect}
          onClose={() => setShowSearchModal(false)}
        />
      )}
    </div>
  );
};

export default PurchaseReturnForm;
