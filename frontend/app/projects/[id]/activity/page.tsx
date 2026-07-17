"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { wsClient } from "@/lib/websocket-client";

interface ActivityItem {
  id: string;
  project_id: string;
  actor_id: string;
  actor_name: string;
  event_type: string;
  task_id: string | null;
  event_metadata: Record<string, string>;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  role: string;
}

function formatEvent(item: ActivityItem): string {
  const e = item.event_type;
  const meta = item.event_metadata;
  if (e === "task.created") return `created task "${meta.title || "a task"}"`;
  if (e === "task.updated") return `updated task "${meta.title || "a task"}"`;
  if (e === "task.moved") return `moved task to ${(meta.new_status || "").replace("_", " ")}`;
  if (e === "task.assigned") return `changed task assignment`;
  if (e === "task.deleted") return `deleted a task`;
  if (e === "comment.added") return `added a comment`;
  if (e === "member.invited") return `invited a new member`;
  if (e === "member.removed") return `removed a member`;
  return e;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EVENT_ICONS: Record<string, string> = {
  "task.created": "✨",
  "task.updated": "✏️",
  "task.moved": "📦",
  "task.assigned": "👤",
  "task.deleted": "🗑️",
  "comment.added": "💬",
  "member.invited": "➕",
  "member.removed": "➖",
};

export default function ActivityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchActivity = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const [proj, data] = await Promise.all([
        apiFetch<Project>(`/projects/${projectId}`),
        apiFetch<{ items: ActivityItem[]; total: number; page: number; page_size: number }>
          (`/projects/${projectId}/activity?page=${p}&page_size=20`),
      ]);
      setProject(proj);
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(Math.max(1, Math.ceil(data.total / 20)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user) {
      fetchActivity(page);
      wsClient.connect();
      const unsub = wsClient.subscribe((event) => {
        const type = event.type as string;
        if (type === "activity.new" || type.startsWith("task.") || type.startsWith("member.") || type === "comment.added") {
          fetchActivity(1);
          setPage(1);
        }
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchActivity, page]);

  if (authLoading || loading) return <div className="loading-state"><div className="spinner" /></div>;
  if (error) return <div className="error-state">{error}</div>;

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button className="breadcrumb-link" onClick={() => router.push("/projects")}>Projects</button>
            <span className="breadcrumb-sep">›</span>
            <button className="breadcrumb-link" onClick={() => router.push(`/projects/${projectId}/board`)}>{project?.name}</button>
            <span className="breadcrumb-sep">›</span>
            <span>Activity</span>
          </div>
          <h1 className="page-title">Activity log</h1>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{total} events</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📜</div>
          <h3>No activity yet</h3>
          <p>Actions on this project will appear here.</p>
        </div>
      ) : (
        <div className="activity-feed card">
          {items.map((item, idx) => (
            <div key={item.id} className="activity-item" id={`activity-${item.id}`}>
              <div className="activity-line-connector" style={{ display: idx < items.length - 1 ? "block" : "none" }} />
              <div className="activity-dot">{EVENT_ICONS[item.event_type] || "•"}</div>
              <div className="activity-body">
                <span className="activity-actor">{item.actor_name}</span>{" "}
                <span>{formatEvent(item)}</span>
              </div>
              <time className="activity-time" title={new Date(item.created_at).toLocaleString()}>
                {timeAgo(item.created_at)}
              </time>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">{total} events total</span>
          <div className="pagination-btns">
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              id="activity-prev"
            >
              ← Prev
            </button>
            <span className="page-indicator">Page {page} / {totalPages}</span>
            <button
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              id="activity-next"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
