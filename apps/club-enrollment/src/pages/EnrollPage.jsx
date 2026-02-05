import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { api } from '../services/api'

const EnrollPage = () => {
  const { competitionId } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [athletes, setAthletes] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [selectedAthletes, setSelectedAthletes] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      const [categoriesRes, athletesRes] = await Promise.all([
        api.get('/categories/', { params: { event: competitionId } }),
        api.get('/athletes/')
      ])
      setCategories(categoriesRes.data || [])
      setAthletes(athletesRes.data || [])
    }

    fetchData()
  }, [competitionId])

  const handleEnroll = async () => {
    if (!categoryId || selectedAthletes.length === 0) return

    for (const athleteId of selectedAthletes) {
      await api.post('/category-athletes/', {
        category: categoryId,
        athlete: athleteId
      })
    }

    navigate('/my-enrollments')
  }

  return (
    <Container sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5">Enroll Athletes</Typography>
          <TextField
            select
            label="Category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Athletes"
            SelectProps={{ multiple: true }}
            value={selectedAthletes}
            onChange={(event) => setSelectedAthletes(event.target.value)}
          >
            {athletes.map((athlete) => (
              <MenuItem key={athlete.id} value={athlete.id}>
                {athlete.first_name} {athlete.last_name}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Button variant="contained" onClick={handleEnroll}>
              Submit Enrollments
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  )
}

export default EnrollPage
