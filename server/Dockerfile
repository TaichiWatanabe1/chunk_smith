FROM python:3.11-slim

WORKDIR /app

# Install runtime deps
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy source (dev compose will bind-mount over /app/app)
COPY server/app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
