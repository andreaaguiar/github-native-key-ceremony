import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // VITE_* vars are bundled into client JS. Never put secrets in them.
  const env = loadEnv(mode, ".", "VITE_");
  return {
    // GitHub Pages serves this from a project subpath, not the domain root.
    base: "/github-native-key-ceremony/",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_TOKEN_ADDRESS": JSON.stringify(env.VITE_TOKEN_ADDRESS),
      "import.meta.env.VITE_DAO_ADDRESS":   JSON.stringify(env.VITE_DAO_ADDRESS),
      "import.meta.env.VITE_CHAIN_ID":      JSON.stringify(env.VITE_CHAIN_ID),
    },
  };
});
