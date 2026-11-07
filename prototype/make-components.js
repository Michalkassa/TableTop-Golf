// Export every physical component as a true-scale SVG (1 unit = 1 mm).
// Run: node prototype/make-components.js [config.json]   → writes ./components/
const fs = require('fs');
const path = require('path');
require('./engine.js');
require('./components.js');
const E = globalThis.Engine, C = globalThis.Components;

const cfgPath = process.argv[2];
const cfg = cfgPath ? Object.assign(E.clone(E.DEFAULT_CONFIG), JSON.parse(fs.readFileSync(cfgPath, 'utf8'))) : E.clone(E.DEFAULT_CONFIG);
E.setLieMode(cfg);
const outDir = path.join(__dirname, '..', 'components');
fs.mkdirSync(outDir, { recursive: true });

let n = 0;
for (const id of C.kitClubs(cfg)) {
  const dir = path.join(outDir, id);
  fs.mkdirSync(dir, { recursive: true });
  for (let t = 1; t <= E.MAX_TIER; t++) {
    for (const comp of C.clubKit(cfg, id, t)) {
      fs.writeFileSync(path.join(dir, comp.name + '.svg'), C.wrap(comp));
      n++;
    }
  }
}
fs.writeFileSync(path.join(outDir, 'player-board.svg'), C.wrap(C.playerBoard(cfg))); n++;
fs.writeFileSync(path.join(outDir, 'bag-ruler.svg'), C.wrap(C.bagRuler(cfg))); n++;
fs.writeFileSync(path.join(outDir, 'shared-fan.svg'), C.wrap(C.sharedFan(cfg))); n++;
fs.writeFileSync(path.join(outDir, 'green-tiles.svg'), C.wrap(C.greenTileSheet(cfg))); n++;
fs.writeFileSync(path.join(outDir, 'coin-tokens.svg'), C.wrap(C.coinTokenSheet(cfg))); n++;
fs.writeFileSync(path.join(outDir, 'kit-in-use.svg'), C.wrap(C.usageDiagram(cfg), 3));
console.log(`wrote ${n} components + kit-in-use.svg to ${path.relative(process.cwd(), outDir)}/`);
