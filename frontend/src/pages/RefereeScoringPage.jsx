import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useOffline } from '../contexts/OfflineContext';
import { refereeAPI } from '../services/api';
import SoloScoringForm from '../components/SoloScoringForm';
import FightingScoringForm from '../components/FightingScoringForm';
import QRScanner from '../components/QRScanner';
import ScoringHistory from '../components/ScoringHistory';
import '../styles/RefereeScoringPage.css';

/**
 * Referee Scoring Page
 * Main interface for referees to submit scores during competitions
 */
export default function RefereeScoringPage() {
  const { user } = useAuth();
  const { setCategories } = useCompetition();
  const { send } = useWebSocket();
  const { isOnline, savePendingCategoryScore, savePendingMatchScore, getPendingScores } = useOffline();
  
  const [stage, setStage] = useState('category'); // login → category → scoring
  const [categories, setLocalCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryType, setCategoryType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
    checkPendingScores();
  }, []);

  // Periodically check pending scores
  useEffect(() => {
    const interval = setInterval(checkPendingScores, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await refereeAPI.getAssignedCategories();
      setLocalCategories(data);
      setCategories(data);
    } catch (err) {
      setError(`Failed to load categories: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkPendingScores = async () => {
    try {
      const pending = await getPendingScores();
      setPendingCount(pending?.length || 0);
    } catch (err) {
      console.error('Error checking pending scores:', err);
    }
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    const type = category.category_type?.toLowerCase() || 'solo';
    setCategoryType(type);
    setStage('scoring');
    setError(null);
  };

  const handleSoloScoreSubmit = async (scoreData) => {
    try {
      setLoading(true);
      const payload = {
        athlete_score_id: scoreData.athleteScoreId,
        deductions: scoreData.deductions,
        notes: scoreData.notes
      };

      if (isOnline) {
        await refereeAPI.submitCategoryScore(payload);
        send({ type: 'category_score', ...payload });
        setSuccess(`Score submitted for ${scoreData.athleteName}`);
      } else {
        await savePendingCategoryScore(scoreData.athleteScoreId, scoreData.deductions);
        setSuccess(`Score saved offline`);
        checkPendingScores();
      }

      setTimeout(() => {
        setStage('category');
        setSelectedCategory(null);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(`Failed to submit score: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFightingScoreSubmit = async (scoreData) => {
    try {
      setLoading(true);
      const payload = {
        match_id: scoreData.matchId,
        round_number: scoreData.roundNumber,
        red_score: scoreData.redScore,
        blue_score: scoreData.blueScore,
        notes: scoreData.notes
      };

      if (isOnline) {
        await refereeAPI.submitMatchScore(payload);
        send({ type: 'match_score', ...payload });
        setSuccess(`Round ${scoreData.roundNumber} submitted`);
      } else {
        await savePendingMatchScore(
          scoreData.matchId,
          scoreData.roundNumber,
          scoreData.redScore,
          scoreData.blueScore
        );
        setSuccess(`Round saved offline`);
        checkPendingScores();
      }

      setTimeout(() => {
        setStage('category');
        setSelectedCategory(null);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(`Failed to submit round: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    setStage('category');
    setError(null);
  };

  return (
    <div className="referee-page">
      <header className="referee-header">
        <div className="header-content">
          <h1>Competition Scoring</h1>
          <div className="header-info">
            <span className="user-badge">👤 {user?.first_name} {user?.last_name}</span>
            <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </span>
            {pendingCount > 0 && (
              <span className="pending-badge">📤 {pendingCount}</span>
            )}
          </div>
        </div>
      </header>

      <main className="referee-content">
        {stage === 'category' && (
          <div className="category-selection">
            <h2>Select Category</h2>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="empty-state">
                <p>No categories assigned</p>
              </div>
            ) : (
              <div className="category-grid">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="category-card"
                    onClick={() => handleCategorySelect(category)}
                  >
                    <div className="category-badge">
                      {category.category_type === 'solo' && '👤'}
                      {category.category_type === 'team' && '👥'}
                      {category.category_type === 'fight' && '🥊'}
                    </div>
                    <h3>{category.name}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {stage === 'scoring' && selectedCategory && categoryType === 'fight' && (
          <FightingScoringForm
            category={selectedCategory}
            onSubmit={handleFightingScoreSubmit}
            onBack={handleGoBack}
            loading={loading}
          />
        )}

        {stage === 'scoring' && selectedCategory && categoryType !== 'fight' && (
          <SoloScoringForm
            category={selectedCategory}
            categoryType={categoryType}
            onSubmit={handleSoloScoreSubmit}
            onBack={handleGoBack}
            loading={loading}
          />
        )}

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            ✓ {success}
          </div>
        )}
      </main>
    </div>
  );
}
