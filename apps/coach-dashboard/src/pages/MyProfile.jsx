import { Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Skeleton } from '../components/ui';

/** "Profilul meu" - a coach is an athlete too, so this is just the athlete
 * detail page pointed at their own record: same hero+tabs UI, same ability
 * to add their own results/grades/seminars/visas (AthleteDetail.jsx hides
 * the review/approve buttons for a coach viewing themselves - see isSelf
 * there - since self-approval doesn't make sense). */
export default function MyProfile() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!user?.athlete_id) {
    return <Alert variant="destructive">Contul tău nu are un profil de sportiv asociat.</Alert>;
  }

  return <Navigate to={`/athletes/${user.athlete_id}`} replace />;
}
