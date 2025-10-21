import React, { useEffect, useState, useMemo } from "react";
import { Box, IconButton, Button, Avatar } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { MaterialReactTable } from "material-react-table";
import AxiosInstance from "./Axios";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteDialog from "./DeleteDialog"; // Import the global DeleteDialog component

const Athletes = () => {
  const [myData, setMyData] = useState([]);
  const [clubs, setClubs] = useState({});
  const [grades, setGrades] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const navigate = useNavigate(); // For navigation

  const GetData = async () => {
    try {
      // Fetch athletes
      const response = await AxiosInstance.get("athlete/");
      console.log("Athletes API Response:", response.data);

      // Fetch clubs and grades
      const clubsResponse = await AxiosInstance.get("club/");
      const gradesResponse = await AxiosInstance.get("grade/");
      console.log("Clubs API Response:", clubsResponse.data);
      console.log("Grades API Response:", gradesResponse.data);

      // Map club and grade IDs to their names
      const clubsMap = clubsResponse.data.reduce((acc, club) => {
        acc[club.id] = club.name;
        return acc;
      }, {});
      const gradesMap = gradesResponse.data.reduce((acc, grade) => {
        acc[grade.id] = grade.name;
        return acc;
      }, {});

      setClubs(clubsMap);
      setGrades(gradesMap);

      // Transform athlete data
      const transformedData = response.data.map((athlete) => ({
        ...athlete,
        club: clubsMap[athlete.club] || "N/A", // Map club ID to name
        grade: gradesMap[athlete.current_grade] || "N/A", // Map grade ID to name
      }));

      setMyData(transformedData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    GetData();
  }, []);

  const handleDelete = async () => {
    try {
      await AxiosInstance.delete(`athlete/${selectedAthlete.id}/`);
      console.log("Deleted athlete:", selectedAthlete);
      setMyData(myData.filter((athlete) => athlete.id !== selectedAthlete.id)); // Remove the deleted athlete from the state
      setOpenDialog(false); // Close the dialog
    } catch (error) {
      console.error("Error deleting athlete:", error);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Avatar
              src={`http://127.0.0.1:8000${row.original.profile_image || ""}`} // Use the provided base URL and profile image
              alt={`${row.original.first_name || "Athlete"} ${row.original.last_name || "Profile"}`}
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                marginRight: 0,
                marginLeft: 0,
                marginTop: 0,
              }}
            />
            <Button
              component={Link}
              to={`/athletes/${row.original.id}`}
              sx={{ textTransform: 'none', color: 'primary.main', fontWeight: 600 }}
            >
              {`${row.original.first_name} ${row.original.last_name}`}
            </Button>
          </Box>
        ),
      },
      {
        accessorKey: "club",
        header: "Club",
      },
      {
        accessorKey: "grade",
        header: "Grade",
      },
    ],
    []
  );

  return (
    <div>
      <Box>
        {myData.length > 0 ? (
          <MaterialReactTable
            columns={columns}
            data={myData}
            enableRowActions
            positionActionsColumn="last"
            renderTopToolbarCustomActions={() => (
              <Button
                variant="contained"
                size="medium"
                color="primary"
                onClick={() => navigate("/create-athlete")} // Navigate to the Create Athlete page
              >
                Create Athlete
              </Button>
            )}
            renderRowActions={({ row }) => (
              <Box sx={{ display: "flex", flexWrap: "nowrap", gap: "0rem" }}>
                <IconButton component={Link} to={`edit/${row.original.id}`}>
                  <EditIcon />
                </IconButton>
                <IconButton
                  onClick={() => {
                    setSelectedAthlete(row.original); // Set the selected athlete
                    setOpenDialog(true); // Open the dialog
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            )}
          />
        ) : (
          <p>Loading data or no data available...</p>
        )}
      </Box>

      {/* Confirmation Dialog */}

      <DeleteDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onConfirm={handleDelete}
        itemName={`${selectedAthlete?.first_name} ${selectedAthlete?.last_name}`}
      />
    </div>
  );
};

export default Athletes;