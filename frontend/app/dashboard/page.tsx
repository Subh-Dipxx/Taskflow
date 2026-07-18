"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  event_metadata: Record<string, unknown>;
  created_at: string;
}

interface DashboardData {
  project_count: number;
  assigned_by_status: Record<string, number>;
  completed_this_week: number;
  busiest_project: { id: string; name: string; open_task_count: number } | null;
  recent_activity: ActivityItem[];
}

function formatEvent(item: ActivityItem): string {
  const e = item.event_type;
  const meta = item.event_metadata as Record<string, string>;
  if (e === "task.created") return `created task "${meta.title || "unknown"}"`;
  if (e === "task.updated") return `updated task "${meta.title || "unknown"}"`;
  if (e === "task.moved") return `moved task to ${(meta.new_status || "").replace("_", " ")}`;
  if (e === "task.assigned") return `assigned a task`;
  if (e === "task.deleted") return `deleted a task`;
  if (e === "comment.added") return `commented on a task`;
  if (e === "member.invited") return `invited ${meta.user_name || meta.email || "a member"}`;
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

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async () => {
    try {
      const d = await apiFetch<DashboardData>("/dashboard");
      setData(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      fetchDashboard();
      wsClient.connect();
      const unsub = wsClient.subscribe(() => {
        fetchDashboard();
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchDashboard]);

  if (authLoading || loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (error) return <div className="error-state">{error}</div>;
  if (!data) return null;

  const totalAssigned = Object.values(data.assigned_by_status).reduce((a, b) => a + b, 0);

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name} 👋</p>
        </div>
        <Link href="/projects" className="btn" id="new-project-btn">
          + New project
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card card">
          <div className="stat-icon" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>📁</div>
          <div className="stat-value">{data.project_count}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>📋</div>
          <div className="stat-value">{totalAssigned}</div>
          <div className="stat-label">Assigned to me</div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>✅</div>
          <div className="stat-value">{data.completed_this_week}</div>
          <div className="stat-label">Completed this week</div>
        </div>
        {data.busiest_project && (
          <div className="stat-card card">
            <div className="stat-icon" style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7" }}>🔥</div>
            <div className="stat-value">{data.busiest_project.open_task_count}</div>
            <div className="stat-label">Open in {data.busiest_project.name}</div>
          </div>
        )}
      </div>

      {/* Assigned by Status */}
      {totalAssigned > 0 && (
        <div className="card section-card">
          <h2 className="section-title">My tasks by status</h2>
          <div className="status-bars">
            {Object.entries(data.assigned_by_status).map(([status, count]) => (
              <div key={status} className="status-bar-row">
                <span className={`badge badge-status-${status}`}>{status.replace("_", " ")}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(count / totalAssigned) * 100}%`,
                      background: status === "done" ? "var(--success)" : status === "in_progress" ? "var(--warning)" : "var(--primary)",
                    }}
                  />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card section-card">
        <h2 className="section-title">Recent activity</h2>
        {data.recent_activity.length === 0 ? (
          <p className="empty-hint">No recent activity yet.</p>
        ) : (
          <ul className="activity-list">
            {data.recent_activity.map((item) => (
              <li key={item.id} className="activity-item">
                <div className="activity-avatar">{item.actor_name.charAt(0).toUpperCase()}</div>
                <div className="activity-body">
                  <span className="activity-actor">{item.actor_name}</span>{" "}
                  <span>{formatEvent(item)}</span>
                </div>
                <time className="activity-time">{timeAgo(item.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
