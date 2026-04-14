from slowapi import Limiter
from slowapi.util import get_remote_address

# Single shared Limiter instance.
# key_func=get_remote_address uses the client IP as the rate-limit bucket.
# Import this in main.py (to register on the app) and in route modules (for decorators).
limiter = Limiter(key_func=get_remote_address)
