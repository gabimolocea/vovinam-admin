// Theme system removed. Export minimal stubs so imports keep working.

// Return an empty theme object (no MUI theme created here).
export function buildTheme() {
  return {};
}

// Fetching themes from backend is disabled — return empty tokens.
export async function fetchThemeFromBackend() {
  return {};
}

// createDynamicTheme kept for compatibility with imports in other modules.
export async function createDynamicTheme() {
  const serverTokens = await fetchThemeFromBackend();
  return buildTheme(serverTokens);
}

export default buildTheme();
