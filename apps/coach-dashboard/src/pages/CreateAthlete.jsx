import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { cityAPI, gradeAPI } from '@shared/lib/api';

const INITIAL = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  address: '',
  mobile_number: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  previous_experience: '',
  city: '',
  current_grade: '',
  is_coach: false,
  is_referee: false,
  registered_date: '',
  expiration_date: '',
};

export default function CreateAthlete() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [medicalCert, setMedicalCert] = useState(null);
  const [cities, setCities] = useState([]);
  const [grades, setGrades] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    cityAPI.list().then(r => setCities(r.data?.results || r.data || [])).catch(() => {});
    gradeAPI.list().then(r => setGrades(r.data?.results || r.data || [])).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('Prenumele și numele sunt obligatorii.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('coach_create', 'true');

      Object.entries(form).forEach(([key, val]) => {
        if (val !== '' && val !== null && val !== undefined) {
          fd.append(key, val);
        }
      });

      if (profileImage) fd.append('profile_image', profileImage);
      if (medicalCert) fd.append('medical_certificate', medicalCert);

      await api.post('/athletes/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        setError(msgs.join('\n'));
      } else {
        setError('Eroare la salvare. Încearcă din nou.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')}
          className="text-sm text-gray-500 hover:text-gray-700 transition">← Înapoi</button>
        <h1 className="text-xl font-bold text-gray-900">Adaugă sportiv</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ═══ DATE PERSONALE ═══ */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Date personale</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <Field label="Prenume *" name="first_name" value={form.first_name} onChange={handleChange} required />
            <Field label="Nume *" name="last_name" value={form.last_name} onChange={handleChange} required />
            <Field label="Data nașterii" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
            <Field label="Telefon" name="mobile_number" value={form.mobile_number} onChange={handleChange} />
            <div className="sm:col-span-2">
              <Field label="Adresă" name="address" value={form.address} onChange={handleChange} multiline />
            </div>
          </div>
        </fieldset>

        {/* ═══ CONTACT URGENȚĂ ═══ */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Contact de urgență</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <Field label="Nume contact" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
            <Field label="Telefon contact" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
          </div>
        </fieldset>

        {/* ═══ DATE SPORTIVE ═══ */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Date sportive</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <SelectField label="Oraș" name="city" value={form.city} onChange={handleChange}
              options={cities} labelKey="name" />
            <SelectField label="Grad curent" name="current_grade" value={form.current_grade} onChange={handleChange}
              options={grades} labelKey="name" />
            <Field label="Data înregistrării" name="registered_date" type="date" value={form.registered_date} onChange={handleChange} />
            <Field label="Data expirării" name="expiration_date" type="date" value={form.expiration_date} onChange={handleChange} />
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" name="is_coach" checked={form.is_coach} onChange={handleChange}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Antrenor
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" name="is_referee" checked={form.is_referee} onChange={handleChange}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Arbitru
              </label>
            </div>
            <div className="sm:col-span-2">
              <Field label="Experiență anterioară" name="previous_experience" value={form.previous_experience} onChange={handleChange} multiline />
            </div>
          </div>
        </fieldset>

        {/* ═══ DOCUMENTE ═══ */}
        <fieldset className="border border-gray-200 rounded-lg p-4">
          <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Documente</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {/* Profile Image */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fotografie sportiv</label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-400 transition"
                >
                  {profilePreview ? (
                    <img src={profilePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-400 text-xs text-center px-1">Click pentru a alege</span>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                {profileImage && (
                  <div className="text-xs text-gray-500">
                    <p className="font-medium truncate max-w-[140px]">{profileImage.name}</p>
                    <button type="button"
                      onClick={() => { setProfileImage(null); setProfilePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-red-500 hover:text-red-700 mt-1">Șterge</button>
                  </div>
                )}
              </div>
            </div>
            {/* Medical Certificate */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificat medical</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setMedicalCert(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-500 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
              {medicalCert && <p className="text-[10px] text-gray-400 mt-1 truncate">{medicalCert.name}</p>}
            </div>
          </div>
        </fieldset>

        {/* ═══ ACTIONS ═══ */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/')}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
            Anulează
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'Se salvează…' : 'Salvează sportivul'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reusable field ── */
function Field({ label, name, value, onChange, type = 'text', required, multiline }) {
  const cls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea name={name} value={value} onChange={onChange} rows={2} className={cls + ' resize-none'} />
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} required={required} className={cls} />
      )}
    </div>
  );
}

/* ── Reusable select ── */
function SelectField({ label, name, value, onChange, options, labelKey = 'name' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select name={name} value={value} onChange={onChange}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition bg-white">
        <option value="">— Alege —</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o[labelKey]}</option>
        ))}
      </select>
    </div>
  );
}
