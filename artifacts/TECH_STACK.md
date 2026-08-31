# ChainVaultShare — Complete Technology Stack

Below is the definitive technology stack for the ChainVaultShare platform following the implementation of all advanced security hardening, Zero-Knowledge architecture, and real-time operational features.

---

## 🛡️ Core Security & Cryptography
*   **Web Crypto API (Client-Side)**: Utilizes `AES-GCM` with 256-bit keys for Zero-Knowledge end-to-end (E2E) file encryption. The browser encrypts the file before upload and decrypts it after download. The key is securely embedded in the URL fragment (`#key=...`) and is mathematically invisible to the server.
*   **Node.js Crypto Module (Server-Side)**: 
    *   `scrypt`: Used for memory-hard hashing of vault passphrases to defend against offline brute-force attacks.
    *   `HMAC-SHA256`: Used to generate cryptographically signed "Proof of Delivery" receipts and temporary download tokens.
    *   `SHA-256`: Used with a server-side `IP_SALT` to irreversibly hash user IP addresses for GDPR-compliant uniqueness tracking without storing PII.

---

## 🖥️ Frontend (Client Application)
*   **Framework**: **React 18** built with **Vite**. Provides a lightning-fast, HMR-enabled development environment and highly optimized production builds.
*   **Routing**: **Wouter**. A minimalist, hook-based routing solution that keeps the bundle size exceptionally small compared to React Router.
*   **Data Fetching & Caching**: **TanStack Query (React Query)**. Manages asynchronous state, caching, and background synchronization for API requests.
*   **Styling & UI**: 
    *   **Tailwind CSS**: Utility-first CSS framework for rapid UI styling, glassmorphism effects, and responsive design.
    *   **Framer Motion**: Powers the fluid micro-interactions, vault-opening sequences, and page transition animations.
    *   **Lucide React**: Beautiful, consistent SVG icon library.

---

## ⚙️ Backend (API Server)
*   **Runtime**: **Node.js**
*   **Web Framework**: **Express.js**. Lightweight and unopinionated routing.
*   **Real-Time Communication**: **Server-Sent Events (SSE)**. Used instead of WebSockets for unidirectional, real-time data streaming. Powers the live upload progress bars and the Admin Command Center live download feed.
*   **Validation & Schema**: **Zod**. Ensures strict runtime type validation for all incoming API payloads, preventing prototype pollution and injection attacks.
*   **Security Middlewares**:
    *   `helmet`: Automatically sets strict HTTP security headers (HSTS, NoSniff, X-Frame-Options).
    *   `express-rate-limit`: Defends against DDoS and brute-force code guessing.
*   **Analytics**: `geoip-lite`. Performs fast, local IP-to-Country lookups entirely in memory without relying on third-party APIs (protecting user privacy).
*   **Background Jobs**: `node-cron`. Handles asynchronous cleanup of expired transfers and orphan files.

---

## 🗄️ Database Layer
*   **Relational Database**: **PostgreSQL**. Robust, ACID-compliant data storage for transfer metadata, encrypted file blobs, and analytics events.
*   **ORM (Object Relational Mapper)**: **Drizzle ORM**. A high-performance, strictly typed TypeScript ORM. Provides SQL-like query building with complete end-to-end type safety and automated migration generation (`drizzle-kit`).

---

## 🏗️ Architecture & Monorepo Tooling
*   **Package Manager**: **PNPM Workspaces**. Highly efficient monorepo management, utilizing hard links to save disk space and drastically reduce install times across the 5 internal packages.
*   **Shared Contract API**: **Zodios**. The API schema is defined once using Zod (in `@workspace/api-zod`), which automatically generates the typed Express server routes and the strongly-typed React Query hooks (in `@workspace/api-client-react`). This guarantees the frontend and backend are always in perfect sync.
*   **Bundling**: **ESBuild**. Used to bundle the Node.js API server into a single, ultra-fast executing `.mjs` file, excluding native binary dependencies (like `geoip-lite`) dynamically.