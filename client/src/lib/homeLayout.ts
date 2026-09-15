/** Presentation only: never discard a task or change its scheduling rules. */
export function partitionHomeTasks<T extends { done: boolean; planned: string }>(tasks: T[], member = "") {
  const visible = member ? tasks.filter(task => task.planned === member) : tasks;
  return { pending: visible.filter(task => !task.done), completed: visible.filter(task => task.done) };
}

/** Preserve other services and any existing store entries when checking a column. */
export function checkAllStores<T, K extends keyof T>(state: T, key: K, stores: readonly string[]): T {
  return { ...state, [key]: Array.from(new Set([...(state[key] as string[]), ...stores])) };
}
