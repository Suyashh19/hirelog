import { getExpoGoProjectConfig, isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../cloud';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

/**
 * A link back into the app. When the app is served from the computer in Expo Go the link must be
 * exp://<computer>:8081/--/<path>: Expo Go cannot open hourlytracker://, so the browser would hang.
 * An installed build (development or store) uses hourlytracker://<path>.
 */
export function appLink(path: string): string {
  if (isRunningInExpoGo()) {
    // Expo Go SDK 58 reports "bare" and has no linkingUri, so build exp://<dev server>/--/<path> ourselves.
    const host = getExpoGoProjectConfig()?.debuggerHost || Constants.expoConfig?.hostUri || '';
    if (host) return `exp://${host.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '')}/--/${path}`;
  }
  const lu = Constants.linkingUri ?? '';
  if (/^exps?:\/\//.test(lu)) {
    const base = lu.includes('/--') ? lu.slice(0, lu.indexOf('/--')) : lu.replace(/\/+$/, '');
    return `${base}/--/${path}`;
  }
  return Linking.createURL(path);
}

/** Asks Supabase whether Google sign-in is switched on, so we never open a browser page that only shows an error. */
async function googleEnabled(): Promise<boolean | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!r.ok) return null;
    const s = await r.json();
    return !!s?.external?.google;
  } catch {
    return null; // offline or unknown: let the normal flow report the problem
  }
}

/** Where Google sends the user back. Expo Go: exp://…/--/auth-callback; app build: hourlytracker://auth-callback. */
export const googleRedirectUrl = () => appLink('auth-callback');

export type GoogleResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };

/** Reads the tokens (implicit flow, after "#") or the code (PKCE, "?code=") from the redirect link. */
function readRedirect(url: string) {
  const out = new Map<string, string>();
  const add = (part: string | undefined) => {
    if (!part) return;
    new URLSearchParams(part).forEach((v, k) => out.set(k, v));
  };
  const hashAt = url.indexOf('#');
  const qAt = url.indexOf('?');
  add(qAt >= 0 ? url.slice(qAt + 1, hashAt > qAt ? hashAt : undefined) : undefined);
  add(hashAt >= 0 ? url.slice(hashAt + 1) : undefined);
  return out;
}

/**
 * ON-2 "Continue with Google" through Supabase in the system browser. Works in Expo Go.
 * Needs the Google provider switched on in Supabase (Authentication → Sign In / Providers → Google).
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  if ((await googleEnabled()) === false) {
    return { ok: false, message: 'Google sign-in is not switched on yet. Use your email for now.' };
  }
  const redirectTo = googleRedirectUrl();
  console.log('[google] expoGo:', isRunningInExpoGo(), '| debuggerHost:', getExpoGoProjectConfig()?.debuggerHost,
    '| hostUri:', Constants.expoConfig?.hostUri, '| redirect:', redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) return { ok: false, message: error?.message ?? 'Could not open Google sign-in.' };

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  console.log('[google] browser result:', res.type);
  if (res.type !== 'success') return { ok: false, cancelled: true };

  const p = readRedirect(res.url);
  const problem = p.get('error_description') ?? p.get('error');
  if (problem) return { ok: false, message: problem.replace(/\+/g, ' ') };

  const code = p.get('code');
  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    return e ? { ok: false, message: e.message } : { ok: true };
  }
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  if (!access || !refresh) return { ok: false, message: 'Google did not send a sign-in back. Please try again.' };
  const { error: e } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
  return e ? { ok: false, message: e.message } : { ok: true };
}
