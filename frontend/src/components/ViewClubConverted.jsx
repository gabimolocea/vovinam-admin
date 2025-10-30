import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Building2Icon, Edit3Icon, ArrowLeftIcon, MapPinIcon, PhoneIcon, GlobeIcon, UserIcon } from "lucide-react";

import AxiosInstance from "./Axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";

const ViewClubConverted = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchClub = async () => {
      try {
        setLoading(true);
        const response = await AxiosInstance.get(`clubs/${id}/`);
        setClub(response.data);
      } catch (error) {
        console.error("Error fetching club:", error);
        setErrorMessage("Failed to load club data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchClub();
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

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Coach
            </p>
            <p className="text-lg">{club.coach || "N/A"}</p>
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

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>
            Club metrics and activity
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl text-blue-600">{club.athlete_count || 0}</p>
            <p className="text-sm text-gray-600">Athletes</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl text-green-600">{club.competition_count || 0}</p>
            <p className="text-sm text-gray-600">Competitions</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl text-purple-600">{club.established_year || "N/A"}</p>
            <p className="text-sm text-gray-600">Established</p>
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
    </div>
  );
};

export default ViewClubConverted;