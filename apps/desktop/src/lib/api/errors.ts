export class ApiError extends Error {
  status: number;
  detail?: unknown;
  operationOutcome?: "not-started" | "not-applied" | "unknown";
  code?: string;
  operationId?: string;

  constructor(status: number, statusText: string, detail?: unknown, operationOutcome?: "not-started" | "not-applied" | "unknown", code?: string, operationId?: string) {
    const detailMessage = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
    super(detailMessage ? `${status} ${statusText}: ${detailMessage}` : `${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.operationOutcome = operationOutcome;
    this.code = code;
    this.operationId = operationId;
  }
}
