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
  const response = await fetch(pdfUrl, {
    ...fetchOptions,
    headers: buildHeaders(token, fetchOptions),
  });

  if (!response.ok) {
    throw new Error('PDF fetch failed');
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

  if (canShareFile(pdfFile)) {
    await navigator.share({
      files: [pdfFile],
      text,
      title,
    });

    return {
      shared: true,
      downloaded: false,
    };
  }

  downloadBlob(pdfBlob, fileName);

  if (openFallbackText && fallbackTextUrl) {
    window.open(fallbackTextUrl, '_blank');
  }

  return {
    shared: false,
    downloaded: true,
  };
};
