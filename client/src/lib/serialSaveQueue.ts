export type SerialSaveQueue = {
  request: (id: string) => void;
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
  let disposed = false;

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
        if (!disposed && saved && hasFollowUp) request(id);
      });
  };

  return {
    request,
    dispose: () => {
      disposed = true;
      pending.clear();
    },
  };
}
