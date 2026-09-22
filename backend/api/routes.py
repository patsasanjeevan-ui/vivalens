import io
import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from PyPDF2 import PdfReader

from services.ocr_service import process_image

logger = logging.getLogger(__name__)
router = APIRouter()
session_context: dict[str, str] = {"document_text": ""}


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """Extract and store the document context used by the viva WebSocket."""
    filename = file.filename or "document"
    content_type = (file.content_type or "application/octet-stream").lower()
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")

    logger.info("Document upload filename=%s content_type=%s bytes=%d", filename, content_type, len(content))

    try:
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            reader = PdfReader(io.BytesIO(content))
            extracted_text = "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()
        elif content_type.startswith("text/") or filename.lower().endswith((".txt", ".md", ".csv")):
            extracted_text = content.decode("utf-8", errors="replace").strip()
        elif content_type.startswith("image/"):
            extracted_text = await process_image(content, content_type)
        else:
            raise HTTPException(status_code=415, detail="Upload a PDF, text file, or image document.")
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Document extraction failed filename=%s", filename)
        raise HTTPException(status_code=422, detail=f"Could not extract document text: {error}") from error

    if not extracted_text:
        raise HTTPException(status_code=422, detail="No readable text was found in the document.")

    session_context["document_text"] = extracted_text
    logger.info("Document context stored characters=%d", len(extracted_text))
    return {
        "filename": filename,
        "status": "success",
        "extracted_text": extracted_text,
        "snippet": extracted_text[:500],
        "characters": len(extracted_text),
    }
