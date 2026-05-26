export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class ApiError extends CliError {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`API error (${String(status)}): ${body}`, 30);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ConnectionError extends CliError {
  constructor(port: number) {
    super(
      `Could not connect to Freestyle server on port ${String(port)}.\n` +
        "Make sure the Freestyle app is running, or start the server with: freestyle serve",
      31,
    );
    this.name = "ConnectionError";
  }
}
