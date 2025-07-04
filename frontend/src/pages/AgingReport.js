import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAgingReport } from '../services/agingService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const AgingReport = () => {
  const [originalData, setOriginalData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    searchName: '',
    onlyWithDue: false,
    fromDate: '',
    toDate: '',
  });

  const tableRef = useRef(null);

  const handleExportPDF = async () => {
    const input = tableRef.current;
    const canvas = await html2canvas(input);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save('Aging_Report.pdf');
  };

  const handlePrint = () => {
    const printContent = tableRef.current.innerHTML;
    const newWindow = window.open('', '', 'width=900,height=650');
    newWindow.document.write('<html><head><title>Aging Report</title></head><body>');
    newWindow.document.write(printContent);
    newWindow.document.write('</body></html>');
    newWindow.document.close();
    newWindow.focus();
    newWindow.print();
    newWindow.close();
  };

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;

      const data = await getAgingReport(params);
      setOriginalData(data);
      setFilteredData(data);
    } catch (err) {
      setError('Failed to load aging report.');
    } finally {
      setLoading(false);
    }
  }, [filters.fromDate, filters.toDate]);

  const applyFilters = useCallback(() => {
    let data = [...originalData];

    if (filters.searchName) {
      data = data.filter(item =>
        item.customerName.toLowerCase().includes(filters.searchName.toLowerCase())
      );
    }

    if (filters.onlyWithDue) {
      data = data.filter(item =>
        item.aging.recent + item.aging.mid1 + item.aging.mid2 + item.aging.oldest > 0
      );
    }

    setFilteredData(data);
  }, [originalData, filters.searchName, filters.onlyWithDue]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      searchName: '',
      onlyWithDue: false,
      fromDate: '',
      toDate: '',
    });
  };

  // ✅ Grand Total Calculation
  const grandTotal = filteredData.reduce(
    (acc, item) => {
      acc.recent += item.aging.recent;
      acc.mid1 += item.aging.mid1;
      acc.mid2 += item.aging.mid2;
      acc.oldest += item.aging.oldest;
      return acc;
    },
    { recent: 0, mid1: 0, mid2: 0, oldest: 0 }
  );

  if (loading) return <p>Loading report, please wait...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>📊 Aging Report</h2>

      <div className="no-print" style={{ marginBottom: '15px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by customer name"
          name="searchName"
          value={filters.searchName}
          onChange={handleInputChange}
          style={{ padding: '6px', minWidth: '180px' }}
        />
        <input type="date" name="fromDate" value={filters.fromDate} onChange={handleInputChange} />
        <input type="date" name="toDate" value={filters.toDate} onChange={handleInputChange} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="checkbox"
            name="onlyWithDue"
            checked={filters.onlyWithDue}
            onChange={handleInputChange}
          />
          Due &gt; 0 only
        </label>
        <button onClick={handleClearFilters}>❌ Clear</button>
        <button onClick={handlePrint}>🖨️ Print</button>
        <button onClick={handleExportPDF}>📄 PDF</button>
      </div>

      <div ref={tableRef}>
        <table border="1" cellPadding="8" cellSpacing="0" width="100%">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>0–30 Days</th>
              <th>31–60 Days</th>
              <th>61–90 Days</th>
              <th>90+ Days</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan="5" align="center">No records found</td>
              </tr>
            ) : (
              <>
                {filteredData.map((item, index) => (
                  <tr key={item.customerId || index}>
                    <td>{item.customerName}</td>
                    <td>{item.aging.recent}</td>
                    <td>{item.aging.mid1}</td>
                    <td>{item.aging.mid2}</td>
                    <td>{item.aging.oldest}</td>
                  </tr>
                ))}
                {/* ✅ Grand Total Row */}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f1f1' }}>
                  <td>Grand Total</td>
                  <td>{grandTotal.recent}</td>
                  <td>{grandTotal.mid1}</td>
                  <td>{grandTotal.mid2}</td>
                  <td>{grandTotal.oldest}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgingReport;
