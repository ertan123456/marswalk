/**
 * Serves the handlers in `api/` from the Vite dev server.
 *
 * In production those files are serverless functions and the host mounts them.
 * Vite does not, so without this `npm run dev` has no `/api/mission-assistant`
 * and Mission AI silently falls back to its in-browser analyst — correct
 * behaviour, but it makes the local model impossible to try without installing
 * another CLI.
 *
 * The handler is loaded through `ssrLoadModule`, so it is type-checked and
 * hot-reloaded like the rest of the source. Dev only: the plugin declares
 * `apply: 'serve'` and contributes nothing to the bundle.
 */

import { readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type Handler = (
  request: { method?: string; headers?: IncomingMessage['headers']; body?: unknown },
  response: { status: (code: number) => unknown; json: (value: unknown) => void },
) => void | Promise<void>;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      // A mission question is at most 1200 characters; anything of this size is
      // not one, so stop reading rather than buffering it.
      if (raw.length > 1_000_000) {
        request.destroy();
        reject(new Error('request body too large'));
      }
    });
    request.on('end', () => resolve(raw));
    request.on('error', reject);
  });
}

export function apiDevServer(): Plugin {
  return {
    name: 'marswalk-api-dev',
    apply: 'serve',
    configureServer(server) {
      let routes: string[] = [];
      try {
        routes = readdirSync('api')
          .filter((name) => name.endsWith('.ts'))
          .map((name) => `/api/${name.slice(0, -3)}`);
      } catch {
        return; // no api/ directory: nothing to mount
      }
      if (routes.length === 0) return;
      server.config.logger.info(`  \x1b[36m➜\x1b[0m  api dev:  ${routes.join(', ')}`);

      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (!routes.includes(path)) return next();

        let status = 200;
        const shim = {
          status(code: number) {
            status = code;
            return shim;
          },
          json(value: unknown) {
            response.statusCode = status;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(value));
          },
        };

        try {
          const raw = request.method === 'POST' ? await readBody(request) : '';
          const mod = (await server.ssrLoadModule(`.${path}.ts`)) as { default?: Handler };
          if (typeof mod.default !== 'function') {
            throw new Error(`${path}.ts has no default export`);
          }
          await mod.default(
            { method: request.method, headers: request.headers, body: raw || undefined },
            shim,
          );
        } catch (error) {
          server.config.logger.error(`api dev: ${path} failed — ${String(error)}`);
          if (!(response as ServerResponse).headersSent) {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Handler failed; see the dev server log' }));
          }
        }
      });
    },
  };
}
