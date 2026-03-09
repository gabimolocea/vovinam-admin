import { PageHeader } from '@shared/components/ui';

export default function GradeManagement() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Examene" subtitle="Modulul de examene este momentan în construcție." />

      <section className="frvv-surface overflow-hidden">
        <div className="border-b border-black bg-yellow-300 px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-900">În curând</h2>
        </div>
        <div className="px-6 py-10 text-center sm:px-10">
          <div className="text-5xl mb-4">🚧</div>
          <h3 className="text-lg font-black text-gray-900">Pagina de examene este în construcție</h3>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Funcționalitățile pentru înscrierea sportivilor la examene și gestionarea fișelor de examinare
            vor fi reactivate după finalizarea noului flux.
          </p>
        </div>
      </section>
    </div>
  );
}
