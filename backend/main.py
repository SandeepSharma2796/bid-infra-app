import os
import time
import base64
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from fpdf import FPDF

# ──────────────────────────────────────────────
# Load .env BEFORE anything else that reads env
# ──────────────────────────────────────────────
load_dotenv()

# ──────────────────────────────────────────────
# Logging setup
# ──────────────────────────────────────────────
LOG_FILE = os.path.join(os.getcwd(), "app.log")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),                          # console
        logging.FileHandler(LOG_FILE, encoding="utf-8"), # file
    ],
)
logger = logging.getLogger("bid_infra")

# Quiet noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)

# ──────────────────────────────────────────────
# Startup / shutdown lifecycle
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("Bid-Infra backend starting up")
    logger.info(f"App log  : {LOG_FILE}  |  Uvicorn log: server.log")
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        logger.info(f"GEMINI_API_KEY loaded (length={len(api_key)})")
    else:
        logger.critical("GEMINI_API_KEY is NOT set — all AI calls will fail!")
    logger.info("=" * 60)
    yield
    logger.info("Bid-Infra backend shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Session Storage
# ──────────────────────────────────────────────
SESSION_STORAGE: dict = {
    "current_file_uris": [],
    "current_file_names": [],
}

client = genai.Client()

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    user_message: str


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def generate_pdf_in_memory(text_content: str) -> str:
    """Convert plain text to a base64-encoded PDF string."""
    logger.debug("Generating PDF from response text (%d chars)", len(text_content))
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=11)
        for line in text_content.split("\n"):
            clean_line = line.encode("latin-1", "ignore").decode("latin-1")
            pdf.multi_cell(0, 6, txt=clean_line)
        pdf_bytes = pdf.output(dest="S")
        b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        logger.debug("PDF generated successfully (%d base64 chars)", len(b64))
        return b64
    except Exception as exc:
        logger.exception("PDF generation failed: %s", exc)
        return ""


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
@app.post("/api/upload-tender")
async def upload_tender(
    module_type: str = Form(...),
    file: List[UploadFile] = File(...)
):
    if not os.environ.get("GEMINI_API_KEY"):
        logger.error("GEMINI_API_KEY is missing — aborting upload")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY variable is missing.")

    temp_dir = os.path.join(os.getcwd(), "temp_files")
    os.makedirs(temp_dir, exist_ok=True)
    
    uploaded_file_handles = []
    uploaded_file_names = []

    try:
        # 1. Upload files
        for current_file in file:
            temp_path = os.path.join(temp_dir, current_file.filename)
            file_bytes = await current_file.read()
            with open(temp_path, "wb") as buffer:
                buffer.write(file_bytes)
            
            logger.info("Uploading file to Google Files API: %s", current_file.filename)
            google_file_handle = client.files.upload(file=temp_path)
            
            uploaded_file_handles.append(google_file_handle)
            uploaded_file_names.append(current_file.filename)
            os.remove(temp_path)

        # 2. Wait for processing
        active_handles = []
        for handle in uploaded_file_handles:
            google_file_handle = handle
            poll_count = 0
            while google_file_handle.state.name == "PROCESSING":
                poll_count += 1
                logger.debug("File %s PROCESSING (poll #%d) — waiting 2s…", google_file_handle.name, poll_count)
                time.sleep(2)
                google_file_handle = client.files.get(name=google_file_handle.name)

            if google_file_handle.state.name == "FAILED":
                raise HTTPException(status_code=500, detail=f"Google API failed to process: {google_file_handle.name}")
            
            active_handles.append(google_file_handle)

        logger.info("All files processed successfully.")

        # 3. Update Session
        SESSION_STORAGE["current_file_uris"] = active_handles
        SESSION_STORAGE["current_file_names"] = uploaded_file_names

        # 4. Prepare Prompts
        combined_filenames = ", ".join(uploaded_file_names)
        num_files = len(active_handles)
        
        prompts = {
            "synopsis": f"Provide a comprehensive, synthesized executive tender synopsis. You MUST extract and combine the submission deadlines, structural criteria, values, and milestone goals from ALL {num_files} provided documents ({combined_filenames}). Do not just summarize one document.",
            "scope":    f"Isolate and list the explicit technical, environmental, and operational Scope of Work parameters. You MUST combine the scope from ALL {num_files} provided documents ({combined_filenames}).",
            "ppt":      f"Draft a slide-by-slide project proposal presentation outline. You MUST structure this outline by combining specifications from ALL {num_files} provided documents ({combined_filenames}).",
            "risk":     f"Generate a detailed Risk Register matrix. You MUST identify risks across ALL {num_files} provided documents ({combined_filenames}) with explicit RAG (Red, Amber, Green) impact designations and mitigation protocols.",
        }

        base_prompt = prompts.get(module_type, "Analyze these documents.")
        
        prompt_text = (
            f"{base_prompt}\n\n"
            f"CRITICAL INSTRUCTION: I have uploaded {num_files} distinct files. "
            "You must read every single file and synthesize a single, unified report that includes information from all of them. "
            "If the documents contain overlapping or different information, synthesize them logically."
        )

        # 5. Build Interleaved Contents Array (THE FIX)
        # By putting text markers around the files, we force the AI to read them as separate, required inputs.
        contents = []
        for name, handle in zip(uploaded_file_names, active_handles):
            contents.append(f"--- START OF DOCUMENT: {name} ---")
            contents.append(handle)
            contents.append(f"--- END OF DOCUMENT: {name} ---")
        
        contents.append(prompt_text)

        logger.info("Sending %d fenced files + prompt to AI (module=%s)", len(active_handles), module_type)

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
        )

        pdf_base64 = generate_pdf_in_memory(response.text)

        return {
            "text": response.text,
            "pdfData": f"data:application/pdf;base64,{pdf_base64}" if pdf_base64 else None,
            "fileName": f"{module_type}_report.pdf",
            "activeFile": combined_filenames,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in /api/upload-tender: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/chat-followup")
async def chat_followup(payload: ChatRequest):
    logger.info("POST /api/chat-followup | message=%r", payload.user_message[:120])

    file_handles = SESSION_STORAGE.get("current_file_uris", [])
    active_files = SESSION_STORAGE.get("current_file_names", [])
    
    persona_instruction = (
        "System Instruction: You are 'Bid Management AI'. "
        "If a user asks for your name or who you are, strictly reply that you are Bid Management AI. "
        "Do not mention Gemini, Google, or that you are a large language model."
    )
    
    contents = []
    
    if file_handles:
        logger.debug("Using %d session files for context", len(file_handles))
        # Build the same fenced structure for chat memory
        for name, handle in zip(active_files, file_handles):
            contents.append(f"--- START OF DOCUMENT: {name} ---")
            contents.append(handle)
            contents.append(f"--- END OF DOCUMENT: {name} ---")
        
        contents.append(persona_instruction)
        contents.append(payload.user_message)
    else:
        logger.warning("No active session files — sending text-only request")
        contents = [persona_instruction, payload.user_message]

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
        )
        logger.info("Chat response received (%d chars)", len(response.text))
        pdf_base64 = generate_pdf_in_memory(response.text)

        return {
            "text": response.text,
            "pdfData": f"data:application/pdf;base64,{pdf_base64}" if pdf_base64 else None,
            "fileName": "chat_followup_response.pdf",
        }

    except Exception as exc:
        logger.exception("Unhandled error in /api/chat-followup: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/clear-session")
async def clear_session():
    logger.info("POST /api/clear-session — clearing active files")
    SESSION_STORAGE["current_file_uris"] = []
    SESSION_STORAGE["current_file_names"] = []
    return {"status": "session cleared"}