"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { wsClient } from "@/lib/websocket-client";

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  assignee: { id: string; name: string; email: string } | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function priorityBadge(p: string) {
  const cls = p === "high" ? "badge-high" : p === "medium" ? "badge-medium" : "badge-low";
  return <span className={`badge ${cls}`}>{p}</span>;
}

function statusBadge(s: string) {
  const cls =
    s === "done"
      ? "badge-status-done"
      : s === "in_progress"
      ? "badge-status-in_progress"
      : "badge-status-todo";
  return <span className={`badge ${cls}`}>{s.replace("_", " ")}</span>;
}

export default function AssignedToMePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiFetch<Task[]>("/me/assigned-tasks");
      setTasks(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
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
      fetchTasks();
      wsClient.connect();
      const unsub = wsClient.subscribe((event) => {
        const type = event.type as string;
        if (["task.assigned", "task.updated", "task.deleted", "task.moved"].includes(type)) {
          fetchTasks();
        }
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchTasks]);

  if (authLoading || loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (error) return <div className="error-state">{error}</div>;

  const grouped: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
  tasks.forEach((t) => {
    if (grouped[t.status]) grouped[t.status].push(t);
    else grouped["todo"].push(t);
  });

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assigned to me</h1>
          <p className="page-subtitle">{tasks.length} task{tasks.length !== 1 ? "s" : ""} across all projects</p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🎉</div>
          <h3>You&apos;re all caught up!</h3>
          <p>No tasks are assigned to you right now.</p>
        </div>
      ) : (
        <div className="assigned-sections">
          {[
            { key: "in_progress", label: "In Progress" },
            { key: "todo", label: "To Do" },
            { key: "done", label: "Done" },
          ].map(({ key, label }) =>
            grouped[key].length === 0 ? null : (
              <section key={key} className="card section-card">
                <h2 className="section-title">{label} <span className="count-badge">{grouped[key].length}</span></h2>
                <div className="task-list">
                  {grouped[key].map((task) => (
                    <div
                      key={task.id}
                      className="task-list-item"
                      onClick={() => router.push(`/projects/${task.project_id}/board`)}
                      id={`assigned-task-${task.id}`}
                    >
                      <div className="task-list-main">
                        <span className="task-list-title">{task.title}</span>
                        <div className="task-list-meta">
                          {priorityBadge(task.priority)}
                          {statusBadge(task.status)}
                          {task.due_date && (
                            <span className="task-due">
                              📅 {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="task-list-arrow">→</span>
                    </div>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </main>
  );
}
