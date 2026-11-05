import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveChainConfig } from "./src/lib/chain-config.js";
import networks from "../config/networks.json";
import { apiSettings } from "./src/lib/api-client.ts";

const readRecord = (url) =>
  existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : undefined;
export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const publicEnv = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_");
    apiSettings(publicEnv, publicEnv.VITE_NETWORK?.trim() || (mode === "testnet" ? "baseSepolia" : "localhost"));
    resolveChainConfig({
      env: loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_"),
      mode,
      networks,
      deployments: {
        localhost: readRecord(
          new URL("./src/generated/deployment.json", import.meta.url)
        ),
        baseSepolia: readRecord(
          new URL("../deployments/baseSepolia.json", import.meta.url)
        ),
      },
    });
  }
  return { plugins: [react()] };
});
