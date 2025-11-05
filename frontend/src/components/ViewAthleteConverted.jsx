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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
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
  const [drawerOpen, setDrawerOpen] = useState({ personal: false, contact: false });
  
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
          matchesResponse,
          trainingSeminarsAllResponse
        ] = await Promise.all([
          AxiosInstance.get(`athletes/${id}/`),
          // Fetch seminar participation submissions for this athlete (backend will authorize/admin-filter)
          AxiosInstance.get(`seminar-submissions/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`grade-histories/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`medical-visas/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`annual-visas/?athlete=${id}`).catch(() => ({ data: [] })),
          AxiosInstance.get(`matches/?athlete=${id}`).catch(() => ({ data: [] })),
          // Fetch all available training seminars for the Add Seminar dialog
          AxiosInstance.get(`training-seminars/`).catch(() => ({ data: [] }))
        ]);

        setAthlete(athleteResponse.data);
        setRelatedData(athleteResponse.data); // Store related data including categories
        // seminarsResponse contains participation records (seminar submissions).
        // Filter by athlete id and map to a seminar-like object for the UI table.
        const athleteId = parseInt(id);
        const participationItems = Array.isArray(seminarsResponse.data) ?
          seminarsResponse.data.filter(item => item.athlete === athleteId || item.athlete?.id === athleteId)
          : [];

        const seminarRows = participationItems.map(p => ({
          id: p.seminar || (p.seminar?.id),
          name: p.seminar_name || (p.seminar?.name),
          start_date: p.seminar_details?.start_date || null,
          end_date: p.seminar_details?.end_date || null,
          place: p.seminar_details?.place || (p.seminar?.place) || null,
          status: p.status,
          participation_id: p.id,
          submitted_by_athlete: p.submitted_by_athlete,
          raw: p
        }));

        setTrainingSeminars(seminarRows);
  // Populate the available training seminars used by the CreateSeminarParticipation dialog
  setAvailableTrainingSeminars(Array.isArray(trainingSeminarsAllResponse?.data) ? trainingSeminarsAllResponse.data : []);
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
    <div className="min-h-screen bg-[#0B1426]">
      {/* CoinMarketCap-style Header */}
      <div className="bg-[#1E2329] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button onClick={() => navigate("/athletes")} variant="ghost" className="text-gray-400 hover:text-white hover:bg-gray-800">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Athletes
              </Button>
            </div>
            <Button onClick={() => navigate(`/athletes/edit/${id}`)} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
              <Edit3Icon className="h-4 w-4 mr-2" />
              Edit Athlete
            </Button>
          </div>
        </div>
      </div>

      {/* Main Profile Section */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Athlete Header Card */}
        <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Profile Image */}
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#FCD535] bg-gray-800">
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
                    <UserIcon className="h-10 w-10 text-gray-400" />
                  </div>
                )}
              </div>
            </div>
            
            {/* Name and Key Stats */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">
                  {athlete.first_name} {athlete.last_name}
                  {(athlete?.club?.name || athlete?.club) && (
                    <span className="text-sm text-gray-400 ml-2 inline-block pl-1">&#40;{athlete?.club?.name || athlete?.club}&#41;</span>
                  )}
                </h1>
                <Badge 
                  variant={athlete.status === 'approved' ? 'default' : athlete.status === 'pending' ? 'secondary' : 'destructive'}
                  className={`${
                    athlete.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 
                    athlete.status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' : 
                    'bg-red-600 hover:bg-red-700'
                  } text-white`}
                >
                  {athlete.status?.charAt(0).toUpperCase() + athlete.status?.slice(1) || 'N/A'}
                </Badge>
                {athlete.is_coach && (
                  <Badge variant="outline" className="border-[#FCD535] text-[#FCD535]">Coach</Badge>
                )}
                {athlete.is_referee && (
                  <Badge variant="outline" className="border-[#FCD535] text-[#FCD535]">Referee</Badge>
                )}
              </div>
              
              <div className="text-sm text-gray-400 mb-4">
                {athlete.club?.name || athlete.club || "No Club"} • {athlete.current_grade?.name || athlete.current_grade || "N/A"}
              </div>

              {/* Performance Stats */}
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-[#0B1426] rounded-lg p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🥇</span>
                    <span className="text-gray-400 text-sm">Gold Medals</span>
                  </div>
                  <div className="text-2xl font-bold text-[#FCD535]">{awardsCount.firstPlace}</div>
                </div>
                <div className="bg-[#0B1426] rounded-lg p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🥈</span>
                    <span className="text-gray-400 text-sm">Silver Medals</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-300">{awardsCount.secondPlace}</div>
                </div>
                <div className="bg-[#0B1426] rounded-lg p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🥉</span>
                    <span className="text-gray-400 text-sm">Bronze Medals</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-400">{awardsCount.thirdPlace}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Information Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Personal Information */}
          <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Personal Information
              </h3>
              <Sheet open={drawerOpen.personal} onOpenChange={(open) => setDrawerOpen(prev => ({ ...prev, personal: open }))}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white">
                    View Details
                  </Button>
                </SheetTrigger>
                <SheetContent hideOverlay className="bg-[#1E2329] border-gray-800 text-white">
                  <SheetHeader>
                    <SheetTitle className="text-white flex items-center gap-2">
                      <UserIcon className="h-5 w-5" />
                      Personal Information
                    </SheetTitle>
                    <SheetDescription className="text-gray-400">
                      Detailed personal information for {athlete.first_name} {athlete.last_name}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-gray-800">
                        <span className="text-gray-400 text-sm">Full Name</span>
                        <span className="text-white font-medium">{athlete.first_name} {athlete.last_name}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-800">
                        <span className="text-gray-400 text-sm">Date of Birth</span>
                        <span className="text-white">{athlete.date_of_birth || "N/A"}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-800">
                        <span className="text-gray-400 text-sm">Mobile Number</span>
                        <span className="text-white">{athlete.mobile_number || "N/A"}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-800">
                        <span className="text-gray-400 text-sm">City</span>
                        <span className="text-white">{athlete.city?.name || athlete.city || "N/A"}</span>
                      </div>
                      {athlete.address && (
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">Address</span>
                          <span className="text-white text-right">{athlete.address}</span>
                        </div>
                      )}
                      {athlete.team_place && (
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">Team Place</span>
                          <span className="text-white">{athlete.team_place}</span>
                        </div>
                      )}
                      {athlete.cnp && (
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">CNP</span>
                          <span className="text-white">{athlete.cnp}</span>
                        </div>
                      )}
                      {athlete.nationality && (
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">Nationality</span>
                          <span className="text-white">{athlete.nationality}</span>
                        </div>
                      )}
                      {athlete.email && (
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">Email</span>
                          <span className="text-white">{athlete.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Full Name</span>
                <span className="text-white font-medium">{athlete.first_name} {athlete.last_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">City</span>
                <span className="text-white">{athlete.city?.name || athlete.city || "N/A"}</span>
              </div>
              <div className="text-center pt-2">
                <span className="text-gray-400 text-xs">Click "View Details" for complete information</span>
              </div>
            </div>
          </div>

          {/* Club & Registration */}
          <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Club & Registration</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Club</span>
                <span className="text-white font-medium">{athlete.club?.name || athlete.club || "No Club"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Current Grade</span>
                <span className="text-white">{athlete.current_grade?.name || athlete.current_grade || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Registered Date</span>
                <span className="text-white">{athlete.registered_date || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Expiration Date</span>
                <span className="text-white">{athlete.expiration_date || "N/A"}</span></div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Submitted Date</span>
                <span className="text-white">{athlete.submitted_date ? new Date(athlete.submitted_date).toLocaleDateString() : "N/A"}</span>
              </div>
              {athlete.approved_date && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Approved Date</span>
                  <span className="text-white">{new Date(athlete.approved_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Emergency Contact & Additional Info */}
          <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Contact & Additional</h3>
              <Sheet open={drawerOpen.contact} onOpenChange={(open) => setDrawerOpen(prev => ({ ...prev, contact: open }))}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white">
                    View Details
                  </Button>
                </SheetTrigger>
                <SheetContent hideOverlay className="bg-[#1E2329] border-gray-800 text-white">
                  <SheetHeader>
                    <SheetTitle className="text-white flex items-center gap-2">
                      <HeartIcon className="h-5 w-5" />
                      Emergency Contact & Additional Information
                    </SheetTitle>
                    <SheetDescription className="text-gray-400">
                      Emergency contact and additional details for {athlete.first_name} {athlete.last_name}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    {/* Emergency Contact Section */}
                    {(athlete.emergency_contact_name || athlete.emergency_contact_phone) && (
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          <HeartIcon className="h-4 w-4 text-red-400" />
                          Emergency Contact
                        </h4>
                        <div className="space-y-3">
                          {athlete.emergency_contact_name && (
                            <div className="flex justify-between py-2 border-b border-gray-800">
                              <span className="text-gray-400 text-sm">Contact Name</span>
                              <span className="text-white">{athlete.emergency_contact_name}</span>
                            </div>
                          )}
                          {athlete.emergency_contact_phone && (
                            <div className="flex justify-between py-2 border-b border-gray-800">
                              <span className="text-gray-400 text-sm">Contact Phone</span>
                              <span className="text-white">{athlete.emergency_contact_phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Family Information */}
                    {(athlete.father_name || athlete.mother_name) && (
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-blue-400" />
                          Family Information
                        </h4>
                        <div className="space-y-3">
                          {athlete.father_name && (
                            <div className="flex justify-between py-2 border-b border-gray-800">
                              <span className="text-gray-400 text-sm">Father Name</span>
                              <span className="text-white">{athlete.father_name}</span>
                            </div>
                          )}
                          {athlete.mother_name && (
                            <div className="flex justify-between py-2 border-b border-gray-800">
                              <span className="text-gray-400 text-sm">Mother Name</span>
                              <span className="text-white">{athlete.mother_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Roles & Additional */}
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <GraduationCapIcon className="h-4 w-4 text-[#FCD535]" />
                        Roles & Additional
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-800">
                          <span className="text-gray-400 text-sm">Roles</span>
                          <div className="flex gap-1">
                            {athlete.is_coach && <Badge variant="outline" className="border-[#FCD535] text-[#FCD535] text-xs">Coach</Badge>}
                            {athlete.is_referee && <Badge variant="outline" className="border-[#FCD535] text-[#FCD535] text-xs">Referee</Badge>}
                            {!athlete.is_coach && !athlete.is_referee && <span className="text-white">Athlete</span>}
                          </div>
                        </div>
                        {athlete.medical_certificate && (
                          <div className="flex justify-between py-2 border-b border-gray-800">
                            <span className="text-gray-400 text-sm">Medical Certificate</span>
                            <span className="text-white">{athlete.medical_certificate}</span>
                          </div>
                        )}
                        {athlete.insurance_policy && (
                          <div className="flex justify-between py-2 border-b border-gray-800">
                            <span className="text-gray-400 text-sm">Insurance Policy</span>
                            <span className="text-white">{athlete.insurance_policy}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Roles</span>
                <div className="flex gap-1">
                  {athlete.is_coach && <Badge variant="outline" className="border-[#FCD535] text-[#FCD535] text-xs">Coach</Badge>}
                  {athlete.is_referee && <Badge variant="outline" className="border-[#FCD535] text-[#FCD535] text-xs">Referee</Badge>}
                  {!athlete.is_coach && !athlete.is_referee && <span className="text-white">Athlete</span>}
                </div>
              </div>
              {athlete.emergency_contact_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400 text-sm">Emergency Contact</span>
                  <span className="text-white truncate max-w-[60%]">{athlete.emergency_contact_name}</span>
                </div>
              )}
              <div className="text-center pt-2">
                <span className="text-gray-400 text-xs">Click "View Details" for complete contact information</span>
              </div>
            </div>
          </div>
        </div>
        {/* Additional Information Cards */}
        {(athlete.previous_experience || athlete.admin_notes) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {athlete.previous_experience && (
              <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Previous Experience</h3>
                <p className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">{athlete.previous_experience}</p>
              </div>
            )}
            
            {athlete.admin_notes && (
              <div className="bg-[#1E2329] rounded-lg border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Admin Notes</h3>
                <p className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">{athlete.admin_notes}</p>
              </div>
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

        {/* CoinMarketCap-style Tabs */}
        <div className="bg-[#1E2329] rounded-lg border border-gray-800">
          <Tabs defaultValue="results" className="w-full">
            <div className="border-b border-gray-800">
              <TabsList className="h-auto p-0 bg-transparent w-full justify-start">
                <TabsTrigger value="results" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <TrophyIcon className="h-4 w-4 mr-2" />
                  Competition Results
                </TabsTrigger>
                <TabsTrigger value="seminars" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <GraduationCapIcon className="h-4 w-4 mr-2" />
                  Training Seminars
                </TabsTrigger>
                <TabsTrigger value="grades" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <GraduationCapIcon className="h-4 w-4 mr-2" />
                  Grade History
                </TabsTrigger>
                <TabsTrigger value="medical" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <HeartIcon className="h-4 w-4 mr-2" />
                  Medical Records
                </TabsTrigger>
                <TabsTrigger value="annual" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Annual Visas
                </TabsTrigger>
                <TabsTrigger value="matches" className="data-[state=active]:bg-[#0B1426] data-[state=active]:text-[#FCD535] text-gray-400 hover:text-white px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-[#FCD535]">
                  <SwordsIcon className="h-4 w-4 mr-2" />
                  Match History
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="results" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Competition Results</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleResultDialog('add')} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Submit Result
                    </Button>
                  )}
                </div>
                {allResults.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Competition</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Category</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Group</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Placement</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Source</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allResults.map((result, index) => (
                          <tr key={result.id} className={`border-b border-gray-800 hover:bg-[#0B1426] transition-colors ${index % 2 === 0 ? 'bg-[#0B1426]/20' : ''}`}>
                            <td className="py-4 px-4 text-white font-medium">{result.competition_name}</td>
                            <td className="py-4 px-4 text-gray-300">{result.category_name}</td>
                            <td className="py-4 px-4 text-gray-300">{result.group_name || "N/A"}</td>
                            <td className="py-4 px-4">
                              <div>
                                <span className="text-white font-medium">{result.placement}</span>
                                {result.team_name && (
                                  <div className="text-sm text-gray-400 mt-1">
                                    Team: {result.team_name}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <Badge variant="outline" className="text-xs border-gray-600 text-gray-300">
                                {result.source}
                              </Badge>
                            </td>
                            <td className="py-4 px-4">
                              {result.statusChip && (
                                <Badge 
                                  variant={
                                    result.status === 'approved' ? 'default' : 
                                    result.status === 'pending' ? 'secondary' : 
                                    'destructive'
                                  }
                                  className={
                                    result.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 
                                    result.status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' : 
                                    'bg-red-600 hover:bg-red-700'
                                  }
                                >
                                  {result.status}
                                </Badge>
                              )}
                              {!result.statusChip && (
                                <Badge className="bg-green-600 hover:bg-green-700">Official</Badge>
                              )}
                            </td>
                            
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <TrophyIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No competition results found.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="seminars" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Training Seminars</h3>
                  {isOwnProfile && (
                    <Button onClick={() => setCreateSeminarDialogOpen(true)} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Seminar
                    </Button>
                  )}
                </div>
                {trainingSeminars.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Seminar</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">City</th>
                          <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainingSeminars.map((seminar, index) => (
                          <tr key={index} className={`border-b border-gray-800 hover:bg-[#0B1426] transition-colors ${index % 2 === 0 ? 'bg-[#0B1426]/20' : ''}`}>
                            <td className="py-4 px-4 text-white font-medium">{seminar.name || "N/A"}</td>
                            <td className="py-4 px-4 text-gray-300">{seminar.start_date ? `${new Date(seminar.start_date).toLocaleDateString()} to ${seminar.end_date ? new Date(seminar.end_date).toLocaleDateString() : ''}` : 'N/A'}</td>
                            <td className="py-4 px-4 text-gray-300">{seminar.city_name || (seminar.city && seminar.city.name) || seminar.place || "N/A"}</td>
                            <td className="py-4 px-4">
                              {(() => {
                                // If this row represents a participation record, prefer showing its approval status
                                const status = seminar.status;
                                if (status) {
                                  const cls = status === 'approved' ? 'bg-green-600 hover:bg-green-700' :
                                              status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' :
                                              status === 'rejected' ? 'bg-red-600 hover:bg-red-700' :
                                              'bg-orange-600 hover:bg-orange-700';
                                  return (
                                    <div>
                                      <Badge className={cls}>{status}</Badge>
                                      {seminar.submitted_by_athlete && (
                                        <div className="text-xs text-gray-400 mt-1">Self-submitted</div>
                                      )}
                                    </div>
                                  );
                                }

                                // Fallback: determine status based on dates for pure seminar entries
                                if (!seminar.start_date) return <Badge className="bg-gray-600">Unknown</Badge>;
                                const end = seminar.end_date ? new Date(seminar.end_date) : null;
                                const now = new Date();
                                const isCompleted = end ? end < now : false;
                                return (
                                  <Badge variant={isCompleted ? 'default' : 'secondary'} className={isCompleted ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}>
                                    {isCompleted ? 'Completed' : 'Upcoming'}
                                  </Badge>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <GraduationCapIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No training seminars found.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="grades" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Grade History</h3>
                  {isOwnProfile && (
                    <Button onClick={() => setCreateGradeDialogOpen(true)} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Grade
                    </Button>
                  )}
                </div>
                {gradeHistory.length > 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400">Grade history implementation pending...</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <GraduationCapIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No grade history found.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="medical" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Medical Records</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleMedicalVisaDialog('add')} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Medical
                    </Button>
                  )}
                </div>
                <div className="text-center py-12">
                  <HeartIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Medical records implementation pending...</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="annual" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Annual Visas</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleAnnualVisaDialog('add')} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Annual
                    </Button>
                  )}
                </div>
                <div className="text-center py-12">
                  <CalendarIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Annual visas implementation pending...</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="matches" className="p-0 border-0">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-white">Match History</h3>
                  {isOwnProfile && (
                    <Button onClick={() => handleMatchDialog('add')} className="bg-[#FCD535] hover:bg-[#F7B500] text-black font-medium">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Match
                    </Button>
                  )}
                </div>
                <div className="text-center py-12">
                  <SwordsIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Match history implementation pending...</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

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