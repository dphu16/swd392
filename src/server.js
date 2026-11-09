import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSeedStore, createRepositories } from './store.js';
import { handleRequest } from './router.js';

export function createServer(repositories = createRepositories(createSeedStore())) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, repositories);
  });
  return server;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const PORT = Number(process.env.PORT || 3000);
  const repositories = createRepositories(createSeedStore());
  const server = createServer(repositories);

  server.listen(PORT, () => {
    console.log(`CourtChain Use Cases Server running on http://localhost:${PORT}`);
    console.log(`Registered Use Cases: UC48, UC49, UC50, UC62, UC63`);
  });
}
