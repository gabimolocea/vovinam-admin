
import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip
} from '@mui/material'
import SharedNavBar from '../components/SharedNavBar'
import Breadcrumb from '../components/Breadcrumb'
import api, { athleteAPI } from '../services/apis'

function DashboardPage() {
  const [athletes, setAthletes] = useState([])
  const [visaData, setVisaData] = useState({})
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  // Add any other state or hooks needed

  // ...existing code...

  const fetchAthletes = async () => {
    try {
      setLoading(true)
      if (!userClubId) return

      // Fetch club details which includes athletes
      const clubRes = await api.get(`/clubs/${userClubId}/`)
      const clubAthletes = clubRes.data?.athletes || []
      setAthletes(clubAthletes)

      // Fetch visa data for all athletes
      const visaMap = {}
      for (const athlete of clubAthletes) {
        try {
          const [annualRes, medicalRes] = await Promise.all([
            athleteAPI.getAnnualVisas(athlete.id),
            athleteAPI.getMedicalVisas(athlete.id)
          ])
          visaMap[athlete.id] = {
            annual: annualRes.data || [],
            medical: medicalRes.data || []
          }
        } catch (error) {
          console.error(`Error fetching visas for athlete ${athlete.id}:`, error)
          visaMap[athlete.id] = { annual: [], medical: [] }
        }
      }
      setVisaData(visaMap)
    } catch (error) {
      console.error('Error fetching athletes:', error)
      setAthletes([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCompetitions = async () => {
    try {
      setLoading(true)
      const response = await api.get('/landing/events/', { params: { status: eventTab } })
      console.log('API Response:', response.data)
      
      // Handle both paginated and direct array responses
      let list = []
      if (Array.isArray(response.data)) {
        list = response.data
      } else if (response.data?.results && Array.isArray(response.data.results)) {
        list = response.data.results
      } else if (response.data) {
        // If it's a single object, wrap it in an array
        list = [response.data]
      }
      
      console.log('Processed competitions list:', list)
      setCompetitions(list)
    } catch (error) {
      console.error('Error fetching competitions:', error.response?.data || error.message)
      setCompetitions([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCategoriesForCompetition = async (competitionId) => {
    try {
      setLoading(true)
      const response = await categoryAPI.getEventCategories(competitionId)
      
      let categories = []
      if (Array.isArray(response.data)) {
        categories = response.data
      } else if (response.data?.results && Array.isArray(response.data.results)) {
        categories = response.data.results
      } else if (response.data) {
        categories = [response.data]
      }
      
      setCompetitionCategories(categories)
      setCategoryTabValue(0) // Reset to first tab
    } catch (error) {
      console.error('Error fetching categories:', error)
      setCompetitionCategories([])
    } finally {
      setLoading(false)
    }
  }

  // const handleSelectCompetition = (competition) => {
  //   setSelectedCompetition(competition)
  //   fetchCategoriesForCompetition(competition.id)
  // }

  // const handleBackToCompetitions = () => {
  //   setSelectedCompetition(null)
  //   setCompetitionCategories([])
  // }

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

  const getVisaInfo = (athleteId, visaType) => {
    const athleteVisas = visaData[athleteId]
    if (!athleteVisas) return null

    const visasArray = visaType === 'annual' ? athleteVisas.annual : athleteVisas.medical
    if (!visasArray || visasArray.length === 0) return null

    const visa = visasArray[0] // Get the most recent visa
    return visa
  }
  // Handler for competition card click
  const handleCompetitionClick = (competition) => {
    // Navigate to competition detail page (if implemented)
    // navigate(`/dashboard/competitions/${competition.id}`)
    // For now, just log
    console.log('Competition clicked:', competition)
  }

  return (
    <>
      <SharedNavBar />
      <Box sx={{ bgcolor: '#fff', minHeight: '100vh' }}>
        <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }]} />
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
              My Athletes
            </Typography>
          </Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Gender</TableCell>
                    <TableCell>Birthdate</TableCell>
                    <TableCell>Annual Visa</TableCell>
                    <TableCell>Medical Visa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {athletes.map((athlete) => (
                    <TableRow key={athlete.id}>
                      <TableCell>{athlete.full_name || athlete.name}</TableCell>
                      <TableCell>{athlete.gender}</TableCell>
                      <TableCell>{athlete.birthdate}</TableCell>
                      <TableCell>
                        {visaData[athlete.id]?.annual?.length > 0 ? (
                          <Chip label="Valid" color="success" size="small" />
                        ) : (
                          <Chip label="Missing" color="warning" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        {visaData[athlete.id]?.medical?.length > 0 ? (
                          <Chip label="Valid" color="success" size="small" />
                        ) : (
                          <Chip label="Missing" color="warning" size="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Container>
      </Box>
    </>
  )
}

export default DashboardPage

