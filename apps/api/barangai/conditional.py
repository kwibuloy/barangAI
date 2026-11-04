"""ETag answers for what the app polls, so an unchanged list costs a 304 instead of megabytes.

The tag is a hash of the response itself, because a list can change without any row's updated_at moving: a case link, a
barangay name, a priority that decays with time. So the server still builds the list, and saves sending and parsing it.

`no-cache` lets a browser keep the copy but makes it ask the server every time, so a signed-out or disabled account gets
its 401 rather than old data. Fetch sends If-None-Match by itself and hands the page the cached body as a plain 200.
"""

import hashlib
import json

from fastapi import Request, Response


def conditional_json(request: Request, data, user_id: str) -> Response:
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    # The account is in the tag, so one browser used by two people can never reuse the other's list.
    tag = f'"{hashlib.sha256(user_id.encode() + b":" + body).hexdigest()[:32]}"'
    headers = {"ETag": tag, "Cache-Control": "private, no-cache", "Vary": "Cookie"}
    supplied = [part.strip().removeprefix("W/") for part in request.headers.get("if-none-match", "").split(",")]
    if tag in supplied:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)
