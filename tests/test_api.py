import pytest
from app import create_app
from core import db, User


@pytest.fixture
def app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-only-secret-at-least-thirty-two-characters",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///" + str(tmp_path / "test.db"),
        }
    )


def client(app):
    c = app.test_client()
    c.csrf = c.get("/api/session").json["csrf"]
    return c


def call(c, path, method="GET", body=None):
    r = c.open(
        "/api" + path, method=method, json=body, headers={"X-CSRF-Token": c.csrf}
    )
    if r.is_json and isinstance(r.json, dict) and r.json.get("csrf"):
        c.csrf = r.json["csrf"]
    return r


def register(c, email="person@example.com"):
    r = call(
        c,
        "/register",
        "POST",
        {
            "name": "Test person",
            "email": email,
            "password": "test-password-123",
            "admin": True,
        },
    )
    assert r.status_code == 201
    assert r.json["user"]["admin"] is False
    return r.json["user"]


def test_catalog_order_stock_roles_and_history(app):
    a, b = client(app), client(app)
    u = register(a)
    register(b, "reader@example.com")
    assert app.test_cli_runner().invoke(args=["seed"]).exit_code == 0
    p = call(a, "/products").json[0]
    assert call(a, "/products", "POST", {}).status_code == 403
    assert (
        call(
            a,
            "/orders",
            "POST",
            {
                "name": "Buyer",
                "address": "123 Sample Street",
                "items": [
                    {"id": p["id"], "qty": p["stock"]},
                    {"id": p["id"], "qty": 1},
                ],
            },
        ).status_code
        == 400
    )
    assert call(a, "/products").json[0]["stock"] == p["stock"]
    order = {
        "name": "Buyer",
        "address": "123 Sample Street",
        "items": [{"id": p["id"], "qty": 2}],
    }
    r = call(a, "/orders", "POST", order)
    assert r.status_code == 201
    assert r.json["total"] == p["price"] * 2
    oid = r.json["id"]
    assert call(a, "/products").json[0]["stock"] == p["stock"] - 2
    assert call(b, "/orders").json == []
    assert call(b, f"/orders/{oid}", "PATCH", {"status": "shipped"}).status_code == 403
    with app.app_context():
        db.session.get(User, u["id"]).admin = True
        db.session.commit()
    assert (
        call(a, f"/orders/{oid}", "PATCH", {"status": "cancelled"}).status_code == 200
    )
    assert call(a, "/products").json[0]["stock"] == p["stock"]
    assert (
        call(a, f"/orders/{oid}", "PATCH", {"status": "cancelled"}).status_code == 400
    )
    assert call(a, "/products").json[0]["stock"] == p["stock"]
    d = {
        "name": "Test object",
        "category": "Home",
        "description": "Sample",
        "price": "12.50",
        "stock": 3,
        "image": "/static/images/lamp.jpg",
    }
    r = call(a, "/products", "POST", d)
    assert r.status_code == 201
    pid = r.json["id"]
    assert r.json["price"] == 1250
    d["stock"] = 4
    assert call(a, f"/products/{pid}", "PUT", d).json["stock"] == 4
    assert call(a, f"/products/{pid}", "DELETE").status_code == 200
