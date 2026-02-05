import { useMemo, useState } from 'react'
import {
  Button,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { uploadMatches } from '../services/sync'

const BracketsPanel = () => {
  const categories = useLiveQuery(() => db.categories.toArray(), []) || []
  const athletes = useLiveQuery(() => db.athletes.toArray(), []) || []
  const matches = useLiveQuery(() => db.matches.toArray(), []) || []
  const categoryAthletes = useLiveQuery(() => db.category_athletes.toArray(), []) || []

  const [matchForm, setMatchForm] = useState({
    category_id: '',
    match_type: 'qualifications',
    red_corner: '',
    blue_corner: ''
  })

  const [generateCategoryId, setGenerateCategoryId] = useState('')

  const handleChange = (field) => (event) => {
    setMatchForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleCreateMatch = async () => {
    if (!matchForm.category_id || !matchForm.red_corner || !matchForm.blue_corner) return
    await db.matches.add({
      id: Date.now(),
      category_id: Number(matchForm.category_id),
      match_type: matchForm.match_type,
      red_corner: Number(matchForm.red_corner),
      blue_corner: Number(matchForm.blue_corner),
      name: `Match ${matches.length + 1}`,
      synced: 0,
      server_id: null,
      updated_at: new Date().toISOString()
    })
    setMatchForm({ category_id: '', match_type: 'qualifications', red_corner: '', blue_corner: '' })
  }

  const categoryOptions = useMemo(() => categories, [categories])
  const athleteOptions = useMemo(() => athletes, [athletes])
  const athleteMap = useMemo(() => {
    return athletes.reduce((acc, athlete) => {
      acc[athlete.id] = `${athlete.first_name} ${athlete.last_name}`
      return acc
    }, {})
  }, [athletes])

  const categoryMap = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category.id] = category
      return acc
    }, {})
  }, [categories])

  const handleGenerateMatches = async () => {
    if (!generateCategoryId) return
    const categoryId = Number(generateCategoryId)
    const enrolled = categoryAthletes
      .filter((entry) => entry.category_id === categoryId)
      .map((entry) => entry.athlete_id)

    if (enrolled.length < 2) return

    const pairs = []
    for (let i = 0; i < enrolled.length; i += 2) {
      if (enrolled[i + 1]) {
        pairs.push([enrolled[i], enrolled[i + 1]])
      }
    }

    let counter = matches.length
    for (const [red, blue] of pairs) {
      counter += 1
      await db.matches.add({
        id: Date.now() + Math.floor(Math.random() * 1000),
        category_id: categoryId,
        match_type: 'qualifications',
        red_corner: red,
        blue_corner: blue,
        name: `Match ${counter}`,
        synced: 0,
        server_id: null,
        updated_at: new Date().toISOString()
      })
    }
  }

  const handleGenerateFightBracket = async () => {
    if (!generateCategoryId) return
    const categoryId = Number(generateCategoryId)
    const category = categoryMap[categoryId]
    if (!category || category.type !== 'fight') return

    const enrolled = categoryAthletes
      .filter((entry) => entry.category_id === categoryId)
      .map((entry) => entry.athlete_id)

    if (enrolled.length < 2) return

    const pairs = []
    for (let i = 0; i < enrolled.length; i += 2) {
      if (enrolled[i + 1]) {
        pairs.push([enrolled[i], enrolled[i + 1]])
      }
    }

    let counter = matches.length
    for (const [red, blue] of pairs) {
      counter += 1
      await db.matches.add({
        id: Date.now() + Math.floor(Math.random() * 1000),
        category_id: categoryId,
        match_type: 'qualifications',
        red_corner: red,
        blue_corner: blue,
        name: `Fight ${counter}`,
        synced: 0,
        server_id: null,
        updated_at: new Date().toISOString()
      })
    }
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Create Match
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Category"
              value={matchForm.category_id}
              onChange={handleChange('category_id')}
            >
              {categoryOptions.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Match Type"
              value={matchForm.match_type}
              onChange={handleChange('match_type')}
            >
              <MenuItem value="qualifications">Qualifications</MenuItem>
              <MenuItem value="semi-finals">Semi-Finals</MenuItem>
              <MenuItem value="finals">Finals</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Red Corner"
              value={matchForm.red_corner}
              onChange={handleChange('red_corner')}
            >
              {athleteOptions.map((athlete) => (
                <MenuItem key={athlete.id} value={athlete.id}>
                  {athlete.first_name} {athlete.last_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Blue Corner"
              value={matchForm.blue_corner}
              onChange={handleChange('blue_corner')}
            >
              {athleteOptions.map((athlete) => (
                <MenuItem key={athlete.id} value={athlete.id}>
                  {athlete.first_name} {athlete.last_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button variant="contained" onClick={handleCreateMatch}>
              Save Match
            </Button>
            <Button sx={{ ml: 2 }} variant="outlined" onClick={uploadMatches}>
              Upload Matches
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Generate Matches from Enrollments
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Category"
              value={generateCategoryId}
              onChange={(event) => setGenerateCategoryId(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button variant="outlined" onClick={handleGenerateMatches}>
              Generate Matches
            </Button>
            <Button sx={{ ml: 2 }} variant="outlined" onClick={handleGenerateFightBracket}>
              Generate Fight Bracket
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Local Matches ({matches.length})
        </Typography>
        <Stack spacing={1}>
          {matches.map((match) => (
            <Typography key={match.id} variant="body2">
              {match.name} - {athleteMap[match.red_corner]} vs {athleteMap[match.blue_corner]} ({categoryMap[match.category_id]?.name || 'Category'})
            </Typography>
          ))}
        </Stack>
      </Paper>
    </Stack>
  )
}

export default BracketsPanel
