from pydantic import BaseModel


class AiPromptRequest(BaseModel):
    prompt: str
    markdown: str = ""


class AiPromptResponse(BaseModel):
    answer: str
    suggestedActions: list[str]
