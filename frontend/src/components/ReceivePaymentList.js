// src/components/ReceivePaymentList.js

import React, { useCallback, useEffect, useState } from 'react';
import { getAllReceivePayments, deleteReceivePayment } from '../services/receivePaymentService';
import { fetchCustomers } from '../services/customerService';
import { fetchSaleParties } from '../services/partyService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const ReceivePaymentList = () => {
  const [payments, setPayments] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);

  const [filters, setFilters] = useState({
    customer: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const navigate = useNavigate();
  const canViewReceivePayments = hasPermission('receive_payments.view');
  const canCreateReceivePayments = hasPermission('receive_payments.create');
  const canEditReceivePayments = hasPermission('receive_payments.edit');
  const canDeleteReceivePayments = hasPermission('receive_payments.delete');

  const getPaymentTotal = useCallback((p) => {
    if (Array.isArray(p.paymentEntries) && p.paymentEntries.length > 0) {
      return p.paymentEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    }

    return Number(p.amount || 0);
  }, []);

  const getPaymentTypes = useCallback((p) => {
    if (Array.isArray(p.paymentEntries) && p.paymentEntries.length > 0) {
      return p.paymentEntries
        .map((e) => e.paymentType)
        .filter(Boolean)
        .join(', ');
    }

    return p.paymentType || p.paymentMode || '-';
  }, []);

  const getAccountNames = useCallback((p) => {
    if (Array.isArray(p.paymentEntries) && p.paymentEntries.length > 0) {
      return p.paymentEntries
        .map((e) => e.account?.name || e.accountName)
        .filter(Boolean)
        .join(', ');
    }

    return p.account?.name || p.accountName || '-';
  }, []);

  const getPartyOrCustomerName = useCallback(
    (p) => {
      const partyId = typeof p.partyId === 'object' ? p.partyId?._id : p.partyId;

      if (partyId) {
        const partyName =
          p.partyId?.name || parties.find((party) => String(party._id) === String(partyId))?.name;

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      return p.customer?.name || '-';
    },
    [parties]
  );

  const fetchData = useCallback(async () => {
    try {
      const paymentData = await getAllReceivePayments();
      const customerData = await fetchCustomers();
      const partyData = await fetchSaleParties();

      setPayments(Array.isArray(paymentData) ? paymentData : []);
      setCustomers(Array.isArray(customerData) ? customerData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
      setFiltered(Array.isArray(paymentData) ? paymentData : []);
    } catch (err) {
      alert(err.message);
    }
  }, []);

  useEffect(() => {
    if (!canViewReceivePayments) {
      navigate('/dashboard');
      return;
    }

    fetchData();
  }, [fetchData, canViewReceivePayments, navigate]);

  useEffect(() => {
    let result = [...payments];

    if (filters.customer) {
      result = result.filter((p) => {
        const partyId = typeof p.partyId === 'object' ? p.partyId?._id : p.partyId;
        const customerId = typeof p.customer === 'object' ? p.customer?._id : p.customer;

        return (
          String(customerId || '') === String(filters.customer) ||
          String(partyId || '') === String(filters.customer)
        );
      });
    }

    if (filters.paymentType) {
      result = result.filter((p) =>
        getPaymentTypes(p).toLowerCase().includes(filters.paymentType.toLowerCase())
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      result = result.filter(
        (p) =>
          p.description?.toLowerCase().includes(q) ||
          getPaymentTotal(p).toString().includes(q) ||
          getAccountNames(p).toLowerCase().includes(q) ||
          getPartyOrCustomerName(p).toLowerCase().includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((p) => new Date(p.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((p) => new Date(p.date) <= new Date(filters.toDate));
    }

    setFiltered(result);
  }, [
    filters,
    payments,
    getPaymentTotal,
    getPaymentTypes,
    getAccountNames,
    getPartyOrCustomerName,
  ]);

  const handleDelete = async (id) => {
    if (!canDeleteReceivePayments) {
      alert('You do not have permission to delete receive payments');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await deleteReceivePayment(id);
      fetchData();
    } catch (err) {
      alert(t('alerts.deletePaymentFailed') + ': ' + err.message);
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('payment.payments')}</h2>

        {canCreateReceivePayments && (
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => navigate('/receive-payments/new')}
          >
            {t('payment.new')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <select
          value={filters.customer}
          onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">Customers / Parties</option>

          {customers.map((c) => (
            <option key={`customer-${c._id}`} value={c._id}>
              {c.name}
            </option>
          ))}

          {parties.map((p) => (
            <option key={`party-${p._id}`} value={p._id}>
              {p.name} 🟣 Party
            </option>
          ))}
        </select>

        <select
          value={filters.paymentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('payment.allTypes')}</option>
          <option value="Cash">{t('payment.cash')}</option>
          <option value="Online">{t('payment.online')}</option>
          <option value="Cheque">{t('payment.cheque')}</option>
        </select>

        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
          className="border rounded p-2"
        />

        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
          className="border rounded p-2"
        />

        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder={t('search')}
          className="border rounded p-2"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('date')}</th>
              <th className="border p-2">{t('customer')}</th>
              <th className="border p-2">{t('expense.paymentMode')}</th>
              <th className="border p-2">{t('account')}</th>
              <th className="border p-2">{t('amount')}</th>
              <th className="border p-2">{t('description')}</th>
              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((p) => (
              <tr key={p._id} className="text-center">
                <td className="border p-2">
                  {p.date ? new Date(p.date).toLocaleDateString() : '-'}
                </td>

                <td className="border p-2">{getPartyOrCustomerName(p)}</td>

                <td className="border p-2 capitalize">{getPaymentTypes(p)}</td>

                <td className="border p-2">{getAccountNames(p)}</td>

                <td className="border p-2 text-center">{getPaymentTotal(p).toFixed(2)}</td>

                <td className="border p-2">{p.description || '-'}</td>

                <td className="border p-2">
                  <div className="flex gap-2 justify-center">
                    {canEditReceivePayments && (
                      <button
                        className="bg-yellow-400 px-2 py-1 rounded"
                        onClick={() => navigate(`/receive-payments/edit/${p._id}`)}
                      >
                        {t('edit')}
                      </button>
                    )}

                    {canDeleteReceivePayments && (
                      <button
                        className="bg-red-600 text-white px-2 py-1 rounded"
                        onClick={() => handleDelete(p._id)}
                      >
                        {t('delete')}
                      </button>
                    )}

                    {!canEditReceivePayments && !canDeleteReceivePayments && (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-4">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReceivePaymentList;
