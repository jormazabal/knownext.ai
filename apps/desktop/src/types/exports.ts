export type MobileExportReceipt = { requestId: string; completedAt: string } & (
  { status: "cancelled" } | { status: "saved"; exportId: string; fileName: string; byteLength: number }
);
