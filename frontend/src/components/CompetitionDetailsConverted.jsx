import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Calendar, MapPin, Trophy, Users, ArrowLeft, Loader2, Medal } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";

const CompetitionDetailsConverted = () => {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  const [competition, setCompetition] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryAthletes, setCategoryAthletes] = useState({});
  const [eventParticipations, setEventParticipations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch competition details
        const compResponse = await AxiosInstance.get(`/competitions/${competitionId}/`);
        console.log("Competition:", compResponse.data);
        setCompetition(compResponse.data);

        // Fetch all categories first
        const categoriesResponse = await AxiosInstance.get(`/categories/`);
        
        // Get categories - first check if they're in the competition response
        let competitionCategories = [];
        
        if (compResponse.data.categories && compResponse.data.categories.length > 0) {
          // Use category IDs from competition response
          const categoryIds = compResponse.data.categories.map(cat => cat.id);
          competitionCategories = categoriesResponse.data.filter(
            cat => categoryIds.includes(cat.id)
          );
        } else {
          // Fallback: filter by competition or event
          competitionCategories = categoriesResponse.data.filter(
            cat => cat.competition === parseInt(competitionId)
          );
          
          // Also check for categories linked to events
          const eventIds = competitionCategories.map(cat => cat.event).filter(Boolean);
          if (eventIds.length > 0) {
            const eventCategories = categoriesResponse.data.filter(
              cat => cat.event && eventIds.includes(cat.event)
            );
            const categoryIds = new Set(competitionCategories.map(cat => cat.id));
            eventCategories.forEach(cat => {
              if (!categoryIds.has(cat.id)) {
                competitionCategories.push(cat);
              }
            });
          }
        }
        
        console.log("Categories:", competitionCategories);
        setCategories(competitionCategories);

        // Fetch athletes for each category
        const athletesData = {};
        for (const category of competitionCategories) {
          try {
            // Fetch category-athlete relations
            const categoryAthletesResponse = await AxiosInstance.get(`/category-athlete-score/?category=${category.id}`);
            
            // Handle both array and paginated response formats
            let categoryAthletesList = Array.isArray(categoryAthletesResponse.data) 
              ? categoryAthletesResponse.data 
              : categoryAthletesResponse.data.results || [];
            
            console.log(`Category ${category.id} athletes:`, categoryAthletesList);
            
            // Process athlete data
            const athletePromises = categoryAthletesList.map(async (catAthlete) => {
              try {
                // Check if athlete is already an object with full data or just an ID
                if (typeof catAthlete.athlete === 'object' && catAthlete.athlete !== null) {
                  // Athlete data is already included
                  return {
                    ...catAthlete.athlete,
                    score: catAthlete.score,
                    placement: catAthlete.placement,
                    status: catAthlete.status
                  };
                } else {
                  // Athlete is just an ID, fetch the details
                  const athleteResponse = await AxiosInstance.get(`/athletes/${catAthlete.athlete}/`);
                  return {
                    ...athleteResponse.data,
                    score: catAthlete.score,
                    placement: catAthlete.placement,
                    status: catAthlete.status
                  };
                }
              } catch (err) {
                console.error(`Error processing athlete:`, catAthlete, err);
                return null;
              }
            });

            const athletes = await Promise.all(athletePromises);
            athletesData[category.id] = athletes.filter(a => a !== null);
          } catch (err) {
            console.error(`Error fetching athletes for category ${category.id}:`, err);
            athletesData[category.id] = [];
          }
        }
        
        setCategoryAthletes(athletesData);

        // Fetch event participations if any category has an event ID
        const eventId = categoriesResponse.data.find(cat => cat.event)?.event;
        if (eventId) {
          try {
            const participationsResponse = await AxiosInstance.get(`/seminar-submissions/?event=${eventId}`);
            const participationsList = Array.isArray(participationsResponse.data)
              ? participationsResponse.data
              : participationsResponse.data.results || [];
            console.log("Event participations:", participationsList);
            setEventParticipations(participationsList);
          } catch (err) {
            console.error("Error fetching event participations:", err);
          }
        } else {
          console.log("No event ID found in categories");
        }
      } catch (error) {
        console.error("Error fetching competition details:", error);
        setError("Failed to fetch competition details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [competitionId]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getCategoryTypeColor = (type) => {
    switch (type) {
      case 'solo': return 'bg-blue-500';
      case 'teams': return 'bg-green-500';
      case 'fight': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getGenderBadge = (gender) => {
    switch (gender) {
      case 'male': return <Badge variant="outline" className="bg-blue-50">Male</Badge>;
      case 'female': return <Badge variant="outline" className="bg-pink-50">Female</Badge>;
      case 'mixt': return <Badge variant="outline" className="bg-purple-50">Mixt</Badge>;
      default: return <Badge variant="outline">{gender}</Badge>;
    }
  };

  const getPlacementIcon = (placement) => {
    if (placement === 1) return <Medal className="h-4 w-4 text-yellow-500" />;
    if (placement === 2) return <Medal className="h-4 w-4 text-gray-400" />;
    if (placement === 3) return <Medal className="h-4 w-4 text-amber-700" />;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!competition) {
    return (
      <Alert className="m-6">
        <AlertDescription>Competition not found.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/competitions')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Competitions
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{competition.name}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {formatDate(competition.start_date)}
                  {competition.end_date && ` - ${formatDate(competition.end_date)}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{competition.place || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Categories and Event Participants */}
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Categories
            <Badge variant="secondary" className="ml-1">
              {categories.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="event-participants" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Event Participants
            <Badge variant="secondary" className="ml-1">
              {eventParticipations.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Categories Tab Content */}
        <TabsContent value="categories">
          {categories.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map(category => {
                    const athleteCount = categoryAthletes[category.id]?.length || 0;
                    const teamCount = category.teams?.length || 0;
                    
                    return (
                      <Card key={category.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <CardTitle className="text-base">{category.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getCategoryTypeColor(category.type)}>
                              {category.type}
                            </Badge>
                            {getGenderBadge(category.gender)}
                          </div>
                          
                          <div className="space-y-2">
                            {category.type === 'teams' ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Enrolled Teams:</span>
                                <Badge variant="secondary">{teamCount}</Badge>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Enrolled Athletes:</span>
                                <Badge variant="secondary">{athleteCount}</Badge>
                              </div>
                            )}
                          </div>

                          <Link to={`/category/${category.id}`}>
                            <Button variant="outline" className="w-full mt-2">
                              View Details
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                No categories found for this competition.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Event Participants Tab Content */}
        <TabsContent value="event-participants">
          {eventParticipations.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted Date</TableHead>
                      <TableHead>Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventParticipations.map((participation, index) => (
                      <TableRow key={`participation-${participation.id || index}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="rounded-[5%]">
                              <AvatarImage
                                src={participation.athlete_details?.profile_image}
                                alt={`${participation.athlete_details?.first_name} ${participation.athlete_details?.last_name}`}
                              />
                              <AvatarFallback className="rounded-[5%] bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                {participation.athlete_details?.first_name?.[0]}
                                {participation.athlete_details?.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <Link
                              to={`/athletes/${participation.athlete}`}
                              className="font-medium hover:underline"
                            >
                              {participation.athlete_details?.first_name} {participation.athlete_details?.last_name}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>{participation.athlete_details?.club_name || "N/A"}</TableCell>
                        <TableCell>
                          {participation.athlete_details?.current_grade_details?.name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              participation.status === 'approved'
                                ? 'default'
                                : participation.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {participation.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {participation.submitted_date
                            ? new Date(participation.submitted_date).toLocaleDateString()
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {participation.participation_certificate && (
                              <a
                                href={participation.participation_certificate}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Certificate
                              </a>
                            )}
                            {participation.participation_document && (
                              <a
                                href={participation.participation_document}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Document
                              </a>
                            )}
                            {!participation.participation_certificate && !participation.participation_document && (
                              <span className="text-xs text-muted-foreground">No documents</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                No event participants found.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompetitionDetailsConverted;
