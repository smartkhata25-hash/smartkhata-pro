jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
}));

import {
  getWeavingPaymentPdfUrl,
  getWeavingPaymentPrintUrl,
} from './weavingCommercialService';

describe('Weaving payment receipt endpoints', () => {
  test('builds read-only print and PDF URLs for the saved transaction ID', () => {
    expect(getWeavingPaymentPrintUrl('transaction-123')).toMatch(
      /\/api\/weaving\/commercial\/payments\/transaction-123\/print$/
    );
    expect(getWeavingPaymentPdfUrl('transaction-123')).toMatch(
      /\/api\/weaving\/commercial\/payments\/transaction-123\/pdf$/
    );
  });
});
