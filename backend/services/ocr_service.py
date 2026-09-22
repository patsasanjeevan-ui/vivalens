import asyncio
import os

async def process_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Extract document context with Gemini, with a useful offline response."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key.startswith("your_gemini"):
        return (
            "Gemini is not configured. The document was received; configure an API key "
            "or Ollama to generate document-specific viva questions."
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = (
            "Analyze this university exam document. Extract its topics, questions, "
            "definitions, formulas, and key concepts in a structured format for a strict "
            "oral viva examiner. Be factual and concise."
        )
        response = await asyncio.to_thread(
            model.generate_content,
            [prompt, {"mime_type": mime_type, "data": image_bytes}],
        )
        return response.text or "No text could be extracted from this document."
    except Exception as exc:
        print(f"[ocr_service] Error processing image: {exc}")
        return "Document uploaded, but OCR is temporarily unavailable. You can still start a viva with the visible document topics."
