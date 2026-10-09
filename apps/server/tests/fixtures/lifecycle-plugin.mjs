import { writeFileSync } from "node:fs";
export default () => {
  let storage;
  return {
    name: "lifecycle-e2e",
    async setup(ctx) {
      storage = ctx.storage;
      writeFileSync(process.env.FREESTYLE_E2E_SETUP_STARTED, "started");
      await new Promise((resolve) =>
        setTimeout(resolve, Number(process.env.FREESTYLE_E2E_STARTUP_DELAY_MS)),
      );
    },
    middleware: [
      async (c, next) => {
        if (c.req.path !== "/e2e/slow") return next();
        writeFileSync(process.env.FREESTYLE_E2E_REQUEST_STARTED, "started");
        await new Promise((resolve) => setTimeout(resolve, 350));
        await storage.set("request-finished", true);
        return c.text("drained");
      },
    ],
    async dispose() {
      await storage.set("disposed", true);
      writeFileSync(process.env.FREESTYLE_E2E_PLUGIN_STOPPED, "disposed");
    },
  };
};
