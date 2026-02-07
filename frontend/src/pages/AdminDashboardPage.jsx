import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { competitionAPI, adminAPI } from '../services/api';
import EventSetupPanel from '../components/EventSetupPanel';
import FieldManagementPanel from '../components/FieldManagementPanel';
import RefereeAssignmentPanel from '../components/RefereeAssignmentPanel';
import LiveScoresTracker from '../components/LiveScoresTracker';
import '../styles/AdminDashboard.css';

/**
 * Admin Dashboard - Main control panel for event management
 * Shows event setup, field management, referee assignment, and live scores
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { currentEvent, setCurrentEvent } = useCompetition();
  const { isConnected } = useWebSocket();

  const [activeTab, setActiveTab] = useState('overview');
  const [events, setEvents] = useState([]);
  const [fields, setFields] = useState([]);
  const [referees, setReferees] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [eventsData, refereeData] = await Promise.all([
        competitionAPI.listEvents(),
        adminAPI.listReferees()
      ]);
      setEvents(eventsData);
      setReferees(refereeData);
      
      // Set current event if available
      if (eventsData.length > 0 && !currentEvent) {
        setCurrentEvent(eventsData[0]);
      }
    } catch (err) {
      setError(`Failed to load dashboard: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadEventFields = async (eventId) => {
    try {
      const data = await competitionAPI.listFields(eventId);
      setFields(data);
    } catch (err) {
      setError(`Failed to load fields: ${err.message}`);
    }
  };

  const loadLiveStats = async (eventId) => {
    try {
      const data = await adminAPI.getEventStats(eventId);
      setLiveStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  // Load fields and stats when event changes
  useEffect(() => {
    if (currentEvent) {
      loadEventFields(currentEvent.id);
      loadLiveStats(currentEvent.id);
      
      // Refresh stats every 10 seconds
      const interval = setInterval(() => loadLiveStats(currentEvent.id), 10000);
      return () => clearInterval(interval);
    }
  }, [currentEvent]);

  if (loading) {
    return (
      <div className="admin-dashboard loading">
        <div className="loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="admin-dashboard error-state">
        <h2>Access Denied</h2>
        <p>You must be an administrator to access this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Admin Dashboard</h1>
          <p className="subtitle">Event Management & Live Monitoring</p>
        </div>
        
        <div className="header-stats">
          <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot" />
            {isConnected ? 'Connected' : 'Offline'}
          </div>
          <select
            className="event-selector"
            value={currentEvent?.id || ''}
            onChange={(e) => {
              const event = events.find(ev => ev.id === parseInt(e.target.value));
              setCurrentEvent(event);
            }}
          >
            <option value="">Select Event</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events
        </button>
        <button
          className={`tab-button ${activeTab === 'fields' ? 'active' : ''}`}
          onClick={() => setActiveTab('fields')}
        >
          Fields
        </button>
        <button
          className={`tab-button ${activeTab === 'referees' ? 'active' : ''}`}
          onClick={() => setActiveTab('referees')}
        >
          Referees
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-panel">
            {currentEvent ? (
              <>
                <h2>{currentEvent.name}</h2>
                <div className="stats-grid">
                  {liveStats && (
                    <>
                      <div className="stat-card">
                        <div className="stat-value">{liveStats.fields_active || 0}</div>
                        <div className="stat-label">Active Fields</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{liveStats.referees_assigned || 0}</div>
                        <div className="stat-label">Assigned Referees</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{liveStats.scores_submitted || 0}</div>
                        <div className="stat-label">Scores Submitted</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{liveStats.pending_approval || 0}</div>
                        <div className="stat-label">Pending Approval</div>
                      </div>
                    </>
                  )}
                </div>
                <LiveScoresTracker event={currentEvent} stats={liveStats} />
              </>
            ) : (
              <div className="no-event-selected">
                <p>Select an event to view overview</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="events-panel">
            <EventSetupPanel 
              events={events} 
              onEventCreated={() => loadDashboardData()}
            />
          </div>
        )}

        {activeTab === 'fields' && (
          <div className="fields-panel">
            {currentEvent ? (
              <FieldManagementPanel 
                event={currentEvent}
                fields={fields}
                onFieldsUpdated={() => loadEventFields(currentEvent.id)}
              />
            ) : (
              <div className="no-event-selected">
                <p>Select an event to manage fields</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'referees' && (
          <div className="referees-panel">
            {currentEvent ? (
              <RefereeAssignmentPanel
                event={currentEvent}
                referees={referees}
                fields={fields}
                onAssignmentUpdated={() => loadEventFields(currentEvent.id)}
              />
            ) : (
              <div className="no-event-selected">
                <p>Select an event to assign referees</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
