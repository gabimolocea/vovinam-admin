import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Toolbar,
  Typography,
  Grid,
  CircularProgress,
} from '@mui/material'
import { api } from '../services/api'

const HomePage = () => {
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCompetitions = async () => {
      try {
        const response = await api.get('/competitions/')
        setCompetitions(response.data || [])
      } catch (error) {
        setCompetitions([])
      } finally {
        setLoading(false)
      }
    }

    fetchCompetitions()
  }, [])

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            FRVV Club Enrollment
          </Typography>
          <Button color="inherit" component={Link} to="/my-enrollments">
            My Enrollments
          </Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          Open Competitions
        </Typography>
        {loading ? (
          <CircularProgress />
        ) : (
          <Grid container spacing={2}>
            {competitions.map((competition) => (
              <Grid item xs={12} md={6} key={competition.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6">{competition.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {competition.place}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {competition.start_date}
                    </Typography>
                    <Button
                      sx={{ mt: 2 }}
                      variant="contained"
                      component={Link}
                      to={`/enroll/${competition.id}`}
                    >
                      Enroll Athletes
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  )
}

export default HomePage
