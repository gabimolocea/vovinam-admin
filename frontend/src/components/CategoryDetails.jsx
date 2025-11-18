import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { ArrowLeft, Loader2, Medal, Trophy, Users, Award } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AxiosInstance from "./Axios";

const CategoryDetails = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("enrolled");
  const [selectedRefereeScore, setSelectedRefereeScore] = useState(null);
  const [selectedMatchPenalties, setSelectedMatchPenalties] = useState(null);
  const [selectedPenalty, setSelectedPenalty] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [penaltyDrawerOpen, setPenaltyDrawerOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch category details
        const categoryResponse = await AxiosInstance.get(`/categories/${categoryId}/`);
        console.log("Category:", categoryResponse.data);
        setCategory(categoryResponse.data);

        // Fetch athletes for this category
        if (categoryResponse.data.type !== 'teams') {
          try {
            // Fetch enrolled athletes (basic enrollment from CategoryAthlete)
            const enrolledResponse = await AxiosInstance.get(`/category-athletes/?category=${categoryId}`);
            const enrolledList = Array.isArray(enrolledResponse.data) 
              ? enrolledResponse.data 
              : enrolledResponse.data.results || [];

            console.log(`Fetched ${enrolledList.length} enrolled athletes for category ${categoryId}`);

            // Fetch athlete scores (CategoryAthleteScore - includes scores and placement)
            let scoresMap = {};
            try {
              const scoresResponse = await AxiosInstance.get(`/category-athlete-score/?category=${categoryId}`);
              const scoresList = Array.isArray(scoresResponse.data) 
                ? scoresResponse.data 
                : scoresResponse.data.results || [];
              
              // Create a map of athlete ID to score data
              scoresList.forEach(scoreData => {
                const athleteId = typeof scoreData.athlete === 'object' 
                  ? scoreData.athlete.id 
                  : scoreData.athlete;
                scoresMap[athleteId] = {
                  score: scoreData.score,
                  placement: scoreData.placement,
                  status: scoreData.status
                };
              });
            } catch (err) {
              console.log("No scores found for this category:", err);
            }

            // Fetch full athlete details and merge with scores
            const athletePromises = enrolledList.map(async (enrollment) => {
              try {
                const athleteId = typeof enrollment.athlete === 'object' 
                  ? enrollment.athlete.id 
                  : enrollment.athlete;
                
                let athleteData;
                if (typeof enrollment.athlete === 'object' && enrollment.athlete !== null) {
                  athleteData = enrollment.athlete;
                } else {
                  const athleteResponse = await AxiosInstance.get(`/athletes/${athleteId}/`);
                  athleteData = athleteResponse.data;
                }

                // Merge with score data if available
                const scoreData = scoresMap[athleteId] || { score: null, placement: null, status: 'pending' };
                
                return { 
                  ...athleteData, 
                  weight: enrollment.weight,
                  ...scoreData
                };
              } catch (err) {
                console.error(`Error fetching athlete ${enrollment.athlete}:`, err);
                return null;
              }
            });

            const athletesData = await Promise.all(athletePromises);
            const validAthletes = athletesData.filter(a => a !== null);
            console.log(`Successfully loaded ${validAthletes.length} athletes for category ${categoryId}`);
            setAthletes(validAthletes);
          } catch (err) {
            console.error("Error fetching athletes:", err);
            setAthletes([]);
          }
        }

        // Fetch teams if it's a team category
        if (categoryResponse.data.type === 'teams') {
          try {
            // Get enrolled teams from category response (already includes scores from backend)
            const enrolledTeams = categoryResponse.data.teams || [];
            console.log(`Found ${enrolledTeams.length} enrolled teams in category response`);
            console.log('Teams data:', enrolledTeams);

            setTeams(enrolledTeams);
          } catch (err) {
            console.error("Error fetching teams:", err);
            setTeams([]);
          }
        }

        // Fetch matches for this category
        try {
          const matchesResponse = await AxiosInstance.get(`/matches/`);
          const allMatches = Array.isArray(matchesResponse.data)
            ? matchesResponse.data
            : matchesResponse.data.results || [];
          
          // Filter matches that belong to this category
          const categoryMatches = allMatches.filter(match => match.category === parseInt(categoryId));
          console.log("Category matches:", categoryMatches);
          setMatches(categoryMatches);
        } catch (err) {
          console.error("Error fetching matches:", err);
        }
      } catch (error) {
        console.error("Error fetching category details:", error);
        setError("Failed to fetch category details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [categoryId]);

  const getCategoryTypeColor = (type) => {
    switch (type) {
      case 'solo': return 'bg-blue-500 text-white';
      case 'teams': return 'bg-green-500 text-white';
      case 'fight': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getGenderBadge = (gender) => {
    const variants = {
      'male': 'bg-blue-100 text-blue-800',
      'female': 'bg-pink-100 text-pink-800',
      'mixt': 'bg-purple-100 text-purple-800'
    };
    return <Badge className={variants[gender] || ''}>{gender}</Badge>;
  };

  const getPlacementIcon = (placement) => {
    if (placement === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (placement === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (placement === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return null;
  };

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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

  if (!category) {
    return (
      <Alert className="m-6">
        <AlertDescription>Category not found.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{category.name}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge className={getCategoryTypeColor(category.type)}>
                {category.type}
              </Badge>
              {getGenderBadge(category.gender)}
              {category.group_name && (
                <Badge variant="outline">Group: {category.group_name}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Awards and Enrolled Athletes */}
      {category.type !== 'teams' && athletes.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className={`grid w-full ${category.type === 'fight' && matches.length > 0 ? 'grid-cols-3' : 'grid-cols-2'} max-w-2xl`}>
            <TabsTrigger value="enrolled" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Enrolled Athletes
              <Badge variant="secondary" className="ml-1">{athletes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="awards" className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Awards
              <Badge variant="secondary" className="ml-1">
                {[category.first_place, category.second_place, category.third_place].filter(Boolean).length}
              </Badge>
            </TabsTrigger>
            {category.type === 'fight' && matches.length > 0 && (
              <TabsTrigger value="matches" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Matches
                <Badge variant="secondary" className="ml-1">{matches.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Enrolled Athletes Tab */}
          <TabsContent value="enrolled">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>All Enrolled Athletes</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead>Grade</TableHead>
                      {category.type === 'fight' ? (
                        <TableHead className="text-right">Weight (kg)</TableHead>
                      ) : (
                        <TableHead className="text-right">Score</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {athletes
                      .sort((a, b) => {
                        const scoreA = a.score !== null && a.score !== undefined ? a.score : -1;
                        const scoreB = b.score !== null && b.score !== undefined ? b.score : -1;
                        return scoreB - scoreA;
                      })
                      .map((athlete, index) => (
                        <TableRow key={`${athlete.id}-${index}`}>
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
                          <TableCell>{athlete.club?.name || athlete.club_name || "N/A"}</TableCell>
                          <TableCell>
                            {athlete.current_grade_details?.name || athlete.current_grade?.name || "N/A"}
                          </TableCell>
                          {category.type === 'fight' ? (
                            <TableCell className="text-right font-mono">
                              {athlete.weight !== null && athlete.weight !== undefined
                                ? athlete.weight
                                : '-'}
                            </TableCell>
                          ) : (
                            <TableCell className="text-right font-mono">
                              {athlete.score !== null && athlete.score !== undefined
                                ? athlete.score.toFixed(2)
                                : '-'}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Awards Tab */}
          <TabsContent value="awards">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <CardTitle>Award Winners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {(category.first_place || category.second_place || category.third_place) ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Place</TableHead>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Club</TableHead>
                        <TableHead>Grade</TableHead>
                        {category.type !== 'fight' && (
                          <TableHead className="text-right">Score</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.first_place && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-yellow-500" />
                              <span className="font-medium">1st Place</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="rounded-[5%]">
                                <AvatarImage
                                  src={category.first_place.profile_image && !category.first_place.profile_image.includes('default.png')
                                    ? `http://127.0.0.1:8000${category.first_place.profile_image}`
                                    : undefined}
                                  className="rounded-[5%]"
                                />
                                <AvatarFallback className="rounded-[5%] bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold">
                                  {getInitials(category.first_place.first_name, category.first_place.last_name)}
                                </AvatarFallback>
                              </Avatar>
                              <Link
                                to={`/athletes/${category.first_place.id}`}
                                className="font-medium hover:underline"
                              >
                                {category.first_place.first_name} {category.first_place.last_name}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>{category.first_place.club?.name || "N/A"}</TableCell>
                          <TableCell>
                            {category.first_place.current_grade?.name || "N/A"}
                          </TableCell>
                          {category.type !== 'fight' && (
                            <TableCell className="text-right font-mono">
                              {/* Find score from athletes list */}
                              {(() => {
                                const athleteScore = athletes.find(a => a.id === category.first_place.id);
                                return athleteScore?.score !== null && athleteScore?.score !== undefined
                                  ? athleteScore.score.toFixed(2)
                                  : '-';
                              })()}
                            </TableCell>
                          )}
                        </TableRow>
                      )}
                      {category.second_place && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-gray-400" />
                              <span className="font-medium">2nd Place</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="rounded-[5%]">
                                <AvatarImage
                                  src={category.second_place.profile_image && !category.second_place.profile_image.includes('default.png')
                                    ? `http://127.0.0.1:8000${category.second_place.profile_image}`
                                    : undefined}
                                  className="rounded-[5%]"
                                />
                                <AvatarFallback className="rounded-[5%] bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold">
                                  {getInitials(category.second_place.first_name, category.second_place.last_name)}
                                </AvatarFallback>
                              </Avatar>
                              <Link
                                to={`/athletes/${category.second_place.id}`}
                                className="font-medium hover:underline"
                              >
                                {category.second_place.first_name} {category.second_place.last_name}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>{category.second_place.club?.name || "N/A"}</TableCell>
                          <TableCell>
                            {category.second_place.current_grade?.name || "N/A"}
                          </TableCell>
                          {category.type !== 'fight' && (
                            <TableCell className="text-right font-mono">
                              {(() => {
                                const athleteScore = athletes.find(a => a.id === category.second_place.id);
                                return athleteScore?.score !== null && athleteScore?.score !== undefined
                                  ? athleteScore.score.toFixed(2)
                                  : '-';
                              })()}
                            </TableCell>
                          )}
                        </TableRow>
                      )}
                      {category.third_place && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-amber-600" />
                              <span className="font-medium">3rd Place</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="rounded-[5%]">
                                <AvatarImage
                                  src={category.third_place.profile_image && !category.third_place.profile_image.includes('default.png')
                                    ? `http://127.0.0.1:8000${category.third_place.profile_image}`
                                    : undefined}
                                  className="rounded-[5%]"
                                />
                                <AvatarFallback className="rounded-[5%] bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold">
                                  {getInitials(category.third_place.first_name, category.third_place.last_name)}
                                </AvatarFallback>
                              </Avatar>
                              <Link
                                to={`/athletes/${category.third_place.id}`}
                                className="font-medium hover:underline"
                              >
                                {category.third_place.first_name} {category.third_place.last_name}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell>{category.third_place.club?.name || "N/A"}</TableCell>
                          <TableCell>
                            {category.third_place.current_grade?.name || "N/A"}
                          </TableCell>
                          {category.type !== 'fight' && (
                            <TableCell className="text-right font-mono">
                              {(() => {
                                const athleteScore = athletes.find(a => a.id === category.third_place.id);
                                return athleteScore?.score !== null && athleteScore?.score !== undefined
                                  ? athleteScore.score.toFixed(2)
                                  : '-';
                              })()}
                            </TableCell>
                          )}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    No awards assigned yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Matches Tab for Fight Categories */}
          {category.type === 'fight' && (
            <TabsContent value="matches">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    <CardTitle>Matches</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Red Corner</TableHead>
                        <TableHead>Blue Corner</TableHead>
                        <TableHead>Referee Scores (Total Score)</TableHead>
                        <TableHead>Central Referee</TableHead>
                        <TableHead>Winner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((match, index) => {
                        const totalRedPenalties = match.central_penalties_red?.reduce((sum, p) => sum + p.points, 0) || 0;
                        const totalBluePenalties = match.central_penalties_blue?.reduce((sum, p) => sum + p.points, 0) || 0;

                        return (
                          <TableRow key={match.id || index}>
                            <TableCell>
                              <Badge variant="outline">{match.match_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full" />
                                <span className="text-red-600 font-medium">{match.red_corner_full_name || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                                <span className="text-blue-600 font-medium">{match.blue_corner_full_name || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {match.referee_scores && match.referee_scores.length > 0 ? (
                                <div className="space-y-2">
                                  {match.referee_scores.map((refScore, idx) => (
                                    <Button
                                      key={idx}
                                      variant="outline"
                                      size="sm"
                                      className="w-full justify-between"
                                      onClick={() => {
                                        setSelectedRefereeScore(refScore);
                                        setSelectedMatchPenalties({
                                          red: match.central_penalties_red,
                                          blue: match.central_penalties_blue
                                        });
                                        setDrawerOpen(true);
                                      }}
                                    >
                                      <span>{refScore.referee_name}</span>
                                      <div className="font-mono">
                                        <span className="text-red-600">{refScore.total_red}</span>
                                        <span className="mx-1">-</span>
                                        <span className="text-blue-600">{refScore.total_blue}</span>
                                      </div>
                                    </Button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No scores yet</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-2">
                                {totalRedPenalties !== 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`w-full ${totalRedPenalties < 0 ? 'text-red-600 border-red-300' : 'text-green-600 border-green-300'}`}
                                    onClick={() => {
                                      setSelectedPenalty({ corner: 'Red', penalties: match.central_penalties_red });
                                      setPenaltyDrawerOpen(true);
                                    }}
                                  >
                                    Red: {totalRedPenalties > 0 ? '+' : ''}{totalRedPenalties}
                                  </Button>
                                )}
                                {totalBluePenalties !== 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`w-full ${totalBluePenalties < 0 ? 'text-red-600 border-red-300' : 'text-green-600 border-green-300'}`}
                                    onClick={() => {
                                      setSelectedPenalty({ corner: 'Blue', penalties: match.central_penalties_blue });
                                      setPenaltyDrawerOpen(true);
                                    }}
                                  >
                                    Blue: {totalBluePenalties > 0 ? '+' : ''}{totalBluePenalties}
                                  </Button>
                                )}
                                {totalRedPenalties === 0 && totalBluePenalties === 0 && (
                                  <span className="text-muted-foreground text-xs">None</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {match.winner_name ? (
                                <div className="flex items-center gap-1">
                                  <Medal className="h-4 w-4 text-yellow-500" />
                                  <span
                                    className={`font-medium ${
                                      match.winner === match.red_corner
                                        ? 'text-red-600'
                                        : match.winner === match.blue_corner
                                        ? 'text-blue-600'
                                        : ''
                                    }`}
                                  >
                                    {match.winner_name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">TBD</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Enrolled Teams Section */}
      {category.type === 'teams' && teams.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="enrolled" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Enrolled Teams
              <Badge variant="secondary" className="ml-1">{teams.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="awards" className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Awards
              <Badge variant="secondary" className="ml-1">
                {[category.first_place_team, category.second_place_team, category.third_place_team].filter(Boolean).length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Enrolled Teams Tab */}
          <TabsContent value="enrolled">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>All Enrolled Teams</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Name</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams
                      .sort((a, b) => {
                        const scoreA = a.score !== null && a.score !== undefined ? a.score : -1;
                        const scoreB = b.score !== null && b.score !== undefined ? b.score : -1;
                        return scoreB - scoreA;
                      })
                      .map((team, index) => (
                        <TableRow key={team.id || index}>
                          <TableCell className="font-medium">{team.name}</TableCell>
                          <TableCell>{team.club_name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{team.members?.length || 0} athletes</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {team.score !== null && team.score !== undefined
                              ? team.score.toFixed(2)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Awards Tab for Teams */}
          <TabsContent value="awards">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <CardTitle>Award Winners</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {(category.first_place_team || category.second_place_team || category.third_place_team) ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Place</TableHead>
                        <TableHead>Team Name</TableHead>
                        <TableHead>Club</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.first_place_team && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-yellow-500" />
                              <span className="font-medium">1st Place</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{category.first_place_team.name}</TableCell>
                          <TableCell>{category.first_place_team.club_name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {category.first_place_team.members?.length || 0} athletes
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {category.first_place_team.score !== null && category.first_place_team.score !== undefined
                              ? category.first_place_team.score.toFixed(2)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      )}
                      {category.second_place_team && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-gray-400" />
                              <span className="font-medium">2nd Place</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{category.second_place_team.name}</TableCell>
                          <TableCell>{category.second_place_team.club_name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {category.second_place_team.members?.length || 0} athletes
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {category.second_place_team.score !== null && category.second_place_team.score !== undefined
                              ? category.second_place_team.score.toFixed(2)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      )}
                      {category.third_place_team && (
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Medal className="h-5 w-5 text-amber-600" />
                              <span className="font-medium">3rd Place</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{category.third_place_team.name}</TableCell>
                          <TableCell>{category.third_place_team.club_name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {category.third_place_team.members?.length || 0} athletes
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {category.third_place_team.score !== null && category.third_place_team.score !== undefined
                              ? category.third_place_team.score.toFixed(2)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">
                    No awards assigned yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Empty State */}
      {category.type !== 'teams' && athletes.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No athletes enrolled in this category yet.
          </CardContent>
        </Card>
      )}

      {category.type === 'teams' && teams.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No teams enrolled in this category yet.
          </CardContent>
        </Card>
      )}

      {/* Referee Score Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          {selectedRefereeScore && (
            <>
              <SheetHeader>
                <SheetTitle>Scores by {selectedRefereeScore.referee_name}</SheetTitle>
                <SheetDescription>
                  Detailed point breakdown for each round.
                </SheetDescription>
              </SheetHeader>
              <div className="py-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Round</TableHead>
                      <TableHead className="text-center text-red-600">Red Score</TableHead>
                      <TableHead className="text-center text-blue-600">Blue Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRefereeScore.rounds.map((round, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">Round {round.round}</TableCell>
                        <TableCell className="text-center font-mono">{round.red}</TableCell>
                        <TableCell className="text-center font-mono">{round.blue}</TableCell>
                      </TableRow>
                    ))}
                    {selectedMatchPenalties && (
                      <TableRow className="border-t-2">
                        <TableCell className="font-medium">Central Referee</TableCell>
                        <TableCell className="text-center font-mono">
                          {(() => {
                            const totalRed = selectedMatchPenalties.red?.reduce((sum, p) => sum + p.points, 0) || 0;
                            return totalRed !== 0 ? (totalRed > 0 ? `+${totalRed}` : totalRed) : '0';
                          })()}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {(() => {
                            const totalBlue = selectedMatchPenalties.blue?.reduce((sum, p) => sum + p.points, 0) || 0;
                            return totalBlue !== 0 ? (totalBlue > 0 ? `+${totalBlue}` : totalBlue) : '0';
                          })()}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-center font-mono">{selectedRefereeScore.total_red}</TableCell>
                      <TableCell className="text-center font-mono">{selectedRefereeScore.total_blue}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Central Penalty Details Drawer */}
      <Sheet open={penaltyDrawerOpen} onOpenChange={setPenaltyDrawerOpen}>
        <SheetContent>
          {selectedPenalty && (
            <>
              <SheetHeader>
                <SheetTitle>Central Penalties: {selectedPenalty.corner} Corner</SheetTitle>
                <SheetDescription>
                  Detailed breakdown of central penalties.
                </SheetDescription>
              </SheetHeader>
              <div className="py-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Points</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Round</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPenalty.penalties.map((penalty, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">-{penalty.points}</TableCell>
                        <TableCell>{penalty.metadata?.reason || 'N/A'}</TableCell>
                        <TableCell className="text-center">{penalty.metadata?.round || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default CategoryDetails;
