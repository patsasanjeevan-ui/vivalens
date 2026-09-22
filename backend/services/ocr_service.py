import asyncio
import os

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

async def process_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Extract document context with Gemini, with a useful offline response."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key.startswith("your_gemini"):
        return (
            "Gemini is not configured. The document was received; configure an API key "
            "or Ollama to generate document-specific viva questions."
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = (
            "Analyze this university exam document. Extract its topics, questions, "
            "definitions, formulas, and key concepts in a structured format for a strict "
            "oral viva examiner. Be factual and concise."
        )
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=[
                prompt,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
        )
        return response.text or "No text could be extracted from this document."
    except Exception as exc:
        print(f"[ocr_service] Error processing image: {exc}")
        return "Document uploaded, but OCR is temporarily unavailable. You can still start a viva with the visible document topics."
