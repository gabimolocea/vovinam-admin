import React, { useState, useEffect } from 'react';

/**
 * Solo/Team Score Display
 * Shows athlete name, 5 score boxes with deduction breakdown
 */
export default function SoloScoreDisplay({ athlete, category, scores = [] }) {
  const [displayScores, setDisplayScores] = useState({});
  const [animate, setAnimate] = useState({});

  useEffect(() => {
    if (scores && scores.length > 0) {
      const latestScore = scores[scores.length - 1];
      setDisplayScores(latestScore);
      
      // Trigger animation
      setAnimate({ [latestScore.referee_id]: true });
      setTimeout(() => setAnimate({}), 500);
    }
  }, [scores]);

  return (
    <div className="solo-display">
      {/* Athlete Info */}
      <div className="athlete-info">
        <h3 className="athlete-name">
          {athlete?.first_name} {athlete?.last_name}
        </h3>
        <p className="athlete-id">ID: {athlete?.id}</p>
      </div>

      {/* Score Boxes */}
      <div className="score-boxes">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div
            key={idx}
            className={`score-box ${animate[idx] ? 'reveal' : ''}`}
          >
            <span className="score-label">Ref {idx}</span>
            <div className="score-value">
              {displayScores[idx] ? (
                <>
                  <strong>{displayScores[idx].score}</strong>
                  <small>{displayScores[idx].deductions}</small>
                </>
              ) : (
                <span className="pending">-</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Scores */}
      {scores.length > 0 && (
        <div className="recent-scores">
          <h4>Latest Submissions</h4>
          <div className="scores-list">
            {scores.slice(-3).map((score, idx) => (
              <div key={idx} className="score-item">
                <span>{score.referee_name}</span>
                <strong>{score.score}</strong>
                <small>{new Date(score.submitted_at).toLocaleTimeString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
