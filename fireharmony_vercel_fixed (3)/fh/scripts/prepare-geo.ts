import fs from 'node:fs';
import path from 'node:path';
import simplify from '@turf/simplify';

const projectRoot = process.cwd();
const inputPath = path.join(projectRoot, 'data/boundaries/bgd_adm2.geojson');
const outDir = path.join(projectRoot, 'public/geo');
const outputPath = path.join(outDir, 'bgd_adm2.simplified.geojson');

if (!fs.existsSync(inputPath)) {
  if (fs.existsSync(outputPath)) {
    console.log(`Input ${inputPath} not found, but ${outputPath} already exists. Skipping.`);
    process.exit(0);
  }
  console.warn(`Input file not found: ${inputPath}. Skipping.`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

console.log('Reading full boundary geojson...');
const raw = fs.readFileSync(inputPath, 'utf8');
const geojson = JSON.parse(raw);
const inputSizeMb = (raw.length / (1024 * 1024)).toFixed(2);

console.log(`Original size: ${inputSizeMb} MB, feature count: ${geojson.features?.length}`);

// Simplify using @turf/simplify (tolerance ~ 0.002, highQuality: true, mutate: false)
// Keeping all features and all properties
const simplified = simplify(geojson, {
  tolerance: 0.002,
  highQuality: true,
  mutate: false,
});

const outStr = JSON.stringify(simplified);
fs.writeFileSync(outputPath, outStr, 'utf8');
const outSizeMb = (outStr.length / (1024 * 1024)).toFixed(2);
const outSizeKb = (outStr.length / 1024).toFixed(1);

console.log(`Generated public/geo/bgd_adm2.simplified.geojson successfully!`);
console.log(`Report: Original ${inputSizeMb} MB -> Simplified ${outSizeMb} MB (${outSizeKb} KB)`);
