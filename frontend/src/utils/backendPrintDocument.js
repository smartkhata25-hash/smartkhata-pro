import { getCurrentLanguage } from '../i18n/i18n';

const getToken = () => localStorage.getItem('token');

const buildHeaders = (hasBody = false) => {
  const token = getToken();
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const readErrorMessage = async (response, fallback) => {
  try {
    const data = await response.clone().json();
    return data?.message || data?.error || fallback;
  } catch {
    const text = await response.text();
    return text || fallback;
  }
};

export const buildPrintQuery = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  if (!query.has('lang')) {
    query.set('lang', getCurrentLanguage());
  }

  return query.toString();
};

export const fetchBackendPrintHtml = async (url, options = {}) => {
  const { method = 'GET', body } = options;
  const hasBody = body !== undefined;

  const response = await fetch(url, {
    method,
    headers: buildHeaders(hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Print failed'));
  }

  return response.text();
};

export const openBackendPrintWindow = async ({ url, method = 'GET', body }) => {
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    throw new Error('Print window blocked');
  }

  try {
    const html = await fetchBackendPrintHtml(url, { method, body });
    let printed = false;

    const printOnce = () => {
      if (printed || printWindow.closed) return;
      printed = true;
      printWindow.focus();
      printWindow.print();
    };

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = printOnce;

    setTimeout(printOnce, 500);
  } catch (error) {
    printWindow.close();
    throw error;
  }
};

export const downloadBackendPdf = async ({ url, method = 'GET', body, fileName }) => {
  const hasBody = body !== undefined;

  const response = await fetch(url, {
    method,
    headers: buildHeaders(hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'PDF generation failed'));
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName || 'document.pdf';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(objectUrl);
};
