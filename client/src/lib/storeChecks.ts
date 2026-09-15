export interface StoreCheckState {
  lineMorning: string[];
  lineAfternoon: string[];
  posMorning: string[];
  posAfternoon: string[];
  raccoonMorning: string[];
  raccoonAfternoon: string[];
  aiVoicemail: boolean;
}

export type StoreCheckListKey = Exclude<keyof StoreCheckState, "aiVoicemail">;

export const STORE_CHECK_FIELDS: Array<[keyof StoreCheckState, string]> = [
  ["lineMorning", "line_morning"], ["lineAfternoon", "line_afternoon"],
  ["posMorning", "pos_morning"], ["posAfternoon", "pos_afternoon"],
  ["raccoonMorning", "raccoon_morning"], ["raccoonAfternoon", "raccoon_afternoon"],
  ["aiVoicemail", "ai_voicemail"],
];

export function emptyStoreChecks(): StoreCheckState {
  return { lineMorning: [], lineAfternoon: [], posMorning: [], posAfternoon: [], raccoonMorning: [], raccoonAfternoon: [], aiVoicemail: false };
}

export function readStoreChecks(rows: Array<{ checkType: string; checkedStores: unknown }>): StoreCheckState {
  const byType = new Map(rows.map(row => [row.checkType, row.checkedStores]));
  const read = (key: string, legacyKey?: string): string[] => {
    // Explicit empty records must win over legacy data after a user clears a column.
    const value = byType.has(key) ? byType.get(key) : legacyKey ? byType.get(legacyKey) : [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  };
  return {
    lineMorning: read("line_morning", "line"),
    lineAfternoon: read("line_afternoon"),
    // Keep existing shared checks as the starting value for each independent field.
    // New changes write only the new fields, never the shared legacy records.
    posMorning: read("pos_morning", "pos"),
    posAfternoon: read("pos_afternoon", "pos"),
    raccoonMorning: read("raccoon_morning", "raccoon"),
    raccoonAfternoon: read("raccoon_afternoon", "raccoon"),
    aiVoicemail: read("ai_voicemail").length > 0,
  };
}

export function storeCheckValues(state: StoreCheckState): Record<string, string[]> {
  return Object.fromEntries(STORE_CHECK_FIELDS.map(([field, dbKey]) => [
    dbKey, field === "aiVoicemail" ? state.aiVoicemail ? ["done"] : [] : state[field],
  ]));
}
