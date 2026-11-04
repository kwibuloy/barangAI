import os

from fastapi.responses import JSONResponse

JSON_LIMIT = 64_000  # Every other route takes a small JSON body, and nothing else should fill the memory.


class RequestBodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "").removeprefix(scope.get("root_path", ""))
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        uploads = path in {"/reports", "/reports/predict", "/reports/photo-preview"} or (
            path.startswith("/reports/") and path.endswith("/addenda")
        )
        limit = (int(os.environ.get("MAX_REQUEST_BYTES", int(os.environ.get("MAX_IMAGE_BYTES", 5_000_000)) + 1_000_000))
                 if uploads else JSON_LIMIT)
        headers = dict(scope["headers"])
        try:
            announced = int(headers.get(b"content-length", b"0"))
        except ValueError:
            announced = 0
        if announced > limit:
            return await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
        chunks = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > limit:
                return await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)
