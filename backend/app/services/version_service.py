from app.schemas.version import VersionRecord
from app.services.mock_store import VERSIONS


class VersionService:
    def get_document_versions(self, document_id: str) -> list[VersionRecord]:
        return [VersionRecord(**version) for version in VERSIONS]


version_service = VersionService()

