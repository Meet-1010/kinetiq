"use client";

import {
  Check,
  Download,
  Gauge,
  Gem,
  ImageIcon,
  Link2,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY,
  FONTS,
  encodeState,
  exportCss,
  isCustomized,
  prettyVar,
  toHex,
  toRuntime,
  type Caps,
  type CustomState,
  type FontScope,
} from "@/lib/customize";
import { useAccess } from "./access-provider";

type TextChange = { before: string; after: string };
const MAX_IMAGE = 6 * 1024 * 1024;

/** Messages always go to the demo's own origin, never "*". */
function postToFrame(
  frame: React.RefObject<HTMLIFrameElement | null>,
  origin: string,
  msg: Record<string, unknown>,
) {
  frame.current?.contentWindow?.postMessage({ kq: 1, ...msg }, origin);
}

/**
 * Drives the customizer runtime inside the demo iframe and renders the Customize panel.
 * Mounted client-side only (after the iframe exists), so it can read the share-link state directly.
 */
export function CustomizeLayer({
  id,
  title,
  demoOrigin,
  frame,
  frameKey,
  loaded,
  open,
  initial,
  onClose,
  onReload,
}: {
  id: string;
  title: string;
  demoOrigin: string;
  frame: React.RefObject<HTMLIFrameElement | null>;
  frameKey: number;
  loaded: boolean;
  open: boolean;
  initial: CustomState | null;
  onClose: () => void;
  onReload: () => void;
}) {
  const { access, openUnlock } = useAccess();
  const [state, setState] = useState<CustomState>(() => initial ?? EMPTY);
  const [ready, setReady] = useState<{ key: number; caps: Caps } | null>(null);
  const [editText, setEditText] = useState(false);
  const [pickImages, setPickImages] = useState(false);
  const [swapped, setSwapped] = useState(0);
  const [textChanges, setTextChanges] = useState<TextChange[]>([]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingKey = useRef<string | null>(null);
  const [picked, setPicked] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const caps = ready?.key === frameKey ? ready.caps : null;
  const canSwap = !!caps && caps.images + (caps.bgImages ?? 0) > 0;

  const send = useCallback(
    (msg: Record<string, unknown>) => postToFrame(frame, demoOrigin, msg),
    [frame, demoOrigin],
  );

  // Only the demo iframe on the demo origin may talk to us.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== demoOrigin || e.source !== frame.current?.contentWindow)
        return;
      const m = e.data;
      if (!m || m.kq !== 1) return;
      if (m.type === "ready") setReady({ key: frameKey, caps: m as Caps });
      else if (m.type === "text-changes")
        setTextChanges(Array.isArray(m.changes) ? m.changes.slice(0, 50) : []);
      else if (m.type === "image-picked" && typeof m.key === "string") {
        pendingKey.current = m.key;
        setPicked({
          width: Number(m.width) || 0,
          height: Number(m.height) || 0,
        });
        // Works where the browser carries the click's user activation up from the demo frame;
        // otherwise the "Choose replacement image" button below does it with a direct click.
        fileInput.current?.click();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [demoOrigin, frame, frameKey]);

  // Handshake after every (re)load; the runtime answers with what this demo exposes.
  useEffect(() => {
    if (!loaded || caps) return;
    let tries = 0;
    send({ type: "hello" });
    const t = setInterval(
      () => (++tries > 15 ? clearInterval(t) : send({ type: "hello" })),
      400,
    );
    return () => clearInterval(t);
  }, [loaded, caps, send]);

  useEffect(() => {
    if (caps) send({ type: "apply", state: toRuntime(state) });
  }, [caps, state, send]);
  useEffect(() => {
    if (caps) send({ type: "edit-text", on: editText });
  }, [caps, editText, send]);
  useEffect(() => {
    if (caps) send({ type: "pick-images", on: pickImages });
  }, [caps, pickImages, send]);

  const update = (patch: Partial<CustomState>) =>
    setState((s) => ({ ...s, ...patch }));
  const setVar = (name: string, value: string | null) =>
    setState((s) => {
      const vars = { ...s.vars };
      if (value) vars[name] = value;
      else delete vars[name];
      return { ...s, vars };
    });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const key = pendingKey.current;
    if (!file || !key) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE) {
      setNotice("Pick an image under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      send({ type: "set-image", key, src: String(reader.result) });
      setSwapped((n) => n + 1);
      setPicked(null);
      setNotice(null);
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setState(EMPTY);
    setEditText(false);
    setPickImages(false);
    setSwapped(0);
    setTextChanges([]);
    history.replaceState(null, "", location.pathname);
    onReload();
  };

  const share = async () => {
    const url = `${location.origin}${location.pathname}#c=${encodeState(state)}`;
    history.replaceState(null, "", url);
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const exportStyles = () => {
    if (!access?.starred) return openUnlock();
    const blob = new Blob([exportCss(title, state, textChanges)], {
      type: "text/css",
    });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `kinetiq-${id}-custom.css`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
        aria-hidden
      />
      {open && (
        <aside
          aria-label="Customize demo"
          className="absolute inset-x-0 bottom-0 z-10 flex h-[62%] flex-col rounded-t-[24px] border-t border-line bg-panel/95 backdrop-blur-xl md:static md:h-auto md:w-[340px] md:shrink-0 md:rounded-none md:border-l md:border-t-0"
        >
          <header className="flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <h2 className="text-[15px] font-semibold">Customize</h2>
              <p className="text-[12px] text-muted">
                Changes apply live. The demo&apos;s code isn&apos;t touched.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close customize panel"
              className="pill grid size-8 place-items-center rounded-full text-text-2 hover:text-text"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-5 pb-5">
            {!caps ? (
              <div className="space-y-3 pt-2">
                <div className="skeleton h-4 w-40 rounded-full" />
                <div className="skeleton h-9 rounded-xl" />
                <div className="skeleton h-9 rounded-xl" />
                <p className="text-[12px] text-muted">
                  {loaded
                    ? "Connecting to the demo…"
                    : "Waiting for the demo to load…"}
                </p>
              </div>
            ) : (
              <>
                <Section icon={Palette} title="Colors">
                  {caps.vars.length > 0 ? (
                    <div className="space-y-1.5">
                      {caps.vars.map((v) => (
                        <ColorRow
                          key={v.name}
                          label={prettyVar(v.name)}
                          hint={v.name}
                          value={state.vars[v.name] ?? v.value}
                          changed={!!state.vars[v.name]}
                          onChange={(c) => setVar(v.name, c)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-muted">
                      This demo doesn&apos;t define color variables, so use the
                      page colors below.
                    </p>
                  )}
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                    <ColorRow
                      label="Page background"
                      value={state.background ?? caps.background}
                      changed={!!state.background}
                      onChange={(c) => update({ background: c ?? undefined })}
                    />
                    <ColorRow
                      label="Page text"
                      value={state.text ?? caps.text}
                      changed={!!state.text}
                      onChange={(c) => update({ text: c ?? undefined })}
                    />
                  </div>
                  {caps.canvas && (
                    <p className="mt-2 text-[11.5px] text-faint">
                      Colors drawn inside WebGL or canvas scenes aren&apos;t
                      reachable from here.
                    </p>
                  )}
                </Section>

                <Section icon={Type} title="Typography">
                  <select
                    aria-label="Font"
                    value={state.font?.family ?? ""}
                    onChange={(e) =>
                      update({
                        font: e.target.value
                          ? {
                              family: e.target.value,
                              scope: state.font?.scope ?? "headings",
                            }
                          : undefined,
                      })
                    }
                    className="pill h-10 w-full rounded-xl bg-transparent px-3 text-[13.5px] text-text outline-none"
                  >
                    <option value="">Original fonts</option>
                    {FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  {state.font && (
                    <div
                      className="pill mt-2 grid grid-cols-2 rounded-full p-1"
                      role="group"
                      aria-label="Apply font to"
                    >
                      {(["headings", "all"] as FontScope[]).map((scope) => (
                        <button
                          key={scope}
                          onClick={() =>
                            update({ font: { ...state.font!, scope } })
                          }
                          aria-pressed={state.font!.scope === scope}
                          className={`h-8 rounded-full text-[12.5px] transition ${state.font!.scope === scope ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}
                        >
                          {scope === "headings" ? "Headings" : "Everything"}
                        </button>
                      ))}
                    </div>
                  )}
                </Section>

                <Section icon={ImageIcon} title="Content">
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle
                      on={editText}
                      onClick={() => (
                        setEditText((v) => !v),
                        setPickImages(false)
                      )}
                      icon={Type}
                      label="Edit text"
                    />
                    <Toggle
                      disabled={!canSwap}
                      on={pickImages}
                      onClick={() => (
                        setPickImages((v) => !v),
                        setEditText(false)
                      )}
                      icon={ImageIcon}
                      label="Swap images"
                    />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    {editText
                      ? "Click any text in the demo and type. Turn editing off to keep your changes."
                      : pickImages
                        ? "Click an image in the demo to replace it with one of yours. It never leaves your browser."
                        : canSwap
                          ? "Rewrite the copy or drop in your own images to see the effect with your content."
                          : "Rewrite the copy to see the effect with your content. This demo draws its images inside WebGL, so they can't be swapped here."}
                  </p>
                  {(textChanges.length > 0 || swapped > 0) && (
                    <p className="mt-1.5 font-mono text-[11.5px] text-accent">
                      {textChanges.length > 0 &&
                        `${textChanges.length} text edit${textChanges.length > 1 ? "s" : ""}`}
                      {textChanges.length > 0 && swapped > 0 && " · "}
                      {swapped > 0 &&
                        `${swapped} image${swapped > 1 ? "s" : ""} swapped`}
                    </p>
                  )}
                  {pickImages && picked && (
                    <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-accent/10 p-2.5 ring-1 ring-accent/40">
                      <ImageIcon className="size-4 shrink-0 text-accent" />
                      <p className="min-w-0 flex-1 text-[12px] text-text-2">
                        Image selected
                        {picked.width
                          ? ` (${picked.width}×${picked.height})`
                          : ""}
                      </p>
                      <button
                        onClick={() => fileInput.current?.click()}
                        className="accent-fill h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold"
                      >
                        Choose replacement image
                      </button>
                    </div>
                  )}
                  {notice && (
                    <p className="mt-1.5 text-[12px] text-amber-200">
                      {notice}
                    </p>
                  )}
                </Section>

                <Section icon={Gauge} title="Motion speed">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => update({ rate: state.rate === 0 ? 1 : 0 })}
                      aria-label={
                        state.rate === 0
                          ? "Resume animations"
                          : "Pause animations"
                      }
                      className="pill grid size-9 shrink-0 place-items-center rounded-full text-text-2 hover:text-text"
                    >
                      {state.rate === 0 ? (
                        <Play className="size-4" />
                      ) : (
                        <Pause className="size-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={state.rate}
                      onChange={(e) => update({ rate: Number(e.target.value) })}
                      aria-label="Animation speed"
                      className="h-1 flex-1 cursor-pointer accent-[#ff6b35]"
                    />
                    <span className="w-12 text-right font-mono text-[12.5px] tabular-nums text-text">
                      {state.rate.toFixed(2)}×
                    </span>
                  </div>
                  <div className="mt-2.5 flex gap-1.5">
                    {[0.25, 0.5, 1, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        onClick={() => update({ rate: r })}
                        className={`h-7 flex-1 rounded-full font-mono text-[11.5px] transition ${state.rate === r ? "bg-white/10 text-text" : "pill text-muted hover:text-text"}`}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] text-faint">
                    Scroll-linked animations follow your scrolling, not this
                    speed.
                  </p>
                </Section>
              </>
            )}
          </div>

          <footer className="grid grid-cols-3 gap-2 border-t border-line px-5 py-3">
            <button
              onClick={reset}
              disabled={
                !isCustomized(state) &&
                !editText &&
                !pickImages &&
                swapped === 0 &&
                textChanges.length === 0
              }
              className="pill flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] text-text-2 transition hover:text-text disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
            <button
              onClick={share}
              disabled={!isCustomized(state)}
              title="Copy a link with these colors, font and speed"
              className="pill flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] text-text-2 transition hover:text-text disabled:opacity-40"
            >
              {copied ? (
                <Check className="size-3.5 text-accent" />
              ) : (
                <Link2 className="size-3.5" />
              )}{" "}
              {copied ? "Copied" : "Share"}
            </button>
            <button
              onClick={exportStyles}
              disabled={!isCustomized(state) && textChanges.length === 0}
              title={
                access?.starred
                  ? "Download your changes as a stylesheet"
                  : "Star the repo to export"
              }
              className="accent-fill flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold disabled:opacity-40"
            >
              {access?.starred ? (
                <Download className="size-3.5" />
              ) : (
                <Gem className="size-3.5" />
              )}{" "}
              Export
            </button>
          </footer>
        </aside>
      )}
    </>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

function ColorRow({
  label,
  hint,
  value,
  changed,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  changed: boolean;
  onChange: (v: string | null) => void;
}) {
  const hex = toHex(value);
  return (
    <div className="group flex items-center gap-3 rounded-xl px-1.5 py-1 hover:bg-surface-2">
      <label
        className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/15"
        style={{ background: value }}
        title={hint}
      >
        <input
          type="color"
          value={hex ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`${label} color`}
        />
      </label>
      <span
        className="min-w-0 flex-1 truncate text-[13px] text-text-2"
        title={hint}
      >
        {label}
      </span>
      <span className="font-mono text-[11px] uppercase text-faint">
        {hex ?? "none"}
      </span>
      {changed && (
        <button
          onClick={() => onChange(null)}
          aria-label={`Reset ${label}`}
          className="text-faint hover:text-text"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  disabled?: boolean;
  on: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      disabled={disabled}
      className={`flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-accent/15 text-accent ring-1 ring-accent/50" : "pill text-text-2 hover:text-text"}`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}
