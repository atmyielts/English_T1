import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const skills = [
  "reading",
  "writing",
  "listening",
  "speaking",
  "grammar",
  "vocabulary",
  "immersion",
] as const;

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

const filesUnder = async (dir: URL): Promise<string[]> => {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) out.push(...await filesUnder(child));
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(child.pathname);
  }
  return out;
};

Deno.test("every English skill renders inside the single app shell", async () => {
  const app = await read("../src/App.tsx");
  const chrome = await read("../src/app/Chrome.tsx");
  // Hub pages get the framed header; skill pages get the workspace rail instead, never both.
  assertStringIncludes(chrome, "export const HubFrame");
  assertStringIncludes(chrome, "export const SkillWorkspace");
  assertStringIncludes(app, "<SkillWorkspace skill={skill.key}>");
  assert(!chrome.slice(chrome.indexOf("export const SkillWorkspace")).includes("<HubHeader"), "skill pages must not add the hub header");
  for (const skill of skills) {
    assertStringIncludes(app, `import('./skills/${skill}')`, `${skill} must be mounted from src/skills`);
    const index = await read(`../src/skills/${skill}/index.tsx`);
    assert(!index.includes("EnglishSkillWorkspace"), `${skill} must not render a second workspace shell`);
    assert(!index.includes("<HubFrame") && !index.includes("<SkillWorkspace"), `${skill} must not render its own shell`);
  }
  assert(!app.includes("./modules/"), "the app must not mount the retired per-skill modules");
});

Deno.test("signed-in navigation covers the daily loop and keeps old addresses working", async () => {
  const app = await read("../src/App.tsx");
  const chrome = await read("../src/app/Chrome.tsx");
  assertStringIncludes(chrome, "['today', 'practice', 'review', 'progress', 'tutor']");
  for (const path of ["/today", "/practice", "/review", "/progress", "/tutor"]) {
    assertStringIncludes(app, `path="${path}"`);
  }
  for (const legacy of ["/dashboard", "/plan", "/week", "/weaknesses", "/studio"]) {
    assertStringIncludes(app, `path="${legacy}" element={<Navigate`);
  }
});

Deno.test("learner screens never show invented scores", async () => {
  const sources = [
    ...await filesUnder(new URL("../src/pages/", import.meta.url)),
    ...await filesUnder(new URL("../src/skills/", import.meta.url)),
    new URL("../src/App.tsx", import.meta.url).pathname,
  ];
  for (const path of sources) {
    const text = await Deno.readTextFile(path.replace(/^\/([A-Za-z]:)/, "$1"));
    for (const banned of ["fallbackProgress", "Math.random(", "readiness"]) {
      assert(!text.includes(banned), `${path} must not contain ${banned}`);
    }
  }
  const planner = await read("../../../supabase/functions/_shared/english-today.ts");
  assert(!planner.includes("readiness"), "the Today planner reasons only from real attempts");
});

Deno.test("the English root contains a user-recoverable crash boundary", async () => {
  const main = await read("../src/main.tsx");
  const boundary = await read("../src/components/AppErrorBoundary.tsx");
  const recovery = await read("../src/lib/clientRecovery.ts");
  const sharedBoundary = await read("../../../packages/ui-recovery/src/RecoveryBoundary.tsx");
  assertStringIncludes(main, "<AppErrorBoundary>");
  assertStringIncludes(boundary, "<RecoveryBoundary");
  assertStringIncludes(sharedBoundary, "static getDerivedStateFromError");
  assertStringIncludes(boundary, "Reload English");
  assertStringIncludes(
    sharedBoundary,
    "Changes that had not finished saving may need to be entered again.",
  );
  assertStringIncludes(boundary, "onError={reportEnglishRecovery}");
  assertStringIncludes(recovery, "window.sessionStorage.getItem(dedupeKey)");
  assertStringIncludes(recovery, "window.location.pathname");
  assertStringIncludes(recovery, "window.addEventListener('unhandledrejection'");
  assertStringIncludes(main, "installEnglishGlobalRecoveryReporting()");
  assert(
    !recovery.includes("message: error.message"),
    "raw browser error messages must not leave the learner's browser",
  );
});

Deno.test("service-worker updates preserve assets needed by active learner tabs", async () => {
  const worker = await read("../public/sw.js");
  assert(
    !worker.includes("skipWaiting("),
    "a new worker must wait for active tabs before replacing their asset cache",
  );
  assert(
    !worker.includes("clients.claim("),
    "a new worker must not take control of already-open tabs",
  );
  assertStringIncludes(worker, "key.startsWith(CACHE_PREFIX)");
  assertStringIncludes(worker, "url.pathname.startsWith('/assets/')");
  assertStringIncludes(worker, "if (isNavigationRequest(req))");
});

Deno.test("the English build isolates stable vendor dependencies for long-lived caching", async () => {
  const config = await read("../vite.config.ts");
  assertStringIncludes(config, "'supabase-vendor'");
  assertStringIncludes(config, "'react-vendor'");
  assertStringIncludes(config, "manualChunks(id)");
});
