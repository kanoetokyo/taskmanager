import { describe, expect, it, vi } from "vitest";
import { createSerialSaveQueue } from "../client/src/lib/serialSaveQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("customer save queue", () => {
  it("serializes multiple saves for the same card", async () => {
    const firstSave = deferred<boolean>();
    const firstStarted = deferred<void>();
    const save = vi.fn(async () => {
      if (save.mock.calls.length === 1) {
        firstStarted.resolve();
        return firstSave.promise;
      }
      return true;
    });
    const queue = createSerialSaveQueue(save);

    queue.request("card-1");
    await firstStarted.promise;
    queue.request("card-1");
    queue.request("card-1");

    expect(save).toHaveBeenCalledTimes(1);
    firstSave.resolve(true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it("does not retry queued changes automatically after a failed save", async () => {
    const firstSave = deferred<boolean>();
    const firstStarted = deferred<void>();
    const save = vi.fn(async () => {
      firstStarted.resolve();
      return firstSave.promise;
    });
    const queue = createSerialSaveQueue(save);

    queue.request("card-1");
    await firstStarted.promise;
    queue.request("card-1");
    firstSave.resolve(false);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(save).toHaveBeenCalledTimes(1);
  });
});
