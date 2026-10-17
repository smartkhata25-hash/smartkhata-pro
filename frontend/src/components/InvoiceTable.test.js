import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InvoiceTable from './InvoiceTable';
import { roundMoney } from '../utils/money';

jest.mock('./ProductDropdown', () => function MockProductDropdown() {
  return <input aria-label="product" />;
});

jest.mock('../i18n/i18n', () => ({
  t: (key) => key,
}));

const populatedItem = (overrides = {}) => ({
  search: 'Test product',
  name: 'Test product',
  productId: 'product-1',
  description: '',
  cost: 750,
  quantity: 3,
  rate: 20,
  amount: 60,
  ...overrides,
});

const PurchaseTableHarness = ({ initialItem }) => {
  const [items, setItems] = useState([initialItem]);

  const handleQtyRateChange = (index, field, value) => {
    setItems((currentItems) => {
      const updated = [...currentItems];
      const numericValue = Number(value);

      updated[index][field] = Number.isFinite(numericValue) ? numericValue : 0;

      if (field === 'quantity' || field === 'rate') {
        updated[index].amount = roundMoney(
          (updated[index].quantity || 0) * (updated[index].rate || 0)
        );
      }

      return updated;
    });
  };

  return (
    <InvoiceTable
      items={items}
      setItems={setItems}
      products={[]}
      handleQtyRateChange={handleQtyRateChange}
      clearOnFocus={() => {}}
      mode="purchase"
    />
  );
};

const purchaseInputs = () => screen.getAllByRole('spinbutton').slice(0, 4);

describe('purchase invoice amount editing', () => {
  test('calculates rounded purchase cost while preserving amount and sale price', () => {
    render(<PurchaseTableHarness initialItem={populatedItem()} />);

    const [, , amountInput] = purchaseInputs();
    fireEvent.change(amountInput, { target: { value: '100' } });

    const [, costInput, updatedAmountInput, salePriceInput] = purchaseInputs();
    expect(costInput).toHaveValue(33.33);
    expect(updatedAmountInput).toHaveValue(100);
    expect(salePriceInput).toHaveValue(750);
  });

  test('recalculates amount when quantity or purchase cost changes', () => {
    render(
      <PurchaseTableHarness
        initialItem={populatedItem({ quantity: 5, rate: 20, amount: 100 })}
      />
    );

    const [, costInput] = purchaseInputs();
    fireEvent.change(costInput, { target: { value: '250' } });

    expect(purchaseInputs()[2]).toHaveValue(1250);
  });

  test('handles zero quantity without producing an invalid purchase cost', () => {
    render(
      <PurchaseTableHarness
        initialItem={populatedItem({ quantity: 0, rate: 0, amount: 0 })}
      />
    );

    fireEvent.change(purchaseInputs()[2], { target: { value: '500' } });

    const [, costInput, amountInput] = purchaseInputs();
    expect(costInput).toHaveValue(null);
    expect(amountInput).toHaveValue(500);
  });
});
