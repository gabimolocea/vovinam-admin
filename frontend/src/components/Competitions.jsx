import React, { useEffect, useState } from "react";
import { Typography, Box, useTheme } from "@mui/material";
import { Link } from "react-router-dom";
import { MaterialReactTable } from "material-react-table";
import AxiosInstance from "./Axios";

const Competitions = () => {
  const theme = useTheme();
  const [competitionsData, setCompetitionsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const competitionsResponse = await AxiosInstance.get("/competitions/");
        setCompetitionsData(competitionsResponse.data); // Ensure the data includes start_date and place
      } catch (error) {
        console.error("Error fetching competitions:", error);
        setErrorMessage("Failed to fetch competitions. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <Typography>Loading competitions...</Typography>;
  }

  if (errorMessage) {
    return <Typography color="error">{errorMessage}</Typography>;
  }

  // Define columns for the Material React Table
  const columns = [
    {
      accessorKey: "name",
      header: "Competition Name",
      Cell: ({ cell }) => (
        <Link
          to={`/competition/${cell.row.original.id}`}
          style={{ textDecoration: "none", color: theme.palette.primary.main }}
        >
          {cell.getValue()}
        </Link>
      ),
    },
    {
      accessorKey: "start_date",
      header: "Date",
      Cell: ({ cell }) => {
        const formatDate = (date) => {
          const d = new Date(date);
          const day = String(d.getDate()).padStart(2, "0");
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const year = d.getFullYear();
          return `${day}.${month}.${year}`;
        };

        return <Typography>{formatDate(cell.getValue())}</Typography>;
      },
    },
    {
      accessorKey: "place",
      header: "Location",
      Cell: ({ cell }) => <Typography>{cell.getValue()}</Typography>,
    },
  ];

  return (
    <Box >


      <MaterialReactTable
        columns={columns}
        data={competitionsData}
        enableColumnFilters={false} // Disable column filters
        enableGlobalFilter={false} // Disable global search
        enableColumnOrdering={false} // Disable column ordering
        enableFullScreenToggle={false} // Disable fullscreen toggle
        enablePagination={false} // Disable pagination
        enableSorting={false} // Disable sorting
        enableRowActions={false} // Disable row actions
        enableDensityToggle={false} // Disable density toggle
        enableHiding={false} // Disable column hiding
        enableBottomToolbar={false} // Disable bottom toolbar
        enableTopToolbar={false} // Disable top toolbar
        enableRowSelection={false} // Disable row selection
        enableColumnActions={false} // Disable column actions
        muiTablePaperProps={{
          elevation: 0,
          sx: {
            boxShadow: 'none',
            border: 'none',
            backgroundColor: 'transparent'
          }
        }}
        muiTableBodyCellProps={({ cell }) => ({
          sx: {
            fontWeight: cell.column.id === "name" ? "bold" : "normal",
          },
        })}
      />
    </Box>
  );
};

export default Competitions;