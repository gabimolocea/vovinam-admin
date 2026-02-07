import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

/**
 * Live Scores Tracker - Real-time score display in admin dashboard
 */
export default function LiveScoresTracker({ event, stats }) {
  const { lastMessage } = useWebSocket();
  const [scoreUpdates, setScoreUpdates] = useState([]);

  // Process WebSocket messages for score updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'score_submitted') {
      const update = {
        id: Date.now(),
        timestamp: new Date(),
        ...lastMessage.data
      };
      
      setScoreUpdates(prev => [update, ...prev].slice(0, 20));
    }
  }, [lastMessage]);

  if (!event) {
    return null;
  }

  return (
    <div className="live-scores-tracker">
      <h3>Live Score Submissions</h3>
      
      {scoreUpdates.length === 0 ? (
        <div className="empty-scores">
          <p>No score submissions yet</p>
        </div>
      ) : (
        <div className="scores-feed">
          {scoreUpdates.map(update => (
            <div key={update.id} className="score-update">
              <div className="update-timestamp">
                {update.timestamp.toLocaleTimeString()}
              </div>
              <div className="update-details">
                <span className="referee">
                  {update.referee_name || 'Unknown Referee'}
                </span>
                <span className="category">
                  {update.category_name || 'Category'}
                </span>
                <span className="score">
                  <strong>{update.score || '-'}</strong>
                </span>
              </div>
              <span className={`status ${update.status || 'pending'}`}>
                {update.status || 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="stats-summary">
          <h4>Event Statistics</h4>
          <div className="stats-mini">
            <div className="stat">
              <span className="label">Total Submissions:</span>
              <span className="value">{stats.scores_submitted || 0}</span>
            </div>
            <div className="stat">
              <span className="label">Pending Review:</span>
              <span className="value">{stats.pending_approval || 0}</span>
            </div>
            <div className="stat">
              <span className="label">Categories Active:</span>
              <span className="value">{stats.categories_active || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
