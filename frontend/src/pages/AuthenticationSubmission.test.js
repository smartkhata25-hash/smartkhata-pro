import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import { login, register } from '../services/authService';

const mockNavigate = jest.fn();

jest.mock('../services/authService', () => ({
  login: jest.fn(),
  register: jest.fn(),
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  window.alert.mockRestore();
});

test('login stays locked during a slow request and sends only once', async () => {
  const request = deferred();
  login.mockReturnValue(request.promise);
  render(<LoginPage />);

  const button = screen.getByRole('button', { name: /login/i });
  const form = button.closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(login).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();

  await act(async () => request.resolve({ msg: 'Invalid credentials' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^login$/i })).toBeEnabled());
});

test('registration stays locked and sends only one request', async () => {
  const request = deferred();
  register.mockReturnValue(request.promise);
  render(<RegisterPage />);

  const button = screen.getByRole('button', { name: /^register$/i });
  const form = button.closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(register).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /registering/i })).toBeDisabled();

  await act(async () => request.resolve({ msg: 'Registration failed' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^register$/i })).toBeEnabled());
});

test('successful registration uses the HashRouter login route', async () => {
  register.mockResolvedValue({ msg: 'User registered successfully' });
  render(<RegisterPage />);

  fireEvent.submit(screen.getByRole('button', { name: /^register$/i }).closest('form'));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  expect(register).toHaveBeenCalledTimes(1);
});

test('forgot-password sends only one OTP request and restores the button on failure', async () => {
  const request = deferred();
  global.fetch = jest.fn(() => request.promise);
  render(<ForgotPassword />);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'user@example.com' } });
  const button = screen.getByRole('button', { name: /continue/i });
  fireEvent.submit(button.closest('form'));
  fireEvent.submit(button.closest('form'));

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /sending code/i })).toBeDisabled();

  await act(async () => request.resolve({ ok: false, json: async () => ({ msg: 'Failed' }) }));
  await waitFor(() => expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled());
  expect(screen.getByRole('textbox')).toHaveValue('user@example.com');
});

test('OTP verification sends only one request while pending', async () => {
  sessionStorage.setItem('resetPasswordEmail', 'user@example.com');
  const request = deferred();
  global.fetch = jest.fn(() => request.promise);
  render(<ResetPassword />);

  fireEvent.change(screen.getByPlaceholderText(/otp|verification/i), {
    target: { value: '123456' },
  });
  const button = screen.getByRole('button', { name: /verify otp/i });
  fireEvent.submit(button.closest('form'));
  fireEvent.submit(button.closest('form'));

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();

  await act(async () => request.resolve({ ok: false, json: async () => ({ msg: 'Invalid' }) }));
  await waitFor(() => expect(screen.getByRole('button', { name: /verify otp/i })).toBeEnabled());
});

test('password reset sends only one request while pending', async () => {
  sessionStorage.setItem('resetPasswordEmail', 'user@example.com');
  sessionStorage.setItem('resetPasswordToken', 'reset-token');
  const request = deferred();
  global.fetch = jest.fn(() => request.promise);
  render(<ResetPassword />);

  const passwordInputs = screen.getAllByPlaceholderText(/password/i);
  fireEvent.change(passwordInputs[0], { target: { value: 'secret12' } });
  fireEvent.change(passwordInputs[1], { target: { value: 'secret12' } });
  const button = screen.getByRole('button', { name: /^reset password$/i });
  fireEvent.submit(button.closest('form'));
  fireEvent.submit(button.closest('form'));

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /resetting password/i })).toBeDisabled();

  await act(async () => request.resolve({ ok: false, json: async () => ({ msg: 'Failed' }) }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^reset password$/i })).toBeEnabled());
  expect(passwordInputs[0]).toHaveValue('secret12');
  expect(passwordInputs[1]).toHaveValue('secret12');
});
