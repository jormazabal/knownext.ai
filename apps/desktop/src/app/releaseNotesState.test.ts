import { describe, expect, it } from "vitest";
import {
  RELEASE_NOTES_UTILITY_TAB_ID,
  ensureReleaseNotesTab,
  removeReleaseNotesTab,
  shouldOpenReleaseNotesAfterStartup,
} from "./releaseNotesState";

describe("releaseNotesState", () => {
  it("adds and removes the release notes utility tab without duplicating it", () => {
    expect(ensureReleaseNotesTab([])).toEqual([RELEASE_NOTES_UTILITY_TAB_ID]);
    expect(ensureReleaseNotesTab(["notes", RELEASE_NOTES_UTILITY_TAB_ID])).toEqual(["notes", RELEASE_NOTES_UTILITY_TAB_ID]);
    expect(removeReleaseNotesTab(["notes", RELEASE_NOTES_UTILITY_TAB_ID])).toEqual(["notes"]);
  });

  it("opens release notes only after an unseen app version change", () => {
    expect(shouldOpenReleaseNotesAfterStartup({ lastRunAppVersion: "2.0.1", lastSeenReleaseNotesVersion: "2.0.1" }, "2.0.2")).toBe(true);
    expect(shouldOpenReleaseNotesAfterStartup({ lastRunAppVersion: "2.0.2", lastSeenReleaseNotesVersion: "2.0.1" }, "2.0.2")).toBe(false);
    expect(shouldOpenReleaseNotesAfterStartup({ lastRunAppVersion: "2.0.1", lastSeenReleaseNotesVersion: "2.0.2" }, "2.0.2")).toBe(false);
    expect(shouldOpenReleaseNotesAfterStartup({ lastRunAppVersion: null, lastSeenReleaseNotesVersion: null }, "2.0.2")).toBe(false);
  });
});
