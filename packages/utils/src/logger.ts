import winston from "winston";

const isDev = process.env.NODE_ENV !== "production";

export function createAppLogger(namespace: string): winston.Logger {
  return winston.createLogger({
    level: isDev ? "debug" : "info",
    format: winston.format.combine(
      winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp as string} ${level} [${namespace}] ${message as string}`;
      }),
    ),
    transports: [
      new winston.transports.Console({
        stderrLevels: ["error"],
      }),
    ],
  });
}
