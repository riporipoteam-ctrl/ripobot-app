// Verification recipes are followed by hand, so nothing else notices when a
// command, file, route or link they cite stops existing. This reads every
// recipe under docs/verification and checks each citation against the tree.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HELP } from "../control-ripo.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DOCS = join(ROOT, "docs", "verification");
const recipes = readdirSync(DOCS).filter((name) => name.endsWith(".md")).sort();
const text = (recipe: string) => readFileSync(join(DOCS, recipe), "utf8");
// Paths inside external links belong to other repositories.
const withoutUrls = (markdown: string) => markdown.replace(/https?:\/\/\S+/g, " ");
const cited = (pattern: RegExp) => {
  const hits: string[] = [];
  for (const recipe of recipes) {
    for (const match of withoutUrls(text(recipe)).matchAll(pattern)) hits.push(`${recipe}: ${match[1]!}`);
  }
  return hits;
};
const target = (hit: string) => hit.slice(hit.indexOf(": ") + 2);

// The verbs `help` prints, minus the shell line under "isolated fixture".
const helpVerbs = new Set([...HELP.matchAll(/^ {2}([a-z][\w-]*)(?= |$)/gm)].map((match) => match[1]!).filter((verb) => verb !== "node"));
helpVerbs.add("help");

// Routes are registered in server/index.ts and, for anything newer, in the
// modules under server/routes (server/routes/README.md). Tests there quote
// paths without registering them, so they do not count.
const ROUTES_DIR = join(ROOT, "server", "routes");
// Every route module, including those in folders under server/routes and the
// three factories that live beside their feature (data, workspace backup,
// cloud move); a route moved out of index.ts stays a registered route here.
const routeModules = readdirSync(ROUTES_DIR, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort()
  .map((name) => join(ROUTES_DIR, name));
const featureRouteModules = ["data/routes.ts", "workspace-backup-http.ts", "cloud-move-http.ts"].map((name) => join(ROOT, "server", name));
const serverSource = [join(ROOT, "server", "index.ts"), ...routeModules, ...featureRouteModules]
  .map((file) => readFileSync(file, "utf8")).join("\n");
const hooksSource = readFileSync(join(ROOT, "server", "webhook-ingress.ts"), "utf8");
// The enterprise layer is a separately-licensed folder this fork does not
// ship (see server/enterprise.ts: delete it and the server still starts in
// the open-source edition). Its hosted-workspace sources may be absent;
// the recipes that document its fixtures still cite them.
const hasEnterpriseLayer = existsSync(join(ROOT, "enterprise", "server", "workspace-access.ts"));
const hostedSource = hasEnterpriseLayer
  ? readFileSync(join(ROOT, "enterprise", "server", "workspace-access.ts"), "utf8")
  : "";
// Only constants named in the public handler's accepted-path guard are routes.
// Outbound post("/api/handoff/...") calls belong to the identity service, not us.
const hostedConstants = new Map([...hostedSource.matchAll(/const ([A-Z_]+) = "(\/api\/[^"\n]+)";/g)].map(match => [match[1]!, match[2]!]));
const hostedPublicRoutes = new Set((hostedSource.match(/!\[([^\]]+)\]\.includes\(path\)/)?.[1] ?? "")
  .split(",").map(name => hostedConstants.get(name.trim())).filter((path): path is string => path !== undefined));
// server/index.ts matches routes two ways: `path === "/api/x"` and
// `path.match(/^\/api\/x\/(a|b)$/)`. Collect the regex form too.
const routePatterns = [...serverSource.matchAll(/\/(\^\\\/api\\\/(?:\[(?:[^\]\\]|\\.)*\]|[^/\\\n[]|\\.)*)\/[a-z]*/g)].map((match) => new RegExp(match[1]!));
const PLACEHOLDER = /^(ID|:[\w-]+|<[^>]+>|\{[^}]+\})$/;

const slug = (heading: string) => heading.trim().toLowerCase().replace(/[^\w\- ]/g, "").replace(/\s+/g, "-");

describe("docs/verification recipes cite things that exist", () => {
  it("use control:ripo verbs that help lists", () => {
    const used = cited(/pnpm control:ripo ([a-z][\w-]*)/g);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((hit) => !helpVerbs.has(target(hit)))).toEqual([]);
    // the launcher form may also name `launch`, which pnpm cannot run
    const direct = cited(/scripts\/control-ripo\.ts ([a-z][\w-]*)/g);
    expect(direct.filter((hit) => target(hit) !== "launch" && !helpVerbs.has(target(hit)))).toEqual([]);
  });

  it("cite source files that exist", () => {
    const refs = cited(/(?<![\w/.-])((?:scripts|server|src|shared|electron|companion|enterprise)\/[\w./-]+\.(?:ts|tsx|mjs|cjs|py))(?![\w/])/g);
    expect(refs.length).toBeGreaterThan(50);
    // Without the enterprise layer, its fixtures' citations point at a
    // folder this fork deliberately does not ship.
    const live = hasEnterpriseLayer ? refs : refs.filter((hit) => !target(hit).startsWith("enterprise/"));
    expect([...new Set(live.filter((hit) => !existsSync(join(ROOT, target(hit)))))]).toEqual([]);
  });

  it("cite test files that exist", () => {
    const refs = cited(/(?<![\w/.-])([\w./-]+\.test\.(?:ts|mjs))(?![\w/])/g);
    expect(refs.length).toBeGreaterThan(20);
    // Without the enterprise layer, its fixtures' citations point at a
    // folder this fork deliberately does not ship.
    const live = hasEnterpriseLayer ? refs : refs.filter((hit) => !target(hit).startsWith("enterprise/"));
    expect([...new Set(live.filter((hit) => !existsSync(join(ROOT, target(hit)))))]).toEqual([]);
  });

  it("cite API routes the server registers", () => {
    const refs = cited(/(?<!\w)(\/(?:api|hooks)\/[\w./:{}<>-]+)/g);
    expect(refs.length).toBeGreaterThan(5);
    const registered = (route: string) => {
      const path = route.replace(/[.,;:]+$/, "");
      if (hostedPublicRoutes.has(path)) return true;
      // Without the enterprise layer the server still answers the hosted
      // prefix with a 503 stub, so the sign-in recipes' routes count as
      // registered by their prefix.
      if (!hasEnterpriseLayer && path.startsWith("/api/auth/hosted/")) return true;
      const source = path.startsWith("/hooks/") ? hooksSource : serverSource;
      const segments = path.split("/").slice(1);
      const literal = segments.findIndex((segment) => PLACEHOLDER.test(segment));
      if (literal === -1) return source.includes(`"${path}"`) || routePatterns.some((pattern) => pattern.test(path));
      // a placeholder path is known by its first two segments
      const prefix = `/${segments.slice(0, Math.min(2, literal)).join("/")}`;
      return source.includes(`"${prefix}`) || source.includes(`${prefix}/`)
        || routePatterns.some((pattern) => pattern.test(segments.map((segment) => PLACEHOLDER.test(segment) ? "x-1" : segment).join("/").replace(/^/, "/")));
    };
    expect([...new Set(refs.filter((hit) => !registered(target(hit))))]).toEqual([]);
  });

  // Only meaningful with the enterprise layer present: it asserts the exact
  // public routes the layer's workspace-access.ts delegates.
  it.runIf(hasEnterpriseLayer)("distinguishes delegated public routes from external identity backchannels", () => {
    expect([...hostedPublicRoutes]).toEqual(["/api/auth/hosted/start", "/api/auth/hosted/callback"]);
    expect(hostedPublicRoutes.has("/api/handoff/consume")).toBe(false);
    expect(hostedPublicRoutes.has("/api/handoff/check")).toBe(false);
  });

  it("are all reachable from README.md", () => {
    const linked = new Set([...text("README.md").matchAll(/\]\(([^)#\s]+\.md)/g)].map((match) => match[1]!));
    expect(recipes.filter((recipe) => recipe !== "README.md" && !linked.has(recipe))).toEqual([]);
  });

  it("link to files and headings that exist", () => {
    const broken: string[] = [];
    for (const recipe of recipes) {
      for (const [, link] of text(recipe).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(link!)) continue;
        const [file, anchor] = link!.split("#");
        const resolved = resolve(DOCS, file!);
        if (!existsSync(resolved)) { broken.push(`${recipe}: ${link}`); continue; }
        if (anchor && resolved.endsWith(".md")) {
          const headings = [...readFileSync(resolved, "utf8").matchAll(/^#+\s+(.+)$/gm)].map((match) => slug(match[1]!));
          if (!headings.includes(anchor)) broken.push(`${recipe}: ${link} (no such heading)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
