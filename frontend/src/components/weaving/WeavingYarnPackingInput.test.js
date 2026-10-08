import fs from 'fs';
import path from 'path';
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { requestWeavingConfirmation } from './WeavingFeedbackModal';
import WeavingYarnPackingInput from './WeavingYarnPackingInput';

jest.mock('./WeavingFeedbackModal', () => ({
  requestWeavingConfirmation: jest.fn(),
}));

const profile = {
  packageType: 'bag',
  packageWeight: 100,
  smallConesPerPackage: 40,
  largeConesPerPackage: 24,
};

const startingRow = {
  packageType: 'bag',
  packageQty: '',
  packageQtyInput: '',
  packageWeight: 100,
  smallConesPerPackage: 40,
  largeConesPerPackage: 24,
  smallCones: 0,
  largeCones: 0,
  coneRows: [{ qty: '', type: '' }],
};

const Harness = ({ initial = startingRow }) => {
  const [row, setRow] = useState(initial);
  const [feedback, setFeedback] = useState('');
  return (
    <>
      <WeavingYarnPackingInput
        row={row}
        profiles={[profile]}
        onChange={(patch) => setRow((value) => ({ ...value, ...patch }))}
        onFeedback={setFeedback}
      />
      <output data-testid="packing-state">{JSON.stringify(row)}</output>
      <output data-testid="feedback">{feedback}</output>
    </>
  );
};

const state = () => JSON.parse(screen.getByTestId('packing-state').textContent);

beforeEach(() => {
  jest.clearAllMocks();
  requestWeavingConfirmation.mockResolvedValue(true);
});

test('string shorthand preserves 5.10 and commits five packages plus ten untyped cones', () => {
  render(<Harness />);
  const quantity = screen.getByLabelText('Package Quantity');
  fireEvent.change(quantity, { target: { value: '5.10' } });

  expect(quantity).toHaveValue('5.10');
  expect(screen.getByLabelText('Cone Qty 1')).toHaveValue('10');
  expect(state()).toEqual(expect.objectContaining({ packageQty: '5', smallCones: 0, largeCones: 0 }));

  fireEvent.blur(quantity);
  expect(quantity).toHaveValue('5');
});

test('base row adds at most one distinct second row and only the second row is removable', () => {
  render(<Harness />);
  expect(screen.getAllByLabelText(/Cone Qty/)).toHaveLength(1);
  expect(screen.queryByLabelText(/Remove .* cone row/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Add another cone type'));
  expect(screen.getByTestId('feedback')).toHaveTextContent('Enter the first Cone Qty');

  fireEvent.change(screen.getByLabelText('Cone Qty 1'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Cone Type 1'), { target: { value: 'small' } });
  fireEvent.click(screen.getByLabelText('Add another cone type'));

  expect(screen.getAllByLabelText(/Cone Qty/)).toHaveLength(2);
  expect(screen.queryByLabelText('Add another cone type')).not.toBeInTheDocument();
  expect(within(screen.getByLabelText('Cone Type 2')).getByRole('option', { name: 'Small' })).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Cone Qty 2'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Cone Type 2'), { target: { value: 'large' } });
  expect(state()).toEqual(expect.objectContaining({ smallCones: 10, largeCones: 4 }));

  fireEvent.click(screen.getByLabelText('Remove Large cone row'));
  expect(screen.getAllByLabelText(/Cone Qty/)).toHaveLength(1);
  expect(state()).toEqual(expect.objectContaining({ smallCones: 10, largeCones: 0 }));
});

test('configured threshold asks before converting cones into full packages', async () => {
  render(<Harness initial={{ ...startingRow, packageQty: '5', packageQtyInput: '5' }} />);
  fireEvent.change(screen.getByLabelText('Cone Qty 1'), { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText('Cone Type 1'), { target: { value: 'large' } });

  await waitFor(() => expect(requestWeavingConfirmation).toHaveBeenCalledWith(expect.objectContaining({
    message: expect.stringContaining('24 Large Cones make 1 full Bag'),
  })));
  await waitFor(() => expect(state()).toEqual(expect.objectContaining({
    packageQty: '6',
    largeCones: 1,
  })));
});

test('both Yarn Purchase UI locations use the same packing component', () => {
  const purchaseSource = fs.readFileSync(
    path.resolve(__dirname, '../../pages/weaving/WeavingPurchasePage.js'),
    'utf8'
  );
  expect((purchaseSource.match(/<WeavingYarnPackingInput/g) || [])).toHaveLength(2);
  expect(purchaseSource).not.toMatch(/'Small Cones',\s*<input|'Large Cones',\s*<input/);
});
