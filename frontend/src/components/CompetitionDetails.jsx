import React, { useEffect, useState, useRef } from "react";
import { Typography, Box, IconButton, Tabs, Tab, Menu, MenuItem, useTheme } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { Link, useParams } from "react-router-dom";
import { MaterialReactTable } from "material-react-table";
import AxiosInstance from "./Axios";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as fontkit from "fontkit"; // Import fontkit for custom font support
import PrintIcon from "@mui/icons-material/Print";
import PlaceIcon from "@mui/icons-material/Place";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PeopleIcon from "@mui/icons-material/People";
import CategoryIcon from "@mui/icons-material/Category";
import * as d3 from "d3";

export const D3BracketTree = ({ rounds }) => {
  const svgRef = useRef();
  const theme = useTheme();

  useEffect(() => {
    if (!rounds || rounds.length === 0) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous content

    const width = 800;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    const treeData = {
      name: "Tournament",
      children: rounds.map((round) => ({
        name: round.title,
        children: round.matches.map((match) => ({
          name: `${match.teams[0].name} vs ${match.teams[1].name}`,
          children: [
            { name: `${match.teams[0].name} (${match.teams[0].score})` },
            { name: `${match.teams[1].name} (${match.teams[1].score})` },
          ],
        })),
      })),
    };

    const root = d3.hierarchy(treeData);

    const treeLayout = d3.tree().size([width - margin.left - margin.right, height - margin.top - margin.bottom]);
    treeLayout(root);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Links
    g.selectAll(".link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", d3.linkHorizontal().x((d) => d.y).y((d) => d.x))
      .style("fill", "none")
      .style("stroke", theme.palette.divider)
      .style("stroke-width", 2);

    // Nodes
    const nodes = g.selectAll(".node").data(root.descendants()).enter().append("g").attr("class", "node").attr("transform", (d) => `translate(${d.y},${d.x})`);

    nodes
      .append("circle")
      .attr("r", 5)
      .style("fill", theme.palette.primary.main);

    nodes
      .append("text")
      .attr("dy", "0.35em")
      .attr("x", (d) => (d.children ? -10 : 10))
      .style("text-anchor", (d) => (d.children ? "end" : "start"))
      .text((d) => d.data.name);
  }, [rounds]);

  return <svg ref={svgRef} width="800" height="600"></svg>;
};

const CompetitionDetails = () => {
  const { competitionId } = useParams();
  const theme = useTheme();
  const [competitionName, setCompetitionName] = useState("");
  const [competitionPlace, setCompetitionPlace] = useState("");
  const [competitionDate, setCompetitionDate] = useState("");
  const [categoriesData, setCategoriesData] = useState([]);
  const [teamsData, setTeamsData] = useState([]);
  const [clubsData, setClubsData] = useState([]);
  const [resolvedData, setResolvedData] = useState({});
  const [selectedTab, setSelectedTab] = useState(0); // State for active tab
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [qualifications, setQualifications] = useState([]);
  const [semiFinals, setSemiFinals] = useState([]);
  const [finals, setFinals] = useState([]);
  const [matchesData, setMatchesData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const competitionsResponse = await AxiosInstance.get("/competition/");
        const categoriesResponse = await AxiosInstance.get("/category/");
        const teamsResponse = await AxiosInstance.get("/team/");
        const clubsResponse = await AxiosInstance.get("/club/");
        const matchesResponse = await AxiosInstance.get("/match/");

        const competition = competitionsResponse.data.find(
          (comp) => comp.id === parseInt(competitionId)
        );
        setCompetitionName(competition?.name || "Competition Details");
        setCompetitionPlace(competition?.place || "Unknown Place");
        setCompetitionDate(competition?.date || "Unknown Date");

        const filteredCategories = categoriesResponse.data.filter(
          (category) => category.competition === parseInt(competitionId)
        );

        setCategoriesData(filteredCategories);
        setTeamsData(teamsResponse.data);
        setClubsData(clubsResponse.data);
        setMatchesData(matchesResponse.data.filter((match) => match.category_name));
      } catch (error) {
        console.error("Error fetching data:", error);
        setErrorMessage("Failed to fetch data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [competitionId]);

  const resolveData = async () => {
    const dataMap = {};
    for (const category of categoriesData) {
      const data =
        category.type === "teams"
          ? await Promise.all(
              category.teams.map(async (team) => {
                const teamData = await AxiosInstance.get(`/team/${team.id}`)
                  .then((res) => res.data)
                  .catch((error) => {
                    console.error("Error fetching team data:", error);
                    return null;
                  });

                if (!teamData || !teamData.members) {
                  console.error("No team data or members found for:", team.name);
                  return {
                    id: team.id,
                    athleteOrTeamName: "No members",
                    placement: "Participant",
                    teamMembers: [],
                    team: {
                      id: team.id, // Ensure the team ID is included
                      name: team.name,
                      group_name: category.group_name || "Unknown Group",
                      category_name: category.name || "Unknown Category",
                      gender: category.gender || "Unknown Gender",
                    },
                  };
                }

                const teamMembers = await Promise.all(
                  teamData.members.map(async (member) => {
                    const athlete = member.athlete;

                    if (!athlete || !athlete.id) {
                      console.error("Invalid athlete data:", athlete);
                      return {
                        athlete: {
                          first_name: "Unknown",
                          last_name: "Athlete",
                        },
                        clubName: "Unknown Club",
                      };
                    }

                    // Fetch the athlete data to get the club ID
                    const athleteData = await AxiosInstance.get(`/athlete/${athlete.id}`)
                      .then((res) => res.data)
                      .catch((error) => {
                        console.error(`Error fetching athlete data for ID ${athlete.id}:`, error);
                        return null;
                      });

                    if (!athleteData || !athleteData.club) {
                      console.error(`No club data found for athlete ID ${athlete.id}`);
                      return {
                        athlete: {
                          first_name: athlete.first_name,
                          last_name: athlete.last_name,
                        },
                        clubName: "Unknown Club",
                      };
                    }

                    // Fetch the club data using the club ID
                    const clubData = await AxiosInstance.get(`/club/${athleteData.club}`)
                      .then((res) => res.data)
                      .catch((error) => {
                        console.error(`Error fetching club data for ID ${athleteData.club}:`, error);
                        return null;
                      });

                    const clubName = clubData?.name || "Unknown Club";
                    return {
                      athlete: {
                        first_name: athlete.first_name,
                        last_name: athlete.last_name,
                      },
                      clubName,
                    };
                  })
                );

                const placement =
                  category.first_place_team?.id === team.id
                    ? "🥇 1st Place"
                    : category.second_place_team?.id === team.id
                    ? "🥈 2nd Place"
                    : category.third_place_team?.id === team.id
                    ? "🥉 3rd Place"
                    : "Participant";

                return {
                  id: team.id,
                  athleteOrTeamName: teamMembers.map(
                    (member) => `${member.athlete.first_name} ${member.athlete.last_name} (${member.clubName})`
                  ).join(" + "), // Combine team members into a single string with "+" between them
                  placement,
                  teamMembers, // Include team members for rendering buttons
                  team: {
                    id: team.id, // Ensure the team ID is included
                    name: team.name,
                    group_name: category.group_name || "Unknown Group",
                    category_name: category.name || "Unknown Category",
                    gender: category.gender || "Unknown Gender",
                  },
                };
              })
            )
          : category.enrolled_athletes.map((enrollment) => {
              const athlete = enrollment.athlete;
              const clubId = athlete.club; // Get the club ID from the athlete object
              const club = clubsData.find((club) => club.id === clubId); // Find the club using the club ID
              const clubName = club?.name || "Unknown Club";

              return {
                athleteOrTeamName: `${athlete.first_name} ${athlete.last_name} (${clubName})`,
                placement:
                  category.first_place === athlete.id
                    ? "🥇 1st Place"
                    : category.second_place === athlete.id
                    ? "🥈 2nd Place"
                    : category.third_place === athlete.id
                    ? "🥉 3rd Place"
                    : "Participant",
              };
            });

      dataMap[category.id] = data;
    }
    setResolvedData(dataMap);
  };

  useEffect(() => {
    resolveData();
  }, [categoriesData, teamsData, clubsData]);

  const exportToCSV = () => {
    const csvRows = [];
    csvRows.push(`Competition Name: ${competitionName}`);
    csvRows.push(`Total Athletes Enrolled: ${[
      ...new Set(
        categoriesData.flatMap((category) =>
          category.type === "teams"
            ? category.teams.flatMap((teamName) =>
                teamName.split(" + ").map((athleteName) => athleteName.trim())
              )
            : category.enrolled_athletes.map((enrollment) => enrollment.athlete.id)
        )
      ),
    ].length}`);
    csvRows.push(`Total Categories: ${categoriesData.length}`);
    csvRows.push(""); // Add a blank line for separation

    categoriesData.forEach((category) => {
      csvRows.push(`Category: ${category.name}`);
      csvRows.push(`Type: ${category.type}, Gender: ${category.gender}`);
      csvRows.push(""); // Add a blank line for separation

      // Add table headers
      csvRows.push("Athlete/Team Name,Placement");

      const data =
        category.type === "teams"
          ? category.teams.map((teamName) => {
              const placement =
                category.first_place_team_name === teamName
                  ? "🥇 1st Place"
                  : category.second_place_team_name === teamName
                  ? "🥈 2nd Place"
                  : category.third_place_team_name === teamName
                  ? "🥉 3rd Place"
                  : "Participant";

              return {
                athleteOrTeamName: teamName,
                placement,
              };
            })
          : category.enrolled_athletes.map((enrollment) => {
              const athlete = enrollment.athlete;
              return {
                athleteOrTeamName: `${athlete.first_name} ${athlete.last_name}`,
                placement:
                  category.first_place === athlete.id
                    ? "🥇 1st Place"
                    : category.second_place === athlete.id
                    ? "🥈 2nd Place"
                    : category.third_place === athlete.id
                    ? "🥉 3rd Place"
                    : "Participant",
              };
            });

      // Sort data based on placement
      const sortedData = data.sort((a, b) => {
        const placementOrder = {
          "🥇 1st Place": 1,
          "🥈 2nd Place": 2,
          "🥉 3rd Place": 3,
          Participant: 4,
        };
        return placementOrder[a.placement] - placementOrder[b.placement];
      });

      // Add rows for the current category
      sortedData.forEach((row) => {
        csvRows.push(`${row.athleteOrTeamName},${row.placement}`);
      });

      csvRows.push(""); // Add a blank line between categories
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${competitionName.replace(/\s+/g, "_")}_details.csv`;
    link.click();
  };

  const previewDiplomaForAwardee = async (category, awardee) => {
    try {
      // Select the appropriate template based on placement
      const templatePath =
        awardee.placement === "🥇 1st Place"
          ? "/diplomas/D_Locul1_CN2025.pdf"
          : awardee.placement === "🥈 2nd Place"
          ? "/diplomas/D_Locul2_CN2025.pdf"
          : awardee.placement === "🥉 3rd Place"
          ? "/diplomas/D_Locul3_CN2025.pdf"
          : "/diplomas/D_Participant_CN2025.pdf"; // Default template for participants
  
      const templateBytes = await fetch(templatePath).then((res) => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(templateBytes);
  
      // Use Google Fonts CDN for Roboto Bold
      const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4AMP6lQ.woff2";
      const fontBytes = await fetch(fontUrl).then((res) => res.arrayBuffer());
      pdfDoc.registerFontkit(fontkit);
      const customFont = await pdfDoc.embedFont(fontBytes);
  
      const page = pdfDoc.getPages()[0];
  
      // Draw athlete or team name
      const athleteOrTeamName = awardee.athleteOrTeamName || "Unknown Name";
      const textWidthName = customFont.widthOfTextAtSize(athleteOrTeamName, 18);
      const xPositionName = (page.getWidth() - textWidthName) / 2;
      page.drawText(athleteOrTeamName, {
        x: xPositionName,
        y: 250,
        size: 20,
        font: customFont,
      });
  
      // If placement is "Participant", skip drawing other details
      if (awardee.placement !== "Participant") {
        // Draw category name
        const categoryName = category.name || "Unknown Category";
        const textWidthCategory = customFont.widthOfTextAtSize(categoryName, 20);
        const xPositionCategory = (page.getWidth() - textWidthCategory) / 2;
        page.drawText(categoryName, {
          x: xPositionCategory,
          y: 210,
          size: 20,
          font: customFont,
        });
  
        // Draw group name and gender
        const groupWithGender = category.group_name
          ? `${category.group_name} – ${category.gender}`
          : `No Group Assigned – ${category.gender || "Unknown Gender"}`;
        const textWidthGroup = customFont.widthOfTextAtSize(groupWithGender, 20);
        const xPositionGroup = (page.getWidth() - textWidthGroup) / 2;
        page.drawText(groupWithGender, {
          x: xPositionGroup,
          y: 170,
          size: 20,
          font: customFont,
        });
      }
  
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank"); // Open the PDF in a new tab
    } catch (error) {
      console.error("Error generating diploma:", error);
    }
  };
  

  const previewDiplomaForTeamMember = async (category, team, teamMember) => {
    try {
      // Determine the placement of the team using category data
      const placement =
        category.first_place_team?.id === team.id
          ? "🥇 1st Place"
          : category.second_place_team?.id === team.id
          ? "🥈 2nd Place"
          : category.third_place_team?.id === team.id
          ? "🥉 3rd Place"
          : "Participant";
  
      // Log placement for debugging
      console.log(`Team ID: ${team.id}, Placement: ${placement}`);
  
      // Select the appropriate template based on the team's placement
      const templatePath =
        placement === "🥇 1st Place"
          ? "/diplomas/D_Locul1_CN2025.pdf"
          : placement === "🥈 2nd Place"
          ? "/diplomas/D_Locul2_CN2025.pdf"
          : placement === "🥉 3rd Place"
          ? "/diplomas/D_Locul3_CN2025.pdf"
          : "/diplomas/D_Participant_CN2025.pdf"; // Default template for participants
  
      // Fetch the template PDF
      const templateBytes = await fetch(templatePath)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch template: ${res.statusText}`);
          }
          return res.arrayBuffer();
        })
        .catch((error) => {
          console.error("Error fetching template:", error);
          return null;
        });
  
      if (!templateBytes) {
        console.error("Failed to fetch template bytes");
        return;
      }
  
      const pdfDoc = await PDFDocument.load(templateBytes);
  
      // Fetch and embed the custom font from Google Fonts CDN
      const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4AMP6lQ.woff2";
      const fontBytes = await fetch(fontUrl)
        .then((res) => res.arrayBuffer())
        .catch((error) => {
          console.error("Error fetching font:", error);
          return null;
        });
  
      if (!fontBytes) {
        console.error("Failed to fetch font bytes");
        return;
      }
  
      pdfDoc.registerFontkit(fontkit);
      const customFont = await pdfDoc.embedFont(fontBytes);
  
      const page = pdfDoc.getPages()[0];
  
      // Draw athlete name and club
      const athleteNameAndClub = `${teamMember.athlete.first_name} ${teamMember.athlete.last_name} – ${teamMember.clubName}`;
      const textWidthAthleteAndClub = customFont.widthOfTextAtSize(athleteNameAndClub, 24);
      const xPositionAthleteAndClub = (page.getWidth() - textWidthAthleteAndClub) / 2;
  
      page.drawText(athleteNameAndClub, {
        x: xPositionAthleteAndClub,
        y: 250,
        size: 24,
        font: customFont,
      });
  
      // If placement is "Participant", skip drawing other details
      if (placement !== "Participant") {
        // Draw group name and gender
        const groupWithGender = category.group_name
          ? `${category.group_name} – ${category.gender || "Unknown Gender"}`
          : `No Group Assigned – ${category.gender || "Unknown Gender"}`;
        const textWidthGroup = customFont.widthOfTextAtSize(groupWithGender, 20);
        const xPositionGroup = (page.getWidth() - textWidthGroup) / 2;
  
        page.drawText(groupWithGender, {
          x: xPositionGroup,
          y: 170,
          size: 20,
          font: customFont,
        });
  
        // Draw category name
        const categoryName = category.name || "Unknown Category";
        const textWidthCategory = customFont.widthOfTextAtSize(categoryName, 20);
        const xPositionCategory = (page.getWidth() - textWidthCategory) / 2;
  
        page.drawText(categoryName, {
          x: xPositionCategory,
          y: 210,
          size: 20,
          font: customFont,
        });
      }
  
      // Serialize the updated PDF
      const pdfBytes = await pdfDoc.save();
  
      // Generate the file name using the specified format
      const categoryNameFormatted = category.name ? category.name.replace(/\s+/g, "_") : "Unknown_Category";
      const athleteNameFormatted = `${teamMember.athlete.first_name}_${teamMember.athlete.last_name}`.replace(/\s+/g, "_");
      const clubNameFormatted = teamMember.clubName.replace(/\s+/g, "_");
      const yearOfCompetition = new Date().getFullYear(); // Dynamically fetch the current year
      const fileName = `${categoryNameFormatted}_${athleteNameFormatted}(${clubNameFormatted})_${placement}_${yearOfCompetition}.pdf`;
  
      // Preview the diploma in the browser
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
  
      console.log(`Diploma previewed for team member: ${athleteNameAndClub}`);
    } catch (error) {
      console.error("Error generating diploma:", error);
    }
  };
  

  async function fetchData() {
    const data = await fetch('/api/data');
    console.log(data);
  }

  fetchData();

  const calculateTotalEnrolledAthletes = () => {
    const athleteIds = new Set();

    categoriesData.forEach((category) => {
      if (category.type === "teams") {
        category.teams.forEach((team) => {
          team.members.forEach((member) => {
            athleteIds.add(member.athlete.id);
          });
        });
      } else {
        category.enrolled_athletes.forEach((enrollment) => {
          athleteIds.add(enrollment.athlete.id);
        });
      }
    });

    return athleteIds.size; // Count unique athlete IDs
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const filteredCategories =
    selectedTab === 0
      ? categoriesData.filter((category) => category.type === "solo" || category.type === "teams")
      : categoriesData.filter((category) => category.type === "fight");

  const transformMatchesToBracketData = (matches) => {
    if (!matches || matches.length === 0) {
      return []; // Return an empty array if no matches exist
    }
  
    const rounds = [];
  
    // Group matches by round type (qualifications, semi-finals, finals)
    const groupedMatches = {
      qualifications: matches.filter((match) => match.match_type === "qualifications"),
      semiFinals: matches.filter((match) => match.match_type === "semi-finals"),
      finals: matches.filter((match) => match.match_type === "finals"),
    };
  
    // Transform each round into the format required by react-brackets
    Object.keys(groupedMatches).forEach((roundType) => {
      const roundMatches = groupedMatches[roundType].map((match) => ({
        id: match.id,
        teams: [
          {
            name: `${match.red_corner_full_name} (${match.red_corner_club_name || "Unknown Club"})`,
            score: match.red_corner === match.winner ? 1 : 0, // Assign score based on winner
          },
          {
            name: `${match.blue_corner_full_name} (${match.blue_corner_club_name || "Unknown Club"})`,
            score: match.blue_corner === match.winner ? 1 : 0, // Assign score based on winner
          },
        ],
      }));
  
      if (roundMatches.length > 0) {
        rounds.push({
          title: roundType.charAt(0).toUpperCase() + roundType.slice(1), // Capitalize round type
          matches: roundMatches,
        });
      }
    });
  
    return rounds;
  };
  

  if (loading) {
    return <Typography>Loading competition details...</Typography>;
  }

  if (errorMessage) {
    return <Typography color="error">{errorMessage}</Typography>;
  }

  if (categoriesData.length === 0) {
    return (
      <Typography variant="h6" sx={{ padding: 2 }}>
        No categories found for this competition.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Back Arrow */}
      <Box sx={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
        <IconButton component={Link} to="/competitions" sx={{ marginRight: 1 }}>
          <ArrowBack />
        </IconButton>
      </Box>
      <Box sx={{ marginBottom: 2, textAlign: "center" }}>
      <Typography variant="h5" fontWeight="bold">{competitionName}</Typography>
      </Box>

      {/* Competition Information */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "left",
          marginBottom: 2,
          gap: 2, // Add gap between items
            padding: 2,
            backgroundColor: theme.palette.background.default,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
            flexDirection: {xs: "column", md: "column", lg: "row"}, // Responsive layout
        }}
      >
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", textAlign: "center", display: "flex", alignItems: "center", gap: 1 }}>
          <PlaceIcon sx={{ fontSize: 20 }} /> Place: {competitionPlace}
        </Typography>
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", textAlign: "center", display: "flex", alignItems: "center", gap: 1 }}>
          <CalendarTodayIcon sx={{ fontSize: 20 }} /> Date: {competitionDate}
        </Typography>
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", textAlign: "center", display: "flex", alignItems: "center", gap: 1 }}>
          <PeopleIcon sx={{ fontSize: 20 }} /> Total Enrolled Athletes: {calculateTotalEnrolledAthletes()}
        </Typography>
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", textAlign: "center", display: "flex", alignItems: "center", gap: 1 }}>
          <CategoryIcon sx={{ fontSize: 20 }} /> Total Categories: {categoriesData.length}
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs value={selectedTab} onChange={handleTabChange} sx={{ marginBottom: 2 }}>
        <Tab label="Solo & Teams" />
        <Tab label="Fight" />
        <Tab label="Matches" />
      </Tabs>

        {filteredCategories.map((category) => {
        const columns = [
          {
            accessorKey: "athleteOrTeamName",
            header: "Athlete/Team Name",
          },
          {
            accessorKey: "placement",
            header: "Placement",
          },
          {
            accessorKey: "actions",
            header: "Actions",
            Cell: ({ row }) => {
              const awardee = row.original;
              const [anchorEl, setAnchorEl] = useState(null);
          
              const handleOpenMenu = (event) => {
                setAnchorEl(event.currentTarget);
              };
          
              const handleCloseMenu = () => {
                setAnchorEl(null);
              };
          
              if (category.type === "teams") {
                return (
                  <Box>
                    {/* Print Icon */}
                    <IconButton
                      color="secondary"
                      onClick={handleOpenMenu}
                      sx={{ marginTop: 1 }}
                    >
                      <PrintIcon />
                    </IconButton>
          
                    {/* Dropdown Menu */}
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl)}
                      onClose={handleCloseMenu}
                    >
                      {awardee.teamMembers.map((teamMember) => (
                        <MenuItem
                          key={teamMember.athlete.id}
                          onClick={() => {
                            previewDiplomaForTeamMember(category, awardee.team, teamMember);
                            handleCloseMenu();
                          }}
                        >
                          {teamMember.athlete.first_name} {teamMember.athlete.last_name}
                        </MenuItem>
                      ))}
                    </Menu>
                  </Box>
                );
              } else {
                return (
                  <IconButton
                    color="secondary"
                    onClick={() => previewDiplomaForAwardee(category, awardee)}
                    sx={{ marginTop: 1 }}
                  >
                  </IconButton>
                );
              }
            },
          },
          
        ];

        const data = resolvedData[category.id] || [];

        return (
          <Box
            key={category.id}
            sx={{
              marginBottom: 4,
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            {/* Group Header */}
            <Box
              sx={{
                backgroundColor: theme.palette.primary.light,
                padding: 1,
                borderBottom: `2px solid ${theme.palette.divider}`,
                textAlign: "center",
              }}
            >
              <Typography variant="h8" sx={{ fontWeight: "bold", color: theme.palette.primary.contrastText }}>
                {category.group_name || "No Group Assigned"}
              </Typography>
            </Box>

            {/* Category Header */}
            <Box
              sx={{
                backgroundColor: theme.palette.background.paper,
                padding: 1,
                borderBottom: `2px solid ${theme.palette.divider}`,
                textAlign: "center",
              }}
            >
              <Typography variant="h8" sx={{ fontWeight: "bold" }}>
                {category.name} - {category.gender}
              </Typography>
            </Box>

            <MaterialReactTable
              columns={columns}
              data={data} // Use resolved data
              enableColumnFilters={false}
              enableGlobalFilter={false}
              enableColumnOrdering={false}
              enableFullScreenToggle={false}
              enablePagination={false}
              enableSorting={false}
              enableRowActions={false}
              enableDensityToggle={false}
              enableHiding={false}
              enableBottomToolbar={false}
              enableTopToolbar={false}
              enableRowSelection={false}
              enableColumnActions={false}
              muiTableBodyCellProps={({ cell }) => ({
                sx: {
                  fontWeight: cell.column.id === "placement" && cell.getValue()?.includes("Place") ? "bold" : "normal",
                },
              })}
            />

            {/* Footer */}
            <Box
              sx={{
                backgroundColor: theme.palette.background.paper,
                padding: 1,
                paddingLeft: 2,
                borderTop: `2px solid ${theme.palette.divider}`,
                textAlign: "left",
              }}
            >
              <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
                Enrolled Athletes:{" "}
                {category.type === "teams"
                  ? category.teams.reduce((total, team) => total + team.members.length, 0)
                  : category.enrolled_athletes.length}
              </Typography>
            </Box>
          </Box>
        );
      })}

      {/* Render Matches Tab Content */}
      {selectedTab === 2 && (
  <Box>
    {(categoriesData || [])
      .filter((category) => {
        // Filter categories that contain matches
        const matches = (matchesData || []).filter((match) => match.category === category.id);
        return matches.length > 0;
      })
      .map((category) => {
        const matches = (matchesData || []).filter((match) => match.category === category.id);

        const bracketData = transformMatchesToBracketData(matches);

        console.log("Bracket Data:", bracketData); // Debugging log

        return (
          <Box
            key={category.id}
            sx={{
              marginBottom: 4,
              border: `2px solid ${theme.palette.divider}`,
              borderRadius: 1,
            }}
          >
            {/* Group Header */}
            <Box
              sx={{
                backgroundColor: theme.palette.primary.light,
                padding: 1,
                borderBottom: `2px solid ${theme.palette.divider}`,
                textAlign: "center",
              }}
            >
              <Typography variant="h8" sx={{ fontWeight: "bold", color: theme.palette.primary.contrastText }}>
                {category.group_name || "No Group Assigned"}
              </Typography>
            </Box>

            {/* Category Header */}
            <Box
              sx={{
                backgroundColor: theme.palette.background.paper,
                padding: 1,
                borderBottom: "2px solid black",
                textAlign: "center",
              }}
            >
              <Typography variant="h8" sx={{ fontWeight: "bold" }}>
                {category.name} - {category.gender}
              </Typography>
            </Box>

            {/* Enrolled Athletes */}
            <Box
              sx={{
                backgroundColor: theme.palette.background.default,
                padding: 2,
                borderBottom: `2px solid ${theme.palette.divider}`,
                textAlign: "left",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: "bold", marginBottom: 1 }}>
                Enrolled Athletes:
              </Typography>
              {(category.enrolled_athletes || []).map((athlete) => (
                <Typography key={athlete.id} variant="body2">
                  {athlete.first_name} {athlete.last_name} - Weight: {athlete.weight || "Unknown"}
                </Typography>
              ))}
            </Box>

            {/* Horizontal Bracket Tree */}
            <CustomBracketTree rounds={bracketData} />
          </Box>
        );
      })}
  </Box>
)}
    </Box>
  );
};

const CustomBracketTree = ({ rounds }) => {
  if (!rounds || rounds.length === 0) {
    return <Typography sx={{ padding: 2, textAlign: "center" }}>No matches available.</Typography>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 4 }}>
      {rounds.map((round, roundIndex) => (
        <Box key={roundIndex} sx={{ textAlign: "center", minWidth: 200 }}>
          {/* Round Title */}
          <Typography variant="h6" sx={{ marginBottom: 2, fontWeight: "bold" }}>
            {round.title}
          </Typography>

          {/* Matches */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            {round.matches.map((match) => (
              <Box
                key={match.id}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 4,
                  padding: 2,
                  minWidth: 200,
                  textAlign: "center",
                  backgroundColor: theme.palette.background.default,
                }}
              >
                {/* Red Corner */}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: match.teams[0].score === 1 ? "bold" : "normal",
                    color: match.teams[0].score === 1 ? theme.palette.success?.main || "green" : theme.palette.text.primary,
                  }}
                >
                  {match.teams[0].name} ({match.teams[0].score})
                </Typography>

                {/* VS Separator */}
                <Typography variant="body2" sx={{ margin: "8px 0", fontWeight: "bold" }}>
                  VS
                </Typography>

                {/* Blue Corner */}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: match.teams[1].score === 1 ? "bold" : "normal",
                    color: match.teams[1].score === 1 ? theme.palette.success?.main || "green" : theme.palette.text.primary,
                  }}
                >
                  {match.teams[1].name} ({match.teams[1].score})
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default CompetitionDetails;
