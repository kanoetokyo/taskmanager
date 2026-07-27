import { afterEach, describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import { isAllowedGitHubActionsPreviewSync } from "./calendarTaskCron";

const originalVercelEnvironment = process.env.VERCEL_ENV;

const approvedPayload: JWTPayload = {
  repository: "kanoetokyo/taskmanager",
  ref: "refs/heads/main",
  event_name: "workflow_dispatch",
  workflow_ref:
    "kanoetokyo/taskmanager/.github/workflows/run-calendar-preview-sync.yml@refs/heads/main",
};

afterEach(() => {
  if (originalVercelEnvironment === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnvironment;
  }
});

describe("GitHub Actions calendar synchronization authorization", () => {
  it("accepts only the approved manual workflow on the Preview environment", () => {
    process.env.VERCEL_ENV = "preview";

    expect(isAllowedGitHubActionsPreviewSync(approvedPayload)).toBe(true);
  });

  it("rejects production, another branch, and another workflow", () => {
    process.env.VERCEL_ENV = "production";
    expect(isAllowedGitHubActionsPreviewSync(approvedPayload)).toBe(false);

    process.env.VERCEL_ENV = "preview";
    expect(
      isAllowedGitHubActionsPreviewSync({
        ...approvedPayload,
        ref: "refs/heads/calendar-task-automation",
      })
    ).toBe(false);
    expect(
      isAllowedGitHubActionsPreviewSync({
        ...approvedPayload,
        workflow_ref: "kanoetokyo/taskmanager/.github/workflows/other.yml@refs/heads/main",
      })
    ).toBe(false);
  });
});
