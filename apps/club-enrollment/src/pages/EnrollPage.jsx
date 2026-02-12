import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  Alert,
  Card,
  CardContent,
  Chip,
  Tab,
  Tabs,
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
        // Fetch club athletes
        
        console.log('Fetching categories for event:', competitionId)
            enrollmentId: ca.id
// Removed: Not needed for club management app
        })
        setEnrolledAthletes(enrolledMap)
        
        // Fetch enrolled teams
        const enrolledTeamResponse = await categoryTeamAPI.list()
        console.log('Enrolled teams response:', enrolledTeamResponse.data)
        
        const categoryTeams = Array.isArray(enrolledTeamResponse.data)
          ? enrolledTeamResponse.data
          : (enrolledTeamResponse.data?.results || enrolledTeamResponse.data || [])
        
        const filteredCategoryTeams = categoryTeams.filter(
          ct => upcomingCategories.some(c => c.id === ct.category)
        )
        console.log('Filtered category teams:', filteredCategoryTeams)
        
        const enrolledTeamsMap = {}
        filteredCategoryTeams.forEach(ct => {
          enrolledTeamsMap[ct.team] = {
            categoryId: ct.category,
            enrollmentId: ct.id
          }
        })
        setEnrolledTeams(enrolledTeamsMap)
      } catch (error) {
        console.error('Failed to fetch data:', error)
        console.error('Error details:', error.response?.data || error.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [competitionId, navigate])

  const getCategoryLabel = (category) => {
    const typeLabel = category.type === 'solo' ? 'Solo' : category.type === 'team' ? 'Team' : 'Fight'
    const genderLabel = category.gender === 'male' ? 'M' : category.gender === 'female' ? 'F' : 'Mixed'
    return `${typeLabel} - ${genderLabel}`
  }

  const generateTeamName = (athleteIds) => {
    // Get selected athlete data and sort by selection order
    const selectedAthletes = athleteIds
      .map(id => athletes.find(a => a.id === id))
      .filter(Boolean)
    
    if (selectedAthletes.length === 0) return ''
    
    // Take first 3 athletes for the name
    const nameList = selectedAthletes.slice(0, 3)
    const names = nameList.map(a => `${a.first_name} ${a.last_name}`)
    const base = names.join(' & ')
    
    // Get club name from first athlete
    const firstAthlete = selectedAthletes[0]
    let fullName = base
    
    if (firstAthlete.club) {
      const clubName = typeof firstAthlete.club === 'string' 
        ? firstAthlete.club 
        : firstAthlete.club.name || firstAthlete.club
      fullName = `${base} (${clubName})`
    }
    
    // Handle more than 3 members
    if (selectedAthletes.length > 3) {
      fullName = `${base} (+${selectedAthletes.length - 3} more)`
      if (firstAthlete.club) {
        const clubName = typeof firstAthlete.club === 'string' 
          ? firstAthlete.club 
          : firstAthlete.club.name || firstAthlete.club
        fullName = `${base} (+${selectedAthletes.length - 3} more) (${clubName})`
      }
    }
    
    return fullName
  }

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue)
    setSelectedCategoryId(null)
    setSelectedAthletesForCategory([])
  }

  const handleToggleAthlete = (athleteId, categoryId) => {
    if (enrolledAthletes[athleteId]?.categoryId === categoryId) {
      return // Can't toggle if already enrolled
    }
    
    setSelectedAthletesForCategory(prev =>
      prev.includes(athleteId)
        ? prev.filter(id => id !== athleteId)
        : [...prev, athleteId]
    )
  }

  const handleEnrollAthletesToCategory = async () => {
    if (!selectedCategoryId || selectedAthletesForCategory.length === 0) return

    try {
      setEnrolling(true)
      const enrollmentMap = {}
      
      for (const athleteId of selectedAthletesForCategory) {
        try {
          const response = await categoryAthleteAPI.create({
            category: selectedCategoryId,
            athlete: athleteId,
          })
          enrollmentMap[athleteId] = {
            categoryId: selectedCategoryId,
            enrollmentId: response.data.id
          }
        } catch (error) {
          console.error(`Failed to enroll athlete ${athleteId}:`, error)
        }
      }
      
      if (Object.keys(enrollmentMap).length > 0) {
        setEnrolledAthletes(prev => ({ ...prev, ...enrollmentMap }))
        setSelectedAthletesForCategory([])
        setSuccessMessage(`Successfully enrolled ${Object.keys(enrollmentMap).length} athlete(s) to category!`)
        setTimeout(() => setSuccessMessage(''), 5000)
      }
    } catch (error) {
      console.error('Enrollment failed:', error)
      alert('Failed to enroll athletes. Please try again.')
    } finally {
      setEnrolling(false)
    }
  }

  const handleUnenrollAthlete = async (athleteId) => {
    const enrollment = enrolledAthletes[athleteId]
    if (!enrollment) return

    try {
      await categoryAthleteAPI.delete(enrollment.enrollmentId)
      
      setEnrolledAthletes(prev => {
        const updated = { ...prev }
        delete updated[athleteId]
        return updated
      })
      
      setSuccessMessage('Athlete unenrolled successfully!')
      setTimeout(() => setSuccessMessage(''), 5000)
    } catch (error) {
      console.error(`Failed to unenroll athlete ${athleteId}:`, error)
      alert('Failed to unenroll athlete. Please try again.')
    }
  }

  const handleOpenTeamDialog = (categoryId) => {
    setSelectedTeamCategory(categoryId)
    setSelectedTeamAthletes([])
    setTeamDialogOpen(true)
  }

  const handleCloseTeamDialog = () => {
    setTeamDialogOpen(false)
    setSelectedTeamCategory(null)
    setSelectedTeamAthletes([])
  }

  const handleToggleTeamAthlete = (athleteId) => {
    setSelectedTeamAthletes(prev =>
      prev.includes(athleteId)
        ? prev.filter(id => id !== athleteId)
        : [...prev, athleteId]
    )
  }

  const handleCreateTeam = async () => {
    if (selectedTeamAthletes.length === 0 || !selectedTeamCategory) return

    try {
      setCreatingTeam(true)
      
      // Auto-generate team name from selected athletes (for display only)
      const generatedName = generateTeamName(selectedTeamAthletes)
      
      // Create empty team (name will be auto-generated from members)
      const teamResponse = await teamAPI.create({
        members: [],
        categories: [],
      })
      
      // Create team members for each selected athlete
      if (teamResponse.data && teamResponse.data.id) {
        for (const athleteId of selectedTeamAthletes) {
          try {
            await teamMemberAPI.create({
              team: teamResponse.data.id,
              athlete: athleteId,
            })
          } catch (error) {
            console.warn(`Failed to add athlete ${athleteId} to team:`, error)
          }
        }
      }
      
      // Enroll team to category
      const enrollResponse = await categoryTeamAPI.create({
        category: selectedTeamCategory,
        team: teamResponse.data.id,
      })
      
      setEnrolledTeams(prev => ({
        ...prev,
        [teamResponse.data.id]: {
          categoryId: selectedTeamCategory,
          enrollmentId: enrollResponse.data.id
        }
      }))
      
      setSuccessMessage(`Team "${generatedName}" created and enrolled successfully!`)
      setTimeout(() => setSuccessMessage(''), 5000)
      handleCloseTeamDialog()
    } catch (error) {
      console.error('Failed to create team:', error)
      alert('Failed to create team. Please try again.')
    } finally {
      setCreatingTeam(false)
    }
  }

  const handleUnenrollTeam = async (teamId) => {
    const enrollment = enrolledTeams[teamId]
    if (!enrollment) return

    try {
      await categoryTeamAPI.delete(enrollment.enrollmentId)
      
      setEnrolledTeams(prev => {
        const updated = { ...prev }
        delete updated[teamId]
        return updated
      })
      
      setSuccessMessage('Team unenrolled successfully!')
      setTimeout(() => setSuccessMessage(''), 5000)
    } catch (error) {
      console.error(`Failed to unenroll team ${teamId}:`, error)
      alert('Failed to unenroll team. Please try again.')
    }
  }

  const handleLogout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('authToken')
      navigate('/')
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  const soloFightCategories = categories.filter(c => c.type === 'solo' || c.type === 'fight')
  const teamCategories = categories.filter(c => c.type === 'team')
  const currentCategories = tabValue === 0 ? soloFightCategories : teamCategories

  return (
    <Box sx={{ backgroundColor: '#fff', minHeight: '100vh' }}>
      <SharedNavBar />

      <Breadcrumb
        items={[
          { label: 'Dashboard', path: '/dashboard/competitions' },
          { label: 'Competitions', path: '/dashboard/competitions' },
          { label: event?.title || 'Competition', path: event ? `/dashboard/competitions/${event.id}` : '#' },
        ]}
      />

      <Container sx={{ py: 4 }}>
        {/* Event Details */}
        {event && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom>
              {event.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {event.city_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(event.start_date).toLocaleDateString()} - {new Date(event.end_date).toLocaleDateString()}
            </Typography>
            <Chip 
              label={event.status?.toUpperCase()} 
              color={event.status === 'upcoming' ? 'warning' : event.status === 'ongoing' ? 'success' : 'default'}
              sx={{ mt: 1 }}
            />
          </Paper>
        )}

        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        )}

        {/* No categories message */}
        {categories.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No categories available for enrollment in this event.
            </Typography>
          </Paper>
        )}

        {categories.length > 0 && (
          <>
            {/* Tab Selection */}
            {soloFightCategories.length > 0 && teamCategories.length > 0 && (
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange}
                sx={{ mb: 3, borderBottom: '1px solid #e0e0e0' }}
              >
                <Tab label={`Solo/Fight (${soloFightCategories.length})`} />
                <Tab label={`Team (${teamCategories.length})`} />
              </Tabs>
            )}

            {/* Category Cards */}
            <Grid container spacing={3}>
              {currentCategories.map(category => {
                const categoryEnrolledAthletes = Object.entries(enrolledAthletes)
                  .filter(([_, data]) => data.categoryId === category.id)
                  .map(([athleteId]) => parseInt(athleteId))
                
                const categoryEnrolledTeams = Object.entries(enrolledTeams)
                  .filter(([_, data]) => data.categoryId === category.id)
                  .map(([teamId]) => parseInt(teamId))

                const isTeamCategory = category.type === 'team'
                const availableAthletes = athletes.filter(
                  a => !categoryEnrolledAthletes.includes(a.id)
                )

                return (
                  <Grid item xs={12} md={6} key={category.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                          <div>
                            <Typography variant="h6" gutterBottom>
                              {category.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {getCategoryLabel(category)}
                            </Typography>
                          </div>
                          <Chip 
                            label={isTeamCategory ? `${categoryEnrolledTeams.length} teams` : `${categoryEnrolledAthletes.length} athletes`}
                            color="primary"
                            variant="outlined"
                            size="small"
                          />
                        </Box>

                        {/* Enrolled Athletes/Teams */}
                        {categoryEnrolledAthletes.length > 0 && !isTeamCategory && (
                          <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                              Enrolled Athletes:
                            </Typography>
                            <Stack spacing={1}>
                              {categoryEnrolledAthletes.map(athleteId => {
                                const athlete = athletes.find(a => a.id === athleteId)
                                return (
                                  <Box
                                    key={athleteId}
                                    sx={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      p: 1,
                                      backgroundColor: '#f5f5f5',
                                      borderRadius: 1,
                                    }}
                                  >
                                    <Typography variant="body2">
                                      {athlete?.first_name} {athlete?.last_name}
                                    </Typography>
                                    {event?.status !== 'past' && (
                                      <Button
                                        size="small"
                                        color="error"
                                        onClick={() => handleUnenrollAthlete(athleteId)}
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </Box>
                                )
                              })}
                            </Stack>
                          </Box>
                        )}

                        {categoryEnrolledTeams.length > 0 && isTeamCategory && (
                          <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                              Enrolled Teams:
                            </Typography>
                            <Stack spacing={1}>
                              {categoryEnrolledTeams.map(teamId => (
                                <Box
                                  key={teamId}
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    p: 1,
                                    backgroundColor: '#f5f5f5',
                                    borderRadius: 1,
                                  }}
                                >
                                  <Typography variant="body2">
                                    Team #{teamId}
                                  </Typography>
                                  {event?.status !== 'past' && (
                                    <Button
                                      size="small"
                                      color="error"
                                      onClick={() => handleUnenrollTeam(teamId)}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {/* Athlete Selection for Solo/Fight */}
                        {!isTeamCategory && availableAthletes.length > 0 && event?.status !== 'past' && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                              {selectedCategoryId === category.id ? 'Select Athletes to Enroll:' : 'Available Athletes:'}
                            </Typography>
                            {selectedCategoryId === category.id ? (
                              <Stack spacing={1}>
                                {availableAthletes.map(athlete => (
                                  <FormControlLabel
                                    key={athlete.id}
                                    control={
                                      <Checkbox
                                        checked={selectedAthletesForCategory.includes(athlete.id)}
                                        onChange={() => handleToggleAthlete(athlete.id, category.id)}
                                      />
                                    }
                                    label={`${athlete.first_name} ${athlete.last_name}`}
                                  />
                                ))}
                                <Stack direction="row" gap={1} sx={{ mt: 2 }}>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={handleEnrollAthletesToCategory}
                                    disabled={selectedAthletesForCategory.length === 0 || enrolling}
                                  >
                                    {enrolling ? 'Enrolling...' : `Enroll (${selectedAthletesForCategory.length})`}
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => {
                                      setSelectedCategoryId(null)
                                      setSelectedAthletesForCategory([])
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </Stack>
                              </Stack>
                            ) : (
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setSelectedCategoryId(category.id)}
                              >
                                Enroll Athletes
                              </Button>
                            )}
                          </Box>
                        )}

                        {/* Team Creation for Team Categories */}
                        {isTeamCategory && event?.status !== 'past' && (
                          <Box sx={{ mt: 2 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleOpenTeamDialog(category.id)}
                            >
                              Create & Enroll Team
                            </Button>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
          </>
        )}

      </Container>

      {/* Team Creation Dialog */}
      <Dialog open={teamDialogOpen} onClose={handleCloseTeamDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Create and Enroll Team</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {selectedTeamAthletes.length > 0 && (
            <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="caption" color="textSecondary">
                Team Name Preview:
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
                {generateTeamName(selectedTeamAthletes)}
              </Typography>
            </Box>
          )}
          
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Select Team Athletes:
          </Typography>
          
          <Stack spacing={1} sx={{ maxHeight: 300, overflowY: 'auto' }}>
            {athletes.map(athlete => (
              <FormControlLabel
                key={athlete.id}
                control={
                  <Checkbox
                    checked={selectedTeamAthletes.includes(athlete.id)}
                    onChange={() => handleToggleTeamAthlete(athlete.id)}
                  />
                }
                label={`${athlete.first_name} ${athlete.last_name}`}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTeamDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateTeam}
            disabled={selectedTeamAthletes.length === 0 || creatingTeam}
          >
            {creatingTeam ? 'Creating...' : 'Create Team'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default EnrollPage
