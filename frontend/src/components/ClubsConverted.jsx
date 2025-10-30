import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Search, Plus, Edit, Trash2, Eye, Loader2, Building } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";
import DeleteDialog from "./DeleteDialog";
import { useAuth } from "../contexts/AuthContext";

const Clubs = () => {
  const { isAdmin } = useAuth();
  const [myData, setMyData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const GetData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await AxiosInstance.get("clubs/");
      console.log("Clubs API Response:", response.data);

      const transformedData = response.data.map((club) => ({
        ...club,
        city: club.city ? club.city.name : "N/A",
      }));

      setMyData(transformedData);
      setFilteredData(transformedData);
    } catch (error) {
      console.error("Error fetching clubs data:", error);
      setError("Failed to load clubs data");
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
      const filtered = myData.filter((club) =>
        club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        club.city.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredData(filtered);
    }
  }, [searchTerm, myData]);

  const handleDelete = async () => {
    try {
      await AxiosInstance.delete(`clubs/${selectedClub.id}/`);
      console.log("Deleted club:", selectedClub);
      
      const updatedData = myData.filter((club) => club.id !== selectedClub.id);
      setMyData(updatedData);
      setFilteredData(updatedData);
      setOpenDialog(false);
    } catch (error) {
      console.error("Error deleting club:", error);
      setError("Failed to delete club");
    }
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading clubs...</span>
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
          <h1 className="text-3xl font-bold tracking-tight">Clubs</h1>
          <p className="text-muted-foreground">
            Manage club registrations and information ({filteredData.length} clubs)
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/create-club")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Club
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Clubs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by club name or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clubs ({filteredData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <Alert>
              <AlertDescription>
                {searchTerm ? "No clubs found matching your search criteria." : "No clubs available."}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Club</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((club) => (
                    <TableRow key={club.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar className="rounded-lg">
                            <AvatarImage 
                              src={club.logo ? `http://127.0.0.1:8000${club.logo}` : undefined}
                              alt={club.name}
                            />
                            <AvatarFallback className="rounded-lg">
                              <Building className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Button
                              variant="link"
                              className="p-0 h-auto text-left"
                              asChild
                            >
                              <Link to={`/clubs/${club.id}`}>
                                {club.name}
                              </Link>
                            </Button>
                            <p className="text-sm text-muted-foreground">
                              ID: {club.id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Badge variant="outline">{club.city}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">Active</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/clubs/${club.id}`} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/clubs/edit/${club.id}`} title="Edit Club">
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedClub(club);
                                  setOpenDialog(true);
                                }}
                                title="Delete Club"
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
        itemName={`the club "${selectedClub?.name}"`}
      />
    </div>
  );
};

export default Clubs;