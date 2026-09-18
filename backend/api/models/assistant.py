from django.db import models
from django.utils.translation import gettext_lazy as _

from ._common import User


class AssistantConversation(models.Model):
    """A chat thread between one user and the AI assistant (see
    api/assistant.py). Kept separate from AssistantMessage so a user can
    have several conversations and reopen one by id."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name=_('Utilizator'), related_name='assistant_conversations')
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = _('Conversație asistent')
        verbose_name_plural = _('Conversații asistent')

    def __str__(self):
        return f"Conversație #{self.pk} - {self.user.get_full_name()}"


class AssistantMessage(models.Model):
    """One turn in an AssistantConversation. `tool_calls` carries both the
    audit trail of anything the assistant did on the user's behalf and, for
    a write action awaiting confirmation, its pending/confirmed/cancelled
    state - see api/assistant.py's run_assistant_turn()."""
    ROLE_CHOICES = [
        ('user', 'Utilizator'),
        ('assistant', 'Asistent'),
    ]

    conversation = models.ForeignKey(AssistantConversation, on_delete=models.CASCADE, verbose_name=_('Conversație'), related_name='messages')
    role = models.CharField(_('Rol'), max_length=10, choices=ROLE_CHOICES)
    content = models.TextField(_('Conținut'), blank=True)
    tool_calls = models.JSONField(_('Apeluri unelte'), default=list, blank=True)
    created_at = models.DateTimeField(_('Data creării'), auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = _('Mesaj asistent')
        verbose_name_plural = _('Mesaje asistent')

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"
