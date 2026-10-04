// Runner de tests con base de datos aislada: usa prisma/test.db (SQLite) en
// lugar de dev.db para no contaminar los datos de desarrollo, y la elimina al
// terminar. Correr con: npm test
import { execSync, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testDb = path.join(root, "prisma", "test.db");
const env = { ...process.env, DATABASE_URL: "file:./test.db" };

if (existsSync(testDb)) rmSync(testDb);

execSync("npx prisma db push --skip-generate", { cwd: root, env, stdio: "ignore" });

const res = spawnSync(process.execPath, ["--test", "tests/api.test.js"], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (existsSync(testDb)) rmSync(testDb);
process.exit(res.status ?? 1);
