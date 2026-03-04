FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1

# Install system dependencies (needed for some python packages like asyncpg build sometimes, though binary usually included)
# RUN apt-get update && apt-get install -y gcc

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# In production (multi-worker)
CMD ["sh", "-c", "rm -f /tmp/enterprise_portal_startup.* || true; WORKERS=${WEB_CONCURRENCY:-4}; exec gunicorn --no-control-socket -k uvicorn.workers.UvicornWorker -w ${WORKERS} -b 0.0.0.0:8000 --timeout ${GUNICORN_TIMEOUT:-120} main:app"]
