from __future__ import annotations

from fastapi import HTTPException


class AppError(HTTPException):
    def __init__(self, *, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})

