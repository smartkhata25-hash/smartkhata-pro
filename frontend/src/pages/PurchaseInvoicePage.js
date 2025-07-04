import React from 'react';
import PurchaseInvoiceForm from '../components/PurchaseInvoiceForm';

const PurchaseInvoicePage = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">خریداری انوائس درج کریں</h1>
      <PurchaseInvoiceForm />
    </div>
  );
};

export default PurchaseInvoicePage;
