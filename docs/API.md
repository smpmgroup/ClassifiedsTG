# API

OpenAPI UI is `/docs`. Groups include `/api/auth/telegram`, `/api/me`, `/api/categories`, `/api/listings`, `/api/my`, and `/api/admin`. Errors use `{ "error": { "code": "...", "message": "...", "details": null } }`. Send the short-lived token as `Authorization: Bearer TOKEN`; never put initData or tokens in URLs.
