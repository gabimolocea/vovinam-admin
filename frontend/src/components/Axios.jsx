import axios from 'axios'

// Use environment variable for API base URL with fallback for development
const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

// Helper function to get CSRF token from cookies
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

const AxiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: 5000,   
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Always send cookies/session data
});

// Add CSRF token to every request
AxiosInstance.interceptors.request.use((config) => {
    const csrftoken = getCookie('csrftoken');
    if (csrftoken) {
        config.headers['X-CSRFToken'] = csrftoken;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default AxiosInstance;