import { deviceToken } from "./api";
import type { Expression } from "./types";

export type VoiceState = "idle" | "synthesizing" | "speaking" | "error";

type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseEvent(block: string): StreamEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  return {
    event,
    data: JSON.parse(data.join("\n")) as Record<string, unknown>,
  };
}

function decodePcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(byteLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return samples;
}

export class VoicePlayer {
  private context: AudioContext | null = null;
  private controller: AbortController | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private generation = 0;
  private completionTimer = 0;

  constructor(private readonly onState: (state: VoiceState) => void) {}

  async prepare() {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  stop(emit = true) {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    window.clearTimeout(this.completionTimer);
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source that already ended is safe to ignore.
      }
    }
    this.sources.clear();
    this.nextStart = 0;
    if (emit) this.onState("idle");
  }

  async play(
    text: string,
    mood: Expression,
    volume: number,
  ): Promise<void> {
    this.stop(false);
    const generation = this.generation;
    this.controller = new AbortController();
    this.onState("synthesizing");
    try {
      await this.prepare();
      const response = await fetch("/api/v1/tts/stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, mood }),
        signal: this.controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.detail || "语音请求失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const blocks = pending.split(/\r?\n\r?\n/);
        pending = done ? "" : blocks.pop() || "";
        for (const block of blocks) {
          const item = parseEvent(block);
          if (!item || generation !== this.generation) continue;
          if (item.event === "audio") {
            this.enqueue(
              String(item.data.audioBase64 || ""),
              Number(item.data.sampleRate || 24_000),
              volume,
            );
            this.onState("speaking");
          } else if (item.event === "error") {
            throw new Error(String(item.data.message || "语音生成失败"));
          } else if (item.event === "complete") {
            completed = true;
          }
        }
        if (done) break;
      }
      if (!completed || generation !== this.generation) return;
      const remaining = Math.max(
        0,
        (this.nextStart - (this.context?.currentTime || 0)) * 1_000,
      );
      this.completionTimer = window.setTimeout(() => {
        if (generation === this.generation) this.onState("idle");
      }, remaining + 80);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (generation === this.generation) this.onState("error");
      throw error;
    }
  }

  private enqueue(
    audioBase64: string,
    sampleRate: number,
    volume: number,
  ) {
    if (!this.context || !audioBase64) return;
    const samples = decodePcm16(audioBase64);
    if (!samples.length) return;
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.context.destination);
    const start = Math.max(this.context.currentTime + 0.03, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }
}
