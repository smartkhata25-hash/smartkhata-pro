import React, { useCallback, useEffect, useRef, useState } from 'react';
import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';
import PartyForm from '../components/PartyForm';
import PartyLedgerHeader from '../components/PartyLedgerHeader';
import {
  fetchParties,
  addParty,
  updateParty,
  deleteParty,
  restoreParty,
  convertPartyToCustomer,
  convertPartyToSupplier,
} from '../services/partyService';
import { getPartyLedger } from '../services/partyLedgerService';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { useNavigate } from 'react-router-dom';
import usePageMemory from '../hooks/usePageMemory';

const PARTY_PAGE_DEFAULTS = {
  searchTerm: '',
  roleFilter: 'all',
  activeTab: 'active',

  selectedPartyId: '',
  selectedPartyName: '',

  ledgerSearch: '',
  ledgerStartDate: '',
  ledgerEndDate: '',
};

const PartiesPage = () => {
  const navigate = useNavigate();

  const canViewParties = hasPermission('parties.view');
  const canCreateParties = hasPermission('parties.create');
  const canEditParties = hasPermission('parties.edit');
  const canDeleteParties = hasPermission('parties.delete');
  const canRestoreParties = hasPermission('parties.restore');
  const canConvertParties = hasPermission('parties.convert');
  const canViewPartyLedger = hasPermission('parties.view_ledger');
  const ledgerRestoreRef = useRef(false);
  const [parties, setParties] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingParty, setEditingParty] = useState(null);

  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showLedgerSuggestions, setShowLedgerSuggestions] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const {
    state: pageMemory,
    updateField: updatePageField,
    resetFields: resetPageFields,
  } = usePageMemory('parties_page_state', PARTY_PAGE_DEFAULTS, {
    expiryHours: 24,
    delay: 350,
  });

  const {
    searchTerm,
    roleFilter,
    activeTab,

    selectedPartyId,
    selectedPartyName,

    ledgerSearch,
    ledgerStartDate,
    ledgerEndDate,
  } = pageMemory;

  const setSearchTerm = useCallback(
    (value) => updatePageField('searchTerm', value),
    [updatePageField]
  );

  const setRoleFilter = useCallback(
    (value) => updatePageField('roleFilter', value),
    [updatePageField]
  );

  const setActiveTab = useCallback(
    (value) => updatePageField('activeTab', value),
    [updatePageField]
  );

  const setSelectedPartyId = useCallback(
    (value) => updatePageField('selectedPartyId', value || ''),
    [updatePageField]
  );

  const setSelectedPartyName = useCallback(
    (value) => updatePageField('selectedPartyName', value || ''),
    [updatePageField]
  );

  const setLedgerSearch = useCallback(
    (value) => updatePageField('ledgerSearch', value),
    [updatePageField]
  );

  const setLedgerStartDate = useCallback(
    (value) => updatePageField('ledgerStartDate', value),
    [updatePageField]
  );

  const setLedgerEndDate = useCallback(
    (value) => updatePageField('ledgerEndDate', value),
    [updatePageField]
  );

  useEffect(() => {
    if (!canViewParties) {
      navigate('/dashboard');
    }
  }, [canViewParties, navigate]);

  const loadParties = useCallback(async () => {
    if (!canViewParties) {
      return;
    }

    try {
      const data = await fetchParties({
        status: activeTab === 'hidden' ? 'hidden' : 'active',
      });

      setParties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Party load failed:', err);
      setParties([]);
      alert(t('alerts.partyListLoadFailed'));
    }
  }, [canViewParties, activeTab]);
  useEffect(() => {
    loadParties();
  }, [loadParties]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const loadPartyLedger = useCallback(
    async (partyId, startDate = ledgerStartDate, endDate = ledgerEndDate) => {
      if (!partyId) {
        setLedgerData(null);
        return;
      }

      if (!canViewPartyLedger) {
        alert('You do not have permission to view party ledger');
        return;
      }

      setLedgerLoading(true);

      try {
        const data = await getPartyLedger(partyId, startDate || '', endDate || '');

        setLedgerData(data || null);
      } catch (err) {
        console.error('Party ledger load failed:', err);

        setLedgerData(null);

        alert(t('alerts.partyLedgerLoadFailed'));
      } finally {
        setLedgerLoading(false);
      }
    },
    [ledgerStartDate, ledgerEndDate, canViewPartyLedger]
  );

  useEffect(() => {
    if (ledgerRestoreRef.current) return;
    if (!selectedPartyId) return;
    if (parties.length === 0) return;

    const selectedParty = parties.find((party) => String(party._id) === String(selectedPartyId));

    if (!selectedParty) {
      setSelectedPartyId('');
      setSelectedPartyName('');
      setLedgerData(null);

      ledgerRestoreRef.current = true;

      return;
    }

    ledgerRestoreRef.current = true;

    setSelectedPartyName(selectedParty.name || '');

    loadPartyLedger(selectedPartyId, ledgerStartDate, ledgerEndDate);
  }, [
    parties,
    selectedPartyId,
    ledgerStartDate,
    ledgerEndDate,
    loadPartyLedger,
    setSelectedPartyId,
    setSelectedPartyName,
  ]);

  useEffect(() => {
    if (!selectedPartyId || parties.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      const selectedElement = document.getElementById(`party-${selectedPartyId}`);

      selectedElement?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'auto',
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedPartyId, parties]);

  const handleAddClick = () => {
    if (!canCreateParties) {
      alert('You do not have permission to create parties');
      return;
    }

    setEditingParty(null);
    setShowForm(true);
  };

  const handleEditClick = (e, party) => {
    e.stopPropagation();

    if (!canEditParties) {
      alert('You do not have permission to edit parties');
      return;
    }

    setEditingParty(party);
    setShowForm(true);
  };

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();

    if (!canDeleteParties) {
      alert('You do not have permission to delete parties');
      return;
    }

    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!canDeleteParties) {
      alert('You do not have permission to delete parties');
      return;
    }

    try {
      if (!deleteId) return;

      const deletedPartyId = deleteId;

      await deleteParty(deletedPartyId);

      setShowConfirm(false);
      setDeleteId(null);

      if (selectedPartyId === deletedPartyId) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      setActiveTab('hidden');
    } catch (err) {
      console.error('Party delete failed:', err);
      alert(t('alerts.partyDeleteFailed'));
    }
  };

  const handleConvertToCustomer = async (e, party) => {
    e.stopPropagation();

    if (!canConvertParties) {
      alert('You do not have permission to convert parties');
      return;
    }

    if (!window.confirm(`${party.name} کو Customer میں convert کرنا ہے؟`)) return;

    try {
      await convertPartyToCustomer(party._id);

      if (selectedPartyId === party._id) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      setActiveTab('hidden');

      alert('Party customer میں convert ہو گئی');
    } catch (err) {
      alert(err?.response?.data?.message || 'Convert failed');
    }
  };

  const handleConvertToSupplier = async (e, party) => {
    e.stopPropagation();

    if (!canConvertParties) {
      alert('You do not have permission to convert parties');
      return;
    }

    if (!window.confirm(`${party.name} کو Supplier میں convert کرنا ہے؟`)) return;

    try {
      await convertPartyToSupplier(party._id);

      if (selectedPartyId === party._id) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      setActiveTab('hidden');

      alert('Party supplier میں convert ہو گئی');
    } catch (err) {
      alert(err?.response?.data?.message || 'Convert failed');
    }
  };

  const handleRestoreParty = async (e, party) => {
    e.stopPropagation();

    if (!canRestoreParties) {
      alert('You do not have permission to restore parties');
      return;
    }

    if (party.hiddenReason && party.hiddenReason !== 'deleted') {
      alert('Converted یا Merged Party restore نہیں ہو سکتی');
      return;
    }

    if (!window.confirm(`${party.name} کو دوبارہ Active کرنا ہے؟`)) {
      return;
    }

    try {
      await restoreParty(party._id);

      if (selectedPartyId === party._id) {
        setSelectedPartyId('');
        setSelectedPartyName('');
        setLedgerData(null);
      }

      setActiveTab('active');

      alert('Party restore ہو گئی');
    } catch (err) {
      alert(err?.response?.data?.message || 'Party restore failed');
    }
  };

  const handleFormSubmit = async (formData) => {
    if (editingParty?._id && !canEditParties) {
      alert('You do not have permission to edit parties');
      return;
    }

    if (!editingParty?._id && !canCreateParties) {
      alert('You do not have permission to create parties');
      return;
    }

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

      return searchOk && roleOk;
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
            {canCreateParties && (
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
            )}
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
                resetPageFields(['searchTerm', 'roleFilter', 'activeTab']);
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
            {canCreateParties &&
              activeTab === 'active' &&
              searchTerm.trim() !== '' &&
              filteredParties.length === 0 && (
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
                  id={`party-${party._id}`}
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
                  <div style={{ paddingInlineEnd: 70 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {party.name}

                      {party.isActive === false && (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 10,
                            fontWeight: 700,
                            color:
                              party.hiddenReason === 'deleted'
                                ? '#dc2626'
                                : party.hiddenReason === 'converted'
                                  ? '#7c3aed'
                                  : '#6b7280',
                          }}
                        >
                          {party.hiddenReason === 'deleted'
                            ? 'Deleted'
                            : party.hiddenReason === 'converted'
                              ? 'Converted'
                              : party.hiddenReason === 'merged'
                                ? 'Merged'
                                : 'Hidden'}
                        </div>
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
                        insetInlineEnd: 8,
                        bottom: 8,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {party.isActive !== false && (
                        <>
                          {canEditParties && (
                            <button
                              onClick={(e) => handleEditClick(e, party)}
                              style={iconButton('#3b82f6', '#eff6ff', '#1d4ed8')}
                              title="Edit"
                            >
                              <FaEdit size={12} />
                            </button>
                          )}
                          {canDeleteParties && (
                            <button
                              onClick={(e) => handleDeleteClick(e, party._id)}
                              style={iconButton('#ef4444', '#fef2f2', '#b91c1c')}
                              title="Delete"
                            >
                              <FaTrash size={12} />
                            </button>
                          )}
                          {canConvertParties && (
                            <button
                              onClick={(e) => handleConvertToCustomer(e, party)}
                              style={iconButton('#16a34a', '#f0fdf4', '#15803d')}
                              title="Convert to Customer"
                            >
                              C
                            </button>
                          )}
                          {canConvertParties && (
                            <button
                              onClick={(e) => handleConvertToSupplier(e, party)}
                              style={iconButton('#7c3aed', '#f5f3ff', '#6d28d9')}
                              title="Convert to Supplier"
                            >
                              S
                            </button>
                          )}
                        </>
                      )}

                      {/* ✅ Restore صرف Deleted Party */}
                      {canRestoreParties &&
                        party.isActive === false &&
                        (!party.hiddenReason || party.hiddenReason === 'deleted') && (
                          <button
                            onClick={(e) => handleRestoreParty(e, party)}
                            style={{
                              height: 26,
                              padding: '0 8px',
                              borderRadius: 6,
                              border: '1px solid #16a34a',
                              background: '#f0fdf4',
                              color: '#15803d',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                            title="Restore Party"
                          >
                            Restore
                          </button>
                        )}
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

          {canViewPartyLedger && !ledgerLoading && ledgerData && (
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
