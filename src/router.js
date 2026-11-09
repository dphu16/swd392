import { URL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { authenticate } from './auth.js';
import { AppError } from './errors.js';
import {
  deactivateStaffAccount,
  getCourtOccupancy,
  getBranchRevenue,
  getChainPerformance,
  getChainInventory,
} from './services/index.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export async function handleRequest(req, res, repositories) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const baseURL = `http://${req.headers.host || 'localhost'}`;
  const parsedUrl = new URL(req.url, baseURL);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Serve Frontend Static Files
  if (req.method === 'GET' && !pathname.startsWith('/api/')) {
    const filePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(process.cwd(), 'public', filePath);

    if (resolvedPath.startsWith(path.resolve(process.cwd(), 'public'))) {
      try {
        const data = await fs.readFile(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
        return;
      } catch (err) {
        // Fallback or 404
      }
    }
  }

  // API endpoints are JSON
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
      return;
    }

    // Public context endpoint for Frontend persona dropdown (or with optional auth)
    if (pathname === '/api/v1/meta' && req.method === 'GET') {
      const store = repositories.data;
      res.writeHead(200);
      res.end(
        JSON.stringify({
          users: store.users,
          facilities: store.facilities,
          shifts: store.shifts,
          auditLogs: store.auditLogs,
        })
      );
      return;
    }

    // Authenticate user via header 'x-user-id'
    const currentUser = authenticate(req, repositories);
    const store = repositories.data;

    // Authenticated context endpoint
    if (pathname === '/api/v1/context' && req.method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          currentUser,
          users: store.users,
          facilities: store.facilities,
          shifts: store.shifts,
          auditLogs: store.auditLogs,
        })
      );
      return;
    }

    // UC48: POST /api/v1/staff/:id/deactivate
    const staffDeactivateMatch = pathname.match(/^\/api\/v1\/staff\/([^/]+)\/deactivate$/);
    if (staffDeactivateMatch && req.method === 'POST') {
      const targetStaffId = staffDeactivateMatch[1];
      const body = await parseJsonBody(req);
      const result = deactivateStaffAccount(currentUser, targetStaffId, body?.reason, store);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // UC49: GET /api/v1/analytics/occupancy
    if (pathname === '/api/v1/analytics/occupancy' && req.method === 'GET') {
      const result = getCourtOccupancy(currentUser, query, store);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // UC50: GET /api/v1/analytics/branch-revenue
    if (pathname === '/api/v1/analytics/branch-revenue' && req.method === 'GET') {
      const result = getBranchRevenue(currentUser, query, store);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // UC62: GET /api/v1/analytics/chain-performance
    if (pathname === '/api/v1/analytics/chain-performance' && req.method === 'GET') {
      const result = getChainPerformance(currentUser, query, store);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // UC63: GET /api/v1/analytics/chain-inventory
    if (pathname === '/api/v1/analytics/chain-inventory' && req.method === 'GET') {
      const result = getChainInventory(currentUser, query, store);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // Route not found
    throw new AppError(404, 'NOT_FOUND', `Route ${req.method} ${pathname} not found.`);
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    const responsePayload = {
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected error occurred.',
        details: err.details || undefined,
      },
    };
    res.writeHead(status);
    res.end(JSON.stringify(responsePayload));
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Payload size exceeds 1MB.'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError(400, 'INVALID_JSON', 'Invalid JSON payload.'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}
