type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function fullscreenElement(): Element | null {
  const doc = document as FsDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isFullscreen(): boolean {
  return fullscreenElement() != null;
}

export function canRunRound(fullscreen: boolean, pointerLocked: boolean): boolean {
  return fullscreen && pointerLocked;
}

export function requestFullscreen(el: HTMLElement): Promise<void> {
  const node = el as FsEl;
  const req = node.requestFullscreen?.bind(node) ?? node.webkitRequestFullscreen?.bind(node);
  if (!req) return Promise.reject(new Error("fullscreen"));
  return Promise.resolve(req()).then(() => undefined);
}

export function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return Promise.resolve();
  const doc = document as FsDoc;
  const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc);
  if (!exit) return Promise.resolve();
  return Promise.resolve(exit()).then(() => undefined);
}

export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
}
