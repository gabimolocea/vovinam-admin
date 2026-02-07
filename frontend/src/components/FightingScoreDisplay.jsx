import React, { useState, useEffect } from 'react';

/**
 * Fighting Match Score Display
 * Shows red/blue corners with round-by-round scores
 */
export default function FightingScoreDisplay({ match, category, scores = [] }) {
  const [roundScores, setRoundScores] = useState({});
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    // Organize scores by round
    const byRound = {};
    scores.forEach((score) => {
      if (!byRound[score.round_number]) {
        byRound[score.round_number] = [];
      }
      byRound[score.round_number].push(score);
    });
    setRoundScores(byRound);

    // Calculate winner if all rounds submitted
    if (scores.length >= 5) {
      calculateWinner(scores);
    }
  }, [scores]);

  const calculateWinner = (scoreList) => {
    const roundTotals = {};
    
    scoreList.forEach((score) => {
      const key = `round_${score.round_number}`;
      if (!roundTotals[key]) {
        roundTotals[key] = { red: 0, blue: 0 };
      }
      
      if (score.red_score > score.blue_score) {
        roundTotals[key].red++;
      } else if (score.blue_score > score.red_score) {
        roundTotals[key].blue++;
      }
    });

    let redWins = 0, blueWins = 0;
    Object.values(roundTotals).forEach((round) => {
      if (round.red > round.blue) redWins++;
      else if (round.blue > round.red) blueWins++;
    });

    if (redWins > blueWins) {
      setWinner('RED');
    } else if (blueWins > redWins) {
      setWinner('BLUE');
    } else {
      setWinner('TIE');
    }
  };

  return (
    <div className="fighting-display">
      {/* Match Info */}
      <div className="match-info">
        <h3>Match {match?.id || 'Unknown'}</h3>
        <p className="category-name">{category?.name}</p>
      </div>

      {/* Fighters */}
      <div className="fighters">
        <div className="fighter red-corner">
          <span className="corner-label">RED</span>
          <div className="fighter-name">{match?.red_athlete || 'TBD'}</div>
        </div>
        <div className="vs">VS</div>
        <div className="fighter blue-corner">
          <span className="corner-label">BLUE</span>
          <div className="fighter-name">{match?.blue_athlete || 'TBD'}</div>
        </div>
      </div>

      {/* Rounds */}
      <div className="rounds">
        {[1, 2, 3, 4, 5].map((roundNum) => {
          const roundScoreList = roundScores[roundNum] || [];
          const avgRed = roundScoreList.length > 0
            ? (roundScoreList.reduce((sum, s) => sum + s.red_score, 0) / roundScoreList.length).toFixed(1)
            : '-';
          const avgBlue = roundScoreList.length > 0
            ? (roundScoreList.reduce((sum, s) => sum + s.blue_score, 0) / roundScoreList.length).toFixed(1)
            : '-';

          return (
            <div key={roundNum} className="round">
              <div className="round-header">Round {roundNum}</div>
              <div className="round-scores">
                <div className="red-score">
                  <strong>{avgRed}</strong>
                </div>
                <div className="round-separator">-</div>
                <div className="blue-score">
                  <strong>{avgBlue}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Winner Announcement */}
      {winner && (
        <div className={`winner-announcement ${winner.toLowerCase()}`}>
          <h2>{winner === 'TIE' ? 'DRAW' : `${winner} WINS`}</h2>
        </div>
      )}

      {/* Submissions Count */}
      <div className="submission-count">
        <p>{scores.length} total submissions received</p>
      </div>
    </div>
  );
}
