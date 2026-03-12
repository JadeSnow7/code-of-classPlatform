import multiprocessing


bind = "0.0.0.0:8001"
workers = min(max(multiprocessing.cpu_count(), 2), 8)
worker_class = "uvicorn.workers.UvicornWorker"
keepalive = 5
timeout = 30
graceful_timeout = 10
max_requests = 1000
max_requests_jitter = 100
preload_app = True
