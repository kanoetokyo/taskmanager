import { describe, expect, it } from "vitest";
import { emptyStoreChecks, readStoreChecks, storeCheckValues, STORE_CHECK_FIELDS, type StoreCheckListKey } from "../client/src/lib/storeChecks";
import { toggleAllStores } from "../client/src/lib/homeLayout";

describe("independent system and end-of-day store checks", () => {
  const legacy = [
    { checkType: "pos", checkedStores: ["大井町"] },
    { checkType: "raccoon", checkedStores: ["大森南"] },
    { checkType: "line", checkedStores: ["天満"] },
  ];

  it("preserves historical shared checks without treating them as new writes", () => {
    expect(readStoreChecks(legacy)).toEqual({
      ...emptyStoreChecks(), posMorning: ["大井町"], posAfternoon: ["大井町"],
      raccoonMorning: ["大森南"], raccoonAfternoon: ["大森南"], lineMorning: ["天満"],
    });
    expect(storeCheckValues(readStoreChecks(legacy))).not.toHaveProperty("pos");
    expect(storeCheckValues(readStoreChecks(legacy))).not.toHaveProperty("raccoon");
  });

  it.each([
    ["posMorning", "posAfternoon", "pos_morning"],
    ["posAfternoon", "posMorning", "pos_afternoon"],
    ["raccoonMorning", "raccoonAfternoon", "raccoon_morning"],
    ["raccoonAfternoon", "raccoonMorning", "raccoon_afternoon"],
  ] as const)("saving %s does not alter %s after reload", (field, other, dbKey) => {
    const before = readStoreChecks(legacy);
    for (const checkedStores of [["天満"], []]) {
      const edited = { ...before, [field]: checkedStores };
      const saved = { checkType: dbKey, checkedStores: storeCheckValues(edited)[dbKey] };
      for (const rows of [[...legacy, saved], [saved, ...legacy]]) {
        const reloaded = readStoreChecks(rows);
        expect(reloaded[field]).toEqual(checkedStores);
        expect(reloaded[other]).toEqual(before[other]);
        expect(reloaded).toEqual(edited);
      }
    }
  });

  it.each(["lineMorning", "lineAfternoon", "posMorning", "posAfternoon", "raccoonMorning", "raccoonAfternoon"] as StoreCheckListKey[])(
    "%s bulk button fills a partial column, clears a full column, and persists both independently",
    field => {
      const stores = ["大井町", "大森南", "天満"];
      const initial = { ...emptyStoreChecks(), [field]: ["大井町"], aiVoicemail: true };
      const checked = toggleAllStores(initial, field, stores);
      expect(checked).toEqual({ ...initial, [field]: stores });
      const cleared = toggleAllStores(checked, field, stores);
      expect(cleared).toEqual({ ...initial, [field]: [] });
      expect(initial[field]).toEqual(["大井町"]);
      for (const state of [checked, cleared]) {
        const values = storeCheckValues(state);
        const reloaded = readStoreChecks(STORE_CHECK_FIELDS.map(([, checkType]) => ({ checkType, checkedStores: values[checkType] })));
        expect(reloaded).toEqual(state);
      }
    }
  );
});
