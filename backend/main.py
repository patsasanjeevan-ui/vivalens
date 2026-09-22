import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

from api.routes import router as api_router
from api.websocket import router as ws_router

ALLOWED_ORIGINS = ["http://localhost:3005", "http://127.0.0.1:3005"]

app = FastAPI(title="VivaLens AI API", version="2.0.0", description="Backend for the VivaLens AI exam assistant PWA")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("VivaLens API started on port 8005")
    logger.info("CORS allowed origins: %s", ", ".join(ALLOWED_ORIGINS))
    logger.info("WebSocket endpoint: ws://localhost:8005/ws/stream")
    logger.info("WebSocket endpoint: ws://localhost:8005/ws/viva")


@app.get("/", tags=["Health"])
def read_root() -> dict[str, str]:
    logger.info("GET /")
    return {"message": "VivaLens AI API is running", "version": "2.0.0", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    logger.info("GET /health")
    return {"status": "ok"}
