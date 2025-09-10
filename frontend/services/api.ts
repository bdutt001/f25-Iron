// type script file for axios setup
import axios from 'axios';

// base api URL for axios , (change when env file is up and running)
export const api = axios.create({
    baseURL: 'http://localhost:8000/api'
});