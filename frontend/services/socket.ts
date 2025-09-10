import { io } from 'socket.io-client';

// socket.io base request url 
export const socket = io('http://localhost:8000');