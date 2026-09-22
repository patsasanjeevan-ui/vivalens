import asyncio
import logging
import os
import random
from typing import Any

import httpx

logger = logging.getLogger(__name__)
GEMINI_MODEL = "gemini-2.0-flash"
MAX_RETRIES = 4
BASE_DELAY_SECONDS = 1.5
MAX_DELAY_SECONDS = 20.0
PROFESSOR_SYSTEM_PROMPT = (
    "You are an exacting university viva-voce professor. You MUST only ask viva questions "
    "based strictly and exclusively on the provided document context. Do not invent topics "
    "outside this document. Ask one focused question at a time, challenge vague answers, "
    "never reveal the answer, and keep each response under 80 words. "
    "If the user greets you, asks to begin, or makes casual conversation, acknowledge them "
    "naturally and ask the first question based on the document context. Do not treat "
    "greetings or casual setup phrases as failed academic answers."
)


def _is_rate_limit_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(value in message for value in ("429", "quota", "resourceexhausted", "rate limit"))


def _backoff(attempt: int) -> float:
    base = min(BASE_DELAY_SECONDS * (2**attempt), MAX_DELAY_SECONDS)
    return base + random.uniform(0, base * 0.25)


async def _query_ollama(history: list[dict[str, str]], user_message: str, document_context: str = "") -> str:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    messages: list[dict[str, str]] = [{"role": "system", "content": PROFESSOR_SYSTEM_PROMPT}]
    if document_context:
        messages.append({"role": "system", "content": f"DOCUMENT CONTEXT:\n{document_context}"})
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    try:
        logger.info("Querying local Ollama fallback model=%s", model)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{base_url}/api/chat", json={"model": model, "messages": messages, "stream": False})
            response.raise_for_status()
            content = response.json().get("message", {}).get("content", "Please continue.")
            return content.strip() or "Please continue."
    except Exception:
        logger.exception("Ollama fallback failed")
        return "I cannot reach the examiner service right now. Please check the local model and try again."


async def _query_local_stt(audio_bytes: bytes, mime_type: str) -> str:
    endpoint = os.getenv("LOCAL_STT_URL", "").strip()
    if not endpoint:
        return ""
    try:
        logger.info("Sending audio to local STT endpoint=%s bytes=%d", endpoint, len(audio_bytes))
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(endpoint, files={"file": ("answer.webm", audio_bytes, mime_type)})
            response.raise_for_status()
            data = response.json()
            return str(data.get("text", data.get("transcription", ""))).strip()
    except Exception:
        logger.exception("Local STT fallback failed")
        return ""


class VivaChatSession:
    """A viva conversation with Gemini audio STT and Ollama fallback."""

    def __init__(self) -> None:
        self.context = ""
        self.history: list[dict[str, str]] = []
        self._chat: Any = None
        self._gemini_model: Any = None
        self._gemini_exhausted = False
        self._opening = "Good morning. Let us begin the viva examination."

    def start_session(self, document_context: str) -> None:
        self.context = document_context
        self.history = []
        self._chat = None
        self._gemini_model = None
        self._gemini_exhausted = False
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key or api_key.startswith("your_gemini"):
            logger.info("Gemini API key is not configured; using local fallbacks")
            self._gemini_exhausted = True
            return
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            self._gemini_model = genai.GenerativeModel(GEMINI_MODEL, system_instruction=PROFESSOR_SYSTEM_PROMPT)
            self._chat = self._gemini_model.start_chat(history=[])
            opening_prompt = f"Document context:\n{document_context}\n\nBegin with one rigorous opening question."
            self._opening = self._chat.send_message(opening_prompt).text or self._opening
            self.history.append({"role": "assistant", "content": self._opening})
            logger.info("Gemini viva session started context_chars=%d", len(document_context))
        except Exception as error:
            logger.exception("Gemini session setup failed")
            self._chat = None
            self._gemini_model = None
            self._gemini_exhausted = _is_rate_limit_error(error)

    def get_opening(self) -> str:
        return self._opening

    async def _query_gemini(self, message: str) -> str:
        for attempt in range(MAX_RETRIES):
            try:
                response = await asyncio.to_thread(self._chat.send_message, message)
                return response.text or "Please elaborate on that point."
            except Exception as error:
                if not _is_rate_limit_error(error):
                    raise
                logger.warning("Gemini quota/rate limit attempt=%d/%d", attempt + 1, MAX_RETRIES)
                if attempt == MAX_RETRIES - 1:
                    self._gemini_exhausted = True
                    break
                await asyncio.sleep(_backoff(attempt))
        return await _query_ollama(self.history, message, self.context)

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        if not audio_bytes:
            return ""
        if self._gemini_model is not None and not self._gemini_exhausted:
            prompt = "Transcribe this student answer exactly. Return only the spoken words, without commentary."
            for attempt in range(MAX_RETRIES):
                try:
                    response = await asyncio.to_thread(self._gemini_model.generate_content, [prompt, {"mime_type": mime_type, "data": audio_bytes}])
                    text = (response.text or "").strip()
                    logger.info("Gemini STT completed chars=%d", len(text))
                    return text
                except Exception as error:
                    if not _is_rate_limit_error(error):
                        logger.exception("Gemini STT failed")
                        break
                    logger.warning("Gemini STT quota/rate limit attempt=%d/%d", attempt + 1, MAX_RETRIES)
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(_backoff(attempt))
            self._gemini_exhausted = True
        text = await _query_local_stt(audio_bytes, mime_type)
        if text:
            return text
        logger.warning("No speech-to-text provider returned a transcript")
        return ""

    async def get_response(self, user_message: str) -> str:
        clean_message = user_message.strip()
        if not clean_message:
            return "Please answer the question when you are ready."
        self.history.append({"role": "user", "content": clean_message})
        if self._chat is None or self._gemini_exhausted:
            response = await _query_ollama(self.history, clean_message, self.context)
        else:
            try:
                response = await self._query_gemini(clean_message)
            except Exception:
                logger.exception("Gemini response failed; using Ollama fallback")
                response = await _query_ollama(self.history, clean_message, self.context)
        self.history.append({"role": "assistant", "content": response})
        return response

    async def get_response_from_audio(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> tuple[str, str]:
        transcript = await self.transcribe_audio(audio_bytes, mime_type)
        if not transcript:
            return "", "I could not hear a clear answer. Please check your microphone and try again."
        return transcript, await self.get_response(transcript)
