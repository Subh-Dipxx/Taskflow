"use client";

import { getAccessToken } from "./api-client";

type EventHandler = (event: Record<string, unknown>) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    const token = getAccessToken();
    if (!token) return;

    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    this.ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        this.handlers.forEach((h) => h(data));
      } catch {
        /* ignore */
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export const wsClient = new WebSocketClient();
