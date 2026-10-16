export type ExternalChatMessage = {
  provider: "youtube-live" | "twitch";
  providerMessageId: string;
  authorId: string;
  authorDisplayName?: string;
  text: string;
  sentAt: string;
};

export type ChatIngressSink = {
  ingest(channelId: string, message: ExternalChatMessage): Promise<void>;
};

export type ChatConnector = { start(): void; stop(): Promise<void> };

export type ChatIngress = {
  start(): void;
  stop(): Promise<void>;
};

export function createChatIngress(connectors: readonly ChatConnector[]): ChatIngress {
  return {
    start() { connectors.forEach((connector) => connector.start()); },
    stop() { return Promise.all(connectors.map((connector) => connector.stop())).then(() => undefined); },
  };
}

export function createYoutubeConnector(options: {
  channelId: string;
  liveChatId: string;
  accessToken(): Promise<string>;
  sink: ChatIngressSink;
  fetch?: typeof fetch;
}): ChatConnector {
  const request = options.fetch ?? fetch;
  let controller: AbortController | undefined;
  let running: Promise<void> | undefined;

  async function run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages/stream");
      url.searchParams.set("liveChatId", options.liveChatId);
      url.searchParams.set("part", "id,snippet,authorDetails");
      try {
        const response = await request(url, { headers: { Authorization: `Bearer ${await options.accessToken()}` }, signal });
        if (!response.ok || !response.body) throw new Error(`YouTube chat stream failed (${response.status})`);
        for await (const payload of parseJsonObjects(response.body, signal)) {
          for (const item of (payload as YoutubePayload).items ?? []) {
            if (!item.id || !item.snippet?.displayMessage || !item.authorDetails?.channelId) continue;
            await options.sink.ingest(options.channelId, { provider: "youtube-live", providerMessageId: item.id, authorId: item.authorDetails.channelId, authorDisplayName: item.authorDetails.displayName, text: item.snippet.displayMessage, sentAt: item.snippet.publishedAt ?? new Date().toISOString() });
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        await wait(1_000, signal);
      }
    }
  }

  return {
    start() {
      if (running) return;
      controller = new AbortController();
      running = run(controller.signal).finally(() => { running = undefined; controller = undefined; });
    },
    async stop() { controller?.abort(); await running?.catch(() => undefined); },
  };
}

export function createTwitchConnector(options: {
  channelId: string;
  broadcasterUserId: string;
  userId: string;
  clientId: string;
  accessToken(): Promise<string>;
  sink: ChatIngressSink;
  createSocket?: (url: string) => WebSocket;
  fetch?: typeof fetch;
}): ChatConnector {
  const request = options.fetch ?? fetch;
  const createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  let controller: AbortController | undefined;
  let socket: WebSocket | undefined;
  let running: Promise<void> | undefined;

  async function subscribe(sessionId: string): Promise<void> {
    const response = await request("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${await options.accessToken()}`, "Client-Id": options.clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: options.broadcasterUserId, user_id: options.userId }, transport: { method: "websocket", session_id: sessionId } }),
    });
    if (!response.ok && response.status !== 409) throw new Error(`Twitch subscription failed (${response.status})`);
  }

  async function connect(url: string, signal: AbortSignal): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      socket = createSocket(url);
      let reconnectUrl: string | undefined;
      const current = socket;
      const abort = () => current.close();
      signal.addEventListener("abort", abort, { once: true });
      current.on("message", async (raw) => {
        const message = JSON.parse(raw.toString()) as TwitchEnvelope;
        if (message.metadata.message_type === "session_welcome" && message.payload?.session?.id) await subscribe(message.payload.session.id);
        if (message.metadata.message_type === "session_reconnect") { reconnectUrl = message.payload?.session?.reconnect_url ?? undefined; current.close(); }
        const event = message.payload?.event;
        if (message.metadata.message_type === "notification" && event?.message_id && event.chatter_user_id && event.message?.text) {
          await options.sink.ingest(options.channelId, { provider: "twitch", providerMessageId: event.message_id, authorId: event.chatter_user_id, authorDisplayName: event.chatter_user_name, text: event.message.text, sentAt: message.metadata.message_timestamp ?? new Date().toISOString() });
        }
      });
      current.once("error", reject);
      current.once("close", () => {
        signal.removeEventListener("abort", abort);
        if (socket === current) socket = undefined;
        if (signal.aborted) resolve(undefined);
        else if (reconnectUrl) resolve(reconnectUrl);
        else reject(new Error("Twitch EventSub socket closed"));
      });
    });
  }

  async function run(signal: AbortSignal): Promise<void> {
    let url = "wss://eventsub.wss.twitch.tv/ws";
    while (!signal.aborted) {
      try { url = (await connect(url, signal)) ?? "wss://eventsub.wss.twitch.tv/ws"; }
      catch (error) { if (signal.aborted) return; await wait(1_000, signal); url = "wss://eventsub.wss.twitch.tv/ws"; }
    }
  }

  return {
    start() { if (!running) { controller = new AbortController(); running = run(controller.signal).finally(() => { running = undefined; controller = undefined; }); } },
    async stop() { controller?.abort(); socket?.close(); await running?.catch(() => undefined); },
  };
}

export async function* parseJsonObjects(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let start = -1;
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = 0; index < buffer.length; index += 1) {
        const character = buffer[index];
        if (escaped) { escaped = false; continue; }
        if (quoted && character === "\\") { escaped = true; continue; }
        if (character === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (character === "{") { if (!depth) start = index; depth += 1; }
        if (character === "}" && depth && --depth === 0 && start >= 0) {
          yield JSON.parse(buffer.slice(start, index + 1));
          buffer = buffer.slice(index + 1);
          index = -1;
          start = -1;
        }
      }
    }
  } finally { reader.releaseLock(); }
}

function wait(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

type YoutubePayload = { items?: Array<{ id?: string; snippet?: { displayMessage?: string; publishedAt?: string }; authorDetails?: { channelId?: string; displayName?: string } }> };
type TwitchEnvelope = { metadata: { message_type?: string; message_timestamp?: string }; payload?: { session?: { id?: string; reconnect_url?: string }; event?: { message_id?: string; chatter_user_id?: string; chatter_user_name?: string; message?: { text?: string } } } };
import WebSocket from "ws";
