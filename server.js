import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Load all API handlers with logging
const handleRequest = async (name, req, res) => {
    console.log(`[API] ${req.method} /api/${name}`);
    try {
        const handler = await import(`./api/${name}.js?t=${Date.now()}`);
        await handler.default(req, res);
    } catch (err) {
        console.error(`[API ERROR] ${name}:`, err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
};

app.all('/api/secretary', (req, res) => handleRequest('secretary', req, res));
app.all('/api/spotify', (req, res) => handleRequest('spotify', req, res));
app.all('/api/vault', (req, res) => handleRequest('vault', req, res));
app.all('/api/auth', (req, res) => handleRequest('auth', req, res));
app.all('/api/memory', (req, res) => handleRequest('memory', req, res));
app.all('/api/services', (req, res) => handleRequest('services', req, res));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Local dev server running on http://localhost:${PORT}`);
});
