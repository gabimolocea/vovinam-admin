import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  Avatar,
  IconButton,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { MaterialReactTable } from "material-react-table";

const ViewClub = () => {
  const { id } = useParams(); // Get club ID from URL
  const navigate = useNavigate();
  const [clubData, setClubData] = useState(null); // State for club data
  const [athleteResults, setAthleteResults] = useState([]); // State for athlete/team results
  const [clubAthletes, setClubAthletes] = useState([]); // State for athletes assigned to the club
  const [errorMessage, setErrorMessage] = useState(""); // State for error message
  const [loading, setLoading] = useState(true); // State for loading indicator
  // We no longer use in-page tabs; show sections stacked and rely on side navigation
  const [clubs, setClubs] = useState([]); // State for all clubs
  const [currentClubIndex, setCurrentClubIndex] = useState(-1); // Index of the current club

  useEffect(() => {
    const fetchClubData = async () => {
      try {
        console.log("Fetching all clubs...");
        const clubsResponse = await AxiosInstance.get("club/");
        const allClubs = clubsResponse.data;
        setClubs(allClubs);

        const index = allClubs.findIndex((club) => club.id === parseInt(id));
        setCurrentClubIndex(index);

        console.log(`Fetching club details for ID: ${id}`);
        const clubResponse = await AxiosInstance.get(`club/${id}/`);
        setClubData(clubResponse.data);

        console.log("Fetching grades...");
        const gradesResponse = await AxiosInstance.get("grade/");
        const grades = gradesResponse.data.reduce((acc, grade) => {
          acc[grade.id] = grade.name;
          return acc;
        }, {});

        console.log("Fetching athletes...");
        const athletesResponse = await AxiosInstance.get("athlete/");
        const clubAthletes = athletesResponse.data.filter(
          (athlete) => athlete.club === parseInt(id)
        );

        const mappedAthletes = clubAthletes.map((athlete) => ({
          id: athlete.id,
          name: `${athlete.first_name} ${athlete.last_name}`,
          grade: grades[athlete.current_grade] || "N/A",
          joined_date: athlete.registered_date || "N/A",
          annual_visa: athlete.annual_visa || "N/A",
          medical_visa: athlete.medical_visa || "N/A",
          last_exam_date: athlete.last_exam_date || "N/A",
        }));
        setClubAthletes(mappedAthletes);

        console.log("Fetching categories...");
        const categoriesResponse = await AxiosInstance.get("category/");
        const categories = categoriesResponse.data;

        console.log("Categories Data:", categories);

        const clubAthleteResults = categories.flatMap((category) => {
          console.log("Processing Category:", category);

          const athleteResults = (category.athletes || [])
            .filter((athlete) => athlete.club === parseInt(id))
            .map((athlete) => ({
              name: `${athlete.first_name} ${athlete.last_name}`,
              competition_name: category.competition_name,
              category_name: category.name,
              place: category.first_place === athlete.id
                ? "1st"
                : category.second_place === athlete.id
                ? "2nd"
                : category.third_place === athlete.id
                ? "3rd"
                : "N/A",
            }));

          const teamResults = (category.teams || [])
            .filter((team) =>
              [category.first_place_team, category.second_place_team, category.third_place_team].includes(team.id)
            )
            .map((team) => ({
              name: `Team ${team.name}`,
              competition_name: category.competition_name,
              category_name: category.name,
              place: category.first_place_team === team.id
                ? "1st"
                : category.second_place_team === team.id
                ? "2nd"
                : category.third_place_team === team.id
                ? "3rd"
                : "N/A",
            }));

          return [...athleteResults, ...teamResults];
        });

        setAthleteResults(clubAthleteResults);
      } catch (error) {
        console.error("Error fetching club data:", error);
        setErrorMessage("Failed to fetch club data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchClubData();
  }, [id]);



  const handlePreviousClub = () => {
    if (currentClubIndex > 0) {
      const previousClubId = clubs[currentClubIndex - 1].id;
      navigate(`/clubs/${previousClubId}`);
    } else {
      navigate("/clubs"); // Redirect to /clubs if it's the first club
    }
  };

  const handleNextClub = () => {
    if (currentClubIndex < clubs.length - 1) {
      const nextClubId = clubs[currentClubIndex + 1].id;
      navigate(`/clubs/${nextClubId}`);
    } else {
      navigate("/clubs"); // Redirect to /clubs if it's the last club
    }
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
        {/* Left Arrow */}
        <IconButton onClick={handlePreviousClub} sx={{ color: "primary.main" }}>
          <ArrowBackIcon />
        </IconButton>

        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 0,
            gap: { xs: 2, sm: 3, md: 3 },
          }}
        >
          <Avatar
            src={`http://127.0.0.1:8000${clubData?.logo || "/media/default_logo.jpg"}`}
            alt={`${clubData?.name || "Club Logo"}`}
            sx={{
              width: { xs: 80, sm: 100, md: 120 },
              height: { xs: 80, sm: 100, md: 120 },
              borderRadius: "5%",
              marginRight: 0,
              marginLeft: 0,
              marginTop: 0,
            }}
          />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "left",
              alignSelf: "center",
              gap: { xs: 0, sm: 1, md: 1 },
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>
              {clubData?.name || "Club Name"}
            </Typography>
          </Box>
        </Box>

        {/* Right Arrow or Close Icon */}
        {currentClubIndex === clubs.length - 1 ? (
          <IconButton onClick={() => navigate("/clubs")} sx={{ color: "primary.main" }}>
            <CloseIcon />
          </IconButton>
        ) : (
          <IconButton onClick={handleNextClub} sx={{ color: "primary.main" }}>
            <ArrowForwardIcon />
          </IconButton>
        )}
      </Box>

      {/* Club Information Section */}
      <CardContent sx={{ padding: 0, marginBottom: 2 }}>
        <Typography variant="h6" sx={{ marginBottom: 0, fontWeight: "bold" }}>
          Club Information
        </Typography>
        <Divider sx={{ marginBottom: 1 }} />
        <Typography>
          <strong>Address:</strong> {clubData?.address || "N/A"}
        </Typography>
        <Typography>
          <strong>Mobile Number:</strong> {clubData?.mobile_number || "N/A"}
        </Typography>
        <Typography>
          <strong>Website:</strong> {clubData?.website || "N/A"}
        </Typography>
        <Typography>
          <strong>City:</strong> {clubData?.city?.name || "N/A"}
        </Typography>
      </CardContent>

      {/* Sections stacked: Athletes then Athlete Results */}
      <Card sx={{ marginTop: 2, padding: 0 }} elevation={0}>
        <CardContent sx={{ padding: 0 }}>
          <Typography variant="h6" sx={{ marginBottom: 1, fontWeight: 'bold' }}>Athletes</Typography>
          <Divider sx={{ marginBottom: 1 }} />
          <MaterialReactTable
            columns={[
              {
                accessorKey: "name",
                header: "Athlete Name",
                muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } },
                muiTableBodyCellProps: { sx: { flex: 1, textAlign: "left", cursor: "pointer" } },
                Cell: ({ row }) => (
                  <Typography sx={{ color: "primary.main", textDecoration: "underline" }} onClick={() => navigate(`/athletes/${row.original.id}`)}>
                    {row.original.name}
                  </Typography>
                ),
              },
              { accessorKey: "grade", header: "Grade", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "joined_date", header: "Date Joined", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "annual_visa", header: "Annual Visa", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "medical_visa", header: "Medical Visa", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
            ]}
            data={clubAthletes.length > 0 ? clubAthletes : []}
            enableColumnResizing
            enablePagination
            enableSorting
            muiTableContainerProps={{ sx: { maxHeight: "400px" } }}
            localization={{ noData: "No athletes found for this club." }}
          />

          <Box sx={{ height: 24 }} />

          <Typography variant="h6" sx={{ marginBottom: 1, fontWeight: 'bold' }}>Athlete Results</Typography>
          <Divider sx={{ marginBottom: 1 }} />
          <MaterialReactTable
            columns={[
              { accessorKey: "name", header: "Athlete/Team Name", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "competition_name", header: "Competition", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "category_name", header: "Category", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } } },
              { accessorKey: "place", header: "Place", muiTableHeadCellProps: { sx: { flex: 1, textAlign: "left" } }, Cell: ({ row }) => {
                  const place = row.original.place;
                  if (place === "1st") return "\ud83e\udd47 1st Place";
                  if (place === "2nd") return "\ud83e\udd48 2nd Place";
                  if (place === "3rd") return "\ud83e\udd49 3rd Place";
                  return place || "N/A";
                } },
            ]}
            data={athleteResults}
            enableColumnResizing
            enablePagination
            enableSorting
            muiTableContainerProps={{ sx: { maxHeight: "400px" } }}
          />
        </CardContent>
      </Card>

    </Box>
  );
};

export default ViewClub;