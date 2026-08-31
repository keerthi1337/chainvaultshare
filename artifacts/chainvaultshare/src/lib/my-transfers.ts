const KEY = "cvs-my-transfers";

interface StoredTransfer {
  id: string;
  ownerToken: string;
}

function readStore(): StoredTransfer[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredTransfer[]) : [];
  } catch {
    return [];
  }
}

function writeStore(items: StoredTransfer[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

/** Return all stored transfer IDs for this session. */
export function getMyTransferIds(): string[] {
  return readStore().map((t) => t.id);
}

/** Return the owner token for a specific transfer ID, or null if not found. */
export function getOwnerToken(id: string): string | null {
  const found = readStore().find((t) => t.id === id);
  return found?.ownerToken ?? null;
}

/** Return the first stored owner token (used as a session-wide identity for the /transfers list). */
export function getSessionOwnerToken(): string | null {
  const items = readStore();
  return items.length > 0 ? items[0].ownerToken : null;
}

/** Store a new transfer with its owner token. */
export function addMyTransfer(id: string, ownerToken: string): void {
  const items = readStore();
  if (!items.find((t) => t.id === id)) {
    writeStore([...items, { id, ownerToken }]);
  }
}

/** Legacy alias for backward compat — use addMyTransfer for new code. */
export function addMyTransferId(id: string): void {
  // no-op without token — callers should use addMyTransfer
}

/** Remove a transfer by ID. */
export function removeMyTransfer(id: string): void {
  const items = readStore().filter((t) => t.id !== id);
  writeStore(items);
}

/** Legacy alias */
export function removeMyTransferId(id: string): void {
  removeMyTransfer(id);
}
