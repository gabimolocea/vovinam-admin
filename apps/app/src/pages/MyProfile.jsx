import { Navigate } from 'react-router-dom';
import { useAuth } from '@shared';
import { Alert, Skeleton } from '../components/ui';

/** "Profilul meu" - every role that has an athlete record (a plain athlete,
 * or a coach, who is an athlete too) lands here, which just points the
 * athlete detail page at their own record: same hero+tabs UI, same ability
 * to add their own results/grades/seminars/visas (AthleteDetail.jsx hides
 * the review/approve buttons when viewing yourself - see isSelf there -
 * since self-approval doesn't make sense, and shows them for a coach/admin
 * viewing someone else). An admin has no athlete record and never reaches
 * this route - see RoleIndexRedirect in App.jsx. */
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
