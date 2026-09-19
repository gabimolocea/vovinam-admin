import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fieldAPI } from '@shared/lib/api';
import { Button, Card, Label, PageHeader, Spinner } from '../components/ui';
import { Minus, Plus } from 'lucide-react';

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

      <Card className="mb-6 max-w-md p-5">
        <Label className="mb-3 block text-sm font-medium text-foreground">
          Câte tatami / terenuri sunt?
        </Label>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleSetCount(count - 1)}
            disabled={count <= 0 || saving}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-2xl font-bold text-foreground">
            {saving ? '…' : count}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleSetCount(count + 1)}
            disabled={count >= 20 || saving}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Max 20 terenuri</p>
      </Card>

      {fields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <Card key={field.id} className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">
                  {field.field_number}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{field.name}</h3>
                  <p className="text-xs text-muted-foreground">{field.is_active ? 'Activ' : 'Inactiv'}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
