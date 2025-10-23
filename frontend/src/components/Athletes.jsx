import React, { useEffect, useState, useMemo } from "react";
import { Box, IconButton, Button, Avatar } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { MaterialReactTable } from "material-react-table";
import AxiosInstance from "./Axios";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteDialog from "./DeleteDialog"; // Import the global DeleteDialog component
import { useAuth } from "../contexts/AuthContext";

const Athletes = () => {
  const { isAdmin } = useAuth();
  const [myData, setMyData] = useState([]);
  const [grades, setGrades] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const navigate = useNavigate(); // For navigation

  const GetData = async () => {
    try {
      // Fetch athletes
      const response = await AxiosInstance.get("athletes/");
      console.log("Athletes API Response:", response.data);

      // Fetch grades (clubs are now included in athlete response)
      const gradesResponse = await AxiosInstance.get("grades/");
      console.log("Grades API Response:", gradesResponse.data);

      // Map grade IDs to their names
      const gradesMap = gradesResponse.data.reduce((acc, grade) => {
        acc[grade.id] = grade.name;
        return acc;
      }, {});

      setGrades(gradesMap);

      // Transform athlete data
      const transformedData = response.data.map((athlete) => ({
        ...athlete,
        club: athlete.club?.name || "N/A", // Use club object name directly
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
      await AxiosInstance.delete(`athletes/${selectedAthlete.id}/`);
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
              isAdmin ? (
                <Button
                  variant="contained"
                  size="medium"
                  color="primary"
                  onClick={() => navigate("/create-athlete")} // Navigate to the Create Athlete page
                >
                  Create Athlete
                </Button>
              ) : null
            )}
            renderRowActions={({ row }) => (
              isAdmin ? (
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
              ) : null
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