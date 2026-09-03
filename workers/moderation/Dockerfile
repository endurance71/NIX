FROM denoland/deno:debian-2.9.6@sha256:2014dc167ece617ef7e7ba40631ac2234c59e75ce693e7cc2dc2602b3c87859d
USER root
RUN apt-get update -qq && apt-get install -y --no-install-recommends ffmpeg=7:7.1.5-0+deb13u1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY workers/moderation/*.ts ./workers/moderation/
COPY supabase/functions/_shared/moderation-video-sampling.ts supabase/functions/_shared/moderation-video-scenes.ts supabase/functions/_shared/moderation-policy.ts ./supabase/functions/_shared/
ENV DENO_DIR=/tmp/deno DENO_NO_UPDATE_CHECK=1
USER 10001:10001
ENTRYPOINT ["deno", "run", "--no-config", "--no-remote", "--allow-read=/app,/tmp", "--allow-write=/tmp", "--allow-run=ffmpeg,ffprobe", "/app/workers/moderation/benchmark.ts"]
