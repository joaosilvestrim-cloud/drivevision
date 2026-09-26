import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import handler from "./server/handler";

function localApi(): Plugin {
  const attach = (server: { middlewares: { use: (fn: any) => void } }) => {
    server.middlewares.use(
      (
        req: import("node:http").IncomingMessage,
        res: import("node:http").ServerResponse,
        next: () => void,
      ) => {
        if (req.url?.startsWith("/api/")) void handler(req, res);
        else next();
      },
    );
  };
  return {
    name: "drivevision-local-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "DRIVEVISION_");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  return {
    plugins: [react(), localApi()],
    worker: { format: "es" },
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    build: { outDir: "dist-preview" },
  };
});
