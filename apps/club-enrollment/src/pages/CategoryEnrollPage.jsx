import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
  Grid,
  Avatar,
  IconButton,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import SharedNavBar from '../components/SharedNavBar'
import Breadcrumb from '../components/Breadcrumb'
import api, { authAPI, categoryAPI, categoryAthleteAPI, categoryTeamAPI } from '../services/apis.js'

const CategoryEnrollPage = () => {
  const { competitionId, categoryId } = useParams()
  const navigate = useNavigate()
  const [competition, setCompetition] = useState(null)
  const [category, setCategory] = useState(null)
  const [athletes, setAthletes] = useState([])
  const [teams, setTeams] = useState([])
  const [enrolledAthletes, setEnrolledAthletes] = useState([])
  const [enrolledTeams, setEnrolledTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [clubId, setClubId] = useState(null)
  // Removed: Not needed for club management app
                  )
                ) : (
                  availableAthletes.length > 0 ? (
                    availableAthletes.map(athlete => (
                      <Card
                        key={athlete.id}
                        draggable
                        onDragStart={(e) => handleDragStartAthlete(e, athlete)}
                        sx={{
                          cursor: 'grab',
                          '&:active': { cursor: 'grabbing' },
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            boxShadow: 2,
                            transform: 'translateY(-2px)',
                          },
                          backgroundColor: draggedAthlete?.id === athlete.id ? '#e3f2fd' : 'white',
                        }}
                      >
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar sx={{ width: 36, height: 36, bgcolor: '#1976d2', fontSize: '0.9rem' }}>
                              {athlete.first_name.charAt(0)}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                                {athlete.first_name} {athlete.last_name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {athlete.current_grade?.name || 'N/A'}
                              </Typography>
                            </Box>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleEnrollAthlete(athlete.id)}
                              disabled={enrolling}
                              sx={{ whiteSpace: 'nowrap' }}
                            >
                              Enroll
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      No available athletes
                    </Typography>
                  )
                )}
              </Stack>
            </Paper>
          </Grid>

          {/* Enrolled Athletes/Teams - 50% width */}
          <Grid item xs={12} sm={6} sx={{ display: 'flex', flexDirection: 'column' }}>
            {/* Simple Title - No Card */}
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, pl: 1 }}>
              Enrolled ({isTeamCategory ? enrolledTeams.length : enrolledAthletes.length})
            </Typography>

            {/* Content */}
            <Paper
              onDragOver={handleDragOverEnroll}
              onDrop={handleDropEnroll}
              sx={{
                p: 2,
                flex: 1,
                backgroundColor: draggedAthlete || draggedTeam ? '#e8f5e9' : '#fafafa',
                border: draggedAthlete || draggedTeam ? '2px dashed #4caf50' : '2px dashed #ddd',
                transition: 'all 0.2s ease',
                overflow: 'auto',
              }}
            >
              <Stack spacing={1.5}>
                {isTeamCategory ? (
                  enrolledTeams.length > 0 ? (
                    enrolledTeams.map(enrollment => {
                      const team = teams.find(t => t.id === enrollment.team)
                      return (
                        <Card key={enrollment.id} sx={{ backgroundColor: '#fff3e0' }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar sx={{ width: 36, height: 36, bgcolor: '#ff9800', fontSize: '0.9rem' }}>
                                {team?.name?.charAt(0) || '?'}
                              </Avatar>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                                  {team?.name || 'Unknown Team'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Enrolled
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveTeam(enrollment.id)}
                                disabled={enrolling}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                          </CardContent>
                        </Card>
                      )
                    })
                  ) : (
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      Drag teams here or click Enroll
                    </Typography>
                  )
                ) : (
                  enrolledAthletes.length > 0 ? (
                    enrolledAthletes.map(enrollment => {
                      const athlete = athletes.find(a => a.id === enrollment.athlete)
                      return (
                        <Card key={enrollment.id} sx={{ backgroundColor: '#e3f2fd' }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar sx={{ width: 36, height: 36, bgcolor: '#2196f3', fontSize: '0.9rem' }}>
                                {athlete?.first_name?.charAt(0) || '?'}
                              </Avatar>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                                  {athlete?.first_name} {athlete?.last_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Enrolled
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveAthlete(enrollment.id)}
                                disabled={enrolling}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                          </CardContent>
                        </Card>
                      )
                    })
                  ) : (
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      Drag athletes here or click Enroll
                    </Typography>
                  )
                )}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}

export default CategoryEnrollPage
