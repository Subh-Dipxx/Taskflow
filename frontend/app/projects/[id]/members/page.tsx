"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { wsClient } from "@/lib/websocket-client";

interface Member {
  user_id: string;
  name: string;
  email: string;
  role: string;
  joined_at: string;
}

interface Project {
  id: string;
  name: string;
  role: string;
}

export default function MembersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [proj, mems] = await Promise.all([
        apiFetch<Project>(`/projects/${projectId}`),
        apiFetch<Member[]>(`/projects/${projectId}/members`),
      ]);
      setProject(proj);
      setMembers(mems);
      if (proj.role !== "owner") {
        router.push(`/projects/${projectId}/board`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user) {
      fetchAll();
      wsClient.connect();
      const unsub = wsClient.subscribe((event) => {
        const type = event.type as string;
        if (type.startsWith("member.")) fetchAll();
      });
      return () => { unsub(); };
    }
  }, [user, authLoading, router, fetchAll]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviting(true);
    try {
      await apiFetch(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail("");
      setShowInvite(false);
      fetchAll();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    try {
      await apiFetch(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
      fetchAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      fetchAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to change role");
    }
  }

  async function handleDeleteProject() {
    if (!confirm("Delete this entire project? This cannot be undone.")) return;
    try {
      await apiFetch(`/projects/${projectId}`, { method: "DELETE" });
      router.push("/projects");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

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
            <span>Members</span>
          </div>
          <h1 className="page-title">Members</h1>
        </div>
        <button className="btn" onClick={() => setShowInvite(true)} id="invite-member-btn">
          + Invite member
        </button>
      </div>

      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: "1rem", fontSize: "1.125rem" }}>Invite member</h2>
            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                  autoFocus
                />
              </div>
              {inviteError && <p className="form-error">{inviteError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={inviting} id="invite-submit">
                  {inviting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} id={`member-row-${m.user_id}`}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div className="member-avatar">{m.name.charAt(0).toUpperCase()}</div>
                    <span>{m.name}</span>
                    {m.user_id === user?.id && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>(you)</span>}
                  </div>
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{m.email}</td>
                <td>
                  {m.role === "owner" ? (
                    <span className="role-badge role-owner">owner</span>
                  ) : (
                    <select
                      className="role-select"
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                      disabled={m.user_id === user?.id}
                      id={`role-select-${m.user_id}`}
                    >
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                  )}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  {new Date(m.joined_at).toLocaleDateString()}
                </td>
                <td>
                  {m.role !== "owner" && m.user_id !== user?.id && (
                    <button
                      className="icon-btn danger"
                      onClick={() => handleRemove(m.user_id, m.name)}
                      title="Remove member"
                      id={`remove-member-${m.user_id}`}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="danger-zone card" style={{ marginTop: "2rem", borderColor: "var(--danger)" }}>
        <h3 style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>Danger zone</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.875rem" }}>
          Deleting a project permanently removes all tasks, comments, and activity.
        </p>
        <button className="btn btn-danger" onClick={handleDeleteProject} id="delete-project-btn">
          Delete project
        </button>
      </div>
    </main>
  );
}
