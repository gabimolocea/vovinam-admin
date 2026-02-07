import React, { useState } from 'react';

/**
 * Solo/Team Scoring Form
 * Deduction-based scoring: 100 - deductions = final score
 */
export default function SoloScoringForm({ category, categoryType, onSubmit, onBack, loading }) {
  const [athleteName, setAthleteName] = useState('');
  const [athleteScoreId, setAthleteScoreId] = useState('');
  const [deductions, setDeductions] = useState({
    'wrong_technique': 0,
    'bad_position': 0,
    'stamina_issue': 0,
    'not_real_technique': 0
  });
  const [notes, setNotes] = useState('');
  const [finalScore, setFinalScore] = useState(100);

  const handleDeductionChange = (key, value) => {
    const newDeductions = { ...deductions, [key]: parseInt(value) || 0 };
    setDeductions(newDeductions);
    
    // Calculate final score
    const total = Object.values(newDeductions).reduce((a, b) => a + b, 0);
    setFinalScore(Math.max(0, 100 - total));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!athleteScoreId) {
      alert('Please enter athlete score ID');
      return;
    }

    onSubmit({
      athleteScoreId,
      athleteName,
      deductions,
      notes,
      finalScore
    });
  };

  const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);

  return (
    <div className="scoring-form">
      <h2>{category.name} - {categoryType === 'team' ? 'Team' : 'Solo'} Scoring</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Athlete/Team Score ID *</label>
          <input
            type="number"
            value={athleteScoreId}
            onChange={(e) => setAthleteScoreId(e.target.value)}
            placeholder="Enter ID"
            required
          />
        </div>

        <div className="form-group">
          <label>Athlete/Team Name (optional)</label>
          <input
            type="text"
            value={athleteName}
            onChange={(e) => setAthleteName(e.target.value)}
            placeholder="Name"
          />
        </div>

        <div className="deductions-section">
          <h3>Deductions</h3>
          <div className="deduction-grid">
            {Object.entries(deductions).map(([key, value]) => (
              <div key={key} className="deduction-input">
                <label>{key.replace(/_/g, ' ')}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={value}
                  onChange={(e) => handleDeductionChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="score-calculation">
          <div className="calculation-row">
            <span>Starting Score:</span>
            <strong>100</strong>
          </div>
          <div className="calculation-row">
            <span>Total Deductions:</span>
            <strong>-{totalDeductions}</strong>
          </div>
          <div className="calculation-row total">
            <span>Final Score:</span>
            <strong className={finalScore < 50 ? 'low' : ''}>{finalScore}</strong>
          </div>
        </div>

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes..."
            rows="3"
          />
        </div>

        <div className="button-group">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit Score'}
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
