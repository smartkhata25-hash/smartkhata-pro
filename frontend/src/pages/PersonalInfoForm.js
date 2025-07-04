import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PersonalInfoForm() {
  const [form, setForm] = useState({
    fullName: "",
    cnic: "",
    mobile: "",
    address: "",
  });

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:5000/api/users/personal-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      alert(data.msg);

      if (data.msg === "Personal Info saved successfully") {
        navigate("/business-info");
      }
    } catch (error) {
      alert("Something went wrong!");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Personal Info</h2>

      <input
        placeholder="Full Name"
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        required
      />
      <input
        placeholder="CNIC"
        value={form.cnic}
        onChange={(e) => setForm({ ...form, cnic: e.target.value })}
        required
      />
      <input
        placeholder="Mobile"
        value={form.mobile}
        onChange={(e) => setForm({ ...form, mobile: e.target.value })}
        required
      />
      <input
        placeholder="Address"
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        required
      />

      <div>
        <button type="button" onClick={() => navigate(-1)}>⬅️ Back</button>
        <button type="submit">Next ➡️</button>
      </div>
    </form>
  );
}
