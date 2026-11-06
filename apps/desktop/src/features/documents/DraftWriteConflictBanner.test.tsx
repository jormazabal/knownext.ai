import {render,screen,fireEvent} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {DraftWriteConflictBanner} from "./DraftWriteConflictBanner";
it("offers preservation before reviewing the private draft and keeps recovery accessible while busy",()=>{
  const onReview=vi.fn(),onRecovery=vi.fn();const view=render(<DraftWriteConflictBanner busy={false} onReview={onReview} onRecovery={onRecovery}/>);
  fireEvent.click(screen.getByRole("button",{name:"Conservar y revisar borrador"}));expect(onReview).toHaveBeenCalledTimes(1);
  view.rerender(<DraftWriteConflictBanner busy onReview={onReview} onRecovery={onRecovery}/>);
  expect(screen.getByRole("button",{name:"Conservando y revisando…"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"Recuperación"}));expect(onRecovery).toHaveBeenCalledTimes(1);
});
