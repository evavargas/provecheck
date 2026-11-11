import { buildApp } from './app.js';
import { loadEnv } from './lib/env.js';

const env = loadEnv();
const app = await buildApp(env);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
