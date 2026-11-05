const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const destination = path.join(root, "dist/src/database/migrations/sql");
fs.mkdirSync(destination, { recursive: true });
for (const name of ["001-foundation.up.sql", "001-foundation.down.sql"]) {
  fs.copyFileSync(path.join(root, "src/database/migrations/sql", name), path.join(destination, name));
}
