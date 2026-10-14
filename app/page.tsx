"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Mode = "general" | "medical";
type InputType = "text" | "url" | "audio" | "video_file";
type View = "landing" | "claims";
type Claim = { id: string; claim_text: string; original_claim_text?: string; original_span?: string | null; included: boolean; is_manual?: boolean };
type NoticeAction = { label: string; onClick: () => void };
type Notice = { title: string; message: string; action?: NoticeAction } | null;

const INPUTS: { type: InputType; label: string; description: string }[] = [
  { type: "text", label: "Text", description: "Paste a message, transcript, or article excerpt" },
  { type: "url", label: "Link", description: "YouTube, Instagram, or Facebook video link" },
  { type: "audio", label: "Audio", description: "Upload an audio recording" },
  { type: "video_file", label: "Video", description: "Upload a video file" },
];

function Icon({ name, size = 18 }: { name: "spark" | "text" | "link" | "audio" | "video" | "arrow" | "check" | "x" | "edit" | "trash" | "plus" | "back" | "shield"; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    spark: <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 14 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
    text: <><path d="M4 6V4h16v2M12 4v16M8 20h8" /></>, link: <><path d="M10 13a5 5 0 0 0 7.1.1l2.8-2.8a5 5 0 0 0-7.1-7.1L11.2 4.8" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2.8 2.8a5 5 0 0 0 7.1 7.1l1.6-1.6" /></>,
    audio: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>, video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />, check: <path d="m5 12 4.2 4L19 6" />, x: <path d="m6 6 12 12M18 6 6 18" />, edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 14h10l1-14" /></>, plus: <path d="M12 5v14M5 12h14" />, back: <path d="M19 12H5m6 6-6-6 6-6" />, shield: <><path d="M12 3 4.5 6v5c0 4.8 3.1 8.3 7.5 10 4.4-1.7 7.5-5.2 7.5-10V6L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [mode, setMode] = useState<Mode>("general");
  const [inputType, setInputType] = useState<InputType>("text");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [cacheHit, setCacheHit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newClaim, setNewClaim] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const includedCount = useMemo(() => claims.filter((claim) => claim.included).length, [claims]);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  function showError(title: string, error: unknown, action?: NoticeAction) {
    setNotice({ title, message: error instanceof Error ? error.message : "Something went wrong. Please try again.", action });
  }

  async function loadClaims(id: string) {
    const data = await api<{ claims: Claim[] }>(`/claims/submission/${id}`);
    setClaims(data.claims);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((inputType === "text" || inputType === "url") && !content.trim()) return showError("Input needed", `Add ${inputType === "text" ? "some text" : "a supported video link"} before continuing.`);
    if ((inputType === "audio" || inputType === "video_file") && !file) return showError("Choose a file", "Select an audio or video file to upload.");
    setLoading(true);
    try {
      let response: { cache_hit?: boolean; data: { submission_id?: string; submission?: string } };
      if (inputType === "text" || inputType === "url") {
        response = await api(`/ingest/${inputType}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, [inputType]: content.trim() }) });
      } else {
        const body = new FormData(); body.append("mode", mode); body.append("input_type", inputType); body.append("file", file!);
        response = await api("/ingest/media", { method: "POST", body });
      }
      const id = response.data.submission_id ?? response.data.submission;
      if (!id) throw new Error("The server did not return a submission ID.");
      try {
        await api(`/claims/extract/${id}`, { method: "POST" });
      } catch (error) {
        // A cache hit can already have its candidate set persisted. In that case,
        // continue directly to the review endpoint instead of treating it as a failure.
        if (!(error instanceof Error) || !error.message.includes("already been extracted")) throw error;
      }
      await loadClaims(id);
      setSubmissionId(id); setCacheHit(Boolean(response.cache_hit)); setView("claims");
    } catch (error) {
      showError("We couldn’t prepare your claims", error, { label: "Try again", onClick: () => { setNotice(null); } });
    } finally { setLoading(false); }
  }

  async function updateClaim(id: string, action: "include" | "exclude") {
    setBusyId(id);
    try { const result = await api<{ claim: Claim }>(`/claims/${id}/${action}`, { method: "POST" }); setClaims((current) => current.map((claim) => claim.id === id ? result.claim : claim)); }
    catch (error) { showError("Couldn’t update this claim", error); } finally { setBusyId(null); }
  }
  async function saveEdit(id: string) {
    if (editValue.trim().length < 10) return showError("Claim is too short", "Use at least 10 characters so the claim can be reviewed.");
    setBusyId(id);
    try { const result = await api<{ claim: Claim }>(`/claims/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_text: editValue }) }); setClaims((current) => current.map((claim) => claim.id === id ? result.claim : claim)); setEditingId(null); }
    catch (error) { showError("Your edit wasn’t saved", error); } finally { setBusyId(null); }
  }
  async function addClaim() {
    if (newClaim.trim().length < 10) return showError("Claim is too short", "Add at least 10 characters before adding a claim.");
    const proposedClaim = newClaim.trim();
    const conversationalPattern = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|how are you|thanks|thank you)\b/i;
    if (conversationalPattern.test(proposedClaim) || proposedClaim.includes("?")) {
      return showError("Add a factual statement", "Candidate claims must be verifiable statements, not greetings, conversation, or questions. For example: “Drinking water helps regulate body temperature.”");
    }
    setBusyId("add");
    try { const result = await api<{ claim: Claim }>(`/claims/submission/${submissionId}/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_text: newClaim, included: true }) }); setClaims((current) => [...current, result.claim]); setNewClaim(""); }
    catch (error) { showError("Couldn’t add that claim", error); } finally { setBusyId(null); }
  }
  async function deleteClaim(id: string) {
    setBusyId(id);
    try { await api(`/claims/${id}`, { method: "DELETE" }); setClaims((current) => current.filter((claim) => claim.id !== id)); }
    catch (error) { showError("Couldn’t delete this claim", error); } finally { setBusyId(null); }
  }
  async function confirmClaims() {
    setLoading(true);
    try { await api("/claims/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submission_id: submissionId }) }); setNotice({ title: "Claims confirmed", message: `${includedCount} claims are ready for the next verification step.` }); }
    catch (error) { showError("Couldn’t confirm claims", error); } finally { setLoading(false); }
  }

  return <main className={`shell ${view === "claims" ? "review-shell" : ""}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar"><button className="brand" onClick={() => setView("landing")}><span className="brand-mark"><Icon name="spark" size={17} /></span><span>FactChecker</span></button><div className="mode-switch" aria-label="Checking mode"><button className={mode === "general" ? "selected" : ""} onClick={() => setMode("general")}>General</button><button className={mode === "medical" ? "selected" : ""} onClick={() => setMode("medical")}><span className="medical-dot" />Medical</button></div><span className="mode-caption">{mode === "medical" ? "Evidence-first health review" : "Thoughtful claims, clearer context"}</span></header>
    {view === "landing" ? <section className="landing">
      <div className="hero-copy"><p className="eyebrow"><Icon name="shield" size={15} /> Verification, without the noise</p><h1>Know what’s <em>worth believing.</em></h1><p className="hero-lede">Veritas helps you surface checkable claims from the content already in your hands—before you pass it on.</p></div>
      <form className="input-panel glass" onSubmit={submit}>
        <div className="panel-heading"><div><p className="step">01 — Submit content</p><h2>What should we look into?</h2></div><span className="mode-badge">{mode === "medical" ? "Medical review" : "General review"}</span></div>
        <div className="input-tabs">{INPUTS.map((input) => <button type="button" key={input.type} className={inputType === input.type ? "active" : ""} onClick={() => { setInputType(input.type); setContent(""); setFile(null); }}><Icon name={input.type === "video_file" ? "video" : input.type === "url" ? "link" : input.type} size={17} /><span>{input.label}</span></button>)}</div>
        <p className="input-help">{INPUTS.find((input) => input.type === inputType)?.description}</p>
        {inputType === "text" && <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste text here…" maxLength={15000} />}
        {inputType === "url" && <div className="url-field"><Icon name="link" /><input value={content} onChange={(event) => setContent(event.target.value)} placeholder="https://youtube.com/shorts/..." type="url" /></div>}
        {(inputType === "audio" || inputType === "video_file") && <label className={`dropzone ${file ? "has-file" : ""}`}><input type="file" accept={inputType === "audio" ? "audio/*" : "video/*"} onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} /><Icon name={inputType === "audio" ? "audio" : "video"} size={24} /><span>{file ? file.name : `Choose ${inputType === "audio" ? "an audio" : "a video"} file`}</span><small>{file ? `${Math.round(file.size / 1024 / 1024 * 10) / 10} MB selected` : "Click to browse your device"}</small></label>}
        <div className="panel-footer"><p><Icon name="shield" size={15} /> Your media is processed temporarily, never kept.</p><button className="primary" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Preparing claims</> : <>Find claims <Icon name="arrow" /></>}</button></div>
      </form>
      <div className="trust-row"><span>Made for careful sharing</span><i /> <span>{mode === "medical" ? "Prioritizes medical evidence" : "Works with text, links & media"}</span><i /> <span>No account required</span></div>
    </section> : <section className="review">
      <button className="back" onClick={() => setView("landing")}><Icon name="back" /> Start over</button>
      <div className="review-heading"><div><p className="eyebrow"><Icon name="spark" size={15} /> Claim review</p><h1>Keep the claims<br />that matter.</h1><p>Fine-tune the list before verification. You can edit, exclude, or add a claim.</p>{cacheHit && <p className="cache-note"><Icon name="check" size={14} /> Cached submission found — loaded its saved candidate claims.</p>}</div><aside className="review-summary glass"><span>Selected for review</span><strong>{includedCount}<small> / {claims.length}</small></strong><div className="progress"><span style={{ width: `${claims.length ? (includedCount / claims.length) * 100 : 0}%` }} /></div><p>{mode === "medical" ? "Medical evidence standards enabled" : "General evidence sources enabled"}</p></aside></div>
      <div className="claims-list">{claims.map((claim, index) => <article className={`claim-card glass ${!claim.included ? "excluded" : ""}`} key={claim.id}><div className="claim-index">{String(index + 1).padStart(2, "0")}</div><div className="claim-main">{editingId === claim.id ? <><textarea className="claim-editor" value={editValue} onChange={(event) => setEditValue(event.target.value)} /><div className="edit-actions"><button className="tiny solid" onClick={() => saveEdit(claim.id)} disabled={busyId === claim.id}><Icon name="check" size={15} /> Save</button><button className="tiny" onClick={() => setEditingId(null)}>Cancel</button></div></> : <><p>{claim.claim_text}</p>{claim.original_span && claim.original_span !== claim.claim_text && <small>Source: “{claim.original_span}”</small>}</>}</div><div className="claim-actions">{!editingId && <button className="icon-button" title="Edit claim" onClick={() => { setEditingId(claim.id); setEditValue(claim.claim_text); }}><Icon name="edit" size={16} /></button>}{claim.is_manual && !editingId && <button className="icon-button danger" title="Delete manual claim" onClick={() => deleteClaim(claim.id)} disabled={busyId === claim.id}><Icon name="trash" size={16} /></button>}<button className={`toggle-claim ${claim.included ? "included" : ""}`} onClick={() => updateClaim(claim.id, claim.included ? "exclude" : "include")} disabled={busyId === claim.id}>{busyId === claim.id ? <span className="spinner" /> : <><Icon name={claim.included ? "x" : "plus"} size={15} />{claim.included ? "Exclude" : "Include"}</>}</button></div></article>)}</div>
      <div className="add-card glass"><div><p className="step">Add a missing claim</p><input value={newClaim} onChange={(event) => setNewClaim(event.target.value)} placeholder="Enter a factual claim to include…" /></div><button className="secondary" onClick={addClaim} disabled={busyId === "add"}>{busyId === "add" ? <span className="spinner" /> : <Icon name="plus" />} Add claim</button></div>
      <div className="confirm-bar glass"><p><Icon name="shield" /> Only included claims move forward for verification.</p><button className="primary" onClick={confirmClaims} disabled={loading || includedCount === 0}>{loading ? <><span className="spinner" /> Confirming</> : <>Confirm {includedCount} claim{includedCount === 1 ? "" : "s"} <Icon name="arrow" /></>}</button></div>
    </section>}
    {notice && <div className="modal-wrap" role="alertdialog" aria-modal="true"><div className="modal glass"><button className="modal-close" onClick={() => setNotice(null)}><Icon name="x" /></button><div className="modal-icon"><Icon name="shield" /></div><h2>{notice.title}</h2><p>{notice.message}</p><div className="modal-actions">{notice.action && <button className="secondary" onClick={notice.action.onClick}>{notice.action.label}</button>}<button className="primary" onClick={() => setNotice(null)}>Got it</button></div></div></div>}
  </main>;
}
