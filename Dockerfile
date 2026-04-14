FROM python:3.11-slim

WORKDIR /app

# Install dependencies before copying source so this layer is cached
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Run as non-root user to limit blast radius if the process is exploited
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Expose port
EXPOSE 8080

# Run with uvicorn
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
