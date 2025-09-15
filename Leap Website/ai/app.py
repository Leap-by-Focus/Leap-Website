from fastapi import FastAPI, UploadFile, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from pathlib import Path
from PIL import Image
import io, json

app = FastAPI(title="Leap AI")

# CORS (lokal OK; später Domain einschränken)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEX_PATH = Path(__file__).parent / "site_index.json"

@app.get("/health")
def health():
    return {"ok": True}

def load_index() -> List[dict]:
    if INDEX_PATH.exists():
        try:
            return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def simple_search(query: str, docs: List[dict], top_k: int = 5) -> List[dict]:
    if not query or not docs:
        return []
    q = set(query.lower().split())
    scored = []
    for d in docs:
        text = d.get("text","").lower()
        if not text: 
            continue
        w = set(text.split())
        # simple overlap score
        score = len(q & w) / (1 + len(q)) 
        if score > 0:
            scored.append({
                "title": d.get("title") or d.get("path"),
                "path": d.get("path"),
                "anchor": d.get("anchor",""),
                "score": float(score)
            })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]

@app.post("/api/chat")
async def chat(request: Request, text: Optional[str] = Form(None), image: UploadFile | None = None):
    """
    Nimmt EITHER:
      - multipart/form-data (text, optional image) ODER
      - application/json { "text": "..." }
    """
    user_text = text
    if user_text is None:
        # Versuch JSON
        try:
            payload = await request.json()
            if isinstance(payload, dict):
                user_text = payload.get("text")
        except Exception:
            user_text = None

    # Bild (optional) einlesen (OCR weggelassen; nur Info)
    img_note = ""
    if image is not None:
        raw = await image.read()
        try:
            _ = Image.open(io.BytesIO(raw))  # validieren
            img_note = " (Bild empfangen)"
        except Exception:
            img_note = " (Bild konnte nicht gelesen werden)"

    # sehr einfacher „Intents“-Switch:
    docs = load_index()
    doc_refs: List[dict] = []
    if user_text:
        q = user_text.lower()
        # Wenn nach Docs/Seiten gefragt wird → Suche
        if any(k in q for k in ["doku", "dokumentation", "docs", "hilfe", "seite", "wo finde ich", "tutorial", "kapitel", "login", "community"]):
            doc_refs = simple_search(user_text, docs, top_k=5)

    # Antwort bauen (MVP ohne LLM)
    if user_text:
        base_answer = f'Du hast geschrieben: “{user_text}”{img_note}.'
        if doc_refs:
            base_answer += "\n\nIch habe passende Seiten gefunden:"
        else:
            if docs:
                base_answer += "\n\nTipp: Frag z. B. „Wo finde ich die Dokumentation?“ oder „Login Seite?“, dann suche ich in eurer Website."
        answer = base_answer
    else:
        answer = "Hi! Schreib mir etwas – ich kann auch in eurer Website suchen (z. B. „Wo finde ich die Dokumentation?“)."

    return JSONResponse({
        "answer": answer,
        "issues": [],     # Platzhalter für Parser/Linter später
        "doc_refs": doc_refs
    })