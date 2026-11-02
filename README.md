# Still — Literary Store

A sepia storefront inspired by the second supplied reference: a typewriter photograph, dark brown, cream, and old-style book typography. It includes categories, search, a shopping bag, checkout, order history, and administrator controls.

[Reference interpretation, typography, and asset sources](docs/DESIGN.md). Fonts and photographs are bundled locally.

![Desktop screenshot](docs/desktop.png)

[View mobile screenshot](docs/mobile.png)

[Shopping bag](docs/bag.png) · [Checkout](docs/checkout.png) · [Mobile checkout](docs/checkout-mobile.png)

## Run locally

Requires Python 3.12. Run commands from this project directory:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"
```

Paste the generated value into `SECRET_KEY` in `.env`. Use a different value for each application. On Windows, activate with `.venv\Scripts\activate`.

```sh
flask --app app:create_app seed
python app.py
```

Open http://localhost:8200. `PORT` can override that port. SQLite creates a persistent local database in `instance/app.db`. Seed commands preserve existing records. No credentials or databases are bundled.

## Using the app

This is a demonstration store. Checkout saves an order and updates stock; it does not collect payment or arrange shipping. Prices are in USD. Product photographs are illustrative. See [image credits](docs/IMAGE-CREDITS.md).

To create an administrator, set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters, then run `flask --app app:create_app create-admin`. Sign in using that account to manage products and orders. Public registration never grants admin access. New products use one of the four bundled photographs.

## Backend and database

Flask serves the HTML, static assets, and JSON API from one origin. SQLAlchemy stores the data. Passwords are hashed with Werkzeug; sessions use HTTP-only, SameSite cookies. Each application has a separate session cookie name. All state-changing API requests require the CSRF token returned by `GET /api/session` in an `X-CSRF-Token` header. Authentication responses rotate that token. User-entered content is rendered as text.

For PostgreSQL, set `DATABASE_URL=postgresql://user:password@host/database`. Tables are created at startup for a fresh installation. Existing production schemas require planned migrations when models change.

## Deploy

Use a Python web host with a durable PostgreSQL database. Set `SECRET_KEY`, `DATABASE_URL`, and `APP_ENV=production` in the host's environment. Install dependencies with `pip install -r requirements.txt`, then start with:

```sh
gunicorn wsgi:app --bind 0.0.0.0:$PORT
```

Use HTTPS: production mode enables Secure cookies. Run the seed command once if sample content is wanted. A `Procfile` is included. Hosting and database provisioning are separate from the source project; no live deployment is claimed.

## Verify

```sh
pip install -r requirements-dev.txt
python -m pytest -q
```

API coverage: Role protection, product CRUD, cart validation, server-calculated totals, stock updates, order privacy, and single-use cancellation/restocking.

The browser flows were also exercised at 1440px, 390px, and 320px, with no JavaScript errors or horizontal overflow. Screenshots are from those local checks. Automated database tests use SQLite; PostgreSQL concurrency has not been load-tested.

## Repository

[View this project on GitHub](https://github.com/Aryan-17159/-task-3-minimal-store).

```sh
git clone https://github.com/Aryan-17159/-task-3-minimal-store.git
cd -- -task-3-minimal-store
```

Follow the setup instructions above. Never commit `.env`, runtime databases, or credentials.
