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
 * Verify containers/network/volumes are gone; docker CLI errors → TEARDOWN_FAIL.
 * Accepts legacy `{ container, network }` or stack `{ containers[], network, volumes[] }`.
 * @param {RunFn} run
 * @param {{
 *   container?: string,
 *   containers?: string[],
 *   network?: string,
 *   volumes?: string[],
 * }} names
 * @returns {Promise<string | null>} error message or null if gone
 */
export async function assertGone(run, names) {
  const containers = [
    ...(names.containers ?? []),
    ...(names.container ? [names.container] : []),
  ].filter(Boolean);
  const volumes = (names.volumes ?? []).filter(Boolean);
  const network = names.network || "";

  for (const container of containers) {
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
  for (const volume of volumes) {
    const vol = await run("docker", ["volume", "ls", "-q", "-f", `name=^${volume}$`]);
    if (vol.status !== 0) {
      return `cannot_verify volume gone: docker volume ls status=${vol.status}`;
    }
    if (vol.stdout.trim()) {
      return `volume still present: ${volume}`;
    }
  }
  return null;
}

/**
 * Fail-closed OUTPUT policy that still allows Docker-network peers (CIDR).
 * Do not use for single-container :15432 loopback-only lock.
 * @param {string} cidr e.g. 172.28.0.0/16
 */
export function buildInternalEgressScript(cidr) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(String(cidr || ""))) {
    throw new Error(`invalid network cidr: ${cidr}`);
  }
  return [
    "iptables -F OUTPUT 2>/dev/null || true",
    "iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "iptables -A OUTPUT -o lo -j ACCEPT",
    "iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT",
    `iptables -A OUTPUT -d ${cidr} -j ACCEPT`,
    "iptables -P OUTPUT DROP",
    "iptables -L OUTPUT -n",
  ].join(" && ");
}

/**
 * IPv6 companion for multi-container stacks: allow lo/::1/ULA/link-local, DROP rest.
 * Used when IPv6 is enabled inside the container.
 */
export const INTERNAL_IPV6_EGRESS_APPLY_SCRIPT = [
  "command -v ip6tables >/dev/null 2>&1 || { echo 'ip6tables missing'; exit 2; }",
  "ip6tables -F OUTPUT 2>/dev/null || true",
  "ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
  "ip6tables -A OUTPUT -o lo -j ACCEPT",
  "ip6tables -A OUTPUT -d ::1/128 -j ACCEPT",
  "ip6tables -A OUTPUT -d fe80::/10 -j ACCEPT",
  "ip6tables -A OUTPUT -d fc00::/7 -j ACCEPT",
  "ip6tables -P OUTPUT DROP",
].join(" && ");

/**
 * @param {RunFn} run
 * @param {string} network
 * @returns {Promise<{ ok: boolean, cidr: string, detail: string }>}
 */
export async function resolveNetworkCidr(run, network) {
  const insp = await run("docker", [
    "network",
    "inspect",
    network,
    "--format",
    "{{(index .IPAM.Config 0).Subnet}}",
  ]);
  const cidr = insp.stdout.trim();
  if (insp.status !== 0 || !cidr) {
    return {
      ok: false,
      cidr: "",
      detail: insp.stderr || insp.stdout || "network inspect failed",
    };
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(cidr)) {
    return { ok: false, cidr: "", detail: `unexpected subnet format: ${cidr}` };
  }
  return { ok: true, cidr, detail: cidr };
}

/**
 * Apply internal-allow IPv4 (+ IPv6 when present) egress lock inside a container.
 * @param {RunFn} run
 * @param {string} container
 * @param {string} cidr
 * @param {{ allowInstall?: boolean }} [opts] allowInstall=false when the network has no NAT (apk/apt would hang)
 * @returns {Promise<{ ok: boolean, detail: string, ipv6Enabled: boolean, ipv6Mode: string | null }>}
 */
export async function blockInternalEgress(run, container, cidr, opts = {}) {
  const allowInstall = opts.allowInstall !== false;
  if (allowInstall) {
    await run("docker", [
      "exec",
      container,
      "sh",
      "-c",
      "command -v iptables >/dev/null || apk add --no-cache iptables iptables-legacy ip6tables >/dev/null 2>&1; command -v iptables >/dev/null || (apt-get update >/dev/null 2>&1 && apt-get install -y iptables >/dev/null 2>&1) || true; command -v ip6tables >/dev/null || apk add --no-cache ip6tables >/dev/null 2>&1 || true",
    ]);
  }
  const has = await run("docker", ["exec", container, "sh", "-c", "command -v iptables"]);
  if (has.status !== 0) {
    return {
      ok: false,
      detail: "iptables unavailable",
      ipv6Enabled: false,
      ipv6Mode: null,
    };
  }
  let script;
  try {
    script = buildInternalEgressScript(cidr);
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ipv6Enabled: false,
      ipv6Mode: null,
    };
  }
  const r4 = await run("docker", ["exec", container, "sh", "-c", script]);
  if (r4.status !== 0) {
    return {
      ok: false,
      detail: r4.stderr || r4.stdout || "internal egress apply failed",
      ipv6Enabled: false,
      ipv6Mode: null,
    };
  }

  const detect = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    IPV6_DETECT_SCRIPT,
  ]);
  if (detect.status !== 0) {
    return {
      ok: false,
      detail: "cannot detect IPv6 stack state",
      ipv6Enabled: false,
      ipv6Mode: null,
    };
  }
  const ipv6Enabled = detect.stdout.includes("IPV6_ON");
  if (!ipv6Enabled) {
    return {
      ok: true,
      detail: `${r4.stdout}\nIPV6_DISABLED_OK`,
      ipv6Enabled: false,
      ipv6Mode: "IPV6_DISABLED_OK",
    };
  }

  const [has6, apply6] = await Promise.all([
    run("docker", ["exec", container, "sh", "-c", "command -v ip6tables"]),
    run("docker", ["exec", container, "sh", "-c", INTERNAL_IPV6_EGRESS_APPLY_SCRIPT]),
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
      ipv6Enabled: true,
      ipv6Mode: decision.mode,
    };
  }
  return {
    ok: true,
    detail: `${r4.stdout}\n${list6.stdout}\n${decision.mode}`,
    ipv6Enabled: true,
    ipv6Mode: decision.mode,
  };
}

/**
 * Lock egress on every container that has a shell+iptables; report which were locked.
 * Prefer {@link lockAndVerifyRequiredServices} for multi-image stacks (incl. distroless).
 * @param {RunFn} run
 * @param {string[]} containers
 * @param {string} cidr
 * @param {{ allowInstall?: boolean }} [opts]
 */
export async function lockStackInternalEgress(run, containers, cidr, opts = {}) {
  const locked = [];
  const skipped = [];
  let ipv6Enabled = false;
  for (const container of containers) {
    const r = await blockInternalEgress(run, container, cidr, opts);
    if (!r.ok) {
      if (/iptables unavailable/i.test(r.detail)) {
        skipped.push(container);
        continue;
      }
      return {
        ok: false,
        detail: `${container}: ${r.detail}`,
        locked,
        skipped,
        ipv6Enabled,
      };
    }
    locked.push(container);
    if (r.ipv6Enabled) ipv6Enabled = true;
  }
  return { ok: true, detail: `locked=${locked.length}`, locked, skipped, ipv6Enabled };
}

/**
 * Run work inside a temporary NET_ADMIN sidecar attached to a service's network namespace.
 * Iptables rules applied in the shared netns persist after the sidecar is removed.
 * @param {RunFn} run
 * @param {{
 *   serviceCtr: string,
 *   image: string,
 *   work: (sidecar: string) => Promise<unknown>,
 * }} opts
 */
export async function withServiceNetnsSidecar(run, opts) {
  const { serviceCtr, image, work } = opts;
  const sidecar = `${serviceCtr}-netlock`;
  await run("docker", ["rm", "-f", sidecar]);
  const started = await run("docker", [
    "run",
    "-d",
    "--name",
    sidecar,
    "--network",
    `container:${serviceCtr}`,
    "--cap-add=NET_ADMIN",
    image,
    "sleep",
    "600",
  ]);
  if (started.status !== 0) {
    return {
      ok: false,
      detail: started.stderr || started.stdout || "sidecar start failed",
      result: null,
    };
  }
  let result = null;
  let workError = null;
  try {
    result = await work(sidecar);
  } catch (err) {
    workError = err;
  }
  await run("docker", ["rm", "-f", sidecar]);
  if (workError) {
    throw workError;
  }
  return { ok: true, detail: "ok", result };
}

/**
 * Fail-closed lock + egress (+ optional internal) probe from a service's own netns.
 * @param {RunFn} run
 * @param {{
 *   serviceCtr: string,
 *   image: string,
 *   cidr: string,
 *   internalPeer?: { host: string, port: number } | null,
 *   loopbackMode?: "psql" | "nc-self",
 * }} opts
 */
export async function lockAndVerifyServiceNetns(run, opts) {
  const {
    serviceCtr,
    image,
    cidr,
    internalPeer = null,
    loopbackMode = "nc-self",
  } = opts;

  const session = await withServiceNetnsSidecar(run, {
    serviceCtr,
    image,
    work: async (sidecar) => {
      const lock = await blockInternalEgress(run, sidecar, cidr, {
        allowInstall: false,
      });
      if (!lock.ok) {
        return {
          ok: false,
          stage: "lock",
          detail: lock.detail,
          ipv6Enabled: false,
        };
      }
      const probe = await verifyEgress(run, sidecar, {
        ipv6Enabled: lock.ipv6Enabled,
        loopbackMode,
      });
      if (!probe.ok) {
        return {
          ok: false,
          stage: "egress",
          detail: `${probe.reason}: ${probe.detail}`,
          ipv6Enabled: lock.ipv6Enabled,
        };
      }
      let peerDetail = null;
      if (internalPeer) {
        const peer = await verifyInternalPeerProbe(
          run,
          sidecar,
          internalPeer.host,
          internalPeer.port,
        );
        if (!peer.ok) {
          return {
            ok: false,
            stage: "internal",
            detail: `${peer.reason}: ${peer.detail}`,
            ipv6Enabled: lock.ipv6Enabled,
          };
        }
        peerDetail = peer.detail;
      }
      return {
        ok: true,
        stage: "verified",
        detail: probe.detail,
        peerDetail,
        ipv6Enabled: lock.ipv6Enabled,
      };
    },
  });

  if (!session.ok) {
    return {
      ok: false,
      stage: "sidecar",
      detail: session.detail,
      ipv6Enabled: false,
      peerDetail: null,
    };
  }
  if (!session.result || typeof session.result !== "object") {
    return {
      ok: false,
      stage: "sidecar",
      detail: "sidecar work returned no result",
      ipv6Enabled: false,
      peerDetail: null,
    };
  }
  return session.result;
}

/**
 * Lock+verify every required service netns. Any failure → ok:false (never skip).
 * @param {RunFn} run
 * @param {Array<{
 *   name: string,
 *   internalPeer?: { host: string, port: number } | null,
 *   loopbackMode?: "psql" | "nc-self",
 * }>} services
 * @param {{ image: string, cidr: string }} opts
 */
export async function lockAndVerifyRequiredServices(run, services, opts) {
  const locked = [];
  const details = [];
  let ipv6Enabled = false;
  for (const svc of services) {
    const r = await lockAndVerifyServiceNetns(run, {
      serviceCtr: svc.name,
      image: opts.image,
      cidr: opts.cidr,
      internalPeer: svc.internalPeer ?? null,
      loopbackMode: svc.loopbackMode ?? "nc-self",
    });
    if (!r.ok) {
      return {
        ok: false,
        detail: `${svc.name}: ${r.stage}: ${r.detail}`,
        locked,
        details,
        ipv6Enabled,
      };
    }
    locked.push(svc.name);
    details.push({
      name: svc.name,
      detail: r.detail,
      peerDetail: r.peerDetail,
    });
    if (r.ipv6Enabled) ipv6Enabled = true;
  }
  return {
    ok: true,
    detail: `locked=${locked.join(",")}`,
    locked,
    details,
    ipv6Enabled,
  };
}

/**
 * Probe TCP to an internal peer hostname from a container.
 * @param {RunFn} run
 * @param {string} fromContainer
 * @param {string} host
 * @param {number} port
 */
export async function verifyInternalPeerProbe(run, fromContainer, host, port) {
  const script = [
    "set +e",
    `if command -v nc >/dev/null 2>&1; then nc -z -w 2 ${host} ${port}; echo EXIT:$?; exit 0; fi`,
    `if command -v wget >/dev/null 2>&1; then wget -T 2 -q -O /dev/null http://${host}:${port}/; echo EXIT:$?; exit 0; fi`,
    "echo EXIT:127",
  ].join("\n");
  const r = await run("docker", ["exec", fromContainer, "sh", "-c", script]);
  if (r.status !== 0) {
    return { ok: false, reason: "probe_infra_fail", detail: "peer probe exec failed" };
  }
  const code = parseExitMarker(`${r.stdout}${r.stderr}`);
  if (code === null) {
    return { ok: false, reason: "probe_infra_fail", detail: "peer probe missing EXIT marker" };
  }
  if (code === 126 || code === 127) {
    return { ok: false, reason: "probe_unavailable", detail: "peer probe tools missing" };
  }
  if (code !== 0) {
    return {
      ok: false,
      reason: "peer_unreachable",
      detail: `internal ${host}:${port} EXIT:${code}`,
    };
  }
  return { ok: true, reason: "peer_ok", detail: `${host}:${port}` };
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

/** Explicit TCP loopback via Postgres — never rely on default unix/libpq host. */
export const LOOPBACK_TCP_PROBE_SCRIPT =
  "psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -At -c 'SELECT 1' >/dev/null 2>&1; echo EXIT:$?";

/**
 * Self-listen TCP loopback for non-Postgres containers (peer helpers).
 * Proves OUTPUT -o lo / 127.0.0.0/8 still works after DROP policy.
 */
export const LOOPBACK_NC_SELF_PROBE_SCRIPT = [
  "set +e",
  "PORT=18087",
  "if command -v nc >/dev/null 2>&1; then",
  "  nc -l -p \"$PORT\" >/dev/null 2>&1 &",
  "  LPID=$!",
  "  sleep 0.2",
  "  nc -z -w 1 127.0.0.1 \"$PORT\"",
  "  EC=$?",
  "  kill \"$LPID\" 2>/dev/null",
  "  wait \"$LPID\" 2>/dev/null",
  "  echo EXIT:$EC",
  "  exit 0",
  "fi",
  "if command -v busybox >/dev/null 2>&1; then",
  "  busybox nc -l -p \"$PORT\" >/dev/null 2>&1 &",
  "  LPID=$!",
  "  sleep 0.2",
  "  busybox nc -z -w 1 127.0.0.1 \"$PORT\"",
  "  EC=$?",
  "  kill \"$LPID\" 2>/dev/null",
  "  wait \"$LPID\" 2>/dev/null",
  "  echo EXIT:$EC",
  "  exit 0",
  "fi",
  "echo EXIT:127",
].join("\n");

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
 * @param {{ ipv6Enabled?: boolean, loopbackMode?: "psql" | "nc-self" }} [opts]
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

  const loopbackMode = opts.loopbackMode === "nc-self" ? "nc-self" : "psql";
  const loopScript =
    loopbackMode === "nc-self" ? LOOPBACK_NC_SELF_PROBE_SCRIPT : LOOPBACK_TCP_PROBE_SCRIPT;
  const loop = await run("docker", [
    "exec",
    container,
    "sh",
    "-c",
    loopScript,
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
 * Tear down multiple containers + network + volumes and verify gone.
 * @param {RunFn} run
 * @param {{
 *   containers?: string[],
 *   network?: string,
 *   volumes?: string[],
 * }} ctx
 */
export async function performStackTeardown(run, ctx) {
  const containers = (ctx.containers ?? []).filter(Boolean);
  const volumes = (ctx.volumes ?? []).filter(Boolean);
  const network = ctx.network || "";
  let teardownOk = true;

  const rmResults = await Promise.all(
    containers.map((container) => run("docker", ["rm", "-f", container])),
  );
  if (rmResults.some((rm) => rm.status !== 0)) {
    teardownOk = false;
  }

  if (network) {
    const rn = await run("docker", ["network", "rm", network]);
    if (rn.status !== 0) {
      const still = await run("docker", [
        "network",
        "ls",
        "-q",
        "-f",
        `name=^${network}$`,
      ]);
      if (still.status !== 0 || still.stdout.trim()) {
        teardownOk = false;
      }
    }
  }

  const volResults = await Promise.all(
    volumes.map((volume) => run("docker", ["volume", "rm", "-f", volume])),
  );
  if (volResults.some((rv) => rv.status !== 0)) {
    teardownOk = false;
  }

  const leftover = await assertGone(run, { containers, network, volumes });
  if (leftover) {
    teardownOk = false;
  }
  return { teardownOk, leftover };
}

/**
 * Run docker rm / network rm and verify gone (single-container isolated runner).
 * @param {RunFn} run
 * @param {{ started: boolean, networkCreated: boolean, container: string, network: string }} ctx
 */
export async function performTeardown(run, ctx) {
  return performStackTeardown(run, {
    containers: ctx.started && ctx.container ? [ctx.container] : [],
    network: ctx.networkCreated ? ctx.network : "",
    volumes: [],
  });
}
