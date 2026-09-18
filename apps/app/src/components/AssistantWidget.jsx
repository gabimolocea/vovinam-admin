import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Textarea, Spinner, Alert } from './ui';
import useAssistant from '../hooks/useAssistant';
import { Sparkles, Send } from 'lucide-react';

/** One turn in the chat thread. A pending write action (see
 * useAssistant.js's pendingConfirmation shape) renders as its own inline
 * card with Confirm/Cancel - it never applies automatically, matching
 * the confirm-before-anything-hard-to-reverse pattern already used
 * elsewhere in this app (e.g. useCoachCentralizator.js's confirmModal
 * before an unenroll). */
function MessageBubble({ message, onConfirm, onCancel, busy }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border p-3 text-sm ${isUser ? 'ml-6 bg-primary/5' : 'mr-6 bg-card'}`}>
      <p className="whitespace-pre-wrap text-foreground">{message.content}</p>
      {message.pendingConfirmation && (
        <div className="rounded-md border border-border bg-muted p-3">
          <p className="text-sm font-medium text-foreground">{message.pendingConfirmation.summary}</p>
          {message.pendingConfirmation.status === 'pending' ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => onConfirm(message.id)} disabled={busy}>Confirmă</Button>
              <Button size="sm" variant="outline" onClick={() => onCancel(message.id)} disabled={busy}>Anulează</Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {message.pendingConfirmation.status === 'confirmed' && 'Confirmat.'}
              {message.pendingConfirmation.status === 'cancelled' && 'Anulat.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssistantWidget() {
  const { isAdmin, isCoach } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { messages, sending, error, sendMessage, confirmAction, cancelAction } = useAssistant();
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  if (!isAdmin && !isCoach) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const text = draft;
    setDraft('');
    await sendMessage(text);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Deschide asistentul AI"
        title="Asistent AI"
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[65] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent fullScreen className="flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Asistent AI
            </DialogTitle>
          </DialogHeader>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto py-2">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Întreabă-mă orice despre aplicație - de exemplu „cum înscriu un sportiv la o competiție?” - sau cere-mi să fac o modificare direct.
              </p>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onConfirm={confirmAction} onCancel={cancelAction} busy={sending} />
            ))}
            {sending && (
              <div className="mr-6 flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                <Spinner className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Se gândește...</span>
              </div>
            )}
            {error && <Alert variant="destructive">{error}</Alert>}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Scrie un mesaj..."
              className="min-h-11 flex-1 resize-none"
              rows={1}
            />
            <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Trimite">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
