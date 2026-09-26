import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  root,
  configFile: fileURLToPath(new URL("../vite.preview.config.ts", import.meta.url)),
});
await server.listen();
server.printUrls();
