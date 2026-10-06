export function createClient() { if (!globalThis.__sb) throw new Error('FAKE_SB_NOT_SET'); return globalThis.__sb; }
