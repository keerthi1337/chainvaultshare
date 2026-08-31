# ChainVaultShare

A premium file and folder transfer web app with blockchain-backed verification. Feels like WeTransfer — fast, clean, and trustworthy — with tamper-evident proof of ownership as a quiet differentiator.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/chainvaultshare run dev` — run the frontend (port 22140)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env in `.env`: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Wouter + TanStack Query + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Local Storage: Stored as binary payload (bytea) inside the local PostgreSQL database

## Architecture decisions

- Blockchain proof is metadata-only: the DB stores proof hash, storage ref, tx ref, owner address, and network — never raw file contents.
- Files are uploaded through a local upload endpoint (`PUT /storage/upload-file/:objectId`) and stored as binary data inside the local PostgreSQL database, eliminating external cloud storage dependencies.
- Local Vite proxying is set up in `vite.config.ts` to automatically route `/api/*` calls from port 22140 to the backend API server on port 8080.
