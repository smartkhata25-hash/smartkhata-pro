import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { prepareBookingForForm } from '../travelBookingConfig';
import TravelerDuplicateConfirmationModal from './TravelerDuplicateConfirmationModal';
import {
  appendTravelerOccurrence,
  buildTravelerOccurrences,
  getTravelerAddDecision,
  removeTravelerOccurrence,
  updateTravelerDetailOccurrence,
} from './travelerOccurrenceUtils';

const travelerA = '64f000000000000000000001';
const travelerB = '64f000000000000000000002';

const DuplicateSelectionHarness = () => {
  const [ids, setIds] = React.useState([]);
  const [pending, setPending] = React.useState(false);
  const select = () => {
    if (getTravelerAddDecision(ids, travelerA).duplicate) setPending(true);
    else setIds((current) => [...current, travelerA]);
  };

  return (
    <>
      <button type="button" onClick={select}>Select A</button>
      <span data-testid="count">{ids.length}</span>
      <TravelerDuplicateConfirmationModal
        open={pending}
        travelerName="Muhammad Arshad"
        onCancel={() => setPending(false)}
        onAddAgain={() => {
          setIds((current) => [...current, travelerA]);
          setPending(false);
        }}
      />
    </>
  );
};

test('first selection adds immediately while repeated ID requests confirmation without a limit', () => {
  let item = { itemType: 'service', travelerIds: [] };
  expect(getTravelerAddDecision(item.travelerIds, travelerA).duplicate).toBe(false);
  item = appendTravelerOccurrence(item, travelerA);
  expect(getTravelerAddDecision(item.travelerIds, travelerA).duplicate).toBe(true);
  item = appendTravelerOccurrence(item, travelerA);
  item = appendTravelerOccurrence(item, travelerA);
  expect(item.travelerIds).toEqual([travelerA, travelerA, travelerA]);
  expect(buildTravelerOccurrences(item.travelerIds).map((row) => row.key)).toEqual([
    `${travelerA}:0`, `${travelerA}:1`, `${travelerA}:2`,
  ]);
});

test('duplicate detection uses traveler ID, not the display name', () => {
  expect(getTravelerAddDecision([travelerA], travelerB).duplicate).toBe(false);
});

test('confirmation modal exposes Cancel and Add Again actions', () => {
  const onCancel = jest.fn();
  const onAddAgain = jest.fn();
  render(
    <TravelerDuplicateConfirmationModal
      open
      travelerName="Muhammad Arshad"
      onCancel={onCancel}
      onAddAgain={onAddAgain}
    />
  );

  expect(screen.getByText('Traveler Already Selected')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toHaveTextContent('Muhammad Arshad is already selected');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Again' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onAddAgain).toHaveBeenCalledTimes(1);
});

test('Cancel keeps one occurrence while repeated Add Again choices reach three', () => {
  render(<DuplicateSelectionHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Select A' }));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Select A' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByTestId('count')).toHaveTextContent('1');

  fireEvent.click(screen.getByRole('button', { name: 'Select A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Again' }));
  expect(screen.getByTestId('count')).toHaveTextContent('2');
  fireEvent.click(screen.getByRole('button', { name: 'Select A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Again' }));
  expect(screen.getByTestId('count')).toHaveTextContent('3');
});

test('removing one occurrence preserves order and only its aligned detail row', () => {
  const item = {
    itemType: 'air_ticket',
    travelerIds: [travelerA, travelerB, travelerA],
    ticketDetails: {
      passengerTickets: [
        { travelerId: travelerA, pnr: 'FIRST' },
        { travelerId: travelerB, pnr: 'MIDDLE' },
        { travelerId: travelerA, pnr: 'LAST' },
      ],
    },
  };
  const withoutLast = removeTravelerOccurrence(item, 2);
  expect(withoutLast.travelerIds).toEqual([travelerA, travelerB]);
  expect(withoutLast.ticketDetails.passengerTickets.map((row) => row.pnr)).toEqual(['FIRST', 'MIDDLE']);

  const withoutFirst = removeTravelerOccurrence({ ...item, travelerIds: [travelerA, travelerA], ticketDetails: { passengerTickets: [item.ticketDetails.passengerTickets[0], item.ticketDetails.passengerTickets[2]] } }, 0);
  expect(withoutFirst.travelerIds).toEqual([travelerA]);
  expect(withoutFirst.ticketDetails.passengerTickets[0].pnr).toBe('LAST');
});

test('air ticket and visa duplicate occurrence rows edit and hydrate independently', () => {
  const ids = [travelerA, travelerA];
  let tickets = updateTravelerDetailOccurrence(ids, [], 0, { pnr: 'FIRST', ticketNumber: 'T1' });
  tickets = updateTravelerDetailOccurrence(ids, tickets, 1, { pnr: 'SECOND', ticketNumber: 'T2' });
  let visas = updateTravelerDetailOccurrence(ids, [], 0, { passportNumber: 'P1', reference: 'V1' });
  visas = updateTravelerDetailOccurrence(ids, visas, 1, { passportNumber: 'P2', reference: 'V2' });

  const air = prepareBookingForForm({ bookingItems: [{ itemType: 'air_ticket', travelerIds: ids, ticketDetails: { passengerTickets: tickets } }] });
  const visa = prepareBookingForForm({ bookingItems: [{ itemType: 'visit_visa', travelerIds: ids, visaDetails: { travelerVisas: visas } }] });
  expect(air.bookingItems[0].travelerIds).toEqual(ids);
  expect(air.bookingItems[0].ticketDetails.passengerTickets.map((row) => row.pnr)).toEqual(['FIRST', 'SECOND']);
  expect(visa.bookingItems[0].travelerVisas).toBeUndefined();
  expect(visa.bookingItems[0].visaDetails.travelerVisas.map((row) => row.reference)).toEqual(['V1', 'V2']);
});
