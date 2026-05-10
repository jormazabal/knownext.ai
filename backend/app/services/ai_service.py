from app.schemas.ai import AiPromptRequest, AiPromptResponse


class AiService:
    def prompt_document(self, document_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        return AiPromptResponse(
            answer=(
                "La asistencia IA todavía no está configurada para este documento. "
                "KnowNext.ai no generará respuestas simuladas; cuando se active un proveedor real, "
                "la consulta se resolverá desde FastAPI con contexto del documento activo."
            ),
            suggestedActions=[],
        )

    def prompt_project(self, project_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        return AiPromptResponse(
            answer=(
                "La asistencia IA todavía no está configurada para este proyecto. "
                "KnowNext.ai no generará respuestas simuladas; cuando se active un proveedor real, "
                "la consulta se resolverá desde FastAPI con contexto de la documentación del proyecto."
            ),
            suggestedActions=[],
        )


ai_service = AiService()
