# Local development

Node 24 and Docker Compose with Docker engine access are required. Install dependencies with npm ci. Run docker compose up --build -d to start PostgreSQL/PostGIS, migrations, seed, app and worker. Open http://localhost:3000.

Canonical commands from root: npm run build, npm test, npm run format, npm run analyze. npm run test:integration runs database/API tests; npm run test:e2e runs Playwright. See root README for demo accounts, environment and test setup.
