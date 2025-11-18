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

        // Fetch categories for this competition
        const categoriesResponse = await AxiosInstance.get(`/categories/`);
        const competitionCategories = categoriesResponse.data.filter(
          cat => cat.competition === parseInt(competitionId)
        );
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Categories & Participants</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No categories found for this competition.
            </div>
          ) : (
            <Tabs defaultValue={`category-${categories[0]?.id}`} className="w-full">
              <TabsList className="w-full justify-start flex-wrap h-auto">
                {categories.map((category) => (
                  <TabsTrigger
                    key={category.id}
                    value={`category-${category.id}`}
                    className="flex items-center gap-2"
                  >
                    <div className={`w-2 h-2 rounded-full ${getCategoryTypeColor(category.type)}`} />
                    {category.name}
                    <Badge variant="secondary" className="ml-1">
                      {categoryAthletes[category.id]?.length || 0}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((category) => (
                <TabsContent key={category.id} value={`category-${category.id}`}>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getCategoryTypeColor(category.type)}>
                        {category.type}
                      </Badge>
                      {getGenderBadge(category.gender)}
                      {category.group && (
                        <Badge variant="outline">Group: {category.group}</Badge>
                      )}
                    </div>

                    {categoryAthletes[category.id]?.length > 0 ? (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rank</TableHead>
                              <TableHead>Athlete</TableHead>
                              <TableHead>Club</TableHead>
                              <TableHead>Grade</TableHead>
                              <TableHead className="text-right">Score</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryAthletes[category.id]
                              .sort((a, b) => (a.placement || 999) - (b.placement || 999))
                              .map((athlete, index) => (
                                <TableRow key={`${category.id}-${athlete.id}-${index}`}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getPlacementIcon(athlete.placement)}
                                      <span className="font-medium">
                                        {athlete.placement || '-'}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <Avatar className="rounded-[5%]">
                                        <AvatarImage
                                          src={athlete.profile_image && !athlete.profile_image.includes('default.png')
                                            ? `http://127.0.0.1:8000${athlete.profile_image}`
                                            : undefined}
                                          className="rounded-[5%]"
                                        />
                                        <AvatarFallback className="rounded-[5%] bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold">
                                          {getInitials(athlete.first_name, athlete.last_name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <Link
                                        to={`/athletes/${athlete.id}`}
                                        className="font-medium hover:underline"
                                      >
                                        {athlete.first_name} {athlete.last_name}
                                      </Link>
                                    </div>
                                  </TableCell>
                                  <TableCell>{athlete.club_name || "N/A"}</TableCell>
                                  <TableCell>
                                    {athlete.current_grade_details?.name || "N/A"}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {athlete.score !== null && athlete.score !== undefined
                                      ? athlete.score.toFixed(2)
                                      : '-'}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        athlete.status === 'approved'
                                          ? 'default'
                                          : athlete.status === 'pending'
                                          ? 'secondary'
                                          : 'destructive'
                                      }
                                    >
                                      {athlete.status || 'pending'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border rounded-md">
                        No athletes enrolled in this category yet.
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompetitionDetailsConverted;
