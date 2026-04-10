import React, { useRef } from 'react';
import ProductDropdown from './ProductDropdown';
import { t } from '../i18n/i18n';

const InvoiceTable = ({
  items,
  setItems,
  products,
  handleQtyRateChange,
  clearOnFocus,
  onProductChange,
  historyAutoMode,
  mode = 'sale',
}) => {
  const qtyRefs = useRef([]);
  const rateRefs = useRef([]);
  const itemRefs = useRef([]);

  const blankRow = () => ({
    search: '',
    name: '',
    productId: '',
    description: '',
    cost: 0,
    quantity: 1,
    rate: 0,
    amount: 0,
  });
  const focusItem = (index) => {
    setTimeout(() => {
      itemRefs.current[index]?.focus();
    }, 50);
  };

  return (
    <div className="overflow-x-auto mt-2" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="max-h-[50vh] overflow-y-auto border rounded">
        <table className="w-full border text-xs md:text-sm leading-none">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="border px-2 py-1 md:p-1">#</th>
              <th className="border px-2 py-1 md:p-1 w-[35%]">{t('item')}</th>
              <th className="border px-2 py-1 md:p-1 hidden md:table-cell">{t('description')}</th>
              <th className="border px-2 py-1 md:p-1">{t('cost')}</th>
              <th className="border px-2 py-1 md:p-1">{t('qty')}</th>
              <th className="border px-2 py-1 md:p-1">{t('rate')}</th>
              <th className="border px-2 py-1 md:p-1">
                <div className="flex items-center justify-between">
                  <span>{t('amount')}</span>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="text-xs md:text-sm h-5">
                <td className="border px-1 py-0 md:p-0 text-center">{index + 1}</td>

                {/* ✅ Item */}
                <td className="border px-1 py-0 md:p-0">
                  <ProductDropdown
                    inputRef={(el) => (itemRefs.current[index] = el)}
                    productList={products}
                    value={item.search}
                    onSelect={(product) => {
                      const updated = [...items];
                      const qty = Number(updated[index].quantity) || 1;

                      // ✅ Sale vs Purchase price logic
                      const price =
                        mode === 'purchase' ? product.unitCost || 0 : product.salePrice || 0;

                      updated[index] = {
                        ...updated[index],
                        search: product.name,
                        name: product.name,
                        productId: product._id,
                        description: product.description || '',
                        cost: product.unitCost || 0,
                        rate: price,
                        quantity: qty,
                        amount: qty * price,
                      };

                      onProductChange && onProductChange(product._id);

                      if (index === items.length - 1) {
                        updated.push(blankRow());
                      }

                      setItems(updated);

                      window.dispatchEvent(new CustomEvent('show-history'));

                      setTimeout(() => qtyRefs.current[index]?.focus(), 50);
                    }}
                  />
                </td>

                {/* Description */}
                <td className="border p-1 hidden md:table-cell">
                  <input
                    value={item.description || ''}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[index].description = e.target.value;
                      setItems(updated);
                    }}
                    className="w-full border-0 px-1 py-0.5 md:p-1"
                  />
                </td>

                {/* Cost */}
                <td className="border px-2 py-1 md:p-1 text-center">
                  {mode === 'purchase' ? (
                    <input
                      type="number"
                      value={item.cost || ''}
                      onChange={(e) => handleQtyRateChange(index, 'cost', e.target.value)}
                      onFocus={clearOnFocus}
                      className="w-full border-0 p-0 text-center h-6"
                    />
                  ) : item.cost ? (
                    item.cost.toFixed(2)
                  ) : (
                    '0.00'
                  )}
                </td>

                {/* Qty */}
                <td className="border p-0">
                  <input
                    ref={(el) => (qtyRefs.current[index] = el)}
                    type="number"
                    value={item.quantity || ''}
                    onChange={(e) => handleQtyRateChange(index, 'quantity', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent('close-history'));
                        rateRefs.current[index]?.focus();
                      }
                    }}
                    onFocus={clearOnFocus}
                    className="w-full border-0 p-0 text-center h-6"
                  />
                </td>

                {/* Rate */}
                <td className="border p-0">
                  <input
                    ref={(el) => (rateRefs.current[index] = el)}
                    type="number"
                    value={item.rate || ''}
                    onChange={(e) => handleQtyRateChange(index, 'rate', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusItem(index + 1);
                      }
                    }}
                    onFocus={clearOnFocus}
                    className="w-full border-0 p-0 text-center"
                  />
                </td>

                {/* Amount */}
                <td className="border px-0 py-0 md:p-0 text-center font-semibold">
                  {item.amount ? item.amount.toFixed(2) : '0.00'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvoiceTable;
