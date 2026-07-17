"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  role: string;
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiFetch<Project[]>("/projects");
      setProjects(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) fetchProjects();
  }, [user, authLoading, router, fetchProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const p = await apiFetch<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDesc || null }),
      });
      setProjects((prev) => [p, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (error) return <div className="error-state">{error}</div>;

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn" onClick={() => setShowCreate(true)} id="create-project-btn">
          + New project
        </button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: "1rem", fontSize: "1.125rem" }}>Create new project</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="proj-name">Project name</label>
                <input
                  id="proj-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Awesome Project"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="proj-desc">Description (optional)</label>
                <textarea
                  id="proj-desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                />
              </div>
              {createError && <p className="form-error">{createError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={creating} id="create-project-submit">
                  {creating ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🚀</div>
          <h3>No projects yet</h3>
          <p>Create your first project to get started.</p>
          <button className="btn" onClick={() => setShowCreate(true)}>
            Create project
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <div
              key={p.id}
              className="project-card card"
              onClick={() => router.push(`/projects/${p.id}/board`)}
              id={`project-card-${p.id}`}
            >
              <div className="project-card-header">
                <div className="project-icon">{p.name.charAt(0).toUpperCase()}</div>
                <span className={`role-badge ${p.role === "owner" ? "role-owner" : "role-member"}`}>
                  {p.role}
                </span>
              </div>
              <h3 className="project-card-name">{p.name}</h3>
              {p.description && (
                <p className="project-card-desc">{p.description}</p>
              )}
              <div className="project-card-footer">
                <div className="project-card-links">
                  <button
                    className="project-link-btn"
                    onClick={(e) => { e.stopPropagation(); router.push(`/projects/${p.id}/board`); }}
                  >
                    Board
                  </button>
                  <button
                    className="project-link-btn"
                    onClick={(e) => { e.stopPropagation(); router.push(`/projects/${p.id}/backlog`); }}
                  >
                    Backlog
                  </button>
                  {p.role === "owner" && (
                    <button
                      className="project-link-btn"
                      onClick={(e) => { e.stopPropagation(); router.push(`/projects/${p.id}/members`); }}
                    >
                      Members
                    </button>
                  )}
                </div>
                <span className="project-card-date">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
