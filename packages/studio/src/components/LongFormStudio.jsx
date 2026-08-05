"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const terminal = new Set(["completed", "failed", "cancelled"]);

export default function LongFormStudio({ studioClient }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [videoModels, setVideoModels] = useState([]);
  const [name, setName] = useState("My long-form video");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [render, setRender] = useState(null);

  const refreshProjects = useCallback(async () => {
    const items = await studioClient.listLongFormProjects();
    setProjects(items);
    setProject((current) => current || items[0] || null);
  }, [studioClient]);

  const refreshScenes = useCallback(async () => {
    if (!project?.id) return;
    setScenes(await studioClient.listScenes(project.id));
  }, [studioClient, project?.id]);

  useEffect(() => {
    refreshProjects().catch((error) => setMessage(error.message));
    studioClient.listModels("text_to_video").then(setVideoModels).catch(() => setVideoModels([]));
  }, [studioClient, refreshProjects]);

  useEffect(() => {
    refreshScenes().catch((error) => setMessage(error.message));
  }, [refreshScenes]);

  useEffect(() => {
    if (!project?.id || !scenes.some((scene) => !terminal.has(scene.status))) return;
    const timer = setInterval(() => refreshScenes().catch(() => undefined), 4000);
    return () => clearInterval(timer);
  }, [project?.id, scenes, refreshScenes]);

  useEffect(() => {
    if (!render?.id || terminal.has(render.status)) return;
    const timer = setInterval(async () => {
      try { setRender(await studioClient.getRender(render.id)); } catch { /* retain state */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [render?.id, render?.status, studioClient]);

  const totalDuration = useMemo(
    () => scenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0),
    [scenes]
  );

  const createProject = async () => {
    setBusy(true);
    setMessage("");
    try {
      const created = await studioClient.createLongFormProject({
        name,
        target_duration_seconds: 60,
        aspect_ratio: "16:9",
        resolution: "1920x1080",
        frame_rate: 24,
      });
      setProjects((items) => [created, ...items]);
      setProject(created);
      setScenes([]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const addScene = async () => {
    if (!project) return;
    await studioClient.addScene(project.id, {
      title: `Scene ${scenes.length + 1}`,
      visual_prompt: "",
      duration_seconds: 10,
      model_id: videoModels[0]?.id || null,
    });
    await refreshScenes();
  };

  const patchScene = async (scene, patch) => {
    setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, ...patch } : item));
    await studioClient.updateScene(scene.id, patch);
  };

  const generateAll = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await studioClient.generateProject(project.id);
      await refreshScenes();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const startRender = async () => {
    if (!project) return;
    setBusy(true);
    try { setRender(await studioClient.createRender(project.id)); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-white/10 bg-[#111] p-4">
        <h2 className="text-sm font-bold text-white">Long-Form Projects</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white"
          />
          <button disabled={busy} onClick={createProject} className="rounded-lg bg-lime-300 px-3 text-xs font-bold text-black disabled:opacity-40">New</button>
        </div>
        <div className="mt-4 space-y-2">
          {projects.map((item) => (
            <button
              key={item.id}
              onClick={() => setProject(item)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${project?.id === item.id ? "border-lime-300 text-lime-200" : "border-white/10 text-zinc-300"}`}
            >
              <div className="font-semibold">{item.name}</div>
              <div className="mt-1 text-[10px] text-zinc-500">{item.status}</div>
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
        {!project ? (
          <div className="py-20 text-center text-sm text-zinc-400">Create or select a project.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{project.name}</h2>
                <p className="text-xs text-zinc-400">{scenes.length} scenes · {totalDuration}s planned</p>
              </div>
              <div className="flex gap-2">
                <button onClick={addScene} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white">Add scene</button>
                <button disabled={busy || scenes.length === 0} onClick={generateAll} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">Generate all</button>
                <button disabled={busy || scenes.every((scene) => scene.status !== "completed")} onClick={startRender} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-40">Render</button>
              </div>
            </div>

            {message && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{message}</div>}

            <div className="mt-5 space-y-3">
              {scenes.map((scene, index) => (
                <div key={scene.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="grid gap-3 md:grid-cols-[70px_1fr_180px_90px_auto]">
                    <div className="text-xs font-bold text-zinc-400">Scene {index + 1}</div>
                    <textarea
                      value={scene.visual_prompt || ""}
                      onChange={(event) => setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, visual_prompt: event.target.value } : item))}
                      onBlur={(event) => patchScene(scene, { visual_prompt: event.target.value })}
                      placeholder="Describe the shot..."
                      className="min-h-20 rounded-lg border border-white/10 bg-[#090909] p-3 text-xs text-white"
                    />
                    <select
                      value={scene.model_id || ""}
                      onChange={(event) => patchScene(scene, { model_id: event.target.value })}
                      className="rounded-lg border border-white/10 bg-[#090909] p-2 text-xs text-white"
                    >
                      <option value="">Select model</option>
                      {videoModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={scene.duration_seconds || 10}
                      onChange={(event) => patchScene(scene, { duration_seconds: Number(event.target.value) })}
                      className="rounded-lg border border-white/10 bg-[#090909] p-2 text-xs text-white"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        disabled={!scene.visual_prompt || ["queued", "generating"].includes(scene.status)}
                        onClick={async () => { await studioClient.generateScene(scene.id); await refreshScenes(); }}
                        className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                      >Generate</button>
                      <button
                        onClick={async () => { await studioClient.deleteScene(scene.id); await refreshScenes(); }}
                        className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300"
                      >Delete</button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-400">
                    <span>Status: {scene.status}</span>
                    {scene.error_message && <span className="text-red-300">{scene.error_message}</span>}
                  </div>
                  {scene.generated_clip_url && <video src={scene.generated_clip_url} controls className="mt-3 max-h-64 w-full rounded-lg bg-black" />}
                </div>
              ))}
            </div>

            {render && (
              <div className="mt-6 rounded-xl border border-white/10 p-4">
                <div className="text-sm font-bold text-white">Render: {render.status}</div>
                <div className="mt-1 text-xs text-zinc-400">{render.progress || 0}%</div>
                {render.output_url && <video src={render.output_url} controls className="mt-3 max-h-[520px] w-full rounded-lg bg-black" />}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
