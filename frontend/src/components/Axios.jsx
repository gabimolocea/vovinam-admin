import axios from 'axios'

const baseUrl = 'http://localhost:8000/api';

const AxiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: 5000,   
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Always send cookies/session data
});

export default AxiosInstance;