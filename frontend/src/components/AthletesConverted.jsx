import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Search, Plus, Edit, Trash2, Eye, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";
import DeleteDialog from "./DeleteDialog";
import { useAuth } from "../contexts/AuthContext";

const Athletes = () => {
  const { isAdmin } = useAuth();
  const [myData, setMyData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [grades, setGrades] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const GetData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch athletes
      const response = await AxiosInstance.get("athletes/");
      console.log("Athletes API Response:", response.data);

      // Fetch grades
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
        club: athlete.club?.name || "N/A",
        grade: gradesMap[athlete.current_grade] || "N/A",
        full_name: `${athlete.first_name} ${athlete.last_name}`,
      }));

      setMyData(transformedData);
      setFilteredData(transformedData);
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to load athletes data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    GetData();
  }, []);

  // Filter data based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredData(myData);
    } else {
      const filtered = myData.filter((athlete) =>
        athlete.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        athlete.club.toLowerCase().includes(searchTerm.toLowerCase()) ||
        athlete.grade.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredData(filtered);
    }
  }, [searchTerm, myData]);

  const handleDelete = async () => {
    try {
      await AxiosInstance.delete(`athletes/${selectedAthlete.id}/`);
      console.log("Deleted athlete:", selectedAthlete);
      
      const updatedData = myData.filter((athlete) => athlete.id !== selectedAthlete.id);
      setMyData(updatedData);
      setFilteredData(updatedData);
      setOpenDialog(false);
    } catch (error) {
      console.error("Error deleting athlete:", error);
      setError("Failed to delete athlete");
    }
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getStatusBadge = (athlete) => {
    // You can add logic here based on athlete status if available
    return <Badge variant="default">Active</Badge>;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading athletes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Athletes</h1>
          <p className="text-muted-foreground">
            Manage athlete registrations and profiles ({filteredData.length} athletes)
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/create-athlete")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Athlete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Athletes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by name, club, or grade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Athletes ({filteredData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <Alert>
              <AlertDescription>
                {searchTerm ? "No athletes found matching your search criteria." : "No athletes available."}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Athlete</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((athlete) => (
                    <TableRow key={athlete.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage 
                              src={athlete.profile_image ? `http://127.0.0.1:8000${athlete.profile_image}` : undefined}
                              alt={athlete.full_name}
                            />
                            <AvatarFallback>{getInitials(athlete.full_name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 h-auto text-left"
                              asChild
                            >
                              <Link to={`/athletes/${athlete.id}`}>
                                {athlete.full_name}
                              </Link>
                            </Button>
                            <p className="text-sm text-muted-foreground">
                              ID: {athlete.id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{athlete.club}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{athlete.grade}</Badge>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(athlete)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/athletes/${athlete.id}`} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/athletes/edit/${athlete.id}`} title="Edit Athlete">
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAthlete(athlete);
                                  setOpenDialog(true);
                                }}
                                title="Delete Athlete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onConfirm={handleDelete}
        itemName={selectedAthlete?.full_name}
      />
    </div>
  );
};

export default Athletes;