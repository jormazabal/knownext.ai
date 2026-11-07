import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {WorkspaceContinuityNotice} from "./WorkspaceContinuityNotice";
afterEach(cleanup);
it("distinguishes an unacknowledged write from a read check and prevents replay while pending",()=>{
  const state={phase:"attention" as const,issue:"pending" as const,running:true,lastProtectedAt:null,checkpointMs:null};
  const view=render(<WorkspaceContinuityNotice state={state} onRetry={vi.fn()}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Guardado aún sin confirmar");expect(screen.getByRole("button")).toBeDisabled();
  view.rerender(<WorkspaceContinuityNotice state={{...state,issue:"reconcile-pending"}} onRetry={vi.fn()}/>);expect(screen.getByRole("status")).toHaveTextContent("Comprobación aún en curso");expect(screen.queryByText("Guardado aún sin confirmar")).not.toBeInTheDocument();
});
