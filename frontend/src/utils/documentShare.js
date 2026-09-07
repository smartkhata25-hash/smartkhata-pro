const canShareFile = (file) => {
  if (!navigator.share || !navigator.canShare || !file) {
    return false;
  }

  try {
    return navigator.canShare({ files: [file] });
  } catch (_) {
    return false;
  }
};

const hasActiveShareGesture = () => {
  if (!navigator.userActivation) {
    return true;
  }

  return navigator.userActivation.isActive === true;
};

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const isShareCancelled = (error) => error?.name === 'AbortError';

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

const buildHeaders = (token, fetchOptions = {}) => {
  const headers = new Headers(fetchOptions.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
};

const closeReservedWindow = (reservedWindow) => {
  try {
    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.close();
    }
  } catch (_) {
    // Ignore browser restrictions on popup handles.
  }
};

const openFallbackTextUrl = (fallbackTextUrl, reservedWindow = null) => {
  if (!fallbackTextUrl) {
    return false;
  }

  try {
    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.location.href = fallbackTextUrl;
      reservedWindow.focus();
      return true;
    }

    const openedWindow = window.open(fallbackTextUrl, '_blank');

    if (openedWindow) {
      openedWindow.focus();
      return true;
    }
  } catch (_) {
    // Fall through to same-tab fallback.
  }

  window.location.href = fallbackTextUrl;
  return true;
};

export const sharePdfDocument = async ({
  pdfUrl,
  token,
  fetchOptions = {},
  fileName = 'document.pdf',
  title = fileName,
  text = '',
  fallbackTextUrl = '',
  openFallbackText = false,
}) => {
  const shouldReserveFallbackWindow = openFallbackText && fallbackTextUrl && !isMobileDevice();
  const reservedFallbackWindow = shouldReserveFallbackWindow ? window.open('', '_blank') : null;

  let response;

  try {
    response = await fetch(pdfUrl, {
      ...fetchOptions,
      headers: buildHeaders(token, fetchOptions),
    });

    if (!response.ok) {
      throw new Error('PDF fetch failed');
    }
  } catch (error) {
    closeReservedWindow(reservedFallbackWindow);
    throw error;
  }

  const blob = await response.blob();
  const pdfBlob =
    blob.type === 'application/pdf'
      ? blob
      : new Blob([blob], {
          type: 'application/pdf',
        });

  const pdfFile =
    typeof File !== 'undefined'
      ? new File([pdfBlob], fileName, {
          type: 'application/pdf',
        })
      : null;

  if (canShareFile(pdfFile) && hasActiveShareGesture()) {
    try {
      await navigator.share({
        files: [pdfFile],
        text,
        title,
      });

      closeReservedWindow(reservedFallbackWindow);

      return {
        shared: true,
        downloaded: false,
      };
    } catch (error) {
      if (isShareCancelled(error)) {
        closeReservedWindow(reservedFallbackWindow);

        return {
          shared: false,
          downloaded: false,
          cancelled: true,
        };
      }
    }
  }

  downloadBlob(pdfBlob, fileName);

  if (openFallbackText && fallbackTextUrl) {
    openFallbackTextUrl(fallbackTextUrl, reservedFallbackWindow);
  } else {
    closeReservedWindow(reservedFallbackWindow);
  }

  return {
    shared: false,
    downloaded: true,
  };
};
