import SharedNavBar from '../components/SharedNavBar'
import { Box, Typography, CircularProgress, Tabs, Tab, Grid, Card, CardContent, Container } from '@mui/material'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/apis.js'

const CompetitionsPage = () => {
  const [competitions, setCompetitions] = useState([])
  const [eventTab, setEventTab] = useState('ongoing')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        setLoading(true)
        const response = await api.get('/landing/events/', { params: { status: eventTab } })
        let list = []
        if (Array.isArray(response.data)) list = response.data
        else if (response.data?.results && Array.isArray(response.data.results)) list = response.data.results
        else if (response.data) list = [response.data]
        setCompetitions(list)
      } catch {
        setCompetitions([])
      } finally {
        setLoading(false)
      }
    }
    fetchCompetitions()
  }, [eventTab])

  return (
    <>
      <SharedNavBar />
      <Container>
        <Typography variant="h4" sx={{ mb: 3 }}>Competitions</Typography>
        <Tabs
          value={eventTab}
          onChange={(_, value) => setEventTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="upcoming" label="Upcoming" />
          <Tab value="ongoing" label="Ongoing" />
          <Tab value="past" label="Past" />
        </Tabs>
        {loading ? (
          <CircularProgress />
        ) : competitions.length === 0 ? (
          <Typography>No competitions found for this status.</Typography>
        ) : (
          <Grid container spacing={2}>
            {competitions.map((competition) => (
              <Grid item xs={12} sm={6} md={3} key={competition.id}>
                <Card sx={{ cursor: 'pointer', height: '100%' }} onClick={() => navigate(`/competitions/${competition.id}`)}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>{competition.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{competition.city_name}</Typography>
                    <Typography variant="body2" color="text.secondary">{new Date(competition.start_date).toLocaleDateString()}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </>
  )
}

export default CompetitionsPage
