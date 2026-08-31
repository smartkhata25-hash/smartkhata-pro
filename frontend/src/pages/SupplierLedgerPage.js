// 📁 src/pages/SupplierLedgerPage.js

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';
import usePageMemory from '../hooks/usePageMemory';

import { fetchSuppliers, fetchSupplierLedger } from '../services/supplierService';
import { fetchTravelVendors } from '../services/travelMasterService';
import { buildTravelRouteState, isTravelContext } from '../utils/travelContext';

const SUPPLIER_LEDGER_DEFAULTS = {
  sid: '',
  supplierName: '',
  search: '',
  start: `${new Date().getFullYear()}-01-01`,
  end: `${new Date().getFullYear()}-12-31`,
};

const TRAVEL_SUPPLIER_LEDGER_DEFAULTS = {
  ...SUPPLIER_LEDGER_DEFAULTS,
  start: '',
  end: '',
};

export default function SupplierLedgerPage() {
  const token = localStorage.getItem('token');
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isTravelLedger = isTravelContext(location);

  const [suppliers, setSuppliers] = useState([]);

  const [ledger, setLedger] = useState([]);
  const [opening, setOpening] = useState(0);

  const [showSuggestions, setShowSuggestions] = useState(false);

  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handledRouteSupplierRef = useRef('');

  const { state: pageMemory, updateField: updatePageField } = usePageMemory(
    isTravelLedger ? 'travel_supplier_ledger_page_state' : 'supplier_ledger_page_state',
    isTravelLedger ? TRAVEL_SUPPLIER_LEDGER_DEFAULTS : SUPPLIER_LEDGER_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const { sid, supplierName, search, start, end } = pageMemory;

  const setSid = useCallback((value) => updatePageField('sid', value || ''), [updatePageField]);

  const setSupplierName = useCallback(
    (value) => updatePageField('supplierName', value || ''),
    [updatePageField]
  );

  const setSearch = useCallback((value) => updatePageField('search', value), [updatePageField]);

  const setStart = useCallback((value) => updatePageField('start', value), [updatePageField]);

  const setEnd = useCallback((value) => updatePageField('end', value), [updatePageField]);

  // ✅ Print Size (Default A5, Remembered)
  const [printSize, setPrintSize] = useState(localStorage.getItem('ledgerPrintSize') || 'A5');

  const buildPrintQuery = useCallback(
    (params = {}) => {
      const query = new URLSearchParams(params);

      if (isTravelLedger) {
        query.set('moduleScope', 'travel');
      }

      return query.toString();
    },
    [isTravelLedger]
  );

  useEffect(() => {
    localStorage.setItem('ledgerPrintSize', printSize);
  }, [printSize]);

  const dateFilteredLedger = ledger.filter((e) => {
    if (!start && !end) return true;

    const d = new Date(e.date);
    const s = start ? new Date(start) : null;
    const en = end ? new Date(end) : null;

    if (s && d < s) return false;
    if (en && d > en) return false;
    return true;
  });

  const totalDebit = dateFilteredLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = dateFilteredLedger.reduce((sum, e) => sum + (e.credit || 0), 0);

  const closingBalance =
    dateFilteredLedger.length > 0
      ? dateFilteredLedger[dateFilteredLedger.length - 1].balance || 0
      : opening;

  let balanceStatus = t('ledger.settled');
  let balanceColor = '#6b7280';

  if (closingBalance > 0) {
    balanceStatus = t('ledger.payable');
    balanceColor = '#dc2626';
  } else if (closingBalance < 0) {
    balanceStatus = t('ledger.advance');
    balanceColor = '#2563eb';
  }

  useEffect(() => {
    if (isTravelLedger) {
      fetchTravelVendors({ includeBalance: 'true' }, { forceRefresh: true })
        .then((data) => setSuppliers(Array.isArray(data) ? data : []))
        .catch((error) => {
          console.error(error);
          setSuppliers([]);
        });

      return;
    }

    fetchSuppliers().then(setSuppliers).catch(console.error);
  }, [isTravelLedger]);

  const load = useCallback(
    async (id = sid, s = start, e = end) => {
      if (!id) {
        setLedger([]);
        setOpening(0);
        return;
      }

      const supplier = suppliers.find((item) => String(item._id) === String(id));

      if (!supplier) {
        setLedger([]);
        setOpening(0);
        return;
      }

      setLoading(true);

      try {
        const data = await fetchSupplierLedger(id, {
          startDate: s || '',
          endDate: e || '',
          moduleScope: isTravelLedger ? 'travel' : '',
        });

        const ledgerRows = Array.isArray(data?.ledger) ? data.ledger : [];

        setSid(supplier._id);
        setSupplierName(supplier.name || '');

        setOpening(Number(data?.openingBalance || 0));
        setLedger(ledgerRows);
      } catch (err) {
        console.error('SUPPLIER LEDGER LOAD ERROR:', err);

        setLedger([]);
        setOpening(0);
      } finally {
        setLoading(false);
      }
    },
    [sid, start, end, suppliers, isTravelLedger, setSid, setSupplierName]
  );

  useEffect(() => {
    if (!supplierId) return;
    if (suppliers.length === 0) return;

    if (handledRouteSupplierRef.current === String(supplierId)) {
      return;
    }

    const selectedSupplier = suppliers.find(
      (supplier) => String(supplier._id) === String(supplierId)
    );

    if (!selectedSupplier) return;

    handledRouteSupplierRef.current = String(supplierId);

    setSid(selectedSupplier._id);
    setSupplierName(selectedSupplier.name || '');
  }, [supplierId, suppliers, setSid, setSupplierName]);

  useEffect(() => {
    if (!sid) {
      setLedger([]);
      setOpening(0);
      return;
    }

    if (suppliers.length === 0) return;

    const selectedSupplier = suppliers.find((supplier) => String(supplier._id) === String(sid));

    if (!selectedSupplier) {
      setLedger([]);
      setOpening(0);
      return;
    }

    load(sid, start, end);
  }, [sid, suppliers, start, end, load]);

  const print = async () => {
    if (!sid) return;

    const query = buildPrintQuery({
      startDate: start || '',
      endDate: end || '',
      size: printSize,
    });

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/html?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const html = await response.text();

      const newWindow = window.open('', '_blank');
      newWindow.document.write(html);
      newWindow.document.close();

      newWindow.onload = function () {
        newWindow.print();
      };
    } catch (error) {
      alert(t('alerts.printFailed'));
    }
  };
  /* ===============================
     ROW CLICK / EDIT
  =============================== */
  const handleRowClick = (entry) => {
    if (!entry || entry.isOpening) return;

    console.log('SUPPLIER EDIT ENTRY =>', entry);

    const type = entry.sourceType?.toLowerCase();

    if (type === 'travel_vendor_cost') {
      navigate(`/travel/bookings/${entry.referenceId || entry.invoiceId || entry._id}`);

      return;
    }

    if (type === 'travel_refund') {
      navigate(`/travel/refunds/${entry.referenceId || entry._id}`);

      return;
    }

    if (
      type === 'travel_vendor_return' ||
      (type === 'purchase_return_payment' && entry.originModule === 'travel_vendor_return')
    ) {
      navigate(`/travel/vendor-returns/${entry.referenceId || entry._id}`);

      return;
    }

    // ✅ Purchase Invoice
    if (type === 'purchase_invoice') {
      navigate(`/purchase-invoice/${entry.referenceId || entry._id}`);
    }

    // ✅ Pay Bill
    else if (type === 'pay_bill') {
      navigate(`/pay-bills/edit/${entry.referenceId || entry._id}`);
    }

    // ✅ Purchase Return
    else if (type === 'purchase_return' || type === 'opening_purchase_return') {
      navigate(`/purchase-returns/edit/${entry.referenceId || entry._id}`);
    }

    // ✅ Purchase Discount
    else if (type === 'purchase_discount') {
      navigate(`/purchase-invoice/${entry.referenceId || entry._id}`);
    }

    // ❌ Unknown
    else {
      console.log('UNKNOWN TYPE =>', type);
    }
  };

  return (
    <PageLayout
      headerCards={
        <>
          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 92 : 150,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#16a34a',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.totalDebit')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {totalDebit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 92 : 150,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#dc2626',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.totalCredit')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {totalCredit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 96 : 160,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#2563eb',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.closingBalance')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {closingBalance.toFixed(2)}
            </div>
            <div
              style={{
                marginTop: 4,
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                background: `${balanceColor}20`,
                color: balanceColor,
                width: 'fit-content',
              }}
            >
              {balanceStatus}
            </div>
          </div>
        </>
      }
      headerContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fef2f2',
            borderRadius: 14,
            padding: window.innerWidth < 768 ? '6px 8px' : '8px 14px',
            minHeight: window.innerWidth < 768 ? 70 : 90,
            gap: 6,
            border: '1px solid #fecaca',
          }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <input
                placeholder={t('supplier.search')}
                value={supplierName}
                onChange={(e) => {
                  const value = e.target.value;

                  setSupplierName(value);
                  setShowSuggestions(true);

                  if (sid) {
                    setSid('');
                    setLedger([]);
                    setOpening(0);
                  }
                }}
                onFocus={() => setShowSuggestions(true)}
                style={{
                  height: window.innerWidth < 768 ? 32 : 36,
                  width: window.innerWidth < 768 ? 120 : 220,
                  borderRadius: 8,
                  border: '1px solid #93c5fd',
                  padding: '0 10px',
                  fontWeight: 600,
                  background: '#ffffff',
                }}
              />

              {showSuggestions && supplierName && (
                <div
                  style={{
                    position: 'absolute',
                    top: 40,
                    left: 0,
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    maxHeight: 200,
                    overflowY: 'auto',
                    zIndex: 50,
                  }}
                >
                  {suppliers
                    .filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase()))
                    .slice(0, 10)
                    .map((s) => (
                      <div
                        key={s._id}
                        onClick={() => {
                          handledRouteSupplierRef.current = String(s._id);

                          setSupplierName(s.name);
                          setSid(s._id);
                          setShowSuggestions(false);

                          navigate(
                            `/supplier-ledger/${s._id}${isTravelLedger ? '?moduleScope=travel' : ''}`,
                            {
                              replace: true,
                              state: isTravelLedger
                                ? buildTravelRouteState('/travel/vendors')
                                : undefined,
                            }
                          );
                        }}
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {s.name}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <select
              value={printSize}
              onChange={(e) => setPrintSize(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
                fontWeight: 600,
              }}
            >
              <option value="A5">A5</option>
              <option value="A4">A4</option>
            </select>
            <button
              className="btn btn-primary"
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 36 : 'auto',
                padding: window.innerWidth < 768 ? '0' : '0 18px',
              }}
              disabled={!sid}
              onClick={print}
            >
              {window.innerWidth < 768 ? '🖨️' : t('print.print')}
            </button>

            <button
              className="btn btn-primary"
              style={{ height: window.innerWidth < 768 ? 32 : 36 }}
              disabled={!sid}
              onClick={async () => {
                if (!sid) return;

                const query = buildPrintQuery({
                  startDate: start || '',
                  endDate: end || '',
                  size: printSize,
                });

                try {
                  const response = await fetch(
                    `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/pdf?${query}`,
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );

                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);

                  const link = document.createElement('a');

                  const selectedSupplier = suppliers.find((s) => s._id === sid);
                  const supplierName = selectedSupplier?.name || 'Supplier';

                  link.href = url;
                  link.download = `${supplierName.replace(/\s+/g, '-')}-Ledger.pdf`;

                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                } catch (error) {
                  alert(t('alerts.pdfFailed'));
                }
              }}
            >
              {t('print.pdf')}
            </button>

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 8px' : '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #14b8a6, #06b6d4)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              disabled={!sid}
              onClick={() =>
                navigate(
                  `/supplier-ledger/${sid}/detail${isTravelLedger ? '?moduleScope=travel' : ''}`,
                  {
                    state: isTravelLedger
                      ? buildTravelRouteState('/travel/vendors')
                      : undefined,
                  }
                )
              }
            >
              {window.innerWidth < 768 ? '📄' : `📄 ${t('ledger.detailLedger')}`}
            </button>
            <button
              disabled={!sid}
              onClick={() => setShowShareModal(true)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: 40,
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#25D366,#128C7E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaWhatsapp size={18} color="#fff" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              placeholder={t('ledger.search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 110 : 260,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
              }}
            />

            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
              }}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
              }}
            />

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 10px' : '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => load(sid, start, end)}
            >
              {t('load')}
            </button>

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                const defaultStart = `${currentYear}-01-01`;
                const defaultEnd = `${currentYear}-12-31`;

                setSearch('');
                setStart(defaultStart);
                setEnd(defaultEnd);

                if (sid) {
                  load(sid, defaultStart, defaultEnd);
                }
              }}
            >
              {t('clear')}
            </button>
          </div>
        </div>
      }
    >
      <div
        className="screen-only"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <LedgerTable
          ledgerData={dateFilteredLedger}
          search={search}
          openingBalance={opening}
          onRowClick={handleRowClick}
          onEdit={handleRowClick}
        />
      </div>

      {!loading && sid && ledger.length === 0 && <p>{t('ledger.noEntries')}</p>}
      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          if (!sid) return;

          const selectedSupplier = suppliers.find((s) => s._id === sid);

          const query = buildPrintQuery({
            startDate: start || '',
            endDate: end || '',
            size: printSize,
          });

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/pdf?${query}`;

          const token = localStorage.getItem('token');

          sendPdfToWhatsApp({
            phone: selectedSupplier?.phone || selectedSupplier?.mobile,
            customerName: selectedSupplier?.name,
            balance: closingBalance,
            businessName: 'Your Business',
            mobile: '',
            lang: 'en',
            pdfUrl,
            token,
            preferredApp: type,
          });
        }}
      />
    </PageLayout>
  );
}
