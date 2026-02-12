import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Container, Typography, Paper, Grid, CircularProgress, Alert } from '@mui/material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { competitionAPI } from '../services/api';

export default function CategoryEnrollPage() {
  const { categoryId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [available, setAvailable] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [category, setCategory] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const catRes = await competitionAPI.getCategories();
        const cat = (catRes.data || []).find(c => String(c.id) === String(categoryId));
        setCategory(cat || null);
        // Fetch available and enrolled athletes/teams
        const availableRes = await competitionAPI.getAvailableForCategory(categoryId);
        const enrolledRes = await competitionAPI.getEnrolledForCategory(categoryId);
        setAvailable(availableRes.data || []);
        setEnrolled(enrolledRes.data || []);
      } catch (err) {
        setError('Failed to load category data.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [categoryId]);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    if (result.source.droppableId === result.destination.droppableId) return;
    // Only allow drag from available to enrolled
    if (result.source.droppableId === 'available' && result.destination.droppableId === 'enrolled') {
      const athlete = available[result.source.index];
      try {
        // Call API to enroll
        await competitionAPI.enrollInCategory(categoryId, athlete.id);
        setEnrolled([...enrolled, athlete]);
        setAvailable(available.filter((_, idx) => idx !== result.source.index));
      } catch (err) {
        setError('Failed to enroll athlete/team.');
      }
    }
  };

  if (loading) return <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>;
  if (error) return <Box p={4}><Alert severity="error">{error}</Alert></Box>;

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Enroll Athletes/Teams in {category?.name || 'Category'}
        </Typography>
        <DragDropContext onDragEnd={onDragEnd}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6">Available</Typography>
              <Droppable droppableId="available">
                {(provided) => (
                  <Paper ref={provided.innerRef} {...provided.droppableProps} sx={{ minHeight: 300, p: 2 }}>
                    {available.map((item, idx) => (
                      <Draggable key={item.id} draggableId={String(item.id)} index={idx}>
                        {(prov) => (
                          <Box ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} sx={{ mb: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            {item.name || item.full_name || item.team_name}
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Paper>
                )}
              </Droppable>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6">Enrolled</Typography>
              <Droppable droppableId="enrolled">
                {(provided) => (
                  <Paper ref={provided.innerRef} {...provided.droppableProps} sx={{ minHeight: 300, p: 2 }}>
                    {enrolled.map((item, idx) => (
                      <Box key={item.id} sx={{ mb: 1, p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                        {item.name || item.full_name || item.team_name}
                      </Box>
                    ))}
                    {provided.placeholder}
                  </Paper>
                )}
              </Droppable>
            </Grid>
          </Grid>
        </DragDropContext>
      </Container>
    </Box>
  );
}
