import React, { useState } from 'react';
import { competitionAPI } from '../services/api';

/**
 * Field Management Panel - Create and manage competition fields
 */
export default function FieldManagementPanel({ event, fields, onFieldsUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    field_number: '',
    location_description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      await competitionAPI.createField({
        ...formData,
        event_id: event.id
      });
      
      setFormData({
        name: '',
        field_number: '',
        location_description: '',
      });
      setShowForm(false);
      onFieldsUpdated();
    } catch (err) {
      setError(`Failed to create field: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="field-management-panel">
      <div className="panel-header">
        <h3>Fields for {event.name}</h3>
        <button 
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'Add Field'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {showForm && (
        <form className="field-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Field Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Ring A, Mat 1"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Field Number</label>
              <input
                type="number"
                name="field_number"
                value={formData.field_number}
                onChange={handleInputChange}
                placeholder="1, 2, 3..."
              />
            </div>

            <div className="form-group">
              <label>Location Description</label>
              <input
                type="text"
                name="location_description"
                value={formData.location_description}
                onChange={handleInputChange}
                placeholder="e.g., Hall A, Row 2"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Add Field'}
          </button>
        </form>
      )}

      {/* Fields Grid */}
      <div className="fields-grid">
        {fields.length === 0 ? (
          <p className="empty-state">No fields created yet</p>
        ) : (
          fields.map(field => (
            <div key={field.id} className="field-card">
              <div className="field-header">
                <h4>{field.name}</h4>
                <span className="field-number">#{field.field_number}</span>
              </div>
              {field.location_description && (
                <p className="field-location">📍 {field.location_description}</p>
              )}
              <div className="field-stats">
                <span className="stat">
                  Active Categories: <strong>{field.categories_count || 0}</strong>
                </span>
                <span className="stat">
                  Referees: <strong>{field.referees_count || 0}</strong>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
