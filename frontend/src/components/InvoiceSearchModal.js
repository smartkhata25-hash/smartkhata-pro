import React, { useState, useEffect } from 'react';
import { searchInvoices } from '../services/salesService';
import { fetchCustomers } from '../services/customerService';
import { t } from '../i18n/i18n';

const InvoiceSearchModal = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState({
    billNo: '',
    customerName: '',
    customerPhone: '',
    startDate: '',
    endDate: '',
  });

  const [results, setResults] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);

  useEffect(() => {
    fetchCustomers().then(setAllCustomers);
  }, []);

  const handleChange = (e) => {
    setQuery({ ...query, [e.target.name]: e.target.value });
  };

  const handleCustomerInput = (e) => {
    const value = e.target.value;
    handleChange(e); // maintain form state

    if (value.trim() === '') {
      setCustomerSuggestions([]);
      setSelectedCustomerIndex(-1);
    } else {
      const filtered = allCustomers.filter(
        (c) => c.name.toLowerCase().includes(value.toLowerCase()) || c.phone.includes(value)
      );
      setCustomerSuggestions(filtered);
      setSelectedCustomerIndex(-1);
    }
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
        setQuery((q) => ({
          ...q,
          customerName: selected.name,
          customerPhone: selected.phone,
        }));
        setCustomerSuggestions([]);
      }
    }
  };

  const handleSearch = async () => {
    try {
      const searchString = Object.entries(query)
        .filter(([_, v]) => v.trim())
        .map(([k, v]) => `${k}:${v.trim()}`)
        .join(' ');

      if (!searchString) return alert(t('alerts.searchFieldRequired'));

      const data = await searchInvoices(searchString);
      setResults(data);
    } catch (err) {
      console.error('Search error:', err);
      alert(t('alerts.searchFailed'));
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white rounded p-6 w-full max-w-md relative">
        <h3 className="text-lg font-semibold mb-4">🔍 {t('findInvoice')}</h3>

        <div className="grid grid-cols-1 gap-3 mb-4 relative">
          <input
            type="text"
            name="billNo"
            placeholder={t('billNo')}
            value={query.billNo}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <div className="relative">
            <input
              type="text"
              name="customerName"
              placeholder={t('customerName')}
              value={query.customerName}
              onChange={handleCustomerInput}
              onKeyDown={handleCustomerKeyDown}
              className="border p-2 rounded w-full"
              autoComplete="off"
            />

            {customerSuggestions.length > 0 && (
              <ul className="absolute z-10 bg-white border mt-1 w-full max-h-40 overflow-auto rounded shadow">
                {customerSuggestions.map((c, i) => (
                  <li
                    key={i}
                    onClick={() => {
                      setQuery((q) => ({
                        ...q,
                        customerName: c.name,
                        customerPhone: c.phone,
                      }));
                      setCustomerSuggestions([]);
                    }}
                    style={{
                      backgroundColor: selectedCustomerIndex === i ? '#e0f2fe' : 'white',
                      fontWeight: selectedCustomerIndex === i ? 'bold' : 'normal',
                      padding: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    {c.name} – {c.phone}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            type="text"
            name="customerPhone"
            placeholder={t('phone')}
            value={query.customerPhone}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="startDate"
            value={query.startDate}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="endDate"
            value={query.endDate}
            onChange={handleChange}
            className="border p-2 rounded"
          />
        </div>

        <div className="flex justify-between mb-4">
          <button type="button" onClick={handleSearch} className="btn btn-primary">
            🔍 {t('search')}
          </button>

          <button
            type="button"
            onClick={() => {
              setQuery({
                billNo: '',
                customerName: '',
                customerPhone: '',
                startDate: '',
                endDate: '',
              });
              setResults([]);
              setCustomerSuggestions([]);
            }}
            className="btn btn-warning text-black"
          >
            🧹 {t('clear')}
          </button>

          <button type="button" onClick={onClose} className="btn btn-secondary">
            ❌ {t('close')}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="max-h-64 overflow-y-auto border rounded">
            {results.map((inv) => (
              <li
                key={inv._id}
                onClick={() => onSelect(inv)}
                className="p-2 hover:bg-blue-100 cursor-pointer border-b"
              >
                {inv.billNo} - {inv.customerName} (
                {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-GB') : ''})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default InvoiceSearchModal;
