import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { monitorAPI } from '../services/api';
import SoloScoreDisplay from '../components/SoloScoreDisplay';
import FightingScoreDisplay from '../components/FightingScoreDisplay';
import '../styles/DisplayMonitorPage.css';

/**
 * Display Monitor Page - Shows real-time scores on external monitors
 */
export default function DisplayMonitorPage() {
  const { fieldId } = useParams();
  const { send } = useWebSocket();
  const { currentEvent } = useCompetition();
  
  const [session, setSession] = useState(null);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryType, setCategoryType] = useState(null);

  useEffect(() => {
    loadSession();
    const interval = setInterval(loadSession, 30000);
    return () => clearInterval(interval);
  }, [fieldId]);

  const loadSession = async () => {
    try {
      setLoading(true);
      const data = await monitorAPI.getFieldSession(fieldId);
      setSession(data);
      
      if (data.current_category) {
        const type = data.current_category.category_type || 'solo';
        setCategoryType(type);
      }
    } catch (err) {
      setError(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="monitor-page loading-state">
        <div className="loading-spinner">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="monitor-page error-state">
        <div className="error-box">{error}</div>
      </div>
    );
  }

  return (
    <div className="monitor-page">
      <header className="monitor-header">
        <h1>📺 {session?.field_name || 'Field'}</h1>
        {session?.current_category && (
          <h2>{session.current_category.name}</h2>
        )}
      </header>

      <main className="monitor-display">
        {session?.current_category && categoryType === 'fight' ? (
          <FightingScoreDisplay
            match={session?.current_match}
            category={session?.current_category}
            scores={scores}
          />
        ) : session?.current_category ? (
          <SoloScoreDisplay
            athlete={session?.current_athlete}
            category={session?.current_category}
            scores={scores}
          />
        ) : (
          <div className="no-content">Waiting to start...</div>
        )}
      </main>

      <footer className="monitor-footer">
        <span className="time-badge">{new Date().toLocaleTimeString()}</span>
        <span className="status-badge">🟢 LIVE</span>
      </footer>
    </div>
  );
}
