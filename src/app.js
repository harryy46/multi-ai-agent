import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import myRoutes from './routes/my.js';
import publicRoutes from './routes/public.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render proxy ke peeche asli IP ke liye (rate limit)
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ['https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/my', myRoutes);
  app.use('/api', publicRoutes);

  app.get('/privacy', (req, res) => res.sendFile(path.join(pub, 'privacy.html')));
  app.get('/b/:slug', (req, res) => res.sendFile(path.join(pub, 'chat.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(pub, 'dashboard.html')));
  app.use(express.static(pub, { dotfiles: 'allow', extensions: ['html'] }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
  // Error ki detail user ko nahi jaati, sirf server log me
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[server error]', err);
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request format is invalid' });
    res.status(500).json({ error: 'Something went wrong on the server. Please try again shortly.' });
  });
  return app;
}
