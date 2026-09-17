import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Label, Textarea,
} from './ui';

/** Confirmation dialog for any "Respinge" action - lets the reviewer type
 * an optional custom reason (sent to the person whose submission/account
 * was rejected, by email); left blank, `defaultNote` is used instead, so
 * every reject action still has a message even when nobody bothers to
 * type one. `open` is the reject target's own describing object (title +
 * defaultNote + onConfirm) rather than a boolean, so a single dialog
 * instance can serve many different reject buttons on the same page. */
export default function RejectReasonDialog({ target, onOpenChange }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) setReason('');
  }, [target]);

  async function handleConfirm() {
    setSaving(true);
    try {
      await target.onConfirm(reason.trim() || target.defaultNote);
      onOpenChange(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>{target?.title || 'Respinge'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="reject_reason">Motiv (opțional)</Label>
            <Textarea
              id="reject_reason"
              rows={4}
              placeholder={target?.defaultNote}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="destructive" disabled={saving} onClick={handleConfirm}>
              {saving ? 'Se respinge…' : 'Respinge'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
