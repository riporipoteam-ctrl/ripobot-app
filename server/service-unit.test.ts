import { describe, expect, it } from "vitest";

import { launchdPlist, serviceCommand, servicePlan, systemdUnit, unstableInstallWarning, type ServiceSpec } from "./service-unit.ts";

const spec: ServiceSpec = {
  node: "/usr/bin/node",
  script: "/usr/lib/node_modules/ripobot/cli.js",
  serveArgs: ["--port", "8799", "--data-dir", "/home/ripo/.ripobot", "--domain", "ripo.example.com", "--no-pair"],
  dataDir: "/home/ripo/.ripobot",
  user: "ripo",
  home: "/home/ripo",
  bindsLowPorts: true,
  label: "agentada",
};

describe("service units", () => {
  it("runs the same serve command, with strip-types only for a checkout", () => {
    expect(serviceCommand(spec)).toEqual(["/usr/bin/node", "/usr/lib/node_modules/ripobot/cli.js", "serve", ...spec.serveArgs]);
    expect(serviceCommand({ ...spec, script: "/srv/RipoBot/server/ripobot.ts" })[1]).toBe("--experimental-strip-types");
  });

  it("renders a systemd unit that restarts, runs as the user, and grants low ports only for --domain", () => {
    const unit = systemdUnit(spec);
    expect(unit).toContain("Description=RipoBot (agentada)");
    expect(unit).toContain("User=ripo");
    expect(unit).toContain("Environment=RIPO_DATA_DIR=/home/ripo/.ripobot");
    expect(unit).toContain("ExecStart=/usr/bin/node /usr/lib/node_modules/ripobot/cli.js serve --port 8799 --data-dir /home/ripo/.ripobot --domain ripo.example.com --no-pair");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("AmbientCapabilities=CAP_NET_BIND_SERVICE");
    expect(unit).toContain("WantedBy=multi-user.target");
    const local = systemdUnit({ ...spec, bindsLowPorts: false, serveArgs: ["--port", "8799", "--data-dir", "/home/ripo/.ripobot"] });
    expect(local).not.toContain("CAP_NET_BIND_SERVICE");
    // a path with a space is quoted for systemd
    expect(systemdUnit({ ...spec, dataDir: "/home/ripo/My Data", serveArgs: ["--data-dir", "/home/ripo/My Data"] })).toContain('ExecStart=/usr/bin/node /usr/lib/node_modules/ripobot/cli.js serve --data-dir "/home/ripo/My Data"');
  });

  it("renders a launchd agent that keeps the server alive and logs under the data dir", () => {
    const plist = launchdPlist({ ...spec, home: "/Users/ripo", dataDir: "/Users/ripo/.ripobot" });
    expect(plist).toContain("<string>com.ripobot.serve</string>");
    expect(plist).toContain("<string>/usr/bin/node</string>");
    expect(plist).toContain("<string>serve</string>");
    expect(plist).toContain("<string>ripo.example.com</string>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("/Users/ripo/.ripobot/logs/service.log");
    expect(launchdPlist({ ...spec, serveArgs: ["--label", "a & b <c>"] })).toContain("<string>a &amp; b &lt;c&gt;</string>");
  });

  it("refuses to point a service at an npx cache, and knows where each platform's file goes", () => {
    expect(unstableInstallWarning("/home/ripo/.npm/_npx/abc123/node_modules/ripobot/cli.js")).toMatch(/npm install -g ripobot/);
    expect(unstableInstallWarning("/usr/lib/node_modules/ripobot/cli.js")).toBeNull();
    const linux = servicePlan("linux", "/home/ripo/.ripobot");
    expect(linux?.installed).toBe("/etc/systemd/system/ripobot.service");
    expect(linux?.activate.join("\n")).toContain("systemctl enable --now ripobot");
    const mac = servicePlan("darwin", "/Users/ripo/.ripobot", "/Users/ripo");
    expect(mac?.installed).toBe("/Users/ripo/Library/LaunchAgents/com.ripobot.serve.plist");
    expect(mac?.activate.join("\n")).toContain("launchctl bootstrap gui/$(id -u)");
    expect(servicePlan("win32", "C:\\x")).toBeNull();
  });
});
