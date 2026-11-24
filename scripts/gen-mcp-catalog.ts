import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildCatalog } from '../lib/mcp/build-catalog';

const root = join(__dirname, '..');
const catalog = buildCatalog(root);
writeFileSync(join(root, 'lib/mcp/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Wrote ${catalog.length} actions to lib/mcp/catalog.json`);
