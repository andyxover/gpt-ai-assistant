import '../lib/env.js';
import express from 'express';
import { handleLineWebhook } from './line.js';

const app = express();

app.use((req, _res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// LINE webhook needs the raw body for HMAC signature verification.
app.post('/webhook/line', express.raw({ type: 'application/json' }), handleLineWebhook);

app.get('/health', (req, res) => res.json({ ok: true, service: 'tcs-tutor', ts: new Date().toISOString() }));

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`TCS Tutor API listening on http://localhost:${port}`);
  if (process.env.LINE_API_DRY_RUN === 'true') {
    console.log('LINE_API_DRY_RUN=true — outbound LINE messages will be logged, not sent.');
  }
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
