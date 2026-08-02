// src/components/PurchaseInvoiceForm.js

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSuppliers } from '../services/supplierService';
import { fetchPurchaseParties } from '../services/partyService';
import { fetchProductsWithToken } from '../services/inventoryService';
import { getValidPaymentAccounts } from '../services/accountService';

import purchaseInvoiceService from '../services/purchaseInvoiceService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import InvoiceTable from './InvoiceTable';
import useFormPersist from '../hooks/useFormPersist';
import SupplierForm from './SupplierForm';
import PurchaseInvoiceSearchModal from './PurchaseInvoiceSearchModal';
import { t } from '../i18n/i18n';
import AttachmentViewerModal from './AttachmentViewerModal';
import { useNavigate } from 'react-router-dom';

import { hasPermission } from '../utils/permissionHelper';
const API = process.env.REACT_APP_API_BASE_URL;
const PurchaseInvoiceForm = () => {
  const token = localStorage.getItem('token');
  const printRef = useRef();
  const fileInputRef = useRef();
  const { id } = useParams();
  const navigate = useNavigate();

  const canViewPurchases = hasPermission('purchases.view');
  const canCreatePurchases = hasPermission('purchases.create');
  const canEditPurchases = hasPermission('purchases.edit');
  const canPayPurchaseBill = hasPermission('purchases.pay_bill');

  const [isEdit, setIsEdit] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedSupplierType, setSelectedSupplierType] = useState('supplier');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
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
  const [attachments, setAttachments] = useState([]);
  const [modalAttachment, setModalAttachment] = useState(null);

  const [paymentType, setPaymentType] = useState('cash');

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountError, setAccountError] = useState('');
  const [loading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  // 📊 Item History States

  const [itemHistory, setItemHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isOpeningPurchase, setIsOpeningPurchase] = useState(false);
  const [openingPurchaseAmount, setOpeningPurchaseAmount] = useState(0);

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

    if (!id) {
      setInvoiceDate(now.toISOString().split('T')[0]);
      setInvoiceTime(now.toTimeString().slice(0, 5));
    }

    if (!token) return;

    let cancelled = false;

    const loadFormOptions = async () => {
      const results = await Promise.allSettled([
        fetchSuppliers({
          status: 'active',
        }),
        fetchPurchaseParties(token),
        fetchProductsWithToken(token),
        getValidPaymentAccounts(),
      ]);

      if (cancelled) return;

      const [supplierResult, partyResult, productResult, accountResult] = results;

      if (supplierResult.status === 'fulfilled') {
        setSuppliers(Array.isArray(supplierResult.value) ? supplierResult.value : []);
      } else {
        console.error('Suppliers load failed:', supplierResult.reason);
      }

      if (partyResult.status === 'fulfilled') {
        setParties(Array.isArray(partyResult.value) ? partyResult.value : []);
      } else {
        console.error('Purchase parties load failed:', partyResult.reason);
      }

      if (productResult.status === 'fulfilled') {
        setProducts(Array.isArray(productResult.value) ? productResult.value : []);
      } else {
        console.error('Products load failed:', productResult.reason);
      }

      if (accountResult.status === 'fulfilled') {
        setAccounts(Array.isArray(accountResult.value) ? accountResult.value : []);
      } else {
        console.error('Accounts load failed:', accountResult.reason);
      }
    };

    loadFormOptions();

    return () => {
      cancelled = true;
    };
  }, [token, id]);

  useEffect(() => {
    if (paidAmount > 0 && paymentType === 'cash' && accounts.length > 0) {
      const handCash = accounts.find(
        (a) => a.name?.toLowerCase() === 'handcash' || a.category === 'cash'
      );

      if (handCash) {
        setSelectedAccountId(handCash._id);
      }
    }

    if (paidAmount === 0) {
      setSelectedAccountId('');
    }
  }, [paidAmount, paymentType, accounts]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const loadInvoice = async () => {
      if (!canViewPurchases || !canEditPurchases) {
        alert('You do not have permission to edit purchase invoices');
        navigate('/purchase-invoices');
        return;
      }

      try {
        setEditLoading(true);

        const invoice = await purchaseInvoiceService.getPurchaseInvoiceById(id);

        if (cancelled) return;

        setIsEdit(true);
        setInvoiceId(invoice._id);
        setBillNo(invoice.billNo || '');
        setInvoiceDate(invoice.invoiceDate?.slice(0, 10) || '');
        setInvoiceTime(invoice.invoiceTime || '');
        setSupplierName(invoice.supplierName || '');
        setSupplierPhone(invoice.supplierPhone || '');

        setDiscountPercent(Number(invoice.discountPercent || 0));
        setDiscountAmount(Number(invoice.discountAmount || 0));
        setPaidAmount(Number(invoice.paidAmount || 0));
        setPaymentType(invoice.paymentType || 'credit');
        setSelectedAccountId(invoice.accountId?._id || invoice.accountId || '');
        setAttachments(invoice.attachments || []);

        const openingMode =
          invoice.isOpening === true ||
          invoice.billNo === 'OPENING' ||
          (invoice.items || []).length === 0;

        setIsOpeningPurchase(openingMode);

        setOpeningPurchaseAmount(
          openingMode ? Number(invoice.grandTotal || invoice.totalAmount || 0) : 0
        );

        if (invoice.partyId) {
          setSelectedSupplierType('party');
          setSelectedSupplierId(invoice.partyId?._id || invoice.partyId);
        } else {
          setSelectedSupplierType('supplier');
          setSelectedSupplierId(invoice.supplier?._id || invoice.supplier || '');
        }

        const loadedItems = (invoice.items || []).map((item, index) => {
          const populatedProduct =
            item.productId && typeof item.productId === 'object' ? item.productId : null;

          return {
            itemNo: index + 1,
            productId: populatedProduct?._id || item.productId || '',
            search: populatedProduct?.name || item.name || '',
            name: populatedProduct?.name || item.name || '',
            description: populatedProduct?.description || item.description || '',
            cost: Number(
              item.salePrice ?? populatedProduct?.salePrice ?? populatedProduct?.unitCost ?? 0
            ),
            rate: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            amount: Number(item.total || Number(item.quantity || 0) * Number(item.price || 0)),
          };
        });

        const emptyRows = Array.from({ length: 10 }, (_, i) =>
          generateEmptyRow(loadedItems.length + i)
        );

        setItems([...loadedItems, ...emptyRows]);
      } catch (err) {
        console.error('Purchase invoice edit load failed:', err?.response?.data || err.message);

        alert(err?.response?.data?.message || 'Purchase invoice load failed');
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    };

    loadInvoice();

    return () => {
      cancelled = true;
    };
  }, [id, canViewPurchases, canEditPurchases, navigate]);

  const filterSuppliers = (value) => {
    const query = value.toLowerCase();

    const supplierList = suppliers
      .filter((s) => s.name?.toLowerCase().includes(query) || s.phone?.includes(query))
      .map((s) => ({
        ...s,
        selectType: 'supplier',
        badge: 'Supplier',
      }));

    const partyList = parties
      .filter((p) => p.name?.toLowerCase().includes(query) || p.phone?.includes(query))
      .map((p) => ({
        ...p,
        selectType: 'party',
        badge: 'Party',
      }));

    return [...supplierList, ...partyList];
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
        handleSupplierSelect(selected.name, selected.phone, selected._id, selected.selectType);
        setTimeout(() => {
          document.getElementById('supplier-phone')?.focus();
        }, 0);
      }
    }
  };

  const handleSupplierSelect = (name, phone, id, type = 'supplier') => {
    setSupplierName(name);
    setSupplierPhone(phone || '');
    setSelectedSupplierId(id);
    setSelectedSupplierType(type);

    setSupplierSuggestions([]);
    setSelectedSupplierIndex(-1);
  };
  const quickAddSupplier = async (name) => {
    try {
      const res = await fetch(`${API}/api/suppliers`, {
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

    updated[index].amount = (updated[index].quantity || 0) * (updated[index].rate || 0);

    setItems(updated);
  };

  const totalAmount = isOpeningPurchase
    ? Number(openingPurchaseAmount || 0)
    : items.reduce((sum, i) => sum + i.amount, 0);

  const finalDiscount = isOpeningPurchase
    ? 0
    : discountPercent > 0
      ? (totalAmount * discountPercent) / 100
      : discountAmount;

  const grandTotal = isOpeningPurchase
    ? Number(openingPurchaseAmount || 0)
    : totalAmount - finalDiscount;
  const formState = {
    supplierName,
    supplierPhone,
    billNo,
    invoiceDate,
    invoiceTime,
    items,
    discountPercent,
    discountAmount,
    paidAmount,
    paymentType,
    selectedAccountId,
  };

  useEffect(() => {
    if (isEdit) return;
    const saved = localStorage.getItem('app_state_purchase_invoice_draft');

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);

      const data = parsed.data;

      if (!data) return;

      setSupplierName(data.supplierName || '');
      setSupplierPhone(data.supplierPhone || '');
      setBillNo(data.billNo || '');

      setInvoiceDate(data.invoiceDate || '');
      setInvoiceTime(data.invoiceTime || '');

      setItems(data.items || []);

      setDiscountPercent(data.discountPercent || 0);
      setDiscountAmount(data.discountAmount || 0);

      setPaidAmount(data.paidAmount || 0);

      setPaymentType(data.paymentType || 'cash');

      setSelectedAccountId(data.selectedAccountId || '');
    } catch (err) {
      console.error(err);
    }
  }, [isEdit]);

  useFormPersist(!isEdit ? 'purchase_invoice_draft' : null, formState, () => {});

  const handleProductHistory = (productId) => {
    if (!productId) return;

    setSelectedProductId(productId);
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files || []);

    if (attachments.length + newFiles.length > 3) {
      alert('Maximum 3 attachments allowed');
      e.target.value = '';
      return;
    }

    setAttachments((prev) => [...prev, ...newFiles]);
  };
  const savePurchaseInvoice = async () => {
    if (isEdit && !canEditPurchases) {
      alert('You do not have permission to edit purchase invoices');
      return false;
    }

    if (!isEdit && !canCreatePurchases) {
      alert('You do not have permission to create purchase invoices');
      return false;
    }

    if (Number(paidAmount || 0) > 0 && !canPayPurchaseBill) {
      alert('You do not have permission to pay purchase bills');
      return false;
    }
    if (paidAmount > 0 && (!selectedAccountId || selectedAccountId.trim() === '')) {
      setAccountError('Please select payment account');

      document.querySelector('select[name="selectedAccountId"]')?.focus();
      return false;
    }

    setAccountError('');

    const selectedSupplier =
      selectedSupplierType === 'supplier'
        ? suppliers.find((s) => s._id === selectedSupplierId || s.name === supplierName)
        : null;

    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = isOpeningPurchase
      ? []
      : items
          .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))
          .map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.rate,
            salePrice: i.cost,
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
    if (selectedSupplierType === 'party') {
      formData.append('partyId', selectedSupplierId);
    } else {
      formData.append('supplierId', selectedSupplier?._id || selectedSupplierId || '');
    }
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', discountAmount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);
    attachments.forEach((file) => {
      if (file instanceof File) {
        formData.append('attachments', file);
      }
    });

    const keepAttachmentKeys = attachments
      .filter((file) => !(file instanceof File))
      .map((file) => file.key);

    formData.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));
    formData.append('items', JSON.stringify(validItems));
    formData.append('createJournal', 'true');
    formData.append('journalEntries', JSON.stringify(journalEntries));
    if (isOpeningPurchase) {
      formData.append('isOpening', true);
    }

    if (isEdit) {
      await purchaseInvoiceService.updatePurchaseInvoice(invoiceId, formData);
    } else {
      await purchaseInvoiceService.addPurchaseInvoice(formData);
      localStorage.removeItem('app_state_purchase_invoice_draft');
    }
    return true;
  };

  const handleSaveAndClose = async () => {
    try {
      const saved = await savePurchaseInvoice();

      if (!saved) return;

      navigate('/dashboard');
    } catch (err) {
      console.error('❌ Error saving invoice:', err);
    }
  };
  const handleSaveAndNew = async () => {
    try {
      const saved = await savePurchaseInvoice();

      if (!saved) return;

      setBillNo('');
      setSupplierName('');
      setSupplierPhone('');

      setSelectedSupplierId('');
      setSelectedSupplierType('supplier');

      setItems(Array.from({ length: 15 }, (_, i) => generateEmptyRow(i)));

      setDiscountPercent(0);
      setDiscountAmount(0);
      setPaidAmount(0);
      setSelectedAccountId('');

      setAttachments([]);
      setModalAttachment(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
    if (!canEditPurchases) {
      alert('You do not have permission to edit purchase invoices');
      return;
    }

    if (Number(paidAmount || 0) > 0 && !canPayPurchaseBill) {
      alert('You do not have permission to pay purchase bills');
      return;
    }
    const selectedSupplier =
      selectedSupplierType === 'supplier'
        ? suppliers.find((s) => s._id === selectedSupplierId || s.name === supplierName)
        : null;

    const selectedParty =
      selectedSupplierType === 'party'
        ? parties.find((p) => p._id === selectedSupplierId || p.name === supplierName)
        : null;

    const supplierAccountId =
      selectedSupplierType === 'supplier'
        ? selectedSupplier?.account || ''
        : selectedParty?.account || '';

    const validItems = isOpeningPurchase
      ? []
      : items
          .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))
          .map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.rate,
            salePrice: i.cost,
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
    if (selectedSupplierType === 'party') {
      formData.append('partyId', selectedSupplierId);
    } else {
      formData.append('supplierId', selectedSupplier?._id || selectedSupplierId || '');
    }
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', discountAmount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);
    attachments.forEach((file) => {
      if (file instanceof File) {
        formData.append('attachments', file);
      }
    });

    const keepAttachmentKeys = attachments
      .filter((file) => !(file instanceof File))
      .map((file) => file.key);

    formData.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));
    formData.append('items', JSON.stringify(validItems));
    formData.append('createJournal', 'true');
    formData.append('journalEntries', JSON.stringify(journalEntries));
    if (isOpeningPurchase) {
      formData.append('isOpening', true);
    }

    try {
      await purchaseInvoiceService.updatePurchaseInvoice(invoiceId, formData);
      localStorage.removeItem('app_state_purchase_invoice_draft');
      alert(t('alerts.invoiceUpdated'));
      navigate('/dashboard');
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
      const openingMode =
        invoice.isOpening === true ||
        invoice.billNo === 'OPENING' ||
        (invoice.items || []).length === 0;

      setIsOpeningPurchase(openingMode);
      setOpeningPurchaseAmount(
        openingMode ? Number(invoice.grandTotal || invoice.totalAmount || 0) : 0
      );

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
          cost: Number(item.salePrice ?? product?.salePrice ?? 0),
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
    setSelectedSupplierId('');
    setSelectedSupplierType('supplier');
    setItems(Array.from({ length: 15 }, (_, i) => generateEmptyRow(i)));
    setDiscountPercent(0);
    setDiscountAmount(0);
    setPaidAmount(0);
    setSelectedAccountId('');
    setAttachments([]);
    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

      document.querySelector('select[name="selectedAccountId"]')?.focus();

      return;
    }

    const selectedSupplier = suppliers.find((s) => s.name === supplierName);
    const supplierAccountId = selectedSupplier?.account || '';

    const validItems = items
      .filter((i) => i.productId && i.quantity > 0 && (i.cost > 0 || i.rate > 0))

      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.rate,
        salePrice: i.cost,
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
    if (selectedSupplierType === 'party') {
      formData.append('partyId', selectedSupplierId);
    } else {
      formData.append('supplierId', selectedSupplier?._id || selectedSupplierId || '');
    }
    formData.append('totalAmount', totalAmount);
    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', discountAmount);
    formData.append('grandTotal', grandTotal);
    formData.append('paidAmount', paidAmount);
    formData.append('paymentType', paymentType);
    formData.append('accountId', selectedAccountId);
    attachments.forEach((file) => {
      if (file instanceof File) {
        formData.append('attachments', file);
      }
    });

    const keepAttachmentKeys = attachments
      .filter((file) => !(file instanceof File))
      .map((file) => file.key);

    formData.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));
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

      navigate('/dashboard');
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
      {editLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl font-semibold">
            Purchase Invoice Loading...
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto p-6 bg-white rounded shadow">
        <div className="grid grid-cols-12 gap-6">
          {/* 🧾 Main Invoice Section */}
          <div className={showHistory ? 'col-span-10' : 'col-span-12'}>
            <div ref={printRef} id="print-section">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  📦
                  <span className="md:hidden">Purchase</span>
                  <span className="hidden md:inline">{t('purchase.invoice')}</span>
                </h2>

                <div className="flex gap-2">
                  {/* 🔍 Find Invoice */}
                  <button
                    type="button"
                    onClick={() => setShowSearchModal(true)}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
                  >
                    🔍
                    <span className="md:hidden">Find</span>
                    <span className="hidden md:inline">{t('findInvoice')}</span>
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
                          onMouseDown={() =>
                            handleSupplierSelect(s.name, s.phone, s._id, s.selectType)
                          }
                          className={`px-2 py-2 cursor-pointer ${
                            selectedSupplierIndex === i ? 'bg-blue-100 font-bold' : ''
                          }`}
                        >
                          {s.name} {s.badge === 'Party' ? '🟣 Party' : ''}
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
                          ➕ <span className="font-bold">{t('supplier.addNew')}</span> "
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
                          📝 <span className="font-semibold">{t('supplier.addDetails')}</span>
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
              {isOpeningPurchase && (
                <div className="mb-2 px-3 py-2 rounded bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-semibold">
                  ⚠️ Opening Purchase Entry
                </div>
              )}

              {isOpeningPurchase && (
                <div className="mb-3 p-3 border rounded bg-blue-50">
                  <label className="block text-sm font-semibold mb-2">
                    Opening Purchase Amount
                  </label>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={openingPurchaseAmount}
                    onChange={(e) => setOpeningPurchaseAmount(e.target.value)}
                    className="border px-3 py-2 w-64 rounded no-spinner"
                  />
                </div>
              )}
              {!isOpeningPurchase && (
                <InvoiceTable
                  items={items}
                  setItems={setItems}
                  products={products}
                  handleQtyRateChange={handleQtyRateChange}
                  clearOnFocus={clearOnFocus}
                  mode="purchase"
                  onProductChange={handleProductHistory}
                />
              )}

              {/* 🔹 Totals + Buttons – Sales Style */}
              <div className="bg-gray-100 p-4 rounded mt-6">
                <div className="grid grid-cols-12 gap-6 items-start">
                  {/* LEFT SIDE */}
                  <div className="col-span-8 flex flex-col gap-4">
                    {/* TOP ROW — Discount / Paid / File */}
                    <div className="flex gap-3 items-center flex-wrap">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={t('discountPercent')}
                        value={discountPercent === 0 ? '' : discountPercent}
                        onChange={(e) => {
                          setDiscountPercent(+e.target.value || 0);
                          setDiscountAmount(0);
                        }}
                        className="hidden md:block border px-2 py-0 text-sm h-8 w-28 appearance-none"
                      />

                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={t('discountRS')}
                        value={discountAmount === 0 ? '' : discountAmount}
                        onChange={(e) => {
                          setDiscountAmount(+e.target.value || 0);
                          setDiscountPercent(0);
                        }}
                        className="border px-2 py-0 text-sm h-8 w-24 appearance-none"
                      />

                      {canPayPurchaseBill && (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
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
                            name="selectedAccountId"
                            value={selectedAccountId}
                            onChange={(e) => {
                              setSelectedAccountId(e.target.value);

                              if (e.target.value) {
                                setAccountError('');
                              }
                            }}
                            disabled={paidAmount === 0}
                            className={`px-2 py-1 h-8 w-28 text-sm cursor-pointer border ${
                              accountError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          >
                            <option value="">{t('alerts.selectAccount')}</option>

                            {accounts.map((acc) => (
                              <option key={acc._id} value={acc._id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>

                          {accountError && (
                            <p className="text-red-600 text-xs mt-1">{accountError}</p>
                          )}
                        </>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          hidden
                          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                          onChange={handleFileChange}
                        />

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={attachments.length >= 3}
                          className={`px-3 py-1.5 rounded-lg text-sm shadow ${
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
                            : file.fullUrl || file.url || '';

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
                                    setAttachments((prev) => prev.filter((_, i) => i !== index));

                                    if (fileInputRef.current) {
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

                    {/* SECOND ROW — Buttons */}
                    <div className="flex flex-wrap gap-3 mt-2 md:mt-8">
                      {isEdit && canEditPurchases ? (
                        <button
                          type="button"
                          onClick={handleUpdate}
                          className="bg-orange-600 text-white px-4 py-2 rounded"
                        >
                          🔁 {t('updateClose')}
                        </button>
                      ) : (
                        !isEdit &&
                        canCreatePurchases && (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveAndClose}
                              disabled={loading}
                              className={`text-white px-2 py-1 md:px-4 md:py-2 text-xs md:text-sm rounded ${
                                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600'
                              }`}
                            >
                              <span className="md:hidden">{t('saveClose')}</span>

                              <span className="hidden md:inline">💾 {t('saveClose')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleSaveAndNew}
                              disabled={loading}
                              className={`text-white px-2 py-1 md:px-4 md:py-2 text-xs md:text-sm rounded ${
                                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600'
                              }`}
                            >
                              <span className="md:hidden">{t('saveNew')}</span>

                              <span className="hidden md:inline">📄 {t('saveNew')}</span>
                            </button>
                          </>
                        )
                      )}

                      <button
                        type="button"
                        onClick={handleClear}
                        className="bg-gray-500 text-white px-2 py-1 md:px-4 md:py-2 rounded"
                      >
                        <span className="md:hidden">🧹</span>
                        <span className="hidden md:inline">
                          {isEdit ? t('common.revert') : t('clear')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePrint}
                        className="bg-purple-600 text-white px-2 py-1 md:px-4 md:py-2 rounded"
                      >
                        <span className="md:hidden">🖨</span>
                        <span className="hidden md:inline">🖨 {t('print')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadPDF}
                        className="bg-indigo-600 text-white px-2 py-1 md:px-4 md:py-2 rounded"
                      >
                        <span className="md:hidden">📄</span>
                        <span className="hidden md:inline">📄 {t('pdf')}</span>
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
            const openingMode =
              invoice.isOpening === true ||
              invoice.billNo === 'OPENING' ||
              (invoice.items || []).length === 0;

            setIsOpeningPurchase(openingMode);
            setOpeningPurchaseAmount(
              openingMode ? Number(invoice.grandTotal || invoice.totalAmount || 0) : 0
            );

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
                cost: Number(item.salePrice ?? product?.salePrice ?? 0),
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
              const res = await fetch(`${API}/api/suppliers`, {
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
      <AttachmentViewerModal
        attachment={modalAttachment}
        onClose={() => setModalAttachment(null)}
      />
    </>
  );
};

export default PurchaseInvoiceForm;
