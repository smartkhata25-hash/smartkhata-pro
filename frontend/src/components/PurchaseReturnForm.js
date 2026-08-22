import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createPurchaseReturn,
  updatePurchaseReturn,
  getPurchaseReturnById,
} from '../services/purchaseReturnService';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { useNavigate, useParams } from 'react-router-dom';
import ProductDropdown from './ProductDropdown';
import PurchaseInvoiceSearchModal from './PurchaseInvoiceSearchModal';
import AttachmentViewerModal from './AttachmentViewerModal';
import { t } from '../i18n/i18n';
import useFormPersist from '../hooks/useFormPersist';
import { hasPermission } from '../utils/permissionHelper';

const PurchaseReturnForm = ({ token }) => {
  const getCurrentTime = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  };

  const { id } = useParams();
  const navigate = useNavigate();
  const canViewPurchaseReturns = hasPermission('purchase_returns.view');
  const canCreatePurchaseReturns = hasPermission('purchase_returns.create');
  const canEditPurchaseReturns = hasPermission('purchase_returns.edit');
  const scrollRef = useRef();
  const fileInputRef = useRef(null);
  const didLoadEditRef = useRef(false);

  const [productList, setProductList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedSupplierType, setSelectedSupplierType] = useState('supplier');
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
  const [attachments, setAttachments] = useState([]);
  const [modalAttachment, setModalAttachment] = useState(null);
  const [paymentType, setPaymentType] = useState('cash');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [isOpeningReturn, setIsOpeningReturn] = useState(false);
  const [openingReturnAmount, setOpeningReturnAmount] = useState(0);

  // 📊 Purchase History
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemHistory, setItemHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

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
      setSupplierId(data.partyId?._id || data.partyId || data.supplier?._id || data.supplier || '');

      if (data.partyId) {
        setSelectedSupplierType('party');
      } else {
        setSelectedSupplierType('supplier');
      }
      setReturnDate(data.returnDate?.slice(0, 10) || '');
      setReturnTime(data.returnTime || '');
      setNotes(data.notes || '');
      setReturnMethod(data.paymentType ? 'cash' : 'adjust');
      setPaymentType(data.paymentType || 'cash');
      setAccountId(data.accountId || '');
      const openingMode =
        data.isOpening === true || data.billNo === 'OPENING' || (data.items || []).length === 0;

      setIsOpeningReturn(openingMode);
      setOpeningReturnAmount(openingMode ? Number(data.totalAmount || 0) : 0);

      setAttachments(data.attachments || []);
      setModalAttachment(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      const mappedItems = (data.items || []).map((i) => {
        const populatedProduct =
          i.productId && typeof i.productId === 'object' ? i.productId : null;

        const productId = populatedProduct?._id || i.productId || '';

        const matchedProduct = productList.find((p) => String(p._id) === String(productId));

        const quantity = Number(i.quantity || 0);
        const price = Number(i.price || 0);

        return {
          productId,
          name: populatedProduct?.name || matchedProduct?.name || i.name || '',
          quantity,
          price,
          total: Number(i.total ?? quantity * price).toFixed(2),
        };
      });

      const emptyRows = Array.from({ length: 10 }, () => blankRow());

      setItems([...mappedItems, ...emptyRows]);
    },
    [productList]
  );

  useEffect(() => {
    if (!id) return;
    if (didLoadEditRef.current) return;

    const load = async () => {
      if (!canViewPurchaseReturns || !canEditPurchaseReturns) {
        alert('You do not have permission to edit purchase returns');
        navigate('/purchase-returns');
        return;
      }

      const data = await getPurchaseReturnById(id, token);

      populateForm(data);
      didLoadEditRef.current = true;
    };

    load();
  }, [id, token, populateForm, canViewPurchaseReturns, canEditPurchaseReturns, navigate]);

  useEffect(() => {
    let active = true;

    const applyOptions = (options) => {
      if (!active || !options) return;

      setProductList(Array.isArray(options.products) ? options.products : []);
      setSuppliers(Array.isArray(options.suppliers) ? options.suppliers : []);
      setParties(Array.isArray(options.parties) ? options.parties : []);
      setAccounts(
        Array.isArray(options.paymentAccounts)
          ? options.paymentAccounts
          : Array.isArray(options.accounts)
            ? options.accounts
            : []
      );
    };

    const loadFormOptions = async () => {
      try {
        const cachedOptions = purchaseInvoiceService.getCachedPurchaseInvoiceFormOptions?.();

        if (cachedOptions) {
          applyOptions(cachedOptions);
        }

        const options = await purchaseInvoiceService.fetchPurchaseInvoiceFormOptions();

        applyOptions(options);
      } catch (err) {
        console.error(
          'Purchase return form options load failed:',
          err?.response?.data || err.message
        );
      }
    };

    loadFormOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPurchaseHistory = async () => {
      if (!selectedProductId || !supplierId) {
        setItemHistory([]);
        setLoadingHistory(false);
        return;
      }

      try {
        setLoadingHistory(true);

        const filters = selectedSupplierType === 'party' ? { partyId: supplierId } : { supplierId };

        const history = await purchaseInvoiceService.getItemPurchaseHistory(
          selectedProductId,
          filters
        );

        if (!active) return;

        const safeHistory = Array.isArray(history) ? history : [];

        setItemHistory(safeHistory);

        if (safeHistory.length > 0) {
          const latestRate = Number(safeHistory[0].price || 0);

          setItems((prev) =>
            prev.map((row) => {
              if (row.productId !== selectedProductId) return row;

              const qty = Number(row.quantity) || 1;

              return {
                ...row,
                price: latestRate,
                total: (qty * latestRate).toFixed(2),
              };
            })
          );
        }
      } catch (err) {
        if (!active) return;

        console.error('Purchase history load failed:', err?.response?.data || err.message);

        setItemHistory([]);
      } finally {
        if (active) {
          setLoadingHistory(false);
        }
      }
    };

    loadPurchaseHistory();

    return () => {
      active = false;
    };
  }, [selectedProductId, supplierId, selectedSupplierType]);

  // 🔁 Auto select cash account when method changes
  useEffect(() => {
    if (returnMethod === 'cash' && accounts.length > 0 && !accountId) {
      const cashAcc = accounts.find((a) => a.name?.toLowerCase().includes('cash'));
      if (cashAcc) setAccountId(cashAcc._id);
    }

    if (returnMethod === 'adjust' && accountId) {
      setAccountId('');
    }
  }, [returnMethod, accounts, accountId]);

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

  const totalAmount = isOpeningReturn
    ? Number(openingReturnAmount || 0)
    : items.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);

  const formState = {
    items,
    billNo,
    returnDate,
    returnTime,
    supplierName,
    supplierPhone,
    supplierId,
    selectedSupplierType,
    notes,
    returnMethod,
    accountId,
    paymentType,
    originalInvoiceId,
    isOpeningReturn,
    openingReturnAmount,
  };

  const restorePurchaseReturnDraft = useCallback((valueOrUpdater) => {
    const now = new Date();

    const makeBlankRow = () => ({
      productId: '',
      name: '',
      quantity: '',
      price: '',
      total: '',
    });

    const defaultState = {
      items: [],
      billNo: '',
      returnDate: now.toISOString().slice(0, 10),
      returnTime: now.toTimeString().slice(0, 5),
      supplierName: '',
      supplierPhone: '',
      supplierId: '',
      selectedSupplierType: 'supplier',
      notes: '',
      returnMethod: 'adjust',
      accountId: '',
      paymentType: 'cash',
      originalInvoiceId: '',
      isOpeningReturn: false,
      openingReturnAmount: 0,
    };

    const data =
      typeof valueOrUpdater === 'function' ? valueOrUpdater(defaultState) : valueOrUpdater;

    if (!data || typeof data !== 'object') return;

    setBillNo(data.billNo || '');

    setReturnDate(data.returnDate || now.toISOString().slice(0, 10));

    setReturnTime(data.returnTime || now.toTimeString().slice(0, 5));

    setSupplierName(data.supplierName || '');
    setSupplierPhone(data.supplierPhone || '');

    setSupplierId(data.supplierId || '');

    setSelectedSupplierType(data.selectedSupplierType || 'supplier');

    setNotes(data.notes || '');

    setReturnMethod(data.returnMethod || 'adjust');

    setAccountId(data.accountId || '');

    setPaymentType(data.paymentType || 'cash');

    setOriginalInvoiceId(data.originalInvoiceId || '');

    setIsOpeningReturn(data.isOpeningReturn === true);

    setOpeningReturnAmount(Number(data.openingReturnAmount || 0));

    const loadedItems = Array.isArray(data.items) ? data.items : [];

    const emptyRows = Array.from(
      {
        length: Math.max(0, 20 - loadedItems.length),
      },
      () => makeBlankRow()
    );

    setItems([...loadedItems, ...emptyRows]);
  }, []);

  const shouldSavePurchaseReturnDraft = useCallback((draft) => {
    if (!draft) return false;

    const hasSupplier = Boolean(draft.supplierName?.trim()) || Boolean(draft.supplierId);

    const hasItems =
      Array.isArray(draft.items) &&
      draft.items.some(
        (item) =>
          item?.productId ||
          item?.name?.trim() ||
          Number(item?.quantity || 0) > 0 ||
          Number(item?.price || 0) > 0
      );

    const hasOtherData =
      Boolean(draft.billNo?.trim()) ||
      Boolean(draft.notes?.trim()) ||
      Boolean(draft.originalInvoiceId) ||
      draft.isOpeningReturn === true ||
      Number(draft.openingReturnAmount || 0) > 0;

    return hasSupplier || hasItems || hasOtherData;
  }, []);

  const { clear } = useFormPersist(
    !id ? 'purchase_return_draft' : null,
    formState,
    restorePurchaseReturnDraft,
    {
      expiryHours: 24,
      delay: 500,
      shouldSave: shouldSavePurchaseReturnDraft,
    }
  );

  const handleRevert = async () => {
    if (!id) {
      clear();

      setBillNo('');

      setSupplierName('');
      setSupplierPhone('');
      setSupplierId('');
      setSelectedSupplierType('supplier');

      setSupplierSuggestions([]);
      setSelectedSupplierIndex(-1);

      setNotes('');

      setReturnMethod('adjust');
      setAccountId('');
      setPaymentType('cash');

      setOriginalInvoiceId('');

      setIsOpeningReturn(false);
      setOpeningReturnAmount(0);

      setItems(Array.from({ length: 20 }, () => blankRow()));

      setAttachments([]);
      setModalAttachment(null);

      setSelectedProductId('');
      setItemHistory([]);
      setShowHistory(false);

      const now = new Date();

      setReturnDate(now.toISOString().slice(0, 10));
      setReturnTime(now.toTimeString().slice(0, 5));

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      return;
    }

    try {
      const data = await getPurchaseReturnById(id, token);

      populateForm(data);

      setSupplierSuggestions([]);
      setSelectedSupplierIndex(-1);

      setSelectedProductId('');
      setItemHistory([]);
      setShowHistory(false);
    } catch (err) {
      console.error('Purchase return revert failed:', err?.response?.data || err.message);

      alert(t('alerts.invoiceLoadFailed'));
    }
  };

  const handleSubmit = async (action) => {
    if (id && !canEditPurchaseReturns) {
      alert('You do not have permission to edit purchase returns');
      return;
    }

    if (!id && !canCreatePurchaseReturns) {
      alert('You do not have permission to create purchase returns');
      return;
    }
    const filteredItems = isOpeningReturn ? [] : items.filter((i) => i.productId && i.quantity > 0);

    if (!returnDate) return alert(t('alerts.fillRequiredFields'));
    if (!supplierName.trim()) return alert(t('alerts.selectSupplier'));
    if (!isOpeningReturn && filteredItems.length === 0) return alert(t('alerts.addProduct'));
    if (returnMethod === 'cash' && !accountId) return alert(t('alerts.selectAccount'));

    // 🔥 Auto match supplier by name in edit mode
    let finalSupplierId = supplierId;

    if (!finalSupplierId && supplierName.trim()) {
      const matchedSupplier = suppliers.find(
        (s) => s.name.trim().toLowerCase() === supplierName.trim().toLowerCase()
      );

      if (matchedSupplier) {
        finalSupplierId = matchedSupplier._id;
        setSupplierId(matchedSupplier._id);
      }
    }

    const selectedSupplier =
      selectedSupplierType === 'party'
        ? parties.find((p) => p._id === finalSupplierId)
        : suppliers.find((s) => s._id === finalSupplierId);

    if (!selectedSupplier) return alert(t('alerts.supplierAddFailed'));

    const formData = new FormData();
    formData.append('billNo', billNo || `PR-${Math.floor(Math.random() * 10000)}`);
    if (selectedSupplierType === 'party') {
      formData.append('partyId', selectedSupplier._id);
    } else {
      formData.append('supplierId', selectedSupplier._id);
    }
    formData.append('supplierName', selectedSupplier.name);
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
    if (isOpeningReturn) {
      formData.append('isOpening', true);
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

    attachments.forEach((file) => {
      if (file instanceof File) {
        formData.append('attachments', file);
      }
    });

    const keepAttachmentKeys = attachments
      .filter((file) => !(file instanceof File))
      .map((file) => file.key);

    formData.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));

    if (id) {
      await updatePurchaseReturn(id, formData, token);

      purchaseInvoiceService.invalidatePurchaseInvoiceFormOptionsCache?.();

      alert(t('alerts.invoiceUpdated'));
    } else {
      await createPurchaseReturn(formData, token);

      clear();

      purchaseInvoiceService.invalidatePurchaseInvoiceFormOptionsCache?.();

      alert(t('alerts.invoiceSaved'));
    }

    if (action === 'new') {
      if (id) {
        navigate('/purchase-returns/new', {
          replace: true,
        });
      }

      await handleRevert();

      return;
    }

    if (action === 'close') {
      if (!id) {
        await handleRevert();
      }

      navigate('/dashboard');

      return;
    }
  };

  const handleSupplierInput = (e) => {
    const value = e.target.value;
    setSupplierName(value);

    setSupplierId('');
    setSelectedSupplierType('supplier');

    // پرانے Supplier کی History صاف کریں
    setSelectedProductId('');
    setItemHistory([]);
    setShowHistory(false);

    if (!value.trim()) {
      setSupplierSuggestions([]);
      setSupplierPhone('');
    } else {
      const supplierResults = suppliers.map((s) => ({
        ...s,
        selectType: 'supplier',
      }));

      const partyResults = parties.map((p) => ({
        ...p,
        phone: p.phone || '',
        selectType: 'party',
      }));

      const filtered = [...supplierResults, ...partyResults].filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) || (s.phone || '').includes(value)
      );
      setSupplierSuggestions(filtered);
    }
  };

  const handleSupplierSelect = (name, phone, id, type = 'supplier') => {
    setSupplierName(name || '');
    setSupplierPhone(phone || '');
    setSupplierId(id || '');
    setSelectedSupplierType(type);

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
        handleSupplierSelect(selected.name, selected.phone, selected._id, selected.selectType);
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
    setSelectedSupplierType('supplier');

    setAttachments([]);
    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

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

    const emptyRows = Array.from({ length: 10 }, () => blankRow());

    setItems([...loadedItems, ...emptyRows]);
  };

  return (
    <div className="p-4 bg-white rounded shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">
          {id ? `✏️ ${t('purchase.editReturn')}` : `🔁 ${t('purchase.newReturn')}`}
        </h2>

        {selectedProductId && (
          <button
            type="button"
            onClick={() => setShowHistory((previousValue) => !previousValue)}
            className="px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            {showHistory ? '✕ Hide History' : '📊 Show Purchase History'}
          </button>
        )}
      </div>

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
                  onClick={() => handleSupplierSelect(s.name, s.phone, s._id, s.selectType)}
                  style={{
                    backgroundColor: selectedSupplierIndex === i ? '#e0f2fe' : 'white',
                    fontWeight: selectedSupplierIndex === i ? 'bold' : 'normal',
                    padding: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {s.name}
                  {s.selectType === 'party' && ' 🟣 Party'}
                  {' - '}
                  {s.phone}
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

        <div className="col-span-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);

                if (attachments.length + newFiles.length > 3) {
                  alert('Maximum 3 attachments allowed');
                  e.target.value = '';
                  return;
                }

                setAttachments((prev) => [...prev, ...newFiles]);
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= 3}
              className={`px-3 py-2 rounded-lg text-sm shadow ${
                attachments.length >= 3
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              📎 Add Files ({attachments.length}/3)
            </button>

            {attachments.map((file, index) => {
              const isNewFile = file instanceof File;
              const fileUrl = isNewFile
                ? URL.createObjectURL(file)
                : file.fullUrl || file.url || `${process.env.REACT_APP_R2_PUBLIC_URL}/${file.key}`;

              return (
                <div
                  key={file.key || index}
                  className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-xl text-xs"
                >
                  <span className="text-blue-600">📎 File {index + 1}</span>

                  {fileUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setModalAttachment({
                          url: fileUrl,
                          type: file.type || '',
                        })
                      }
                      className="text-green-600 underline"
                    >
                      👁 View
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('alerts.removeAttachment'))) {
                        const updated = attachments.filter((_, i) => i !== index);

                        setAttachments(updated);

                        if (updated.length === 0 && fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }
                    }}
                    className="text-red-500"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {isOpeningReturn && (
        <div className="mb-2 px-3 py-2 rounded bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-semibold">
          ⚠️ Opening Purchase Return Entry
        </div>
      )}

      {isOpeningReturn && (
        <div className="mb-3 p-3 border rounded bg-blue-50">
          <label className="block text-sm font-semibold mb-2">Opening Purchase Return Amount</label>

          <input
            type="text"
            inputMode="decimal"
            value={openingReturnAmount}
            onChange={(e) => setOpeningReturnAmount(e.target.value)}
            className="border px-3 py-2 w-64 rounded no-spinner"
          />
        </div>
      )}

      {!isOpeningReturn && (
        <div
          className={
            showHistory ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_170px] gap-4 mb-4' : 'mb-4'
          }
        >
          <div
            ref={scrollRef}
            className="border overflow-y-auto"
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
                          const purchaseRate =
                            product.purchasePrice || product.costPrice || product.price || 0;

                          updated[idx] = {
                            ...updated[idx],
                            name: product.name,
                            productId: product._id,
                            price: purchaseRate,
                            quantity: qty,
                            total: (purchaseRate * qty).toFixed(2),
                          };

                          setItems(updated);

                          // 📊 منتخب Item کی History کھولیں
                          setSelectedProductId(product._id);
                          setShowHistory(true);
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

          {showHistory && (
            <div className="border rounded-lg bg-gray-50 p-2 h-fit">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-gray-700">📊 Purchase History</h3>

                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-red-500 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-gray-600 mb-3">
                <div>
                  <strong>Supplier:</strong> {supplierName || '-'}
                </div>
              </div>

              {!supplierId && (
                <div className="text-center py-5 text-sm text-orange-600">
                  پہلے Supplier منتخب کریں۔
                </div>
              )}

              {supplierId && loadingHistory && (
                <div className="text-center py-5 text-sm text-blue-600">History loading...</div>
              )}

              {supplierId && !loadingHistory && itemHistory.length === 0 && (
                <div className="text-center py-5 text-sm text-gray-500">
                  اس Supplier سے اس Item کی کوئی Purchase نہیں ملی۔
                </div>
              )}

              {supplierId && !loadingHistory && itemHistory.length > 0 && (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {itemHistory.map((history, index) => (
                    <div
                      key={history._id || `${history.billNo || 'history'}-${index}`}
                      className="bg-white border rounded p-1.5 text-[11px] shadow-sm"
                    >
                      <div className="font-semibold text-blue-700 mb-1">
                        Bill No: {history.billNo || '-'}
                      </div>

                      <div>
                        📅 Date:{' '}
                        {history.invoiceDate
                          ? new Date(history.invoiceDate).toLocaleDateString()
                          : '-'}
                      </div>

                      <div>📦 Qty: {history.quantity || 0}</div>

                      <div className="font-bold text-green-700">
                        💰 Rate: {Number(history.price || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-0 bg-white border-t py-3 flex justify-between items-center">
        <div className="font-semibold text-lg">
          {t('total')}: {totalAmount.toFixed(2)}
        </div>

        <div className="flex gap-2">
          {((id && canEditPurchaseReturns) || (!id && canCreatePurchaseReturns)) && (
            <>
              <button
                type="button"
                onClick={() => handleSubmit('close')}
                className="btn btn-success"
              >
                💾 {id ? t('updateClose') : t('saveClose')}
              </button>

              <button type="button" onClick={() => handleSubmit('new')} className="btn btn-primary">
                💾 {t('saveNew')}
              </button>
            </>
          )}
          <button onClick={handleRevert} className="btn btn-warning">
            {id ? `↩️ ${t('common.revert')}` : `🧹 ${t('clear')}`}
          </button>

          {canViewPurchaseReturns && (
            <button
              type="button"
              onClick={() => setShowSearchModal(true)}
              className="btn btn-secondary"
            >
              🔍 {t('purchase.findInvoice')}
            </button>
          )}
        </div>
      </div>
      {canViewPurchaseReturns && showSearchModal && (
        <PurchaseInvoiceSearchModal
          onSelect={handleInvoiceSelect}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      <AttachmentViewerModal
        attachment={modalAttachment}
        onClose={() => setModalAttachment(null)}
      />
    </div>
  );
};

export default PurchaseReturnForm;
