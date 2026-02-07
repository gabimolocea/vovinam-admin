import React, { useState, useEffect } from 'react';
import { competitionAPI } from '../services/api';

/**
 * Referee Assignment Panel - Assign referees to fields and categories
 */
export default function RefereeAssignmentPanel({ event, referees, fields, onAssignmentUpdated }) {
  const [showAssignment, setShowAssignment] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [selectedField, setSelectedField] = useState('');
  const [selectedReferee, setSelectedReferee] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load assignments when component mounts
  useEffect(() => {
    loadAssignments();
    loadCategories();
  }, [event.id]);

  const loadAssignments = async () => {
    try {
      const data = await competitionAPI.listAssignments(event.id);
      setAssignments(data);
    } catch (err) {
      setError(`Failed to load assignments: ${err.message}`);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await competitionAPI.listCategories(event.id);
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedField || !selectedReferee || !selectedCategory) {
      setError('Please select field, referee, and category');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await competitionAPI.createAssignment({
        field_id: parseInt(selectedField),
        referee_id: parseInt(selectedReferee),
        category_id: parseInt(selectedCategory),
      });

      setSelectedField('');
      setSelectedReferee('');
      setSelectedCategory('');
      setShowAssignment(false);
      loadAssignments();
      onAssignmentUpdated();
    } catch (err) {
      setError(`Failed to assign referee: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getRefereeeName = (id) => {
    const ref = referees.find(r => r.id === id);
    return ref ? `${ref.first_name} ${ref.last_name}` : 'Unknown';
  };

  const getFieldName = (id) => {
    const field = fields.find(f => f.id === id);
    return field ? field.name : 'Unknown';
  };

  const getCategoryName = (id) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : 'Unknown';
  };

  return (
    <div className="referee-assignment-panel">
      <div className="panel-header">
        <h3>Referee Assignments</h3>
        <button 
          className="btn-primary"
          onClick={() => setShowAssignment(!showAssignment)}
        >
          {showAssignment ? 'Cancel' : 'New Assignment'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {showAssignment && (
        <form className="assignment-form" onSubmit={handleAssign}>
          <div className="form-row">
            <div className="form-group">
              <label>Field *</label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                required
              >
                <option value="">Select Field</option>
                {fields.map(field => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Referee *</label>
              <select
                value={selectedReferee}
                onChange={(e) => setSelectedReferee(e.target.value)}
                required
              >
                <option value="">Select Referee</option>
                {referees.map(ref => (
                  <option key={ref.id} value={ref.id}>
                    {ref.first_name} {ref.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                required
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Assigning...' : 'Assign Referee'}
          </button>
        </form>
      )}

      {/* Assignments Table */}
      <div className="assignments-table">
        {assignments.length === 0 ? (
          <p className="empty-state">No assignments yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Category</th>
                <th>Referee</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(assignment => (
                <tr key={assignment.id}>
                  <td>{getFieldName(assignment.field_id)}</td>
                  <td>{getCategoryName(assignment.category_id)}</td>
                  <td>{getRefereeeName(assignment.referee_id)}</td>
                  <td>
                    <span className={`status-badge ${assignment.status || 'active'}`}>
                      {assignment.status || 'Active'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-small btn-secondary">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
