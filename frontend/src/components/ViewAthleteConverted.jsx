import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UserIcon, Edit3Icon, ArrowLeftIcon, TrophyIcon, GraduationCapIcon, HeartIcon, CalendarIcon, SwordsIcon, PlusIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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
  const [formData, setFormData] = useState({
    competition_name: '',
    category_name: '',
    group_name: '',
    placement_claimed: '',
    notes: '',
    type: 'individual'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        ...formData,
        athlete: athleteId,
        status: 'pending'
      };
      
      await AxiosInstance.post('category-athlete-score/', submitData);
      onSubmit();
      setFormData({
        competition_name: '',
        category_name: '',
        group_name: '',
        placement_claimed: '',
        notes: '',
        type: 'individual'
      });
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="competition_name">Competition Name</Label>
            <Input
              id="competition_name"
              value={formData.competition_name}
              onChange={(e) => setFormData(prev => ({ ...prev, competition_name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_name">Category Name</Label>
            <Input
              id="category_name"
              value={formData.category_name}
              onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group_name">Group Name (Optional)</Label>
            <Input
              id="group_name"
              value={formData.group_name}
              onChange={(e) => setFormData(prev => ({ ...prev, group_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="placement_claimed">Placement</Label>
            <Input
              id="placement_claimed"
              value={formData.placement_claimed}
              onChange={(e) => setFormData(prev => ({ ...prev, placement_claimed: e.target.value }))}
              placeholder="e.g., 1st, 2nd, 3rd"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes about the competition result"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Submit Result
            </Button>
          </DialogFooter>
        </form>
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
  const [errorMessage, setErrorMessage] = useState("");
  const [athleteResults, setAthleteResults] = useState([]);
  const [relatedData, setRelatedData] = useState({});
  const [trainingSeminars, setTrainingSeminars] = useState([]);
  const [gradeHistory, setGradeHistory] = useState([]);
  const [medicalVisa, setMedicalVisa] = useState([]);
  const [annualVisa, setAnnualVisa] = useState([]);
  const [matches, setMatches] = useState([]);
  
  // Dialog states for adding/editing data
  const [resultDialog, setResultDialog] = useState({ open: false, mode: 'add', data: null });
  const [seminarDialog, setSeminarDialog] = useState({ open: false, mode: 'add', data: null });
  const [gradeDialog, setGradeDialog] = useState({ open: false, mode: 'add', data: null });
  const [medicalVisaDialog, setMedicalVisaDialog] = useState({ open: false, mode: 'add', data: null });
  const [annualVisaDialog, setAnnualVisaDialog] = useState({ open: false, mode: 'add', data: null });
  const [matchDialog, setMatchDialog] = useState({ open: false, mode: 'add', data: null });
  const [createGradeDialogOpen, setCreateGradeDialogOpen] = useState(false);
  const [createSeminarDialogOpen, setCreateSeminarDialogOpen] = useState(false);
  const [availableGrades, setAvailableGrades] = useState([]);
  const [availableTrainingSeminars, setAvailableTrainingSeminars] = useState([]);
  const [feedbackDialog, setFeedbackDialog] = useState({ open: false, success: false, message: '' });
  
  // Check if this is the user's own profile
  const isOwnProfile = useMemo(() => {
    return user && athlete && (
      (user.role === 'athlete' && user.athlete && user.athlete.id === parseInt(id)) ||
      (user.is_admin)
    );
  }, [user, athlete, id]);

  // Fetch athlete's submitted results
  const fetchAthleteResults = async () => {
    try {
      // Pass athlete_id parameter to get results for this specific athlete
      const response = await AxiosInstance.get(`category-athlete-score/all_results/?athlete_id=${id}`);
      setAthleteResults(response.data);
    } catch (error) {
      console.error("Error fetching athlete results:", error);
    }
  };

  // Dialog handlers
  const handleResultDialog = (mode, data = null) => {
    setResultDialog({ open: true, mode, data });
  };

  const handleSeminarDialog = (mode, data = null) => {
    setSeminarDialog({ open: true, mode, data });
  };

  const handleGradeDialog = (mode, data = null) => {
    setGradeDialog({ open: true, mode, data });
  };

  const handleMedicalVisaDialog = (mode, data = null) => {
    setMedicalVisaDialog({ open: true, mode, data });
  };

  const handleAnnualVisaDialog = (mode, data = null) => {
    setAnnualVisaDialog({ open: true, mode, data });
  };

  const handleMatchDialog = (mode, data = null) => {
    setMatchDialog({ open: true, mode, data });
  };

  const handleCloseDialog = () => {
    setResultDialog({ open: false, mode: 'add', data: null });
    setSeminarDialog({ open: false, mode: 'add', data: null });
    setGradeDialog({ open: false, mode: 'add', data: null });
    setMedicalVisaDialog({ open: false, mode: 'add', data: null });
    setAnnualVisaDialog({ open: false, mode: 'add', data: null });
    setMatchDialog({ open: false, mode: 'add', data: null });
  };

  const handleSaveResult = async (resultData) => {
    try {
      handleCloseDialog();
      setFeedbackDialog({
        open: true,
        success: true,
        message: 'Result submitted successfully!'
      });
      await fetchAthleteResults();
    } catch (error) {
      console.error("Error saving result:", error);
      handleCloseDialog();
      setFeedbackDialog({
        open: true,
        success: false,
        message: 'An error occurred while saving the result. Please try again.'
      });
    }
  };

  const handleDeleteResult = async (resultId) => {
    if (window.confirm('Are you sure you want to delete this result?')) {
      try {
        await AxiosInstance.delete(`category-athlete-score/${resultId}/`);
        setFeedbackDialog({
          open: true,
          success: true,
          message: 'Result deleted successfully!'
        });
        await fetchAthleteResults();
      } catch (error) {
        console.error("Error deleting result:", error);
        setFeedbackDialog({
          open: true,
          success: false,
          message: 'An error occurred while deleting the result. Please try again.'
        });
      }
    }
  };

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        setLoading(true);
        
        // Fetch athlete data and related information
        const [
          athleteResponse,
          seminarsResponse,
          gradeHistoryResponse,
          medicalVisaResponse,
          annualVisaResponse,
          matchesResponse
        ] = await Promise.all([
          AxiosInstance.get(`athletes/${id}/`),
          AxiosInstance.get(`training-seminars/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`grade-histories/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`medical-visas/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`annual-visas/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`matches/?athlete=${id}`).catch(() => ({ data: [] }))
        ]);

        setAthlete(athleteResponse.data);
        setRelatedData(athleteResponse.data); // Store related data including categories
        setTrainingSeminars(seminarsResponse.data);
        setGradeHistory(gradeHistoryResponse.data);
        setMedicalVisa(medicalVisaResponse.data);
        setAnnualVisa(annualVisaResponse.data);
        setMatches(matchesResponse.data);

        // Fetch athlete results separately
        await fetchAthleteResults();
      } catch (error) {
        console.error("Error fetching athlete data:", error);
        setErrorMessage("Failed to load athlete data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAthleteData();
    }
  }, [id]);

  // Process and merge all results data (moved before early returns to fix hook order)
  const allResults = useMemo(() => {
    const results = [];
    
    // 1. Add athlete-submitted/team results from backend
    if (athleteResults?.length > 0) {
      athleteResults.forEach(result => {
        const isTeamResult = result.type === 'teams';
        const isSubmitter = result.athlete?.id === parseInt(id);
        
        results.push({
          id: `submitted-${result.id}`,
          competition_name: result.competition_name || 'N/A',
          category_name: result.category_name || 'N/A',
          group_name: result.group_name || null,
          placement: formatPlacementWithMedal(result.placement_claimed),
          type: isTeamResult ? 'Team' : 'Individual',
          source: isSubmitter ? 'Self-Submitted' : 'Team Member',
          status: result.status,
          submitted_date: result.submitted_date,
          team_members: isTeamResult ? result.team_members : null,
          team_name: result.team_name || null,
          notes: result.notes,
          statusChip: true // Flag to show status chip
        });
      });
    }
    
    // 2. Add official results from category data
    if (relatedData?.categories?.length > 0) {
      relatedData.categories.forEach(category => {
        let placement = null;
        let teamName = null;
        let resultType = 'Individual';
        
        // Check individual placements
        if (category?.first_place_name === athlete?.first_name) {
          placement = '🥇 1st Place';
        } else if (category?.second_place_name === athlete?.first_name) {
          placement = '🥈 2nd Place';
        } else if (category?.third_place_name === athlete?.first_name) {
          placement = '🥉 3rd Place';
        }
        // Check team placements
        else if (category?.first_place_team_name?.includes(athlete?.first_name)) {
          placement = '🥇 1st Place';
          teamName = category.first_place_team_name;
          resultType = 'Team';
        } else if (category?.second_place_team_name?.includes(athlete?.first_name)) {
          placement = '🥈 2nd Place';
          teamName = category.second_place_team_name;
          resultType = 'Team';
        } else if (category?.third_place_team_name?.includes(athlete?.first_name)) {
          placement = '🥉 3rd Place';
          teamName = category.third_place_team_name;
          resultType = 'Team';
        }
        
        // Only add if there's a placement
        if (placement) {
          // Check if this result already exists in submitted results to avoid duplicates
          const isDuplicate = results.some(result => 
            result.competition_name === (category?.competition_name || 'N/A') &&
            result.category_name === (category?.name || 'N/A') &&
            result.placement === placement
          );
          
          if (!isDuplicate) {
            results.push({
              id: `official-${category.id}`,
              competition_name: category?.competition_name || 'N/A',
              category_name: category?.name || 'N/A',
              group_name: category?.group_name || null,
              placement: placement,
              type: resultType,
              source: 'Official',
              status: 'approved', // Official results are always approved
              team_name: teamName,
              statusChip: false // Don't show status chip for official results
            });
          }
        }
      });
    }
    
    // Sort by competition date (newest first) and then by placement
    return results.sort((a, b) => {
      // First sort by date if available
      if (a.submitted_date && b.submitted_date) {
        return new Date(b.submitted_date) - new Date(a.submitted_date);
      }
      // Then by placement (1st, 2nd, 3rd)
      const placementOrder = { '🥇 1st Place': 1, '🥈 2nd Place': 2, '🥉 3rd Place': 3 };
      return (placementOrder[a.placement] || 999) - (placementOrder[b.placement] || 999);
    });
  }, [athleteResults, relatedData?.categories, athlete?.first_name, id]);

  // Memoized awards calculation based on allResults (only approved results)
  const awardsCount = useMemo(() => {
    let firstPlace = 0;
    let secondPlace = 0;
    let thirdPlace = 0;

    // Count awards from allResults data (includes solo, fight, and team results)
    // Only count approved results for medal display
    if (allResults?.length > 0) {
      allResults.forEach((result) => {
        // Only count approved results for medals
        if (result.status !== 'approved') {
          return;
        }
        
        // Extract placement from the result (remove medal emojis if present)
        const placement = result.placement?.replace(/[🥇🥈🥉]/g, '').trim();
        
        if (placement === '1st' || placement === '1st Place' || placement === '1') {
          firstPlace++;
        } else if (placement === '2nd' || placement === '2nd Place' || placement === '2') {
          secondPlace++;
        } else if (placement === '3rd' || placement === '3rd Place' || placement === '3') {
          thirdPlace++;
        }
      });
    }

    return { firstPlace, secondPlace, thirdPlace };
  }, [allResults]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading athlete data...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !athlete) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {errorMessage || "Athlete not found."}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate("/athletes")} variant="outline">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Athletes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Profile Image */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-6">
          {/* Profile Image */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-200 bg-gray-100">
              {athlete.profile_image ? (
                <img
                  src={athlete.profile_image.startsWith('http') ? athlete.profile_image : `http://127.0.0.1:8000${athlete.profile_image}`}
                  alt={`${athlete.first_name} ${athlete.last_name}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDIxVjE5QzIwIDE3LjkzOTEgMTkuNTc4NiAxNi45MjE3IDE4LjgyODQgMTYuMTcxNkMxOC4wNzgzIDE1LjQyMTQgMTcuMDYwOSAxNSAxNiAxNUg4QzYuOTM5MTMgMTUgNS45MjE3MiAxNS40MjE0IDUuMTcxNTcgMTYuMTcxNkM0LjQyMTQzIDE2LjkyMTcgNCAxNy45MzkxIDQgMTlWMjEiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTEyIDExQzE0LjIwOTEgMTEgMTYgOS4yMDkxNCAxNiA3QzE2IDQuNzkwODYgMTQuMjA5MSAzIDEyIDNDOS43OTA4NiAzIDggNC43OTA4NiA4IDdDOCA5LjIwOTE0IDkuNzkwODYgMTEgMTIgMTEiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserIcon className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
          </div>
          
          {/* Name and Medals */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {athlete.first_name} {athlete.last_name}
            </h1>
            {/* Medals Display */}
            <div className="flex items-center gap-4 py-2 px-3 bg-gray-50 rounded-lg border">
              <span className="flex items-center gap-2">
                🥇 <span>{awardsCount.firstPlace}</span>
              </span>
              <div className="h-4 w-px bg-gray-300"></div>
              <span className="flex items-center gap-2">
                🥈 <span>{awardsCount.secondPlace}</span>
              </span>
              <div className="h-4 w-px bg-gray-300"></div>
              <span className="flex items-center gap-2">
                🥉 <span>{awardsCount.thirdPlace}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={athlete.status === 'approved' ? 'default' : athlete.status === 'pending' ? 'secondary' : 'destructive'}>
                {athlete.status?.charAt(0).toUpperCase() + athlete.status?.slice(1) || 'N/A'}
              </Badge>
              {athlete.is_coach && (
                <Badge variant="outline">Coach</Badge>
              )}
              {athlete.is_referee && (
                <Badge variant="outline">Referee</Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => navigate("/athletes")} variant="outline">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={() => navigate(`/athletes/edit/${id}`)}>
            <Edit3Icon className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Basic Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Full Name</p>
              <p className="text-lg">{athlete.first_name} {athlete.last_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Date of Birth</p>
              <p className="text-lg">{athlete.date_of_birth || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Mobile Number</p>
              <p className="text-lg">{athlete.mobile_number || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">City</p>
              <p className="text-lg">{athlete.city?.name || athlete.city || "N/A"}</p>
            </div>
            {athlete.address && (
              <div>
                <p className="text-sm font-medium text-gray-500">Address</p>
                <p className="text-lg">{athlete.address}</p>
              </div>
            )}
            {athlete.team_place && (
              <div>
                <p className="text-sm font-medium text-gray-500">Team Place</p>
                <p className="text-lg">{athlete.team_place}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Club & Registration */}
        <Card>
          <CardHeader>
            <CardTitle>Club & Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Club</p>
              <p className="text-lg">{athlete.club?.name || athlete.club || "No Club"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Current Grade</p>
              <p className="text-lg">{athlete.current_grade?.name || athlete.current_grade || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Registered Date</p>
              <p className="text-lg">{athlete.registered_date || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Expiration Date</p>
              <p className="text-lg">{athlete.expiration_date || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Submitted Date</p>
              <p className="text-lg">{athlete.submitted_date ? new Date(athlete.submitted_date).toLocaleDateString() : "N/A"}</p>
            </div>
            {athlete.approved_date && (
              <div>
                <p className="text-sm font-medium text-gray-500">Approved Date</p>
                <p className="text-lg">{new Date(athlete.approved_date).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency Contact & Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact & Additional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {athlete.emergency_contact_name && (
              <div>
                <p className="text-sm font-medium text-gray-500">Emergency Contact</p>
                <p className="text-lg">{athlete.emergency_contact_name}</p>
                {athlete.emergency_contact_phone && (
                  <p className="text-sm text-gray-600">{athlete.emergency_contact_phone}</p>
                )}
              </div>
            )}
            
            {(athlete.federation_role || athlete.title) && (
              <div>
                <p className="text-sm font-medium text-gray-500">Additional Roles</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {athlete.federation_role && (
                    <Badge variant="outline">
                      {athlete.federation_role?.name || athlete.federation_role}
                    </Badge>
                  )}
                  {athlete.title && (
                    <Badge variant="outline">
                      {athlete.title?.name || athlete.title}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {athlete.user && (
              <div>
                <p className="text-sm font-medium text-gray-500">Account Email</p>
                <p className="text-lg">{athlete.user.email || "N/A"}</p>
              </div>
            )}

            {athlete.reviewed_by && (
              <div>
                <p className="text-sm font-medium text-gray-500">Reviewed By</p>
                <p className="text-lg">{athlete.reviewed_by}</p>
                {athlete.reviewed_date && (
                  <p className="text-sm text-gray-600">{new Date(athlete.reviewed_date).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Previous Experience & Admin Notes */}
      {(athlete.previous_experience || athlete.admin_notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {athlete.previous_experience && (
            <Card>
              <CardHeader>
                <CardTitle>Previous Experience</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{athlete.previous_experience}</p>
              </CardContent>
            </Card>
          )}
          
          {athlete.admin_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Admin Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{athlete.admin_notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Documents */}
      {athlete.medical_certificate && (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-500">Medical Certificate</p>
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

      {/* Tabbed Content */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="results" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="results" className="flex items-center gap-2">
                <TrophyIcon className="h-4 w-4" />
                Results
              </TabsTrigger>
              <TabsTrigger value="seminars" className="flex items-center gap-2">
                <GraduationCapIcon className="h-4 w-4" />
                Seminars
              </TabsTrigger>
              <TabsTrigger value="grades" className="flex items-center gap-2">
                <GraduationCapIcon className="h-4 w-4" />
                Grades
              </TabsTrigger>
              <TabsTrigger value="medical" className="flex items-center gap-2">
                <HeartIcon className="h-4 w-4" />
                Medical
              </TabsTrigger>
              <TabsTrigger value="annual" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Annual
              </TabsTrigger>
              <TabsTrigger value="matches" className="flex items-center gap-2">
                <SwordsIcon className="h-4 w-4" />
                Matches
              </TabsTrigger>
            </TabsList>

            <TabsContent value="results" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Competition Results</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleResultDialog('add')} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Submit Result
                    </Button>
                  )}
                </div>
                {allResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competition</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Placement</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allResults.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell>{result.competition_name}</TableCell>
                          <TableCell>{result.category_name}</TableCell>
                          <TableCell>{result.group_name || "N/A"}</TableCell>
                          <TableCell>
                            <span>{result.placement}</span>
                            {result.team_name && (
                              <div className="text-sm text-gray-600 mt-1">
                                Team: {result.team_name}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={result.type === 'Team' ? 'default' : 'secondary'}>
                              {result.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {result.source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {result.statusChip && (
                              <Badge 
                                variant={
                                  result.status === 'approved' ? 'default' : 
                                  result.status === 'pending' ? 'secondary' : 
                                  'destructive'
                                }
                              >
                                {result.status}
                              </Badge>
                            )}
                            {!result.statusChip && (
                              <Badge variant="default">Official</Badge>
                            )}
                          </TableCell>
                          <TableCell>{result.submitted_date || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No competition results found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="seminars" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Training Seminars</h3>
                  {isOwnProfile && (
                    <Button onClick={() => setCreateSeminarDialogOpen(true)} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Seminar
                    </Button>
                  )}
                </div>
                {trainingSeminars.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seminar</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainingSeminars.map((seminar, index) => (
                        <TableRow key={index}>
                          <TableCell>{seminar.name || "N/A"}</TableCell>
                          <TableCell>{seminar.date || "N/A"}</TableCell>
                          <TableCell>{seminar.location || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={seminar.completed ? "default" : "secondary"}>
                              {seminar.completed ? "Completed" : "Pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No training seminars found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="grades" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Grade History</h3>
                  {isOwnProfile && (
                    <Button onClick={() => setCreateGradeDialogOpen(true)} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Grade
                    </Button>
                  )}
                </div>
                {gradeHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grade</TableHead>
                        <TableHead>Date Achieved</TableHead>
                        <TableHead>Examiner</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gradeHistory.map((grade, index) => (
                        <TableRow key={index}>
                          <TableCell>{grade.grade_name || "N/A"}</TableCell>
                          <TableCell>{grade.date_achieved || "N/A"}</TableCell>
                          <TableCell>{grade.examiner || "N/A"}</TableCell>
                          <TableCell>{grade.notes || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No grade history found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="medical" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Medical Visa</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleMedicalVisaDialog('add')} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Medical
                    </Button>
                  )}
                </div>
                {medicalVisa.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Doctor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medicalVisa.map((visa, index) => (
                        <TableRow key={index}>
                          <TableCell>{visa.issue_date || "N/A"}</TableCell>
                          <TableCell>{visa.expiry_date || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={visa.is_valid ? "default" : "destructive"}>
                              {visa.is_valid ? "Valid" : "Expired"}
                            </Badge>
                          </TableCell>
                          <TableCell>{visa.doctor_name || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No medical visa records found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="annual" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Annual Visa</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleAnnualVisaDialog('add')} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Annual
                    </Button>
                  )}
                </div>
                {annualVisa.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {annualVisa.map((visa, index) => (
                        <TableRow key={index}>
                          <TableCell>{visa.year || "N/A"}</TableCell>
                          <TableCell>{visa.issue_date || "N/A"}</TableCell>
                          <TableCell>{visa.expiry_date || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={visa.is_active ? "default" : "secondary"}>
                              {visa.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No annual visa records found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="matches" className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Matches</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleMatchDialog('add')} className="flex items-center gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Match
                    </Button>
                  )}
                </div>
                {matches.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competition</TableHead>
                        <TableHead>Opponent</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((match, index) => (
                        <TableRow key={index}>
                          <TableCell>{match.competition_name || "N/A"}</TableCell>
                          <TableCell>{match.opponent_name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={
                              match.result === "win" ? "default" : 
                              match.result === "loss" ? "destructive" : "secondary"
                            }>
                              {match.result?.toUpperCase() || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>{match.date || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No matches found.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog Components */}
      <SimpleResultDialog
        open={resultDialog.open}
        onClose={handleCloseDialog}
        onSubmit={handleSaveResult}
        athleteId={id}
      />

      <CreateGradeHistory
        open={createGradeDialogOpen}
        onClose={() => setCreateGradeDialogOpen(false)}
        athleteId={id}
        grades={availableGrades}
        onSuccess={() => {
          setCreateGradeDialogOpen(false);
          setFeedbackDialog({
            open: true,
            success: true,
            message: 'Grade history submitted successfully!'
          });
          // Refresh grade history data
          window.location.reload();
        }}
      />

      <CreateSeminarParticipation
        open={createSeminarDialogOpen}
        onClose={() => setCreateSeminarDialogOpen(false)}
        athleteId={id}
        trainingSeminars={availableTrainingSeminars}
        onSuccess={() => {
          setCreateSeminarDialogOpen(false);
          setFeedbackDialog({
            open: true,
            success: true,
            message: 'Seminar participation submitted successfully!'
          });
          // Refresh seminar data
          window.location.reload();
        }}
      />

      {/* Feedback Dialog */}
      {feedbackDialog.open && (
        <Alert className={`fixed top-4 right-4 z-50 w-96 ${feedbackDialog.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <AlertDescription className={feedbackDialog.success ? 'text-green-800' : 'text-red-800'}>
            {feedbackDialog.message}
          </AlertDescription>
          <button
            onClick={() => setFeedbackDialog({ open: false, success: false, message: '' })}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </Alert>
      )}
    </div>
  );
};

export default ViewAthleteConverted;