import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {MixedRetirementDialog} from "./MixedRetirementDialog";
import {reviewMixedRetirement, retireMixedPayloads} from "../../lib/api/mixedRetirement";
import type {MixedRetirement} from "../../types/mixedRetirement";
vi.mock("../../lib/api/mixedRetirement", () => ({reviewMixedRetirement:vi.fn(), retireMixedPayloads:vi.fn()}));
afterEach(() => {cleanup();vi.resetAllMocks();});
const review: MixedRetirement = {schemaVersion:1, projectId:"p", planId:"mixed-"+"1".repeat(32), revision:"a".repeat(64), phase:"available", archiveSha256:"b".repeat(64), archiveBytes:2000, remainingCount:4, totalCount:4, remainingBytes:1000, canRetire:true, receiptsPreserved:true, identitiesPreserved:true, projectFilesUnchanged:true, checkedAt:"2026-11-02T12:00:00Z"};
it("requires permanent scope acknowledgement and fresh review after an interrupted operation", async () => {
  const partial: MixedRetirement = {...review, phase:"partial", remainingCount:1, remainingBytes:100};
  vi.mocked(reviewMixedRetirement).mockResolvedValueOnce(review).mockResolvedValueOnce(partial);
  vi.mocked(retireMixedPayloads).mockResolvedValue({review:partial, observed:true, cancelled:false});
  render(<MixedRetirementDialog projectId="p" planId={review.planId} projectName="Proyecto revisado" onClose={vi.fn()}/>);
  await screen.findByText("Copias disponibles");expect(screen.getByText("Proyecto revisado")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Elegir respaldo y retirar copias"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button", {name:"Elegir respaldo y retirar copias"}));
  await screen.findByText(/Acuse no confirmado/);expect(screen.getByText("Retirada interrumpida")).toBeInTheDocument();expect(screen.queryByRole("button", {name:"Elegir respaldo y retirar copias"})).not.toBeInTheDocument();expect(retireMixedPayloads).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", {name:"Revisar retirada"}));await screen.findByRole("checkbox");expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("ignores a former project's late response", async () => {
  let finish!: (value:MixedRetirement) => void;
  vi.mocked(reviewMixedRetirement).mockImplementationOnce(() => new Promise(resolve => {finish=resolve;})).mockRejectedValueOnce(Error("Retirada futura conservada"));
  const view = render(<MixedRetirementDialog projectId="p" planId={review.planId} onClose={vi.fn()}/>);
  await waitFor(() => expect(reviewMixedRetirement).toHaveBeenCalledWith("p",review.planId));view.rerender(<MixedRetirementDialog projectId="other" planId={review.planId} onClose={vi.fn()}/>);
  await screen.findByRole("alert");await act(async () => finish(review));expect(screen.queryByText("Copias disponibles")).not.toBeInTheDocument();expect(retireMixedPayloads).not.toHaveBeenCalled();
});
