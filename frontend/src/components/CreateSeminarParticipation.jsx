import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import axios from './Axios';

const CreateSeminarParticipation = ({ open, onClose, onSuccess, trainingSeminars = [] }) => {
  const [formData, setFormData] = useState({
    seminar: '',
    participation_certificate: null,
    participation_document: null,
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

  const handleFileChange = (field, file) => {
    setFormData(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const submitFormData = new FormData();
      
      // Add text fields
      submitFormData.append('seminar', formData.seminar);
      if (formData.notes) {
        submitFormData.append('notes', formData.notes);
      }
      
      // Add files if present
      if (formData.participation_certificate) {
        submitFormData.append('participation_certificate', formData.participation_certificate);
      }
      if (formData.participation_document) {
        submitFormData.append('participation_document', formData.participation_document);
      }

      await axios.post('seminar-submissions/', submitFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      onSuccess('Seminar participation submitted successfully and is pending admin approval');
      onClose();
      
      // Reset form
      setFormData({
        seminar: '',
        participation_certificate: null,
        participation_document: null,
        notes: ''
      });
    } catch (err) {
      console.error('Error submitting seminar participation:', err);
      setError(err.response?.data?.detail || 'Failed to submit seminar participation');
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
          <DialogTitle>Submit Training Seminar Participation</DialogTitle>
          <DialogDescription>
            Submit your training seminar participation for admin approval
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
            <Label htmlFor="seminar">Training Seminar *</Label>
            <Select
              value={formData.seminar}
              onValueChange={(value) => handleChange('seminar', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a training seminar" />
              </SelectTrigger>
              <SelectContent>
                {trainingSeminars && trainingSeminars.length > 0 ? (
                  trainingSeminars.map((seminar) => (
                    <SelectItem key={seminar.id} value={seminar.id.toString()}>
                      {seminar.name} - {new Date(seminar.start_date).toLocaleDateString()} to {new Date(seminar.end_date).toLocaleDateString()}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>No training seminars available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="participation_certificate">Participation Certificate</Label>
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => document.getElementById('cert-upload').click()}
              >
                {formData.participation_certificate ? formData.participation_certificate.name : 'Upload Certificate'}
              </Button>
              <input
                id="cert-upload"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => handleFileChange('participation_certificate', e.target.files[0])}
              />
              <p className="text-xs text-gray-500">
                Upload your participation certificate (PDF, images, or documents)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="participation_document">Additional Documentation (Optional)</Label>
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => document.getElementById('doc-upload').click()}
              >
                {formData.participation_document ? formData.participation_document.name : 'Upload Document (Optional)'}
              </Button>
              <input
                id="doc-upload"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => handleFileChange('participation_document', e.target.files[0])}
              />
              <p className="text-xs text-gray-500">
                Upload any additional documentation (Optional)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Any additional information about your participation"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !formData.seminar}
            >
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSeminarParticipation;