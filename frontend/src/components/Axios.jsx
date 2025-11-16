import axios from 'axios'

// Use environment variable for API base URL with fallback for development
const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const AxiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: 5000,   
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Always send cookies/session data
});

export default AxiosInstance;