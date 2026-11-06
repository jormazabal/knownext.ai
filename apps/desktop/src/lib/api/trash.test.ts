import {expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {reviewProjectTrash,restoreProjectTrash,reviewTrashRestoreAttempt} from "./trash";
vi.mock("./client",()=>({requestJson:vi.fn().mockResolvedValue({})}));
it("separates readonly review from restoration with only the reviewed proof",async()=>{
  await reviewProjectTrash("project/name","trash-id");
  expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%2Fname/trash/trash-id/review");
  const attemptId="attempt-"+"1".repeat(32);
  await restoreProjectTrash("project/name","trash-id","a".repeat(64),attemptId);
  expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%2Fname/trash/trash-id/restore",{method:"POST",body:JSON.stringify({revision:"a".repeat(64),attemptId})});
  await reviewTrashRestoreAttempt("project/name","trash-id",attemptId);
  expect(requestJson).toHaveBeenLastCalledWith(`/api/projects/project%2Fname/trash/trash-id/restores/${attemptId}`);
});
