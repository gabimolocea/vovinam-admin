import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UserIcon, Edit3Icon, ArrowLeftIcon, TrophyIcon, GraduationCapIcon, HeartIcon, CalendarIcon, SwordsIcon, PlusIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import axios from 'axios';
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import CreateGradeHistory from './CreateGradeHistory';
import CreateSeminarParticipation from './CreateSeminarParticipation';
import { useAuth } from '../contexts/AuthContext';

// Helper function to format placement with medal emojis
const formatPlacementWithMedal = (placement) => {
  if (!placement) return '';
  
  const placementLower = placement.toLowerCase().replace(' place', '').trim();
  
  switch (placementLower) {
    case '1st':
      return '🥇 1st Place';
    case '2nd':
      return '🥈 2nd Place';
    case '3rd':
      return '🥉 3rd Place';
    default:
      return placement;
  }
};

// Simple Result Dialog Component
const SimpleResultDialog = ({ open, onClose, onSubmit, athleteId }) => {
  const [competitions, setCompetitions] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    competition_id: '',
    category_id: '',
    position: '',
    notes: ''
  });

  useEffect(() => {
    if (open) {
      loadCompetitions();
    }
  }, [open]);

  const loadCompetitions = async () => {
    try {
      const response = await AxiosInstance.get('competitions/');
      if (response.data) {
        // Transform the data to match expected format
        const competitionsWithCategories = response.data.map(competition => ({
          ...competition,
          categories: competition.categories || []
        }));
        setCompetitions(competitionsWithCategories);
      } else {
        console.error('Error loading competitions');
      }
    } catch (error) {
      console.error('Error loading competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name, value) => {
    // If competition changes, reset category and update available categories
    if (name === 'competition_id') {
      const selectedCompetition = competitions.find(comp => comp.id === parseInt(value));
      setAvailableCategories(selectedCompetition ? selectedCompetition.categories : []);
      
      setFormData(prev => ({
        ...prev,
        [name]: value,
        category_id: '' // Reset category when competition changes
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        category: formData.category_id,
        athlete: athleteId,
        submitted_by_athlete: true,
        placement_claimed: formData.position === '1' ? '1st' : formData.position === '2' ? '2nd' : formData.position === '3' ? '3rd' : null,
        notes: formData.notes,
        status: 'pending',
        type: 'solo'
      };
      
      await AxiosInstance.post('category-athlete-score/', submitData);
      onSubmit();
      setFormData({
        competition_id: '',
        category_id: '',
        position: '',
        notes: ''
      });
      setAvailableCategories([]);
    } catch (error) {
      console.error('Error submitting result:', error);
      throw error;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Submit Competition Result</DialogTitle>
          <DialogDescription>
            Submit your competition result for review by administrators.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Progress indicator */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Progress: {formData.competition_id ? (formData.category_id ? (formData.position ? '3' : '2') : '1') : '0'}/3 steps completed
              </p>
              <div className="flex gap-2">
                <Badge variant={formData.competition_id ? "default" : "outline"}>Competition</Badge>
                <Badge variant={formData.category_id ? "default" : "outline"}>Category</Badge>
                <Badge variant={formData.position ? "default" : "outline"}>Position</Badge>
              </div>
            </div>

            {/* Competition Selection */}
            <div className="space-y-2">
              <Label htmlFor="competition_id">Competition *</Label>
              <Select value={formData.competition_id} onValueChange={(value) => handleInputChange('competition_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a competition" />
                </SelectTrigger>
                <SelectContent>
                  {competitions.map((competition) => (
                    <SelectItem key={competition.id} value={competition.id.toString()}>
                      <div>
                        <div className="font-medium">{competition.name}</div>
                        <div className="text-sm text-gray-500">
                          {competition.start_date} {competition.place && `• ${competition.place}`} • {competition.categories?.length || 0} categories
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show helper text if no competition selected */}
            {!formData.competition_id && (
              <Alert>
                <AlertDescription>
                  Please select a competition first to see available categories
                </AlertDescription>
              </Alert>
            )}

            {/* Category Selection - Only show if competition is selected */}
            {formData.competition_id && (
              <div className="space-y-2">
                <Label htmlFor="category_id">Category *</Label>
                <Select 
                  value={formData.category_id} 
                  onValueChange={(value) => handleInputChange('category_id', value)}
                  disabled={availableCategories.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.length === 0 ? (
                      <SelectItem value="" disabled>
                        No categories available for this competition
                      </SelectItem>
                    ) : (
                      availableCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {formData.competition_id && (
                  <p className="text-sm text-gray-500">
                    Showing {availableCategories.length} categories for selected competition
                  </p>
                )}
              </div>
            )}

            {/* Position Selection - Only show if category is selected */}
            {formData.category_id && (
              <div className="space-y-2">
                <Label htmlFor="position">Position/Result *</Label>
                <Select value={formData.position} onValueChange={(value) => handleInputChange('position', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Place 🥇</SelectItem>
                    <SelectItem value="2">2nd Place 🥈</SelectItem>
                    <SelectItem value="3">3rd Place 🥉</SelectItem>
                    <SelectItem value="participation">Participation</SelectItem>
                    <SelectItem value="dnf">Did Not Finish</SelectItem>
                    <SelectItem value="dq">Disqualified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Additional Notes */}
            {formData.category_id && (
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes about the result"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {formData.competition_id && formData.category_id && formData.position && (
                <Button type="submit">
                  Submit Result
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ViewAthleteConverted = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [seminars, setSeminars] = useState([]);
  const [availableTrainingSeminars, setAvailableTrainingSeminars] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [annualVisas, setAnnualVisas] = useState([]);
  const [matches, setMatches] = useState([]);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  const [isSeminarDialogOpen, setIsSeminarDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isPersonalDetailsOpen, setIsPersonalDetailsOpen] = useState(false);
  const [isEmergencyContactOpen, setIsEmergencyContactOpen] = useState(false);
  // Sorting state for tables
  const [resultsSort, setResultsSort] = useState({ key: null, dir: null }); // dir: 'asc' | 'desc'
  const [seminarsSort, setSeminarsSort] = useState({ key: null, dir: null });
  const [gradesSort, setGradesSort] = useState({ key: null, dir: null });

  const isAdmin = user?.is_staff || user?.is_superuser;
  const canEdit = isAdmin || (user && athlete?.user?.id === user.id);

  // Determine if the currently authenticated user is the athlete themselves
  const isOwnProfile = useMemo(() => {
    if (!user || !athlete) return false;
    // Support multiple user shapes used across the app
    const byRole = user.role === 'athlete' && user.athlete && user.athlete.id === parseInt(id);
    const byRelation = athlete?.user?.id && athlete.user.id === user.id;
    const adminFlag = user.is_admin || user?.is_staff || user?.is_superuser;
    return Boolean(byRole || byRelation || adminFlag);
  }, [user, athlete, id]);

  // Calculate medal counts
  const medalCounts = useMemo(() => {
    if (!results || !Array.isArray(results) || results.length === 0) return { gold: 0, silver: 0, bronze: 0, total: 0 };

    const counts = { gold: 0, silver: 0, bronze: 0, total: 0 };
    
    results.forEach(result => {
      const placement = result.placement_claimed || result.placement || '';
      const placementLower = placement.toLowerCase().replace(' place', '').trim();
      
      switch (placementLower) {
        case '1st':
          counts.gold++;
          break;
        case '2nd':
          counts.silver++;
          break;
        case '3rd':
          counts.bronze++;
          break;
      }
    });
    
    counts.total = counts.gold + counts.silver + counts.bronze;
    return counts;
  }, [results]);

  // Generic sorter helper
  const sortArray = (arr, key, dir, accessor) => {
    if (!key || !dir) return arr;
    const a = [...arr];
    a.sort((x, y) => {
      const ax = accessor ? accessor(x, key) : (x[key] ?? '');
      const ay = accessor ? accessor(y, key) : (y[key] ?? '');
      if (ax == null) return 1;
      if (ay == null) return -1;
      const sx = typeof ax === 'string' ? ax.toString().toLowerCase() : ax;
      const sy = typeof ay === 'string' ? ay.toString().toLowerCase() : ay;
      if (sx < sy) return dir === 'asc' ? -1 : 1;
      if (sx > sy) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return a;
  };

  // Memoized sorted versions
  const sortedResults = useMemo(() => {
    return sortArray(results, resultsSort.key, resultsSort.dir, (row, key) => {
      switch (key) {
        case 'competition':
          return row.competition_name || row.competition?.name || '';
        case 'category':
          return row.category_name || row.category?.name || '';
        case 'group':
          return row.group_name || row.group?.name || '';
        case 'placement':
          return row.placement_claimed || row.placement || '';
        case 'status':
          return row.status || '';
        default:
          return '';
      }
    });
  }, [results, resultsSort]);

  const sortedSeminars = useMemo(() => {
    return sortArray(seminars, seminarsSort.key, seminarsSort.dir, (row, key) => {
      switch (key) {
        case 'seminar':
          return row.seminar?.name || row.seminar_name || '';
        case 'date':
          return row.date_attended || '';
        case 'instructor':
          return row.instructor_name || '';
        default:
          return '';
      }
    });
  }, [seminars, seminarsSort]);

  const sortedGrades = useMemo(() => {
    return sortArray(grades, gradesSort.key, gradesSort.dir, (row, key) => {
      switch (key) {
        case 'grade':
          return row.grade || row.grade_name || '';
        case 'awarded_by':
          return row.awarded_by || '';
        case 'date':
          return row.date_achieved || '';
        default:
          return '';
      }
    });
  }, [grades, gradesSort]);

  const fetchAthleteData = async () => {
    try {
      setLoading(true);
      setError(null);

      // First fetch the athlete data
      const athleteResponse = await AxiosInstance.get(`athletes/${id}/`);
      setAthlete(athleteResponse.data);

      // Then fetch related data - some endpoints don't support athlete filtering
      const [
        resultsResponse,
        seminarsResponse,
        gradesResponse,
        gradeOptionsResponse,
        medicalResponse,
        annualResponse,
        matchesResponse,
        trainingSeminarsResponse
      ] = await Promise.all([
        AxiosInstance.get(`category-athlete-score/all_results/?athlete_id=${id}`).catch((err) => {
          console.warn('Failed to fetch athlete results:', err.response?.status, err.message);
          return { data: [] };
        }),
        // These endpoints may not support filtering by athlete ID
        // For now, fetch all data and filter client-side if needed
        AxiosInstance.get(`seminar-submissions/?athlete=${id}`).catch((err) => {
          console.warn('Failed to fetch seminar-submissions:', err.response?.status, err.message);
          return { data: [] };
        }),
        AxiosInstance.get(`grade-submissions/`).catch((err) => {
          console.warn('Failed to fetch grade-submissions:', err.response?.status, err.message);
          return { data: [] };
        }),
        // Fetch grade master list from admin endpoint so the grade selector can show available grades
        axios.get('http://127.0.0.1:8000/admin/api/grade/').catch((err) => {
          console.warn('Failed to fetch grade options:', err.response?.status, err.message);
          return { data: [] };
        }),
        AxiosInstance.get(`medical-visas/`).catch((err) => {
          console.warn('Failed to fetch medical-visas:', err.response?.status, err.message);
          return { data: [] };
        }),
        AxiosInstance.get(`annual-visas/`).catch((err) => {
          console.warn('Failed to fetch annual-visas:', err.response?.status, err.message);
          return { data: [] };
        }),
        AxiosInstance.get(`matches/`).catch((err) => {
          console.warn('Failed to fetch matches:', err.response?.status, err.message);
          return { data: [] };
        })
        ,
        // Fetch available training seminars for the "Add Seminar" flow
        AxiosInstance.get(`training-seminars/`).catch((err) => {
          console.warn('Failed to fetch training-seminars:', err.response?.status, err.message);
          return { data: [] };
        })
      ]);

      // Set the data with proper validation
      // Note: When authentication is working, this will replace the sample data
      if (Array.isArray(resultsResponse.data) && resultsResponse.data.length > 0) {
        setResults(resultsResponse.data);
      }
      
      // Filter data by athlete ID for endpoints that return all data
      const athleteId = parseInt(id);
      
      const filteredSeminars = Array.isArray(seminarsResponse.data) ? 
        seminarsResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId) : [];
      const filteredGrades = Array.isArray(gradesResponse.data) ? 
        gradesResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId) : [];
  const fetchedGradeOptions = Array.isArray(gradeOptionsResponse?.data) ? gradeOptionsResponse.data : [];
      const filteredMedical = Array.isArray(medicalResponse.data) ? 
        medicalResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId) : [];
      const filteredAnnual = Array.isArray(annualResponse.data) ? 
        annualResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId) : [];
      const filteredMatches = Array.isArray(matchesResponse.data) ? 
        matchesResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId) : [];

      // Available training seminars for the Add Seminar dialog
      setAvailableTrainingSeminars(Array.isArray(trainingSeminarsResponse?.data) ? trainingSeminarsResponse.data : []);
      
      setSeminars(filteredSeminars);
  setGrades(filteredGrades);
  setGradeOptions(fetchedGradeOptions);
      setMedicalHistory(filteredMedical);
      setAnnualVisas(filteredAnnual);
      setMatches(filteredMatches);
    } catch (error) {
      console.error("Error fetching athlete data:", error);
      setError("Failed to load athlete information");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchAthleteData();
    }
  }, [id]);

  const handleResultSubmit = () => {
    setIsResultDialogOpen(false);
    fetchAthleteData(); // Refresh data
  };

  const handleGradeSubmit = () => {
    setIsGradeDialogOpen(false);
    fetchAthleteData();
  };

  const handleSeminarSubmit = () => {
    setIsSeminarDialogOpen(false);
    fetchAthleteData();
  };

  const handleApproveSeminar = async (submissionId) => {
    if (!submissionId) return;
    if (!window.confirm('Approve this seminar participation?')) return;
    setActionLoading(true);
    try {
      await AxiosInstance.post(`seminar-submissions/${submissionId}/approve/`, {});
      await fetchAthleteData();
    } catch (err) {
      console.error('Failed to approve seminar submission', err, err.response?.data);
      setError('Failed to approve seminar submission');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSeminar = async (submissionId) => {
    if (!submissionId) return;
    if (!window.confirm('Reject this seminar participation?')) return;
    setActionLoading(true);
    try {
      await AxiosInstance.post(`seminar-submissions/${submissionId}/reject/`, {});
      await fetchAthleteData();
    } catch (err) {
      console.error('Failed to reject seminar submission', err, err.response?.data);
      setError('Failed to reject seminar submission');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevisionSeminar = async (submissionId) => {
    if (!submissionId) return;
    const notes = window.prompt('Enter revision notes for the athlete (optional)');
    if (notes === null) return; // cancelled
    setActionLoading(true);
    try {
      await AxiosInstance.post(`seminar-submissions/${submissionId}/request_revision/`, { notes });
      await fetchAthleteData();
    } catch (err) {
      console.error('Failed to request revision for seminar submission', err, err.response?.data);
      setError('Failed to request revision for seminar submission');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!athlete) {
    return (
      <Alert>
        <AlertDescription>Athlete not found</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Header with back button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
        <Button
          variant="outline"
          onClick={() => navigate("/athletes")}
          className="flex items-center justify-center gap-2"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Athletes</span>
          <span className="sm:hidden">Back</span>
        </Button>
        {canEdit && (
          <Button
            onClick={() => navigate(`/athletes/edit/${athlete.id}`)}
            className="flex items-center justify-center gap-2"
          >
            <Edit3Icon className="h-4 w-4" />
            <span className="hidden sm:inline">Edit Athlete</span>
            <span className="sm:hidden">Edit</span>
          </Button>
        )}
      </div>

      {/* Athlete Profile Header */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            {/* Profile Image */}
            <div className="flex-shrink-0 self-center sm:self-start">
              {athlete.profile_image ? (
                <div className="relative flex flex-col items-center gap-2">
                  <img 
                    src={athlete.profile_image.startsWith('http') ? athlete.profile_image : `http://127.0.0.1:8000${athlete.profile_image}`}
                    alt={`${athlete.first_name} ${athlete.last_name}`}
                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover border-4 border-gray-200"
                    style={{ borderRadius: '5%' }}
                  />
                  {athlete.current_grade_details?.image && (
                    <img 
                      src={athlete.current_grade_details.image.startsWith('http') ? athlete.current_grade_details.image : `http://127.0.0.1:8000${athlete.current_grade_details.image}`}
                      alt={athlete.current_grade_details.name || "Grade badge"}
                      className="max-h-6 w-auto object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gray-200 border-4 border-gray-300 flex items-center justify-center">
                  <UserIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400" />
                </div>
              )}
            </div>

            {/* Athlete Info */}
            <div className="flex-1 space-y-3 sm:space-y-4 text-center sm:text-left w-full sm:w-auto">
              <div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                    {athlete.first_name} {athlete.last_name}
                    {(athlete?.club?.name || athlete?.club) && (
                      <span className="text-lg sm:text-xl text-gray-600 font-normal ml-2 inline-block">({athlete?.club?.name || athlete?.club})</span>
                    )}
                  </h1>
                  
                  {/* Medal Counts - show emoji icons beneath the athlete name (always show counts, even 0) */}
                  <div className="flex items-center gap-4 mt-2 justify-center sm:justify-start text-base sm:text-lg text-gray-700 font-medium">
                    <span className="flex items-center gap-2" aria-label={`${medalCounts.gold} gold medal${medalCounts.gold !== 1 ? 's' : ''}`}>
                      <span role="img" aria-hidden="true" className="text-xl">🥇</span>
                      <span className="text-sm sm:text-base">{medalCounts.gold}</span>
                    </span>

                    <span className="flex items-center gap-2" aria-label={`${medalCounts.silver} silver medal${medalCounts.silver !== 1 ? 's' : ''}`}>
                      <span role="img" aria-hidden="true" className="text-xl">🥈</span>
                      <span className="text-sm sm:text-base">{medalCounts.silver}</span>
                    </span>

                    <span className="flex items-center gap-2" aria-label={`${medalCounts.bronze} bronze medal${medalCounts.bronze !== 1 ? 's' : ''}`}>
                      <span role="img" aria-hidden="true" className="text-xl">🥉</span>
                      <span className="text-sm sm:text-base">{medalCounts.bronze}</span>
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 justify-center sm:justify-start">
                    <Badge variant={athlete.status === 'approved' ? 'default' : 'secondary'}>
                      {athlete.status || 'pending'}
                    </Badge>
                    {athlete.club?.name && !athlete.club?.name.includes('Club:') && (
                      <Badge variant="outline" className="hidden sm:inline-flex">
                        {athlete.club.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* More Details Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4">
                <Sheet open={isPersonalDetailsOpen} onOpenChange={setIsPersonalDetailsOpen}>
                  <SheetTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-2 flex-1 sm:flex-none justify-center"
                    >
                      <UserIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Personal Details</span>
                      <span className="sm:hidden">Details</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent hideOverlay className="max-w-md">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <UserIcon className="h-5 w-5" />
                        Personal Details
                      </SheetTitle>
                      <SheetDescription>
                        Complete personal information for {athlete.first_name} {athlete.last_name}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-6 py-4">
                      <div>
                        <h4 className="text-md font-semibold mb-3">Basic Information</h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-medium">Date of Birth</div>
                              <div className="text-sm mt-1">{athlete.date_of_birth ? new Date(athlete.date_of_birth).toLocaleDateString() : "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Gender</div>
                              <div className="text-sm mt-1">{athlete.gender || "N/A"}</div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-medium">Phone</div>
                              <div className="text-sm mt-1">{athlete.phone_number || "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Email</div>
                              <div className="text-sm mt-1">{athlete.email || athlete.user?.email || "N/A"}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-md font-semibold mb-3">Address Information</h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-medium">Address</div>
                              <div className="text-sm mt-1">{athlete.address || "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">City</div>
                              <div className="text-sm mt-1">{athlete.city || "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">State</div>
                              <div className="text-sm mt-1">{athlete.state || "N/A"}</div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-medium">Postal Code</div>
                              <div className="text-sm mt-1">{athlete.postal_code || "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Country</div>
                              <div className="text-sm mt-1">{athlete.country || "N/A"}</div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Nationality</div>
                              <div className="text-sm mt-1">{athlete.nationality || "N/A"}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>

                <Sheet open={isEmergencyContactOpen} onOpenChange={setIsEmergencyContactOpen}>
                  <SheetTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-2 flex-1 sm:flex-none justify-center"
                    >
                      <HeartIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Emergency Contact</span>
                      <span className="sm:hidden">Contact</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent hideOverlay>
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <HeartIcon className="h-5 w-5" />
                        Emergency Contact
                      </SheetTitle>
                      <SheetDescription>
                        Emergency contact information for {athlete.first_name} {athlete.last_name}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <div className="text-sm font-medium">Contact Name</div>
                        <div className="text-sm mt-1">{athlete.emergency_contact_name || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Phone Number</div>
                        <div className="text-sm mt-1">{athlete.emergency_contact_phone || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Relationship</div>
                        <div className="text-sm mt-1">{athlete.emergency_contact_relationship || "N/A"}</div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CoinMarketCap-style Tables */}
      <div className="space-y-8">
        
        {/* Competition Results Table */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrophyIcon className="h-5 w-5" />
                Competition Results
              </CardTitle>
              <CardDescription>
                Competition history and achievements
              </CardDescription>
            </div>
            {(canEdit || isOwnProfile) && (
              <Button onClick={() => setIsResultDialogOpen(true)} size="sm" className="w-full sm:w-auto">
                <PlusIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Add Result</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead
                        className="font-semibold min-w-[120px]"
                        sortable
                        sortDirection={resultsSort.key === 'competition' ? resultsSort.dir : null}
                        onClick={() => setResultsSort(prev => prev.key === 'competition' ? { key: 'competition', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'competition', dir: 'asc' })}
                      >
                        Competition
                      </TableHead>
                      <TableHead
                        className="font-semibold min-w-[100px]"
                        sortable
                        sortDirection={resultsSort.key === 'category' ? resultsSort.dir : null}
                        onClick={() => setResultsSort(prev => prev.key === 'category' ? { key: 'category', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'category', dir: 'asc' })}
                      >
                        Category
                      </TableHead>
                      <TableHead
                        className="font-semibold min-w-[80px] hidden sm:table-cell"
                        sortable
                        sortDirection={resultsSort.key === 'group' ? resultsSort.dir : null}
                        onClick={() => setResultsSort(prev => prev.key === 'group' ? { key: 'group', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'group', dir: 'asc' })}
                      >
                        Group
                      </TableHead>
                      <TableHead
                        className="font-semibold min-w-[100px]"
                        sortable
                        sortDirection={resultsSort.key === 'placement' ? resultsSort.dir : null}
                        onClick={() => setResultsSort(prev => prev.key === 'placement' ? { key: 'placement', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'placement', dir: 'asc' })}
                      >
                        Placement
                      </TableHead>
                      <TableHead
                        className="font-semibold min-w-[80px]"
                        sortable
                        sortDirection={resultsSort.key === 'status' ? resultsSort.dir : null}
                        onClick={() => setResultsSort(prev => prev.key === 'status' ? { key: 'status', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'status', dir: 'asc' })}
                      >
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedResults.length > 0 ? (
                      sortedResults.map((result, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="font-medium">
                            <div className="min-w-0">
                              <div className="truncate">{result.competition_name || result.competition?.name || "N/A"}</div>
                              <div className="text-xs text-gray-500 sm:hidden mt-1">
                                {result.group_name || result.group?.name || "N/A"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="truncate">{result.category_name || result.category?.name || "N/A"}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {result.group_name || result.group?.name || "N/A"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatPlacementWithMedal(result.placement_claimed || result.placement)}
                            </div>
                          </TableCell>
                          
                          <TableCell>
                            <Badge variant={result.status === 'approved' ? 'default' : 'secondary'}>
                              {result.status || 'pending'}
                            </Badge>
                          </TableCell>
                          
                      </TableRow>
                    ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          No competition results found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seminars Table */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCapIcon className="h-5 w-5" />
                Seminar Participation
              </CardTitle>
              <CardDescription>
                Training seminars and educational events
              </CardDescription>
            </div>
            {(canEdit || isOwnProfile) && (
              <Button onClick={() => setIsSeminarDialogOpen(true)} size="sm" className="w-full sm:w-auto">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Seminar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold min-w-[120px]" sortable sortDirection={seminarsSort.key === 'seminar' ? seminarsSort.dir : null} onClick={() => setSeminarsSort(prev => prev.key === 'seminar' ? { key: 'seminar', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'seminar', dir: 'asc' })}>Seminar</TableHead>
                      <TableHead className="font-semibold min-w-[100px] hidden sm:table-cell" sortable sortDirection={seminarsSort.key === 'instructor' ? seminarsSort.dir : null} onClick={() => setSeminarsSort(prev => prev.key === 'instructor' ? { key: 'instructor', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'instructor', dir: 'asc' })}>Instructor</TableHead>
                      <TableHead className="font-semibold min-w-[100px]" sortable sortDirection={seminarsSort.key === 'date' ? seminarsSort.dir : null} onClick={() => setSeminarsSort(prev => prev.key === 'date' ? { key: 'date', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'date', dir: 'asc' })}>Date</TableHead>
                      <TableHead className="font-semibold min-w-[100px] hidden md:table-cell" sortable sortDirection={seminarsSort.key === 'city' ? seminarsSort.dir : null} onClick={() => setSeminarsSort(prev => prev.key === 'city' ? { key: 'city', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'city', dir: 'asc' })}>City</TableHead>
                      <TableHead className="font-semibold min-w-[80px]" sortable sortDirection={seminarsSort.key === 'status' ? seminarsSort.dir : null} onClick={() => setSeminarsSort(prev => prev.key === 'status' ? { key: 'status', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'status', dir: 'asc' })}>Status</TableHead>
                      {isAdmin && (
                        <TableHead className="font-semibold min-w-[120px]">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSeminars.length > 0 ? (
                      sortedSeminars.map((seminar, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="font-medium">
                            <div className="min-w-0">
                              <div className="truncate">{seminar.seminar?.name || seminar.seminar_name || "N/A"}</div>
                              <div className="text-xs text-gray-500 sm:hidden mt-1">
                                {seminar.instructor_name || "N/A"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {seminar.instructor_name || "N/A"}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {seminar.date_attended ? new Date(seminar.date_attended).toLocaleDateString() : "N/A"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {seminar.city_name || (seminar.city && seminar.city.name) || seminar.location || seminar.place || "N/A"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={seminar.status === 'approved' ? 'default' : 'secondary'}>
                              {seminar.status || 'pending'}
                            </Badge>
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {seminar.status !== 'approved' && (
                                  <Button size="sm" className="bg-green-600 text-white" onClick={() => handleApproveSeminar(seminar.id)} disabled={actionLoading}>
                                    Approve
                                  </Button>
                                )}
                                {seminar.status !== 'rejected' && (
                                  <Button size="sm" variant="destructive" onClick={() => handleRejectSeminar(seminar.id)} disabled={actionLoading}>
                                    Reject
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => handleRequestRevisionSeminar(seminar.id)} disabled={actionLoading}>
                                  Request Revision
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-gray-500 py-8">
                          No seminar participation found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grades Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCapIcon className="h-5 w-5" />
                Grade History
              </CardTitle>
              <CardDescription>
                Belt and rank progression
              </CardDescription>
            </div>
            {(canEdit || isOwnProfile) && (
              <Button onClick={() => setIsGradeDialogOpen(true)} size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Grade
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold" sortable sortDirection={gradesSort.key === 'grade' ? gradesSort.dir : null} onClick={() => setGradesSort(prev => prev.key === 'grade' ? { key: 'grade', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'grade', dir: 'asc' })}>Grade</TableHead>
                    <TableHead className="font-semibold" sortable sortDirection={gradesSort.key === 'awarded_by' ? gradesSort.dir : null} onClick={() => setGradesSort(prev => prev.key === 'awarded_by' ? { key: 'awarded_by', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'awarded_by', dir: 'asc' })}>Awarded By</TableHead>
                    <TableHead className="font-semibold" sortable sortDirection={gradesSort.key === 'date' ? gradesSort.dir : null} onClick={() => setGradesSort(prev => prev.key === 'date' ? { key: 'date', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'date', dir: 'asc' })}>Date Achieved</TableHead>
                    <TableHead className="font-semibold" sortable sortDirection={gradesSort.key === 'status' ? gradesSort.dir : null} onClick={() => setGradesSort(prev => prev.key === 'status' ? { key: 'status', dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: 'status', dir: 'asc' })}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedGrades.length > 0 ? (
                    sortedGrades.map((grade, index) => (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {grade.grade?.name || grade.grade_name || "N/A"}
                        </TableCell>
                        <TableCell>
                          {grade.awarded_by?.name || grade.awarded_by || grade.awarded_by_name || "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {grade.date_achieved ? new Date(grade.date_achieved).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={grade.status === 'approved' ? 'default' : 'secondary'}>
                            {grade.status || 'pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                        No grade history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Medical History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartIcon className="h-5 w-5" />
              Medical History
            </CardTitle>
            <CardDescription>
              Medical records and health information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Description</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Doctor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medicalHistory.length > 0 ? (
                    medicalHistory.map((record, index) => (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {record.type || "Medical Record"}
                        </TableCell>
                        <TableCell>
                          {record.description || "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {record.date ? new Date(record.date).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell>
                          {record.doctor_name || "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                        No medical history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Annual Visas Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Annual Visas
            </CardTitle>
            <CardDescription>
              Annual membership and visa information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Year</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Issue Date</TableHead>
                    <TableHead className="font-semibold">Expiry Date</TableHead>
                    <TableHead className="font-semibold">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {annualVisas.length > 0 ? (
                    annualVisas.map((visa, index) => (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {visa.year || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={visa.status === 'active' ? 'default' : 'secondary'}>
                            {visa.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {visa.issue_date ? new Date(visa.issue_date).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {visa.expiry_date ? new Date(visa.expiry_date).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell>
                          {visa.amount ? `$${visa.amount}` : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                        No annual visa records found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Matches Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SwordsIcon className="h-5 w-5" />
              Match History
            </CardTitle>
            <CardDescription>
              Competition matches and bout records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Opponent</TableHead>
                    <TableHead className="font-semibold">Competition</TableHead>
                    <TableHead className="font-semibold">Result</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.length > 0 ? (
                    matches.map((match, index) => (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          {match.opponent_name || "N/A"}
                        </TableCell>
                        <TableCell>
                          {match.competition?.name || match.competition_name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={match.result === 'win' ? 'default' : match.result === 'loss' ? 'destructive' : 'secondary'}>
                            {match.result || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {match.date ? new Date(match.date).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {match.notes || "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                        No match history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Additional Information Cards */}


      {/* Documents */}
      {athlete.medical_certificate && (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-gray-500">Medical Certificate</div>
              <a 
                href={athlete.medical_certificate.startsWith('http') ? athlete.medical_certificate : `http://127.0.0.1:8000${athlete.medical_certificate}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 underline"
              >
                📄 View Medical Certificate
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <SimpleResultDialog
        open={isResultDialogOpen}
        onClose={() => setIsResultDialogOpen(false)}
        onSubmit={handleResultSubmit}
        athleteId={athlete.id}
      />

      <CreateGradeHistory
        open={isGradeDialogOpen}
        onClose={() => setIsGradeDialogOpen(false)}
        onSuccess={handleGradeSubmit}
        athleteId={athlete.id}
        grades={gradeOptions}
      />

      <CreateSeminarParticipation
        open={isSeminarDialogOpen}
        onClose={() => setIsSeminarDialogOpen(false)}
        onSuccess={handleSeminarSubmit}
        athleteId={athlete.id}
        trainingSeminars={availableTrainingSeminars}
      />

      
    </div>
  );
};

export default ViewAthleteConverted;