import uvicorn

from .main import create_app

if __name__ == "__main__":
    # Deliberately fixed to loopback, one worker, no access/body logging.
    uvicorn.run(
        create_app(),
        host="127.0.0.1",
        port=8001,
        access_log=False,
        log_level="warning",
        proxy_headers=False,
    )
