import { useEffect, useState } from 'react';
import { assistantAPI } from '@shared/lib/api';
import {
  Card, CardHeader, CardTitle, CardContent, Badge, Alert, Skeleton, EmptyState,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui';

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d;
  }
}

function StatCard({ label, value }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

/** Admin-only periodic report of real assistant usage (see
 * backend/api/assistant.py's build_usage_report) - the practical way to
 * make the assistant "smarter" over time without retraining anything:
 * read what people actually ask and where a tool call actually failed,
 * then refine SYSTEM_PROMPT/assistant_tools.py based on that. */
export default function AssistantReportPage() {
  const [days, setDays] = useState('7');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    assistantAPI.report(days)
      .then(({ data }) => { if (!cancelled) setReport(data); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.error || 'Nu am putut încărca raportul.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Raport Asistent AI</h1>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-48" aria-label="Perioadă">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Ultimele 7 zile</SelectItem>
            <SelectItem value="30">Ultimele 30 de zile</SelectItem>
            <SelectItem value="90">Ultimele 90 de zile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Conversații" value={report.totals.conversations} />
            <StatCard label="Întrebări puse" value={report.totals.user_messages} />
            <StatCard label="Acțiuni propuse" value={report.write_actions.proposed} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Acțiuni de scriere (înscriere/dezînscriere)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              <Badge variant="secondary">Confirmate: {report.write_actions.confirmed || 0}</Badge>
              <Badge variant="outline">Anulate: {report.write_actions.cancelled || 0}</Badge>
              <Badge variant="destructive">Eșuate: {report.write_actions.failed || 0}</Badge>
              <Badge variant="outline">În așteptare: {report.write_actions.pending || 0}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Utilizare unelte</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {report.tool_usage.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio unealtă apelată în această perioadă.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unealtă</TableHead>
                      <TableHead>Apeluri</TableHead>
                      <TableHead>Erori</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tool_usage.map((t) => (
                      <TableRow key={t.tool}>
                        <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                        <TableCell>{t.count}</TableCell>
                        <TableCell>{t.errors > 0 ? <Badge variant="destructive">{t.errors}</Badge> : 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Erori recente ale uneltelor</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {report.recent_errors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio eroare în această perioadă.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {report.recent_errors.map((e, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.tool}</span>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)} · {e.user}</span>
                      </div>
                      <p className="mt-1 text-foreground">{e.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Întrebări recente</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {report.recent_questions.length === 0 ? (
                <EmptyState title="Nicio conversație" message="Nimeni nu a folosit asistentul în această perioadă." />
              ) : (
                <div className="flex flex-col gap-2">
                  {report.recent_questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{q.user}</span>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(q.created_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{q.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
