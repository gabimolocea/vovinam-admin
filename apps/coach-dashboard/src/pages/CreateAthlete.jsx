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
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/')}
          className="frvv-btn-secondary">← Înapoi</button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-black">Adaugă sportiv</h1>
          <p className="text-sm text-gray-500">Completează profilul și documentele sportivului.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ═══ DATE PERSONALE ═══ */}
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Date personale</legend>
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
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Contact de urgență</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <Field label="Nume contact" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
            <Field label="Telefon contact" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
          </div>
        </fieldset>

        {/* ═══ DATE SPORTIVE ═══ */}
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Date sportive</legend>
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
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Antrenor
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" name="is_referee" checked={form.is_referee} onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Arbitru
              </label>
            </div>
            <div className="sm:col-span-2">
              <Field label="Experiență anterioară" name="previous_experience" value={form.previous_experience} onChange={handleChange} multiline />
            </div>
          </div>
        </fieldset>

        {/* ═══ DOCUMENTE ═══ */}
        <fieldset className="frvv-surface p-4 md:p-5">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Documente</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {/* Profile Image */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fotografie sportiv</label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-24 w-24 items-center justify-center overflow-hidden border-2 border-dashed border-black bg-gray-50 cursor-pointer transition hover:bg-yellow-50"
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
                className="block w-full text-xs text-gray-500 file:mr-2 file:border file:border-black file:bg-yellow-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black hover:file:bg-yellow-200 cursor-pointer" />
              {medicalCert && <p className="text-[10px] text-gray-400 mt-1 truncate">{medicalCert.name}</p>}
            </div>
          </div>
        </fieldset>

        {/* ═══ ACTIONS ═══ */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/')}
            className="frvv-btn-secondary">
            Anulează
          </button>
          <button type="submit" disabled={saving}
            className="frvv-btn-add">
            <span className="frvv-btn-add-icon">+</span>
            {saving ? 'Se salvează…' : 'Salvează sportivul'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reusable field ── */
function Field({ label, name, value, onChange, type = 'text', required, multiline }) {
  const cls = 'frvv-input w-full';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea name={name} value={value} onChange={onChange} rows={3} className={cls + ' resize-none min-h-[96px]'} />
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
        className="frvv-input w-full bg-white">
        <option value="">— Alege —</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o[labelKey]}</option>
        ))}
      </select>
    </div>
  );
}
