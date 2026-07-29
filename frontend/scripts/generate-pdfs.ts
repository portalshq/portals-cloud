import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { ResourceTemplate } from '../src/pdf-templates/ResourceTemplate.js';
import { getResourceSlugs, getPublishedResourceForPdf } from '../src/sanity/lib/resources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const slugs = await getResourceSlugs();
  const assetsDir = path.resolve(__dirname, '../../generated-assets');
  const pdfsDir = path.join(assetsDir, 'pdfs');
  const manifestPath = path.join(assetsDir, 'manifest.json');

  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }

  let manifest: Record<string, string> = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }

  for (const { slug } of slugs) {
    console.log(`Checking ${slug}...`);
    const doc = await getPublishedResourceForPdf(slug);
    if (!doc) continue;

    const contentHash = doc._updatedAt;

    if (manifest[slug] === contentHash) {
      console.log(`Skipping ${slug}, no changes.`);
      continue;
    }

    console.log(`Generating ${slug}...`);
    const docElement = React.createElement(ResourceTemplate, { document: doc });
    const blob = await pdf(docElement).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    
    fs.writeFileSync(path.join(pdfsDir, `${slug}.pdf`), buffer);
    
    manifest[slug] = contentHash;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('PDF generation complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
