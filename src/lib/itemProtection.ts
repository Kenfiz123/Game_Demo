/** UI guidance only. The backend rechecks copy ownership and locks atomically. */
export interface ProtectionCopy { id: string; itemId: string; locked?: boolean; }

export function countItemIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Missing copy metadata never invents an unlocked copy. Old explicit copies default unlocked. */
export function getUnlockedCounts(ownedIds: readonly string[], copies: readonly ProtectionCopy[]): Map<string, number> {
  const owned = countItemIds(ownedIds), counts = new Map<string, number>(), seen = new Set<string>();
  for (const copy of copies) {
    if (seen.has(copy.id)) continue;
    seen.add(copy.id);
    if (copy.locked === true || !owned.has(copy.itemId)) continue;
    counts.set(copy.itemId, Math.min(owned.get(copy.itemId)!, (counts.get(copy.itemId) ?? 0) + 1));
  }
  return counts;
}

/** Keep one catalog copy; equipped catalog items are never chosen automatically. */
export function safeSurplusQuickPick(candidateIds: readonly string[], ownedIds: readonly string[], copies: readonly ProtectionCopy[], equippedIds: ReadonlySet<string>, limit = 5): string[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  const owned = countItemIds(ownedIds), unlocked = getUnlockedCounts(ownedIds, copies), seen = new Set<string>();
  const selected: string[] = [];
  for (const id of candidateIds) {
    if (seen.has(id) || equippedIds.has(id)) continue;
    seen.add(id);
    const count = Math.min(limit - selected.length, unlocked.get(id) ?? 0, Math.max(0, (owned.get(id) ?? 0) - 1));
    for (let index = 0; index < count; index++) selected.push(id);
    if (selected.length === limit) break;
  }
  return selected;
}

export function selectionProtectionWarnings(selectedIds: readonly string[], ownedIds: readonly string[], equippedIds: ReadonlySet<string>, unlockedCounts?: ReadonlyMap<string, number>) {
  const owned = countItemIds(ownedIds), picked = countItemIds(selectedIds);
  return {
    lastCopyIds: [...picked].filter(([id, count]) => (owned.get(id) ?? 0) > 0 && count >= owned.get(id)!).map(([id]) => id),
    lastUnlockedCopyIds: [...picked].filter(([id, count]) => {
      const unlocked = unlockedCounts?.get(id) ?? 0;
      return unlocked > 0 && unlocked < (owned.get(id) ?? 0) && count >= unlocked;
    }).map(([id]) => id),
    equippedItemIds: [...picked.keys()].filter(id => equippedIds.has(id)),
  };
}
