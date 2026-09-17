import json
import unittest
from unittest.mock import AsyncMock, patch

from starlette.websockets import WebSocket, WebSocketState

from backend.app import main
from backend.app.session import SessionManager


class WebSocketDisconnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_broadcast_before_receive_ends_connection_cleanly(self):
        manager = SessionManager()
        session_id = manager.create(language='en')
        incoming = iter([
            {'type': 'websocket.connect'},
            {'type': 'websocket.receive', 'text': json.dumps({
                'type': 'join', 'name': 'Synthetic host',
                'clientId': 'test-client', 'language': 'en', 'wantsHost': True,
            })},
        ])

        async def receive():
            return next(incoming)

        async def send(message):
            if message['type'] == 'websocket.send':
                payload = json.loads(message['text'])
                if payload['type'] != 'joined':
                    raise OSError('Client disconnected during a broadcast')

        websocket = WebSocket({'type': 'websocket'}, receive, send)
        with patch.object(main, 'sessions', manager), \
             patch.object(main.db, 'save_participant', new_callable=AsyncMock):
            await main.websocket_endpoint(websocket, session_id)
        self.assertEqual(websocket.application_state, WebSocketState.DISCONNECTED)
        self.assertFalse(manager.get(session_id).participants)
