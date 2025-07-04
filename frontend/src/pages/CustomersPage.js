// 📁 src/pages/CustomersPage.js

import React, { useEffect, useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';

import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService';
import CustomerForm from '../components/CustomerForm';

const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [tempFilterType, setTempFilterType] = useState(filterType);
  const [tempSortBy, setTempSortBy] = useState(sortBy);

  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const loadCustomers = useCallback(async () => {
    try {
      const data = await getCustomers(token);
      console.log('Fetched Customers from API:', data);
      setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  }, [token]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

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
      alert('❌ Failed to delete customer.');
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

      if (editingCustomer) {
        await updateCustomer(editingCustomer._id, finalData);
      } else {
        await addCustomer(finalData);
      }

      setShowForm(false);
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Customer form submission failed:', error);
      alert('❌ Failed to save customer. Please try again.');
    }
  };

  const applyFilters = () => {
    setFilterType(tempFilterType);
    setSortBy(tempSortBy);
    setShowFilters(false);
  };

  const filteredCustomers = customers
    .filter((customer) => {
      const term = searchTerm.toLowerCase();
      return (
        customer.name.toLowerCase().includes(term) ||
        (customer.email && customer.email.toLowerCase().includes(term)) ||
        (customer.phone && customer.phone.toLowerCase().includes(term))
      );
    })
    .filter((customer) => {
      const balance = Number(customer.balance) || 0;
      if (filterType === 'receivable') return balance > 0;
      if (filterType === 'payable') return balance < 0;
      if (filterType === 'settled') return balance === 0;
      return true;
    })
    .sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const balanceA = Number(a.balance) || 0;
      const balanceB = Number(b.balance) || 0;
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);

      if (sortBy === 'a-z') return nameA.localeCompare(nameB);
      if (sortBy === 'z-a') return nameB.localeCompare(nameA);
      if (sortBy === 'highest') return balanceB - balanceA;
      if (sortBy === 'lowest') return balanceA - balanceB;
      if (sortBy === 'oldest') return dateA - dateB;
      return dateB - dateA;
    });

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text(`Customer List – ${new Date().toLocaleDateString()}`, 14, 15);
    const tableData = filteredCustomers.map((c, index) => [
      index + 1,
      c.name,
      c.type,
      c.email || '-',
      c.phone || '-',
      (Number(c.balance) || 0).toFixed(2),
    ]);

    autoTable(doc, {
      head: [['#', 'Name', 'Type', 'Email', 'Phone', 'Balance']],
      body: tableData,
      startY: 20,
    });

    doc.save('Customer_List.pdf');
  };

  return (
    <div className="customers-page" style={{ padding: '20px' }}>
      <h2>Customers</h2>
      <button onClick={handleAddClick}>Add Customer</button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '15px 0',
          gap: '10px',
        }}
      >
        <input
          type="text"
          placeholder="Search by name, email or phone"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px',
            flex: 1,
            minWidth: '250px',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
            }}
          >
            Filters
          </button>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterType('all');
              setSortBy('recent');
              setTempFilterType('all');
              setTempSortBy('recent');
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
            }}
          >
            Clear
          </button>
          <button
            onClick={generatePDF}
            style={{
              padding: '6px 12px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
            }}
          >
            PDF
          </button>
        </div>
      </div>

      {showFilters && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '15px',
            maxWidth: '400px',
          }}
        >
          <h4>Filter By</h4>
          <select
            value={tempFilterType}
            onChange={(e) => setTempFilterType(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          >
            <option value="all">All</option>
            <option value="receivable">Receivable</option>
            <option value="payable">Payable</option>
            <option value="settled">Settled</option>
          </select>

          <h4>Sort By</h4>
          <select
            value={tempSortBy}
            onChange={(e) => setTempSortBy(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          >
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest</option>
            <option value="a-z">Name (A–Z)</option>
            <option value="z-a">Name (Z–A)</option>
            <option value="highest">Highest Balance</option>
            <option value="lowest">Lowest Balance</option>
          </select>

          <button
            onClick={applyFilters}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
            }}
          >
            View Result
          </button>
        </div>
      )}

      {showForm && (
        <CustomerForm
          onSubmit={handleFormSubmit}
          initialData={editingCustomer}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {filteredCustomers.map((customer) => (
          <li
            key={customer._id}
            onClick={() => navigate(`/customer-ledger/${customer._id}`)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              borderBottom: '1px solid #ddd',
              padding: '10px 0',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{customer.name}</strong> ({customer.type})
                <span style={{ marginLeft: '10px' }}>📞 {customer.phone || 'No phone'}</span>
              </div>
              <div>
                💰 <strong>Balance: {(Number(customer.balance) || 0).toFixed(2)}</strong>
              </div>
            </div>
            <div style={{ fontSize: '0.9em', color: '#666' }}>{customer.email || 'No email'}</div>
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(e, customer);
                }}
              >
                Edit
              </button>{' '}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(e, customer._id);
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '10px',
              textAlign: 'center',
            }}
          >
            <p>Are you sure you want to delete this customer?</p>
            <button onClick={confirmDelete}>Yes</button> <button onClick={cancelDelete}>No</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
