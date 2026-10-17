import {
  openBackendPrintWindow,
  reserveBackendPrintWindow,
} from './backendPrintDocument';

const originalFetch = global.fetch;

const createPrintWindow = () => ({
  closed: false,
  close: jest.fn(),
  focus: jest.fn(),
  print: jest.fn(),
  document: {
    open: jest.fn(),
    write: jest.fn(),
    close: jest.fn(),
  },
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

test('reserved print window is opened synchronously and shows a preparation message', () => {
  const targetWindow = createPrintWindow();
  const openSpy = jest.spyOn(window, 'open').mockReturnValue(targetWindow);

  expect(reserveBackendPrintWindow()).toBe(targetWindow);
  expect(openSpy).toHaveBeenCalledTimes(1);
  expect(targetWindow.document.write).toHaveBeenCalledWith(
    expect.stringContaining('Preparing invoice')
  );
});

test('print after an asynchronous save reuses the reserved window', async () => {
  jest.useFakeTimers();
  const targetWindow = createPrintWindow();
  const openSpy = jest.spyOn(window, 'open');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => '<html><body>Invoice</body></html>',
  });

  await openBackendPrintWindow({
    url: '/api/travel/print/bookings/booking-1/print',
    targetWindow,
  });
  targetWindow.onload();

  expect(openSpy).not.toHaveBeenCalled();
  expect(targetWindow.document.write).toHaveBeenCalledWith(
    '<html><body>Invoice</body></html>'
  );
  expect(targetWindow.print).toHaveBeenCalledTimes(1);
});
