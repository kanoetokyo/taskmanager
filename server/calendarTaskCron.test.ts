import { afterEach, describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import { isAllowedGitHubActionsSync } from "./calendarTaskCron";

const originalVercelEnvironment = process.env.VERCEL_ENV;

const approvedPreviewPayload: JWTPayload = {
  repository: "kanoetokyo/taskmanager",
  ref: "refs/heads/main",
  event_name: "workflow_dispatch",
  workflow_ref:
    "kanoetokyo/taskmanager/.github/workflows/run-calendar-preview-sync.yml@refs/heads/main",
};

const approvedProductionPayload: JWTPayload = {
  ...approvedPreviewPayload,
  workflow_ref:
    "kanoetokyo/taskmanager/.github/workflows/run-calendar-production-sync.yml@refs/heads/main",
};

afterEach(() => {
  if (originalVercelEnvironment === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = originalVercelEnvironment;
  }
});

describe("GitHub Actions calendar synchronization authorization", () => {
  it("accepts only the approved manual workflow for each environment", () => {
    process.env.VERCEL_ENV = "preview";

    expect(isAllowedGitHubActionsSync(approvedPreviewPayload)).toBe(true);
    expect(isAllowedGitHubActionsSync(approvedProductionPayload)).toBe(false);

    process.env.VERCEL_ENV = "production";
    expect(isAllowedGitHubActionsSync(approvedProductionPayload)).toBe(true);
    expect(isAllowedGitHubActionsSync(approvedPreviewPayload)).toBe(false);
  });

  it("rejects another branch, workflow, or environment", () => {
    process.env.VERCEL_ENV = "production";
    expect(
      isAllowedGitHubActionsSync({
        ...approvedProductionPayload,
        ref: "refs/heads/calendar-task-automation",
      })
    ).toBe(false);
    expect(
      isAllowedGitHubActionsSync({
        ...approvedProductionPayload,
        workflow_ref: "kanoetokyo/taskmanager/.github/workflows/other.yml@refs/heads/main",
      })
    ).toBe(false);

    process.env.VERCEL_ENV = "development";
    expect(isAllowedGitHubActionsSync(approvedPreviewPayload)).toBe(false);
  });
});
