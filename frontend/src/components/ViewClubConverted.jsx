import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Building2Icon, Edit3Icon, ArrowLeftIcon, MapPinIcon, PhoneIcon, GlobeIcon, UserIcon, UsersIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const ViewClubConverted = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [club, setClub] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [grades, setGrades] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchClubData = async () => {
      try {
        setLoading(true);
        
        // Fetch club, athletes, and grades in parallel
        const [clubResponse, athletesResponse, gradesResponse] = await Promise.all([
          AxiosInstance.get(`clubs/${id}/`),
          AxiosInstance.get("athletes/"),
          AxiosInstance.get("grades/")
        ]);
        
        setClub(clubResponse.data);
        
        // Build grades lookup
        const gradesMap = gradesResponse.data.reduce((acc, grade) => {
          acc[grade.id] = grade.name;
          return acc;
        }, {});
        setGrades(gradesMap);
        
        // Filter athletes by club (club is an object with id and name)
        const clubAthletes = athletesResponse.data.filter(
          (athlete) => athlete.club?.id === parseInt(id)
        );
        setAthletes(clubAthletes);
        
      } catch (error) {
        console.error("Error fetching club data:", error);
        setErrorMessage("Failed to load club data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchClubData();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading club data...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !club) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {errorMessage || "Club not found."}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate("/clubs")} variant="outline">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Clubs
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2Icon className="h-8 w-8 text-blue-600" />
            {club.name}
          </h1>
          <p className="text-gray-600">Club Profile</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/clubs")} variant="outline">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={() => navigate(`/clubs/edit/${id}`)}>
            <Edit3Icon className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Club Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2Icon className="h-5 w-5" />
            Club Information
          </CardTitle>
          <CardDescription>
            Basic information about the club
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Building2Icon className="h-4 w-4" />
              Club Name
            </p>
            <p className="text-lg">{club.name}</p>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <MapPinIcon className="h-4 w-4" />
              City
            </p>
            <p className="text-lg">{club.city?.name || club.city || "N/A"}</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <MapPinIcon className="h-4 w-4" />
              Address
            </p>
            <p className="text-lg">{club.address || "N/A"}</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Coaches
            </p>
            {club.coaches && club.coaches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {club.coaches.map((coach) => (
                  <Badge key={coach.id} variant="secondary">
                    {coach.first_name} {coach.last_name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-lg">No coaches assigned</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <PhoneIcon className="h-4 w-4" />
              Mobile Number
            </p>
            <p className="text-lg">{club.mobile_number || "N/A"}</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <GlobeIcon className="h-4 w-4" />
              Website
            </p>
            {club.website ? (
              <a 
                href={club.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-lg text-blue-600 hover:text-blue-800 underline"
              >
                {club.website}
              </a>
            ) : (
              <p className="text-lg text-gray-500">N/A</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>
            How to get in touch with the club
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <PhoneIcon className="h-5 w-5 text-gray-500" />
            <div>
              <p>Phone</p>
              <p className="text-gray-600">{club.mobile_number || "Not provided"}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <GlobeIcon className="h-5 w-5 text-gray-500" />
            <div>
              <p>Website</p>
              {club.website ? (
                <a 
                  href={club.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  {club.website}
                </a>
              ) : (
                <p className="text-gray-600">Not provided</p>
              )}
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <MapPinIcon className="h-5 w-5 text-gray-500 mt-1" />
            <div>
              <p>Address</p>
              <p className="text-gray-600">{club.address || "Not provided"}</p>
              <p className="text-sm text-gray-500">{club.city?.name || club.city}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Athletes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            Athletes
          </CardTitle>
          <CardDescription>
            Athletes registered with this club
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletes.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Date Joined</TableHead>
                    <TableHead>Annual Visa</TableHead>
                    <TableHead>Medical Visa</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {athletes.map((athlete) => (
                    <TableRow key={athlete.id}>
                      <TableCell className="font-medium">
                        {athlete.first_name} {athlete.last_name}
                      </TableCell>
                      <TableCell>{grades[athlete.current_grade] || "N/A"}</TableCell>
                      <TableCell>{athlete.registered_date || "N/A"}</TableCell>
                      <TableCell>
                        {athlete.annual_visa ? (
                          <Badge variant="success">{athlete.annual_visa}</Badge>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {athlete.medical_visa ? (
                          <Badge variant="success">{athlete.medical_visa}</Badge>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/athletes/${athlete.id}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No athletes registered with this club yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewClubConverted;