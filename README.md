# NeuroViz EEG

Next.js **web** dashboard + Node **`server-enhanced.js`** for Muse / OpenBCI-style streaming, DSP, OSC, simulator, and recordings.

## Quick start

**Backend** (API + WebSocket + OSC relay), from repo root:

```bash
npm install
npm start
```

Default: HTTP **3000**, WebSocket **8080**, OSC per your `server-enhanced.js` / `.env` config.

**Frontend** (App Router UI on **3001**):

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3001**. The app proxies `/api/*` to `http://localhost:3000` (override with `NEUROVIS_API_ORIGIN` in `web/next.config.mjs`).

## Docs

- **Handoff / architecture / continuation prompt:** [docs/HANDOFF.md](docs/HANDOFF.md)

## License

MIT (see historical `package.json` author field).
