import { useCallback, useState } from 'react';
import { assistantAPI } from '@shared/lib/api';

/** State/logic for the AI assistant chat widget (AssistantWidget.jsx).
 * Keeps the component itself thin, matching the split used elsewhere in
 * this app (e.g. useCoachCentralizator.js vs CompetitionCentralizator.jsx).
 *
 * A message is `{ id, role: 'user'|'assistant', content, pendingConfirmation }`
 * - `pendingConfirmation` (only ever set on an assistant message) is
 * `{ summary, status }` while a proposed write action from the backend
 * (see backend/api/assistant_tools.py) is still awaiting the user's
 * confirm/cancel; the actual write only happens after that, never when
 * the message first arrives. */
export default function useAssistant() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError('');
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: trimmed }]);
    setSending(true);
    try {
      const { data } = await assistantAPI.chat(trimmed, conversationId);
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: data.message_id,
          role: 'assistant',
          content: data.reply,
          pendingConfirmation: data.pending_confirmation ? { ...data.pending_confirmation, status: 'pending' } : null,
        },
      ]);
    } catch (err) {
      setError(err?.response?.data?.error || 'Asistentul nu a putut răspunde. Încearcă din nou.');
    } finally {
      setSending(false);
    }
  }, [conversationId, sending]);

  const resolvePendingAction = useCallback(async (messageId, confirmed) => {
    if (!conversationId) return;
    setSending(true);
    setError('');
    try {
      const { data } = await assistantAPI.confirm(conversationId, messageId, confirmed);
      setMessages((prev) => prev.map((m) => (
        m.id === messageId
          ? { ...m, pendingConfirmation: { ...m.pendingConfirmation, status: confirmed ? 'confirmed' : 'cancelled' } }
          : m
      )));
      setMessages((prev) => [...prev, { id: data.message_id || `local-${Date.now()}`, role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err?.response?.data?.error || 'Nu am putut finaliza acțiunea. Încearcă din nou.');
    } finally {
      setSending(false);
    }
  }, [conversationId]);

  const confirmAction = useCallback((messageId) => resolvePendingAction(messageId, true), [resolvePendingAction]);
  const cancelAction = useCallback((messageId) => resolvePendingAction(messageId, false), [resolvePendingAction]);

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError('');
  }, []);

  return { messages, sending, error, sendMessage, confirmAction, cancelAction, reset };
}
