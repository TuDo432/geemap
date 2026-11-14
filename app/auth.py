"""Phân quyền Admin / User: cookie phiên ký HMAC + middleware chặn ngay ở backend.

Quy tắc (mặc định TỪ CHỐI): User chỉ gọi được các endpoint GET trong USER_GET.
Mọi endpoint /api/ khác (quét, thống kê sâu, xuất file, tự động hóa, kiểm chứng...) chỉ dành cho Admin.
"""
import base64, hashlib, hmac, json, os, secrets, time
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from .db import engine            # import trước để load_dotenv() chạy xong rồi mới đọc env

SECRET = (os.getenv("AUTH_SECRET") or secrets.token_hex(32)).encode()   # thiếu -> phiên mất khi restart
ADMIN_USER = os.getenv("ADMIN_USER", "")
ADMIN_HASH = os.getenv("ADMIN_PASS_HASH", "")
TTL = int(os.getenv("SESSION_HOURS", "8")) * 3600
COOKIE = "webgis_session"
SAFE = ("GET", "HEAD", "OPTIONS")

# User (khách) chỉ được gọi các đường dẫn này, bằng phương thức GET.
USER_GET = ("/api/map", "/api/classes", "/api/timeseries", "/api/monthly", "/api/scan/status")

router = APIRouter()


# ---------- mật khẩu + token ----------
def _check_pw(pw, stored):
    try:
        _, it, salt, h = stored.split(":")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it)).hex()
        return hmac.compare_digest(calc, h)
    except Exception:
        return False


def _sign(b: bytes):
    return hmac.new(SECRET, b, hashlib.sha256).hexdigest()


def _token(user):
    p = base64.urlsafe_b64encode(json.dumps({"u": user, "e": int(time.time()) + TTL}).encode())
    return p.decode() + "." + _sign(p)


def get_role(request: Request):
    """-> ('admin', tên) nếu cookie hợp lệ, ngược lại ('user', None). Không có cookie = User."""
    t = request.cookies.get(COOKIE)
    if not t or "." not in t:
        return "user", None
    p, sig = t.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(p.encode())):
        return "user", None
    try:
        d = json.loads(base64.urlsafe_b64decode(p))
    except Exception:
        return "user", None
    return ("admin", d.get("u")) if d.get("e", 0) > time.time() else ("user", None)


# ---------- chống dò mật khẩu: 5 lần sai -> khóa IP 60 giây ----------
_FAIL = {}


def _locked(ip):
    n, t = _FAIL.get(ip, (0, 0))
    if n >= 5 and time.time() - t < 60:
        return True
    if n >= 5:
        _FAIL.pop(ip, None)
    return False


def _audit(request, action):
    try:
        with engine.begin() as c:
            c.execute(text("INSERT INTO NhatKy_ThaoTac(HanhDong,DiaChi_IP) VALUES(:a,:ip)"),
                      dict(a=action, ip=request.client.host if request.client else None))
    except Exception:
        pass


# ---------- API ----------
class LoginIn(BaseModel):
    username: str = ""
    password: str = ""


@router.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if not ADMIN_USER or not ADMIN_HASH:
        raise HTTPException(503, "Chưa cấu hình ADMIN_USER / ADMIN_PASS_HASH trong .env")
    if _locked(ip):
        raise HTTPException(429, "Đăng nhập sai quá nhiều lần, thử lại sau 1 phút")
    ok_u = hmac.compare_digest(body.username.encode(), ADMIN_USER.encode())
    ok_p = _check_pw(body.password, ADMIN_HASH)          # luôn kiểm tra cả hai để không lộ tên tài khoản qua thời gian phản hồi
    if not (ok_u and ok_p):
        n, _ = _FAIL.get(ip, (0, 0))
        _FAIL[ip] = (n + 1, time.time())
        _audit(request, "Đăng nhập Admin THẤT BẠI")
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")
    _FAIL.pop(ip, None)
    response.set_cookie(COOKIE, _token(body.username), max_age=TTL, httponly=True, samesite="lax",
                        secure=os.getenv("COOKIE_SECURE") == "1")
    _audit(request, "Đăng nhập Admin")
    return {"role": "admin"}


@router.post("/api/auth/logout")        # cũng dùng cho "Tiếp tục với tư cách Khách"
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"role": "user"}


@router.get("/api/auth/me")
def me(request: Request):
    role, user = get_role(request)
    return {"role": role, "user": user}


# ---------- middleware: chốt chặn thật ----------
def _deny(msg, code=403):
    return JSONResponse({"detail": msg}, status_code=code)


async def access_guard(request: Request, call_next):
    path, m = request.url.path, request.method
    if path.startswith("/api/") and not path.startswith("/api/auth/"):
        if get_role(request)[0] != "admin":
            if m not in SAFE or not path.startswith(USER_GET):
                return _deny("Tính năng chuyên sâu chỉ dành cho Admin. Hãy đăng nhập để sử dụng.")
    return await call_next(request)
