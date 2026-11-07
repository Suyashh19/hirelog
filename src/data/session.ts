/** True when an error means "this login no longer exists or is not valid" rather than a network problem. */
export function isDeadSession(e: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  const m = (e?.message ?? '').toLowerCase();
  return !!e && (
    e.status === 401 || e.status === 403 || e.code === 'PGRST301' ||
    m.includes('jwt') || m.includes('not_signed_in') || m.includes('user from sub claim') ||
    m.includes('user not found') || m.includes('invalid claim') || m.includes('refresh token')
  );
}
