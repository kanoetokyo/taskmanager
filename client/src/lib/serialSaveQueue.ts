export type SerialSaveQueue = {
  request: (id: string) => void;
  flush: (id: string) => Promise<boolean>;
  dispose: () => void;
};

/**
 * Runs saves for each record in order. Changes made while a save is in flight
 * are coalesced into one follow-up save after that request succeeds.
 */
export function createSerialSaveQueue(
  save: (id: string) => Promise<boolean>
): SerialSaveQueue {
  const running = new Set<string>();
  const pending = new Set<string>();
  const waiters = new Map<string, Array<(saved: boolean) => void>>();
  let disposed = false;

  const settleWaiters = (id: string, saved: boolean) => {
    const current = waiters.get(id) ?? [];
    waiters.delete(id);
    current.forEach(resolve => resolve(saved));
  };

  const request = (id: string) => {
    if (disposed) return;
    if (running.has(id)) {
      pending.add(id);
      return;
    }

    running.add(id);
    void Promise.resolve(save(id))
      .catch(() => false)
      .then(saved => {
        running.delete(id);
        const hasFollowUp = pending.delete(id);
        if (!disposed && saved && hasFollowUp) {
          request(id);
          return;
        }
        settleWaiters(id, saved);
      });
  };

  return {
    request,
    flush: id =>
      new Promise(resolve => {
        if (disposed) {
          resolve(false);
          return;
        }
        const current = waiters.get(id) ?? [];
        current.push(resolve);
        waiters.set(id, current);
        request(id);
      }),
    dispose: () => {
      disposed = true;
      pending.clear();
      waiters.forEach(current => current.forEach(resolve => resolve(false)));
      waiters.clear();
    },
  };
}
