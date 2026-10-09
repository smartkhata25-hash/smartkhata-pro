jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }));

const axios = require('axios');
const { getTrialBalance } = require('./journalService');

describe('getTrialBalance', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'scope-token');
    axios.get.mockResolvedValue({ data: { trialBalance: [] } });
  });

  afterEach(() => jest.clearAllMocks());

  test.each(['trading', 'travel', 'weaving'])('sends explicit %s module scope and date range', async (moduleScope) => {
    await getTrialBalance('2026-10-01', '2026-10-09', { moduleScope });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/journal/trial-balance'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer scope-token' },
        params: { moduleScope, startDate: '2026-10-01', endDate: '2026-10-09' },
      })
    );
  });

  test('keeps a one-sided date filter instead of silently dropping it', async () => {
    await getTrialBalance('2026-10-01', '', { moduleScope: 'travel' });
    expect(axios.get.mock.calls[0][1].params).toEqual({
      moduleScope: 'travel',
      startDate: '2026-10-01',
    });
  });
});
