let products = [],
  category = "All",
  cart = {};
try {
  const stored = JSON.parse(localStorage.getItem("still-bag") || "{}");
  for (const [id, qty] of Object.entries(stored))
    if (Number.isInteger(qty) && qty > 0 && qty <= 99) cart[id] = qty;
} catch {}
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
function bagSave() {
  localStorage.setItem("still-bag", JSON.stringify(cart));
  $("#bag-count").textContent = Object.values(cart).reduce((a, b) => a + b, 0);
}
function show(title, html, drawer = false) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = html;
  $("#shop-dialog").classList.toggle("bag-drawer", drawer);
  if (!$("#shop-dialog").open) $("#shop-dialog").showModal();
}
$("#close-dialog").onclick = () => $("#shop-dialog").close();
async function load() {
  products = await api("/products");
  let changed = false;
  for (const id of Object.keys(cart))
    if (!products.some((p) => p.id === Number(id))) {
      delete cart[id];
      changed = true;
    }
  if (changed) bagSave();
  $("#categories").innerHTML = [
    "All",
    ...new Set(products.map((p) => p.category)),
  ]
    .map(
      (c) =>
        `<button data-category="${esc(c)}" class="${c === category ? "active" : ""}">${esc(c)}</button>`,
    )
    .join("");
  render();
  $("#admin-link").hidden = !currentUser?.admin;
  $("#account-link").textContent = currentUser ? currentUser.name : "Account";
}
function render() {
  const q = $("#search").value.toLowerCase(),
    rows = products.filter(
      (p) =>
        (category === "All" || category === p.category) &&
        `${p.name} ${p.description}`.toLowerCase().includes(q),
    );
  if ($("#sort").value !== "default")
    rows.sort((a, b) =>
      $("#sort").value === "price" ? a.price - b.price : b.price - a.price,
    );
  $("#product-count").textContent = rows.length + " objects";
  $("#products").innerHTML = rows.length
    ? rows
        .map(
          (p) =>
            `<article class="product" data-image="${p.image.split("/").pop().split(".")[0]}"><button class="product-image" data-detail="${p.id}" aria-label="View ${esc(p.name)}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></button><button class="product-name" data-detail="${p.id}">${esc(p.name)}</button><div class="product-info"><span>${esc(p.category)}</span><span class="price">${money(p.price)}</span></div><button class="product-add" data-add="${p.id}" ${p.stock ? "" : "disabled"}>${p.stock ? "Add to bag" : "Out of stock"}<span>＋</span></button></article>`,
        )
        .join("")
    : '<div class="empty">No products match this search.</div>';
}
$("#categories").onclick = (e) => {
  const b = e.target.closest("[data-category]");
  if (b) {
    category = b.dataset.category;
    $$("[data-category]").forEach((el) =>
      el.classList.toggle("active", el === b),
    );
    render();
  }
};
$("#search").oninput = render;
$("#sort").onchange = render;
function add(id) {
  const p = products.find((p) => p.id === id);
  if (!p) return;
  if ((cart[id] || 0) >= Math.min(99, p.stock))
    return toast("No more stock is available.");
  cart[id] = (cart[id] || 0) + 1;
  bagSave();
  toast("Added to your bag");
}
function detail(id) {
  const p = products.find((p) => p.id === id);
  show(
    p.name,
    `<div class="detail-layout"><img src="${esc(p.image)}" alt="${esc(p.name)}"><div><span class="label">${esc(p.category)}</span><p class="detail-price">${money(p.price)}</p><p>${esc(p.description)}</p><p class="small">${p.stock ? "In stock" : "Currently unavailable"}</p><button class="button primary full" id="detail-add" ${p.stock ? "" : "disabled"}>Add to bag</button></div></div>`,
  );
  $("#detail-add").onclick = () => add(id);
}
$("#products").onclick = (e) => {
  const b = e.target.closest("[data-add],[data-detail]");
  if (b)
    b.dataset.add
      ? add(Number(b.dataset.add))
      : detail(Number(b.dataset.detail));
};
function bag() {
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: products.find((p) => p.id === Number(id)), qty }))
    .filter((x) => x.p);
  show(
    "Your bag",
    lines.length
      ? lines
          .map(
            ({ p, qty }) =>
              `<div class="bag-line"><img src="${esc(p.image)}" alt=""><div><h3>${esc(p.name)}</h3><p>${money(p.price)}</p></div><div class="quantity"><button data-qty="${p.id}" data-change="-1" aria-label="Remove one ${esc(p.name)}">−</button><span>${qty}</span><button data-qty="${p.id}" data-change="1" aria-label="Add one ${esc(p.name)}">+</button></div></div>`,
          )
          .join("") +
          `<div class="bag-total"><span>Subtotal</span><span>${money(lines.reduce((a, x) => a + x.p.price * x.qty, 0))}</span></div><button class="button primary full" id="checkout-link">Continue to checkout</button><p class="bag-checkout-note">Sample orders only. No payment is collected.</p>`
      : '<div class="empty"><p>Your bag is empty.</p><button class="button" id="back-to-store">Continue shopping</button></div>',
    true,
  );
  $$("[data-qty]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.qty,
          p = products.find((p) => p.id === Number(id)),
          qty = cart[id] + Number(b.dataset.change);
        if (qty > Math.min(99, p.stock) && qty > cart[id])
          return toast("No more stock is available.");
        if (qty <= 0) delete cart[id];
        else cart[id] = qty;
        bagSave();
        bag();
      }),
  );
  if ($("#checkout-link"))
    $("#checkout-link").onclick = () => {
      if (currentUser) checkout();
      else {
        $("#shop-dialog").close();
        authDialog(() => {
          load();
          checkout();
        });
      }
    };
  if ($("#back-to-store"))
    $("#back-to-store").onclick = () => $("#shop-dialog").close();
}
$("#bag-link").onclick = bag;
function checkout() {
  show(
    "Delivery details",
    `<form id="checkout-form"><label>Recipient<input name="name" required maxlength="100" autocomplete="name" value="${esc(currentUser.name)}"></label><label>Address<textarea name="address" required maxlength="1000" rows="4" autocomplete="street-address"></textarea></label><p class="notice">This is a demonstration order. No payment will be collected and no items will be shipped.</p><p class="error" role="alert"></p><button class="button primary full" type="submit">Place sample order</button></form>`,
    true,
  );
  $("#checkout-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      const o = await api("/orders", "POST", {
        ...Object.fromEntries(new FormData(f)),
        items: Object.entries(cart).map(([id, qty]) => ({
          id: Number(id),
          qty,
        })),
      });
      cart = {};
      bagSave();
      show(
        "Order placed",
        `<p class="small">Your sample order #${o.id} has been saved.</p><p>${money(o.total)}</p><button class="button primary" id="view-order">View order</button>`,
        true,
      );
      $("#view-order").onclick = orders;
      await load();
    } catch (err) {
      if (f.isConnected) f.querySelector(".error").textContent = err.message;
      else toast(err.message);
    } finally {
      b.disabled = false;
    }
  };
}
async function orders() {
  if (!currentUser)
    return authDialog(() => {
      load();
      orders();
    });
  show(
    currentUser.admin ? "All orders" : "Your orders",
    '<p class="loading">Loading orders…</p>',
  );
  try {
    const rows = await api("/orders");
    show(
      currentUser.admin ? "All orders" : "Your orders",
      rows.length
        ? rows
            .map(
              (o) =>
                `<article class="order-row"><div class="row"><h3>Order #${o.id}</h3><span class="badge">${esc(o.status)}</span></div><p>${dateLabel(o.created)} · ${money(o.total)}</p><ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join("")}</ul>${currentUser.admin && ["placed", "packing", "shipped"].includes(o.status) ? `<label>Update status<select data-order="${o.id}"><option value="">Choose status…</option>${({ placed: ["packing", "cancelled"], packing: ["shipped", "cancelled"], shipped: ["delivered"] }[o.status] || []).map((s) => `<option>${s}</option>`).join("")}</select></label>` : ""}</article>`,
            )
            .join("")
        : '<div class="empty">No orders yet.</div>',
    );
    $$("[data-order]").forEach(
      (s) =>
        (s.onchange = async () => {
          if (!s.value) return;
          try {
            await api("/orders/" + s.dataset.order, "PATCH", {
              status: s.value,
            });
            await load();
            orders();
          } catch (e) {
            toast(e.message);
            orders();
          }
        }),
    );
  } catch (e) {
    $("#dialog-body").textContent = e.message;
  }
}
$("#orders-link").onclick = orders;
$("#account-link").onclick = () => {
  if (!currentUser) return authDialog(load);
  show(
    "Your account",
    `<p>${esc(currentUser.name)}</p><p class="small">${esc(currentUser.email)}</p><button class="button" id="signout">Sign out</button>`,
  );
  $("#signout").onclick = async () => {
    await api("/logout", "POST", {});
    $("#shop-dialog").close();
    load();
  };
};
function admin() {
  show(
    "Manage collection",
    `<button class="button primary" id="new-product">Add product</button>${products.map((p) => `<div class="admin-row"><div>${esc(p.name)}<small>${money(p.price)} · ${p.stock} in stock</small></div><button class="button" data-edit="${p.id}">Edit</button></div>`).join("")}`,
  );
  $("#new-product").onclick = () => productForm();
  $$("[data-edit]").forEach(
    (b) =>
      (b.onclick = () =>
        productForm(products.find((p) => p.id === Number(b.dataset.edit)))),
  );
}
$("#admin-link").onclick = admin;
function productForm(p = {}) {
  show(
    p.id ? "Edit product" : "New product",
    `<form id="product-form"><label>Name<input name="name" required maxlength="100" value="${esc(p.name || "")}"></label><label>Category<input name="category" required maxlength="40" value="${esc(p.category || "")}"></label><div class="form-row"><label>Price (USD)<input type="number" name="price" required min="0" step=".01" value="${(p.price || 0) / 100}"></label><label>Stock<input type="number" name="stock" required min="0" step="1" value="${p.stock || 0}"></label></div><label>Image<select name="image">${["chair", "lamp", "headphones", "bag"].map((s) => `<option value="/static/images/${s}.jpg" ${p.image?.includes(s) ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Description<textarea name="description" rows="3" maxlength="3000">${esc(p.description || "")}</textarea></label><p class="error" role="alert"></p><div class="dialog-actions">${p.id ? '<button type="button" class="button danger" id="delete-product">Delete</button>' : ""}<button class="button primary" type="submit">Save product</button></div></form>`,
  );
  $("#product-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("[type=submit]");
    b.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(f));
      d.stock = Number(d.stock);
      await api(
        "/products" + (p.id ? "/" + p.id : ""),
        p.id ? "PUT" : "POST",
        d,
      );
      await load();
      admin();
    } catch (e) {
      f.querySelector(".error").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  if (p.id)
    $("#delete-product").onclick = async () => {
      if (!confirm("Delete this product from the catalog?")) return;
      try {
        await api("/products/" + p.id, "DELETE");
        await load();
        admin();
      } catch (e) {
        toast(e.message);
      }
    };
}
bagSave();
sessionReady()
  .then(load)
  .catch((e) => {
    $("#products").innerHTML =
      '<p class="error">The collection is unavailable. Please reload.</p>';
    toast(e.message);
  });
