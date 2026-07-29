# PDF Generation System

This system automatically generates PDF documents from resource data stored in Sanity. It is integrated into the development workflow to ensure that repository-hosted PDF assets remain in sync with the live content.

## Architecture

The system follows a programmatic generation pipeline:

1.  **Data Source**: Sanity (via `@sanity/client`).
2.  **Renderer**: `@react-pdf/renderer` converts React components into PDF blobs.
3.  **Storage**: Generated PDFs are stored in the `generated-assets/pdfs/` directory in the project root.
4.  **Automation**: Husky pre-commit hooks trigger the generation process, ensuring assets are up-to-date before every commit.

## Components

- **Template System**: Located in `frontend/src/pdf-templates/`. Define your PDF structure using `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`).
- **Generation Script**: Located in `frontend/scripts/generate-pdfs.ts`.
  - Performs incremental generation by tracking content hashes in `generated-assets/manifest.json`.
  - Only regenerates PDFs if the `_updatedAt` timestamp from Sanity has changed.
- **Pre-commit Hook**: Defined in `.husky/pre-commit`. Automatically triggers the script and stages the generated assets.

## Workflow

### Adding a New PDF Template
1. Create a new component in `frontend/src/pdf-templates/`.
2. Update `frontend/scripts/generate-pdfs.ts` to use your new template component as needed.

### Running Manually
You can run the PDF generation process manually from the `frontend` directory:

```bash
cd frontend
npm run generate-pdfs
```

### Automation
The system runs automatically upon committing changes. If you have modified resources in Sanity, the pre-commit hook will:
1. Run the build/lint tasks.
2. Regenerate updated PDFs.
3. Automatically `git add` the `generated-assets/` directory.

## Troubleshooting

### "Missing NEXT_PUBLIC_SANITY_PROJECT_ID"
The generation script depends on your local `.env.local` file. Ensure `frontend/.env.local` is correctly configured with your Sanity project ID and dataset.

### PDF Generation Failures
If the generation fails:
1. Check that `frontend/.env.local` exists.
2. Ensure you have network access to Sanity.
3. Verify that `generated-assets/` is writable by your user.
