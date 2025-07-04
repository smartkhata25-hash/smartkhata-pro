// src/components/MonthlySalesChart.js

import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const MonthlySalesChart = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await axios.get(`${baseUrl}/api/journal-entries/dashboard-monthly-sales`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(response.data);
      } catch (error) {
        console.error('Monthly sales fetch error:', error);
      }
    };

    fetchSales();
  }, []);

  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Monthly Sales (Rs)',
        data: data,
        backgroundColor: '#007bff',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Monthly Sales Overview',
      },
    },
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <Bar data={chartData} options={chartOptions} />
    </div>
  );
};

export default MonthlySalesChart;
