"""
Channels middleware to authenticate WebSocket connections using JWT access tokens.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


@database_sync_to_async
def _get_user(token):
    if not token:
        return AnonymousUser()

    jwt_auth = JWTAuthentication()
    try:
        validated_token = jwt_auth.get_validated_token(token)
        return jwt_auth.get_user(validated_token)
    except (InvalidToken, TokenError):
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    """Authenticate WebSocket scope using a JWT passed as ?token=..."""

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token = params.get("token", [None])[0]

        scope["user"] = await _get_user(token)
        return await super().__call__(scope, receive, send)


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)
