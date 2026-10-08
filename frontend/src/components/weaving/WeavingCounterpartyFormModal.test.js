import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  createCounterparty,
  listCounterparties,
  mergeCounterparties,
  updateCounterparty,
} from '../../services/weavingCommercialService';
import WeavingCounterpartyFormModal, {
  buildCounterpartyUpgradePayload,
} from './WeavingCounterpartyFormModal';
import { filterCounterparties } from './WeavingCounterpartySelect';

jest.mock('../../services/weavingCommercialService', () => ({
  createCounterparty: jest.fn(),
  listCounterparties: jest.fn(),
  mergeCounterparties: jest.fn(),
  updateCounterparty: jest.fn(),
}));

const existing = {
  _id: 'party-1',
  name: 'Acme Textiles',
  role: 'supplier',
  serviceTypes: [],
  phone: '03001234567',
  email: 'accounts@acme.test',
  address: 'Industrial Area',
  openingBalance: 750,
  openingDate: '2026-01-05',
  balanceType: 'payable',
  notes: 'keep every field',
};

beforeEach(() => {
  jest.clearAllMocks();
  listCounterparties.mockResolvedValue([]);
});

test('full shared form creates every Parties field and respects contextual types', async () => {
  const saved = { _id: 'new-1', name: 'New Supplier', role: 'supplier' };
  createCounterparty.mockResolvedValue(saved);
  const onSaved = jest.fn();
  const onClose = jest.fn();

  render(
    <WeavingCounterpartyFormModal
      initialName="New Supplier"
      initialType="supplier"
      allowedTypes={['supplier', 'both']}
      launchContext="supplier"
      canCreate
      canEdit
      onSaved={onSaved}
      onClose={onClose}
    />
  );

  expect(screen.getByLabelText('Party Type')).toHaveTextContent('Supplier');
  expect(screen.getByLabelText('Party Type')).not.toHaveTextContent('Customer');
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '03009999999' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.local' } });
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Karachi' } });
  fireEvent.change(screen.getByLabelText('Opening Balance'), { target: { value: '250' } });
  fireEvent.change(screen.getByLabelText('Opening Date'), { target: { value: '2026-10-07' } });
  fireEvent.change(screen.getByLabelText('Balance Type'), { target: { value: 'payable' } });
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'full details' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));

  await waitFor(() => expect(createCounterparty).toHaveBeenCalledTimes(1));
  expect(createCounterparty).toHaveBeenCalledWith(expect.objectContaining({
    name: 'New Supplier',
    role: 'supplier',
    phone: '03009999999',
    email: 'new@test.local',
    address: 'Karachi',
    openingBalance: '250',
    openingDate: '2026-10-07',
    balanceType: 'payable',
    notes: 'full details',
  }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  expect(onClose).toHaveBeenCalled();
});

test('Make Party upgrades the same record without losing stored details', async () => {
  listCounterparties.mockResolvedValue([existing]);
  updateCounterparty.mockResolvedValue({ ...existing, role: 'both' });
  const onSaved = jest.fn();

  render(
    <WeavingCounterpartyFormModal
      initialName="  ACME   TEXTILES "
      initialType="customer"
      allowedTypes={['customer', 'both']}
      launchContext="customer"
      canCreate
      canEdit
      onSaved={onSaved}
      onClose={jest.fn()}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Make Party' }));
  await waitFor(() => expect(updateCounterparty).toHaveBeenCalledTimes(1));
  expect(updateCounterparty).toHaveBeenCalledWith(
    existing._id,
    expect.objectContaining({
      role: 'both',
      phone: existing.phone,
      email: existing.email,
      address: existing.address,
      openingBalance: existing.openingBalance,
      openingDate: existing.openingDate,
      balanceType: existing.balanceType,
      notes: existing.notes,
    })
  );
  expect(createCounterparty).not.toHaveBeenCalled();
});

test('sizing upgrade rules preserve supplier role and promote customer role', () => {
  expect(buildCounterpartyUpgradePayload(existing, 'sizing')).toEqual(
    expect.objectContaining({ role: 'supplier', serviceTypes: ['sizing'] })
  );
  expect(buildCounterpartyUpgradePayload({ ...existing, role: 'customer' }, 'sizing')).toEqual(
    expect.objectContaining({ role: 'both', serviceTypes: ['sizing'] })
  );
  expect(buildCounterpartyUpgradePayload({ ...existing, role: 'both', serviceTypes: ['dyeing'] }, 'sizing')).toEqual(
    expect.objectContaining({ role: 'both', serviceTypes: ['dyeing', 'sizing'] })
  );
  expect(buildCounterpartyUpgradePayload(existing, 'customer')).toEqual(
    expect.objectContaining({ role: 'both', serviceTypes: [] })
  );
  expect(buildCounterpartyUpgradePayload({ ...existing, role: 'customer' }, 'supplier')).toEqual(
    expect.objectContaining({ role: 'both', openingBalance: 750, phone: existing.phone })
  );
});

test('Keep Separate leaves the full form open and does not mutate the duplicate', async () => {
  listCounterparties.mockResolvedValue([existing]);
  render(
    <WeavingCounterpartyFormModal
      initialName="Acme Textiles"
      initialType="customer"
      launchContext="customer"
      canCreate
      canEdit
      onClose={jest.fn()}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Keep Separate' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Please use a slightly different name');
  expect(updateCounterparty).not.toHaveBeenCalled();
  expect(createCounterparty).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));
  expect(await screen.findByRole('button', { name: 'Make Party' })).toBeInTheDocument();
  expect(updateCounterparty).not.toHaveBeenCalled();
  expect(createCounterparty).not.toHaveBeenCalled();
});

test('normal Parties duplicate flow retains the existing merge workflow', async () => {
  listCounterparties.mockResolvedValue([existing]);
  createCounterparty.mockResolvedValue({ ...existing, _id: 'source-1' });
  mergeCounterparties.mockResolvedValue({ target: existing });

  render(
    <WeavingCounterpartyFormModal
      initialName="Acme Textiles"
      initialType="supplier"
      launchContext="parties"
      canCreate
      canEdit
      canMerge
      onClose={jest.fn()}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));
  await waitFor(() => expect(mergeCounterparties).toHaveBeenCalledWith('source-1', existing._id));
});

test('context filters exclude sizing records but retain a legacy selected record', () => {
  const customer = { _id: 'customer', role: 'customer', serviceTypes: [] };
  const supplier = { _id: 'supplier', role: 'supplier', serviceTypes: [] };
  const sizing = { _id: 'sizing', role: 'supplier', serviceTypes: ['sizing'] };

  expect(filterCounterparties([customer, supplier, sizing], 'customer').map((row) => row._id))
    .toEqual(['customer']);
  expect(filterCounterparties([customer, supplier, sizing], 'customer', 'sizing').map((row) => row._id))
    .toEqual(['customer', 'sizing']);
  expect(filterCounterparties([customer, supplier, sizing], 'sizing').map((row) => row._id))
    .toEqual(['sizing']);
});
