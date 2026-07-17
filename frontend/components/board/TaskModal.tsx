"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

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

interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

interface Props {
  projectId: string;
  task: Task | null; // null = create mode
  members: Member[];
  currentUser: { id: string; name: string; email: string };
  isOwner: boolean;
  onClose: () => void;
  onSaved: () => void;
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

export default function TaskModal({ projectId, task, members, currentUser, isOwner, onClose, onSaved }: Props) {
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!task) return;
    setCommentsLoading(true);
    try {
      const data = await apiFetch<Comment[]>(`/projects/${projectId}/tasks/${task.id}/comments`);
      setComments(data);
    } catch {
      /* ignore */
    } finally {
      setCommentsLoading(false);
    }
  }, [projectId, task]);

  useEffect(() => {
    if (isEdit) fetchComments();
  }, [isEdit, fetchComments]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title,
        description: description || null,
        status,
        priority,
        due_date: dueDate || null,
        assignee_id: assigneeId || null,
      };
      if (isEdit) {
        await apiFetch(`/projects/${projectId}/tasks/${task!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/projects/${projectId}/tasks`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setAddingComment(true);
    try {
      await apiFetch(`/projects/${projectId}/tasks/${task!.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      });
      setCommentBody("");
      fetchComments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setAddingComment(false);
    }
  }

  // Can the current user mark as Done?
  const canMarkDone = isOwner || task?.assignee_id === currentUser.id;
  const isDoneDisabled = status === "done" && !canMarkDone;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? "Edit task" : "Create task"}</h2>
          <button className="modal-close" onClick={onClose} id="task-modal-close">✕</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="task-title">Title *</label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              autoFocus={!isEdit}
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-desc">Description</label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details…"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={isDoneDisabled}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done" disabled={!canMarkDone}>Done</option>
              </select>
              {isDoneDisabled && (
                <p className="form-hint">Only the assignee or owner can mark this Done.</p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="task-priority">Priority</label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-due">Due date</label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="form-group">
              <label htmlFor="task-assignee">Assignee</label>
              <select id="task-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {saveError && <p className="form-error">{saveError}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving} id="task-save-btn">
              {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : isEdit ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>

        {/* Comments — only in edit mode */}
        {isEdit && (
          <div className="comments-section">
            <h3 className="comments-title">Comments</h3>
            {commentsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
                <div className="spinner" />
              </div>
            ) : comments.length === 0 ? (
              <p className="empty-hint">No comments yet. Be the first!</p>
            ) : (
              <div className="comments-list">
                {comments.map((c) => (
                  <div key={c.id} className="comment-item" id={`comment-${c.id}`}>
                    <div className="comment-avatar">{c.author_name.charAt(0).toUpperCase()}</div>
                    <div className="comment-body">
                      <div className="comment-header">
                        <span className="comment-author">{c.author_name}</span>
                        <time className="activity-time">{timeAgo(c.created_at)}</time>
                      </div>
                      <p className="comment-text">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddComment} className="comment-form">
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment…"
                id="comment-input"
              />
              <button type="submit" className="btn" disabled={addingComment || !commentBody.trim()} id="add-comment-btn">
                {addingComment ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "Post"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
