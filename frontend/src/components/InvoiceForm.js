import React, { useEffect, useState, useRef, useCallback } from 'react';
import { t } from '../i18n/i18n';
import { getPrintSettings, updatePrintSettings } from '../services/printSettingService';
import { resetPrintSettings } from '../services/printSettingService';
import {
  createInvoice,
  updateInvoice,
  getInvoiceById,
  navigateInvoice,
  getLastInvoiceNo,
} from '../services/salesService';
import { fetchProductsWithToken } from '../services/inventoryService';

import { getValidPaymentAccounts } from '../services/accountService';
import { getLedgerByCustomerAccount } from '../services/customerLedgerService';
import { fetchSaleParties } from '../services/partyService';
import { getPartyLedger } from '../services/partyLedgerService';

import InvoiceTable from './InvoiceTable';
import { useLocation } from 'react-router-dom';
import InvoiceSearchModal from './InvoiceSearchModal';
import { useNavigate } from 'react-router-dom';
import CustomerForm from './CustomerForm';
import useFormPersist from '../hooks/useFormPersist';
import { hasPermission } from '../utils/permissionHelper';
const API = process.env.REACT_APP_API_BASE_URL;

const InvoiceForm = ({
  token,
  onSuccess,
  editingInvoice = null,
  invoiceId,
  onCustomerChange,
  onProductChange,
  salesHistory = [],
  loadingHistory = false,
}) => {
  const printRef = useRef();
  const customerInputRef = useRef(null);
  const fileInputRef = useRef();
  const location = useLocation();
  const canViewSales = hasPermission('sales.view');
  const canCreateSales = hasPermission('sales.create');
  const canEditSales = hasPermission('sales.edit');
  const canPrintSales = hasPermission('sales.print');
  const canReceiveSalesPayment = hasPermission('sales.receive_payment');
  const canCreateCustomer = hasPermission('customers.create');
  const canViewCost = hasPermission('products.view_cost');
  const canManagePrintSettings = hasPermission('settings.print');

  const [editingInvoiceFromAPI, setEditingInvoiceFromAPI] = useState(null);

  const [billNo, setBillNo] = useState('Auto');

  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTime, setInvoiceTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [by, setBy] = useState('');
  const [hideCost, setHideCost] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [footerText, setFooterText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState('customer');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [products, setProducts] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);

  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [modalAttachment, setModalAttachment] = useState(null);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerFormName, setCustomerFormName] = useState('');
  const [showCustomerAddOptions, setShowCustomerAddOptions] = useState(false);
  const [showOverpayModal, setShowOverpayModal] = useState(false);
  const [overpayAmount, setOverpayAmount] = useState(0);
  const [pendingOverpayAction, setPendingOverpayAction] = useState(null);

  const [showSearchModal, setShowSearchModal] = useState(false);

  const navigate = useNavigate();
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);

  const [previewHtml, setPreviewHtml] = useState('');
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [historyAutoMode, setHistoryAutoMode] = useState(
    localStorage.getItem('mobileHistoryMode') === 'on'
  );

  const loadPrintSettings = async () => {
    try {
      const data = await getPrintSettings();
      if (!data.sales.layout.columnSizes) {
        data.sales.layout.columnSizes = {};
      }
      setPrintSettings(data);

      setFooterText(data?.sales?.header?.footerMessage || '');
    } catch (err) {
      console.error('Failed to load print settings');
    } finally {
    }
  };

  const handleResetSettings = async () => {
    const confirmReset = window.confirm(t('print.resetConfirm'));

    if (!confirmReset) return;

    try {
      const resetData = await resetPrintSettings('sales');

      setPrintSettings((prev) => ({
        ...prev,
        sales: resetData,
      }));

      alert(t('print.resetSuccess'));

      generateLivePreview();
    } catch (err) {
      alert(t('print.resetFailed'));
    }
  };

  // 🔁 Invoice Navigation (Next / Previous)
  const handleInvoiceNavigation = async (direction) => {
    try {
      if (!billNo || billNo === 'Auto') return;

      const data = await navigateInvoice(billNo, direction, token);

      setEditingInvoiceFromAPI(data);

      navigate(`/create-sale?invoiceId=${data._id}`);
    } catch (err) {
      console.log('No more invoices');
    }
  };

  const blankRow = () => ({
    itemNo: '',
    search: '',
    productId: '',
    name: '',
    description: '',
    uom: '',
    cost: 0,
    quantity: '',
    rate: '',
    amount: 0,
  });

  const [items, setItems] = useState(Array.from({ length: 20 }, () => blankRow()));

  useEffect(() => {
    const handler = (e) => {
      const newProduct = e.detail;
      const cached = JSON.parse(localStorage.getItem('products') || '[]');
      localStorage.setItem('products', JSON.stringify([...cached, newProduct]));
      const rowIndex = Number(localStorage.getItem('lastCreatedProductRow'));

      if (!newProduct || rowIndex < 0) return;

      const applyUpdate = () => {
        setItems((prevItems) => {
          const updated = [...prevItems];

          const price = newProduct.salePrice || 0;

          updated[rowIndex] = {
            ...updated[rowIndex],
            search: newProduct.name,
            name: newProduct.name,
            productId: newProduct._id,
            rate: price,
            quantity: 1,
            amount: price,
          };

          return updated;
        });

        // ✅ focus Qty after UI render
        setTimeout(() => {
          const rows = document.querySelectorAll('tbody tr');
          const currentRow = rows[rowIndex];

          if (!currentRow) return;

          const qtyInput = currentRow.querySelector('input[type="number"]');

          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }, 100);
      };

      setTimeout(() => {
        applyUpdate();
      }, 150);
    };

    window.addEventListener('product-created', handler);

    return () => {
      window.removeEventListener('product-created', handler);
    };
  }, []);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);

  const [paymentType, setPaymentType] = useState('credit');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [, setCustomerLedger] = useState([]);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState(0);

  useEffect(() => {
    if (paidAmount > 0 && paymentType === 'credit') {
      setPaymentType('cash');
    }

    if (paidAmount === 0) {
      setPaymentType('credit');
      setSelectedAccountId('');
    }
  }, [paidAmount, paymentType]);

  useEffect(() => {
    setTimeout(() => {
      customerInputRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    const handler = () => {
      const mode = localStorage.getItem('mobileHistoryMode');

      if (mode === 'on' && window.innerWidth < 768) {
        setShowHistoryPopup(true);
      }
    };

    window.addEventListener('show-history', handler);
    const toggleHandler = () => {
      setHistoryAutoMode((prev) => {
        const newMode = !prev;

        if (newMode) {
          localStorage.setItem('mobileHistoryMode', 'on');
        } else {
          localStorage.setItem('mobileHistoryMode', 'off');
          setShowHistoryPopup(false);
        }

        return newMode;
      });
    };

    window.addEventListener('toggle-history-mode', toggleHandler);

    return () => {
      window.removeEventListener('show-history', handler);
      window.removeEventListener('toggle-history-mode', toggleHandler);
    };
  }, [historyAutoMode]);

  useEffect(() => {
    if (paidAmount > 0 && paymentType === 'cash' && accounts.length > 0) {
      const handCash = accounts.find((a) => a.category === 'cash');
      if (handCash) {
        setSelectedAccountId(handCash._id);
      }
    }
  }, [paidAmount, paymentType, accounts]);

  useEffect(() => {
    const now = new Date();
    const params = new URLSearchParams(location.search);
    const invoiceIdFromURL = params.get('invoiceId');

    const loadInvoice = async () => {
      // 🆕 NEW INVOICE
      if (!invoiceIdFromURL) {
        setInvoiceDate(now.toISOString().split('T')[0]);
        setInvoiceTime(now.toTimeString().slice(0, 5));

        try {
          const lastBillNo = await getLastInvoiceNo(token);
          const nextBill = parseInt(lastBillNo || 1000) + 1;
          setBillNo(nextBill.toString());
        } catch (err) {
          console.error('❌ Failed to fetch last bill number');
          setBillNo('Auto');
        }

        return;
      }

      // ✏️ EDIT MODE
      if (!canEditSales) {
        alert('You do not have permission to edit sales invoices');
        navigate('/sales-invoices');
        return;
      }

      try {
        const data = await getInvoiceById(invoiceIdFromURL, token);
        setEditingInvoiceFromAPI(data);
      } catch (err) {
        console.error('❌ Error loading invoice for editing:', err);
        alert(t('alerts.loadInvoiceFailed'));
      }
    };

    if (token) loadInvoice();
  }, [location.search, token, canEditSales, navigate]);

  useEffect(() => {
    if (!editingInvoiceFromAPI) return;

    const draftKey = `sale_edit_preview_draft_${editingInvoiceFromAPI._id}`;
    const savedDraft = sessionStorage.getItem(draftKey);

    // ✅ Preview سے واپس آئے ہیں تو عارضی تبدیلیاں بحال کریں
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);

        setBillNo(draft.billNo || editingInvoiceFromAPI.billNo);
        setInvoiceDate(draft.invoiceDate || '');
        setInvoiceTime(draft.invoiceTime || '');
        setCustomerName(draft.customerName || '');
        setCustomerPhone(draft.customerPhone || '');
        setBy(draft.by || '');

        setDiscountPercent(Number(draft.discountPercent || 0));
        setDiscountAmount(Number(draft.discountAmount || 0));
        setPaidAmount(Number(draft.paidAmount || 0));

        setPaymentType(draft.paymentType || 'credit');
        setSelectedAccountId(draft.selectedAccountId || '');

        setSelectedCustomerId(draft.selectedCustomerId || '');
        setSelectedCustomerType(draft.selectedCustomerType || 'customer');

        setOpeningBalanceAmount(Number(draft.openingBalanceAmount || 0));

        if (Array.isArray(draft.items)) {
          setItems(draft.items);
        }
      } catch (err) {
        console.error('Edit preview draft restore failed:', err);
        sessionStorage.removeItem(draftKey);
      }
    } else {
      // ✅ عام Edit Mode میں Database والا محفوظ Data
      setBillNo(editingInvoiceFromAPI.billNo);
      setInvoiceDate(editingInvoiceFromAPI.invoiceDate?.split('T')[0] || '');
      setInvoiceTime(editingInvoiceFromAPI.invoiceTime?.slice(0, 5) || '');
      setCustomerName(editingInvoiceFromAPI.customerName);
      setCustomerPhone(editingInvoiceFromAPI.customerPhone);
      setBy(editingInvoiceFromAPI.by || '');
      setPaidAmount(editingInvoiceFromAPI.paidAmount || 0);

      setDiscountAmount(editingInvoiceFromAPI.discountAmount || 0);
      setDiscountPercent(0);

      setPaymentType(editingInvoiceFromAPI.paymentType || 'credit');
      setSelectedAccountId(editingInvoiceFromAPI.accountId || '');

      if (editingInvoiceFromAPI.partyId) {
        setSelectedCustomerType('party');
        setSelectedCustomerId(editingInvoiceFromAPI.partyId);
      } else {
        setSelectedCustomerType('customer');
        setSelectedCustomerId(editingInvoiceFromAPI.customerId || '');
      }

      if (editingInvoiceFromAPI.isOpening) {
        setOpeningBalanceAmount(editingInvoiceFromAPI.totalAmount || 0);
      }
    }

    setExistingAttachments(
      (editingInvoiceFromAPI.attachments || []).map((att) => ({
        key: att.key,
        url: att.fullUrl || att.url || '',
        name: att.originalName || '',
        type: att.type || '',
        size: att.size || 0,
      }))
    );
  }, [editingInvoiceFromAPI]);
  useEffect(() => {
    if (!editingInvoiceFromAPI) return;

    const draftKey = `sale_edit_preview_draft_${editingInvoiceFromAPI._id}`;
    const savedDraft = sessionStorage.getItem(draftKey);

    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);

        if (Array.isArray(draft.items)) {
          setItems(draft.items);
          return;
        }
      } catch (err) {
        console.error('Edit preview items restore failed:', err);
        sessionStorage.removeItem(draftKey);
      }
    }

    const enrichedItems = editingInvoiceFromAPI.items.map((item, i) => {
      const matchedProduct = products.find((p) => p._id === item.productId);

      return {
        itemNo: i + 1,
        search: matchedProduct?.name || item.name || '',
        productId: item.productId || '',
        name: matchedProduct?.name || item.name || '',
        description: matchedProduct?.description || '',
        uom: matchedProduct?.uom || item.uom || '',
        cost: matchedProduct?.unitCost || 0,
        quantity: item.quantity,
        rate: item.price,
        amount: item.total,
      };
    });

    setItems([
      ...enrichedItems,
      ...Array.from({ length: Math.max(0, 20 - enrichedItems.length) }, () => blankRow()),
    ]);
  }, [editingInvoiceFromAPI, products]);
  useEffect(() => {
    if (!token) return;

    fetch(`${API}/api/customers?limit=50`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then(setCustomers);

    fetchSaleParties(token)
      .then(setParties)
      .catch((err) => console.error('Sale parties load failed:', err));
    const cachedProducts = localStorage.getItem('products');

    if (cachedProducts) {
      setProducts(JSON.parse(cachedProducts));
    }

    fetchProductsWithToken(token).then((data) => {
      setProducts(data);

      localStorage.setItem('products', JSON.stringify(data));
    });

    getValidPaymentAccounts().then((all) => {
      setAccounts(Array.isArray(all) ? all : []);
    });
  }, [token, onProductChange]);

  // 🔥 FIX: restore customerId after reload
  useEffect(() => {
    if (!customerName || customers.length === 0) return;

    const matchedCustomer = customers.find((c) => c.name === customerName);

    if (matchedCustomer) {
      onCustomerChange && onCustomerChange(matchedCustomer._id);
    }
  }, [customerName, customers, onCustomerChange]);

  const filterCustomers = (value) => {
    const query = value.toLowerCase();

    const customerList = customers
      .filter((c) => c.name?.toLowerCase().includes(query) || c.phone?.includes(query))
      .map((c) => ({
        ...c,
        selectType: 'customer',
        badge: 'Customer',
      }));

    const partyList = parties
      .filter((p) => p.name?.toLowerCase().includes(query) || p.phone?.includes(query))
      .map((p) => ({
        ...p,
        selectType: 'party',
        badge: 'Party',
      }));

    return [...customerList, ...partyList];
  };

  const debounceTimer = useRef(null);
  useEffect(() => {
    const restoreCustomerBalance = async () => {
      if (!customerName || customers.length === 0) return;

      const matchedCustomer = customers.find(
        (c) => c.name.toLowerCase() === customerName.toLowerCase()
      );

      if (!matchedCustomer) return;

      try {
        const accountId = matchedCustomer?.account?._id || matchedCustomer?.account;

        if (!accountId) return;

        const res = await getLedgerByCustomerAccount(accountId);

        const closingBalance =
          res.ledger?.length > 0 ? res.ledger[res.ledger.length - 1].runningBalance || 0 : 0;

        setCustomerBalance(closingBalance);
      } catch (err) {
        console.error('Restore balance failed', err);
      }
    };

    restoreCustomerBalance();
  }, [customerName, customers]);
  const handleCustomerInput = (e) => {
    const value = e.target.value;
    setCustomerName(value);

    clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      if (value.trim() === '') {
        setCustomerSuggestions([]);
        setSelectedCustomerIndex(-1);
        setShowCustomerAddOptions(false);
      } else {
        const filtered = filterCustomers(value);

        setCustomerSuggestions(filtered);
        setSelectedCustomerIndex(-1);

        if (customers.length > 0 && filtered.length === 0) {
          setShowCustomerAddOptions(true);
        } else {
          setShowCustomerAddOptions(false);
        }
      }
    }, 300);
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
        handleCustomerSelect(selected.name, selected.phone, selected._id, selected.selectType);

        setTimeout(() => {
          document.getElementById('customer-phone')?.focus();
        }, 0);
      }
    }
  };

  const handleCustomerSelect = async (name, phone, id, type = 'customer') => {
    setCustomerName(name);
    setCustomerPhone(phone);

    setSelectedCustomerId(id);
    setSelectedCustomerType(type);

    onCustomerChange && onCustomerChange(id);

    setCustomerSuggestions([]);
    setSelectedCustomerIndex(-1);
    setShowCustomerAddOptions(false);

    try {
      let res;

      if (type === 'party') {
        res = await getPartyLedger(id);
      } else {
        const selectedCustomer = customers.find((c) => c._id === id);

        const accountId = selectedCustomer?.account?._id || selectedCustomer?.account;

        if (!accountId) {
          setCustomerBalance(0);
          return;
        }

        res = await getLedgerByCustomerAccount(accountId);
      }

      setCustomerLedger(res.ledger || []);

      const closingBalance =
        res.ledger?.length > 0 ? res.ledger[res.ledger.length - 1].balance || 0 : 0;

      setCustomerBalance(closingBalance);
    } catch (err) {
      console.error('Customer ledger load failed', err);
      setCustomerBalance(0);
    }
  };

  const quickAddCustomer = async (name) => {
    if (!canCreateCustomer) {
      alert('You do not have permission to create customers');
      return;
    }

    try {
      const res = await fetch(`${API}/api/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || t('alerts.customerAddFailed'));
        return;
      }

      // ✅ customer set
      setCustomerName(data.name);
      setCustomerPhone(data.phone || '');

      onCustomerChange && onCustomerChange(data._id);

      // ✅ dropdown hide
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);
      setShowCustomerAddOptions(false);

      // ✅ cursor Search Item میں
      setTimeout(() => {
        const firstItemInput = document.querySelector('input[placeholder="Search Item..."]');
        firstItemInput?.focus();
      }, 0);
    } catch (err) {
      console.error(err);
      alert(t('alerts.quickAddFailed'));
    }
  };

  // 📝 Full Form open
  const openCustomerForm = (name) => {
    if (!canCreateCustomer) {
      alert('You do not have permission to create customers');
      return;
    }

    setCustomerFormName(name);
    setShowCustomerAddOptions(false);
    setCustomerSuggestions([]);
    setShowCustomerForm(true);
  };

  const handleQtyRateChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = Number(value);
    updated[index].amount = updated[index].quantity * updated[index].rate;
    setItems(updated);
  };

  const clearOnFocus = (e) => {
    if (e.target.value === '0') e.target.select();
  };

  const toggleEditable = (e, setter) => {
    const current = e.target.innerText;
    const newValue = prompt(t('common.renameField'), current);
    if (newValue !== null) setter(newValue);
  };

  const isOpeningInvoice = editingInvoiceFromAPI?.isOpening === true;

  const totalAmount = isOpeningInvoice
    ? Number(openingBalanceAmount || 0)
    : items.reduce((sum, i) => sum + i.amount, 0);

  const generateLivePreview = useCallback(async () => {
    try {
      if (!printSettings?.sales) return;

      const response = await fetch(`${API}/api/print/preview-settings-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'sales',
          settings: printSettings.sales,
          lang: localStorage.getItem('lang') || 'en',
        }),
      });

      const html = await response.text();
      setPreviewHtml(html);
    } catch (err) {
      console.error('Preview fetch failed', err);
    }
  }, [printSettings, token]);

  useEffect(() => {
    if (showPrintSettings && printSettings?.sales) {
      generateLivePreview();
    }
  }, [printSettings, showPrintSettings, generateLivePreview]);
  const finalDiscount =
    discountPercent > 0 ? (totalAmount * discountPercent) / 100 : discountAmount;
  const grandTotal = isOpeningInvoice
    ? Number(openingBalanceAmount || 0)
    : totalAmount - finalDiscount;

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);

    const totalFiles = existingAttachments.length + selectedFiles.length;

    if (totalFiles > 3) {
      alert('Maximum 3 attachments allowed');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setAttachments(selectedFiles);
  };
  const formState = {
    billNo,
    customerName,
    customerPhone,
    invoiceDate,
    invoiceTime,
    items,
    discountPercent,
    discountAmount,
    paidAmount,
    paymentType,
    selectedAccountId,
    by,
  };

  useEffect(() => {
    if (editingInvoiceFromAPI) return;

    const saved = localStorage.getItem('app_state_sale_invoice_draft');

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || !parsed.data) return;

      const data = parsed.data;

      if (!data) return;
      setBillNo(data.billNo || 'Auto');
      setCustomerName(data.customerName || '');
      setCustomerPhone(data.customerPhone || '');

      const safeDate =
        data.invoiceDate && !isNaN(new Date(data.invoiceDate))
          ? data.invoiceDate
          : new Date().toISOString().split('T')[0];

      setInvoiceDate(safeDate);
      setInvoiceTime(data.invoiceTime || '');

      setItems(data.items?.length ? data.items : Array.from({ length: 20 }, () => blankRow()));

      setDiscountPercent(data.discountPercent || 0);
      setDiscountAmount(data.discountAmount || 0);

      setPaidAmount(data.paidAmount || 0);

      setPaymentType(data.paymentType || 'credit');

      setSelectedAccountId(data.selectedAccountId || '');

      setBy(data.by || '');
    } catch (err) {
      console.error(err);
    }
  }, [editingInvoiceFromAPI]);

  const { clear } = useFormPersist(
    !editingInvoiceFromAPI ? 'sale_invoice_draft' : null,
    formState,
    () => {}
  );

  const handleClear = async () => {
    if (editingInvoiceFromAPI?._id) {
      try {
        sessionStorage.removeItem(`sale_edit_preview_draft_${editingInvoiceFromAPI._id}`);

        const freshInvoice = await getInvoiceById(editingInvoiceFromAPI._id, token);

        setItems(Array.from({ length: 20 }, () => blankRow()));

        setTimeout(() => {
          setEditingInvoiceFromAPI(freshInvoice);
        }, 0);

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        return;
      } catch (err) {
        console.error('Failed to restore invoice:', err);
        alert('Invoice restore failed');
        return;
      }
    }

    // ✅ NEW MODE → clear form
    localStorage.removeItem('app_state_sale_invoice_draft');

    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId('');
    setSelectedCustomerType('customer');
    setItems(Array.from({ length: 20 }, () => blankRow()));
    setDiscountPercent(0);
    setDiscountAmount(0);
    setPaidAmount(0);
    setPaymentType('credit');
    setSelectedAccountId('');
    setBy('');

    const now = new Date();

    setInvoiceDate(now.toISOString().split('T')[0]);
    setInvoiceTime(now.toTimeString().slice(0, 5));

    setAttachments([]);

    setShowAttachmentModal(false);
    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleSubmit = async (e, mode = 'close', skipOverpayCheck = false) => {
    e.preventDefault();

    if (editingInvoiceFromAPI && !canEditSales) {
      alert('You do not have permission to edit sales invoices');
      return;
    }

    if (!editingInvoiceFromAPI && !canCreateSales) {
      alert('You do not have permission to create sales invoices');
      return;
    }

    if (saveLoading) return;

    setSaveLoading(true);

    if (!customerName.trim()) {
      alert(t('alerts.customerRequired'));
      setSaveLoading(false);
      return;
    }

    if (!invoiceDate || isNaN(new Date(invoiceDate))) {
      alert('Invalid invoice date');
      return;
    }

    const mappedItems = items
      .filter((i) => i.quantity > 0 && i.rate > 0)
      .map((i) => ({
        productId: i.productId || null,
        quantity: i.quantity,
        price: i.rate,
        total: i.quantity * i.rate,
      }));

    if (mappedItems.length === 0 && !isOpeningInvoice) {
      alert('Please add at least one item');
      setSaveLoading(false);
      return;
    }
    const remaining = grandTotal - paidAmount;

    if (remaining < 0 && !skipOverpayCheck) {
      setOverpayAmount(Math.abs(remaining));
      setPendingOverpayAction(mode);
      setShowOverpayModal(true);
      setSaveLoading(false);
      return false;
    }

    if (paidAmount > 0) {
      // payment type required
      if (!paymentType) {
        alert(t('alerts.selectPaymentType'));
        setSaveLoading(false);
        return;
      }

      // credit not allowed when paid amount exists
      if (paymentType === 'credit') {
        alert(t('alerts.creditNotAllowed'));
        setSaveLoading(false);
        return;
      }

      // cash has auto account, others need manual account
      if (paymentType !== 'cash' && !selectedAccountId) {
        alert(t('alerts.selectAccount'));
        setSaveLoading(false);
        return;
      }
    }

    const formData = new FormData();

    formData.append('invoiceDate', invoiceDate);
    formData.append('invoiceTime', invoiceTime);
    formData.append('customerName', customerName);
    formData.append('customerPhone', customerPhone);
    formData.append('by', by);
    if (selectedCustomerType === 'party') {
      formData.append('partyId', selectedCustomerId);
    } else {
      formData.append('customerId', selectedCustomerId);
    }
    const finalOpeningAmount = isOpeningInvoice ? Number(openingBalanceAmount || 0) : grandTotal;
    formData.append('totalAmount', finalOpeningAmount);

    formData.append('subTotal', isOpeningInvoice ? Number(openingBalanceAmount || 0) : totalAmount);

    formData.append('discountPercent', discountPercent);
    formData.append('discountAmount', finalDiscount);

    formData.append(
      'grandTotal',
      isOpeningInvoice ? Number(openingBalanceAmount || 0) : grandTotal
    );
    formData.append('paidAmount', paidAmount);
    formData.append('lang', localStorage.getItem('lang') || 'en');

    // ✅ FINAL paymentType decision
    const finalPaymentType = paidAmount > 0 ? paymentType : 'credit';

    formData.append('paymentType', finalPaymentType);

    // ✅ Only send accountId if paymentType demands it
    if (paidAmount > 0 && paymentType !== 'credit' && selectedAccountId) {
      formData.append('accountId', selectedAccountId);
    }

    if (editingInvoiceFromAPI) {
      formData.append(
        'keepAttachmentKeys',
        JSON.stringify(existingAttachments.map((att) => att.key))
      );
    }

    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    formData.append('items', JSON.stringify(mappedItems));

    if (isOpeningInvoice) {
      formData.append('isOpening', true);
    }

    try {
      if (editingInvoiceFromAPI) {
        await updateInvoice(editingInvoiceFromAPI._id, formData, token);

        sessionStorage.removeItem(`sale_edit_preview_draft_${editingInvoiceFromAPI._id}`);
      } else {
        const response = await createInvoice(formData, token);

        if (response?.invoice?.billNo) {
          setBillNo(response.invoice.billNo);
        }
      }

      if (onSuccess) {
        await onSuccess();
      }

      clear();

      if (mode === 'print') {
        return true;
      }

      if (mode === 'new') {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        // ✅ Edit Mode ختم کریں
        setEditingInvoiceFromAPI(null);

        // ✅ پرانی invoiceId URL سے ہٹائیں
        navigate('/create-sale', { replace: true });

        setBillNo('Auto');
        setInvoiceDate(today);
        setInvoiceTime(currentTime);

        setCustomerName('');
        setCustomerPhone('');
        setSelectedCustomerId('');
        setSelectedCustomerType('customer');
        setBy('');

        setItems(Array.from({ length: 20 }, () => blankRow()));

        setDiscountPercent(0);
        setDiscountAmount(0);
        setPaidAmount(0);

        setPaymentType('credit');
        setSelectedAccountId('');

        setAttachments([]);
        setExistingAttachments([]);

        setShowAttachmentModal(false);
        setModalAttachment(null);

        clear();

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        setTimeout(() => {
          customerInputRef.current?.focus();
        }, 100);
      } else {
        navigate('/dashboard');
      }
      return true;
    } catch (err) {
      console.error('Save error:', err);
      alert(t('alerts.invoiceSaveFailed'));
      return false;
    } finally {
      setSaveLoading(false);
    }
  };

  if (!token) return <p className="text-red-600 p-4">{t('alerts.loginFirst')}</p>;

  return (
    <>
      <form
        onSubmit={(e) => handleSubmit(e)}
        className="max-w-6xl mx-auto p-2 md:p-3 bg-white rounded shadow space-y-2 text-xs md:text-sm"
      >
        <div ref={printRef} id="print-section">
          {/* 🧾 Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-2xl font-bold">{t('saleInvoice')}</h2>

            <div className="flex flex-wrap items-center gap-1 md:gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={t('billNo')}
                  value={billNo || 'Auto'}
                  readOnly
                  className="border px-2 py-1 h-8 w-full text-sm bg-gray-100"
                />

                {canViewCost && (
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={hideCost}
                      onChange={(e) => setHideCost(e.target.checked)}
                    />
                    Hide Cost
                  </label>
                )}
              </div>

              {/* ⚙️ Settings Icon */}
              {canManagePrintSettings && (
                <button
                  type="button"
                  onClick={async () => {
                    await loadPrintSettings();
                    setShowPrintSettings(true);
                  }}
                  className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
                >
                  ⚙️
                </button>
              )}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-history-mode'))}
                className={`px-3 py-1 border rounded ${
                  historyAutoMode ? 'bg-green-500 text-white' : 'bg-gray-200'
                }`}
              >
                📖
              </button>

              {/* Previous */}
              {canViewSales && (
                <>
                  <button
                    type="button"
                    onClick={() => handleInvoiceNavigation('previous')}
                    className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
                  >
                    ⬅️
                  </button>

                  {/* Next */}
                  <button
                    type="button"
                    onClick={() => handleInvoiceNavigation('next')}
                    className="px-2 md:px-3 py-1 border rounded bg-gray-100 hover:bg-gray-200 text-xs md:text-sm"
                  >
                    ➡️
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 🔹 All 5 fields in ONE ROW */}
          <div className="grid grid-cols-12 md:grid-cols-12 gap-2 items-start">
            <div className="col-span-4 relative">
              <input
                ref={customerInputRef}
                type="text"
                placeholder={t('customerName')}
                value={customerName}
                onChange={handleCustomerInput}
                onKeyDown={handleCustomerKeyDown}
                className="border px-2 py-1 h-8 md:h-9 w-full text-xs md:text-sm"
                autoComplete="off"
              />

              {customerSuggestions.length > 0 && (
                <ul
                  className="absolute left-0 md:left-0 right-0 md:right-0 w-[95vw] md:w-full bg-white border mt-1 max-h-72 overflow-auto shadow-lg"
                  style={{ zIndex: 9999 }}
                >
                  {customerSuggestions.map((c, i) => (
                    <li
                      key={i}
                      onMouseDown={() => handleCustomerSelect(c.name, c.phone, c._id, c.selectType)}
                      onTouchStart={() =>
                        handleCustomerSelect(c.name, c.phone, c._id, c.selectType)
                      }
                      className={`px-2 py-2 cursor-pointer ${
                        selectedCustomerIndex === i ? 'bg-blue-100 font-bold' : ''
                      }`}
                    >
                      {c.name} – {c.phone} {c.badge === 'Party' ? '🟣 Party' : ''}
                    </li>
                  ))}
                </ul>
              )}
              {canCreateCustomer &&
                showCustomerAddOptions &&
                customerSuggestions.length === 0 &&
                customerName.trim() !== '' && (
                  <ul
                    className="absolute left-0 md:left-0 right-0 md:right-0 w-[95vw] md:w-full bg-white border mt-1 shadow-lg"
                    style={{ zIndex: 9999 }}
                  >
                    <li
                      onPointerDown={(e) => {
                        e.preventDefault();
                        quickAddCustomer(customerName);
                      }}
                      className="px-2 py-2 cursor-pointer hover:bg-green-100 text-green-600 font-semibold"
                    >
                      ➕ Quick add "{customerName}"
                    </li>

                    <li
                      onPointerDown={(e) => {
                        e.preventDefault();
                        openCustomerForm(customerName);
                      }}
                      className="px-2 py-2 cursor-pointer hover:bg-blue-100 text-blue-600"
                    >
                      📝 Add with details
                    </li>
                  </ul>
                )}
            </div>

            {/* Phone – زیادہ چوڑا */}
            <div className="col-span-3">
              <input
                id="customer-phone"
                type="text"
                placeholder={t('phone')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="border px-2 py-1 h-8 md:h-9 w-full text-xs md:text-sm"
              />
            </div>

            {/* Bill No – کم چوڑا */}
            <div className="col-span-2">
              <input
                type="text"
                placeholder={t('invoice.by')}
                value={by}
                onChange={(e) => setBy(e.target.value)}
                className="border px-2 py-1 h-8 text-sm w-40"
              />
            </div>

            {/* Date – کم چوڑا */}
            <div className="col-span-2">
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="border px-2 py-1 h-8 w-full text-xs md:text-sm"
              />
            </div>

            {/* Time – سب سے کم چوڑا */}
            <div className="col-span-1">
              <input
                type="text"
                placeholder={t('time')}
                value={invoiceTime}
                onChange={(e) => setInvoiceTime(e.target.value)}
                className="border px-2 py-1 h-8 w-full text-xs md:text-sm"
              />
            </div>
          </div>
          {isOpeningInvoice && (
            <div className="mb-2 px-3 py-2 rounded bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-semibold">
              ⚠️ Opening Balance Entry Invoice
            </div>
          )}

          {isOpeningInvoice && (
            <div className="mb-3 p-3 border rounded bg-blue-50">
              <label className="block text-sm font-semibold mb-2">Opening Balance Amount</label>

              <input
                type="text"
                inputMode="decimal"
                value={openingBalanceAmount}
                onChange={(e) => setOpeningBalanceAmount(e.target.value)}
                className="border px-3 py-2 w-64 rounded no-spinner"
              />
            </div>
          )}

          {!isOpeningInvoice && (
            <div className="mb-0">
              <InvoiceTable
                items={items}
                setItems={setItems}
                products={products}
                handleQtyRateChange={handleQtyRateChange}
                clearOnFocus={clearOnFocus}
                onProductChange={onProductChange}
                historyAutoMode={historyAutoMode}
                hideCost={!canViewCost || hideCost}
              />
            </div>
          )}

          {/* Totals + Buttons */}
          <div className="bg-gray-100 p-3 md:p-4 rounded mt-4 text-xs md:text-sm">
            <div className="grid grid-cols-12 gap-3 md:gap-6 items-start">
              {/* 🔹 LEFT SIDE */}
              <div className="col-span-8 flex flex-col gap-2">
                {/* Discount / Payment / Attachment */}
                {!isOpeningInvoice && (
                  <div className="flex gap-3 items-center flex-wrap">
                    {/* Discount % */}
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t('discountPercent')}
                      value={discountPercent === 0 ? '' : discountPercent}
                      onChange={(e) => {
                        setDiscountPercent(+e.target.value || 0);
                        setDiscountAmount(0);
                      }}
                      className="border px-2 py-0 text-sm h-8 w-28 appearance-none"
                    />

                    {/* Discount Amount */}
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t('discountRS')}
                      value={discountAmount === 0 ? '' : discountAmount}
                      onChange={(e) => {
                        setDiscountAmount(+e.target.value || 0);
                        setDiscountPercent(0);
                      }}
                      className="border px-2 py-0 text-sm h-8 w-28 appearance-none"
                    />

                    {canReceiveSalesPayment && (
                      <>
                        {/* Paid Amount */}
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder={t('amount')}
                          value={paidAmount === 0 ? '' : paidAmount}
                          onChange={(e) => setPaidAmount(+e.target.value || 0)}
                          className="border px-2 py-0 text-sm h-8 w-24 appearance-none"
                        />

                        {/* Payment Type */}
                        <select
                          className="border px-2 py-1 h-8 text-sm cursor-pointer"
                          value={paymentType}
                          onChange={(e) => {
                            setPaymentType(e.target.value);
                            setSelectedAccountId('');
                          }}
                        >
                          <option value="cash">{t('payment.cash')}</option>

                          <option value="online">{t('payment.online')}</option>
                          <option value="cheque">{t('payment.cheque')}</option>
                        </select>

                        {/* Account dropdown صرف تب */}
                        {paidAmount > 0 && (
                          <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="border px-2 py-1 h-8 w-32 cursor-pointer"
                          >
                            <option value="">{t('account')}</option>

                            {accounts.map((acc) => (
                              <option key={acc._id} value={acc._id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}

                    {/* Attachment + Preview + Remove */}
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple
                        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                        className="border px-2 py-0 text-sm h-8 w-28 relative z-10"
                      />

                      {existingAttachments.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {existingAttachments.map((att, index) => (
                            <div key={att.key || index} className="flex items-center gap-1 text-xs">
                              <span className="text-blue-600">📎 File {index + 1}</span>

                              <button
                                type="button"
                                onClick={() => {
                                  setModalAttachment(att);
                                  setShowAttachmentModal(true);
                                }}
                                className="text-green-600 underline"
                              >
                                👁 View
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Remove this attachment?')) {
                                    setExistingAttachments((prev) =>
                                      prev.filter((_, i) => i !== index)
                                    );
                                  }
                                }}
                                className="text-red-500"
                              >
                                ✖
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {attachments.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {attachments.map((file, index) => (
                            <div key={index} className="flex items-center gap-1 text-xs">
                              <span className="text-blue-600">📎 New {index + 1}</span>

                              <button
                                type="button"
                                onClick={() => {
                                  setModalAttachment({
                                    url: URL.createObjectURL(file),
                                    name: file.name,
                                    type: file.type,
                                  });
                                  setShowAttachmentModal(true);
                                }}
                                className="text-green-600 underline"
                              >
                                👁 View
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setAttachments((prev) => prev.filter((_, i) => i !== index));
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="text-red-500"
                              >
                                ✖
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-wrap gap-2 md:gap-3 no-print mt-6 md:mt-8">
                  {((editingInvoiceFromAPI && canEditSales) ||
                    (!editingInvoiceFromAPI && canCreateSales)) && (
                    <>
                      <button
                        type="submit"
                        disabled={saveLoading}
                        className={`text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm ${
                          saveLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600'
                        }`}
                      >
                        {saveLoading
                          ? '⏳ Saving...'
                          : editingInvoiceFromAPI
                            ? t('updateClose')
                            : t('saveClose')}
                      </button>

                      <button
                        type="button"
                        disabled={saveLoading}
                        onClick={(e) => handleSubmit(e, 'new')}
                        className={`text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm ${
                          saveLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600'
                        }`}
                      >
                        {saveLoading ? '⏳ Saving...' : t('saveNew')}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleClear}
                    className="bg-gray-500 text-white px-3 py-1.5 md:px-4 md:py-2 rounded text-xs md:text-sm"
                  >
                    {editingInvoiceFromAPI ? t('common.revert') : t('clear')}
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 👁️ PREVIEW */}
                    {canPrintSales && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const previewItems = items
                              .filter((i) => i.productId && i.quantity > 0)
                              .map((i) => ({
                                productId: i.productId,
                                name: i.name,
                                description: i.description,
                                uom: i.uom,
                                quantity: i.quantity,
                                price: i.rate,
                                total: i.amount,
                              }));

                            // ✅ Edit Mode کی عارضی تبدیلیاں Preview سے پہلے محفوظ کریں
                            if (editingInvoiceFromAPI?._id) {
                              sessionStorage.setItem(
                                `sale_edit_preview_draft_${editingInvoiceFromAPI._id}`,
                                JSON.stringify({
                                  billNo,
                                  invoiceDate,
                                  invoiceTime,
                                  customerName,
                                  customerPhone,
                                  by,
                                  items,
                                  discountPercent,
                                  discountAmount,
                                  paidAmount,
                                  paymentType,
                                  selectedAccountId,
                                  selectedCustomerId,
                                  selectedCustomerType,
                                  openingBalanceAmount,
                                })
                              );
                            }

                            navigate(`/print/sale/preview`, {
                              state: {
                                isPreview: true,
                                type: 'sale',
                                invoiceData: {
                                  lang: localStorage.getItem('lang'),
                                  invoiceDate,
                                  invoiceTime,
                                  billNo,
                                  customerName: customerName || '-',
                                  customerPhone: customerPhone || '',
                                  by,
                                  items: previewItems,
                                  totalAmount,
                                  discountAmount: finalDiscount,
                                  grandTotal,
                                  paidAmount,
                                  paymentType,
                                  customerTotalBalance: editingInvoiceFromAPI
                                    ? customerBalance -
                                      ((editingInvoiceFromAPI.totalAmount || 0) -
                                        (editingInvoiceFromAPI.paidAmount || 0)) +
                                      (grandTotal - paidAmount)
                                    : customerBalance + (grandTotal - paidAmount),
                                },
                              },
                            });
                          }}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm shadow-md"
                        >
                          👁️ {t('preview')}
                        </button>

                        {/* 🖨️ PRINT */}
                        <button
                          type="button"
                          disabled={saveLoading}
                          onClick={async (e) => {
                            if (saveLoading) return;

                            // ✅ پہلے print data تیار کریں
                            const previewItems = items
                              .filter((i) => i.productId && i.quantity > 0)
                              .map((i) => ({
                                productId: i.productId,
                                name: i.name,
                                description: i.description,
                                uom: i.uom,
                                quantity: i.quantity,
                                price: i.rate,
                                total: i.amount,
                              }));

                            const printData = {
                              lang: localStorage.getItem('lang'),
                              invoiceDate,
                              invoiceTime,
                              billNo,
                              customerName: customerName || '-',
                              customerPhone: customerPhone || '',
                              by,
                              items: previewItems,
                              totalAmount,
                              discountAmount: finalDiscount,
                              grandTotal,
                              paidAmount,
                              paymentType,
                              customerTotalBalance: editingInvoiceFromAPI
                                ? customerBalance -
                                  ((editingInvoiceFromAPI.totalAmount || 0) -
                                    (editingInvoiceFromAPI.paidAmount || 0)) +
                                  (grandTotal - paidAmount)
                                : customerBalance + (grandTotal - paidAmount),
                            };

                            const saved = await handleSubmit(e, 'print');

                            if (!saved) return;

                            navigate(`/print/sale/preview`, {
                              replace: true,
                              state: {
                                autoPrint: true,
                                isPreview: true,
                                type: 'sale',
                                invoiceData: printData,
                              },
                            });
                          }}
                          className={`text-white px-4 py-2 rounded text-sm shadow-md ${
                            saveLoading
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                        >
                          {saveLoading ? '⏳ Saving...' : `🖨️ ${t('print')}`}
                        </button>
                        {/* 📄 PDF */}
                        <button
                          type="button"
                          disabled={pdfLoading}
                          onClick={async () => {
                            try {
                              setPdfLoading(true);
                              const token = localStorage.getItem('token');
                              let res;

                              const previewItems = items
                                .filter((i) => i.productId && i.quantity > 0)
                                .map((i) => ({
                                  productId: i.productId,
                                  name: i.name,
                                  description: i.description,
                                  uom: i.uom,
                                  quantity: i.quantity,
                                  price: i.rate,
                                  total: i.amount,
                                }));

                              const payload = {
                                lang: localStorage.getItem('lang'),
                                invoiceDate,
                                invoiceTime,
                                billNo,
                                customerName: customerName || '-',
                                customerPhone: customerPhone || '',
                                by,
                                items: previewItems,
                                totalAmount,
                                discountAmount: finalDiscount,
                                grandTotal,
                                paidAmount,
                                paymentType,
                                customerTotalBalance: editingInvoiceFromAPI
                                  ? customerBalance -
                                    ((editingInvoiceFromAPI.totalAmount || 0) -
                                      (editingInvoiceFromAPI.paidAmount || 0)) +
                                    (grandTotal - paidAmount)
                                  : customerBalance + (grandTotal - paidAmount),
                              };

                              if (editingInvoiceFromAPI?._id) {
                                res = await fetch(
                                  `${API}/api/print/sale-pdf/${editingInvoiceFromAPI._id}`,
                                  {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                    },
                                  }
                                );
                              } else {
                                res = await fetch(`${API}/api/print/sale-pdf`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify(payload),
                                });
                              }

                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);

                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `Invoice-${billNo || 'Preview'}.pdf`;

                              document.body.appendChild(a);
                              a.click();
                              a.remove();

                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              alert(t('alerts.pdfFailed'));
                            } finally {
                              setPdfLoading(false);
                            }
                          }}
                          className={`text-white px-4 py-2 rounded text-sm shadow-md ${
                            pdfLoading
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {pdfLoading ? `⏳ ${t('pdf.preparing')}` : `📄 ${t('pdf.download')}`}
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSearchModal(true)}
                    className="
    flex items-center gap-2
    px-4 py-2
    rounded-lg
    bg-blue-50 text-blue-700
    border border-blue-200
    hover:bg-blue-600 hover:text-white
    transition-all duration-200
    text-sm font-medium
    shadow-sm hover:shadow-md
  "
                  >
                    🔍 <span>{t('findInvoice')}</span>
                  </button>
                </div>
              </div>

              {/* 🔹 RIGHT SIDE – Totals */}
              <div className="col-span-4 text-right space-y-1">
                <p>
                  {t('total')}: Rs. {totalAmount.toFixed(2)}
                </p>
                <p>
                  {t('discount')}: Rs. {finalDiscount.toFixed(2)}
                </p>
                <p className="text-xl font-bold">
                  {t('netTotal')}: Rs. {grandTotal.toFixed(2)}
                </p>
                <p>
                  {t('paid')}: Rs. {paidAmount.toFixed(2)}
                </p>
                <p className="text-red-600 font-semibold">
                  {t('remaining')}: Rs. {(grandTotal - paidAmount).toFixed(2)}
                </p>
                {printSettings?.sales?.settings?.showCustomerTotalBalance !== false && (
                  <p className="text-blue-600 font-semibold">
                    {t('customerTotalBalance')}: Rs.{' '}
                    {(editingInvoiceFromAPI
                      ? customerBalance -
                        ((editingInvoiceFromAPI.totalAmount || 0) -
                          (editingInvoiceFromAPI.paidAmount || 0)) +
                        (grandTotal - paidAmount)
                      : customerBalance + (grandTotal - paidAmount)
                    ).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer Text */}
          <div
            className="mt-4 text-center italic text-sm text-gray-500 cursor-pointer"
            onDoubleClick={(e) => toggleEditable(e, setFooterText)}
          >
            {footerText}
          </div>
        </div>
        {showSearchModal && (
          <InvoiceSearchModal
            onClose={() => setShowSearchModal(false)}
            onSelect={(invoice) => {
              setShowSearchModal(false);

              // 🔁 Sale Invoice edit mode

              navigate(`/create-sale?invoiceId=${invoice._id}`);
            }}
          />
        )}
        {showOverpayModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-96 animate-scaleIn">
              <h3 className="text-lg font-bold text-yellow-600 mb-3">{t('invoice.overpayment')}</h3>

              <p className="text-sm text-gray-700 mb-4">{t('invoice.overpaymentMessage')}</p>

              <p className="text-sm font-semibold text-green-600 mb-6">
                Extra Rs. {overpayAmount.toFixed(2)} {t('invoice.adjustPrevious')}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowOverpayModal(false);
                    setPendingOverpayAction(null);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  {t('cancel')}
                </button>

                <button
                  type="button"
                  onClick={async (e) => {
                    const action = pendingOverpayAction || 'close';

                    setShowOverpayModal(false);
                    setPendingOverpayAction(null);

                    if (action === 'print') {
                      const previewItems = items
                        .filter((i) => i.productId && i.quantity > 0)
                        .map((i) => ({
                          productId: i.productId,
                          name: i.name,
                          description: i.description,
                          uom: i.uom,
                          quantity: i.quantity,
                          price: i.rate,
                          total: i.amount,
                        }));

                      const printData = {
                        lang: localStorage.getItem('lang'),
                        invoiceDate,
                        invoiceTime,
                        billNo,
                        customerName: customerName || '-',
                        customerPhone: customerPhone || '',
                        by,
                        items: previewItems,
                        totalAmount,
                        discountAmount: finalDiscount,
                        grandTotal,
                        paidAmount,
                        paymentType,
                        customerTotalBalance: editingInvoiceFromAPI
                          ? customerBalance -
                            ((editingInvoiceFromAPI.totalAmount || 0) -
                              (editingInvoiceFromAPI.paidAmount || 0)) +
                            (grandTotal - paidAmount)
                          : customerBalance + (grandTotal - paidAmount),
                      };

                      const saved = await handleSubmit(e, 'print', true);

                      if (!saved) return;

                      navigate(`/print/sale/preview`, {
                        replace: true,
                        state: {
                          autoPrint: true,
                          isPreview: true,
                          type: 'sale',
                          invoiceData: printData,
                        },
                      });

                      return;
                    }

                    await handleSubmit(e, action, true);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {t('continue')}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
      {canManagePrintSettings && showPrintSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg w-[98vw] h-[96vh] overflow-hidden flex gap-4">
            {/* LEFT SIDE — SETTINGS */}
            <div className="w-[32%] space-y-4 text-sm overflow-y-auto pr-2">
              <h3 className="text-lg font-bold">{t('print.salesSettings')}</h3>

              {/* HEADER */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.header')}</h4>

                <input
                  type="text"
                  placeholder={t('print.companyName')}
                  className="border w-full px-2 py-1"
                  value={printSettings?.sales?.header?.companyName || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          companyName: e.target.value,
                        },
                      },
                    })
                  }
                />
                {/* Company Address */}
                <input
                  type="text"
                  placeholder={t('print.companyAddress')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.address || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          address: e.target.value,
                        },
                      },
                    })
                  }
                />

                {/* Company Phone */}
                <input
                  type="text"
                  placeholder={t('print.companyPhone')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.phone || ''}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          phone: e.target.value,
                        },
                      },
                    })
                  }
                />

                <textarea
                  placeholder={t('print.footerMessage')}
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.header.footerMessage}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        header: {
                          ...printSettings.sales.header,
                          footerMessage: e.target.value,
                        },
                      },
                    })
                  }
                />
              </div>

              {/* COLUMN VISIBILITY */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.columnVisibility')}</h4>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showDescription}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showDescription: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showDescription')}
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showUOM}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showUOM: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showUom')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showBy ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showBy: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {t('print.showBy')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showFooter ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showFooter: e.target.checked,
                          },
                        },
                      })
                    }
                  />

                  {t('print.showFooter')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showCustomerTotalBalance ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showCustomerTotalBalance: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  Show Customer Total Balance
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printSettings.sales.settings.showNetTotal ?? true}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          settings: {
                            ...printSettings.sales.settings,
                            showNetTotal: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  Show Net Total
                </label>
              </div>

              {/* LAYOUT */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('print.layout')}</h4>
                {/* PAGE SIZE (A4 / A5 / LANDSCAPE) */}
                <div className="space-y-2">
                  <h4 className="font-semibold">Page Size</h4>

                  <select
                    className="border w-full px-2 py-1"
                    value={printSettings.sales.layout.pageWidth || 'standard'}
                    onChange={(e) => {
                      let value = e.target.value;
                      setPrintSettings({
                        ...printSettings,
                        sales: {
                          ...printSettings.sales,
                          layout: {
                            ...printSettings.sales.layout,
                            pageWidth: value,
                          },
                        },
                      });
                    }}
                  >
                    <option value="standard">A4</option>
                    <option value="narrow">A5</option>
                    <option value="thermal">Thermal</option>
                  </select>
                </div>

                <select
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.layout.headerSize}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
                          headerSize: e.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="compact">{t('print.headerCompact')}</option>
                  <option value="normal">{t('print.headerNormal')}</option>
                  <option value="spacious">{t('print.headerSpacious')}</option>
                </select>

                <select
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.layout.rowHeight}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
                          rowHeight: e.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="small">{t('print.rowSmall')}</option>
                  <option value="medium">{t('print.rowMedium')}</option>
                  <option value="large">{t('print.rowLarge')}</option>
                </select>

                <select
                  className="border w-full px-2 py-1"
                  value={printSettings.sales.layout.footerSize}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      sales: {
                        ...printSettings.sales,
                        layout: {
                          ...printSettings.sales.layout,
                          footerSize: e.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="compact">{t('print.footerCompact')}</option>
                  <option value="normal">{t('print.footerNormal')}</option>
                  <option value="spacious">{t('print.footerSpacious')}</option>
                </select>
              </div>
              {/* COLUMN WIDTHS */}
              <div className="space-y-2 mt-4">
                <h4 className="font-semibold">{t('print.columnWidth')}</h4>

                {['name', 'description', 'uom', 'quantity', 'price', 'total'].map((field) => (
                  <div key={field} className="flex justify-between items-center gap-2">
                    <label className="capitalize w-1/2">{field}</label>

                    <select
                      className="border px-2 py-1 w-1/2"
                      value={printSettings.sales.layout.columnSizes?.[field] || 'medium'}
                      onChange={(e) =>
                        setPrintSettings({
                          ...printSettings,
                          sales: {
                            ...printSettings.sales,
                            layout: {
                              ...printSettings.sales.layout,
                              columnSizes: {
                                ...printSettings.sales.layout.columnSizes,
                                [field]: e.target.value,
                              },
                            },
                          },
                        })
                      }
                    >
                      <option value="small">{t('print.small')}</option>
                      <option value="compact">{t('print.compact')}</option>
                      <option value="medium">{t('print.medium')}</option>
                      <option value="large">{t('print.large')}</option>
                    </select>
                  </div>
                ))}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-2 pt-3">
                <button
                  onClick={async () => {
                    try {
                      await updatePrintSettings('sales', {
                        header: printSettings.sales.header,
                        settings: printSettings.sales.settings,
                        layout: printSettings.sales.layout,
                      });

                      alert(t('print.settingsSaved'));
                      setShowPrintSettings(false);
                    } catch (err) {
                      alert(t('print.settingsSaveFailed'));
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded w-1/2"
                >
                  {t('print.saveSettings')}
                </button>
                <button
                  onClick={handleResetSettings}
                  className="px-4 py-2 bg-yellow-500 text-white rounded w-1/2"
                >
                  {t('print.resetDefault')}
                </button>

                <button
                  onClick={() => setShowPrintSettings(false)}
                  className="px-4 py-2 bg-red-500 text-white rounded w-1/2"
                >
                  {t('close')}
                </button>
              </div>
            </div>

            {/* RIGHT SIDE — LIVE PREVIEW */}
            <div className="w-[68%] bg-gray-100 p-2 overflow-auto h-full flex justify-center">
              <div className="bg-white shadow" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
      {showHistoryPopup && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md pointer-events-none">
          <div className="bg-white border rounded-lg shadow-xl p-3 pointer-events-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">{t('sales.previous')}</h3>

              <button onClick={() => setShowHistoryPopup(false)} className="text-red-500 text-sm">
                ✖
              </button>
            </div>

            {loadingHistory && <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>}

            {!loadingHistory && salesHistory.length === 0 && (
              <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
            )}

            {salesHistory.length > 0 && (
              <ul className="space-y-2 text-sm mt-2 max-h-28 overflow-auto">
                {salesHistory.map((h) => {
                  const safeDate = h.invoiceDate
                    ? new Date(h.invoiceDate).toLocaleDateString()
                    : h.createdAt
                      ? new Date(h.createdAt).toLocaleDateString()
                      : 'N/A';

                  return (
                    <li key={h._id} className="border rounded p-2 bg-gray-50">
                      <div className="text-xs text-gray-600">
                        {safeDate} | Bill #{h.billNo}
                      </div>

                      <div className="font-semibold text-gray-800">Rs. {h.rate}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {showAttachmentModal && modalAttachment && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2 border-b">
              <div className="text-sm font-semibold text-gray-700 truncate">
                📎 Attachment Preview
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAttachmentModal(false);
                  setModalAttachment(null);
                }}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm"
              >
                ✖ Close
              </button>
            </div>

            <div className="p-3 flex items-center justify-center bg-gray-100 max-h-[80vh] overflow-auto">
              {modalAttachment.type?.includes('pdf') ? (
                <iframe
                  src={modalAttachment.url}
                  title="Attachment PDF"
                  className="w-full h-[75vh] bg-white border rounded"
                />
              ) : (
                <img
                  src={modalAttachment.url}
                  alt="Attachment"
                  className="max-w-full max-h-[75vh] object-contain rounded border bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
      {canCreateCustomer && showCustomerForm && (
        <CustomerForm
          initialData={{ name: customerFormName }}
          onSubmit={async (data) => {
            await fetch(`${API}/api/customers`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(data),
            });

            setCustomerName(data.name);
            setCustomerPhone(data.phone || '');

            onCustomerChange && onCustomerChange(data._id);

            setShowCustomerForm(false);
            setShowCustomerAddOptions(false);

            // cursor Search Item میں
            setTimeout(() => {
              const firstItemInput = document.querySelector('input[placeholder="Search Item..."]');
              firstItemInput?.focus();
            }, 0);
          }}
          onCancel={() => {
            setShowCustomerForm(false);
            setShowCustomerAddOptions(false);
          }}
        />
      )}
    </>
  );
};

export default InvoiceForm;
