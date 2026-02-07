import React, { useState, useEffect } from 'react';

/**
 * Scoring History Component
 * Shows recent scores submitted by referee
 */
export default function ScoringHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHistory();
    // Refresh every 10 seconds
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      // TODO: Fetch from API
      setHistory([]);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scoring-history">
      <h3>Recent Scores</h3>
      
      {loading ? (
        <p className="loading">Loading...</p>
      ) : history.length === 0 ? (
        <p className="empty">No scores yet</p>
      ) : (
        <div className="history-list">
          {history.map((score, idx) => (
            <div key={idx} className="history-item">
              <span className="score-name">{score.name}</span>
              <span className="score-value">{score.score}</span>
              <span className="score-time">{score.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
