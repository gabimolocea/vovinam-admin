import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import axios from './Axios';

const DEFAULT_GRADE_OPTIONS = [
  { id: '1', name: '1st' },
  { id: '2', name: '2nd' },
  { id: '3', name: '3rd' }
];

const CreateGradeHistory = ({ open, onClose, onSuccess, grades = [] }) => {
  const [localGrades, setLocalGrades] = useState(grades || []);
  const [fetchError, setFetchError] = useState('');
  const [formData, setFormData] = useState({
    grade: '',
    level: 'good',
  event: '',
    // exam_place removed
    examiner_1: '',
    examiner_2: '',
    certificate_image: null,
    result_document: null,
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coaches, setCoaches] = useState([]);
  const [coaches1, setCoaches1] = useState([]);
  const [coaches2, setCoaches2] = useState([]);
  const [coachQuery1, setCoachQuery1] = useState('');
  const [coachQuery2, setCoachQuery2] = useState('');
  const [events, setEvents] = useState([]);
  const [eventQuery, setEventQuery] = useState('');

  useEffect(() => {
    // When the dialog opens, ensure we have grade options to show.
    // Prefer the passed-in `grades` prop; if empty, attempt to fetch from the public API
    // and fall back to a small default list if that fails.
    let mounted = true;
    async function loadGrades() {
      if (grades && grades.length > 0) {
        setLocalGrades(grades);
        setFetchError('');
        return;
      }

      try {
        setFetchError('');
        // use the frontend axios instance (baseURL -> /api)
        const res = await axios.get('grades/');
        if (!mounted) return;
        if (Array.isArray(res.data) && res.data.length > 0) {
          setLocalGrades(res.data);
        } else {
          setLocalGrades(DEFAULT_GRADE_OPTIONS);
        }
      } catch (err) {
        console.warn('CreateGradeHistory: failed to fetch grades:', err?.response?.status, err?.message);
        if (!mounted) return;
        setFetchError('Could not load grade options from the server — showing defaults');
        setLocalGrades(DEFAULT_GRADE_OPTIONS);
      }
    }

    if (open) loadGrades();
    // initial load for both examiner selects
    async function loadCoachesInitial() {
      try {
        const r = await axios.get('coaches/');
        if (r?.data) {
          setCoaches1(r.data);
          setCoaches2(r.data);
        }
      } catch (e) {
        console.warn('CreateGradeHistory: failed to fetch coaches', e?.message || e);
        setCoaches1([]);
        setCoaches2([]);
      }
    }

    if (open) loadCoachesInitial();
    // initial load for events (landing/events/)
    async function loadEventsInitial() {
      try {
        const r = await axios.get('landing/events/');
        if (r?.data) setEvents(r.data);
      } catch (e) {
        console.warn('CreateGradeHistory: failed to fetch events', e?.message || e);
        setEvents([]);
      }
    }

    if (open) loadEventsInitial();
    return () => { mounted = false; };
  }, [open, grades]);

  // Debounced queries for each examiner autocomplete field
  useEffect(() => {
    if (!open) return;
    const q = coachQuery1 && coachQuery1.trim();
    const handle = setTimeout(() => {
      if (q && q.length >= 2) {
        axios.get(`coaches/?q=${encodeURIComponent(q)}`).then(r => setCoaches1(r.data)).catch(() => {});
      } else if (!q) {
        // reload initial list
        axios.get('coaches/').then(r => setCoaches1(r.data)).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [coachQuery1, open]);

  useEffect(() => {
    if (!open) return;
    const q = coachQuery2 && coachQuery2.trim();
    const handle = setTimeout(() => {
      if (q && q.length >= 2) {
        axios.get(`coaches/?q=${encodeURIComponent(q)}`).then(r => setCoaches2(r.data)).catch(() => {});
      } else if (!q) {
        axios.get('coaches/').then(r => setCoaches2(r.data)).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [coachQuery2, open]);

  // Debounced queries for events
  useEffect(() => {
    if (!open) return;
    const q = eventQuery && eventQuery.trim();
    const handle = setTimeout(() => {
      if (q && q.length >= 2) {
        axios.get(`landing/events/?search=${encodeURIComponent(q)}`).then(r => setEvents(r.data)).catch(() => {});
      } else if (!q) {
        axios.get('landing/events/').then(r => setEvents(r.data)).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [eventQuery, open]);

  // Normalize and filter grade options we can render into the Select
  const gradeOptionsToRender = (Array.isArray(localGrades) ? localGrades : []).filter(g => {
    if (!g) return false;
    const id = g.id ?? g.pk ?? g.value;
    // Exclude empty-string ids which cause Radix Select to throw
    return id !== undefined && id !== null && id !== '';
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileChange = (field, file) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Build multipart form data (files + fields) matching GradeHistorySubmissionSerializer
      const fd = new FormData();
    if (formData.grade) fd.append('grade', formData.grade);
  if (formData.level) fd.append('level', formData.level);
  if (formData.event) fd.append('event', formData.event);
    fd.append('examiner_1', formData.examiner_1 || '');
    fd.append('examiner_2', formData.examiner_2 || '');
      fd.append('notes', formData.notes || '');
      if (formData.certificate_image) fd.append('certificate_image', formData.certificate_image);
      if (formData.result_document) fd.append('result_document', formData.result_document);

      await axios.post('grade-submissions/', fd);
      
      onSuccess('Grade history submitted successfully and is pending admin approval');
      onClose();
      
      // Reset form
      setFormData({
        grade: '',
        level: 'good',
        event: '',
        examiner_1: '',
        examiner_2: '',
        certificate_image: null,
        result_document: null,
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
  // coaches state used to populate the examiner select (declared above)

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

          {fetchError && (
            <Alert>
              <AlertDescription>{fetchError}</AlertDescription>
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
                {gradeOptionsToRender.length > 0 ? (
                  gradeOptionsToRender.map((grade, idx) => {
                    const val = String(grade.id ?? grade.pk ?? grade.value ?? idx);
                    const label = grade.name || grade.label || (typeof grade === 'string' ? grade : String(val));
                    const key = `${val}-${label}`;
                    return (
                      <SelectItem key={key} value={val}>
                        {label}
                      </SelectItem>
                    );
                  })
                ) : (
                  // Use a non-empty sentinel value for the disabled placeholder so Radix does not throw
                  <SelectItem value="__none" disabled>No grades available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_search">Event (optional)</Label>
            <Input
              id="event_search"
              placeholder="Type to search events (min 2 chars)"
              value={eventQuery}
              onChange={(e) => setEventQuery(e.target.value)}
              className="mb-2"
            />
            <Label htmlFor="event">Event</Label>
            <Select
              value={String(formData.event || '')}
              onValueChange={(value) => handleChange('event', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an event (optional)" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(events) && events.length > 0 ? (
                  events.map((ev) => {
                    const val = String(ev.id);
                    const label = ev.title || ev.name || `${ev.id}`;
                    return (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    );
                  })
                ) : (
                  <SelectItem value="__none" disabled>No events available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* exam_place/location removed */}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="coach_search_1">Search Examiner 1</Label>
                <Input
                  id="coach_search_1"
                  placeholder="Type to search coaches (min 2 chars)"
                  value={coachQuery1}
                  onChange={(e) => setCoachQuery1(e.target.value)}
                  className="mb-2"
                />
                <Label htmlFor="examiner_1">Examiner 1 (coach) *</Label>
                <Select
                  value={String(formData.examiner_1 || '')}
                  onValueChange={(value) => handleChange('examiner_1', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select examiner 1" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(coaches1) && coaches1.length > 0 ? (
                      coaches1.map((c) => {
                        const val = String(c.id);
                        const label = c.full_name || `${c.first_name} ${c.last_name}`;
                        return (
                          <SelectItem key={val} value={val}>
                            {label}
                          </SelectItem>
                        );
                      })
                    ) : (
                      <SelectItem value="__none" disabled>No coaches available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="coach_search_2">Search Examiner 2</Label>
                <Input
                  id="coach_search_2"
                  placeholder="Type to search coaches (min 2 chars)"
                  value={coachQuery2}
                  onChange={(e) => setCoachQuery2(e.target.value)}
                  className="mb-2"
                />
                <Label htmlFor="examiner_2">Examiner 2 (coach, optional)</Label>
                <Select
                  value={String(formData.examiner_2 || '')}
                  onValueChange={(value) => handleChange('examiner_2', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select examiner 2 (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(coaches2) && coaches2.length > 0 ? (
                      coaches2.map((c) => {
                        const val = String(c.id);
                        const label = c.full_name || `${c.first_name} ${c.last_name}`;
                        return (
                          <SelectItem key={val} value={val}>
                            {label}
                          </SelectItem>
                        );
                      })
                    ) : (
                      <SelectItem value="__none" disabled>No coaches available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select value={formData.level} onValueChange={(v) => handleChange('level', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="bad">Bad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* President field removed */}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="certificate_image">Certificate Image</Label>
              <Input id="certificate_image" type="file" onChange={(e) => handleFileChange('certificate_image', e.target.files[0])} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="result_document">Result Document</Label>
              <Input id="result_document" type="file" onChange={(e) => handleFileChange('result_document', e.target.files[0])} />
            </div>
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
              disabled={loading || !formData.grade || !formData.examiner_1}
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