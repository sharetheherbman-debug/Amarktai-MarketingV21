"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const TERMINAL = new Set(["completed", "failed", "cancelled", "approved", "locked"]);
const TABS = ["Project", "Script", "Storyboard", "Scenes", "Voice", "Audio", "Captions", "Timeline", "Render", "Export"];

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function statusClass(status) {
  if (["completed", "approved", "locked"].includes(status)) return "text-emerald-300 border-emerald-500/30";
  if (["failed", "cancelled"].includes(status)) return "text-red-300 border-red-500/30";
  if (["queued", "generating", "processing", "rendering"].includes(status)) return "text-amber-300 border-amber-500/30";
  return "text-zinc-300 border-white/10";
}

export default function LongFormStudio({ studioClient }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [videoModels, setVideoModels] = useState([]);
  const [textModels, setTextModels] = useState([]);
  const [voiceModels, setVoiceModels] = useState([]);
  const [audioModels, setAudioModels] = useState([]);
  const [activeTab, setActiveTab] = useState("Project");
  const [newName, setNewName] = useState("My long-form video");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [render, setRender] = useState(null);
  const [renderEvents, setRenderEvents] = useState([]);
  const [continuity, setContinuity] = useState({ method: "auto", shared_prompt_prefix: "", style_reference_url: "" });

  const refreshProjects = useCallback(async () => {
    const items = await studioClient.listLongFormProjects();
    setProjects(items);
    setProject((current) => {
      if (!items.length) return null;
      return items.find((item) => item.id === current?.id) || items[0];
    });
  }, [studioClient]);

  const refreshProject = useCallback(async () => {
    if (!project?.id) return;
    const updated = await studioClient.getLongFormProject(project.id);
    setProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
  }, [project?.id, studioClient]);

  const refreshScenes = useCallback(async () => {
    if (!project?.id) return;
    setScenes(await studioClient.listScenes(project.id));
  }, [studioClient, project?.id]);

  useEffect(() => {
    refreshProjects().catch((error) => setMessage(error.message));
    Promise.allSettled([
      studioClient.listModels("text_to_video").then(setVideoModels),
      studioClient.listModels("text_generation").then(setTextModels),
      studioClient.listModels("text_to_speech").then(setVoiceModels),
      studioClient.listModels("music_generation").then((models) => {
        if (models.length) setAudioModels(models);
        else studioClient.listModels("audio_generation").then(setAudioModels).catch(() => setAudioModels([]));
      }),
    ]);
  }, [studioClient, refreshProjects]);

  useEffect(() => {
    refreshScenes().catch((error) => setMessage(error.message));
    if (project?.id) {
      studioClient.listRenders(project.id).then((items) => setRender(items[0] || null)).catch(() => undefined);
    }
  }, [refreshScenes, project?.id, studioClient]);

  useEffect(() => {
    if (!project?.id || !scenes.some((scene) => !TERMINAL.has(scene.status))) return;
    const timer = setInterval(() => refreshScenes().catch(() => undefined), 4000);
    return () => clearInterval(timer);
  }, [project?.id, scenes, refreshScenes]);

  useEffect(() => {
    if (!render?.id || TERMINAL.has(render.status)) return;
    const timer = setInterval(async () => {
      try {
        const next = await studioClient.getRender(render.id);
        setRender(next);
        setRenderEvents(await studioClient.getRenderEvents(render.id));
      } catch { /* retain the latest state */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [render?.id, render?.status, studioClient]);

  const totalDuration = useMemo(
    () => scenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0),
    [scenes]
  );
  const completedDuration = useMemo(
    () => scenes.filter((scene) => ["completed", "approved", "locked"].includes(scene.status))
      .reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0),
    [scenes]
  );
  const voiceSettings = parseJson(project?.voice_settings, {});
  const musicSettings = parseJson(project?.music_settings, {});
  const captionSettings = parseJson(project?.caption_settings, {});
  const storyboard = parseJson(project?.storyboard, []);

  async function run(label, action) {
    setBusy(label);
    setMessage("");
    try { return await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return null; }
    finally { setBusy(""); }
  }

  const createProject = () => run("create-project", async () => {
    const created = await studioClient.createLongFormProject({
      name: newName.trim() || "Untitled long-form video",
      target_duration_seconds: 60,
      aspect_ratio: "16:9",
      resolution: "1920x1080",
      frame_rate: 24,
    });
    setProjects((items) => [created, ...items]);
    setProject(created);
    setScenes([]);
    setActiveTab("Project");
  });

  const saveProject = (patch) => run("save-project", async () => {
    const updated = await studioClient.updateLongFormProject(project.id, patch);
    setProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    return updated;
  });

  const removeProject = () => run("delete-project", async () => {
    await studioClient.deleteLongFormProject(project.id);
    setProject(null);
    setScenes([]);
    await refreshProjects();
  });

  const addScene = () => run("add-scene", async () => {
    await studioClient.addScene(project.id, {
      title: `Scene ${scenes.length + 1}`,
      visual_prompt: "",
      narration: "",
      caption_text: "",
      duration_seconds: 10,
      model_id: videoModels[0]?.id || null,
    });
    await refreshScenes();
  });

  const patchScene = async (scene, patch) => {
    setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, ...patch } : item));
    try {
      const updated = await studioClient.updateScene(scene.id, patch);
      setScenes((items) => items.map((item) => item.id === scene.id ? updated : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await refreshScenes();
    }
  };

  const moveScene = (index, direction) => run("reorder-scenes", async () => {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const ordered = [...scenes];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setScenes(ordered.map((scene, sceneIndex) => ({ ...scene, scene_number: sceneIndex + 1 })));
    await studioClient.reorderScenes(project.id, ordered.map((scene) => scene.id));
    await refreshScenes();
  });

  const generateStoryboard = () => run("storyboard", async () => {
    const result = await studioClient.generateStoryboard(project.id, {
      script: project.script,
      target_duration_seconds: Number(project.target_duration_seconds || 60),
      scene_duration_seconds: 10,
      model_id: textModels[0]?.id || undefined,
      replace_scenes: true,
    });
    setProject(result.project);
    await refreshScenes();
    setMessage(`Storyboard generated with ${result.generation.model_id}.`);
    setActiveTab("Storyboard");
  });

  const generateAll = () => run("generate-all", async () => {
    await studioClient.generateProject(project.id);
    await refreshScenes();
  });

  const generateVoice = () => run("generate-voice", async () => {
    const narration = scenes.map((scene) => scene.narration).filter(Boolean).join("\n\n") || project.script;
    if (!narration) throw new Error("Add narration or a script before generating voiceover.");
    const generation = await studioClient.createGeneration({
      type: "text_to_speech",
      model: voiceSettings.model_id || voiceModels[0]?.id,
      prompt: narration,
      options: { voice: voiceSettings.voice || "default", format: "mp3" },
    });
    await saveProject({
      voice_settings: {
        ...voiceSettings,
        enabled: true,
        model_id: generation.model || voiceSettings.model_id || voiceModels[0]?.id,
        asset_url: generation.url,
        generation_id: generation.id,
        volume: Number(voiceSettings.volume ?? 1),
      },
    });
  });

  const generateMusic = () => run("generate-music", async () => {
    const prompt = musicSettings.prompt || `Cinematic branded soundtrack for ${project.name}. ${project.description || ""}`;
    const operation = audioModels.some((model) => model.operations?.includes("music_generation"))
      ? "music_generation"
      : "audio_generation";
    const generation = await studioClient.createGeneration({
      type: operation,
      model: musicSettings.model_id || audioModels[0]?.id,
      prompt,
      options: { duration: Number(project.target_duration_seconds || totalDuration || 60) },
    });
    await saveProject({
      music_settings: {
        ...musicSettings,
        enabled: true,
        prompt,
        model_id: generation.model || musicSettings.model_id || audioModels[0]?.id,
        asset_url: generation.url,
        generation_id: generation.id,
        volume: Number(musicSettings.volume ?? 0.25),
        loop: true,
        duck_under_narration: true,
      },
    });
  });

  const uploadProjectAsset = (kind, file) => run(`upload-${kind}`, async () => {
    const asset = await studioClient.uploadAsset(file);
    const url = asset.url || `/api/v1/studio/assets/${asset.id}`;
    if (kind === "voice") {
      await saveProject({ voice_settings: { ...voiceSettings, enabled: true, asset_url: url, asset_id: asset.id } });
    } else {
      await saveProject({ music_settings: { ...musicSettings, enabled: true, asset_url: url, asset_id: asset.id, loop: true } });
    }
  });

  const deriveCaptions = () => run("captions", async () => {
    const updated = await studioClient.deriveCaptions(project.id, {
      burn_in: captionSettings.burn_in !== false,
      position: captionSettings.position || "bottom",
      font_size: Number(captionSettings.font_size || 42),
      text_color: captionSettings.text_color || "#ffffff",
      background: captionSettings.background || "rgba(0,0,0,0.65)",
    });
    setProject(updated);
    await refreshScenes();
  });

  const applyContinuity = () => run("continuity", async () => {
    await studioClient.applyContinuity(project.id, continuity);
    await refreshScenes();
    setMessage(`Continuity chain applied to ${scenes.length} scenes.`);
  });

  const startRender = () => run("render", async () => {
    const created = await studioClient.createRender(project.id);
    setRender(created);
    setRenderEvents([]);
    setActiveTab("Render");
  });

  const renderProjectPanel = () => (
    <div className="grid gap-5 md:grid-cols-2">
      <label className="space-y-2 text-xs text-zinc-400">Project name
        <input value={project.name || ""} onChange={(event) => setProject({ ...project, name: event.target.value })}
          onBlur={(event) => saveProject({ name: event.target.value })}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
      </label>
      <label className="space-y-2 text-xs text-zinc-400">Target duration
        <input type="number" min="10" value={project.target_duration_seconds || 60}
          onChange={(event) => setProject({ ...project, target_duration_seconds: Number(event.target.value) })}
          onBlur={(event) => saveProject({ target_duration_seconds: Number(event.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
      </label>
      <label className="space-y-2 text-xs text-zinc-400 md:col-span-2">Description
        <textarea value={project.description || ""} onChange={(event) => setProject({ ...project, description: event.target.value })}
          onBlur={(event) => saveProject({ description: event.target.value })}
          className="min-h-24 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white" />
      </label>
      <label className="space-y-2 text-xs text-zinc-400">Aspect ratio
        <select value={project.aspect_ratio || "16:9"} onChange={(event) => saveProject({ aspect_ratio: event.target.value })}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          {['16:9', '9:16', '1:1', '4:3', '3:4'].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-xs text-zinc-400">Resolution
        <select value={project.resolution || "1920x1080"} onChange={(event) => saveProject({ resolution: event.target.value })}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          {['1920x1080', '1080x1920', '1080x1080', '1280x720'].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button onClick={removeProject} className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-300">Delete project</button>
      </div>
    </div>
  );

  const renderScriptPanel = () => (
    <div className="space-y-4">
      <textarea value={project.script || ""} onChange={(event) => setProject({ ...project, script: event.target.value })}
        onBlur={(event) => saveProject({ script: event.target.value })}
        placeholder="Write or paste the complete script. Your edits are saved and never overwritten automatically."
        className="min-h-[360px] w-full rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white" />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <span>{(project.script || "").split(/\s+/).filter(Boolean).length} words</span>
        <button disabled={!project.script || busy} onClick={generateStoryboard}
          className="rounded-lg bg-lime-300 px-4 py-2 font-bold text-black disabled:opacity-40">Generate storyboard</button>
      </div>
    </div>
  );

  const renderStoryboardPanel = () => (
    <div className="space-y-3">
      {storyboard.length === 0 && <p className="py-16 text-center text-sm text-zinc-500">Generate a storyboard from the Script tab.</p>}
      {storyboard.map((item, index) => (
        <article key={`${index}-${item.title || "scene"}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{item.title || `Scene ${index + 1}`}</h3><span className="text-xs text-zinc-500">{item.duration_seconds || 10}s</span></div>
          <p className="mt-3 text-sm text-zinc-300">{item.visual_prompt}</p>
          {item.narration && <p className="mt-2 text-xs text-zinc-500">Narration: {item.narration}</p>}
          {item.camera_instructions && <p className="mt-2 text-xs text-zinc-500">Camera: {item.camera_instructions}</p>}
        </article>
      ))}
    </div>
  );

  const renderScenesPanel = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <button onClick={addScene} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white">Add scene</button>
        <div className="flex gap-2">
          <button disabled={!scenes.length || busy} onClick={applyContinuity} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white disabled:opacity-40">Apply continuity</button>
          <button disabled={!scenes.length || busy} onClick={generateAll} className="rounded-lg bg-lime-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">Generate all</button>
          <button disabled={!scenes.some((scene) => scene.status === "failed") || busy} onClick={() => run("retry", async () => { await studioClient.retryFailedScenes(project.id); await refreshScenes(); })}
            className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-300 disabled:opacity-40">Retry failed</button>
        </div>
      </div>
      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
        <label className="text-xs text-zinc-400">Continuity method
          <select value={continuity.method} onChange={(event) => setContinuity({ ...continuity, method: event.target.value })}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white">
            <option value="auto">Automatic best available</option><option value="native">Native continuation</option><option value="final_frame">Final-frame continuation</option><option value="reference_image">Reference-image continuity</option><option value="prompt_only">Prompt-only continuity</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">Shared prompt prefix
          <input value={continuity.shared_prompt_prefix} onChange={(event) => setContinuity({ ...continuity, shared_prompt_prefix: event.target.value })}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white" placeholder="Consistent character, lighting and brand style..." />
        </label>
      </div>
      {scenes.map((scene, index) => (
        <article key={scene.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="text-xs font-bold text-zinc-500">#{index + 1}</span><input value={scene.title || ""} onChange={(event) => setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, title: event.target.value } : item))}
              onBlur={(event) => patchScene(scene, { title: event.target.value })} className="rounded border border-transparent bg-transparent px-2 py-1 font-semibold text-white hover:border-white/10" /></div>
            <span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(scene.status)}`}>{scene.status}</span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-xs text-zinc-500">Visual prompt<textarea value={scene.visual_prompt || ""} onChange={(event) => setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, visual_prompt: event.target.value } : item))}
              onBlur={(event) => patchScene(scene, { visual_prompt: event.target.value })} className="mt-1 min-h-28 w-full rounded-lg border border-white/10 bg-black p-3 text-xs text-white" /></label>
            <label className="text-xs text-zinc-500">Narration<textarea value={scene.narration || ""} onChange={(event) => setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, narration: event.target.value } : item))}
              onBlur={(event) => patchScene(scene, { narration: event.target.value })} className="mt-1 min-h-28 w-full rounded-lg border border-white/10 bg-black p-3 text-xs text-white" /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_100px_auto]">
            <select value={scene.model_id || ""} onChange={(event) => patchScene(scene, { model_id: event.target.value })} className="rounded-lg border border-white/10 bg-black p-2 text-xs text-white"><option value="">Select runtime-confirmed model</option>{videoModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select>
            <input type="number" min="1" max="30" value={scene.duration_seconds || 10} onChange={(event) => patchScene(scene, { duration_seconds: Number(event.target.value) })} className="rounded-lg border border-white/10 bg-black p-2 text-xs text-white" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => moveScene(index, -1)} disabled={index === 0} className="rounded border border-white/10 px-2 text-xs text-white disabled:opacity-30">↑</button>
              <button onClick={() => moveScene(index, 1)} disabled={index === scenes.length - 1} className="rounded border border-white/10 px-2 text-xs text-white disabled:opacity-30">↓</button>
              <button onClick={() => run("duplicate", async () => { await studioClient.duplicateScene(project.id, scene.id); await refreshScenes(); })} className="rounded border border-white/10 px-2 text-xs text-white">Duplicate</button>
              <button disabled={!scene.visual_prompt || ["queued", "generating"].includes(scene.status)} onClick={() => run("generate-scene", async () => { await studioClient.generateScene(scene.id); await refreshScenes(); })} className="rounded bg-lime-300 px-3 text-xs font-bold text-black disabled:opacity-40">Generate</button>
              <button onClick={() => patchScene(scene, { status: scene.status === "locked" ? "approved" : "locked" })} className="rounded border border-white/10 px-2 text-xs text-white">{scene.status === "locked" ? "Unlock" : "Lock"}</button>
              <button onClick={() => run("delete-scene", async () => { await studioClient.deleteScene(scene.id); await refreshScenes(); })} className="rounded border border-red-500/30 px-2 text-xs text-red-300">Delete</button>
            </div>
          </div>
          {scene.error_message && <p className="mt-2 text-xs text-red-300">{scene.error_message}</p>}
          {scene.generated_clip_url && <video src={scene.generated_clip_url} controls className="mt-3 max-h-72 w-full rounded-lg bg-black" />}
        </article>
      ))}
    </div>
  );

  const renderVoicePanel = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs text-zinc-400">Voice model<select value={voiceSettings.model_id || ""} onChange={(event) => saveProject({ voice_settings: { ...voiceSettings, model_id: event.target.value } })} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white"><option value="">Choose runtime-confirmed voice model</option>{voiceModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        <label className="text-xs text-zinc-400">Voice name<input value={voiceSettings.voice || "default"} onChange={(event) => setProject({ ...project, voice_settings: { ...voiceSettings, voice: event.target.value } })} onBlur={(event) => saveProject({ voice_settings: { ...voiceSettings, voice: event.target.value } })} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white" /></label>
        <label className="text-xs text-zinc-400">Narration volume<input type="range" min="0" max="2" step="0.05" value={voiceSettings.volume ?? 1} onChange={(event) => saveProject({ voice_settings: { ...voiceSettings, volume: Number(event.target.value) } })} className="mt-3 w-full" /></label>
        <label className="text-xs text-zinc-400">Upload narration<input type="file" accept="audio/*" onChange={(event) => event.target.files?.[0] && uploadProjectAsset("voice", event.target.files[0])} className="mt-2 block w-full text-xs text-zinc-400" /></label>
      </div>
      <button disabled={!voiceModels.length || busy} onClick={generateVoice} className="rounded-lg bg-lime-300 px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Generate project narration</button>
      {voiceSettings.asset_url && <audio src={voiceSettings.asset_url} controls className="w-full" />}
    </div>
  );

  const renderAudioPanel = () => (
    <div className="space-y-5">
      <label className="block text-xs text-zinc-400">Soundtrack prompt<textarea value={musicSettings.prompt || ""} onChange={(event) => setProject({ ...project, music_settings: { ...musicSettings, prompt: event.target.value } })} onBlur={(event) => saveProject({ music_settings: { ...musicSettings, prompt: event.target.value } })} className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-black p-3 text-white" /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs text-zinc-400">Audio model<select value={musicSettings.model_id || ""} onChange={(event) => saveProject({ music_settings: { ...musicSettings, model_id: event.target.value } })} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white"><option value="">Choose runtime-confirmed audio model</option>{audioModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        <label className="text-xs text-zinc-400">Upload soundtrack<input type="file" accept="audio/*" onChange={(event) => event.target.files?.[0] && uploadProjectAsset("music", event.target.files[0])} className="mt-2 block w-full text-xs text-zinc-400" /></label>
        <label className="text-xs text-zinc-400">Soundtrack volume<input type="range" min="0" max="1" step="0.05" value={musicSettings.volume ?? 0.25} onChange={(event) => saveProject({ music_settings: { ...musicSettings, volume: Number(event.target.value) } })} className="mt-3 w-full" /></label>
        <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={musicSettings.duck_under_narration !== false} onChange={(event) => saveProject({ music_settings: { ...musicSettings, duck_under_narration: event.target.checked } })} />Duck soundtrack under narration</label>
      </div>
      <button disabled={!audioModels.length || busy} onClick={generateMusic} className="rounded-lg bg-lime-300 px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Generate soundtrack</button>
      {musicSettings.asset_url && <audio src={musicSettings.asset_url} controls className="w-full" />}
    </div>
  );

  const renderCaptionsPanel = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={captionSettings.burn_in !== false} onChange={(event) => saveProject({ caption_settings: { ...captionSettings, enabled: true, burn_in: event.target.checked } })} />Burn captions into final MP4</label>
        <label className="text-xs text-zinc-400">Position<select value={captionSettings.position || "bottom"} onChange={(event) => saveProject({ caption_settings: { ...captionSettings, position: event.target.value } })} className="mt-2 w-full rounded-lg border border-white/10 bg-black p-2 text-white"><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label>
        <label className="text-xs text-zinc-400">Font size<input type="number" min="16" max="96" value={captionSettings.font_size || 42} onChange={(event) => saveProject({ caption_settings: { ...captionSettings, font_size: Number(event.target.value) } })} className="mt-2 w-full rounded-lg border border-white/10 bg-black p-2 text-white" /></label>
        <label className="text-xs text-zinc-400">Text colour<input type="color" value={captionSettings.text_color || "#ffffff"} onChange={(event) => saveProject({ caption_settings: { ...captionSettings, text_color: event.target.value } })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black" /></label>
      </div>
      <button disabled={!scenes.length || busy} onClick={deriveCaptions} className="rounded-lg bg-lime-300 px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Derive captions from narration</button>
      <div className="space-y-2">{scenes.map((scene) => <label key={scene.id} className="block text-xs text-zinc-500">Scene {scene.scene_number}<input value={scene.caption_text || ""} onChange={(event) => setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, caption_text: event.target.value } : item))} onBlur={(event) => patchScene(scene, { caption_text: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-white" /></label>)}</div>
    </div>
  );

  const renderTimelinePanel = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Scenes", scenes.length], ["Planned", `${totalDuration}s`], ["Completed", `${completedDuration}s`], ["Target", `${project.target_duration_seconds || 60}s`]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p></div>)}</div>
      <div className="flex h-16 overflow-hidden rounded-xl border border-white/10 bg-black">{scenes.map((scene, index) => <div key={scene.id} title={`${scene.title || `Scene ${index + 1}`} · ${scene.duration_seconds}s`} style={{ flex: Math.max(1, Number(scene.duration_seconds || 1)) }} className={`flex min-w-12 items-center justify-center border-r border-black/50 px-2 text-[10px] ${["completed", "approved", "locked"].includes(scene.status) ? "bg-emerald-500/30 text-emerald-100" : scene.status === "failed" ? "bg-red-500/30 text-red-100" : "bg-white/10 text-zinc-300"}`}>#{index + 1}</div>)}</div>
      <p className="text-xs text-zinc-500">The final render follows this scene order. Use the Scenes tab to reorder clips.</p>
    </div>
  );

  const renderRenderPanel = () => (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2"><button disabled={busy || !scenes.some((scene) => ["completed", "approved", "locked"].includes(scene.status))} onClick={startRender} className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Start final MP4 render</button>{render && !TERMINAL.has(render.status) && <button onClick={() => run("cancel-render", async () => { await studioClient.cancelRender(render.id); setRender(await studioClient.getRender(render.id)); })} className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-300">Cancel render</button>}</div>
      {render && <div className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><h3 className="font-semibold text-white">Render {render.status}</h3><span className="text-xs text-zinc-400">{render.progress || 0}%</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-white/10"><div style={{ width: `${render.progress || 0}%` }} className="h-full bg-lime-300" /></div>{render.error_message && <p className="mt-3 text-xs text-red-300">{render.error_message}</p>}{render.output_url && <video src={render.output_url} controls className="mt-4 max-h-[520px] w-full rounded-lg bg-black" />}</div>}
      {renderEvents.length > 0 && <div className="space-y-2">{renderEvents.map((event) => <div key={event.id} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400"><span className="font-semibold text-zinc-200">{event.event_type}</span> · {event.message}</div>)}</div>}
    </div>
  );

  const renderExportPanel = () => (
    <div className="space-y-5 text-center py-12">
      {project.final_output_url || render?.output_url ? <><h3 className="text-xl font-bold text-white">Your final video is ready</h3><p className="text-sm text-zinc-400">H.264 MP4 with AAC audio and a downloadable thumbnail.</p><div className="flex justify-center gap-3"><a href={project.final_output_url || render.output_url} download className="rounded-lg bg-lime-300 px-5 py-3 text-sm font-bold text-black">Download MP4</a>{project.thumbnail_url || render?.thumbnail_url ? <a href={project.thumbnail_url || render.thumbnail_url} download className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white">Download thumbnail</a> : null}</div></> : <><h3 className="text-xl font-bold text-white">No completed export yet</h3><p className="text-sm text-zinc-400">Complete scene generation and run the Render step first.</p></>}
    </div>
  );

  const panels = { Project: renderProjectPanel, Script: renderScriptPanel, Storyboard: renderStoryboardPanel, Scenes: renderScenesPanel, Voice: renderVoicePanel, Audio: renderAudioPanel, Captions: renderCaptionsPanel, Timeline: renderTimelinePanel, Render: renderRenderPanel, Export: renderExportPanel };

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-white/10 bg-[#111] p-4">
        <h2 className="text-sm font-bold text-white">Long-Form Projects</h2>
        <div className="mt-3 flex gap-2"><input value={newName} onChange={(event) => setNewName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white" /><button disabled={busy === "create-project"} onClick={createProject} className="rounded-lg bg-lime-300 px-3 text-xs font-bold text-black disabled:opacity-40">New</button></div>
        <div className="mt-4 space-y-2">{projects.map((item) => <button key={item.id} onClick={() => setProject(item)} className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${project?.id === item.id ? "border-lime-300 text-lime-200" : "border-white/10 text-zinc-300"}`}><div className="font-semibold">{item.name}</div><div className="mt-1 text-[10px] text-zinc-500">{item.status}</div></button>)}</div>
      </aside>

      <section className="min-w-0 rounded-2xl border border-white/10 bg-[#111] p-5">
        {!project ? <div className="py-24 text-center text-sm text-zinc-400">Create or select a project.</div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">{project.name}</h2><p className="text-xs text-zinc-400">{scenes.length} scenes · {totalDuration}s planned · target {project.target_duration_seconds || 60}s</p></div>{busy && <span className="rounded-full border border-amber-500/30 px-3 py-1 text-xs text-amber-300">Working: {busy}</span>}</div>
          {message && <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}
          <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-white/10 pb-3">{TABS.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${activeTab === tab ? "bg-lime-300 font-bold text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>{tab}</button>)}</nav>
          <div className="mt-5">{panels[activeTab]?.()}</div>
        </>}
      </section>
    </div>
  );
}
