/**
 * In-memory participant registration store for the intelligence service.
 * Survives telegram-bot restarts as long as this service stays up.
 */

interface ParticipantMapping {
  id: string;
  channel: string;
  externalUserId: string;
  moiAccountId: string;
  createdAt: string;
  lastActiveAt: string;
}

const store = new Map<string, ParticipantMapping>();

function key(channel: string, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

function generateId(): string {
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function lookupParticipant(
  channel: string,
  externalUserId: string
): { found: true; mapping: ParticipantMapping } | { found: false } {
  const mapping = store.get(key(channel, externalUserId));
  if (!mapping) return { found: false };
  mapping.lastActiveAt = new Date().toISOString();
  return { found: true, mapping };
}

export function createParticipant(
  channel: string,
  externalUserId: string,
  moiAccountId: string
): ParticipantMapping {
  const k = key(channel, externalUserId);
  if (store.has(k)) {
    throw new Error(`Participant already exists: ${k}`);
  }
  const now = new Date().toISOString();
  const mapping: ParticipantMapping = {
    id: generateId(),
    channel,
    externalUserId,
    moiAccountId,
    createdAt: now,
    lastActiveAt: now,
  };
  store.set(k, mapping);
  return mapping;
}

export function deleteParticipant(channel: string, externalUserId: string): boolean {
  return store.delete(key(channel, externalUserId));
}

export function findByMoiAccountId(moiAccountId: string): ParticipantMapping[] {
  return Array.from(store.values()).filter((m) => m.moiAccountId === moiAccountId);
}
