// Environment configuration helper
// Provides centralized access to environment variables

/**
 * Get API base URL from environment
 * @returns {string} API base URL without trailing slash
 */
export const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
};

/**
 * Get backend base URL for media files
 * @returns {string} Backend base URL without trailing slash
 */
export const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
};

/**
 * Get full media URL from relative path
 * @param {string} relativePath - Relative path to media file (e.g., '/media/image.jpg')
 * @returns {string} Full URL to media file
 */
export const getMediaUrl = (relativePath) => {
  if (!relativePath) return '';
  if (relativePath.startsWith('http')) return relativePath;
  const backendUrl = getBackendUrl();
  return `${backendUrl}${relativePath}`;
};

/**
 * Check if running in development mode
 * @returns {boolean}
 */
export const isDevelopment = () => {
  return import.meta.env.DEV;
};

/**
 * Check if running in production mode
 * @returns {boolean}
 */
export const isProduction = () => {
  return import.meta.env.PROD;
};
