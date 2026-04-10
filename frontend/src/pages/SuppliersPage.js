import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  confirmMergeSupplier,
} from '../services/supplierService';

import SupplierForm from '../components/SupplierForm';
import PageLayout from '../components/PageLayout';
import { fetchSupplierLedger } from '../services/supplierService';
import LedgerTable from '../components/LedgerTable';
import SupplierLedgerHeader from '../components/SupplierLedgerHeader';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { t } from '../i18n/i18n';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';

const SuppliersPage = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType] = useState('all');
  const [balanceSort, setBalanceSort] = useState('none');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [nameSort, setNameSort] = useState('none');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeData, setMergeData] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [printSize] = useState('A5');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const navigate = useNavigate();
  const location = useLocation();

  const token = localStorage.getItem('token');

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await fetchSuppliers({ search: '', type: '' });
      setSuppliers(data);
    } catch (error) {
      console.error(t('alerts.loadSuppliersError'), error);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // 📱 HANDLE RESPONSIVE
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 👇 Auto open Supplier Form if ?new=true
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('new') === 'true') {
      setEditingSupplier(null);
      setShowForm(true);
    }
  }, [location.search]);

  const loadSupplierLedger = useCallback(
    async (supplierId) => {
      if (!supplierId) return;

      setLedgerLoading(true);
      try {
        const data = await fetchSupplierLedger(supplierId, {
          start: ledgerStartDate,
          end: ledgerEndDate,
        });
        setLedgerData(data);
      } catch (error) {
        console.error(t('alerts.loadLedgerFailed'), error);
        setLedgerData(null);
      }
      setLedgerLoading(false);
    },
    [ledgerStartDate, ledgerEndDate]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      const list =
        activeTab === 'active'
          ? suppliers.filter((s) => s.supplierType !== 'blocked')
          : suppliers.filter((s) => s.supplierType === 'blocked');

      if (!list.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, list.length - 1);
          const supplier = list[next];
          setSelectedSupplierId(supplier._id);
          return next;
        });
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          const supplier = list[next];
          setSelectedSupplierId(supplier._id);
          return next;
        });
      }

      if (e.key === 'Enter') {
        if (selectedIndex >= 0) {
          const supplier = list[selectedIndex];
          loadSupplierLedger(supplier._id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suppliers, activeTab, selectedIndex, loadSupplierLedger]);

  const handleAddClick = () => {
    setEditingSupplier(null);
    setShowForm(true);
  };

  const handleEditClick = (e, supplier) => {
    e.stopPropagation();
    setEditingSupplier(supplier);
    setShowForm(true);
  };

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (deleteId) {
        await deleteSupplier(deleteId);
        setDeleteId(null);
        setShowConfirm(false);
        loadSuppliers();
      }
    } catch (err) {
      console.error(t('alerts.deleteSupplierError'), err);
      alert(t('alerts.deleteSupplierFailed'));
    }
  };

  const cancelDelete = () => {
    setDeleteId(null);
    setShowConfirm(false);
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (editingSupplier) {
        const res = await updateSupplier(editingSupplier._id, formData);

        if (res?.mergeRequired) {
          setMergeData({
            sourceSupplierId: res.sourceSupplierId,
            targetSupplierId: res.targetSupplierId,
          });

          setShowMergeConfirm(true);
          return;
        }
      } else {
        try {
          await createSupplier(formData);
        } catch (err) {
          if (err?.response?.data?.message?.includes('exists')) {
            alert(t('alerts.supplierExists'));
            return;
          }
          throw err;
        }
      }

      setShowForm(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (error) {
      console.error('Supplier form submission failed:', error);
      alert(error.response?.data?.message || t('alerts.saveSupplierFailed'));
    }
  };

  const filteredSuppliers = suppliers
    .filter((supplier) => {
      const term = searchTerm.toLowerCase();
      return (
        supplier.name.toLowerCase().includes(term) ||
        (supplier.email && supplier.email.toLowerCase().includes(term)) ||
        (supplier.phone && supplier.phone.includes(term))
      );
    })
    .filter((supplier) => {
      const balance = Number(supplier.balance) || 0;
      if (filterType === 'receivable') return balance < 0;
      if (filterType === 'payable') return balance > 0;
      if (filterType === 'settled') return balance === 0;
      return true;
    });

  const activeSuppliers = filteredSuppliers
    .filter((s) => s.supplierType !== 'blocked')
    .filter((s) => {
      const bal = Number(s.balance) || 0;

      if (balanceFilter === 'payable') return bal > 0;
      if (balanceFilter === 'receivable') return bal < 0;
      if (balanceFilter === 'settled') return bal === 0;

      return true;
    })

    .sort((a, b) => {
      const balA = Number(a.balance) || 0;
      const balB = Number(b.balance) || 0;

      // Name sort first if selected
      if (nameSort !== 'none') {
        return nameSort === 'a-z' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }

      // Balance sort next
      if (balanceSort !== 'none') {
        return balanceSort === 'highest' ? balB - balA : balA - balB;
      }

      // Default sort
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const hiddenSuppliers = filteredSuppliers.filter((s) => s.supplierType === 'blocked');

  const closing = ledgerData?.ledger?.length
    ? Number(ledgerData.ledger[ledgerData.ledger.length - 1].balance || 0)
    : Number(ledgerData?.openingBalance || 0);

  const closingColor = closing > 0 ? '#dc2626' : closing < 0 ? '#16a34a' : '#6b7280';

  return (
    <PageLayout>
      {showForm && (
        <SupplierForm
          initialData={editingSupplier}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingSupplier(null);
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          height: '100%',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div
          style={{
            width: isMobile ? '100%' : '20%',
            minWidth: isMobile ? '100%' : 260,
            borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
            padding: 12,
            overflowY: 'auto',
            display: isMobile && selectedSupplierId ? 'none' : 'block',
          }}
        >
          {/* 🟣 ACTION BUTTONS MOVED FROM HEADER */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <button
              onClick={handleAddClick}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #7c3aed',
                background: '#7c3aed',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('add')}
            </button>

            <button
              onClick={() => setActiveTab('active')}
              style={{
                height: 30,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: activeTab === 'active' ? '#f3e8ff' : '#ffffff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('status.active')}
            </button>

            <button
              onClick={() => setActiveTab('hidden')}
              style={{
                height: 30,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: activeTab === 'hidden' ? '#f3e8ff' : '#ffffff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('status.blocked')}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value)}
              style={{
                height: 30,
                padding: '0 6px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 12,
                width: 90,
              }}
            >
              <option value="all">{t('all')}</option>
              <option value="receivable">{t('ledger.advance')}</option>
              <option value="payable">{t('ledger.payable')}</option>
              <option value="settled">{t('ledger.settled')}</option>
            </select>

            <select
              value={nameSort}
              onChange={(e) => setNameSort(e.target.value)}
              style={{
                height: 30,
                padding: '0 6px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 12,
                width: 80,
              }}
            >
              <option value="none">{t('name')}</option>
              <option value="a-z">{t('sort.az')}</option>
              <option value="z-a">{t('sort.za')}</option>
            </select>

            <select
              value={balanceSort}
              onChange={(e) => setBalanceSort(e.target.value)}
              style={{
                height: 30,
                padding: '0 6px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 12,
                width: 90,
              }}
            >
              <option value="none">{t('balance')}</option>
              <option value="highest">{t('sort.highLow')}</option>
              <option value="lowest">{t('sort.lowHigh')}</option>
            </select>
          </div>

          <input
            type="text"
            placeholder={t('supplier.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid #ddd6fe',
              marginBottom: 10,
            }}
          />

          {(activeTab === 'active' ? activeSuppliers : hiddenSuppliers).map((supplier) => {
            const balance = Number(supplier.balance) || 0;
            const balanceColor = balance > 0 ? '#dc2626' : balance < 0 ? '#16a34a' : '#6b7280';

            return (
              <div
                key={supplier._id}
                onClick={() => {
                  setSelectedSupplierId(supplier._id);

                  const list = activeTab === 'active' ? activeSuppliers : hiddenSuppliers;

                  setSelectedIndex(list.findIndex((s) => s._id === supplier._id));

                  loadSupplierLedger(supplier._id);
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  marginBottom: 6,
                  cursor: 'pointer',
                  position: 'relative', // 🔴 IMPORTANT
                  background: selectedSupplierId === supplier._id ? '#f3e8ff' : '#ffffff',
                  border:
                    selectedSupplierId === supplier._id ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                }}
              >
                {/* LEFT */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{supplier.name}</div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: balanceColor,
                      marginTop: 2,
                    }}
                  >
                    Rs. {balance.toFixed(2)}
                  </div>
                </div>

                {/* RIGHT ACTIONS */}
                {selectedSupplierId === supplier._id && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      position: 'absolute',
                      right: 8,
                      bottom: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => handleEditClick(e, supplier)}
                      style={{
                        fontSize: 10,
                        padding: '2px 4px',
                        borderRadius: 6,
                        border: '1px solid #7c3aed',
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {t('edit')}
                    </button>

                    <button
                      onClick={(e) => handleDeleteClick(e, supplier._id)}
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #ef4444',
                        background: '#fef2f2',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {t('delete')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {activeTab === 'active' && searchTerm.trim() !== '' && activeSuppliers.length === 0 && (
            <div
              style={{
                marginTop: 12,
                padding: '10px',
                borderRadius: 8,
                border: '1px dashed #a78bfa',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#faf5ff',
                fontSize: 13,
                fontWeight: 600,
                color: '#7c3aed',
              }}
              onClick={() => {
                setEditingSupplier({
                  name: searchTerm,
                  supplierType: 'vendor',
                  openingBalance: 0,
                });
                setShowForm(true);
              }}
            >
              + {t('supplier.addNew')} “{searchTerm}”
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            padding: 16,
            display: isMobile && !selectedSupplierId ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {!selectedSupplierId && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              {t('supplier.selectToViewLedger')}
            </div>
          )}

          {ledgerLoading && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>{t('common.loadingLedger')}</div>
          )}

          {!ledgerLoading && ledgerData && (
            <>
              <SupplierLedgerHeader
                suppliers={suppliers}
                sid={selectedSupplierId}
                setSid={setSelectedSupplierId}
                pageSize={10}
                setPageSize={() => {}}
                print={() => window.print()}
                name={ledgerData?.supplierName || ''}
                token={token}
                printSize={printSize}
                start={ledgerStartDate}
                end={ledgerEndDate}
                setStart={setLedgerStartDate}
                setEnd={setLedgerEndDate}
                supplierName={supplierName}
                setSupplierName={setSupplierName}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                load={(id, s, e) => loadSupplierLedger(id)}
                setSearch={setLedgerSearch}
                setPage={() => {}}
                navigate={navigate}
                isMobile={isMobile}
                onBack={() => setSelectedSupplierId(null)}
                opening={ledgerData?.openingBalance || 0}
                dateFilteredLedger={ledgerData?.ledger || []}
                totalDebit={(ledgerData?.ledger || []).reduce((sum, e) => sum + (e.debit || 0), 0)}
                totalCredit={(ledgerData?.ledger || []).reduce(
                  (sum, e) => sum + (e.credit || 0),
                  0
                )}
                closingBalance={closing}
                balanceStatus={closing > 0 ? 'Payable' : closing < 0 ? 'Advance' : 'Settled'}
                balanceColor={closingColor}
              />

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                <LedgerTable
                  ledgerData={ledgerData?.ledger || []}
                  search={ledgerSearch}
                  openingBalance={ledgerData?.openingBalance || 0}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              width: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                ⚠️
              </div>

              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{t('confirm.deleteTitle')}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {t('confirm.actionIrreversible')}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              {t('confirm.deleteSupplier')}
              <br />
              <br />• {t('supplier.deleteHasHistory')}{' '}
              <b style={{ color: '#b91c1c' }}>{t('supplier.blocked')}</b>.
              <br />• {t('supplier.deleteNoHistory')}{' '}
              <b style={{ color: '#dc2626' }}>{t('supplier.permanentlyDeleted')}</b>.
            </div>

            {/* Footer Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                onClick={cancelDelete}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('cancel')}
              </button>

              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
                }}
              >
                {t('confirm.yesDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showMergeConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: 26,
              width: 450,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#ede9fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                🔄
              </div>

              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{t('supplier.merge')}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{t('supplier.mergeDesc')}</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              {t('supplier.mergeWarning')}
              <br />
              <br />
              {t('supplier.mergeContinue')}
              <br />• {t('supplier.mergeMoveTransactions')}
              <br />• {t('supplier.mergeSourceHidden')}
              <br />• {t('confirm.actionIrreversible')}
            </div>

            {/* Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                onClick={() => {
                  setShowMergeConfirm(false);
                  setMergeData(null);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>

              <button
                onClick={async () => {
                  try {
                    await confirmMergeSupplier(mergeData, token);

                    setShowMergeConfirm(false);
                    setMergeData(null);
                    setShowForm(false); // 🔥 ADD
                    setEditingSupplier(null); // 🔥 ADD

                    loadSuppliers();

                    alert(t('alerts.suppliersMerged'));
                  } catch (err) {
                    console.error(err);
                    alert(t('alerts.mergeFailed'));
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                }}
              >
                {t('supplier.yesMerge')}
              </button>
            </div>
          </div>
        </div>
      )}
      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          if (!selectedSupplierId) return;

          const selectedSupplier = suppliers.find((s) => s._id === selectedSupplierId);

          const query = new URLSearchParams({
            startDate: ledgerStartDate || '',
            endDate: ledgerEndDate || '',
            size: printSize,
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${selectedSupplierId}/pdf?${query}`;

          sendPdfToWhatsApp({
            phone: selectedSupplier?.phone || selectedSupplier?.mobile,
            customerName: selectedSupplier?.name,
            balance: closing,
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
};

export default SuppliersPage;
