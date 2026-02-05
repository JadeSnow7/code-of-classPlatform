export function isWecomWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  return ua.includes('wxwork') || ua.includes('wework');
}

export function getUrlParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

export function removeUrlParams(names: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const name of names) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    if (!changed) return;
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore URL parsing errors (should not happen in modern browsers).
  }
}

export function getRedirectURIForWecomOAuth(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  // Redirect back to the current page without query params to avoid accumulating code/state.
  url.search = '';
  url.hash = '';
  return url.toString();
}

