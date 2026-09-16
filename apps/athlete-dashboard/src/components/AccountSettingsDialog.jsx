import { useState } from 'react';
import { authAPI } from '@shared/lib/api';
import {
  Alert, Button, Input, Label, Req,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from './ui';

/** "Cont" tab: email (read-only) + phone. Mirrors public-site's own account
 * tab (now removed there, since account management for an approved athlete
 * lives here instead). */
function AccountTab({ user, onSaved }) {
  const initialPhone = user.phone_number || user.athlete?.mobile_number || '';
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const hasChanges = phoneNumber !== initialPhone;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (!hasChanges) return;
    setBusy(true);
    try {
      await authAPI.updateProfile({ phone_number: phoneNumber });
      onSaved?.();
      setMessage({ type: 'success', text: 'Datele contului au fost actualizate.' });
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === 'object' ? Object.values(data)[0] : null;
      setMessage({ type: 'destructive', text: (Array.isArray(firstError) ? firstError[0] : firstError) || 'Nu am putut actualiza datele contului.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="account-email">Adresă de email</Label>
        <Input id="account-email" type="email" required disabled value={user.email || ''} />
        <p className="text-xs text-muted-foreground">Adresa de email nu poate fi schimbată din cont.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="account-phone">Telefon</Label>
        <Input id="account-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy || !hasChanges} className="self-start">
        {busy ? 'Se salvează…' : 'Salvează'}
      </Button>
      {message && <Alert variant={message.type}>{message.text}</Alert>}
    </form>
  );
}

/** "Parolă" tab: requires the current password to change it. */
function PasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== newPasswordConfirm) {
      setMessage({ type: 'destructive', text: 'Parolele noi nu coincid.' });
      return;
    }
    setBusy(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMessage({ type: 'success', text: 'Parola a fost schimbată cu succes.' });
    } catch (err) {
      setMessage({ type: 'destructive', text: err.response?.data?.error || 'Nu am putut schimba parola.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="account-current-password">Parolă curentă<Req /></Label>
      <Input
        id="account-current-password"
        type="password"
        required
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <Label htmlFor="account-new-password">Parolă nouă<Req /></Label>
      <Input
        id="account-new-password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <Label htmlFor="account-new-password-confirm">Confirmă parola nouă<Req /></Label>
      <Input
        id="account-new-password-confirm"
        type="password"
        required
        autoComplete="new-password"
        value={newPasswordConfirm}
        onChange={(e) => setNewPasswordConfirm(e.target.value)}
      />
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? 'Se schimbă…' : 'Schimbă parola'}
      </Button>
      {message && <Alert variant={message.type}>{message.text}</Alert>}
    </form>
  );
}

export default function AccountSettingsDialog({ open, onOpenChange, user, onSaved }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen>
        <DialogHeader>
          <DialogTitle>Setări cont</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="cont">
          <TabsList>
            <TabsTrigger value="cont">Cont</TabsTrigger>
            <TabsTrigger value="parola">Parolă</TabsTrigger>
          </TabsList>
          <TabsContent value="cont" className="pt-4">
            <AccountTab user={user} onSaved={onSaved} />
          </TabsContent>
          <TabsContent value="parola" className="pt-4">
            <PasswordTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
