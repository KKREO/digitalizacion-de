import app from './api/index.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const port = 3000;

let __filename = '';
let __dirname = '';
try {
  if (typeof import.meta !== 'undefined' && import.meta && import.meta.url) {
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  }
} catch (e) {
  // Fallback for Vercel Serverless environment where import.meta.url is not processed
}

// Static or Vite setup depending on environment (disable static file serving on serverless Vercel)
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else if (!process.env.VERCEL) {
  // ESM import metadata compatibility with variable inline promise resolution to prevent top-level await
  const viteModule = 'vite';
  import(viteModule).then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    }).then(vite => {
      app.use(vite.middlewares);
    });
  }).catch(err => {
    console.error("No se pudo cargar el middleware de Vite:", err);
  });
}

if (!process.env.VERCEL) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[DocuDigit Server] Listening on http://localhost:${port}`);
  });
}

export default app;
