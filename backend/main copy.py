import os
import time
import base64
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from fpdf import FPDF

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_STORAGE = {
    "current_file_uri": None,
    "current_file_name": None
}

client = genai.Client()

class ChatRequest(BaseModel):
    user_message: str

def generate_pdf_in_memory(text_content: str) -> str:
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=11)
        for line in text_content.split('\n'):
            clean_line = line.encode('latin-1', 'ignore').decode('latin-1')
            pdf.multi_cell(0, 6, txt=clean_line)
        pdf_bytes = pdf.output(dest='S')
        return base64.b64encode(pdf_bytes).decode('utf-8')
    except Exception as e:
        print(f"PDF Compiler Fault: {e}")
        return ""

@app.post("/api/upload-tender")
async def upload_tender(file: UploadFile = File(...), module_type: str = Form(...)):
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY variable is missing.")

    temp_dir = os.path.join(os.getcwd(), "temp_files")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, file.filename)
    
    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())
        
    try:
        # 1. Upload using the Files API
        print(f"Uploading file to Google Staging: {file.filename}")
        google_file_handle = client.files.upload(file=temp_path)
        
        # 2. CRITICAL FIX: Loop wait until the document state is 'ACTIVE'
        # This keeps the backend from crashing while processing large PDFs
        print("Waiting for Gemini to process and parse file structure...")
        while google_file_handle.state.name == "PROCESSING":
            time.sleep(2)
            google_file_handle = client.files.get(name=google_file_handle.name)
            
        if google_file_handle.state.name == "FAILED":
            raise HTTPException(status_code=500, detail="Google API failed to index your file framework.")

        print("File is now ACTIVE. Passing context matrix to model...")
        SESSION_STORAGE["current_file_uri"] = google_file_handle
        SESSION_STORAGE["current_file_name"] = file.filename
        
        prompts = {
            "synopsis": "Provide a comprehensive executive tender synopsis covering submission deadlines, structural criteria, values, and milestone goals based on this document.",
            "scope": "Isolate and list the explicit technical, environmental, and operational Scope of Work parameters from this tender.",
            "ppt": "Draft a slide-by-slide project proposal presentation outline structured around these tender specifications.",
            "risk": "Generate a detailed Risk Register matrix with explicit RAG (Red, Amber, Green) impact designations and corresponding mitigation protocols."
        }
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[google_file_handle, prompts.get(module_type, "Analyze this document.")]
        )
        
        pdf_base64 = generate_pdf_in_memory(response.text)
        
        return {
            "text": response.text,
            "pdfData": f"data:application/pdf;base64,{pdf_base64}" if pdf_base64 else None,
            "fileName": f"{module_type}_report.pdf",
            "activeFile": file.filename
        }
    except Exception as e:
        print(f"Backend Crash Encountered: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/chat-followup")
async def chat_followup(payload: ChatRequest):
    file_handle = SESSION_STORAGE.get("current_file_uri")
    
    contents = []
    if file_handle:
        contents.append(file_handle)
    contents.append(payload.user_message)
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents
        )
        pdf_base64 = generate_pdf_in_memory(response.text)
        return {
            "text": response.text,
            "pdfData": f"data:application/pdf;base64,{pdf_base64}" if pdf_base64 else None,
            "fileName": "chat_followup_response.pdf"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-session")
async def clear_session():
    SESSION_STORAGE["current_file_uri"] = None
    SESSION_STORAGE["current_file_name"] = None
    return {"status": "session cleared"}