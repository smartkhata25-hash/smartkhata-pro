import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createCounterparty, listCounterparties } from '../../services/weavingCommercialService';
import WeavingCounterpartySelect from './WeavingCounterpartySelect';

jest.mock('../../utils/permissionHelper', () => ({ hasPermission: () => true }));
jest.mock('../../services/weavingCommercialService', () => ({
  createCounterparty: jest.fn(),
  listCounterparties: jest.fn(),
  mergeCounterparties: jest.fn(),
  updateCounterparty: jest.fn(),
}));

test('keyboard Add Details opens the shared full form, saves, refreshes and selects', async () => {
  listCounterparties.mockResolvedValue([]);
  createCounterparty.mockResolvedValue({ _id: 'supplier-1', name: 'New Mill', role: 'supplier' });
  const onChange = jest.fn();
  const onPartySaved = jest.fn();

  render(
    <WeavingCounterpartySelect
      label="Supplier / Party"
      parties={[]}
      context="supplier"
      value=""
      onChange={onChange}
      onPartySaved={onPartySaved}
    />
  );

  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'New Mill' } });
  expect(screen.getByRole('option', { name: 'Add Supplier / Party “New Mill”' })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Name *')).toHaveValue('New Mill');
  expect(screen.getByLabelText('Phone')).toBeInTheDocument();
  expect(screen.getByLabelText('Opening Balance')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));

  await waitFor(() => expect(onPartySaved).toHaveBeenCalledWith(expect.objectContaining({ _id: 'supplier-1' })));
  expect(onChange).toHaveBeenCalledWith(
    'supplier-1',
    expect.objectContaining({ _id: 'supplier-1' })
  );
});
