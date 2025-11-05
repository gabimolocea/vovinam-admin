import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Link,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import Avatar from "@mui/material/Avatar";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { MaterialReactTable } from 'material-react-table';
import { useAuth } from '../contexts/AuthContext';
import CreateGradeHistory from './CreateGradeHistory';
import CreateSeminarParticipation from './CreateSeminarParticipation';

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

const ViewAthlete = () => {
  const { id } = useParams(); // Get athlete ID from URL
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [athleteData, setAthleteData] = useState(null); // State for athlete data
  const [clubData, setClubData] = useState(null);
  const [relatedData, setRelatedData] = useState({}); // State for related data
  const [gradeHistory, setGradeHistory] = useState([]); // State for grade history
  const [annualVisa, setAnnualVisa] = useState([]); // State for annual visa
  const [medicalVisa, setMedicalVisa] = useState([]); // State for medical visa
  const [trainingSeminars, setTrainingSeminars] = useState([]); // State for training seminars
  const [errorMessage, setErrorMessage] = useState(""); // State for error message
  const [loading, setLoading] = useState(true); // State for loading indicator
  const [activeTab, setActiveTab] = useState(0); // State for active tab
  const [athleteIds, setAthleteIds] = useState([]); // List of athlete IDs
  const [currentAthleteIndex, setCurrentAthleteIndex] = useState(-1); // Current athlete index
  
  // States for athlete results management
  const [athleteResults, setAthleteResults] = useState([]); // State for athlete-submitted results
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultDialog, setResultDialog] = useState({ open: false, mode: 'add', data: null });
  const [seminarDialog, setSeminarDialog] = useState({ open: false, mode: 'add', data: null });
  const [gradeDialog, setGradeDialog] = useState({ open: false, mode: 'add', data: null });
  const [medicalVisaDialog, setMedicalVisaDialog] = useState({ open: false, mode: 'add', data: null });
  const [annualVisaDialog, setAnnualVisaDialog] = useState({ open: false, mode: 'add', data: null });
  const [matchDialog, setMatchDialog] = useState({ open: false, mode: 'add', data: null });
  const [isOwnProfile, setIsOwnProfile] = useState(false); // Check if viewing own profile
  const [createGradeDialogOpen, setCreateGradeDialogOpen] = useState(false);
  const [createSeminarDialogOpen, setCreateSeminarDialogOpen] = useState(false);
  const [availableGrades, setAvailableGrades] = useState([]);
  const [availableTrainingSeminars, setAvailableTrainingSeminars] = useState([]);
  const [categoryDrawer, setCategoryDrawer] = useState({ open: false, categoryData: null }); // State for category drawer
  const [availableAthletes, setAvailableAthletes] = useState([]); // All athletes for lookups
  const [feedbackDialog, setFeedbackDialog] = useState({ open: false, success: false, message: '' }); // Feedback dialog for success/error messages

  // Function to handle team member click and navigate to their profile
  const handleTeamMemberClick = (memberId) => {
    if (memberId && memberId !== parseInt(id)) {
      navigate(`/athletes/${memberId}`);
    }
  };

  // Function to fetch category details and open drawer
  const handleCategoryClick = async (categoryName) => {
    try {
      // First, get all categories to find the one we need
      const categoriesResponse = await AxiosInstance.get('categories/');
      const category = categoriesResponse.data.find(cat => cat.name === categoryName);
      
      if (category) {
        // Fetch detailed category information
        const categoryDetailResponse = await AxiosInstance.get(`categories/${category.id}/`);
        
        // The enrolled athletes should be included in the category detail response
        const enrolledAthletes = categoryDetailResponse.data.enrolled_athletes || [];
        
        // Get results/scores for this category using the correct endpoint
        let awards = [];
        try {
          const resultsResponse = await AxiosInstance.get(`category-athlete-score/?category=${category.id}`);
          awards = resultsResponse.data || [];
        } catch (resultsError) {
          console.warn('Could not fetch category results:', resultsError);
          // Try to get all results and filter by category
          try {
            const allResultsResponse = await AxiosInstance.get('category-athlete-score/');
            awards = allResultsResponse.data.filter(result => 
              result.category === category.id || 
              (result.category_name && result.category_name === categoryName)
            );
          } catch (fallbackError) {
            console.warn('Could not fetch any results:', fallbackError);
          }
        }
        
        // Get group name from our processed results if available
        const categoryResult = allResults.find(result => result.category_name === categoryName);
        const groupName = categoryResult?.group_name;
        
        const categoryData = {
          ...categoryDetailResponse.data,
          enrolled_athletes: enrolledAthletes,
          awards: awards,
          // Override group with group name if we have it from our results
          ...(groupName && { group: { name: groupName } })
        };
        
        setCategoryDrawer({ open: true, categoryData });
      }
    } catch (error) {
      console.error('Error fetching category details:', error);
      // Show basic category info even if detailed fetch fails
      // Try to get group name from our processed results
      const categoryResult = allResults.find(result => result.category_name === categoryName);
      const groupName = categoryResult?.group_name;
      
      setCategoryDrawer({ 
        open: true, 
        categoryData: { 
          name: categoryName,
          enrolled_athletes: [],
          awards: [],
          ...(groupName && { group: { name: groupName } }),
          error: 'Could not load detailed category information'
        }
      });
    }
  };

  // Function to fetch all available athletes for lookups
  const fetchAvailableAthletes = async () => {
    try {
      const response = await AxiosInstance.get('athletes/');
      setAvailableAthletes(response.data);
    } catch (error) {
      console.error('Error fetching available athletes:', error);
    }
  };

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        const athleteResponse = await AxiosInstance.get(`athletes/${id}/`);
        const relatedData = {};

        // Fetch related data
        if (athleteResponse.data.city) {
          try {
            // Fetch all cities and find the city by ID
            const citiesResponse = await AxiosInstance.get(`cities/`);
            const city = citiesResponse.data.find(
              (city) => city.id === athleteResponse.data.city
            );

            if (city) {
              relatedData.city = city;
              console.log("City data fetched:", city); // Debug log
            } else {
              console.warn(`City with ID ${athleteResponse.data.city} not found.`);
              relatedData.city = { name: "Unknown City" }; // Fallback for missing city
            }
          } catch (error) {
            console.error("Error fetching city data:", error);
            relatedData.city = { name: "Unknown City" }; // Fallback for errors
          }
        } else {
          relatedData.city = { name: "Unknown City" }; // Fallback for null city
        }

        if (athleteResponse.data.club) {
          // Club data is already included in the athlete response
          relatedData.club = athleteResponse.data.club;
        }

        if (athleteResponse.data.title) {
          const titleResponse = await AxiosInstance.get(
            `titles/${athleteResponse.data.title}/`
          );
          relatedData.title = titleResponse.data;
        }

        if (athleteResponse.data.federation_role) {
          const federationRoleResponse = await AxiosInstance.get(
            `federation-roles/${athleteResponse.data.federation_role}/`
          );
          relatedData.federationRole = federationRoleResponse.data;
        }

        if (athleteResponse.data.current_grade) {
          const gradeResponse = await AxiosInstance.get(
            `grades/${athleteResponse.data.current_grade}/`
          );
          relatedData.grade = gradeResponse.data;
        }

        const teamResponse = await AxiosInstance.get(`teams/?athlete_id=${id}`);
        relatedData.teams = teamResponse.data;

        const categoryResponse = await AxiosInstance.get(
          `categories/?athlete_id=${id}`
        );
        relatedData.categories = categoryResponse.data;

        // Fetch grade history
        const gradeHistoryResponse = await AxiosInstance.get(
          `grade-histories/?athlete_id=${id}`
        );
        setGradeHistory(gradeHistoryResponse.data);

        // Fetch annual visa
        const annualVisaResponse = await AxiosInstance.get(`annual-visas/`);
        const filteredAnnualVisa = annualVisaResponse.data.filter(
          (visa) => visa.athlete === parseInt(id)
        );
        setAnnualVisa(filteredAnnualVisa);

        // Fetch medical visa
        const medicalVisaResponse = await AxiosInstance.get(`medical-visas/`);
        const filteredMedicalVisa = medicalVisaResponse.data.filter(
          (visa) => visa.athlete === parseInt(id)
        );
        setMedicalVisa(filteredMedicalVisa);

        // Fetch training seminars
        const trainingSeminarsResponse = await AxiosInstance.get(
          `training-seminars/?athlete_id=${id}`
        );
        setTrainingSeminars(trainingSeminarsResponse.data);

        // Fetch matches
        const matchesResponse = await AxiosInstance.get(`matches/?athlete_id=${id}`);
        const matches = matchesResponse.data;

        // Fetch categories and competitions for matches
        const categoryIds = [...new Set(matches.map((match) => match.category))];
        const categoriesResponse = await Promise.all(
          categoryIds.map((categoryId) =>
            AxiosInstance.get(`categories/${categoryId}/`)
          )
        );
        const categories = categoriesResponse.map((res) => res.data);

        const competitionIds = [
          ...new Set(categories.map((category) => category.competition)),
        ];
        const competitionsResponse = await Promise.all(
          competitionIds.map((competitionId) =>
            AxiosInstance.get(`competitions/${competitionId}/`)
          )
        );
        const competitions = competitionsResponse.map((res) => res.data);

        // Fetch opponent details
        const opponentIds = [
          ...new Set(
            matches.flatMap((match) => [match.red_corner, match.blue_corner])
          ),
        ].filter((opponentId) => opponentId !== parseInt(id));
        const opponentsResponse = await Promise.all(
          opponentIds.map((opponentId) =>
            AxiosInstance.get(`athletes/${opponentId}/`)
          )
        );
        const opponents = opponentsResponse.map((res) => res.data);

        // Map competition names, categories, and opponents to matches
        const matchesWithDetails = matches.map((match) => {
          const category = categories.find(
            (category) => category.id === match.category
          );
          const competition = competitions.find(
            (competition) => competition.id === category?.competition
          );
          const opponentId =
            match.red_corner === parseInt(id) ? match.blue_corner : match.red_corner;
          const opponent = opponents.find((athlete) => athlete.id === opponentId);

          return {
            ...match,
            competition_name: competition?.name || "N/A",
            category_name: category?.name || "N/A",
            opponent_name: `${opponent?.first_name || "N/A"} ${
              opponent?.last_name || ""
            }`,
            opponent_club: opponent?.club_name || "N/A",
          };
        });

        relatedData.matches = matchesWithDetails;

        // Set data
        setAthleteData(athleteResponse.data);
        setRelatedData(relatedData);
        
        // Check if this is the user's own profile
        if (user && user.athlete && user.athlete.id === parseInt(id)) {
          setIsOwnProfile(true);
        }
        
        // Fetch submitted results for this athlete (including team results)
        fetchAthleteResults();
        
        // Fetch available athletes for lookups
        fetchAvailableAthletes();
      } catch (error) {
        console.error("Error fetching athlete data:", error);
        setErrorMessage("Failed to fetch athlete data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchAthleteData();
    
    // Fetch grades and training seminars for dropdowns
    fetchGradesAndSeminars();
  }, [id, user]);

  // Fetch grades and training seminars for form dropdowns
  const fetchGradesAndSeminars = async () => {
    try {
      const [gradesResponse, seminarsResponse] = await Promise.all([
        AxiosInstance.get('grades/'),
        AxiosInstance.get('training-seminars/')
      ]);
      
      setAvailableGrades(gradesResponse.data);
      setAvailableTrainingSeminars(seminarsResponse.data);
    } catch (error) {
      console.error('Error fetching grades and seminars:', error);
    }
  };

  // Success handlers for new submission dialogs
  const handleGradeSubmissionSuccess = (message) => {
    alert(message);
    setCreateGradeDialogOpen(false);
    // Refresh grade history
    fetchAthleteData();
  };

  const handleSeminarSubmissionSuccess = (message) => {
    alert(message);
    setCreateSeminarDialogOpen(false);
    // Refresh training seminars
    fetchAthleteData();
  };

  // Fetch athlete's submitted results
  const fetchAthleteResults = async () => {
    setResultsLoading(true);
    try {
      // Pass athlete_id parameter to get results for this specific athlete
      const response = await AxiosInstance.get(`category-athlete-score/all_results/?athlete_id=${id}`);
      setAthleteResults(response.data);
    } catch (error) {
      console.error("Error fetching athlete results:", error);
    } finally {
      setResultsLoading(false);
    }
  };

  // Handle result dialog actions
  const handleResultDialog = (mode, data = null) => {
    setResultDialog({ open: true, mode, data });
  };

  const handleCloseDialog = () => {
    setResultDialog({ open: false, mode: 'add', data: null });
  };

  const handleSaveResult = async (resultData) => {
    // This function is called after the API call is already made in the dialog
    // It should just handle success feedback and refresh data
    try {
      // Close the result dialog first
      handleCloseDialog();
      
      // Show success feedback
      const isTeamResult = resultData.type === 'teams';
      const successMessage = resultDialog.mode === 'add' 
        ? `${isTeamResult ? 'Team' : 'Individual'} result submitted successfully!`
        : `${isTeamResult ? 'Team' : 'Individual'} result updated successfully!`;
      
      setFeedbackDialog({
        open: true,
        success: true,
        message: successMessage
      });
      
      // Refresh the results to update the table
      await fetchAthleteResults();
      
    } catch (error) {
      console.error("Error saving result:", error);
      
      // Close the result dialog
      handleCloseDialog();
      
      // Show error feedback
      let errorMessage = 'An error occurred while saving the result. Please try again.';
      
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (typeof error.response.data === 'object') {
          // Handle validation errors
          const errors = [];
          Object.keys(error.response.data).forEach(key => {
            if (key === 'non_field_errors') {
              // Handle non-field errors (like duplicate validation)
              if (Array.isArray(error.response.data[key])) {
                errors.push(...error.response.data[key]);
              } else {
                errors.push(error.response.data[key]);
              }
            } else if (Array.isArray(error.response.data[key])) {
              errors.push(`${key}: ${error.response.data[key].join(', ')}`);
            } else {
              errors.push(`${key}: ${error.response.data[key]}`);
            }
          });
          if (errors.length > 0) {
            errorMessage = errors.join('; ');
          }
        }
      }
      
      setFeedbackDialog({
        open: true,
        success: false,
        message: errorMessage
      });
    }
  };

  const handleDeleteResult = async (resultId) => {
    if (window.confirm('Are you sure you want to delete this result?')) {
      try {
        await AxiosInstance.delete(`category-athlete-score/${resultId}/`);
        
        // Show success feedback
        setFeedbackDialog({
          open: true,
          success: true,
          message: 'Result deleted successfully!'
        });
        
        // Refresh the results
        await fetchAthleteResults();
        
      } catch (error) {
        console.error("Error deleting result:", error);
        
        // Show error feedback
        const errorMessage = error.response?.data?.message || 
                            error.response?.data?.error || 
                            'An error occurred while deleting the result. Please try again.';
        
        setFeedbackDialog({
          open: true,
          success: false,
          message: errorMessage
        });
      }
    }
  };

  // Handler functions for other dialog types
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

  const handleCloseSeminarDialog = () => {
    setSeminarDialog({ open: false, mode: 'add', data: null });
  };

  const handleCloseGradeDialog = () => {
    setGradeDialog({ open: false, mode: 'add', data: null });
  };

  const handleCloseMedicalVisaDialog = () => {
    setMedicalVisaDialog({ open: false, mode: 'add', data: null });
  };

  const handleCloseAnnualVisaDialog = () => {
    setAnnualVisaDialog({ open: false, mode: 'add', data: null });
  };

  const handleCloseMatchDialog = () => {
    setMatchDialog({ open: false, mode: 'add', data: null });
  };

  useEffect(() => {
    const fetchAthleteIds = async () => {
      try {
        const response = await AxiosInstance.get("athletes/");
        const ids = response.data.map((athlete) => athlete.id);
        setAthleteIds(ids);

        // Find the current athlete's index
        const index = ids.indexOf(parseInt(id));
        setCurrentAthleteIndex(index);
      } catch (error) {
        console.error("Error fetching athlete IDs:", error);
      }
    };

    fetchAthleteIds();
  }, [id]);

  const navigateToPreviousAthlete = () => {
    if (currentAthleteIndex > 0) {
      navigate(`/athletes/${athleteIds[currentAthleteIndex - 1]}`);
    } else {
      navigate("/athletes"); // Go back to the athletes list if it's the first athlete
    }
  };

  const navigateToNextAthlete = () => {
    if (currentAthleteIndex < athleteIds.length - 1) {
      navigate(`/athletes/${athleteIds[currentAthleteIndex + 1]}`);
    }
  };



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
        if (category?.first_place_name === athleteData?.first_name) {
          placement = '🥇 1st Place';
        } else if (category?.second_place_name === athleteData?.first_name) {
          placement = '🥈 2nd Place';
        } else if (category?.third_place_name === athleteData?.first_name) {
          placement = '🥉 3rd Place';
        }
        // Check team placements
        else if (category?.first_place_team_name?.includes(athleteData?.first_name)) {
          placement = '🥇 1st Place';
          teamName = category.first_place_team_name;
          resultType = 'Team';
        } else if (category?.second_place_team_name?.includes(athleteData?.first_name)) {
          placement = '🥈 2nd Place';
          teamName = category.second_place_team_name;
          resultType = 'Team';
        } else if (category?.third_place_team_name?.includes(athleteData?.first_name)) {
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
  }, [athleteResults, relatedData?.categories, athleteData?.first_name, id]);

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
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Alert severity="error">{errorMessage}</Alert>
      </Box>
    );
  }

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ padding: 0 }}>
      {/* Navigation Icons */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 2,
          paddingX: 0,
        }}
      >
        {/* ArrowLeft Icon */}
        <IconButton
          onClick={navigateToPreviousAthlete}
          disabled={currentAthleteIndex === -1} // Disable if athlete IDs are not loaded
          sx={{ color: currentAthleteIndex > 0 ? "primary.main" : "grey.500" }}
        >
          <ArrowBackIcon />
        </IconButton>

        <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "left",
          marginBottom: 0,
          gap: { xs: 2, sm: 3, md: 3 },
        }}
       >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            marginBottom: 1,
            gap: 3,
          }}
        >
          <Avatar
            src={`http://127.0.0.1:8000${athleteData?.profile_image || ""}`}
            alt={`${athleteData?.first_name || "Athlete"} ${athleteData?.last_name || "Profile"}`}
            sx={{
              width: { xs: 80, sm: 100, md: 120 },
              height: { xs: 80, sm: 100, md: 120 },
              borderRadius: '5%',
            }}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "left",
            alignSelf: "center",
            marginBottom: 2,
            gap: { xs: 0, sm: 1, md: 1 },
          }}
          >
          <Box sx={{ marginLeft: 0 }}>
            <Typography variant="h5">
              {athleteData?.first_name}{" "}
              {athleteData?.last_name || "Athlete Name"}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              px: 1,
              height: 28,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              🥇 {awardsCount.firstPlace}
              <Divider orientation="vertical" flexItem sx={{ marginX: 1 }} />
              🥈 {awardsCount.secondPlace}
              <Divider orientation="vertical" flexItem sx={{ marginX: 1 }} />
              🥉 {awardsCount.thirdPlace}
            </Box>
          </Box>
          </Box>
          </Box>

          
        {/* ArrowRight or Close Icon */}
        {currentAthleteIndex < athleteIds.length - 1 ? (
          <IconButton
            onClick={navigateToNextAthlete}
            disabled={currentAthleteIndex === -1} // Disable if athlete IDs are not loaded
            sx={{ color: 'primary.main' }}
          >
            <ArrowForwardIcon />
          </IconButton>
        ) : (
          <IconButton
            onClick={() => navigate('/athletes')} // Redirect to athletes page
            sx={{ color: 'primary.main' }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Athlete Name and Profile Image */}
     

          {/* Two Columns Layout */}
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
        {/* Left Column */}
        <Box sx={{ flex: 1 }}>
          {/* Personal Information Section */}
            <CardContent sx={{ padding: 0, marginBottom: 2 }}>
              <Typography
                variant="h6"
                sx={{ marginBottom: 0 }}
              >
                Personal Information
              </Typography>
              <Divider sx={{ marginBottom: 1 }} />
              <Typography>
                <strong>First Name:</strong> {athleteData?.first_name || "N/A"}
              </Typography>
              <Typography>
                <strong>Last Name:</strong> {athleteData?.last_name || "N/A"}
              </Typography>
              <Typography>
                <strong>Date of Birth:</strong>{" "}
                {athleteData?.date_of_birth || "N/A"}
              </Typography>
              <Typography>
                <strong>City:</strong> {relatedData?.city?.name || "N/A"}
              </Typography>
              <Typography>
                <strong>Mobile Number:</strong>{" "}
                {athleteData?.mobile_number || "N/A"}
              </Typography>
            </CardContent>

            {/* Club Information Section */}
            <CardContent sx={{ padding: 0, marginBottom: 2 }}>
              <Typography
                variant="h6"
                sx={{ marginBottom: 0 }}
              >
                Club Information
              </Typography>
              <Divider sx={{ marginBottom: 1 }} />

              {/* Club Information Layout */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                {/* Right Column: Club Details */}
                <Box>
                  <Typography>
                    <strong>Club:</strong> {relatedData?.club?.name || "N/A"}
                  </Typography>
                  <Typography>
                    <strong>Address:</strong>{" "}
                    {relatedData?.club?.address || "N/A"}
                  </Typography>
                  <Typography>
                    <strong>Mobile Number:</strong>{" "}
                    {relatedData?.club?.mobile_number || "N/A"}
                  </Typography>
                  <Typography>
                    <strong>Website:</strong>{" "}
                    {relatedData?.club?.website || "N/A"}
                  </Typography>
                  <Typography>
                    <strong>Registered Date:</strong>{" "}
                    {athleteData?.registered_date || "N/A"}
                  </Typography>
                  <Typography>
                    <strong>Expiration Date:</strong>{" "}
                    {athleteData?.expiration_date || "N/A"}
                  </Typography>
                </Box>
                {/* Left Column: Club Logo */}
                <Avatar
                  src={`http://127.0.0.1:8000${relatedData?.club?.logo || "/media/default_logo.jpg"}`}
                  alt={`${relatedData?.club?.name || "Club Logo"}`}
                  sx={{ width: 100, height: 100, border: (theme) => `2px solid ${theme.palette.divider}` }}
                />
              </Box>
            </CardContent>

            {/* Federation Role and Title Section */}

            <CardContent sx={{ padding: 0, marginBottom: 2 }}>
              <Typography
                variant="h6"
                sx={{ marginBottom: 0 }}
              >
                Federation Role and Title
              </Typography>
              <Divider sx={{ marginBottom: 1 }} />
              <Typography>
                <strong>Federation Role:</strong>{" "}
                {relatedData?.federationRole?.name || "N/A"}
              </Typography>
              <Typography>
                <strong>Title:</strong> {relatedData?.title?.name || "N/A"}
              </Typography>
              <Typography>
                <strong>Current Grade:</strong>{" "}
                {relatedData?.grade?.name || "N/A"}
              </Typography>
            </CardContent>

            {/* Other Information Section */}

            <CardContent sx={{ padding: 0 }}>
              <Typography
                variant="h6"
                sx={{ marginBottom: 0 }}
              >
                Other Information
              </Typography>
              <Divider sx={{ marginBottom: 1 }} />
              <Typography>
                <strong>Is Coach:</strong>{" "}
                {athleteData?.is_coach ? "Yes" : "No"}
              </Typography>
              <Typography>
                <strong>Is Referee:</strong>{" "}
                {athleteData?.is_referee ? "Yes" : "No"}
              </Typography>
            </CardContent>
        </Box>

        {/* Right Column */}
      </Box>

      {/* Athlete Results Section (Full Width) */}
      <Card sx={{ marginTop: 2, padding: 0 }} elevation={0}>
        {/* Tabs Section */}
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          scrollButtons
          allowScrollButtonsMobile
          aria-label="scrollable auto tabs example"
        >
          <Tab label="Athlete Results" />
          <Tab label="Training Seminars" />
          <Tab label="Grade History" />
          <Tab label="Medical Visa" />
          <Tab label="Annual Visa" />
          <Tab label="Matches" /> {/* New Matches Tab */}

        </Tabs>

        <CardContent sx={{ padding: 0 }}>
          {activeTab === 0 && (
            <>
              {/* Competition Results Section */}
              <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Competition Results</Typography>
                {isOwnProfile && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleResultDialog('add')}
                  >
                    Submit Result
                  </Button>
                )}
              </Box>
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'competition_name',
                    header: 'Competition',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'category_name',
                    header: 'Category',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    Cell: ({ row }) => {
                      const categoryName = row.original.category_name;
                      const groupName = row.original.group_name;
                      const displayName = groupName ? `${categoryName} - ${groupName}` : categoryName;
                      
                      return (
                        <Link
                          component="button"
                          variant="body2"
                          onClick={() => handleCategoryClick(categoryName)}
                          sx={{
                            textDecoration: 'underline',
                            color: 'primary.main',
                            cursor: 'pointer',
                            '&:hover': {
                              color: 'primary.dark',
                            },
                          }}
                        >
                          {displayName}
                        </Link>
                      );
                    },
                  },
                  {
                    accessorKey: 'placement',
                    header: 'Placement',
                    size: 130,
                  },
                  {
                    accessorKey: 'type',
                    header: 'Type',
                    size: 200,
                    Cell: ({ row }) => {
                      const type = row.original.type;
                      const teamName = row.original.team_name;
                      const teamMembers = row.original.team_members;
                      
                      if (type === 'Team') {
                        return (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                              {type}
                            </Typography>
                            {teamMembers && teamMembers.length > 0 && (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                                {teamMembers.map((member, index) => (
                                  <Link
                                    key={member.id}
                                    component="button"
                                    variant="caption"
                                    onClick={() => handleTeamMemberClick(member.id)}
                                    sx={{
                                      textDecoration: 'underline',
                                      color: 'primary.main',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      '&:hover': {
                                        color: 'primary.dark',
                                      },
                                    }}
                                  >
                                    {member.name || `${member.first_name} ${member.last_name}`}
                                  </Link>
                                ))}
                              </Box>
                            )}
                          </Box>
                        );
                      }
                      return type;
                    },
                  },
                  {
                    accessorKey: 'source',
                    header: 'Source',
                    size: 120,
                  },
                  {
                    accessorKey: 'status',
                    header: 'Status',
                    size: 130,
                    Cell: ({ row }) => {
                      const showChip = row.original.statusChip;
                      const status = row.original.status;
                      
                      if (!showChip) {
                        return (
                          <Chip 
                            label="✅ Official" 
                            variant="outlined" 
                            sx={{ color: 'green', borderColor: 'green' }} 
                          />
                        );
                      }
                      
                      // Show status chips for submitted results
                      let chipProps = {};
                      if (status === 'pending') {
                        chipProps = {
                          label: '⏳ In Review',
                          variant: 'outlined',
                          sx: { color: 'orange', borderColor: 'orange' }
                        };
                      } else if (status === 'approved') {
                        chipProps = {
                          label: '✅ Approved',
                          variant: 'outlined',
                          sx: { color: 'green', borderColor: 'green' }
                        };
                      } else if (status === 'rejected') {
                        chipProps = {
                          label: '❌ Rejected',
                          variant: 'outlined',
                          sx: { color: 'red', borderColor: 'red' }
                        };
                      } else if (status === 'revision_required') {
                        chipProps = {
                          label: '🔄 Revision Required',
                          variant: 'outlined',
                          sx: { color: 'blue', borderColor: 'blue' }
                        };
                      } else {
                        chipProps = {
                          label: status || 'Unknown',
                          variant: 'outlined'
                        };
                      }
                      
                      return <Chip {...chipProps} />;
                    },
                  },
                ]}
                data={allResults}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No results found for this athlete.',
                }}
              />
            </>
          )}

          {activeTab === 1 && (
            <>
              {/* Training Seminars Section */}
              {isOwnProfile && (
                <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Training Seminars</Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateSeminarDialogOpen(true)}
                  >
                    Submit Seminar Participation
                  </Button>
                </Box>
              )}
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'name',
                    header: 'Seminar Name',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'start_date',
                    header: 'Seminar Date',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    Cell: ({ row }) => {
                      const startDate = row.original.start_date || "N/A";
                      const endDate = row.original.end_date || "N/A";
                      return startDate !== "N/A" && endDate !== "N/A"
                        ? `${startDate} - ${endDate}`
                        : "N/A";
                    },
                  },
                  {
                    accessorKey: 'place',
                    header: 'Place',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                ]}
                data={trainingSeminars.length > 0 ? trainingSeminars : []}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No training seminar records found for this athlete.',
                }}
              />
            </>
          )}

          {activeTab === 2 && (
            <>
              {/* Grade History Section */}
              {isOwnProfile && (
                <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Grade History</Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateGradeDialogOpen(true)}
                  >
                    Submit Grading Exam
                  </Button>
                </Box>
              )}
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'grade_name',
                    header: 'Grade Name',
                  },
                  {
                    accessorKey: 'obtained_date',
                    header: 'Obtained Date',
                  },
                  {
                    accessorKey: 'level',
                    header: 'Level',
                  },
                  {
                    accessorKey: 'event_name',
                    header: 'Event',
                  },
                  // exam_place removed
                  {
                    accessorKey: 'examiner_1_name',
                    header: 'Examiner 1',
                  },
                  {
                    accessorKey: 'examiner_2_name',
                    header: 'Examiner 2',
                  },
                ]}
                data={gradeHistory.length > 0 ? gradeHistory : []}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No grade history found for this athlete.',
                }}
              />
            </>
          )}

          {activeTab === 3 && (
            <>
              {/* Medical Visa Section */}
              {isOwnProfile && (
                <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Medical Visa</Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleMedicalVisaDialog('add')}
                  >
                    Submit Medical Visa
                  </Button>
                </Box>
              )}
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'issued_date',
                    header: 'Issued Date',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'health_status',
                    header: 'Health Status',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'is_valid',
                    header: 'Valid',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'center' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'center' },
                    },
                    Cell: ({ row }) =>
                      row.original.is_valid ? (
                        <CheckCircleIcon sx={{ color: 'success.main' }} />
                      ) : (
                        <CancelIcon sx={{ color: 'text.disabled' }} />
                      ),
                  },
                ]}
                data={medicalVisa.length > 0 ? medicalVisa : []}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No medical visa records found for this athlete.',
                }}
              />
            </>
          )}

          {activeTab === 4 && (
            <>
              {/* Annual Visa Section */}
              {isOwnProfile && (
                <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Annual Visa</Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleAnnualVisaDialog('add')}
                  >
                    Submit Annual Visa
                  </Button>
                </Box>
              )}
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'issued_date',
                    header: 'Issued Date',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'visa_status',
                    header: 'Status',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'is_valid',
                    header: 'Valid',
                    muiTableHeadCellProps: {
                      sx: { flex: 1, textAlign: 'center' },
                    },
                    muiTableBodyCellProps: {
                      sx: { flex: 1, textAlign: 'center' },
                    },
                    Cell: ({ row }) =>
                      row.original.is_valid ? (
                        <CheckCircleIcon sx={{ color: 'success.main' }} />
                      ) : (
                        <CancelIcon sx={{ color: 'text.disabled' }} />
                      ),
                  },
                ]}
                data={annualVisa.length > 0 ? annualVisa : []}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No annual visa records found for this athlete.',
                }}
              />
            </>
          )}

          {activeTab === 5 && (
            <>
              {/* Matches Section */}
              {isOwnProfile && (
                <Box sx={{ mb: 2, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">Matches</Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleMatchDialog('add')}
                  >
                    Submit Match
                  </Button>
                </Box>
              )}
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'competition_name',
                    header: 'Competition',
                  },
                  {
                    accessorKey: 'category_name',
                    header: 'Category',
                    muiTableHeadCellProps: {
                      sx: { textAlign: 'left' },
                    },
                    muiTableBodyCellProps: {
                      sx: { textAlign: 'left' },
                    },
                  },
                  {
                    accessorKey: 'match_type',
                    header: 'Match Type',
                  },
                  {
                    accessorKey: 'opponent_name',
                    header: 'Opponent',
                    Cell: ({ row }) =>
                      `${row.original.opponent_name} (${row.original.opponent_club})`,
                  },
                  {
                    accessorKey: 'result',
                    header: 'Result',
                    Cell: ({ row }) => {
                      const isWinner = row.original.winner_name === athleteData?.first_name;
                      return (
                        <Typography
                          sx={{
                            color: isWinner ? "success.main" : "error.main",
                            fontSize: ".8rem",
                          }}
                        >
                          {isWinner ? "WIN" : "LOSS"}
                        </Typography>
                      );
                    },
                  },
                ]}
                data={relatedData?.matches?.length > 0 ? relatedData.matches : []}
                enableColumnResizing
                enablePagination
                enableSorting
                muiTableContainerProps={{
                  sx: {
                    maxHeight: '400px', // Add scrollable height
                  },
                }}
                localization={{
                  noData: 'No matches found for this athlete.',
                }}
              />
            </>
          )}


        </CardContent>
      </Card>

      {/* Result Dialog */}
      <AthleteResultDialog
        open={resultDialog.open}
        mode={resultDialog.mode}
        data={resultDialog.data}
        onClose={handleCloseDialog}
        onSave={handleSaveResult}
        availableAthletes={availableAthletes}
      />

      {/* Category Details Drawer */}
      <Drawer
        anchor="right"
        open={categoryDrawer.open}
        onClose={() => setCategoryDrawer({ open: false, categoryData: null })}
        sx={{
          zIndex: 1300,
          '& .MuiDrawer-paper': {
            width: 400,
            padding: 2,
          },
        }}
      >
        {categoryDrawer.categoryData && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" component="h2">
                Category Details
              </Typography>
              <IconButton onClick={() => setCategoryDrawer({ open: false, categoryData: null })}>
                <CloseIcon />
              </IconButton>
            </Box>
            
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 'bold' }}>
              {categoryDrawer.categoryData.name}
            </Typography>
            
            <Typography variant="subtitle1" sx={{ mb: 2, color: 'text.secondary' }}>
              {categoryDrawer.categoryData.competition_name}
            </Typography>
            
            {categoryDrawer.categoryData.description && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Description
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {categoryDrawer.categoryData.description}
                </Typography>
              </Box>
            )}

            {categoryDrawer.categoryData.group && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Group
                </Typography>
                <Typography variant="body2">
                  {categoryDrawer.categoryData.group.name || categoryDrawer.categoryData.group}
                </Typography>
              </Box>
            )}

            <Box sx={{ mb: 3 }}>
              {categoryDrawer.categoryData.type === 'teams' ? (
                // Show enrolled teams for team categories
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Enrolled Teams
                  </Typography>
                  {categoryDrawer.categoryData.teams?.length > 0 ? (
                    <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                      {categoryDrawer.categoryData.teams.map((team) => {
                        const firstMemberClub = team.members?.[0]?.athlete?.club?.name || 'No Club';
                        return (
                          <ListItem key={team.id} sx={{ py: 0.5, px: 0 }}>
                            <ListItemText 
                              primary={`${team.name} (${firstMemberClub})`}
                              secondary={`Team members: ${team.members?.map(m => `${m.athlete?.first_name} ${m.athlete?.last_name}`).join(', ') || 'No members'}`}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      No teams enrolled
                    </Typography>
                  )}
                </>
              ) : (
                // Show enrolled athletes for individual categories (solo/fight)
                <>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Enrolled Athletes
                  </Typography>
                  {categoryDrawer.categoryData.enrolled_athletes?.length > 0 ? (
                    <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                      {categoryDrawer.categoryData.enrolled_athletes.map((categoryAthlete) => {
                        // Handle CategoryAthlete structure where athlete data is nested
                        const athlete = categoryAthlete.athlete || categoryAthlete;
                        const clubName = athlete.club?.name || 'No Club';
                        
                        let displayText = `${athlete.first_name} ${athlete.last_name} (${clubName})`;
                        
                        // Add weight for fight categories
                        if (categoryDrawer.categoryData.type === 'fight' && categoryAthlete.weight) {
                          displayText += `, weight: ${categoryAthlete.weight}kg`;
                        }
                        
                        return (
                          <ListItem key={athlete.id} sx={{ py: 0.5, px: 0 }}>
                            <Link
                              component="button"
                              onClick={() => {
                                setCategoryDrawer({ open: false, categoryData: null });
                                navigate(`/athletes/${athlete.id}`);
                              }}
                              sx={{
                                textDecoration: 'none',
                                color: 'inherit',
                                '&:hover': { color: 'primary.main' },
                              }}
                            >
                              <ListItemText 
                                primary={displayText}
                              />
                            </Link>
                          </ListItem>
                        );
                      })}
                    </List>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      No enrolled athletes found
                    </Typography>
                  )}
                </>
              )}
            </Box>

            <Box sx={{ mb: 3 }}>
              {(() => {
                const categoryData = categoryDrawer.categoryData;
                
                // Debug: Log category data to understand the structure for fight categories
                if (categoryData.type === 'fight') {
                  console.log('Fight Category Data:', categoryData);
                  console.log('First Place:', categoryData.first_place);
                  console.log('Second Place:', categoryData.second_place);
                  console.log('Third Place:', categoryData.third_place);
                  console.log('Awards from results:', categoryData.awards);
                }
                
                // Collect all awards (individual and team) in one list
                const allAwards = [];
                
                // Add individual awards (for solo and fight categories)
                if (categoryData.first_place) {
                  allAwards.push({
                    place: '🥇 1st Place',
                    name: categoryData.first_place_name || `${categoryData.first_place.first_name} ${categoryData.first_place.last_name}`,
                    club: categoryData.first_place.club?.name || 'No Club'
                  });
                }
                if (categoryData.second_place) {
                  allAwards.push({
                    place: '🥈 2nd Place',
                    name: categoryData.second_place_name || `${categoryData.second_place.first_name} ${categoryData.second_place.last_name}`,
                    club: categoryData.second_place.club?.name || 'No Club'
                  });
                }
                if (categoryData.third_place) {
                  allAwards.push({
                    place: '🥉 3rd Place',
                    name: categoryData.third_place_name || `${categoryData.third_place.first_name} ${categoryData.third_place.last_name}`,
                    club: categoryData.third_place.club?.name || 'No Club'
                  });
                }
                
                // Fallback: Check awards from results API if no individual awards found and this is fight/solo category
                if (allAwards.length === 0 && categoryData.type !== 'teams' && categoryData.awards && categoryData.awards.length > 0) {
                  console.log('Using fallback awards from results API for', categoryData.type, 'category');
                  
                  const approvedResults = categoryData.awards.filter(award => 
                    award.status === 'approved' && award.placement_claimed
                  );
                  
                  approvedResults.forEach(result => {
                    const athleteName = result.athlete_name || `${result.athlete?.first_name || ''} ${result.athlete?.last_name || ''}`.trim();
                    const clubName = result.athlete?.club?.name || 'No Club';
                    
                    let placeEmoji = '';
                    if (result.placement_claimed === '1st') placeEmoji = '🥇';
                    else if (result.placement_claimed === '2nd') placeEmoji = '🥈';
                    else if (result.placement_claimed === '3rd') placeEmoji = '🥉';
                    
                    allAwards.push({
                      place: `${placeEmoji} ${result.placement_claimed} Place`,
                      name: athleteName,
                      club: clubName
                    });
                  });
                }
                
                if (categoryData.first_place_team) {
                  allAwards.push({
                    place: '🥇 1st Place',
                    name: categoryData.first_place_team.name,
                    club: categoryData.first_place_team.members?.[0]?.athlete?.club?.name || 'No Club'
                  });
                }
                if (categoryData.second_place_team) {
                  allAwards.push({
                    place: '� 2nd Place',
                    name: categoryData.second_place_team.name,
                    club: categoryData.second_place_team.members?.[0]?.athlete?.club?.name || 'No Club'
                  });
                }
                if (categoryData.third_place_team) {
                  allAwards.push({
                    place: '🥉 3rd Place',
                    name: categoryData.third_place_team.name,
                    club: categoryData.third_place_team.members?.[0]?.athlete?.club?.name || 'No Club'
                  });
                }
                
                return (
                  <>
                    {allAwards.length > 0 && (
                      <>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                          Awards
                        </Typography>
                        <List sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
                          {allAwards.map((award, index) => (
                            <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                              <ListItemText 
                                primary={`${award.place} ${award.name} (${award.club})`}
                              />
                            </ListItem>
                          ))}
                        </List>
                      </>
                    )}
                    
                    {allAwards.length === 0 && (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        No awards assigned yet
                        {categoryData.type === 'fight' && (
                          <span style={{ fontSize: '0.8em', display: 'block', marginTop: '8px' }}>
                            Debug: Fight category - check console for data structure<br/>
                            Awards from API: {categoryData.awards ? categoryData.awards.length : 0} results<br/>
                            Individual awards: {[categoryData.first_place, categoryData.second_place, categoryData.third_place].filter(Boolean).length} places
                          </span>
                        )}
                      </Typography>
                    )}
                  </>
                );
              })()}
            </Box>

            {categoryDrawer.categoryData.error && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {categoryDrawer.categoryData.error}
              </Alert>
            )}
          </Box>
        )}
      </Drawer>

      {/* Success/Error Feedback Dialog */}
      <Dialog
        open={feedbackDialog.open}
        onClose={() => setFeedbackDialog({ open: false, success: false, message: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          bgcolor: feedbackDialog.success ? 'success.light' : 'error.light',
          color: feedbackDialog.success ? 'success.contrastText' : 'error.contrastText',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          {feedbackDialog.success ? (
            <>
              <CheckCircleIcon />
              Success!
            </>
          ) : (
            <>
              <CancelIcon />
              Error
            </>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body1">
            {feedbackDialog.message}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setFeedbackDialog({ open: false, success: false, message: '' })}
            variant="contained"
            color={feedbackDialog.success ? 'success' : 'primary'}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Grade History Submission Dialog */}
      <CreateGradeHistory
        open={createGradeDialogOpen}
        onClose={() => setCreateGradeDialogOpen(false)}
        onSuccess={handleGradeSubmissionSuccess}
        grades={availableGrades}
      />

      {/* New Seminar Participation Submission Dialog */}
      <CreateSeminarParticipation
        open={createSeminarDialogOpen}
        onClose={() => setCreateSeminarDialogOpen(false)}
        onSuccess={handleSeminarSubmissionSuccess}
        trainingSeminars={availableTrainingSeminars}
      />
    </Box>
  );
};

// Result Dialog Component
const AthleteResultDialog = ({ open, mode, data, onClose, onSave, availableAthletes }) => {
  const [formData, setFormData] = useState({
    // Backend model fields
    type: '',              // Required: solo, teams, fight
    category: '',          // Required: category ID
    group: '',             // Optional: group ID
    placement_claimed: '', // Required: 1st, 2nd, 3rd
    notes: '',             // Optional: additional notes
    certificate_image: null, // Optional: certificate upload
    result_document: null,   // Optional: document upload
    team_members: [],        // Required for teams: array of athlete IDs
    team_name: ''           // Optional for teams: team name
  });
  
  // UI helper state (not sent to backend)
  const [selectedCompetition, setSelectedCompetition] = useState('');
  
  const [step, setStep] = useState(1);
  const [competitions, setCompetitions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter categories based on selected competition and result type first
  const filteredCategories = useMemo(() => {
    if (!selectedCompetition) return [];
    
    let filtered = categories.filter(category => 
      category.competition === parseInt(selectedCompetition)
    );
    
    // Filter by result type (this should be the primary filter)
    if (formData.type) {
      filtered = filtered.filter(category => category.type === formData.type);
    }
    
    // Then filter by group if selected
    if (formData.group) {
      filtered = filtered.filter(category => 
        category.group === parseInt(formData.group)
      );
    }
    
    return filtered;
  }, [categories, selectedCompetition, formData.type, formData.group]);

  // Filter groups based on selected competition AND available in the filtered categories
  const filteredGroups = useMemo(() => {
    if (!selectedCompetition) return [];
    
    // Get all groups that are used by categories matching the current filters
    const categoryGroups = filteredCategories
      .map(category => category.group)
      .filter(groupId => groupId !== null && groupId !== undefined);
    
    // Get unique group IDs
    const uniqueGroupIds = [...new Set(categoryGroups)];
    
    // Return groups that are both in the competition and used by matching categories
    return groups.filter(group => 
      group.competition === parseInt(selectedCompetition) &&
      uniqueGroupIds.includes(group.id)
    );
  }, [groups, selectedCompetition, filteredCategories]);

  useEffect(() => {
    if (open) {
      fetchCompetitions();
      fetchGroups();
      fetchCategories();
      
      if (data && (mode === 'edit' || mode === 'view')) {
        setFormData({
          type: data.type || 'solo',
          category: data.category || '',
          group: data.group || '',
          placement_claimed: data.placement_claimed || '',
          notes: data.notes || '',
          certificate_image: null,
          result_document: null,
          team_members: data.team_members || [],
          team_name: data.team_name || ''
        });
        // Set competition for UI filtering
        if (data.competition_name || data.category) {
          // If we have category data, find the competition from it
          const category = categories.find(c => c.id === data.category);
          if (category) {
            setSelectedCompetition(category.competition.toString());
          }
        }
        setStep(2); // Skip type selection for edit/view
      } else if (mode === 'add') {
        setFormData({
          type: '',
          category: '',
          group: '',
          placement_claimed: '',
          notes: '',
          certificate_image: null,
          result_document: null,
          team_members: [],
          team_name: ''
        });
        setSelectedCompetition('');
        setStep(1);
      }
    }
  }, [open, data, mode]);



  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const response = await AxiosInstance.get('competitions/');
      setCompetitions(response.data);
    } catch (error) {
      console.error('Error fetching competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await AxiosInstance.get('groups/');
      setGroups(response.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await AxiosInstance.get('categories/');
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };



  const handleChange = (field) => (event) => {
    const value = event.target.value;
    
    // Handle special UI-only fields
    if (field === 'competition') {
      // Competition is UI-only for filtering, not sent to backend
      setSelectedCompetition(value);
      // Reset group and category when competition changes
      setFormData({ 
        ...formData,
        group: '',
        category: ''
      });
      return;
    }
    
    // Reset dependent fields when parent fields change
    if (field === 'type') {
      // When type changes, reset competition, group, and category
      setFormData({ 
        ...formData, 
        [field]: value,
        group: '',
        category: ''
      });
      setSelectedCompetition('');
    } else if (field === 'group') {
      // When group changes, reset category
      setFormData({ 
        ...formData, 
        [field]: value,
        category: ''
      });
    } else {
      setFormData({ ...formData, [field]: value });
    }
  };

  const handleFileChange = (field) => (event) => {
    const file = event.target.files[0];
    setFormData({ ...formData, [field]: file });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      // Debug: Log form data before submission
      console.log('Form data before submission:', formData);
      
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'team_members') {
          // Only include team_members if type is 'teams' and there are team members
          if (formData.type === 'teams' && formData[key] && formData[key].length > 0) {
            formData[key].forEach(memberId => {
              submitData.append('team_members', memberId);
            });
          }
          // Skip team_members for non-team results or empty team_members
        } else if (formData[key] !== null && formData[key] !== '') {
          submitData.append(key, formData[key]);
        }
      });
      
      // Debug: Log what's being sent to the server
      console.log('Data being sent to server:');
      for (let [key, value] of submitData.entries()) {
        console.log(key, value);
      }

      if (mode === 'edit') {
        await AxiosInstance.put(`category-athlete-score/${data.id}/`, submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const endpoint = 'category-athlete-score/';
        await AxiosInstance.post(endpoint, submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // Convert FormData to regular object for the parent component
      const resultData = {};
      Object.keys(formData).forEach(key => {
        if (key === 'team_members') {
          if (formData.type === 'teams' && formData[key] && formData[key].length > 0) {
            resultData[key] = formData[key];
          }
        } else if (formData[key] !== null && formData[key] !== '') {
          resultData[key] = formData[key];
        }
      });
      
      onSave(resultData);
      // Don't close here - let the parent component handle closing and showing feedback
    } catch (error) {
      console.error('Error submitting result:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Error submitting result. Please try again.';
      if (error.response?.data) {
        // Try to extract meaningful error messages
        if (typeof error.response.data === 'object') {
          const errors = [];
          Object.keys(error.response.data).forEach(key => {
            if (Array.isArray(error.response.data[key])) {
              errors.push(`${key}: ${error.response.data[key].join(', ')}`);
            } else {
              errors.push(`${key}: ${error.response.data[key]}`);
            }
          });
          if (errors.length > 0) {
            errorMessage = `Validation errors: ${errors.join('; ')}`;
          }
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        }
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isReadOnly = mode === 'view';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'add' && step === 1 && 'Select Result Type'}
        {mode === 'add' && step === 2 && `Submit ${formData.type === 'teams' ? 'Team' : 'Individual'} Result`}
        {mode === 'edit' && 'Edit Competition Result'}
        {mode === 'view' && 'View Competition Result'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          
          {/* Step 1: Result Type Selection (only for new submissions) */}
          {mode === 'add' && step === 1 && (
            <>
              <Typography variant="body1" gutterBottom>
                What type of competition result are you submitting?
              </Typography>
              
              <FormControl fullWidth required>
                <InputLabel>Result Type</InputLabel>
                <Select
                  value={formData.type}
                  onChange={handleChange('type')}
                  label="Result Type"
                >
                  <MenuItem value="solo">
                    🏃 Solo Performance - Individual competition (forms, kata, etc.)
                  </MenuItem>
                  <MenuItem value="fight">
                    🥊 Fight/Sparring - One-on-one combat competition
                  </MenuItem>
                  <MenuItem value="teams">
                    👥 Team Event - Group/team competition
                  </MenuItem>
                </Select>
              </FormControl>
              
              {formData.type && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {formData.type === 'solo' && 'You will submit an individual result for a solo performance category.'}
                    {formData.type === 'fight' && 'You will submit an individual result for a fighting/sparring category.'}
                    {formData.type === 'teams' && 'You will create a team with other athletes and submit a team result.'}
                  </Typography>
                </Box>
              )}
            </>
          )}
          
          {/* Step 2: Competition Details (for new submissions) or All Details (for edit/view) */}
          {(step === 2 || mode !== 'add') && (
            <>
              {/* Team Name (only for teams) */}
              {formData.type === 'teams' && (
                <TextField
                  fullWidth
                  label="Team Name (Optional)"
                  value={formData.team_name}
                  onChange={handleChange('team_name')}
                  disabled={isReadOnly}
                  helperText="Optional: Give your team a name"
                  sx={{ mb: 2 }}
                />
              )}

              {/* Team Member Selection (only for teams and add mode) */}
              {formData.type === 'teams' && mode === 'add' && (
                <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    Team Members
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Select other athletes to form your team for this competition.
                  </Typography>
                  
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Add Team Member</InputLabel>
                    <Select
                      value=""
                      onChange={(e) => {
                        const athleteId = e.target.value;
                        if (athleteId && !formData.team_members.includes(athleteId)) {
                          setFormData(prev => ({
                            ...prev,
                            team_members: [...prev.team_members, athleteId]
                          }));
                        }
                      }}
                      label="Add Team Member"
                    >
                      {availableAthletes
                        .filter(athlete => !formData.team_members.includes(athlete.id))
                        .map((athlete) => (
                          <MenuItem key={athlete.id} value={athlete.id}>
                            {athlete.first_name} {athlete.last_name}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  
                  {formData.team_members.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {formData.team_members.map((memberId) => {
                        const member = availableAthletes.find(a => a.id === memberId);
                        return member ? (
                          <Chip
                            key={memberId}
                            label={`${member.first_name} ${member.last_name}`}
                            onDelete={() => {
                              setFormData(prev => ({
                                ...prev,
                                team_members: prev.team_members.filter(id => id !== memberId)
                              }));
                            }}
                            color="primary"
                            variant="outlined"
                          />
                        ) : null;
                      })}
                    </Box>
                  )}
                </Box>
              )}
              
              {/* Competition Selection (UI only - not sent to backend) */}
              <FormControl fullWidth disabled={isReadOnly} required>
                <InputLabel>Competition</InputLabel>
                <Select
                  value={selectedCompetition}
                  onChange={handleChange('competition')}
                  label="Competition"
                  required
                >
                  {competitions.map((competition) => (
                    <MenuItem key={competition.id} value={competition.id}>
                      {competition.name} ({competition.start_date} - {competition.end_date})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Group Selection (only for individual results) */}
              {formData.type !== 'teams' && (
                <FormControl fullWidth disabled={isReadOnly || !selectedCompetition}>
                  <InputLabel>Group (Optional)</InputLabel>
                  <Select
                    value={formData.group}
                    onChange={handleChange('group')}
                    label="Group (Optional)"
                  >
                    <MenuItem value="">
                      <em>No Group</em>
                    </MenuItem>
                    {filteredGroups.map((group) => (
                      <MenuItem key={group.id} value={group.id}>
                        {group.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Category Selection */}
              <FormControl fullWidth disabled={isReadOnly || !selectedCompetition} required>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={handleChange('category')}
                  label="Category"
                  required
                >
                  {filteredCategories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name} ({category.type} - {category.gender})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Placement */}
              <FormControl fullWidth disabled={isReadOnly} required>
                <InputLabel>Award Placement</InputLabel>
                <Select
                  value={formData.placement_claimed}
                  onChange={handleChange('placement_claimed')}
                  label="Award Placement"
                  required
                >
                  <MenuItem value="1st">1st Place</MenuItem>
                  <MenuItem value="2nd">2nd Place</MenuItem>
                  <MenuItem value="3rd">3rd Place</MenuItem>
                </Select>
              </FormControl>

              {/* Notes */}
              <TextField
                label="Notes"
                value={formData.notes}
                onChange={handleChange('notes')}
                fullWidth
                multiline
                rows={3}
                disabled={isReadOnly}
                placeholder={`Additional notes about ${formData.type === 'teams' ? 'the team\'s' : 'your'} performance`}
              />

              {/* File Uploads (only for add/edit modes) */}
              {!isReadOnly && (
                <>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Certificate/Award Photo (Optional)
                    </Typography>
                    <input
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="certificate-upload"
                      type="file"
                      onChange={handleFileChange('certificate_image')}
                    />
                    <label htmlFor="certificate-upload">
                      <Button variant="outlined" component="span" startIcon={<AddIcon />}>
                        Upload Certificate Image
                      </Button>
                    </label>
                    {formData.certificate_image && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Selected: {formData.certificate_image.name}
                      </Typography>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Official Result Document (Optional)
                    </Typography>
                    <input
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      id="document-upload"
                      type="file"
                      onChange={handleFileChange('result_document')}
                    />
                    <label htmlFor="document-upload">
                      <Button variant="outlined" component="span" startIcon={<AddIcon />}>
                        Upload Result Document
                      </Button>
                    </label>
                    {formData.result_document && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Selected: {formData.result_document.name}
                      </Typography>
                    )}
                  </Box>
                </>
              )}

              {/* Submission Info (for view mode) */}
              {isReadOnly && data && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Submission Info:</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Competition: {data.competition_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Category: {data.category_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Submitted: {new Date(data.submitted_date).toLocaleString()}
                  </Typography>
                  {data.reviewed_date && (
                    <Typography variant="body2" color="text.secondary">
                      Reviewed: {new Date(data.reviewed_date).toLocaleString()}
                    </Typography>
                  )}
                  {data.admin_notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Admin Notes: {data.admin_notes}
                    </Typography>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {isReadOnly ? 'Close' : 'Cancel'}
        </Button>
        
        {/* Step navigation for add mode */}
        {mode === 'add' && step === 1 && (
          <Button 
            onClick={() => setStep(2)} 
            variant="contained"
            disabled={!formData.type}
          >
            Next
          </Button>
        )}
        
        {mode === 'add' && step === 2 && (
          <>
            <Button onClick={() => setStep(1)}>
              Back
            </Button>
            <Button 
              onClick={handleSubmit} 
              variant="contained"
              disabled={loading || (formData.result_type === 'teams' && formData.team_members.length === 0)}
            >
              Submit Result
            </Button>
          </>
        )}
        
        {/* Edit mode submit */}
        {mode === 'edit' && (
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            Update Result
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ViewAthlete;
