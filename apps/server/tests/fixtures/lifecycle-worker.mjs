import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const server = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ text: "Persisted transcription from mock inference" }),
    );
  });
});
server.listen(port, "127.0.0.1", () => {
  writeFileSync(
    process.env.FREESTYLE_E2E_WORKER_STATE,
    JSON.stringify({ pid: process.pid, port }),
  );
});
// Keep the child alive briefly after SIGTERM so awaiting its exit is observable.
process.on("SIGTERM", () => {
  setTimeout(() => {
    writeFileSync(process.env.FREESTYLE_E2E_WORKER_STOPPED, "stopped");
    server.close(() => process.exit(0));
  }, 150);
});
