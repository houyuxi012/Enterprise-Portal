FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (needed for some python packages like asyncpg build sometimes, though binary usually included)
# RUN apt-get update && apt-get install -y gcc

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# In production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
