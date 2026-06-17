/**
 * RFC 4122 version 4 UUID generator.
 *
 * Wallet rows are keyed by a `uuid` column in Supabase, so every wallet id
 * must be a valid UUID. React Native / Hermes does not reliably expose
 * `crypto.randomUUID`, so we generate one with Math.random — good enough for
 * client-generated row ids (collision probability is negligible).
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** True if `value` is a valid RFC 4122 UUID string. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
