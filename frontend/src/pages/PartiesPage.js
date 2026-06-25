import React, { useCallback, useEffect, useState } from 'react';
import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';
import PartyForm from '../components/PartyForm';
import PartyLedgerHeader from '../components/PartyLedgerHeader';
import {
  fetchParties,
  addParty,
  updateParty,
  deleteParty,
  convertPartyToCustomer,
  convertPartyToSupplier,
} from '../services/partyService';
import { getPartyLedger } from '../services/partyLedgerService';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { t } from '../i18n/i18n';

const PartiesPage = () => {
  const [parties, setParties] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('active');

  const [showForm, setShowForm] = useState(false);
  const [editingParty, setEditingParty] = useState(null);

  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [selectedPartyName, setSelectedPartyName] = useState('');

  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');

  const [showLedgerSuggestions, setShowLedgerSuggestions] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const loadParties = useCallback(async () => {
    try {
      const data = await fetchParties();
      setParties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Party load failed:', err);
      alert(t('alerts.partyListLoadFailed'));
    }
  }, []);

  useEffect(() => {
    loadParties();
  }, [loadParties]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const loadPartyLedger = async (partyId, startDate = ledgerStartDate, endDate = ledgerEndDate) => {
    if (!partyId) return;

    setLedgerLoading(true);

    try {
      const data = await getPartyLedger(partyId, startDate, endDate);
      setLedgerData(data);
    } catch (err) {
      console.error('Party ledger load failed:', err);
      setLedgerData(null);
      alert(t('alerts.partyLedgerLoadFailed'));
    }

    setLedgerLoading(false);
  };

  const handleAddClick = () => {
    setEditingParty(null);
    setShowForm(true);
  };

  const handleEditClick = (e, party) => {
    e.stopPropagation();
    setEditingParty(party);
    setShowForm(true);
  };

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (!deleteId) return;

      await deleteParty(deleteId);

      setShowConfirm(false);
      setDeleteId(null);

      if (selectedPartyId === deleteId) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      await loadParties();
    } catch (err) {
      console.error('Party delete failed:', err);
      alert(t('alerts.partyDeleteFailed'));
    }
  };

  const handleConvertToCustomer = async (e, party) => {
    e.stopPropagation();

    if (!window.confirm(`${party.name} کو Customer میں convert کرنا ہے؟`)) return;

    try {
      await convertPartyToCustomer(party._id);
      await loadParties();

      if (selectedPartyId === party._id) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      alert('Party customer میں convert ہو گئی');
    } catch (err) {
      alert(err?.response?.data?.message || 'Convert failed');
    }
  };

  const handleConvertToSupplier = async (e, party) => {
    e.stopPropagation();

    if (!window.confirm(`${party.name} کو Supplier میں convert کرنا ہے؟`)) return;

    try {
      await convertPartyToSupplier(party._id);
      await loadParties();

      if (selectedPartyId === party._id) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      alert('Party supplier میں convert ہو گئی');
    } catch (err) {
      alert(err?.response?.data?.message || 'Convert failed');
    }
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (editingParty?._id) {
        await updateParty(editingParty._id, formData);
      } else {
        await addParty(formData);
      }

      setShowForm(false);
      setEditingParty(null);

      await loadParties();

      if (selectedPartyId) {
        await loadPartyLedger(selectedPartyId);
      }
    } catch (err) {
      console.error('Party save failed:', err);
      alert(err?.response?.data?.message || t('alerts.partySaveFailed'));
    }
  };

  const filteredParties = parties
    .filter((p) => {
      const q = searchTerm.toLowerCase().trim();

      const searchOk =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.email?.toLowerCase().includes(q);

      const roleOk = roleFilter === 'all' || p.role === roleFilter;

      const activeOk = activeTab === 'active' ? p.isActive !== false : p.isActive === false;

      return searchOk && roleOk && activeOk;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const closing = ledgerData?.ledger?.length
    ? Number(ledgerData.ledger[ledgerData.ledger.length - 1].runningBalance || 0)
    : Number(ledgerData?.openingBalance || 0);

  const totalDebit = (ledgerData?.ledger || []).reduce((sum, e) => sum + Number(e.debit || 0), 0);

  const totalCredit = (ledgerData?.ledger || []).reduce((sum, e) => sum + Number(e.credit || 0), 0);

  const getRoleLabel = (role) => {
    if (role === 'customer') return t('customer');
    if (role === 'supplier') return t('supplier');
    return t('both');
  };

  const getRoleColor = (role) => {
    if (role === 'customer') return '#2563eb';
    if (role === 'supplier') return '#7c3aed';
    return '#059669';
  };

  return (
    <PageLayout>
      {showForm && (
        <PartyForm
          initialData={editingParty}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingParty(null);
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
        {/* LEFT LIST */}
        <div
          style={{
            width: isMobile ? '100%' : '22%',
            minWidth: isMobile ? '100%' : 280,
            borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
            padding: 12,
            overflow: 'hidden',
            display: isMobile && selectedPartyId ? 'none' : 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleAddClick}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #2563eb',
                background: '#2563eb',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + {t('add')}
            </button>

            <button
              onClick={() => setActiveTab('active')}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: activeTab === 'active' ? '#eef2ff' : '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('active')}
            </button>

            <button
              onClick={() => setActiveTab('hidden')}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: activeTab === 'hidden' ? '#eef2ff' : '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('hidden')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                height: 32,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                padding: '0 6px',
                fontSize: 12,
                width: 110,
              }}
            >
              <option value="all">{t('all')}</option>
              <option value="customer">{t('customer')}</option>
              <option value="supplier">{t('supplier')}</option>
              <option value="both">{t('both')}</option>
            </select>

            <button
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('all');
                setActiveTab('active');
              }}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #dc2626',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('clear')}
            </button>
          </div>

          <input
            type="text"
            placeholder={t('party.searchParty')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              marginBottom: 10,
            }}
          />

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {activeTab === 'active' && searchTerm.trim() !== '' && filteredParties.length === 0 && (
              <div
                onClick={() => {
                  setEditingParty(null);
                  setShowForm(true);

                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent('quick-party-fill', {
                        detail: {
                          name: searchTerm,
                          role: 'both',
                          openingBalance: 0,
                        },
                      })
                    );
                  }, 50);
                }}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px dashed #94a3b8',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: '#f8fafc',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#2563eb',
                }}
              >
                + {t('add')} “{searchTerm}”
              </div>
            )}

            {filteredParties.map((party) => {
              const balance = Number(party.balance || 0);
              const balanceColor = balance > 0 ? '#16a34a' : balance < 0 ? '#dc2626' : '#6b7280';

              return (
                <div
                  key={party._id}
                  onClick={() => {
                    setSelectedPartyId(party._id);
                    setSelectedPartyName(party.name);
                    loadPartyLedger(party._id);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    marginBottom: 6,
                    cursor: 'pointer',
                    position: 'relative',
                    background: selectedPartyId === party._id ? '#eef2ff' : '#fff',
                    border:
                      selectedPartyId === party._id ? '1px solid #6366f1' : '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ paddingRight: 70 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {party.name}
                      {party.isActive === false && (
                        <span style={{ color: '#dc2626', fontSize: 11 }}>{t('hidden')}</span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: getRoleColor(party.role),
                        fontWeight: 700,
                      }}
                    >
                      🟣 {getRoleLabel(party.role)}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: balanceColor,
                        marginTop: 3,
                      }}
                    >
                      Rs. {balance.toFixed(2)}
                    </div>
                  </div>

                  {(selectedPartyId === party._id || isMobile) && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => handleEditClick(e, party)}
                        style={iconButton('#3b82f6', '#eff6ff', '#1d4ed8')}
                      >
                        <FaEdit size={12} />
                      </button>

                      <button
                        onClick={(e) => handleDeleteClick(e, party._id)}
                        style={iconButton('#ef4444', '#fef2f2', '#b91c1c')}
                      >
                        <FaTrash size={12} />
                      </button>
                      <button
                        onClick={(e) => handleConvertToCustomer(e, party)}
                        style={iconButton('#16a34a', '#f0fdf4', '#15803d')}
                        title="Convert to Customer"
                      >
                        C
                      </button>

                      <button
                        onClick={(e) => handleConvertToSupplier(e, party)}
                        style={iconButton('#7c3aed', '#f5f3ff', '#6d28d9')}
                        title="Convert to Supplier"
                      >
                        S
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT LEDGER */}
        <div
          style={{
            flex: 1,
            padding: 16,
            display: isMobile && !selectedPartyId ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {!selectedPartyId && (
            <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 40 }}>
              {t('party.selectToViewLedger')}
            </div>
          )}

          {ledgerLoading && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>{t('ledger.loadingLedger')}</div>
          )}

          {!ledgerLoading && ledgerData && (
            <>
              <PartyLedgerHeader
                parties={parties}
                partyId={selectedPartyId}
                setPartyId={setSelectedPartyId}
                start={ledgerStartDate}
                end={ledgerEndDate}
                setStart={setLedgerStartDate}
                setEnd={setLedgerEndDate}
                load={loadPartyLedger}
                setSearch={setLedgerSearch}
                navigate={null}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                closingBalance={closing}
                balanceStatus={
                  closing > 0
                    ? t('ledger.receivable')
                    : closing < 0
                      ? t('ledger.payable')
                      : t('ledger.settled')
                }
                balanceColor={closing > 0 ? '#16a34a' : closing < 0 ? '#dc2626' : '#6b7280'}
                isMobile={isMobile}
                onBack={() => {
                  setSelectedPartyId('');
                  setSelectedPartyName('');
                  setLedgerData(null);
                }}
                partyName={selectedPartyName}
                setPartyName={setSelectedPartyName}
                showSuggestions={showLedgerSuggestions}
                setShowSuggestions={setShowLedgerSuggestions}
                printSize="A5"
              />

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <LedgerTable
                  ledgerData={ledgerData.ledger || []}
                  search={ledgerSearch}
                  openingBalance={ledgerData.openingBalance || 0}
                  onDelete={null}
                  onEdit={(entry) => {
                    const type = entry.sourceType?.toLowerCase();

                    if (type === 'sale_invoice' && entry.invoiceId) {
                      window.location.hash = `#/create-sale?invoiceId=${entry.invoiceId}`;
                    } else if (type === 'purchase_invoice' && entry.invoiceId) {
                      window.location.hash = `#/purchase-invoice/${entry.invoiceId}`;
                    } else if (type === 'receive_payment' && entry.referenceId) {
                      window.location.hash = `#/receive-payments/edit/${entry.referenceId}`;
                    } else if (type === 'pay_bill' && entry.referenceId) {
                      window.location.hash = `#/pay-bills/edit/${entry.referenceId}`;
                    } else if (type === 'refund_invoice' && entry.invoiceId) {
                      window.location.hash = `#/refunds/edit/${entry.invoiceId}`;
                    } else if (type === 'purchase_return' && entry.invoiceId) {
                      window.location.hash = `#/purchase-returns/edit/${entry.invoiceId}`;
                    } else {
                      alert(t('alerts.entryNotEditable'));
                    }
                  }}
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
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 22,
              width: 380,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 800 }}>{t('common.confirmAction')}</h3>

            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              {t('party.deleteWarning')}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setDeleteId(null);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                {t('no')}
              </button>

              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {t('yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

const iconButton = (border, bg, color) => ({
  width: 26,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${border}`,
  background: bg,
  color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
});

export default PartiesPage;
