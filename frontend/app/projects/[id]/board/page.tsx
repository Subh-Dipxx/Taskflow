"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { wsClient } from "@/lib/websocket-client";
import TaskModal from "@/components/board/TaskModal";

interface Member {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

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

interface Project {
  id: string;
  name: string;
  description: string | null;
  role: string;
}

const COLUMNS = [
  { key: "todo", label: "To Do", color: "#3b82f6" },
  { key: "in_progress", label: "In Progress", color: "#f59e0b" },
  { key: "done", label: "Done", color: "#22c55e" },
];

export default function BoardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [proj, taskData, memberData] = await Promise.all([
        apiFetch<Project>(`/projects/${projectId}`),
        apiFetch<{ items: Task[] }>(`/projects/${projectId}/tasks?page_size=200`),
        apiFetch<Member[]>(`/projects/${projectId}/members`),
      ]);
      setProject(proj);
      setTasks(taskData.items);
      setMembers(memberData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user) {
      fetchAll();
      wsClient.connect();
      const unsub = wsClient.subscribe((event) => {
        const type = event.type as string;
        if (
          type.startsWith("task.") ||
          type.startsWith("member.") ||
          type === "comment.added"
        ) {
          fetchAll();
        }
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchAll]);

  async function handleDrop(e: React.DragEvent, newStatus: string) {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task || task.status === newStatus) return;
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: newStatus } : t));
    try {
      await apiFetch(`/projects/${projectId}/tasks/${draggingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchAll(); // rollback
    }
    setDraggingId(null);
  }

  if (authLoading || loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }
  if (error) return <div className="error-state">{error}</div>;

  const grouped = Object.fromEntries(COLUMNS.map((c) => [c.key, tasks.filter((t) => t.status === c.key)]));
  const isOwner = project?.role === "owner";

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button className="breadcrumb-link" onClick={() => router.push("/projects")}>Projects</button>
            <span className="breadcrumb-sep">›</span>
            <span>{project?.name}</span>
          </div>
          <h1 className="page-title">{project?.name}</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}/backlog`)} id="goto-backlog">
            Backlog
          </button>
          <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}/activity`)} id="goto-activity">
            Activity
          </button>
          {isOwner && (
            <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}/members`)} id="goto-members">
              Members
            </button>
          )}
          <button className="btn" onClick={() => setShowCreate(true)} id="create-task-btn">
            + Task
          </button>
        </div>
      </div>

      <div className="board">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={`board-column ${dragOverCol === col.key ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className="board-column-header" style={{ borderTop: `3px solid ${col.color}` }}>
              <span>{col.label}</span>
              <span className="col-count">{grouped[col.key]?.length ?? 0}</span>
            </div>
            {(grouped[col.key] || []).map((task) => (
              <div
                key={task.id}
                className="task-card"
                draggable
                onDragStart={() => setDraggingId(task.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setSelectedTask(task)}
                id={`task-card-${task.id}`}
                style={{ opacity: draggingId === task.id ? 0.5 : 1 }}
              >
                <div className="task-card-title">{task.title}</div>
                <div className="task-card-meta">
                  <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                  {task.assignee && (
                    <span className="task-assignee-chip" title={task.assignee.name}>
                      {task.assignee.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {task.due_date && (
                    <span className="task-due-small">
                      {new Date(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {(showCreate || selectedTask) && (
        <TaskModal
          projectId={projectId}
          task={selectedTask}
          members={members}
          currentUser={user!}
          isOwner={isOwner}
          onClose={() => { setShowCreate(false); setSelectedTask(null); }}
          onSaved={() => { setShowCreate(false); setSelectedTask(null); fetchAll(); }}
        />
      )}
    </main>
  );
}
