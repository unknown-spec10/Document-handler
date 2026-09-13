import axios from 'axios';

// In dev, the Vite proxy forwards /auth, /admin, /users to the FastAPI backend
// on port 8000 — keeping everything on the same origin so httpOnly cookies work.
// In production, set VITE_API_BASE_URL to your actual API domain.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial to send/receive httpOnly cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

export default client;
