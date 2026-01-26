from fastapi import APIRouter
import schemas
from services.gemini_service import get_ai_response

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

@router.post("/chat", response_model=schemas.ChatResponse)
async def chat(request: schemas.ChatRequest):
    response_text = await get_ai_response(request.prompt)
    return schemas.ChatResponse(response=response_text)
