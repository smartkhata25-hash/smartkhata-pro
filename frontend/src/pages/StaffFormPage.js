// src/pages/StaffFormPage.js

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { createStaff, getStaffById, updateStaff } from '../services/staffService';

const EMPTY_FORM = {
  name: '',
  fullName: '',
  email: '',
  mobile: '',
  password: '',
  confirmPassword: '',
};

const StaffFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const isEditMode = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEditMode) return;

    const loadStaff = async () => {
      try {
        setPageLoading(true);
        setError('');

        const result = await getStaffById(id);
        const staff = result.staff;

        if (!staff) {
          setError('Staff user نہیں ملا');
          return;
        }

        setForm({
          name: staff.name || '',
          fullName: staff.fullName || '',
          email: staff.email || '',
          mobile: staff.mobile || '',
          password: '',
          confirmPassword: '',
        });
      } catch (err) {
        console.error('Staff load error:', err);
        setError(err.message || 'Staff data load نہیں ہو سکا');
      } finally {
        setPageLoading(false);
      }
    };

    loadStaff();
  }, [id, isEditMode]);

  const pageTitle = useMemo(() => (isEditMode ? 'Edit Staff' : 'Add New Staff'), [isEditMode]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      setError('');
    }
  };

  const validateForm = () => {
    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanName) {
      return 'Staff name ضروری ہے';
    }

    if (!cleanEmail) {
      return 'Email ضروری ہے';
    }

    if (!emailRegex.test(cleanEmail)) {
      return 'درست Email درج کریں';
    }

    if (!isEditMode) {
      if (!form.password) {
        return 'Password ضروری ہے';
      }

      if (form.password.length < 6) {
        return 'Password کم از کم 6 حروف کا ہونا چاہیے';
      }

      if (form.password !== form.confirmPassword) {
        return 'Password اور Confirm Password ایک جیسے نہیں ہیں';
      }
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const cleanData = {
        name: form.name.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim(),
      };

      if (isEditMode) {
        await updateStaff(id, cleanData);

        alert('Staff information کامیابی سے Update ہو گئی');
      } else {
        await createStaff({
          ...cleanData,
          password: form.password,
        });

        alert('Staff user کامیابی سے Create ہو گیا');
      }

      navigate('/staff');
    } catch (err) {
      console.error('Staff save error:', err);

      setError(err.message || 'Staff save نہیں ہو سکا');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (isEditMode) {
      setForm((prev) => ({
        ...prev,
        fullName: '',
        mobile: '',
      }));
    } else {
      setForm(EMPTY_FORM);
    }

    setError('');
  };

  if (pageLoading) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-6 py-5 text-gray-600">
          Staff data load ہو رہا ہے...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-3 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-4 md:px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">{pageTitle}</h1>

                <p className="text-sm text-gray-500 mt-1">Staff کی بنیادی معلومات درج کریں</p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/staff')}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                ← Back
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-4 md:p-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Staff Name <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="مثلاً Ali"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>

                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="مکمل نام"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>

                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="staff@example.com"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile</label>

                <input
                  type="text"
                  name="mobile"
                  value={form.mobile}
                  onChange={handleChange}
                  placeholder="03XXXXXXXXX"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!isEditMode && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="کم از کم 6 حروف"
                        autoComplete="new-password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>

                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        placeholder="Password دوبارہ درج کریں"
                        autoComplete="new-password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-12 outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500"
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!isEditMode && (
              <div className="mt-5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                Staff create ہونے کے بعد Permissions الگ Screen سے دی جائیں گی۔
              </div>
            )}

            {isEditMode && (
              <div className="mt-5 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                Password بدلنے کے لیے Staff List میں موجود Reset Password Button استعمال کریں۔
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 disabled:opacity-50"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => navigate('/staff')}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
                className={`px-5 py-2 rounded-lg text-white font-semibold ${
                  loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Saving...' : isEditMode ? 'Update Staff' : 'Create Staff'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffFormPage;
