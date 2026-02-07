import React, { useState } from 'react';
import { competitionAPI } from '../services/api';

/**
 * Event Setup Panel - Create and manage competitions/events
 */
export default function EventSetupPanel({ events, onEventCreated }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    start_date: '',
    end_date: '',
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
      
      await competitionAPI.createEvent(formData);
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        location: '',
        start_date: '',
        end_date: '',
      });
      setShowForm(false);
      onEventCreated();
    } catch (err) {
      setError(`Failed to create event: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="event-setup-panel">
      <div className="panel-header">
        <h3>Events</h3>
        <button 
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'Create Event'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {showForm && (
        <form className="event-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Event Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., National Championship 2024"
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Event details..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="City/Venue"
              />
            </div>

            <div className="form-group">
              <label>Start Date *</label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                name="end_date"
                value={formData.end_date}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      )}

      {/* Events List */}
      <div className="events-list">
        {events.length === 0 ? (
          <p className="empty-state">No events created yet</p>
        ) : (
          events.map(event => (
            <div key={event.id} className="event-card">
              <div className="event-header">
                <h4>{event.name}</h4>
                <span className="event-status">{event.status || 'active'}</span>
              </div>
              {event.description && (
                <p className="event-description">{event.description}</p>
              )}
              <div className="event-meta">
                {event.location && <span>📍 {event.location}</span>}
                {event.start_date && (
                  <span>📅 {new Date(event.start_date).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
