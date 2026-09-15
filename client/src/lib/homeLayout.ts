/** Presentation only: never discard a task or change its scheduling rules. */
export function partitionHomeTasks<T extends { done: boolean; planned: string }>(tasks: T[], member = "") {
  const visible = member ? tasks.filter(task => task.planned === member) : tasks;
  return { pending: visible.filter(task => !task.done), completed: visible.filter(task => task.done) };
}

/** Toggle the displayed stores in one column, preserving other columns and unknown stores. */
export function toggleAllStores<T, K extends keyof T>(state: T, key: K, stores: readonly string[]): T {
  if (stores.length === 0) return state;
  const checked = state[key] as string[];
  const allChecked = stores.every(store => checked.includes(store));
  return { ...state, [key]: allChecked
    ? checked.filter(store => !stores.includes(store))
    : Array.from(new Set([...checked, ...stores])) };
}
