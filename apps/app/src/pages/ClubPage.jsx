import { useAuth } from '@shared';
import ClubEdit from './ClubEdit';
import MyClub from './MyClub';

/** `/club` is shared between a coach and a plain athlete - a coach gets
 * the full management page (roster + exams, edit dialog), a plain athlete
 * gets a read-only view of the same club (see MyClub.jsx). Kept as one
 * route/nav entry rather than two, matching how `/profil` already works
 * across both roles. */
export default function ClubPage() {
  const { isCoach } = useAuth();
  return isCoach ? <ClubEdit /> : <MyClub />;
}
