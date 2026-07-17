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
  role: string;
}

interface TaskListResp {
  items: Task[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function BacklogPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (assigneeFilter) params.set("assignee_id", assigneeFilter);

      const [proj, taskData, memberData] = await Promise.all([
        apiFetch<Project>(`/projects/${projectId}`),
        apiFetch<TaskListResp>(`/projects/${projectId}/tasks?${params}`),
        apiFetch<Member[]>(`/projects/${projectId}/members`),
      ]);
      setProject(proj);
      setTasks(taskData.items);
      setTotal(taskData.total);
      setTotalPages(taskData.total_pages);
      setMembers(memberData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load backlog");
    } finally {
      setLoading(false);
    }
  }, [projectId, page, search, statusFilter, priorityFilter, assigneeFilter, sortBy, sortDir]);

  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user) {
      fetchAll();
      wsClient.connect();
      const unsub = wsClient.subscribe((event) => {
        const type = event.type as string;
        if (type.startsWith("task.") || type.startsWith("member.")) fetchAll();
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchAll]);

  async function handleDelete(taskId: string) {
    if (!confirm("Delete this task?")) return;
    try {
      await apiFetch(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
      fetchAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (authLoading) return <div className="loading-state"><div className="spinner" /></div>;
  if (error) return <div className="error-state">{error}</div>;

  const isOwner = project?.role === "owner";

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button className="breadcrumb-link" onClick={() => router.push("/projects")}>Projects</button>
            <span className="breadcrumb-sep">›</span>
            <button className="breadcrumb-link" onClick={() => router.push(`/projects/${projectId}/board`)}>{project?.name}</button>
            <span className="breadcrumb-sep">›</span>
            <span>Backlog</span>
          </div>
          <h1 className="page-title">Backlog</h1>
        </div>
        <button className="btn" onClick={() => setShowCreate(true)} id="create-task-backlog-btn">
          + Task
        </button>
      </div>

      {/* Filters */}
      <div className="filters card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <input
          type="text"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 200 }}
          id="backlog-search"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} id="backlog-status-filter">
          <option value="">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} id="backlog-priority-filter">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }} id="backlog-assignee-filter">
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.name}</option>
          ))}
        </select>
        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [by, dir] = e.target.value.split(":");
            setSortBy(by);
            setSortDir(dir);
            setPage(1);
          }}
          id="backlog-sort"
        >
          <option value="created_at:desc">Newest</option>
          <option value="created_at:asc">Oldest</option>
          <option value="priority:desc">Priority ↓</option>
          <option value="priority:asc">Priority ↑</option>
          <option value="due_date:asc">Due date ↑</option>
          <option value="due_date:desc">Due date ↓</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : tasks.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📭</div>
          <h3>No tasks found</h3>
          <p>Try adjusting your filters or create a new task.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Due date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="table-row-hover" id={`backlog-task-${task.id}`}>
                    <td>
                      <button
                        className="task-title-btn"
                        onClick={() => setSelectedTask(task)}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td>
                      <span className={`badge badge-status-${task.status}`}>
                        {task.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                    </td>
                    <td>
                      {task.assignee ? (
                        <span className="assignee-cell">
                          <span className="task-assignee-chip">{task.assignee.name.charAt(0)}</span>
                          {task.assignee.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString()
                        : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td>
                      <button
                        className="icon-btn danger"
                        onClick={() => handleDelete(task.id)}
                        title="Delete task"
                        id={`delete-task-${task.id}`}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <span className="pagination-info">{total} tasks</span>
            <div className="pagination-btns">
              <button
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                id="page-prev"
              >
                ← Prev
              </button>
              <span className="page-indicator">Page {page} / {totalPages}</span>
              <button
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                id="page-next"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

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
