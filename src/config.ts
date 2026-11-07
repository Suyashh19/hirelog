// Public client config. The publishable key is designed to ship inside the app; Row Level Security protects the data.
// Never put the service_role / secret key here.
export const SUPABASE_URL = 'https://vqxbrfafkiukvxzosgoq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sfCmQZGGej714tPcONmzsQ_-2jlRwv7';

/**
 * Public page where a customer confirms or disputes an entry (web/confirm.html, hosted on GitHub Pages).
 * Set this after publishing the page, e.g. 'https://yourname.github.io/hirelog/confirm.html'. Empty = feature hidden.
 */
export const CONFIRM_PAGE_URL = '';
