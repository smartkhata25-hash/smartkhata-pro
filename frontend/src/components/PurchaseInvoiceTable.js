import React from 'react';

const PurchaseInvoiceTable = ({
  items,
  setItems,
  productSuggestions,
  selectedProductIndexByRow,
  handleSearchChange,
  handleProductKeyDown,
  handleProductSelect,
  handleQtyRateChange,
  handleCostChange,
  clearOnFocus,
}) => {
  return (
    <div className="mt-6">
      {/* 🔷 Table */}
      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">#</th>
              <th className="border p-2">Item</th>
              <th className="border p-2">Description</th>
              <th className="border p-2">Cost</th>
              <th className="border p-2">Qty</th>
              <th className="border p-2">Rate</th>
              <th className="border p-2">Amount</th>
              <th className="border p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="relative">
                <td className="border p-2 text-center">{item.itemNo}</td>
                <td className="border p-2 relative">
                  <input
                    value={item.search || ''}
                    onChange={(e) => handleSearchChange(index, e.target.value)}
                    onKeyDown={(e) => handleProductKeyDown(e, index)}
                    onBlur={() => {
                      if (!item.productId) {
                        const updated = [...items];
                        updated[index] = {
                          itemNo: index + 1,
                          search: '',
                          productId: '',
                          name: '',
                          description: '',
                          cost: 0,
                          quantity: 1,
                          rate: 0,
                          amount: 0,
                        };
                        setItems(updated);
                      }
                    }}
                    className="w-full border-0 p-1"
                    autoComplete="off"
                  />
                  {productSuggestions.filter((p) => p.row === index).length > 0 && (
                    <div className="absolute top-full left-0 z-50 w-60 max-h-48 overflow-auto bg-white border shadow rounded mt-1">
                      {productSuggestions
                        .filter((p) => p.row === index)
                        .map((product, i) => {
                          const isSelected = selectedProductIndexByRow[index] === i;
                          return (
                            <div
                              key={i}
                              onClick={() => handleProductSelect(product, index)}
                              className={`p-2 cursor-pointer hover:bg-green-100 ${
                                isSelected ? 'bg-green-100 font-bold' : ''
                              }`}
                            >
                              {product.name} – Rs. {product.unitCost}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </td>
                <td className="border p-2">
                  <input
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[index].description = e.target.value;
                      setItems(updated);
                    }}
                    className="w-full border-0 p-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={item.cost}
                    onChange={(e) => handleCostChange(index, e.target.value)}
                    onFocus={clearOnFocus}
                    className="w-full border-0 p-1 text-right"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleQtyRateChange(index, 'quantity', e.target.value)}
                    onFocus={clearOnFocus}
                    className="w-full border-0 p-1 text-right"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => handleQtyRateChange(index, 'rate', e.target.value)}
                    onFocus={clearOnFocus}
                    className="w-full border-0 p-1 text-right"
                  />
                </td>
                <td className="border p-2 text-right font-semibold">
                  Rs. {item.amount.toFixed(2)}
                </td>
                <td className="border p-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = items
                        .filter((_, i) => i !== index)
                        .map((item, i) => ({ ...item, itemNo: i + 1 }));
                      setItems(updated);
                    }}
                    className="text-red-600 font-bold"
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseInvoiceTable;
