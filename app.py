import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from flask import render_template, g, jsonify
from werkzeug.security import generate_password_hash
from core import (
    db,
    User,
    make_app,
    payload,
    text,
    Invalid,
    login_required,
    admin_required,
)


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, default="")
    category = db.Column(db.String(40), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    stock = db.Column(db.Integer, nullable=False)
    image = db.Column(db.String(100), nullable=False)

    def public(self):
        return {
            k: getattr(self, k)
            for k in [
                "id",
                "name",
                "description",
                "category",
                "price",
                "stock",
                "image",
            ]
        }


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    items = db.Column(db.JSON, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100))
    address = db.Column(db.String(1000))
    status = db.Column(db.String(20), default="placed")
    created = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def public(self):
        return dict(
            id=self.id,
            items=self.items,
            total=self.total,
            name=self.name,
            address=self.address,
            status=self.status,
            created=self.created.isoformat(),
        )


def product_fields(d):
    try:
        price = Decimal(str(d.get("price", "")))
        if not price.is_finite() or price < 0 or price > 100000:
            raise ValueError()
        cents = int((price * 100).quantize(Decimal("1")))
        stock = d.get("stock")
        if (
            isinstance(stock, bool)
            or not isinstance(stock, int)
            or stock < 0
            or stock > 100000
        ):
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise Invalid("Enter a valid price and stock quantity.")
    image = d.get("image")
    if image not in [
        "/static/images/" + s + ".jpg" for s in ["chair", "lamp", "headphones", "bag"]
    ]:
        raise Invalid("Choose a catalog image.")
    return dict(
        name=text(d, "name", 100),
        description=text(d, "description", 3000, False),
        category=text(d, "category", 40),
        price=cents,
        stock=stock,
        image=image,
    )


def create_app(config=None):
    app = make_app(__name__, config)
    app.config["SESSION_COOKIE_NAME"] = "store_session"

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/products")
    def catalog():
        return jsonify(
            [
                p.public()
                for p in db.session.scalars(db.select(Product).order_by(Product.id))
            ]
        )

    @app.post("/api/products")
    @admin_required
    def create():
        p = Product(**product_fields(payload()))
        db.session.add(p)
        db.session.commit()
        return jsonify(p.public()), 201

    @app.put("/api/products/<int:item_id>")
    @admin_required
    def update(item_id):
        p = db.session.get(Product, item_id)
        if not p:
            raise Invalid("Product not found.", 404)
        for k, v in product_fields(payload()).items():
            setattr(p, k, v)
        db.session.commit()
        return jsonify(p.public())

    @app.delete("/api/products/<int:item_id>")
    @admin_required
    def delete(item_id):
        p = db.session.get(Product, item_id)
        if not p:
            raise Invalid("Product not found.", 404)
        # Orders retain an immutable snapshot so order history stays intact.
        db.session.delete(p)
        db.session.commit()
        return {"ok": True}

    @app.post("/api/orders")
    @login_required
    def checkout():
        d = payload()
        name = text(d, "name", 100)
        address = text(d, "address", 1000)
        lines = d.get("items")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 50:
            raise Invalid("Your bag must contain at least one item.")
        quantities = {}
        for line in lines:
            if not isinstance(line, dict):
                raise Invalid("Invalid cart item.")
            pid = line.get("id")
            qty = line.get("qty")
            if type(pid) != int or type(qty) != int or not 1 <= qty <= 99:
                raise Invalid("Invalid cart quantity.")
            quantities[pid] = quantities.get(pid, 0) + qty
        items = []
        total = 0
        for pid in sorted(quantities):
            qty = quantities[pid]
            p = db.session.scalar(
                db.select(Product).where(Product.id == pid).with_for_update()
            )
            if not p:
                raise Invalid("An item is no longer available. Refresh your bag.")
            result = db.session.execute(
                db.update(Product)
                .where(Product.id == pid, Product.stock >= qty)
                .values(stock=Product.stock - qty)
            )
            if result.rowcount != 1:
                raise Invalid(f"Not enough stock for {p.name}.")
            items.append(
                dict(id=p.id, name=p.name, price=p.price, qty=qty, image=p.image)
            )
            total += p.price * qty
        order = Order(
            user_id=g.user.id, items=items, total=total, name=name, address=address
        )
        db.session.add(order)
        db.session.commit()
        return jsonify(order.public()), 201

    @app.get("/api/orders")
    @login_required
    def history():
        q = db.select(Order)
        if not g.user.admin:
            q = q.where(Order.user_id == g.user.id)
        return jsonify(
            [o.public() for o in db.session.scalars(q.order_by(Order.id.desc()))]
        )

    @app.patch("/api/orders/<int:item_id>")
    @admin_required
    def status(item_id):
        o = db.session.scalar(
            db.select(Order).where(Order.id == item_id).with_for_update()
        )
        if not o:
            raise Invalid("Order not found.", 404)
        new = payload().get("status")
        allowed = {
            "placed": ["packing", "cancelled"],
            "packing": ["shipped", "cancelled"],
            "shipped": ["delivered"],
            "delivered": [],
            "cancelled": [],
        }
        if new not in allowed[o.status]:
            raise Invalid("This status change is not available.")
        if new == "cancelled":
            for line in o.items:
                db.session.execute(
                    db.update(Product)
                    .where(Product.id == line["id"])
                    .values(stock=Product.stock + line["qty"])
                )
        o.status = new
        db.session.commit()
        return jsonify(o.public())

    @app.cli.command("seed")
    def seed():
        if db.session.scalar(db.select(Product.id).limit(1)):
            print("Catalog exists; nothing replaced.")
            return
        data = [
            (
                "Upholstered chair",
                "A softly upholstered accent chair in a light neutral finish. Photography is illustrative of this demonstration product.",
                "Home",
                24500,
                8,
                "chair",
            ),
            (
                "Task light",
                "An adjustable metal light for a desk or reading corner. Photography is illustrative of this demonstration product.",
                "Workspace",
                6800,
                15,
                "lamp",
            ),
            (
                "Over-ear headphones",
                "A minimal over-ear design for everyday listening. This sample listing does not specify a real manufacturer or model.",
                "Workspace",
                12500,
                12,
                "headphones",
            ),
            (
                "Everyday backpack",
                "A dark fabric backpack with a compact everyday profile. This is a demonstration listing, not an offer for the pictured branded item.",
                "Carry",
                7900,
                9,
                "bag",
            ),
        ]
        for name, description, category, price, stock, image in data:
            db.session.add(
                Product(
                    name=name,
                    description=description,
                    category=category,
                    price=price,
                    stock=stock,
                    image="/static/images/" + image + ".jpg",
                )
            )
        db.session.commit()
        print("Sample catalog added.")

    @app.cli.command("create-admin")
    def create_admin():
        email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not email or len(password) < 12:
            raise RuntimeError("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).")
        if db.session.scalar(db.select(User.id).where(User.email == email)):
            raise RuntimeError("Account already exists; no changes made.")
        db.session.add(
            User(
                name="Administrator",
                email=email,
                password_hash=generate_password_hash(password),
                admin=True,
            )
        )
        db.session.commit()
        print("Administrator created.")

    with app.app_context():
        db.create_all()
    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=int(os.getenv("PORT", 8200)))
