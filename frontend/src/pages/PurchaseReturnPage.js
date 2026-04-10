import React from 'react';
import { useParams } from 'react-router-dom';
import PurchaseReturnForm from '../components/PurchaseReturnForm';

export default function PurchaseReturnPage() {
  const token = localStorage.getItem('token');
  const { id } = useParams(); // اگر URL میں :id ہو

  return (
    <div className="container mx-auto p-4">
      <PurchaseReturnForm token={token} key={id || 'new'} />
    </div>
  );
}
