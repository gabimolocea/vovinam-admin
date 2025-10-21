import React, { useEffect, useState, useMemo } from "react";
import { Box, IconButton, Button, Avatar } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { MaterialReactTable } from "material-react-table";
import AxiosInstance from "./Axios";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteDialog from "./DeleteDialog"; // Import the global DeleteDialog component

const Clubs = () => {
  const [myData, setMyData] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const navigate = useNavigate(); // For navigation

  const GetData = async () => {
    try {
      const response = await AxiosInstance.get("club/");
      console.log("API Response:", response.data);

      const transformedData = response.data.map((club) => ({
        ...club,
        city: club.city ? club.city.name : "N/A", // Handle null city
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
      await AxiosInstance.delete(`clubs/${selectedClub.id}/`);
      console.log("Deleted club:", selectedClub);
      setMyData(myData.filter((club) => club.id !== selectedClub.id)); // Remove the deleted club from the state
      setOpenDialog(false); // Close the dialog
    } catch (error) {
      console.error("Error deleting club:", error);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Club Name",
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Avatar
              src={`http://127.0.0.1:8000${row.original.logo || "/media/default_logo.jpg"}`} // Use the provided base URL and default logo
              alt={`${row.original.name || "Club Logo"}`}
              sx={{
                width: 40,
                height: 40,
                borderRadius: '5%',
              }}
            />
            <Button
              variant="text"
              color="primary"
              onClick={() => navigate(`/clubs/${row.original.id}`)} // Navigate to the Club View page
              sx={{ textTransform: "none", textDecoration: "underline", color: 'primary.main' }} // Styling for the link
            >
              {row.original.name}
            </Button>
          </Box>
        ),
      },
      {
        accessorKey: "city",
        header: "City",
      },
    ],
    [navigate]
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
                onClick={() => navigate("/create-club")} // Navigate to the Create Club page
                sx={{ textTransform: 'none' }}
              >
                Create Club
              </Button>
            )}
            renderRowActions={({ row }) => (
              <Box sx={{ display: "flex", flexWrap: "nowrap", gap: "0rem" }}>
                <IconButton component={Link} to={`edit/${row.original.id}`}>
                  <EditIcon />
                </IconButton>
                <IconButton
                  onClick={() => {
                    setSelectedClub(row.original); // Set the selected club
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
        itemName={`the club "${selectedClub?.name}"`}
      />
    </div>
  );
};

export default Clubs;