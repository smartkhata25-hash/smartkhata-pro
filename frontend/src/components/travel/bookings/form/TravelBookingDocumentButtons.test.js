import { fireEvent, render, screen } from '@testing-library/react';
import TravelBookingDocumentButtons from './TravelBookingDocumentButtons';

test('renders accessible Print and PDF actions and forwards clicks', () => {
  const onPrint = jest.fn();
  const onPdf = jest.fn();
  render(<TravelBookingDocumentButtons onPrint={onPrint} onPdf={onPdf} />);

  fireEvent.click(screen.getByRole('button', { name: 'Print Invoice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download Invoice PDF' }));

  expect(onPrint).toHaveBeenCalledTimes(1);
  expect(onPdf).toHaveBeenCalledTimes(1);
});

test('disables both document actions during an active operation', () => {
  render(<TravelBookingDocumentButtons disabled onPrint={jest.fn()} onPdf={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'Print Invoice' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Download Invoice PDF' })).toBeDisabled();
});
