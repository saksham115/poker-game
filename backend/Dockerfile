FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY setup.py ./
COPY pypokerengine ./pypokerengine
RUN pip install .

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/app ./backend/app

WORKDIR /app/backend

EXPOSE 8000

# Shell form so $PORT is expanded at runtime. Railway sets PORT dynamically;
# local/other hosts fall back to 8000.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level warning
