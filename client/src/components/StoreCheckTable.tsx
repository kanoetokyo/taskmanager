type Service = { key: string; label: string; description: string; checked: string[] };

export function StoreCheckTable({ stores, services, onToggle, onCheckAll }: {
  stores: readonly string[];
  services: Service[];
  onToggle: (key: string, store: string) => void;
  onCheckAll: (key: string) => void;
}) {
  return <div className="overflow-x-auto">
    <table className="w-full table-fixed text-xs text-slate-700">
      <caption className="sr-only">店舗ごとのチェック状況</caption>
      <thead className="bg-slate-50 text-slate-500">
        <tr><th scope="col" className="w-[31%] px-3 py-3 text-left font-medium">店舗</th>
          {services.map(service => {
            const allDone = stores.every(store => service.checked.includes(store));
            return <th key={service.key} scope="col" className="px-1 py-3 font-medium">
              <span title={service.description}>{service.label}</span>
              <button type="button" disabled={allDone} onClick={() => onCheckAll(service.key)}
                aria-label={`${service.label}：すべての店舗にチェックを入れる`}
                className="mt-1.5 block w-full rounded border border-blue-100 bg-white px-0.5 py-1 text-[10px] text-blue-600 hover:bg-blue-50 disabled:border-transparent disabled:bg-transparent disabled:text-emerald-600">
                {allDone ? "✓ 全店舗完了" : "全店舗にチェック"}
              </button>
            </th>;
          })}
        </tr>
      </thead>
      <tbody>{stores.map(store => <tr key={store} className="border-t border-slate-100 hover:bg-slate-50/70">
        <th scope="row" className="px-3 py-2.5 text-left font-medium break-words">{store}</th>
        {services.map(service => <td key={service.key} className="text-center">
          <label className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center">
            <input type="checkbox" className="size-4 cursor-pointer accent-blue-600"
              aria-label={`${store} ${service.label}`} checked={service.checked.includes(store)}
              onChange={() => onToggle(service.key, store)} />
          </label>
        </td>)}
      </tr>)}</tbody>
    </table>
    <details className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
      <summary className="cursor-pointer">チェック内容を確認</summary>
      <ul className="mt-2 space-y-1.5">{services.map(service => <li key={service.key}>{service.label}：{service.description}</li>)}</ul>
    </details>
  </div>;
}
