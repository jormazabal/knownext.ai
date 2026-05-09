from dataclasses import dataclass


@dataclass(frozen=True)
class DocumentPath:
    project_id: str
    path: str

