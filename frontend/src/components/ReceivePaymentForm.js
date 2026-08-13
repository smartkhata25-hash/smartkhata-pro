// src/components/ReceivePaymentForm.js

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createReceivePayment,
  updateReceivePayment,
  getReceivePaymentById,
} from '../services/receivePaymentService';
import { getValidPaymentAccounts } from '../services/accountService';
import { fetchCustomers } from '../services/customerService';
import { getLedgerByCustomerAccount } from '../services/customerLedgerService';
import { fetchSaleParties } from '../services/partyService';
import { getPartyLedger } from '../services/partyLedgerService';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { t, getCurrentLanguage } from '../i18n/i18n';
import useFormPersist from '../hooks/useFormPersist';
import { hasPermission } from '../utils/permissionHelper';
import AttachmentViewerModal from './AttachmentViewerModal';
import './ReceivePaymentForm.css';

const ReceivePaymentForm = () => {
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState('customer');
  const [accounts, setAccounts] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerLedger, setCustomerLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [modalAttachment, setModalAttachment] = useState(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const printRef = useRef();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    customer: '',
    partyId: '',
    date: dayjs().format('YYYY-MM-DD'),
    time: dayjs().format('HH:mm'),
    amount: '',
    paymentType: 'Cash',
    discountAmount: '',
    account: '',
    description: '',
    attachments: [],
  });
  const [printSize, setPrintSize] = useState(localStorage.getItem('receivePrintSize') || 'narrow');
  const [paymentEntries, setPaymentEntries] = useState([
    { account: '', amount: '', paymentType: 'Cash' },
  ]);

  const navigate = useNavigate();
  const { id } = useParams();
  const canViewReceivePayments = hasPermission('receive_payments.view');
  const canCreateReceivePayments = hasPermission('receive_payments.create');
  const canEditReceivePayments = hasPermission('receive_payments.edit');

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // ✅ Customers Cache
    try {
      const cachedCustomers = localStorage.getItem('customers');

      if (cachedCustomers) {
        const parsed = JSON.parse(cachedCustomers);

        if (Array.isArray(parsed)) {
          setCustomers(parsed);
        }
      }
    } catch (err) {
      console.error(err);
    }

    // ✅ Parties Cache
    try {
      const cachedParties = localStorage.getItem('saleParties');

      if (cachedParties) {
        const parsed = JSON.parse(cachedParties);

        if (Array.isArray(parsed)) {
          setParties(parsed);
        }
      }
    } catch (err) {
      console.error(err);
    }

    // ✅ Accounts Cache
    try {
      const cachedAccounts = localStorage.getItem('paymentAccounts');

      if (cachedAccounts) {
        const parsed = JSON.parse(cachedAccounts);

        if (Array.isArray(parsed)) {
          setAccounts(parsed);
        }
      }
    } catch (err) {
      console.error(err);
    }

    const normalizePaymentType = (value) => {
      const type = String(value || 'cash').toLowerCase();

      if (type === 'online') return 'Online';
      if (type === 'cheque') return 'Cheque';

      return 'Cash';
    };

    const loadEditPayment = async () => {
      if (!id) return;

      if (!canViewReceivePayments || !canEditReceivePayments) {
        alert('You do not have permission to edit receive payments');
        navigate('/receive-payments');
        return;
      }

      try {
        setEditLoading(true);

        const existing = await getReceivePaymentById(id);

        if (cancelled) return;

        const customerObject =
          existing.customer && typeof existing.customer === 'object' ? existing.customer : null;

        const partyObject =
          existing.partyId && typeof existing.partyId === 'object' ? existing.partyId : null;

        const customerId = customerObject?._id || existing.customer || '';

        const partyId = partyObject?._id || existing.partyId || '';

        const isPartyPayment = Boolean(partyId);

        setSelectedCustomerType(isPartyPayment ? 'party' : 'customer');

        setCustomerName(isPartyPayment ? partyObject?.name || '' : customerObject?.name || '');

        setFormData({
          customer: isPartyPayment ? '' : customerId,
          partyId: isPartyPayment ? partyId : '',
          date: existing.date || dayjs().format('YYYY-MM-DD'),
          time: existing.time || dayjs().format('HH:mm'),
          amount: existing.amount || '',
          paymentType: normalizePaymentType(existing.paymentType),
          discountAmount: existing.discountAmount || '',
          account: '',
          description: existing.description || '',
          attachments: existing.attachments || [],
        });

        const entries =
          Array.isArray(existing.paymentEntries) && existing.paymentEntries.length > 0
            ? existing.paymentEntries.map((payment) => ({
                account:
                  typeof payment.account === 'object'
                    ? payment.account?._id || ''
                    : payment.account || '',

                amount: payment.amount || '',

                paymentType: normalizePaymentType(payment.paymentType || existing.paymentType),
              }))
            : [
                {
                  account: '',
                  amount: '',
                  paymentType: normalizePaymentType(existing.paymentType),
                },
              ];

        setPaymentEntries(entries);
      } catch (err) {
        if (cancelled) return;

        console.error('❌ Receive Payment edit load failed:', err?.response?.data || err.message);

        alert(err?.response?.data?.error || 'Receive payment load failed');
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    };

    loadEditPayment();

    return () => {
      cancelled = true;
    };
  }, [id, canViewReceivePayments, canEditReceivePayments, navigate]);
  useEffect(() => {
    let cancelled = false;

    const loadFormOptions = async () => {
      const results = await Promise.allSettled([
        fetchCustomers(null, {}, true),
        fetchSaleParties(null, true),
        getValidPaymentAccounts(true),
      ]);

      if (cancelled) return;

      const [customerResult, partyResult, accountResult] = results;

      if (customerResult.status === 'fulfilled') {
        const customerData = customerResult.value;

        const customerList = Array.isArray(customerData)
          ? customerData
          : Array.isArray(customerData?.customers)
            ? customerData.customers
            : [];

        setCustomers(customerList);

        localStorage.setItem('customers', JSON.stringify(customerList));
      } else {
        console.error('Customers load failed:', customerResult.reason);
      }

      if (partyResult.status === 'fulfilled') {
        const partyList = Array.isArray(partyResult.value) ? partyResult.value : [];

        setParties(partyList);

        localStorage.setItem('saleParties', JSON.stringify(partyList));
      } else {
        console.error('Sale parties load failed:', partyResult.reason);
      }

      if (accountResult.status === 'fulfilled') {
        const paymentAccounts = Array.isArray(accountResult.value) ? accountResult.value : [];

        setAccounts(paymentAccounts);

        localStorage.setItem('paymentAccounts', JSON.stringify(paymentAccounts));

        if (!id) {
          const handCashAccount = paymentAccounts.find(
            (account) => account.name?.toLowerCase() === 'handcash' || account.category === 'cash'
          );

          if (handCashAccount) {
            setPaymentEntries((previousEntries) => {
              const isBlankDefault =
                previousEntries.length === 1 &&
                !previousEntries[0]?.amount &&
                !previousEntries[0]?.account;

              if (!isBlankDefault) {
                return previousEntries;
              }

              return [
                {
                  account: handCashAccount._id,
                  amount: '',
                  paymentType: 'Cash',
                },
              ];
            });
          }
        }
      } else {
        console.error('Payment accounts load failed:', accountResult.reason);
      }
    };

    loadFormOptions();

    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    const selectedId = selectedCustomerType === 'party' ? formData.partyId : formData.customer;

    if (!selectedId) {
      setCustomerLedger([]);
      return;
    }

    let cancelled = false;

    const loadSelectedLedger = async () => {
      try {
        setLedgerLoading(true);

        let ledgerResponse;

        if (selectedCustomerType === 'party') {
          ledgerResponse = await getPartyLedger(selectedId);
        } else {
          const customerObject = customers.find(
            (customer) => String(customer._id) === String(selectedId)
          );

          const accountId = customerObject?.account?._id || customerObject?.account;

          if (!accountId) {
            if (!cancelled) {
              setCustomerLedger([]);
            }

            return;
          }

          ledgerResponse = await getLedgerByCustomerAccount(accountId);
        }

        if (cancelled) return;

        setCustomerLedger(Array.isArray(ledgerResponse?.ledger) ? ledgerResponse.ledger : []);
      } catch (err) {
        if (cancelled) return;

        console.error('Receive Payment ledger load failed:', err);

        setCustomerLedger([]);
      } finally {
        if (!cancelled) {
          setLedgerLoading(false);
        }
      }
    };

    if (selectedCustomerType === 'party' || customers.length > 0) {
      loadSelectedLedger();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerType, formData.customer, formData.partyId, customers]);
  const loadLedger = async (recordId, type = selectedCustomerType) => {
    if (!recordId) {
      setCustomerLedger([]);
      return;
    }

    try {
      setLedgerLoading(true);

      if (type === 'party') {
        const res = await getPartyLedger(recordId);

        setCustomerLedger(Array.isArray(res?.ledger) ? res.ledger : []);

        return;
      }

      const customer = customers.find((item) => String(item._id) === String(recordId));

      const accountId = customer?.account?._id || customer?.account;

      if (!accountId) {
        setCustomerLedger([]);
        return;
      }

      const res = await getLedgerByCustomerAccount(accountId);

      setCustomerLedger(Array.isArray(res?.ledger) ? res.ledger : []);
    } catch (err) {
      console.error('Customer ledger load failed:', err);
      setCustomerLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files || []);
    const oldFiles = formData.attachments || [];

    if (oldFiles.length + newFiles.length > 3) {
      alert('Maximum 3 attachments allowed');
      e.target.value = '';
      return;
    }

    setFormData((prev) => ({
      ...prev,
      attachments: [...oldFiles, ...newFiles],
    }));
  };

  const resetForm = () => {
    clear();

    setFormData({
      customer: '',
      partyId: '',
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm'),
      amount: '',
      paymentType: 'Cash',
      discountAmount: '',
      account: '',
      description: '',
      attachments: [],
    });

    setCustomerName('');
    setSelectedCustomerType('customer');

    setShowSuggestions(false);
    setCustomerLedger([]);

    const handCash = accounts.find(
      (acc) => acc.name?.toLowerCase() === 'handcash' || acc.category === 'cash'
    );

    setPaymentEntries([
      {
        account: handCash?._id || '',
        amount: '',
        paymentType: 'Cash',
      },
    ]);

    setModalAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRevert = async () => {
    if (!id) {
      resetForm();
      return;
    }

    try {
      setEditLoading(true);

      const existing = await getReceivePaymentById(id);

      setFormData({
        customer: existing.customer,
        date: existing.date,
        time: existing.time,
        paymentType: existing.paymentType || '',
        description: existing.description || '',
        discountAmount: existing.discountAmount || '',
        attachments: existing.attachments || [],
      });

      setPaymentEntries(
        existing.paymentEntries && existing.paymentEntries.length > 0
          ? existing.paymentEntries.map((p) => ({
              account: p.account || '',
              amount: p.amount || '',
              paymentType:
                (p.paymentType || existing.paymentType) === 'online'
                  ? 'Online'
                  : (p.paymentType || existing.paymentType) === 'cheque'
                    ? 'Cheque'
                    : 'Cash',
            }))
          : [
              {
                account: '',
                amount: '',
                paymentType:
                  existing.paymentType === 'online'
                    ? 'Online'
                    : existing.paymentType === 'cheque'
                      ? 'Cheque'
                      : 'Cash',
              },
            ]
      );
      const customerId =
        typeof existing.customer === 'object' ? existing.customer?._id : existing.customer;

      const partyId =
        typeof existing.partyId === 'object' ? existing.partyId?._id : existing.partyId;

      if (partyId) {
        setSelectedCustomerType('party');

        setFormData((prev) => ({
          ...prev,
          customer: '',
          partyId,
        }));

        const selectedParty = parties.find((party) => String(party._id) === String(partyId));

        setCustomerName(selectedParty?.name || existing.partyId?.name || '');

        await loadLedger(partyId, 'party');
      } else {
        setSelectedCustomerType('customer');

        setFormData((prev) => ({
          ...prev,
          customer: customerId || '',
          partyId: '',
        }));

        const selectedCustomer = customers.find(
          (customer) => String(customer._id) === String(customerId)
        );

        setCustomerName(selectedCustomer?.name || existing.customer?.name || '');

        await loadLedger(customerId, 'customer');
      }
    } catch (err) {
      console.error('Revert error:', err);
      alert('Receive payment restore failed');
    } finally {
      setEditLoading(false);
    }
  };
  const handlePrint = async () => {
    if (id) {
      const printWindow = window.open('', '_blank');

      if (!printWindow) {
        alert('Please allow popups to print the receipt');
        return;
      }

      try {
        printWindow.document.write(
          '<p style="font-family:Arial;padding:20px;">Preparing print...</p>'
        );

        const token = localStorage.getItem('token');

        if (!token) {
          printWindow.close();
          alert('Login token not found. Please login again.');
          return;
        }

        const response = await fetch(
          `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/${id}/html?size=${printSize}&lang=${encodeURIComponent(
            getCurrentLanguage()
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          let message = 'Failed to generate print';

          try {
            const errorData = await response.json();
            message = errorData.message || errorData.error || message;
          } catch {
            const errorText = await response.text();
            if (errorText) message = errorText;
          }

          throw new Error(message);
        }

        const html = await response.text();

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      } catch (error) {
        printWindow.close();

        console.error('❌ Receive Payment Print Error:', error);

        alert(error.message || 'Failed to generate print');
      }

      return;
    }

    const lastBill =
      customerLedger.filter((e) => e.billNo?.startsWith('RCV-')).slice(-1)[0]?.billNo || 'RCV-1000';

    const lastNumber = Number(lastBill.replace('RCV-', ''));

    const previewData = {
      ...formData,

      userId: localStorage.getItem('userId'),

      billNo: `RCV-${lastNumber + 1}`,

      discountAmount: Number(formData.discountAmount || 0),

      previousBalance: Number(closingBalance || 0),

      lang: getCurrentLanguage(),

      customer: formData.customer,

      customerName:
        selectedCustomerType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.name || ''
          : customers.find((c) => c._id === formData.customer)?.name || '',

      customerPhone:
        selectedCustomerType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.phone || ''
          : customers.find((c) => c._id === formData.customer)?.phone || '',

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
  const handleExportPDF = async () => {
    if (id) {
      try {
        const token = localStorage.getItem('token');

        if (!token) {
          alert('Login token not found. Please login again.');
          return;
        }

        const response = await fetch(
          `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/${id}/pdf?size=${printSize}&lang=${encodeURIComponent(
            getCurrentLanguage()
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!response.ok) {
          let message = 'Failed to generate PDF';

          try {
            const errorData = await response.json();
            message = errorData.message || errorData.error || message;
          } catch {
            const errorText = await response.text();
            if (errorText) message = errorText;
          }

          throw new Error(message);
        }

        const pdfBlob = await response.blob();
        const pdfUrl = window.URL.createObjectURL(pdfBlob);

        const contentDisposition = response.headers.get('content-disposition');

        let fileName = 'Receive-Payment-Receipt.pdf';

        const fileNameMatch = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);

        if (fileNameMatch?.[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '').trim();
        }

        const downloadLink = document.createElement('a');

        downloadLink.href = pdfUrl;
        downloadLink.download = fileName;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        window.URL.revokeObjectURL(pdfUrl);
      } catch (error) {
        console.error('❌ Receive Payment PDF Error:', error);

        alert(error.message || 'Failed to generate PDF');
      }

      return;
    }

    const lastBill =
      customerLedger.filter((e) => e.billNo?.startsWith('RCV-')).slice(-1)[0]?.billNo || 'RCV-1000';

    const lastNumber = Number(lastBill.replace('RCV-', ''));

    const previewData = {
      ...formData,

      userId: localStorage.getItem('userId'),

      billNo: `RCV-${lastNumber + 1}`,

      discountAmount: Number(formData.discountAmount || 0),

      previousBalance: Number(closingBalance || 0),

      lang: getCurrentLanguage(),

      customer: formData.customer,

      customerName:
        selectedCustomerType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.name || ''
          : customers.find((c) => c._id === formData.customer)?.name || '',

      customerPhone:
        selectedCustomerType === 'party'
          ? parties.find((p) => p._id === formData.partyId)?.phone || ''
          : customers.find((c) => c._id === formData.customer)?.phone || '',

      paymentEntries: paymentEntries.map((p) => ({
        ...p,
        accountName: accounts.find((a) => a._id === p.account)?.name || '',
      })),
    };

    const encoded = encodeURIComponent(JSON.stringify(previewData));

    window.location.href = `${process.env.REACT_APP_API_BASE_URL}/api/print/receive-payment/preview/pdf?size=${printSize}&data=${encoded}`;
  };

  const formState = {
    formData: {
      ...formData,
      attachments: [],
    },
    customerName,
    selectedCustomerType,
    paymentEntries,
  };

  const restoreReceivePaymentDraft = useCallback((valueOrUpdater) => {
    const defaultState = {
      formData: {
        customer: '',
        partyId: '',
        date: dayjs().format('YYYY-MM-DD'),
        time: dayjs().format('HH:mm'),
        amount: '',
        paymentType: 'Cash',
        discountAmount: '',
        account: '',
        description: '',
        attachments: [],
      },
      customerName: '',
      selectedCustomerType: 'customer',
      paymentEntries: [
        {
          account: '',
          amount: '',
          paymentType: 'Cash',
        },
      ],
    };

    const data =
      typeof valueOrUpdater === 'function' ? valueOrUpdater(defaultState) : valueOrUpdater;

    if (!data || typeof data !== 'object') return;

    const savedFormData = data.formData || {};

    setFormData({
      customer: savedFormData.customer || '',
      partyId: savedFormData.partyId || '',
      date: savedFormData.date || dayjs().format('YYYY-MM-DD'),
      time: savedFormData.time || dayjs().format('HH:mm'),
      amount: savedFormData.amount || '',
      paymentType: savedFormData.paymentType || 'Cash',
      discountAmount: savedFormData.discountAmount || '',
      account: savedFormData.account || '',
      description: savedFormData.description || '',
      attachments: [],
    });

    setCustomerName(data.customerName || '');

    setSelectedCustomerType(data.selectedCustomerType || 'customer');

    const restoredEntries =
      Array.isArray(data.paymentEntries) && data.paymentEntries.length > 0
        ? data.paymentEntries.map((entry) => ({
            account: entry?.account || '',
            amount: entry?.amount || '',
            paymentType: entry?.paymentType || 'Cash',
          }))
        : [
            {
              account: '',
              amount: '',
              paymentType: 'Cash',
            },
          ];

    setPaymentEntries(restoredEntries);
  }, []);

  const shouldSaveReceivePaymentDraft = useCallback((draft) => {
    if (!draft) return false;

    const hasCustomer =
      Boolean(draft.customerName?.trim()) ||
      Boolean(draft.formData?.customer) ||
      Boolean(draft.formData?.partyId);

    const hasPayments =
      Array.isArray(draft.paymentEntries) &&
      draft.paymentEntries.some((entry) => Boolean(entry?.amount) || Boolean(entry?.account));

    const hasOtherData =
      Boolean(draft.formData?.description?.trim()) ||
      Number(draft.formData?.discountAmount || 0) > 0;

    return hasCustomer || hasPayments || hasOtherData;
  }, []);

  const { clear } = useFormPersist(
    !id ? 'receive_payment_draft' : null,
    formState,
    restoreReceivePaymentDraft,
    {
      expiryHours: 24,
      delay: 500,
      shouldSave: shouldSaveReceivePaymentDraft,
    }
  );

  const filteredSuggestions = useMemo(() => {
    const search = customerName.trim().toLowerCase();

    if (!search) return [];

    return [
      ...customers
        .filter((c) => (c.name || '').toLowerCase().includes(search))
        .map((c) => ({
          ...c,
          selectType: 'customer',
          badge: 'Customer',
        })),

      ...parties
        .filter((p) => (p.name || '').toLowerCase().includes(search))
        .map((p) => ({
          ...p,
          selectType: 'party',
          badge: 'Party',
        })),
    ].slice(0, 10);
  }, [customerName, customers, parties]);

  const handleSubmit = async (e, type = 'close') => {
    e.preventDefault();

    if (id && !canEditReceivePayments) {
      alert('You do not have permission to edit receive payments');
      return;
    }

    if (!id && !canCreateReceivePayments) {
      alert('You do not have permission to create receive payments');
      return;
    }

    if ((!formData.customer && !formData.partyId) || paymentEntries.length === 0) {
      alert(t('alerts.addAtLeastOnePayment'));
      return;
    }

    const totalDebit = customerLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = customerLedger.reduce((sum, e) => sum + (e.credit || 0), 0);
    const currentBalance = totalDebit - totalCredit;

    const totalAmount = paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const discountAmount = Number(formData.discountAmount || 0);

    const finalAmount = totalAmount + discountAmount;

    if (currentBalance <= 0 && finalAmount > 0) {
      const ok = window.confirm(
        '⚠️ This customer has no pending balance. This payment will be recorded as advance. Do you want to continue?'
      );
      if (!ok) return;
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (key !== 'attachments' && value !== null) {
        data.append(key, value);
      }
    });

    (formData.attachments || []).forEach((file) => {
      if (file instanceof File) {
        data.append('attachments', file);
      }
    });

    const keepAttachmentKeys = (formData.attachments || [])
      .filter((f) => !('lastModified' in f))
      .map((f) => f.key);

    data.append('keepAttachmentKeys', JSON.stringify(keepAttachmentKeys));

    data.append('paymentEntries', JSON.stringify(paymentEntries));

    data.append('discountAmount', formData.discountAmount || 0);

    try {
      setLoading(true);

      if (id) {
        await updateReceivePayment(id, data);

        alert(t('alerts.paymentUpdated'));
      } else {
        await createReceivePayment(data);

        clear();
      }

      if (type === 'new') {
        if (id) {
          navigate('/receive-payments/new', {
            replace: true,
          });
        }

        resetForm();
        return;
      }

      if (type === 'close') {
        if (!id) {
          resetForm();
        }

        navigate('/dashboard');
        return;
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
    <>
      {editLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl font-semibold">
            Receive Payment Loading...
          </div>
        </div>
      )}

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
            <div
              style={{
                position: 'relative',
                overflow: 'visible',
              }}
            >
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('customer')}
              </label>

              <input
                placeholder={t('customer.search')}
                value={customerName}
                onChange={(e) => {
                  const value = e.target.value;

                  setCustomerName(value);
                  setShowSuggestions(true);

                  setSelectedCustomerType('customer');

                  setFormData((previous) => ({
                    ...previous,
                    customer: '',
                    partyId: '',
                  }));

                  setCustomerLedger([]);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
              />

              {showSuggestions && customerName && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
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
                  {filteredSuggestions.map((c) => (
                    <div
                      key={c._id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setSelectedCustomerType(c.selectType);

                        setFormData((prev) => ({
                          ...prev,
                          customer: c.selectType === 'customer' ? c._id : '',
                          partyId: c.selectType === 'party' ? c._id : '',
                        }));

                        setShowSuggestions(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      {c.name} {c.badge === 'Party' ? '🟣 Party' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* DATE + TIME (MOBILE SAME ROW) */}
            <div className="grid grid-cols-2 gap-2 md:contents">
              {/* DATE */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">
                  {t('date')}
                </label>
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
                <label className="text-xs font-semibold text-gray-600 mb-1 block">
                  {t('time')}
                </label>
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm shadow-sm focus:ring-1 md:focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            {/* ATTACHMENTS */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                {t('attachment')} <span className="text-gray-400">(Max 3)</span>
              </label>

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
                disabled={(formData.attachments || []).length >= 3}
                className={`px-3 py-2 rounded-lg text-sm shadow ${
                  (formData.attachments || []).length >= 3
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                📎 Add Files ({(formData.attachments || []).length}/3)
              </button>

              {formData.attachments?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {formData.attachments.map((file, index) => {
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
                              setFormData((prev) => ({
                                ...prev,
                                attachments: prev.attachments.filter((_, i) => i !== index),
                              }));

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
              )}
            </div>
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
                    type="text"
                    inputMode="decimal"
                    placeholder={t('amount')}
                    className="col-span-3 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm text-right shadow-sm no-spinner"
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

              <div className="flex justify-end mt-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Discount"
                  className="w-32 border border-gray-200 rounded-lg md:rounded-xl px-2 py-1.5 text-xs md:text-sm text-right shadow-sm no-spinner"
                  name="discountAmount"
                  value={formData.discountAmount || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="flex justify-end mt-4">
                <div className="w-full md:w-56 rounded-lg md:rounded-xl p-2 md:p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
                  <div className="flex justify-between font-semibold text-sm">
                    <span>{t('total')}</span>
                    <span>
                      {(
                        paymentEntries.reduce((sum, p) => sum + Number(p.amount || 0), 0) +
                        Number(formData.discountAmount || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="md:col-span-2 flex flex-wrap justify-between md:justify-end items-center gap-2 md:gap-3 mt-3 md:mt-4">
              {((id && canEditReceivePayments) || (!id && canCreateReceivePayments)) && (
                <>
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
                    disabled={loading}
                    className={`bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-1.5 rounded-xl shadow ${
                      loading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? t('saving') : t('saveNew')}
                  </button>
                </>
              )}
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
              {canViewReceivePayments && (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-3 py-1.5 rounded-xl shadow"
                >
                  🖨
                </button>
              )}
              {canViewReceivePayments && (
                <button
                  type="button"
                  disabled={pdfLoading}
                  onClick={async () => {
                    try {
                      setPdfLoading(true);

                      await handleExportPDF();
                    } finally {
                      setPdfLoading(false);
                    }
                  }}
                  className="text-white px-3 py-1.5 rounded-xl shadow transition-all duration-200"
                  style={{
                    cursor: pdfLoading ? 'not-allowed' : 'pointer',
                    opacity: pdfLoading ? 0.7 : 1,
                    background: pdfLoading
                      ? '#9ca3af'
                      : 'linear-gradient(to right, #ef4444, #b91c1c)',
                  }}
                >
                  {pdfLoading ? `⏳ ${t('pdf.preparing')}` : 'PDF'}
                </button>
              )}
            </div>
          </form>

          {/* RIGHT SIDE - LEDGER */}
          {!isMobile && (
            <div
              ref={printRef}
              className="lg:col-span-2 bg-white shadow-xl rounded-2xl p-4 h-[calc(100vh-120px)] overflow-y-auto"
            >
              <h3 className="text-lg font-semibold mb-3">{t('customer.ledgerPreview')}</h3>

              {ledgerLoading && (
                <div className="text-center text-sm text-gray-500 py-3">Ledger Loading...</div>
              )}

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
                        {e.credit?.toFixed(2) || '0.00'}
                      </td>
                      <td className="p-2 border text-right font-medium text-red-600">
                        {e.debit?.toFixed(2) || '0.00'}
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

                    <td className="p-2 border text-right text-green-700">
                      {totalCredit.toFixed(2)}
                    </td>

                    <td className="p-2 border text-right text-red-600">{totalDebit.toFixed(2)}</td>

                    <td className="p-2 border text-right text-blue-700 font-bold">
                      {closingBalance.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <AttachmentViewerModal
          attachment={modalAttachment}
          onClose={() => setModalAttachment(null)}
        />
      </div>
    </>
  );
};

export default ReceivePaymentForm;
