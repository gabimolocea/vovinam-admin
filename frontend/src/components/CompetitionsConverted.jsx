import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Calendar, MapPin, Trophy, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import AxiosInstance from "./Axios";

const CompetitionsConverted = () => {
  const [competitionsData, setCompetitionsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await AxiosInstance.get("/competitions/");
        console.log("Competitions API Response:", response.data);
        setCompetitionsData(response.data);
      } catch (error) {
        console.error("Error fetching competitions:", error);
        setError("Failed to fetch competitions. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
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

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <CardTitle>Competitions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {competitionsData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No competitions found.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Competition Name</TableHead>
                    <TableHead className="font-semibold">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitionsData.map((competition) => (
                    <TableRow key={competition.id}>
                      <TableCell>
                        <Link
                          to={`/competition/${competition.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {competition.name}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(competition.start_date)}</TableCell>
                      <TableCell>{competition.place || "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompetitionsConverted;
