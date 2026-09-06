// Shared helper for the build-time sitemap + prerender scripts: fetches
// every published news post and event from the Django public API so both
// scripts enumerate the exact same set of dynamic routes.
//
// Runs under plain Node (not Vite), so it cannot use `import.meta.env` -
// the API base and site URL are read from process.env instead, with the
// same defaults used by the Vite app for local dev.
const API_BASE = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

async function fetchAllPages(path) {
  const results = [];
  let page = 1;
  // Public list endpoints are paginated (PageNumberPagination, max page_size 50).
  for (;;) {
    const url = `${API_BASE}${path}?page=${page}&page_size=50`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    const data = await response.json();
    results.push(...(data.results ?? []));
    if (!data.next) break;
    page += 1;
  }
  return results;
}

export async function fetchAllNews() {
  return fetchAllPages('/public/news/');
}

export async function fetchAllEvents() {
  return fetchAllPages('/public/events/');
}

// The events list endpoint omits the rich-text `description` field (only
// the detail endpoint returns it), so the prerender script needs one extra
// fetch per event to build an accurate meta description.
export async function fetchEventDetail(slug) {
  const response = await fetch(`${API_BASE}/public/events/${slug}/`);
  if (!response.ok) return null;
  return response.json();
}

export function getApiBase() {
  return API_BASE;
}
