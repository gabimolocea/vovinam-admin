"""AI assistant chat endpoints - see api/assistant.py for the Claude
tool-calling orchestration and api/assistant_tools.py for the actual
data-access/security-enforcing tool functions. Kept as plain APIViews
(not a ViewSet) since this isn't CRUD over one resource."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ..models import AssistantConversation, AssistantMessage
from .. import assistant
from .. import assistant_tools as tools


def _is_coach_or_admin(user):
    if getattr(user, 'is_admin', False):
        return True
    athlete = getattr(user, 'athlete', None)
    return bool(athlete and athlete.is_coach)


def _history_for(conversation):
    """Prior turns as plain {role, content} text pairs - the Claude
    Messages API's own input shape, and simple enough that we don't need
    to persist/replay the internal tool_use/tool_result block structure
    from earlier turns; each new turn starts its own fresh tool loop."""
    return [{'role': m.role, 'content': m.content} for m in conversation.messages.all() if m.content]


class _AssistantAccessMixin:
    """Shared IsAuthenticated + coach-or-admin gate + rate limit for both
    assistant endpoints. The role check mirrors RequireCoachOrAdmin's
    frontend gate, but is enforced here independently - the widget being
    hidden from other roles in the UI is not the real boundary."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'assistant'

    def _forbidden_if_not_allowed(self, request):
        if not _is_coach_or_admin(request.user):
            return Response({'error': 'Asistentul este disponibil doar pentru antrenori și administratori.'}, status=403)
        return None


class AssistantChatView(_AssistantAccessMixin, APIView):
    def post(self, request):
        forbidden = self._forbidden_if_not_allowed(request)
        if forbidden:
            return forbidden

        message_text = (request.data.get('message') or '').strip()
        if not message_text:
            return Response({'error': 'Mesajul este obligatoriu.'}, status=400)

        conversation_id = request.data.get('conversation_id')
        if conversation_id:
            conversation = AssistantConversation.objects.filter(pk=conversation_id, user=request.user).first()
            if not conversation:
                return Response({'error': 'Conversația nu a fost găsită.'}, status=404)
        else:
            conversation = AssistantConversation.objects.create(user=request.user)

        history = _history_for(conversation)
        AssistantMessage.objects.create(conversation=conversation, role='user', content=message_text)

        try:
            result = assistant.run_assistant_turn(request.user, history, message_text)
        except RuntimeError as exc:
            return Response({'error': str(exc)}, status=503)

        assistant_message = AssistantMessage.objects.create(
            conversation=conversation,
            role='assistant',
            content=result['reply'],
            tool_calls=result['tool_calls'],
        )
        conversation.save(update_fields=['updated_at'])

        return Response({
            'conversation_id': conversation.id,
            'message_id': assistant_message.id,
            'reply': result['reply'],
            'pending_confirmation': result['pending_confirmation'],
        })


class AssistantConfirmView(_AssistantAccessMixin, APIView):
    def post(self, request):
        forbidden = self._forbidden_if_not_allowed(request)
        if forbidden:
            return forbidden

        conversation_id = request.data.get('conversation_id')
        message_id = request.data.get('message_id')
        confirmed = request.data.get('confirmed', True)

        conversation = AssistantConversation.objects.filter(pk=conversation_id, user=request.user).first()
        if not conversation:
            return Response({'error': 'Conversația nu a fost găsită.'}, status=404)
        message = AssistantMessage.objects.filter(pk=message_id, conversation=conversation).first()
        if not message or not message.tool_calls:
            return Response({'error': 'Nu există o acțiune de confirmat.'}, status=404)

        pending = None
        for call in message.tool_calls:
            result = call.get('result') or {}
            if result.get('requires_confirmation') and result.get('status', 'pending') == 'pending':
                pending = call
                break
        if not pending:
            return Response({'error': 'Nu există o acțiune în așteptare pentru acest mesaj.'}, status=400)

        if not confirmed:
            pending['result']['status'] = 'cancelled'
            message.save(update_fields=['tool_calls'])
            return Response({'conversation_id': conversation.id, 'reply': 'Am anulat acțiunea.', 'pending_confirmation': None})

        tool_name = pending['result']['tool']
        args = pending['result']['args']
        outcome = tools.execute_confirmed_tool(request.user, tool_name, args)

        pending['result']['status'] = 'confirmed' if outcome['success'] else 'failed'
        pending['result']['outcome'] = outcome
        message.save(update_fields=['tool_calls'])

        if outcome['success']:
            reply = 'Gata - am aplicat modificarea.'
        else:
            reply = f"Nu am putut aplica modificarea: {outcome.get('error', 'eroare necunoscută')}"

        confirm_message = AssistantMessage.objects.create(conversation=conversation, role='assistant', content=reply)
        conversation.save(update_fields=['updated_at'])

        return Response({
            'conversation_id': conversation.id,
            'message_id': confirm_message.id,
            'reply': reply,
            'pending_confirmation': None,
        })


class AssistantConversationView(_AssistantAccessMixin, APIView):
    def get(self, request, pk=None):
        forbidden = self._forbidden_if_not_allowed(request)
        if forbidden:
            return forbidden
        conversation = AssistantConversation.objects.filter(pk=pk, user=request.user).first()
        if not conversation:
            return Response({'error': 'Conversația nu a fost găsită.'}, status=404)
        return Response({
            'id': conversation.id,
            'messages': [
                {
                    'id': m.id,
                    'role': m.role,
                    'content': m.content,
                    'pending_confirmation': next(
                        (
                            c['result'] for c in (m.tool_calls or [])
                            if c.get('result', {}).get('requires_confirmation') and c['result'].get('status', 'pending') == 'pending'
                        ),
                        None,
                    ),
                }
                for m in conversation.messages.all()
            ],
        })


class AssistantConversationsListView(_AssistantAccessMixin, APIView):
    """Most-recent-first list of the caller's own conversations, so the
    chat widget can offer "continue where you left off" instead of always
    starting fresh."""
    def get(self, request):
        forbidden = self._forbidden_if_not_allowed(request)
        if forbidden:
            return forbidden
        conversations = AssistantConversation.objects.filter(user=request.user).order_by('-updated_at')[:20]
        return Response({
            'conversations': [
                {'id': c.id, 'updated_at': c.updated_at, 'preview': (c.messages.filter(role='user').values_list('content', flat=True).first() or '')[:80]}
                for c in conversations
            ],
        })


class AssistantReportView(APIView):
    """Admin-only periodic usage report - see assistant.build_usage_report.
    Not the same access gate as the chat/confirm endpoints: a coach can
    use the assistant but never sees the aggregate report of everyone
    else's conversations, only an admin does."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not getattr(request.user, 'is_admin', False):
            return Response({'error': 'Raportul este disponibil doar pentru administratori.'}, status=403)

        try:
            days = int(request.query_params.get('days', 7))
        except (TypeError, ValueError):
            return Response({'error': 'Parametrul days trebuie să fie un număr întreg.'}, status=400)
        days = max(1, min(days, 90))

        until = timezone.now()
        since = until - timedelta(days=days)
        return Response(assistant.build_usage_report(since, until))
