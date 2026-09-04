/**
 * Pure / injectable guards for the isolated migration runner.
 * Kept free of Docker defaults so negative tests can stub `run`.
 */

/**
 * @param {string} text
 * @returns {number | null}
 */
export function parseExitMarker(text) {
  const m = /EXIT:(\d+)/.exec(text);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Decide IPv6 lock outcome after detecting stack state.
 * @param {{
 *   ipv6Enabled: boolean,
 *   hasIp6tables: boolean,
 *   applyStatus: number | null,
 *   listStatus: number | null,
 * }} input
 */
export function decideIpv6Lock(input) {
  if (!input.ipv6Enabled) {
    return { ok: true, mode: "IPV6_DISABLED_OK", detail: "IPv6 stack absent/disabled" };
  }
  if (!input.hasIp6tables) {
    return {
      ok: false,
      mode: "IPV6_BLOCK_FAILED",
      detail: "ip6tables missing while IPv6 enabled",
    };
  }
  if (input.applyStatus !== 0) {
    return {
      ok: false,
      mode: "IPV6_BLOCK_FAILED",
      detail: "ip6tables OUTPUT DROP apply failed",
    };
  }
  if (input.listStatus !== 0) {
    return {
      ok: false,
      mode: "IPV6_BLOCK_FAILED",
      detail: "ip6tables -L OUTPUT verification failed",
    };
  }
  return { ok: true, mode: "IPV6_BLOCKED_OK", detail: "IPv6 OUTPUT DROP verified" };
}

/**
 * Public egress probe taxonomy: tool-miss / infra ≠ "blocked".
 * @param {{
 *   toolsPresent: boolean,
 *   execStatus: number,
 *   stdout?: string,
 *   stderr?: string,
 * }} input
 * @returns {{ ok: boolean, reason: string, exitCode: number | null }}
 */
export function interpretPublicProbe(input) {
  if (!input.toolsPresent) {
    return { ok: false, reason: "probe_unavailable", exitCode: null };
  }
  // docker exec itself failed — do not trust any EXIT marker in the stream.
  if (input.execStatus !== 0) {
    return { ok: false, reason: "probe_infra_fail", exitCode: null };
  }
  const text = `${input.stdout ?? ""}${input.stderr ?? ""}`;
  const exitCode = parseExitMarker(text);
  if (exitCode === null) {
    return { ok: false, reason: "probe_infra_fail", exitCode: null };
  }
  // Shell "command not found" / "not executable" — not proof of firewall DROP.
  if (exitCode === 126 || exitCode === 127) {
    return { ok: false, reason: "probe_unavailable", exitCode };
  }
  // Bad CLI options / usage noise without a real connect attempt.
  if (
    exitCode !== 0 &&
    /\b(usage:|invalid option|unrecognized option|illegal option|bad option)\b/i.test(text)
  ) {
    return { ok: false, reason: "probe_unavailable", exitCode };
  }
  // EXIT:0 means the public connect succeeded → egress not blocked.
  if (exitCode === 0) {
    return { ok: false, reason: "public_reachable", exitCode };
  }
  return { ok: true, reason: "public_blocked", exitCode };
}

/**
 * Loopback TCP probe (must use explicit 127.0.0.1, not default socket).
 * @param {{
 *   execStatus: number,
 *   stdout?: string,
 *   stderr?: string,
 * }} input
 */
export function interpretLoopbackProbe(input) {
  if (input.execStatus !== 0) {
    return { ok: false, reason: "probe_infra_fail", exitCode: null };
  }
  const text = `${input.stdout ?? ""}${input.stderr ?? ""}`;
  const exitCode = parseExitMarker(text);
  if (exitCode === null) {
    return { ok: false, reason: "probe_infra_fail", exitCode: null };
  }
  if (exitCode !== 0) {
    return { ok: false, reason: "loopback_failed", exitCode };
  }
  return { ok: true, reason: "loopback_ok", exitCode };
}

/**
 * Combine try-path exit with teardown success.
 * Teardown failure always wins → exit 1.
 * @param {number} tryExit
 * @param {boolean} teardownOk
 */
export function finalExitCode(tryExit, teardownOk) {
  if (!teardownOk) return 1;
  return tryExit;
}

/**
 * @typedef {{ status: number, stdout: string, stderr: string }} RunResult
 * @typedef {(cmd: string, args: string[], opts?: object) => Promise<RunResult>} RunFn
 */

/**
 * Verify container/network are gone; treat docker CLI errors as TEARDOWN_FAIL.
 * @param {RunFn} run
 * @param {{ container?: string, network?: string }} names
 * @returns {Promise<string | null>} error message or null if gone
 */
export async function assertGone(run, names) {
  const { container, network } = names;
  if (container) {
    const ctr = await run("docker", ["ps", "-aq", "-f", `name=^/${container}$`]);
    if (ctr.status !== 0) {
      return `cannot_verify container gone: docker ps status=${ctr.status}`;
    }
    if (ctr.stdout.trim()) {
      return `container still present: ${container}`;
    }
  }
  if (network) {
    const nets = await run("docker", ["network", "ls", "-q", "-f", `name=^${network}$`]);
    if (nets.status !== 0) {
      return `cannot_verify network gone: docker network ls status=${nets.status}`;
    }
    if (nets.stdout.trim()) {
      return `network still present: ${network}`;
    }
  }
  return null;
}

/** Shell snippets used by the runner (also asserted in contract tests). */
export const IPV4_EGRESS_SCRIPT = [
  "iptables -F OUTPUT 2>/dev/null || true",
  "iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
  "iptables -A OUTPUT -o lo -j ACCEPT",
  "iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT",
  "iptables -P OUTPUT DROP",
  "iptables -L OUTPUT -n",
].join(" && ");

export const IPV6_DETECT_SCRIPT =
  "if [ -s /proc/net/if_inet6 ] 2>/dev/null; then echo IPV6_ON; elif command -v ip >/dev/null 2>&1 && ip -6 addr show 2>/dev/null | grep -Eq 'inet6 '; then echo IPV6_ON; else echo IPV6_OFF; fi";

export const IPV6_EGRESS_APPLY_SCRIPT = [
  "command -v ip6tables >/dev/null 2>&1 || { echo 'ip6tables missing'; exit 2; }",
  "ip6tables -F OUTPUT 2>/dev/null || true",
  "ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
  "ip6tables -A OUTPUT -o lo -j ACCEPT",
  "ip6tables -A OUTPUT -d ::1/128 -j ACCEPT",
  "ip6tables -P OUTPUT DROP",
].join(" && ");

export const IPV6_EGRESS_LIST_SCRIPT = "ip6tables -L OUTPUT -n";

export const PROBE_TOOLS_CHECK_SCRIPT =
  "if command -v wget >/dev/null 2>&1 || command -v nc >/dev/null 2>&1 || (command -v busybox >/dev/null 2>&1 && busybox wget --help >/dev/null 2>&1); then echo TOOLS_OK; else echo TOOLS_MISSING; fi";

/** IPv6 public probe needs nc and/or wget that can target an IPv6 literal. */
export const IPV6_PROBE_TOOLS_CHECK_SCRIPT =
  "if command -v nc >/dev/null 2>&1 || command -v wget >/dev/null 2>&1; then echo IPV6_TOOLS_OK; else echo IPV6_TOOLS_MISSING; fi";

export const PUBLIC_IPV4_PROBE_SCRIPT = [
  "set +e",
  "if command -v wget >/dev/null 2>&1; then wget -T 2 -q -O /dev/null http://1.1.1.1/; echo EXIT:$?; exit 0; fi",
  "if command -v nc >/dev/null 2>&1; then nc -z -w 2 1.1.1.1 80; echo EXIT:$?; exit 0; fi",
  "if command -v busybox >/dev/null 2>&1; then busybox wget -T 2 -q -O /dev/null http://1.1.1.1/; echo EXIT:$?; exit 0; fi",
  "echo EXIT:127",
].join("\n");

export const PUBLIC_IPV6_PROBE_SCRIPT = [
  "set +e",
  "if command -v nc >/dev/null 2>&1; then nc -z -w 2 2606:4700:4700::1111 80; echo EXIT:$?; exit 0; fi",
  "if command -v wget >/dev/null 2>&1; then wget -T 2 -q -O /dev/null http://[2606:4700:4700::1111]/; echo EXIT:$?; exit 0; fi",
  "echo EXIT:127",
].join("\n");

/** Explicit TCP loopback — never rely on default unix/libpq host. */
export const LOOPBACK_TCP_PROBE_SCRIPT =
  "psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -At -c 'SELECT 1' >/dev/null 2>&1; echo EXIT:$?";

/**
 * Apply IPv4+IPv6 egress lock inside container.
 * @param {RunFn} run
 * @param {string} container
 */
export async function blockEgress(run, container) {
  await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    "command -v iptables >/dev/null || apk add --no-cache iptables iptables-legacy ip6tables >/dev/null 2>&1; command -v iptables >/dev/null || apk add --no-cache iptables >/dev/null 2>&1; command -v ip6tables >/dev/null || apk add --no-cache ip6tables >/dev/null 2>&1 || true",
  ]);
  const has = await run("docker", ["exec", container, "sh", "-c", "command -v iptables"]);
  if (has.status !== 0) {
    return { ok: false, detail: "iptables unavailable", ipv6Mode: null };
  }

  const r4 = await run("docker", ["exec", container, "sh", "-c", IPV4_EGRESS_SCRIPT]);
  if (r4.status !== 0) {
    return { ok: false, detail: r4.stderr || r4.stdout || "iptables IPv4 failed", ipv6Mode: null };
  }

  const detect = await run("docker", ["exec", container, "sh", "-c", IPV6_DETECT_SCRIPT]);
  if (detect.status !== 0) {
    return {
      ok: false,
      detail: "cannot detect IPv6 stack state",
      ipv6Mode: null,
    };
  }
  const ipv6Enabled = detect.stdout.includes("IPV6_ON");
  if (!ipv6Enabled) {
    return {
      ok: true,
      detail: `${r4.stdout}\nIPV6_DISABLED_OK`,
      ipv6Mode: "IPV6_DISABLED_OK",
      ipv6Enabled: false,
    };
  }

  const [has6, apply6] = await Promise.all([
    run("docker", ["exec", container, "sh", "-c", "command -v ip6tables"]),
    run("docker", ["exec", container, "sh", "-c", IPV6_EGRESS_APPLY_SCRIPT]),
  ]);
  const list6 =
    apply6.status === 0
      ? await run("docker", ["exec", container, "sh", "-c", IPV6_EGRESS_LIST_SCRIPT])
      : { status: 1, stdout: "", stderr: "" };

  const decision = decideIpv6Lock({
    ipv6Enabled: true,
    hasIp6tables: has6.status === 0,
    applyStatus: apply6.status,
    listStatus: list6.status,
  });
  if (!decision.ok) {
    return {
      ok: false,
      detail: `${decision.detail}: ${apply6.stderr || apply6.stdout || list6.stderr || ""}`,
      ipv6Mode: decision.mode,
      ipv6Enabled: true,
    };
  }
  return {
    ok: true,
    detail: `${r4.stdout}\n${list6.stdout}\n${decision.mode}`,
    ipv6Mode: decision.mode,
    ipv6Enabled: true,
  };
}

/**
 * Verify egress isolation with taxonomy (no false "blocked" on tool miss).
 * @param {RunFn} run
 * @param {string} container
 * @param {{ ipv6Enabled?: boolean }} [opts]
 */
export async function verifyEgress(run, container, opts = {}) {
  const tools = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    PROBE_TOOLS_CHECK_SCRIPT,
  ]);
  if (tools.status !== 0) {
    return { ok: false, reason: "probe_infra_fail", detail: "probe tools check failed" };
  }
  const toolsPresent = tools.stdout.includes("TOOLS_OK");

  const pub = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    PUBLIC_IPV4_PROBE_SCRIPT,
  ]);
  const pubDecision = interpretPublicProbe({
    toolsPresent,
    execStatus: pub.status,
    stdout: pub.stdout,
    stderr: pub.stderr,
  });
  if (!pubDecision.ok) {
    return {
      ok: false,
      reason: pubDecision.reason,
      detail: `public IPv4 probe: ${pubDecision.reason}`,
    };
  }

  if (opts.ipv6Enabled) {
    const tools6 = await run("docker", [
      "exec",
      container,
      "sh",
      "-c",
      IPV6_PROBE_TOOLS_CHECK_SCRIPT,
    ]);
    if (tools6.status !== 0) {
      return {
        ok: false,
        reason: "probe_infra_fail",
        detail: "IPv6 probe tools check failed",
      };
    }
    if (!tools6.stdout.includes("IPV6_TOOLS_OK")) {
      return {
        ok: false,
        reason: "probe_unavailable",
        detail: "public IPv6 probe: probe_unavailable",
      };
    }
    const pub6 = await run("docker", [
      "exec",
      container,
      "sh",
      "-c",
      PUBLIC_IPV6_PROBE_SCRIPT,
    ]);
    const pub6Decision = interpretPublicProbe({
      toolsPresent: true,
      execStatus: pub6.status,
      stdout: pub6.stdout,
      stderr: pub6.stderr,
    });
    if (!pub6Decision.ok) {
      return {
        ok: false,
        reason: pub6Decision.reason,
        detail: `public IPv6 probe: ${pub6Decision.reason}`,
      };
    }
  }

  const loop = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    LOOPBACK_TCP_PROBE_SCRIPT,
  ]);
  const loopDecision = interpretLoopbackProbe({
    execStatus: loop.status,
    stdout: loop.stdout,
    stderr: loop.stderr,
  });
  if (!loopDecision.ok) {
    return {
      ok: false,
      reason: loopDecision.reason,
      detail: `loopback TCP probe: ${loopDecision.reason}`,
    };
  }

  return {
    ok: true,
    reason: "verified",
    detail: opts.ipv6Enabled
      ? "public IPv4/IPv6 blocked; loopback TCP ok"
      : "public IPv4 blocked; loopback TCP ok (IPv6 N/A)",
  };
}

/**
 * Run docker rm / network rm and verify gone.
 * @param {RunFn} run
 * @param {{ started: boolean, networkCreated: boolean, container: string, network: string }} ctx
 * @returns {Promise<boolean>} teardownOk
 */
export async function performTeardown(run, ctx) {
  let teardownOk = true;
  if (ctx.started) {
    const rm = await run("docker", ["rm", "-f", ctx.container]);
    if (rm.status !== 0) {
      teardownOk = false;
    }
  }
  if (ctx.networkCreated) {
    const rn = await run("docker", ["network", "rm", ctx.network]);
    if (rn.status !== 0) {
      const still = await run("docker", [
        "network",
        "ls",
        "-q",
        "-f",
        `name=^${ctx.network}$`,
      ]);
      if (still.status !== 0) {
        teardownOk = false;
      } else if (still.stdout.trim()) {
        teardownOk = false;
      }
    }
  }
  const leftover = await assertGone(run, {
    container: ctx.started ? ctx.container : "",
    network: ctx.networkCreated ? ctx.network : "",
  });
  if (leftover) {
    teardownOk = false;
  }
  return { teardownOk, leftover };
}

/**
 * Stub-friendly model of the runner gate: verifyEgress → (optional migrate) → teardown → final exit.
 * Failed probe never runs migrations; teardown always runs; exit uses finalExitCode.
 *
 * @param {{
 *   run: RunFn,
 *   container: string,
 *   network: string,
 *   started?: boolean,
 *   networkCreated?: boolean,
 *   ipv6Enabled?: boolean,
 *   applyMigrations?: () => Promise<void> | void,
 * }} opts
 */
export async function runProbeGatePhase(opts) {
  const {
    run,
    container,
    network,
    started = true,
    networkCreated = true,
    ipv6Enabled = false,
    applyMigrations,
  } = opts;
  const migrationCalls = [];
  const probe = await verifyEgress(run, container, { ipv6Enabled });
  let tryExit = 2;
  let migrationsRun = false;
  if (probe.ok) {
    migrationsRun = true;
    if (applyMigrations) {
      migrationCalls.push("apply");
      await applyMigrations();
    }
    tryExit = 0;
  }
  const { teardownOk, leftover } = await performTeardown(run, {
    started,
    networkCreated,
    container,
    network,
  });
  return {
    probe,
    migrationsRun,
    migrationCalls,
    tryExit,
    teardownOk,
    leftover,
    exitCode: finalExitCode(tryExit, teardownOk),
  };
}
