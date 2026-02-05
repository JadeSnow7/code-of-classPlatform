#!/usr/bin/env node

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

function normalizeBasePath(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed === '/') return '';
  return '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}

function patchIndexHtml(indexHtml, basePath) {
  // Patch common absolute paths emitted by `expo export` (Metro web):
  // - /favicon.ico
  // - /_expo/static/...
  const withBase = (p) => (basePath ? `${basePath}${p}` : p);

  let out = indexHtml;
  out = out.replaceAll('href="/favicon.ico"', `href="${withBase('/favicon.ico')}"`);
  out = out.replaceAll('src="/_expo/', `src="${withBase('/_expo/')}`);
  out = out.replaceAll('href="/_expo/', `href="${withBase('/_expo/')}`);
  return out;
}

function walkFiles(dir, predicate) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, predicate));
    } else if (entry.isFile()) {
      if (!predicate || predicate(full)) out.push(full);
    }
  }
  return out;
}

function patchAssetPathsInText(text, basePath) {
  if (!basePath) return text;

  // Patch absolute asset paths emitted by Metro asset transformer on web:
  // e.g. uri:"/assets/..." -> uri:"/wecom/app/assets/..."
  // Also patch "/assets?..." just in case.
  const prefix = `${basePath}/assets`;

  let out = text;
  out = out.replaceAll('"/assets', `"${prefix}`);
  out = out.replaceAll("'/assets", `'${prefix}`);
  return out;
}

function main() {
  const [, , distDirArg, basePathArg] = process.argv;
  const distDir = distDirArg ? path.resolve(distDirArg) : null;
  const basePath = normalizeBasePath(basePathArg);

  if (!distDir) {
    console.error('Usage: patch-web-export.js <distDir> <basePath>');
    process.exit(1);
  }

  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found: ${indexPath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(indexPath, 'utf8');
  const patched = patchIndexHtml(original, basePath);

  if (patched !== original) {
    fs.writeFileSync(indexPath, patched, 'utf8');
    console.log(`Patched ${path.relative(process.cwd(), indexPath)} with basePath="${basePath || '/'}"`);
  } else {
    console.log(`No changes needed: ${path.relative(process.cwd(), indexPath)}`);
  }

  const staticRoot = path.join(distDir, '_expo', 'static');
  if (!basePath || !fs.existsSync(staticRoot)) return;

  const textFiles = walkFiles(staticRoot, (file) => file.endsWith('.js') || file.endsWith('.css'));
  for (const jsFile of textFiles) {
    const src = fs.readFileSync(jsFile, 'utf8');
    const out = patchAssetPathsInText(src, basePath);
    if (out !== src) {
      fs.writeFileSync(jsFile, out, 'utf8');
      console.log(`Patched assets in ${path.relative(process.cwd(), jsFile)}`);
    }
  }
}

main();
