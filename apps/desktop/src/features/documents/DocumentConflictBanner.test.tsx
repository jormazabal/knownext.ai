import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {DocumentConflictBanner} from "./DocumentConflictBanner";
afterEach(cleanup);
it("offers reviewed recovery instead of replacement actions for an incompatible note source",()=>{
  const recover=vi.fn(),review=vi.fn(),keep=vi.fn();const props={conflictStatus:'disk-changed' as const,onKeepLocalVersion:keep,onLoadDiskVersion:vi.fn(),onMergeDiskVersion:vi.fn(),onReviewRecovery:recover,onRetrySource:review};const view=render(<DocumentConflictBanner {...props} sourceUnavailable recoveryMessage="El borrador conocido se conserva."/>);
  expect(screen.getByText('La fuente necesita revisión')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Mantener mi versión'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cargar disco'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Comparar y combinar'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Recuperar copia'}));fireEvent.click(screen.getByRole('button',{name:'Revisar fuente'}));expect(recover).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);expect(keep).not.toHaveBeenCalled();
  view.rerender(<DocumentConflictBanner {...props}/>);expect(screen.getByRole('button',{name:'Comparar y combinar'})).toBeInTheDocument();
});
