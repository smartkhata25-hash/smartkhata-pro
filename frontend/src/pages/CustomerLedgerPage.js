// 📁 src/pages/CustomerLedgerPage.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  getLedgerByCustomerId, // ✅ نیا استعمال
  deleteJournalEntry,
} from '../services/customerLedgerService';
import LedgerTable from '../components/LedgerTable';

export default function CustomerLedgerPage() {
  const { customerId } = useParams();
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [cid, setCid] = useState('');
  const [ledger, setLedger] = useState([]);
  const [opening, setOpening] = useState(0);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef();

  // 🔁 Load customers
  useEffect(() => {
    axios
      .get('/api/customers', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setCustomers(res.data))
      .catch(console.error);
  }, [token]);

  // ✅ Load ledger using customerId (not accountId)
  const load = useCallback(
    async (id = cid, s = start, e = end) => {
      if (!id) return;

      const customer = customers.find((c) => c._id === id);
      if (!customer) {
        console.warn('⚠️ Customer not found:', id);
        return;
      }

      setLoading(true);
      try {
        const data = await getLedgerByCustomerId(id, s, e);
        console.log('✅ Loaded ledger entries:', data.ledger);
        setLedger(Array.isArray(data.ledger) ? data.ledger : []);
        setOpening(data.openingBalance || 0);
        setName(customer.name || '');
      } catch (err) {
        console.error('❌ Failed to load ledger:', err);
      }
      setLoading(false);
    },
    [cid, start, end, customers]
  );

  // ✅ Load when customerId is in URL
  useEffect(() => {
    if (customerId && customers.length > 0) {
      setCid(customerId);
      load(customerId, '', '');
    }
  }, [customerId, customers, load]);

  // 🗑 Delete entry
  const del = async (id) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      await deleteJournalEntry(id);
      load();
    }
  };

  // 📄 Export to PDF
  const pdf = () => {
    const doc = new jsPDF();
    doc.text(`Ledger: ${name}`, 14, 15);
    autoTable(doc, {
      head: [['Date', 'Description', 'Debit', 'Credit', 'Balance']],
      body: ledger.map((e) => [
        new Date(e.date).toLocaleDateString(),
        e.description || '-',
        (e.debit || 0).toFixed(2),
        (e.credit || 0).toFixed(2),
        (e.balance || 0).toFixed(2),
      ]),
      startY: 20,
    });
    doc.save(`${name}_ledger.pdf`);
  };

  // 🖨 Print
  const print = () => {
    const w = window.open('', '', 'width=800,height=600');
    if (w && ref.current) {
      w.document.write(`<html><body>${ref.current.innerHTML}</body></html>`);
      w.document.close();
      w.print();
    }
  };

  // 📝 Handle row click for edit
  const handleRowClick = (entry) => {
    if (!entry || entry.isOpening) return;
    if (entry.sourceType === 'invoice' && entry.invoiceId) {
      const confirm = window.confirm(
        'This entry is linked to an invoice. Do you want to edit that invoice?'
      );
      if (confirm) navigate(`/edit-invoice/${entry.invoiceId}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>📘 Customer Ledger</h2>
      {/* 🔽 Customer Selector */}
      <label>Customer:</label>{' '}
      <select
        value={cid}
        onChange={(e) => {
          setCid(e.target.value);
          load(e.target.value);
        }}
      >
        <option value="">--choose--</option>
        {customers.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </select>
      {/* 🔍 Date Filters + Actions */}
      <div style={{ margin: '8px 0' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />{' '}
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />{' '}
        <button onClick={() => load()}>Load</button>{' '}
        <button
          onClick={() => {
            setStart('');
            setEnd('');
            load(cid, '', '');
          }}
        >
          Clear Filter
        </button>{' '}
        <button onClick={print} disabled={!ledger.length}>
          Print
        </button>{' '}
        <button onClick={pdf} disabled={!ledger.length}>
          PDF
        </button>
      </div>
      {/* 📋 Ledger Table */}
      <div ref={ref}>
        <LedgerTable
          ledgerData={ledger}
          openingBalance={opening}
          onDelete={del}
          onRowClick={handleRowClick}
        />
      </div>
      {/* ℹ️ No Data Message */}
      {!loading && cid && ledger.length === 0 && <p>No ledger entries found.</p>}
    </div>
  );
}
