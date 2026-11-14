"""Tạo ADMIN_PASS_HASH cho file .env.   Chạy:  python scripts\\make_admin_hash.py"""
import getpass, hashlib, os

pw = getpass.getpass("Mật khẩu Admin: ")
salt = os.urandom(16).hex()
h = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200000).hex()
print(f"ADMIN_PASS_HASH=pbkdf2:200000:{salt}:{h}")
