import React, { useEffect, useState } from "react";
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
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import Avatar from "@mui/material/Avatar";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import { MaterialReactTable } from 'material-react-table';

const ViewAthlete = () => {
  const { id } = useParams(); // Get athlete ID from URL
  const navigate = useNavigate();
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

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        const athleteResponse = await AxiosInstance.get(`athlete/${id}/`);
        const relatedData = {};

        // Fetch related data
        if (athleteResponse.data.city) {
          try {
            // Fetch all cities and find the city by ID
            const citiesResponse = await AxiosInstance.get(`city/`);
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
          const clubResponse = await AxiosInstance.get(
            `club/${athleteResponse.data.club}/`
          );
          relatedData.club = clubResponse.data;
        }

        if (athleteResponse.data.title) {
          const titleResponse = await AxiosInstance.get(
            `title/${athleteResponse.data.title}/`
          );
          relatedData.title = titleResponse.data;
        }

        if (athleteResponse.data.federation_role) {
          const federationRoleResponse = await AxiosInstance.get(
            `federation-role/${athleteResponse.data.federation_role}/`
          );
          relatedData.federationRole = federationRoleResponse.data;
        }

        if (athleteResponse.data.current_grade) {
          const gradeResponse = await AxiosInstance.get(
            `grade/${athleteResponse.data.current_grade}/`
          );
          relatedData.grade = gradeResponse.data;
        }

        const teamResponse = await AxiosInstance.get(`team/?athlete_id=${id}`);
        relatedData.teams = teamResponse.data;

        const categoryResponse = await AxiosInstance.get(
          `category/?athlete_id=${id}`
        );
        relatedData.categories = categoryResponse.data;

        // Fetch grade history
        const gradeHistoryResponse = await AxiosInstance.get(
          `grade-history/?athlete_id=${id}`
        );
        setGradeHistory(gradeHistoryResponse.data);

        // Fetch annual visa
        const annualVisaResponse = await AxiosInstance.get(`annual-visa/`);
        const filteredAnnualVisa = annualVisaResponse.data.filter(
          (visa) => visa.athlete === parseInt(id)
        );
        setAnnualVisa(filteredAnnualVisa);

        // Fetch medical visa
        const medicalVisaResponse = await AxiosInstance.get(`medical-visa/`);
        const filteredMedicalVisa = medicalVisaResponse.data.filter(
          (visa) => visa.athlete === parseInt(id)
        );
        setMedicalVisa(filteredMedicalVisa);

        // Fetch training seminars
        const trainingSeminarsResponse = await AxiosInstance.get(
          `training-seminar/?athlete_id=${id}`
        );
        setTrainingSeminars(trainingSeminarsResponse.data);

        // Fetch matches
        const matchesResponse = await AxiosInstance.get(`match/?athlete_id=${id}`);
        const matches = matchesResponse.data;

        // Fetch categories and competitions for matches
        const categoryIds = [...new Set(matches.map((match) => match.category))];
        const categoriesResponse = await Promise.all(
          categoryIds.map((categoryId) =>
            AxiosInstance.get(`category/${categoryId}/`)
          )
        );
        const categories = categoriesResponse.map((res) => res.data);

        const competitionIds = [
          ...new Set(categories.map((category) => category.competition)),
        ];
        const competitionsResponse = await Promise.all(
          competitionIds.map((competitionId) =>
            AxiosInstance.get(`competition/${competitionId}/`)
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
            AxiosInstance.get(`athlete/${opponentId}/`)
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
      } catch (error) {
        console.error("Error fetching athlete data:", error);
        setErrorMessage("Failed to fetch athlete data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchAthleteData();
  }, [id]);

  useEffect(() => {
    const fetchAthleteIds = async () => {
      try {
        const response = await AxiosInstance.get("athlete/");
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

  const calculateAwards = () => {
    let firstPlace = 0;
    let secondPlace = 0;
    let thirdPlace = 0;

    if (relatedData?.categories?.length > 0) {
      relatedData.categories.forEach((category) => {
        // Individual awards
        if (category?.first_place_name === athleteData?.first_name) {
          firstPlace++;
        }
        if (category?.second_place_name === athleteData?.first_name) {
          secondPlace++;
        }
        if (category?.third_place_name === athleteData?.first_name) {
          thirdPlace++;
        }

        // Team awards
        if (
          category?.first_place_team_name?.includes(athleteData?.first_name)
        ) {
          firstPlace++;
        }
        if (
          category?.second_place_team_name?.includes(athleteData?.first_name)
        ) {
          secondPlace++;
        }
        if (
          category?.third_place_team_name?.includes(athleteData?.first_name)
        ) {
          thirdPlace++;
        }
      });
    }

    return { firstPlace, secondPlace, thirdPlace };
  };

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
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>
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
            {(() => {
              const { firstPlace, secondPlace, thirdPlace } = calculateAwards();
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    fontWeight: "bold",
                  }}
                >
                  🥇 {firstPlace}
                  <Divider orientation="vertical" flexItem sx={{ marginX: 1 }} />
                  🥈 {secondPlace}
                  <Divider orientation="vertical" flexItem sx={{ marginX: 1 }} />
                  🥉 {thirdPlace}
                </Box>
              );
            })()}
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
                sx={{ marginBottom: 0, fontWeight: "bold" }}
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
                sx={{ marginBottom: 0, fontWeight: "bold" }}
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
                  sx={{ width: 100, height: 100, border: "2px solid #ccc" }}
                />
              </Box>
            </CardContent>

            {/* Federation Role and Title Section */}

            <CardContent sx={{ padding: 0, marginBottom: 2 }}>
              <Typography
                variant="h6"
                sx={{ marginBottom: 0, fontWeight: "bold" }}
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
                sx={{ marginBottom: 0, fontWeight: "bold" }}
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
              {/* Athlete Results Section */}
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
                    Cell: ({ row }) => {
                      const place = row.original.place;
                      if (place === "1st") return "🥇 1st Place";
                      if (place === "2nd") return "🥈 2nd Place";
                      if (place === "3rd") return "🥉 3rd Place";
                      return place || "N/A";
                    },
                  },
                ]}
                data={
                  relatedData?.categories?.length > 0
                    ? relatedData.categories
                        .filter((category) => {
                          // Filter out categories where the athlete didn't obtain any result
                          return (
                            category?.first_place_name === athleteData?.first_name ||
                            category?.second_place_name === athleteData?.first_name ||
                            category?.third_place_name === athleteData?.first_name ||
                            category?.first_place_team_name?.includes(athleteData?.first_name) ||
                            category?.second_place_team_name?.includes(athleteData?.first_name) ||
                            category?.third_place_team_name?.includes(athleteData?.first_name)
                          );
                        })
                        .map((category) => {
                          // Determine the athlete's place
                          let place = null;
                          if (category?.first_place_name === athleteData?.first_name) {
                            place = "🥇 1st Place";
                          } else if (category?.second_place_name === athleteData?.first_name) {
                            place = "🥈 2nd Place";
                          } else if (category?.third_place_name === athleteData?.first_name) {
                            place = "🥉 3rd Place";
                          } else if (
                            category?.first_place_team_name?.includes(athleteData?.first_name)
                          ) {
                            place = `🥇 1st Place (${category.first_place_team_name})`;
                          } else if (
                            category?.second_place_team_name?.includes(athleteData?.first_name)
                          ) {
                            place = `🥈 2nd Place (${category.second_place_team_name})`;
                          } else if (
                            category?.third_place_team_name?.includes(athleteData?.first_name)
                          ) {
                            place = `🥉 3rd Place (${category.third_place_team_name})`;
                          }

                          return {
                            competition_name: category?.competition_name || "N/A",
                            category_name: category?.name || "N/A",
                            enrolled_athletes_count: category?.enrolled_athletes?.length || 0,
                            place,
                          };
                        })
                    : []
                }
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
                    accessorKey: 'exam_date',
                    header: 'Exam Date',
                  },
                  {
                    accessorKey: 'exam_place',
                    header: 'Exam Place',
                  },
                  {
                    accessorKey: 'technical_director',
                    header: 'Technical Director',
                  },
                  {
                    accessorKey: 'president',
                    header: 'President',
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
                        <CheckCircleIcon sx={{ color: 'green' }} />
                      ) : (
                        <CancelIcon sx={{ color: 'grey' }} />
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
                        <CheckCircleIcon sx={{ color: 'green' }} />
                      ) : (
                        <CancelIcon sx={{ color: 'grey' }} />
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
              <MaterialReactTable
                columns={[
                  {
                    accessorKey: 'competition_name',
                    header: 'Competition',
                  },
                  {
                    accessorKey: 'category_name',
                    header: 'Category',
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
                            color: isWinner ? "green" : "red",
                            fontWeight: "bold",
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
    </Box>
  );
};

export default ViewAthlete;
