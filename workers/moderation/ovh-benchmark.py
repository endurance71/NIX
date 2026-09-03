"""One-shot offline benchmark. Run only from an explicitly staged safe build context.
No access to app volumes, credentials or production database. JSONL stdout only.
"""
import json
import os
import subprocess
import time
import uuid


def run(*args):
    return subprocess.check_output(args, text=True, timeout=30).strip()


def emit(**record):
    print(json.dumps(record), flush=True)


def host():
    with open('/proc/meminfo') as f:
        available = next(int(line.split()[1]) * 1024 for line in f if line.startswith('MemAvailable:'))
    return available, os.getloadavg()[0]


name = 'nix-c3a-' + uuid.uuid4().hex[:12]
image = 'nix-c3a-offline:local'
created = False
high_since = None
started = time.monotonic()
try:
    for _ in range(30):
        available, load = host()
        emit(phase='baseline', availableBytes=available, load1=load)
        if available < 1024**3 or load > 4:
            raise RuntimeError('host_baseline_unavailable')
        time.sleep(2)
    run('docker', 'create', '--name', name, '--network=none', '--cpus=1',
        '--memory=1g', '--memory-swap=1g', '--pids-limit=128', '--read-only',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=536870912,mode=1777',
        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--restart=no',
        '--log-opt=max-size=5m', '--log-opt=max-file=1', image)
    created = True
    config = json.loads(run('docker', 'inspect', name))[0]
    h = config['HostConfig']
    assert h['NetworkMode'] == 'none' and h['Memory'] == h['MemorySwap'] == 1073741824
    assert h['NanoCpus'] == 1000000000 and h['PidsLimit'] == 128 and h['ReadonlyRootfs']
    assert config['Config']['User'] == '10001:10001' and not h['Binds']
    emit(phase='isolation', cpu=1, memoryBytes=h['Memory'], tmpBytes=536870912, network=False)
    run('docker', 'start', name)
    while True:
        state = json.loads(run('docker', 'inspect', name))[0]
        available, load = host()
        if load > 4:
            high_since = high_since or time.monotonic()
        else:
            high_since = None
        if available < 1024**3 or (high_since and time.monotonic() - high_since >= 30):
            raise RuntimeError('host_pressure')
        if state['State']['OOMKilled'] or state['RestartCount']:
            raise RuntimeError('oom_or_restart')
        if not state['State']['Running']:
            for line in run('docker', 'logs', name).splitlines():
                if line.startswith('{'):
                    emit(phase='case', result=json.loads(line))
            if state['State']['ExitCode'] != 0:
                raise RuntimeError('benchmark_failed')
            emit(phase='completed', exitCode=0, oom=False, restarts=0)
            break
        stats = json.loads(run('docker', 'stats', '--no-stream', '--format', '{{json .}}', name))
        # Temporary files contain only locally generated safe media.
        try:
            tmp_kib = int(run('docker', 'exec', name, 'du', '-sk', '/tmp').split()[0])
        except subprocess.CalledProcessError:
            if not json.loads(run('docker', 'inspect', name))[0]['State']['Running']:
                continue
            raise
        emit(phase='sample', availableBytes=available, load1=load,
             cpuPercent=float(stats['CPUPerc'].rstrip('%')), memory=stats['MemUsage'], tmpBytes=tmp_kib*1024)
        if time.monotonic() - started > 900:
            raise RuntimeError('benchmark_deadline')
        time.sleep(2)
finally:
    if created:
        run('docker', 'rm', '-f', name)
        emit(phase='cleanup', containerRemoved=True, temporaryMediaRemoved=True)
