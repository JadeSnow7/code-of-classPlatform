FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MPLBACKEND=Agg

RUN apt-get update && apt-get install -y --no-install-recommends \
    libfreetype6 \
    libpng16-16 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8002
ENV PORT=8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]

