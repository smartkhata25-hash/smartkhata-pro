// 📁 src/pages/CustomersPage.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService';
import CustomerForm from '../components/CustomerForm';
import PageLayout from '../components/PageLayout';
import { getLedgerByCustomerAccount } from '../services/customerLedgerService';
import LedgerTable from '../components/LedgerTable';
import { confirmMergeCustomers } from '../services/customerService';

import CustomerLedgerHeader from '../components/CustomerLedgerHeader';
import { useLocation, useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { sendWhatsAppReminder } from '../utils/whatsapp';
import { FaWhatsapp } from 'react-icons/fa';
import { FaTrash } from 'react-icons/fa';

import { getCurrentLanguage } from '../i18n/i18n';

const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType] = useState('all');
  const [balanceSort, setBalanceSort] = useState('none');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [nameSort, setNameSort] = useState('none');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeData, setMergeData] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  // 📱 MOBILE VIEW STATE
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const loadCustomers = useCallback(async () => {
    try {
      const data = await getCustomers(token);
      setCustomers(data);
    } catch (error) {
      console.error(t('alerts.customersLoadFailed'), error);
    }
  }, [token]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // 📱 HANDLE RESPONSIVE
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get('new') === 'true') {
      setEditingCustomer(null);
      setShowForm(true);

      // URL صاف کر دو تاکہ refresh پر form نہ کھلے
      navigate('/customers', { replace: true });
    }
  }, [location.search, navigate]);

  const loadCustomerLedger = useCallback(
    async (customerId) => {
      if (!customerId) return;

      setLedgerLoading(true);
      try {
        const customer = customers.find((c) => c._id === customerId);
        if (!customer) return;

        const data = await getLedgerByCustomerAccount(
          customer.account?._id,
          ledgerStartDate,
          ledgerEndDate
        );

        setLedgerData(data);
      } catch (error) {
        console.error(t('alerts.ledgerLoadFailed'), error);
        setLedgerData(null);
      }
      setLedgerLoading(false);
    },
    [ledgerStartDate, ledgerEndDate, customers]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      const list =
        activeTab === 'active'
          ? customers.filter((c) => c.isActive !== false)
          : customers.filter((c) => c.isActive === false);

      if (!list.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, list.length - 1);
          const customer = list[next];
          setSelectedCustomerId(customer._id);
          return next;
        });
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          const customer = list[next];
          setSelectedCustomerId(customer._id);
          return next;
        });
      }

      if (e.key === 'Enter') {
        if (selectedIndex >= 0) {
          const customer = list[selectedIndex];
          loadCustomerLedger(customer._id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customers, activeTab, selectedIndex, loadCustomerLedger]);

  const handleAddClick = () => {
    setEditingCustomer(null);
    setShowForm(true);
  };

  const handleEditClick = (e, customer) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleDeleteClick = async (e, id) => {
    e.stopPropagation();
    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (deleteId) {
        await deleteCustomer(deleteId);
        setDeleteId(null);
        setShowConfirm(false);
        loadCustomers();
      }
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert(t('alerts.customerDeleteFailed'));
    }
  };

  const cancelDelete = () => {
    setDeleteId(null);
    setShowConfirm(false);
  };

  const handleFormSubmit = async (formData) => {
    try {
      const finalData = {
        ...formData,
        openingBalance: parseFloat(formData.openingBalance) || 0,
      };

      // 🔹 UPDATE CUSTOMER
      if (editingCustomer) {
        const res = await updateCustomer(editingCustomer._id, finalData);

        // 🟡 MERGE REQUIRED
        if (res?.mergeRequired) {
          setMergeData({
            sourceCustomerId: res.sourceCustomerId,
            targetCustomerId: res.targetCustomerId,
          });

          setShowMergeConfirm(true);
          return;
        }

        // ✅ normal update
        setShowForm(false);
        setEditingCustomer(null);
        loadCustomers();
        return;
      }

      // 🔹 ADD CUSTOMER
      const res = await addCustomer(finalData);

      // 🔴 DUPLICATE CUSTOMER
      if (res?.duplicate) {
        alert(t('alerts.customerDuplicate'));
        return; // ❌ form بند نہیں ہوگا
      }

      // ✅ normal add
      setShowForm(false);
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Customer form submission failed:', error);
      alert(error.response?.data?.message || t('alerts.customerSaveFailed'));
    }
  };

  const filteredCustomers = customers
    .filter((customer) => {
      const term = searchTerm.toLowerCase();
      return (
        customer.name.toLowerCase().includes(term) ||
        (customer.email && customer.email.toLowerCase().includes(term)) ||
        (customer.phone && customer.phone.includes(term))
      );
    })
    .filter((customer) => {
      const balance = Number(customer.balance) || 0;
      if (filterType === 'receivable') return balance > 0;
      if (filterType === 'payable') return balance < 0;
      if (filterType === 'settled') return balance === 0;
      return true;
    });

  const activeCustomers = filteredCustomers
    .filter((c) => c.isActive !== false)
    .filter((c) => {
      const bal = Number(c.balance) || 0;
      if (balanceFilter === 'receivable') return bal > 0;
      if (balanceFilter === 'payable') return bal < 0;
      if (balanceFilter === 'settled') return bal === 0;
      return true;
    })
    .sort((a, b) => {
      const balA = Number(a.balance) || 0;
      const balB = Number(b.balance) || 0;

      if (nameSort === 'a-z') return a.name.localeCompare(b.name);
      if (nameSort === 'z-a') return b.name.localeCompare(a.name);

      if (balanceSort === 'highest') return balB - balA;
      if (balanceSort === 'lowest') return balA - balB;

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const hiddenCustomers = filteredCustomers.filter((c) => c.isActive === false);

  const closing = ledgerData?.ledger?.length
    ? Number(ledgerData.ledger[ledgerData.ledger.length - 1].balance || 0)
    : Number(ledgerData?.openingBalance || 0);

  const closingColor = closing > 0 ? '#16a34a' : closing < 0 ? '#2563eb' : '#6b7280';

  return (
    <PageLayout>
      {/* ================= ADD / EDIT CUSTOMER FORM ================= */}
      {showForm && (
        <CustomerForm
          initialData={editingCustomer}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingCustomer(null);
          }}
        />
      )}

      {/* ================= WORKSPACE ================= */}
      <div
        style={{
          display: 'flex',
          height: '100%',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        {/* ========= LEFT: CUSTOMERS LIST ========= */}
        <div
          style={{
            width: isMobile ? '100%' : '20%',
            minWidth: isMobile ? '100%' : 260,
            borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={handleAddClick}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #2563eb',
                background: '#2563eb',
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
                background: activeTab === 'active' ? '#eef2ff' : '#ffffff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('common.active')}
            </button>

            <button
              onClick={() => setActiveTab('hidden')}
              style={{
                height: 30,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: activeTab === 'hidden' ? '#eef2ff' : '#ffffff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('common.hidden')}
            </button>
          </div>

          {/* 🔽 SORT DROPDOWN — YAHAN ADD KARNA HAI */}

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
              <option value="all">{t('common.all')}</option>
              <option value="receivable">{t('ledger.receivable')}</option>
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
              <option value="none">{t('customer.name')}</option>
              <option value="a-z">A–Z</option>
              <option value="z-a">Z–A</option>
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
              <option value="highest">{t('common.highToLow')}</option>
              <option value="lowest">{t('common.lowToHigh')}</option>
            </select>
          </div>

          <input
            type="text"
            placeholder={t('customer.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid #cbd5f5',
              marginBottom: 10,
            }}
          />

          {/* 👇 existing customers list yahan آئے گی (next phase) */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            {(activeTab === 'active' ? activeCustomers : hiddenCustomers).map((customer) => {
              const balance = Number(customer.balance) || 0;
              const balanceColor = balance > 0 ? '#16a34a' : balance < 0 ? '#dc2626' : '#6b7280';

              return (
                <div
                  key={customer._id}
                  onClick={() => {
                    setSelectedCustomerId(customer._id);
                    setSelectedIndex(
                      (activeTab === 'active' ? activeCustomers : hiddenCustomers).findIndex(
                        (c) => c._id === customer._id
                      )
                    );
                    loadCustomerLedger(customer._id);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 10,
                    marginBottom: 6,
                    position: 'relative',
                    cursor: 'pointer',
                    background: selectedCustomerId === customer._id ? '#eef2ff' : '#ffffff',
                    border:
                      selectedCustomerId === customer._id
                        ? '1px solid #6366f1'
                        : '1px solid #e5e7eb',
                  }}
                >
                  {/* LEFT */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{customer.name}</div>
                    <div
                      style={{
                        fontSize: 14, // 👈 font بڑا
                        fontWeight: 800, // 👈 تھوڑا bold
                        color: balanceColor,
                        marginTop: 2,
                      }}
                    >
                      Rs. {balance.toFixed(2)}
                    </div>
                  </div>

                  {/* RIGHT ACTIONS */}
                  {selectedCustomerId === customer._id && customer.phone && (
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
                        onClick={(e) => handleEditClick(e, customer)}
                        style={{
                          fontSize: 10,
                          padding: '2px 4px',
                          borderRadius: 6,
                          border: '1px solid #3b82f6',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {t('edit')}
                      </button>

                      <button
                        onClick={(e) => handleDeleteClick(e, customer._id)}
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
                        <FaTrash size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();

                          sendWhatsAppReminder({
                            phone: customer.phone,
                            customerName: customer.name,
                            balance: Number(customer.balance || 0).toFixed(2),
                            businessName: 'Your Business',
                            mobile: '',
                            lang: getCurrentLanguage(),
                          });
                        }}
                        style={{
                          fontSize: 12,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid #22c55e',
                          background: '#ecfdf5',
                          color: '#16a34a',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        <FaWhatsapp size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {activeTab === 'active' && searchTerm.trim() !== '' && activeCustomers.length === 0 && (
            <div
              style={{
                marginTop: 12,
                padding: '10px',
                borderRadius: 8,
                border: '1px dashed #94a3b8',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#f8fafc',
                fontSize: 13,
                fontWeight: 600,
                color: '#2563eb',
              }}
              onClick={() => {
                setEditingCustomer({
                  name: searchTerm,
                  type: 'regular',
                  openingBalance: 0,
                });
                setShowForm(true);
              }}
            >
              + {t('customer.addNew')} “{searchTerm}”
            </div>
          )}
        </div>
        {/* ========= RIGHT: LEDGER PLACEHOLDER (FIXED) ========= */}
        <div
          style={{
            flex: 1,
            padding: 16,
            display: isMobile && !selectedCustomerId ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {!selectedCustomerId && (
            <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 40 }}>
              {t('customer.selectToViewLedger')}
            </div>
          )}

          {ledgerLoading && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>{t('ledger.loading')}</div>
          )}

          {!ledgerLoading && ledgerData && (
            <>
              {/* 🔒 FIXED LEDGER HEADER */}
              <CustomerLedgerHeader
                customers={customers}
                cid={selectedCustomerId}
                setCid={setSelectedCustomerId}
                pageSize={10}
                setPageSize={() => {}}
                print={() => window.print()}
                name={ledgerData?.customerName || ''}
                start={ledgerStartDate}
                end={ledgerEndDate}
                setStart={setLedgerStartDate}
                setEnd={setLedgerEndDate}
                customerName={customerName}
                setCustomerName={setCustomerName}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                load={(id, s, e) => loadCustomerLedger(id)}
                setSearch={setLedgerSearch}
                setPage={() => {}}
                navigate={navigate}
                opening={ledgerData?.openingBalance || 0}
                dateFilteredLedger={ledgerData?.ledger || []}
                isMobile={isMobile}
                onBack={() => setSelectedCustomerId('')}
                totalDebit={(ledgerData?.ledger || []).reduce((sum, e) => sum + (e.debit || 0), 0)}
                totalCredit={(ledgerData?.ledger || []).reduce(
                  (sum, e) => sum + (e.credit || 0),
                  0
                )}
                closingBalance={closing}
                balanceStatus={
                  closing > 0
                    ? t('ledger.receivable')
                    : closing < 0
                      ? t('ledger.advance')
                      : t('ledger.settled')
                }
                balanceColor={closingColor}
              />

              {/* 🔽 ONLY LEDGER ROWS SCROLL */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                <LedgerTable
                  ledgerData={ledgerData.ledger || []}
                  search={ledgerSearch}
                  openingBalance={ledgerData.openingBalance || 0}
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
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: 20,
              width: 380,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>{t('alerts.confirmAction')}</h3>

            <p style={{ fontSize: 14, color: '#374151' }}>
              {t('alerts.confirmDeleteCustomer')}
              <br />
              <br />• {t('alerts.customerHiddenExplanation')} <b>{t('common.hidden')}</b>.
              <br />• {t('alerts.customerPermanentDelete')} <b>{t('alerts.permanentlyDeleted')}</b>.
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                marginTop: 20,
              }}
            >
              <button
                onClick={cancelDelete}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {t('common.no')}
              </button>

              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {t('common.yesContinue')}
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
                  background: '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                🔄
              </div>

              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{t('customer.mergeCustomers')}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {t('customer.mergeDescription')}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              {t('customer.mergeWarning')}
              <br />
              <br />
              {t('customer.mergeIfContinue')}
              <br />• {t('customer.mergeMoveTransactions')}
              <br />• {t('customer.mergeHideSource')}
              <br />• {t('customer.mergeCannotUndo')}
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
                {t('cancel')}
              </button>

              <button
                onClick={async () => {
                  try {
                    await confirmMergeCustomers(mergeData, token);

                    setShowMergeConfirm(false);
                    setMergeData(null);
                    setShowForm(false);
                    setEditingCustomer(null);

                    loadCustomers();
                    alert(t('alerts.mergeFailed'));
                  } catch (err) {
                    console.error(err);
                    alert(t('alerts.mergeFailed'));
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                }}
              >
                {t('customer.yesMerge')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default CustomersPage;
