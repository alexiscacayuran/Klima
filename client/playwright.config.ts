import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "playwright/test";

/**
 * End-to-end tests, run against a real browser on a real dev server.
 *
 * This app is almost entirely things that only exist once a GPU context does —
 * tiles, a clustered source, DOM markers positioned off a camera. A unit test
 * can check that a value is formatted; only a browser can say whether it ended
 * up on screen. So the suite here is small and deliberately about *rendering*,
 * not about logic that is already provable elsewhere.
 */

/**
 * Chromium's own shared libraries, when they are not installed system-wide.
 *
 * `playwright install-deps` needs root, and on a machine without passwordless
 * sudo it cannot run — which leaves a downloaded browser that will not start,
 * failing with a bare `libnspr4.so: cannot open shared object file`. The five
 * libraries it wants (libnss3, libnspr4, libasound2) can equally be unpacked
 * into a user directory, and the loader will find them if it is told where.
 *
 * Set here rather than in an npm script so it holds however the suite is
 * started — `npx playwright test`, an IDE runner, or a direct `node` import.
 * Node passes its environment to the browser it spawns, which is the process
 * that actually needs this.
 *
 * Absent directory, no change: on a machine with the packages installed
 * normally this is a no-op, and nothing here should override a working system.
 */
const VENDORED_LIBS = join(
  homedir(),
  ".local/lib/playwright-deps/root/usr/lib/x86_64-linux-gnu",
);
if (existsSync(VENDORED_LIBS)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${VENDORED_LIBS}:${process.env.LD_LIBRARY_PATH}`
    : VENDORED_LIBS;
}

/**
 * Not 5173.
 *
 * The docker-compose stack publishes the app's own dev server on 5173, so a
 * suite pointed there silently tests whatever that container is running — and
 * `reuseExistingServer` makes it *look* like the run started its own. It also
 * proxies the API through `host.docker.internal`, which resolves unreliably
 * from inside the container on WSL2 and produces intermittent 502s that read
 * as the app failing to load its data.
 *
 * A port of its own means the suite always starts the server it is testing.
 */
const PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  // The map is slow in the honest way: a style, vector tiles, a raster surface
  // and nineteen API requests before anything can be asserted about.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // WebGL in headless Chromium falls back to SwiftShader, which is software
    // and slow but renders the same thing. Without this the canvas comes up
    // empty and every assertion about the map fails for a reason that has
    // nothing to do with the app.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // `--strictPort` on purpose. Vite otherwise steps to the next free port
    // when 5173 is taken, and the suite would then sit waiting on a URL that
    // nothing is ever going to answer — a hang rather than a failure.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // The API is reached from *this* process, on the host, so it is on
      // localhost — not on the Docker bridge address `.env.development` carries
      // for the containerised stack. Set here rather than left to
      // `.env.development.local`, so the suite does not depend on a gitignored
      // file existing on the machine running it.
      CIS_API_TARGET: process.env.CIS_API_TARGET ?? "http://localhost",
    },
  },
});
