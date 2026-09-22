import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { useNavigate } from 'react-router-dom';
import { sharePdfDocument } from '../utils/documentShare';
const API = process.env.REACT_APP_API_BASE_URL;

const PrintInvoicePage = () => {
  const { type, id } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const autoPrint = queryParams.get('autoprint') === 'true' || location.state?.autoPrint;
  const [html, setHtml] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const returnTo =
    location.state?.returnTo ||
    (type === 'quotation' && id ? `/create-sale?quotationId=${id}` : '/create-sale');

  const isPreview = location.state?.isPreview;

  useEffect(() => {
    const fetchHtml = async () => {
      try {
        const token = localStorage.getItem('token');

        /* ================= PREVIEW MODE (Unsaved Invoice) ================= */
        if (isPreview && location.state?.invoiceData) {
          let previewUrl = '';

          if (type === 'sale') {
            previewUrl = `${API}/api/print/sale-preview`;
          }

          if (type === 'refund') {
            previewUrl = `${API}/api/print/sale-return-preview`;
          }

          const res = await fetch(previewUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(location.state.invoiceData),
          });

          const htmlText = await res.text();
          setHtml(htmlText);
          setLoading(false);
          return;
        }

        /* ================= SAVED INVOICE ================= */
        if (type === 'sale') {
          const res = await fetch(`${API}/api/print/sale-html/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const text = await res.text();
          setHtml(text);
        }

        if (type === 'refund') {
          const res = await fetch(`${API}/api/print/sale-return-html/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const text = await res.text();
          setHtml(text);
        }

        if (type === 'quotation') {
          const res = await fetch(`${API}/api/print/quotation-html/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!res.ok) throw new Error('Quotation print could not be loaded');
          setHtml(await res.text());
        }
      } catch (err) {
        console.error('Print HTML load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHtml();
  }, [id, type, isPreview, location.state]);

  useEffect(() => {
    if (!html || !autoPrint) return;

    const timer = setTimeout(() => {
      const handleAfterPrint = () => {
        window.removeEventListener('afterprint', handleAfterPrint);

        navigate(type === 'quotation' ? returnTo : '/create-sale', {
          replace: true,
        });

        if (type !== 'quotation') window.location.reload();
      };

      window.addEventListener('afterprint', handleAfterPrint);

      window.print();
    }, 700);

    return () => clearTimeout(timer);
  }, [html, autoPrint, navigate, returnTo, type]);

  if (loading) {
    return <div className="p-6 text-center text-gray-600">{t('print.preparingPreview')}</div>;
  }

  return (
    <div className="bg-white p-6" style={{ height: '100vh', overflowY: 'auto' }}>
      {/* Top Bar (Not Printed) */}
      <div className="flex justify-end gap-2 mb-4 no-print">
        {type === 'quotation' && (
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="rounded border border-gray-300 px-5 py-2 text-gray-700 hover:bg-gray-100"
          >
            {t('common.back')}
          </button>
        )}
        <button
          onClick={() => {
            if (type === 'quotation') {
              window.addEventListener('afterprint', () => navigate(returnTo), { once: true });
            }
            window.print();

            if (isPreview) {
              setTimeout(() => {
                navigate('/create-sale');
              }, 500);
            }
          }}
          className="px-5 py-2 bg-gray-700 text-white rounded shadow"
        >
          {t('print')}
        </button>

        <button
          disabled={pdfLoading}
          onClick={async () => {
            try {
              setPdfLoading(true);

              const token = localStorage.getItem('token');
              let res;

              /* ================= PREVIEW MODE PDF ================= */
              if (isPreview && location.state?.invoiceData) {
                if (type === 'sale') {
                  res = await fetch(`${API}/api/print/sale-pdf`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(location.state.invoiceData),
                  });
                }

                if (type === 'refund') {
                  res = await fetch(`${API}/api/print/sale-return-pdf`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(location.state.invoiceData),
                  });
                }
              } else {
                /* ================= SAVED PDF ================= */
                if (type === 'sale') {
                  res = await fetch(`${API}/api/print/sale-pdf/${id}`, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }

                if (type === 'refund') {
                  res = await fetch(`${API}/api/print/sale-return-pdf/${id}`, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }

                if (type === 'quotation') {
                  res = await fetch(`${API}/api/print/quotation-pdf/${id}`, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }
              }

              if (!res?.ok) throw new Error('PDF could not be generated');
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);

              const billNo =
                location.state?.quotationNo ||
                location.state?.invoiceData?.billNo ||
                id ||
                'Preview';
              const filePrefix = type === 'quotation' ? 'Quotation' : 'Invoice';

              const a = document.createElement('a');
              a.href = url;
              a.download = `${filePrefix}-${billNo}.pdf`;

              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              alert(t('alerts.pdfFailed'));
            } finally {
              setPdfLoading(false);
            }
          }}
          className={`px-5 py-2 text-white rounded shadow ${
            pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {pdfLoading ? `⏳ ${t('pdf.preparing')}` : `📄 ${t('pdf.download')}`}
        </button>

        <button
          disabled={shareLoading}
          onClick={async () => {
            try {
              setShareLoading(true);

              const token = localStorage.getItem('token');
              let pdfUrl = '';
              let fetchOptions = {};

              if (isPreview && location.state?.invoiceData) {
                if (type === 'sale') {
                  pdfUrl = `${API}/api/print/sale-pdf`;
                }

                if (type === 'refund') {
                  pdfUrl = `${API}/api/print/sale-return-pdf`;
                }

                fetchOptions = {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(location.state.invoiceData),
                };
              } else if (type === 'sale') {
                pdfUrl = `${API}/api/print/sale-pdf/${id}`;
              } else if (type === 'refund') {
                pdfUrl = `${API}/api/print/sale-return-pdf/${id}`;
              } else if (type === 'quotation') {
                pdfUrl = `${API}/api/print/quotation-pdf/${id}`;
              }

              if (!pdfUrl) {
                throw new Error('PDF endpoint not found');
              }

              const billNo =
                location.state?.quotationNo ||
                location.state?.invoiceData?.billNo ||
                id ||
                'Preview';
              const filePrefix =
                type === 'quotation' ? 'Quotation' : type === 'refund' ? 'SaleReturn' : 'Invoice';
              const fileName = `${filePrefix}-${billNo}.pdf`;

              await sharePdfDocument({
                pdfUrl,
                token,
                fetchOptions,
                fileName,
                title: fileName,
                text: fileName,
              });
            } catch (err) {
              alert(t('pdf.shareFailed'));
            } finally {
              setShareLoading(false);
            }
          }}
          className={`px-5 py-2 text-white rounded shadow ${
            shareLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'
          }`}
        >
          {shareLoading ? `Preparing ${t('pdf.download')}` : t('pdf.share')}
        </button>
      </div>

      {/* HTML Render */}
      <div style={{ minHeight: '100%', paddingBottom: '50px' }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};

export default PrintInvoicePage;
