import {
  isPublicAuthenticationRequest,
  shouldHandleSessionExpiry,
} from './authRequestPolicy';

test.each([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
])('recognizes public authentication request %s', (url) => {
  expect(isPublicAuthenticationRequest(url)).toBe(true);
});

test('incorrect login 401 is not treated as an expired session', () => {
  expect(
    shouldHandleSessionExpiry({
      response: { status: 401 },
      config: { url: '/api/auth/login', headers: {} },
    })
  ).toBe(false);
});

test('authenticated API 401 is treated as an expired session', () => {
  expect(
    shouldHandleSessionExpiry({
      response: { status: 401 },
      config: {
        url: '/api/customers',
        headers: { Authorization: 'Bearer expired-token' },
      },
    })
  ).toBe(true);
});
