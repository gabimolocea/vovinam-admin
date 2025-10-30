import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import axios from './Axios';

const CreateGradeHistory = ({ open, onClose, onSuccess, grades = [] }) => {
  const [formData, setFormData] = useState({
    grade: '',
    examination_date: null,
    location: '',
    examiner_name: '',
    certificate_number: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitData = {
        ...formData,
        examination_date: formData.examination_date?.toISOString().split('T')[0] || null
      };

      await axios.post('grade-submissions/', submitData);
      
      onSuccess('Grade history submitted successfully and is pending admin approval');
      onClose();
      
      // Reset form
      setFormData({
        grade: '',
        examination_date: null,
        location: '',
        examiner_name: '',
        certificate_number: '',
        notes: ''
      });
    } catch (err) {
      console.error('Error submitting grade history:', err);
      setError(err.response?.data?.detail || 'Failed to submit grade history');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Submit Grade Examination</DialogTitle>
          <DialogDescription>
            Submit your grade examination for admin approval
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {error}
                <button
                  onClick={() => setError('')}
                  className="float-right text-red-600 hover:text-red-800"
                >
                  ×
                </button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="grade">Grade *</Label>
            <Select
              value={formData.grade}
              onValueChange={(value) => handleChange('grade', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a grade" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((grade) => (
                  <SelectItem key={grade.id} value={grade.id.toString()}>
                    {grade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="examination_date">Examination Date *</Label>
            <Input
              id="examination_date"
              type="date"
              value={formData.examination_date ? formData.examination_date.toISOString().split('T')[0] : ''}
              onChange={(e) => handleChange('examination_date', e.target.value ? new Date(e.target.value) : null)}
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="City, Country or Venue"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="examiner_name">Examiner Name *</Label>
            <Input
              id="examiner_name"
              value={formData.examiner_name}
              onChange={(e) => handleChange('examiner_name', e.target.value)}
              placeholder="Name of the examining instructor"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="certificate_number">Certificate Number</Label>
            <Input
              id="certificate_number"
              value={formData.certificate_number}
              onChange={(e) => handleChange('certificate_number', e.target.value)}
              placeholder="Certificate or document number (if applicable)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Any additional information about the examination"
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !formData.grade || !formData.examination_date || !formData.location || !formData.examiner_name}
            >
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGradeHistory;