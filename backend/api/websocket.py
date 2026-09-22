import base64
import binascii
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.routes import session_context
from services.local_llm_service import VivaChatSession

logger = logging.getLogger(__name__)
router = APIRouter()
MAX_AUDIO_BYTES = 15 * 1024 * 1024


@router.websocket("/stream")
@router.websocket("/viva")
async def websocket_endpoint(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin", "")
    logger.info("WebSocket connection request origin=%s client=%s", origin, websocket.client)
    await websocket.accept()
    logger.info("WebSocket accepted origin=%s", origin)

    chat_session = VivaChatSession()
    session_started = False
    audio_buffer = bytearray()
    audio_mime_type = "audio/webm"
    transcript_debounce_task: asyncio.Task[None] | None = None

    async def send_event(event_type: str, payload: str | dict) -> None:
        logger.info("WebSocket send type=%s payload_chars=%d", event_type, len(str(payload)))
        await websocket.send_json({"type": event_type, "payload": payload})

    async def process_transcript(text: str) -> None:
        nonlocal session_started
        if not session_started:
            logger.info("Transcript arrived before start; loading stored document context")
            chat_session.start_session(session_context.get("document_text", ""))
            session_started = True
        logger.info("Processing final transcript chars=%d text=%r", len(text), text)
        await send_event("processing", "Examiner is thinking...")
        response = await chat_session.get_response(text)
        await send_event("ai_speaking", response)
        await send_event("ai_done", "")

    try:
        while True:
            raw = await websocket.receive_text()
            logger.info("WebSocket message received chars=%d", len(raw))
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                message = {"type": "speech", "payload": raw}

            message_type = str(message.get("type", "speech"))
            payload = message.get("payload", "")
            logger.info("WebSocket message type=%s", message_type)

            if message_type == "ping":
                await send_event("pong", "")
                continue

            if message_type == "start":
                context = str(payload).strip() or session_context.get("document_text", "")
                logger.info("Starting viva session context_chars=%d", len(context))
                chat_session.start_session(context)
                session_started = True
                await send_event("ready", chat_session.get_opening())
                continue

            if message_type == "audio_chunk":
                if not isinstance(payload, dict):
                    logger.error("Invalid audio_chunk payload: expected object")
                    await send_event("error", "Invalid audio chunk payload.")
                    continue
                encoded_audio = payload.get("data", "")
                if not isinstance(encoded_audio, str) or not encoded_audio:
                    logger.error("Audio chunk had no Base64 data")
                    await send_event("error", "Audio chunk did not contain Base64 data.")
                    continue
                try:
                    decoded_audio = base64.b64decode(encoded_audio, validate=True)
                except (ValueError, binascii.Error):
                    logger.exception("Base64 audio decoding failed")
                    await send_event("error", "Audio data was not valid Base64.")
                    continue
                if len(audio_buffer) + len(decoded_audio) > MAX_AUDIO_BYTES:
                    logger.error("Audio buffer exceeded maximum bytes=%d", MAX_AUDIO_BYTES)
                    audio_buffer.clear()
                    await send_event("error", "Audio answer is too large. Please record a shorter answer.")
                    continue
                audio_buffer.extend(decoded_audio)
                audio_mime_type = str(payload.get("mimeType", audio_mime_type))
                logger.info("Audio chunk decoded bytes=%d total_bytes=%d mime=%s", len(decoded_audio), len(audio_buffer), audio_mime_type)
                continue

            if message_type == "audio":
                if not session_started:
                    logger.info("Audio arrived before start; creating session from stored context")
                    chat_session.start_session(session_context.get("document_text", ""))
                    session_started = True
                encoded_audio = payload if isinstance(payload, str) else str(payload.get("data", "")) if isinstance(payload, dict) else ""
                mime_type = str(message.get("mimeType", "audio/webm"))
                try:
                    audio_bytes = base64.b64decode(encoded_audio, validate=True)
                except (ValueError, binascii.Error):
                    logger.exception("Complete Base64 audio decoding failed")
                    await send_event("error", "Audio data was not valid Base64.")
                    continue
                if not audio_bytes:
                    await send_event("error", "No recorded audio was received.")
                    continue
                logger.info("Processing complete audio message bytes=%d mime=%s", len(audio_bytes), mime_type)
                await send_event("processing", "Transcribing your answer...")
                transcript, response = await chat_session.get_response_from_audio(audio_bytes, mime_type)
                if transcript:
                    await send_event("transcript", transcript)
                await send_event("ai_speaking", response)
                await send_event("ai_done", "")
                continue

            if message_type == "audio_end":
                if not session_started:
                    logger.info("Audio arrived before start; creating empty-context session")
                    chat_session.start_session("")
                    session_started = True
                if not audio_buffer:
                    logger.warning("Audio end received with empty buffer")
                    await send_event("error", "No recorded audio was received.")
                    continue
                audio_bytes = bytes(audio_buffer)
                audio_buffer.clear()
                logger.info("Processing completed audio answer bytes=%d mime=%s", len(audio_bytes), audio_mime_type)
                await send_event("processing", "Transcribing your answer...")
                transcript, response = await chat_session.get_response_from_audio(audio_bytes, audio_mime_type)
                if transcript:
                    await send_event("transcript", transcript)
                await send_event("ai_speaking", response)
                await send_event("ai_done", "")
                continue

            if message_type in {"speech", "transcript"}:
                text = str(payload).strip()
                if not text:
                    logger.info("Ignoring empty interim transcript payload")
                    continue
                if transcript_debounce_task is not None and not transcript_debounce_task.done():
                    transcript_debounce_task.cancel()

                async def wait_for_final_transcript(final_text: str) -> None:
                    await asyncio.sleep(0.25)
                    await process_transcript(final_text)

                transcript_debounce_task = asyncio.create_task(wait_for_final_transcript(text))
                logger.info("Transcript queued for debounce chars=%d", len(text))
                continue

            logger.warning("Unknown WebSocket message type=%s", message_type)
            await send_event("error", f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected cleanly client=%s", websocket.client)
    except Exception:
        logger.exception("Unhandled WebSocket failure")
        try:
            await send_event("error", "The voice session encountered an unexpected server error.")
        except Exception:
            logger.exception("Could not send WebSocket error event")
