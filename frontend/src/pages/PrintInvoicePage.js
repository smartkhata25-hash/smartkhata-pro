import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { useNavigate } from 'react-router-dom';
const API = process.env.REACT_APP_API_BASE_URL;

const PrintInvoicePage = () => {
  const { type, id } = useParams();
  const location = useLocation();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      } catch (err) {
        console.error('Print HTML load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHtml();
  }, [id, type, isPreview, location.state]);

  if (loading) {
    return <div className="p-6 text-center text-gray-600">{t('print.preparingPreview')}</div>;
  }

  return (
    <div className="bg-white min-h-screen p-6">
      {/* Top Bar (Not Printed) */}
      <div className="flex justify-end mb-4 no-print">
        <button
          onClick={() => {
            window.print();

            setTimeout(() => {
              navigate('/create-sale');
            }, 500);
          }}
          className="px-5 py-2 bg-gray-700 text-white rounded shadow"
        >
          {t('print')}
        </button>

        <button
          onClick={async () => {
            try {
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
              }

              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);

              const billNo = location.state?.invoiceData?.billNo || id || 'Preview';

              const a = document.createElement('a');
              a.href = url;
              a.download = `Invoice-${billNo}.pdf`;

              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              alert(t('alerts.pdfFailed'));
            }
          }}
          className="px-5 py-2 bg-blue-600 text-white rounded shadow"
        >
          {t('pdf.download')}
        </button>
      </div>

      {/* HTML Render */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export default PrintInvoicePage;
