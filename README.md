Mailbug

your intelligent email assistant

## Development

```
pnpm install
pnpm dev
```

`pnpm dev` runs both halves of the app: the Express API on :3000 and the Vite
dev server on **:5173**, which is the one to open. Vite proxies `/api` and
`/assets` back to Express, so the browser only ever talks to one origin.

| script           | what it does                                           |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | API + Vite dev server with HMR (open :5173)            |
| `pnpm build`     | builds the client into `dist/web`                      |
| `pnpm start`     | serves the API _and_ the built client from :3000       |
| `pnpm test`      | API integration tests (own database, see `MAILBUG_DB`) |
| `pnpm typecheck` | type-checks the server and the client separately       |
| `pnpm db:reset`  | deletes and recreates the SQLite database              |

The client lives in `src/web` (React + TypeScript); the server in `src/`.
