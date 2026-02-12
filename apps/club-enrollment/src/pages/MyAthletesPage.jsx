import SharedNavBar from '../components/SharedNavBar'
import { Box, Typography, CircularProgress, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material'
import { useState, useEffect } from 'react'
import api, { athleteAPI } from '../services/apis.js'

const MyAthletesPage = () => {
  const [athletes, setAthletes] = useState([])
  const [visaData, setVisaData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAthletes = async () => {
      try {
        setLoading(true)
        const clubRes = await api.get('/clubs/me/')
        const clubAthletes = clubRes.data?.athletes || []
        setAthletes(clubAthletes)
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
          } catch {
            visaMap[athlete.id] = { annual: [], medical: [] }
          }
        }
        setVisaData(visaMap)
      } catch {
        setAthletes([])
      } finally {
        setLoading(false)
      }
    }
    fetchAthletes()
  }, [])

  const getVisaInfo = (athleteId, visaType) => {
    const athleteVisas = visaData[athleteId]
    if (!athleteVisas) return null
    const visasArray = visaType === 'annual' ? athleteVisas.annual : athleteVisas.medical
    if (!visasArray || visasArray.length === 0) return null
    return visasArray[0]
  }

  return (
    <>
      <SharedNavBar />
      <Box>
        <Typography variant="h4" sx={{ mb: 3 }}>My Athletes</Typography>
        {loading ? (
          <CircularProgress />
        ) : athletes.length === 0 ? (
          <Typography>No athletes found.</Typography>
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
                    <TableCell>{(() => { const visa = getVisaInfo(athlete.id, 'annual'); return visa ? visa.valid_until : 'N/A' })()}</TableCell>
                    <TableCell>{(() => { const visa = getVisaInfo(athlete.id, 'medical'); return visa ? visa.valid_until : 'N/A' })()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </>
  )
}

export default MyAthletesPage
