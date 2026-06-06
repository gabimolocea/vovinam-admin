import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fieldAPI } from '@shared/lib/api';
import { PageHeader, Card, Spinner } from '@shared/components/ui';

export default function FieldsPage() {
  const { id: eventId } = useParams();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchFields = () => {
    fieldAPI.list({ competition: eventId }).then(({ data }) => {
      const list = Array.isArray(data) ? data : data.results ?? [];
      setFields(list);
      setCount(list.length);
      setLoading(false);
    });
  };

  useEffect(fetchFields, [eventId]);

  const handleSetCount = async (newCount) => {
    if (newCount < 0 || newCount > 20) return;
    setCount(newCount);
    setSaving(true);
    try {
      const { data } = await fieldAPI.setCount(eventId, newCount);
      const list = Array.isArray(data) ? data : data.results ?? [];
      setFields(list);
      setCount(list.length);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader title="Terenuri / Tatami" subtitle={`Competiția #${eventId}`} />

      <Card className="mb-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Câte tatami / terenuri sunt?
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSetCount(count - 1)}
            disabled={count <= 0 || saving}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-2xl font-bold text-gray-900">
            {saving ? '…' : count}
          </span>
          <button
            onClick={() => handleSetCount(count + 1)}
            disabled={count >= 20 || saving}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30"
          >
            +
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">Max 20 terenuri</p>
      </Card>

      {fields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <Card key={field.id}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
                  {field.field_number}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{field.name}</h3>
                  <p className="text-xs text-gray-400">{field.is_active ? 'Activ' : 'Inactiv'}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
