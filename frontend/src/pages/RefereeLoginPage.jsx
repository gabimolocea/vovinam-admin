import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { competitionAPI, fieldAPI } from '../services/api';
import './RefereeLoginPage.css';

const RefereeLoginPage = () => {
  const { login, loading, error, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [categories, setCategories] = React.useState([]);
  const [fields, setFields] = React.useState([]);
  const [showDashboard, setShowDashboard] = React.useState(false);
  const [dashboardLoading, setDashboardLoading] = React.useState(false);

  // Load categories and fields if user is logged in
  useEffect(() => {
    if (user && (user.is_admin || user.is_referee)) {
      loadCategoriesAndFields();
    }
  }, [user]);

  const loadCategoriesAndFields = async () => {
    try {
      setDashboardLoading(true);
      // Fetch categories/events
      const categoriesResponse = await competitionAPI.list();
      if (categoriesResponse && categoriesResponse.data) {
        setCategories(Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [categoriesResponse.data]);
      } else if (Array.isArray(categoriesResponse)) {
        setCategories(categoriesResponse);
      }
      
      // Fetch fields
      try {
        const fieldsResponse = await fieldAPI.list();
        if (fieldsResponse && fieldsResponse.data) {
          setFields(Array.isArray(fieldsResponse.data) ? fieldsResponse.data : [fieldsResponse.data]);
        } else if (Array.isArray(fieldsResponse)) {
          setFields(fieldsResponse);
        }
      } catch (err) {
        console.warn('Could not load fields:', err);
        setFields([]);
      }
      
      setShowDashboard(true);
    } catch (err) {
      console.error('Failed to load categories:', err);
      setCategories([]);
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      // After login, the useEffect will handle loading categories
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  // If user is logged in and is admin or referee, show dashboard
  if (user && (user.is_admin || user.is_referee)) {
    return (
      <div className="referee-dashboard">
        <div className="dashboard-header">
          <h1>Welcome, {user.first_name} {user.last_name}</h1>
          <p className="role-badge">
            {user.is_admin ? 'Administrator' : user.is_referee ? 'Referee' : user.role}
          </p>
          <button 
            onClick={() => {
              localStorage.removeItem('authToken');
              window.location.href = '/referee/login';
            }}
            className="btn-logout"
          >
            Logout
          </button>
        </div>

        {dashboardLoading ? (
          <div className="loading">Loading your assignments...</div>
        ) : (
          <>
            {/* Categories Section */}
            <div className="section">
              <h2>📋 Assigned Categories ({categories.length})</h2>
              {categories.length > 0 ? (
                <div className="categories-grid">
                  {categories.map((category) => (
                    <div key={category.id} className="category-card">
                      <h3>{category.name}</h3>
                      <p className="category-info">
                        {category.athletes_count || 0} Athletes
                      </p>
                      {user.is_referee && !user.is_admin && (
                        <button 
                          onClick={() => navigate('/referee/score')}
                          className="btn-primary"
                        >
                          Score Athletes
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No categories assigned yet</p>
                </div>
              )}
            </div>

            {/* Fields Section */}
            <div className="section">
              <h2>🏟️ Competition Fields ({fields.length})</h2>
              {fields.length > 0 ? (
                <div className="fields-grid">
                  {fields.map((field) => (
                    <div key={field.id} className="field-card">
                      <h3>{field.name}</h3>
                      <p className="field-info">
                        Event: {field.event_name || 'Unknown'}
                      </p>
                      {field.current_category && (
                        <p className="current-category">
                          Current: {field.current_category}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No fields configured yet</p>
                </div>
              )}
            </div>

            {user.is_referee && !user.is_admin && (
              <div className="section">
                <button 
                  onClick={() => navigate('/referee/score')}
                  className="btn-primary btn-large"
                >
                  Begin Scoring
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Show login form if not logged in
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>🥋 Referee Scoring System</h1>
        <p>Referees & Admins - Login to manage scoring</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="your.email@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <hr />
        <p className="text-secondary">Or scan your QR code for quick access</p>

        <div className="test-credentials">
          <p className="info-title">📝 Test Credentials:</p>
          <div className="credential">
            <strong>Referee:</strong> referee_test / testpass123
          </div>
          <div className="credential">
            <strong>Admin:</strong> admin_test / adminpass123
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefereeLoginPage;
