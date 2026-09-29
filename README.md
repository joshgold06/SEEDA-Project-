# Signal Scout

Signal Scout is a Next.js App Router prototype for spotting, triaging, and pursuing Alberta water and wastewater opportunities.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

Import this repository into Vercel with the project **Root Directory** set to the repository root, the directory containing `package.json`. Vercel should detect Next.js automatically; the included `vercel.json` makes that detection explicit.

Before importing, commit and push `package.json`, `package-lock.json`, `app/`, `components/`, `lib/`, `postcss.config.mjs`, and `tsconfig.json`. Vercel builds from the pushed repository, not from uncommitted files in the local workspace.

## Included flows

- `/scan`: searchable morning scan with score, source, and deadline sorting.
- `/scan/[id]`: opportunity detail with relevance analysis, watch, dismiss, and shortlist actions.
- `/shortlist/[id]`: editable outreach draft with tone switching, references, copy, print/PDF, and email actions.
- `/pipeline`: drag-and-drop kanban with CSV export and manual lead creation.

The demo uses sample data in `lib/data.ts`. Changes are persisted in browser local storage; use the store reset method or clear site data to restore the seed state.

## Project structure

```text
app/          App Router pages and global styling
components/   Shared navigation, list, and UI primitives
lib/           Sample domain data, outreach generation, and client store
```

## Validate

```bash
npm run build
```