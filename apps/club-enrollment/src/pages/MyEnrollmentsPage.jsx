import { useEffect, useState } from 'react'
import {
  Box,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { api } from '../services/api'

const MyEnrollmentsPage = () => {
  const [enrollments, setEnrollments] = useState([])

  useEffect(() => {
    const fetchEnrollments = async () => {
      const response = await api.get('/category-athletes/')
      setEnrollments(response.data || [])
    }

    fetchEnrollments()
  }, [])

  return (
    <Container sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5">My Enrollments</Typography>
          {enrollments.map((enrollment, index) => (
            <Box key={`${enrollment.athlete?.id}-${index}`}>
              <Typography variant="body2">
                {enrollment.athlete?.first_name} {enrollment.athlete?.last_name}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Container>
  )
}

export default MyEnrollmentsPage
