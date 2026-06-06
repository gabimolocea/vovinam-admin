import { useAuth } from '@shared';
import { useNavigate } from 'react-router-dom';

export default function UserProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const athlete = user?.athlete;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h2 className="text-lg font-black uppercase tracking-[0.18em] text-gray-800">Profilul meu</h2>

      {/* User account */}
      <section className="frvv-surface p-4 md:p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Cont utilizator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email" value={user?.email} />
          <Field label="Utilizator" value={user?.username} />
          <Field label="Prenume" value={user?.first_name} />
          <Field label="Nume" value={user?.last_name} />
          <Field label="Rol" value={user?.role} />
          <Field label="Telefon" value={user?.phone_number} />
        </div>
      </section>

      {/* Athlete profile */}
      <section className="frvv-surface p-4 md:p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">Profil sportiv asociat</h3>
        {athlete ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Prenume" value={athlete.first_name} />
              <Field label="Nume" value={athlete.last_name} />
              <Field label="Status" value={athlete.status} />
              <Field label="Club ID" value={athlete.club} />
              <Field
                label="Antrenor"
                value={athlete.is_coach ? 'Da' : 'Nu'}
              />
              <Field
                label="Arbitru"
                value={athlete.is_referee ? 'Da' : 'Nu'}
              />
            </div>
            <button
              onClick={() => navigate(`/athletes/${athlete.id}`)}
              className="mt-2 border-2 border-black px-4 py-2 text-xs font-bold uppercase tracking-wide hover:bg-yellow-300 transition"
            >
              Deschide profil sportiv
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500">Niciun profil sportiv asociat acestui cont.</p>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500 mb-0.5">{label}</span>
      <span className="block text-sm text-gray-800">{value || <span className="text-gray-400">—</span>}</span>
    </div>
  );
}
