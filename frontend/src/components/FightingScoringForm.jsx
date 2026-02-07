import React, { useState } from 'react';

/**
 * Fighting Scoring Form
 * Round-by-round scoring for fighting competitions
 */
export default function FightingScoringForm({ category, onSubmit, onBack, loading }) {
  const [matchId, setMatchId] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!matchId) {
      alert('Please enter match ID');
      return;
    }

    onSubmit({
      matchId,
      roundNumber,
      redScore,
      blueScore,
      notes
    });
  };

  const winner = redScore > blueScore ? 'Red' : blueScore > redScore ? 'Blue' : 'Tie';

  return (
    <div className="scoring-form fighting-form">
      <h2>{category.name} - Fighting Scoring</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Match ID *</label>
          <input
            type="number"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="Enter match ID"
            required
          />
        </div>

        <div className="form-group">
          <label>Round Number *</label>
          <select value={roundNumber} onChange={(e) => setRoundNumber(parseInt(e.target.value))}>
            <option value={1}>Round 1</option>
            <option value={2}>Round 2</option>
            <option value={3}>Round 3</option>
            <option value={4}>Round 4</option>
            <option value={5}>Round 5</option>
          </select>
        </div>

        <div className="fighting-scores">
          <div className="corner red-corner">
            <h3>🔴 Red Corner</h3>
            <input
              type="number"
              min="0"
              max="999"
              value={redScore}
              onChange={(e) => setRedScore(parseInt(e.target.value) || 0)}
              className="score-input"
              placeholder="0"
            />
            <p className="corner-score">{redScore}</p>
          </div>

          <div className="vs-divider">VS</div>

          <div className="corner blue-corner">
            <h3>🔵 Blue Corner</h3>
            <input
              type="number"
              min="0"
              max="999"
              value={blueScore}
              onChange={(e) => setBlueScore(parseInt(e.target.value) || 0)}
              className="score-input"
              placeholder="0"
            />
            <p className="corner-score">{blueScore}</p>
          </div>
        </div>

        <div className="match-result">
          <div className="result-display">
            {winner === 'Tie' ? (
              <p className="result tie">TIE</p>
            ) : (
              <p className={`result winner ${winner.toLowerCase()}`}>
                {winner} WINS
              </p>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add round notes..."
            rows="3"
          />
        </div>

        <div className="button-group">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit Round'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onBack}
            disabled={loading}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}
