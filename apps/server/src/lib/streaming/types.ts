export interface StreamCallbacks {
  onReady: (model: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export interface StreamSession {
  sendAudio(chunk: ArrayBuffer): void;
  commit(): void;
  cancel(): void;
  close(): void;
}

export interface TranscribeOptions {
  audio: Uint8Array;
  model: string;
  apiKey: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  segments?: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  durationInSeconds?: number;
}

export interface StreamingSessionOptions {
  apiKey: string;
  model: string;
  prompt?: string;
  callbacks: StreamCallbacks;
}

export interface TranscriptionProvider {
  readonly providerId: string;
  transcribe(opts: TranscribeOptions): Promise<TranscribeResult>;
  supportsStreaming(modelId: string): boolean;
  openStreamingSession?(opts: StreamingSessionOptions): StreamSession;
}

export function stripProviderPrefix(modelId: string): string {
  const idx = modelId.indexOf("/");
  return idx >= 0 ? modelId.slice(idx + 1) : modelId;
}
