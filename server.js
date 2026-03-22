const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ====== FAKE DATABASE ======
let promos = [];

// ====== SECURITY ======
const ADMIN_KEY = "123456"; // change ça plus tard

// ====== GENERATE CODE ======
function generateCode() {
  return "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ====== CREATE PROMO ======
app.post("/admin/create-promo", (req, res) => {
  if (req.headers.authorization !== ADMIN_KEY) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { discount, expiresAt, usageLimit } = req.body;

  const newPromo = {
    code: generateCode(),
    discount,
    expiresAt,
    usageLimit,
    used: 0,
  };

  promos.push(newPromo);

  res.json(newPromo);
});

// ====== GET PROMOS ======
app.get("/admin/promos", (req, res) => {
  res.json(promos);
});

// ====== VALIDATE PROMO ======
function validatePromo(code) {
  const promo = promos.find((p) => p.code === code);
  if (!promo) return { valid: false };

  if (new Date() > new Date(promo.expiresAt)) {
    return { valid: false, message: "Expired" };
  }

  if (promo.used >= promo.usageLimit) {
    return { valid: false, message: "Limit reached" };
  }

  return { valid: true, promo };
}

// ====== PAYMENT ======
app.post("/pay", (req, res) => {
  const { amount, phone, promoCode } = req.body;

  let finalAmount = amount;

  if (promoCode) {
    const result = validatePromo(promoCode);

    if (!result.valid) {
      return res.status(400).json({ error: result.message || "Invalid promo" });
    }

    finalAmount = amount - amount * result.promo.discount;
    result.promo.used++;
  }

  // 👉 ICI TU METTRAS L’API AIRTEL PLUS TARD

  res.json({
    success: true,
    amount: finalAmount,
    message: "Paiement simulé OK",
  });
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});

app.post("/apply-promo", (req, res) => {
  const { code, amount } = req.body

  const promo = promos.find(p => p.code === code)

  if (!promo) {
    return res.json({ valid: false })
  }

  const now = new Date()
  const expiry = new Date(promo.expiresAt)

  if (expiry < now) {
    return res.json({ valid: false })
  }

  if (promo.used >= promo.usageLimit) {
    return res.json({ valid: false })
  }

  const discountAmount = amount * promo.discount

  res.json({
    valid: true,
    discountAmount,
  })
})