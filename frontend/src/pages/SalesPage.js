// src/pages/SalesPage.js
import React from 'react';
import { useSearchParams } from 'react-router-dom'; // ✅ Add this
import InvoiceForm from '../components/InvoiceForm';

export default function SalesPage() {
  const token = localStorage.getItem('token'); // ✅ Get token from localStorage
  const [searchParams] = useSearchParams(); // ✅ Get URL query params

  const invoiceId = searchParams.get('invoiceId'); // ✅ Read invoiceId from URL

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl mb-4">📦 Sales & Invoicing</h2>
      <InvoiceForm token={token} invoiceId={invoiceId} /> {/* ✅ Pass invoiceId as prop */}
    </div>
  );
}
