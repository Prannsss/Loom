from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pdfplumber
import docx
import io
import uvicorn
from humanizer import Humanizer

app = FastAPI(title="Loom AI Humanization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

humanizer = Humanizer()

class HumanizeRequest(BaseModel):
    text: str

@app.get("/")
async def root():
    return {"status": "ok", "message": "Loom AI Python Backend is running."}

@app.post("/humanize")
async def humanize_text(request: HumanizeRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        humanized = humanizer.process(request.text)
        return {"originalText": request.text, "humanizedText": humanized}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/extract")
async def extract_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
        
    try:
        contents = await file.read()
        extracted_text = ""
        
        if file.filename.endswith('.pdf'):
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                pages = [page.extract_text() for page in pdf.pages]
                extracted_text = "\n".join(filter(None, pages))
                
        elif file.filename.endswith('.docx'):
            doc = docx.Document(io.BytesIO(contents))
            extracted_text = "\n".join([p.text for p in doc.paragraphs if p.text])
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF or DOCX.")
            
        return {"filename": file.filename, "text": extracted_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
