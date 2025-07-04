// pages/ProductLedgerPage.js
import React from 'react';
import { useParams } from 'react-router-dom';
import ProductLedger from '../components/ProductLedger';

const ProductLedgerPage = () => {
  const { productId } = useParams();

  return (
    <div style={{ padding: '20px' }}>
      <ProductLedger productId={productId} />
    </div>
  );
};

export default ProductLedgerPage;
