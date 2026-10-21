FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil clamav clamav-freshclam ffmpeg poppler-utils qpdf ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --create-home scanner
WORKDIR /app
COPY scanner.py decoder.py /app/
USER 10001:10001
ENTRYPOINT ["python3", "/app/scanner.py"]
