import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function BusinessInfoForm() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    currency: "",
    taxNumber: "",
  });

  const businessTypes = ["Retail", "Wholesale", "Services", "Manufacturing", "Freelancing"];
  const currencies = ["PKR", "USD", "INR", "SAR", "AED"];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:5000/api/users/business-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      alert(data.msg);

      if (data.msg === "Business Info saved successfully") {
        navigate("/dashboard");
      }
    } catch (error) {
      alert("Something went wrong while saving business info!");
    }
  };

  return (
    <div>
      <h2>Business Information</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Business Name"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          required
        />

        <select
          value={form.businessType}
          onChange={(e) => setForm({ ...form, businessType: e.target.value })}
          required
        >
          <option value="">Select Business Type</option>
          {businessTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          required
        >
          <option value="">Select Currency</option>
          {currencies.map((curr) => (
            <option key={curr} value={curr}>{curr}</option>
          ))}
        </select>

        <input
          placeholder="Tax Number (Optional)"
          value={form.taxNumber}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
        />

        <div>
          <button type="button" onClick={() => navigate("/personal-info")}>⬅️ Back</button>
          <button type="submit">Next ➡️</button>
        </div>
      </form>
    </div>
  );
}
