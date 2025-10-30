import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, TrendingUp, TrendingDown, Users, Award, Building, BarChart3 } from "lucide-react";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement } from "chart.js";
import { Bar, Pie, Line, Bubble } from "react-chartjs-2";
import AxiosInstance from "./Axios";
import "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { getClubNameForAthlete } from "../utils/helpers";

// Register required Chart.js components
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ChartDataLabels, ArcElement);

const Dashboard = () => {
  const [clubsData, setClubsData] = useState([]);
  const [athletesData, setAthletesData] = useState([]);
  const [annualVisaData, setAnnualVisaData] = useState([]);
  const [competitionsData, setCompetitionsData] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState("");
  const [teamsData, setTeamsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          clubsResponse,
          athletesResponse,
          annualVisaResponse,
          competitionsResponse,
          categoriesResponse,
          teamsResponse
        ] = await Promise.all([
          AxiosInstance.get("/clubs/"),
          AxiosInstance.get("/athletes/"),
          AxiosInstance.get("/annual-visas/"),
          AxiosInstance.get("/competitions/"),
          AxiosInstance.get("/categories/"),
          AxiosInstance.get("/teams/")
        ]);

        // Aggregate data for clubs
        const clubsWithAggregatedData = clubsResponse.data.map((club) => {
          const clubAthletes = athletesResponse.data.filter((athlete) => athlete.club === club.id);

          const validVisas = clubAthletes.filter((athlete) =>
            annualVisaResponse.data.some(
              (visa) => visa.athlete === athlete.id && visa.is_valid === true && visa.visa_status === "available"
            )
          );

          const expiredVisas = clubAthletes.filter((athlete) =>
            annualVisaResponse.data.some(
              (visa) => visa.athlete === athlete.id && visa.is_valid === false && visa.visa_status === "expired"
            )
          );

          return {
            ...club,
            athlete_count: clubAthletes.length,
            valid_visa_count: validVisas.length,
            expired_visa_count: expiredVisas.length,
          };
        });

        setClubsData(clubsWithAggregatedData);
        setAthletesData(athletesResponse.data);
        setAnnualVisaData(annualVisaResponse.data);
        setCompetitionsData(competitionsResponse.data);
        setCategoriesData(categoriesResponse.data);
        setTeamsData(teamsResponse.data);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter data based on selected competition
  const filteredData = useMemo(() => {
    if (!selectedCompetition || !competitionsData.length || !categoriesData.length) return [];
    
    const competition = competitionsData.find((comp) => comp.id === parseInt(selectedCompetition));
    if (!competition) return [];

    return categoriesData.map((category) => {
      if (category.competition === competition.id) {
        if (category.category_type === "individual") {
          return {
            categoryName: category.name,
            type: "individual",
            athletes: category.athletes?.map((athleteId) => {
              const athlete = athletesData.find((a) => a.id === athleteId);
              return athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown";
            }) || [],
          };
        } else if (category.category_type === "team") {
          return {
            categoryName: category.name,
            type: "team",
            teams: category.teams?.map((teamId) => {
              const team = teamsData.find((t) => t.id === teamId);
              const firstAthleteId = team?.members?.[0]?.athlete?.id;
              const athlete = athletesData.find((a) => a.id === firstAthleteId);
              const firstAthleteClub = athlete?.clubDetails?.name || "Unknown Club";
              return `${team?.name || "Unknown Team"} (${firstAthleteClub})`;
            }) || [],
          };
        }
      }
      return null;
    }).filter((category) => category !== null);
  }, [selectedCompetition, competitionsData, categoriesData, athletesData, clubsData, teamsData]);

  const totalCategories = useMemo(() => filteredData.length, [filteredData]);
  const totalUniqueAthletes = useMemo(() => {
    const uniqueAthletes = new Set();
    filteredData.forEach((category) => {
      if (category.athletes) {
        category.athletes.forEach((athlete) => uniqueAthletes.add(athlete));
      }
      if (category.teams) {
        category.teams.forEach((team) => uniqueAthletes.add(team));
      }
    });
    return uniqueAthletes.size;
  }, [filteredData]);

  // Chart configurations
  const clubAthleteChartData = {
    labels: clubsData.map((club) => club.name),
    datasets: [
      {
        label: "Number of Athletes",
        data: clubsData.map((club) => club.athlete_count),
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 1,
      },
    ],
  };

  const visaStatusChartData = {
    labels: ["Valid Visas", "Expired Visas"],
    datasets: [
      {
        data: [
          clubsData.reduce((sum, club) => sum + club.valid_visa_count, 0),
          clubsData.reduce((sum, club) => sum + club.expired_visa_count, 0),
        ],
        backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(239, 68, 68, 0.8)"],
        borderColor: ["rgba(34, 197, 94, 1)", "rgba(239, 68, 68, 1)"],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: false,
      },
    },
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading dashboard...</span>
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your martial arts organization</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clubs</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{clubsData.length}</div>
            <p className="text-xs text-muted-foreground">Active clubs registered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Athletes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{athletesData.length}</div>
            <p className="text-xs text-muted-foreground">Registered athletes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valid Visas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {clubsData.reduce((sum, club) => sum + club.valid_visa_count, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Current valid visas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Competitions</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{competitionsData.length}</div>
            <p className="text-xs text-muted-foreground">Total competitions</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Athletes per Club</CardTitle>
          </CardHeader>
          <CardContent>
            {clubsData.length > 0 ? (
              <Bar data={clubAthleteChartData} options={chartOptions} />
            ) : (
              <p className="text-center text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visa Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {clubsData.length > 0 ? (
              <Pie data={visaStatusChartData} options={chartOptions} />
            ) : (
              <p className="text-center text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Competition Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Competition Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Select Competition:</label>
            <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose a competition" />
              </SelectTrigger>
              <SelectContent>
                {competitionsData.map((competition) => (
                  <SelectItem key={competition.id} value={competition.id.toString()}>
                    {competition.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCompetition && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{totalCategories}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Participants</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{totalUniqueAthletes}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="default">Active</Badge>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Competition Categories Table */}
      {selectedCompetition && filteredData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Competition Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Participants</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((category, index) => (
                    <TableRow key={index}>
                      <TableCell>{category.categoryName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{category.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {category.athletes?.map((athlete, i) => (
                            <div key={i} className="text-sm">{athlete}</div>
                          ))}
                          {category.teams?.map((team, i) => (
                            <div key={i} className="text-sm">{team}</div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;