from app.schemas.ai import AiPromptRequest, AiPromptResponse


class AiService:
    def prompt_document(self, document_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        prompt = payload.prompt.strip()
        return AiPromptResponse(
            answer=(
                "Respuesta simulada para el documento "
                f"{document_id}: se ha recibido la consulta '{prompt}'. "
                "La integración real se conectará aquí mediante un proveedor IA gestionado por FastAPI."
            ),
            suggestedActions=["Resumir documento", "Extraer acuerdos", "Crear lista de tareas"],
        )

    def prompt_project(self, project_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        prompt = payload.prompt.strip()
        return AiPromptResponse(
            answer=(
                "Respuesta simulada para la documentación del proyecto "
                f"{project_id}: se ha recibido la consulta '{prompt}'. "
                "La integración real consultará el contexto documental del proyecto desde FastAPI."
            ),
            suggestedActions=["Buscar en el proyecto", "Resumir documentación", "Detectar tareas pendientes"],
        )


ai_service = AiService()
