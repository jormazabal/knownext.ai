import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStorageUsage } from "../../lib/api/storageUsage";
import type { StorageUsage } from "../../types/storageUsage";
import { StorageUsagePanel } from "./StorageUsagePanel";

vi.mock("../../lib/api/storageUsage", () => ({getStorageUsage: vi.fn()}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

const usage: StorageUsage = {
  schemaVersion: 1, id: "local-storage-usage", checkedAt: "2026-10-31T20:00:00Z",
  scope: "app-data-regular-files", appDataPath: "C:/QA/Almacén",
  measurement: {groups: [{id: "projects", logicalBytes: 2048, files: 2}], logicalBytes: 2048, files: 2, visitedEntries: 3, skippedLinks: 0, unreadableEntries: 0, limited: false, complete: true, durationMs: 1},
  locations: [{id: "p", name: "Proyecto retirado", folderPath: "D:/Documentos originales", state: "retired"}],
  locationsComplete: true, externalRootsMeasured: false, cleanupAvailable: false, warnings: [],
  limits: {entries: 10000, milliseconds: 2000, locations: 256},
};

it("queries only on explicit activation, shows scope and preserved locations without a cleanup action", async () => {
  vi.mocked(getStorageUsage).mockResolvedValue(usage);
  render(<StorageUsagePanel/>);
  expect(getStorageUsage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Ver uso local"}));
  await screen.findByRole("button", {name: "Actualizar medición"});
  expect(getStorageUsage).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/tamaño lógico, no espacio libre/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Ubicaciones de proyectos", {exact: false}));
  expect(screen.getByText("D:/Documentos originales")).toBeVisible();
  expect(screen.getByText(/retirado/, {selector: "span"})).toBeVisible();
  expect(screen.queryByRole("button", {name: /limpiar|eliminar/i})).not.toBeInTheDocument();
});

it("keeps the previous measurement after a failed refresh and blocks duplicate submissions", async () => {
  vi.mocked(getStorageUsage).mockResolvedValueOnce(usage);
  render(<StorageUsagePanel/>);
  fireEvent.click(screen.getByRole("button", {name: "Ver uso local"}));
  await screen.findByRole("button", {name: "Actualizar medición"});
  let reject!: (error: Error) => void;
  vi.mocked(getStorageUsage).mockImplementationOnce(() => new Promise((_, fail) => {reject = fail;}));
  fireEvent.click(screen.getByRole("button", {name: "Actualizar medición"}));
  const pending = screen.getByRole("button", {name: "Midiendo…"});
  fireEvent.click(pending);
  expect(pending).toBeDisabled();
  expect(getStorageUsage).toHaveBeenCalledTimes(2);
  reject(new Error("No se pudo consultar el almacén"));
  await screen.findByRole("alert");
  expect(screen.getByText("C:/QA/Almacén")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Actualizar medición"})).toBeEnabled();
});

it("labels partial zero as a lower bound and unavailable locations in English", async () => {
  vi.mocked(getStorageUsage).mockResolvedValue({...usage,
    measurement: {...usage.measurement, files: 0, logicalBytes: 0, limited: true, complete: false, skippedLinks: 1, groups: [{id: "projects", files: 0, logicalBytes: 0}]},
    locations: [], locationsComplete: false, warnings: ["project-registry-unavailable"],
  });
  render(<StorageUsagePanel english/>);
  fireEvent.click(screen.getByRole("button", {name: "View local usage"}));
  await screen.findByText("At least 0 B");
  expect(screen.getByText("≥ 0 B")).toBeInTheDocument();
  expect(screen.getByText("Partial measurement")).toBeInTheDocument();
  expect(screen.getByText(/1 link omitted/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Project locations/, {selector: "summary"}));
  expect(screen.getByText(/The project registry could not be read/)).toBeVisible();
  expect(screen.getByText("Project locations could not be fully queried.")).toBeVisible();
  expect(screen.queryByText("No project locations are registered.")).not.toBeInTheDocument();
  await waitFor(() => expect(getStorageUsage).toHaveBeenCalledTimes(1));
});
