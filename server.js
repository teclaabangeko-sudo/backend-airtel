import { createClient } from '@supabase/supabase-js'


const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");


const app = express();
app.use(cors());
app.use(bodyParser.json());

// 👉 AJOUT ICI
const supabase = createClient(
  "https://rljmkpbdvxvgpwbbmpsm.supabase.co",   // 🔴 Project URL
  "rljmkpbdvxvgpwbbmpsm" // 🔴  anon key
)


// ====== FAKE DATABASE ======
let promos = [];

// ====== SECURITY ======
const ADMIN_KEY = "123456"; // change ça plus tard

// ====== GENERATE CODE ======
function generateCode() {
  return "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ====== CREATE PROMO ======
app.post("/admin/create-promo", async (req, res) => {
  const { discount, expiresAt, usageLimit } = req.body

  const code = "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase()

  const { data, error } = await supabase
    .from("promos")
    .insert([{
      code,
      discount,
      expires_at: expiresAt,
      usage_limit: usageLimit
    }])

  if (error) return res.json({ error })

  res.json({ code, discount, expiresAt, usageLimit })
})

// ====== GET PROMOS ======
app.get("/admin/promos", async (req, res) => {
  const { data } = await supabase.from("promos").select("*")
  res.json(data)
})

// ====== VALIDATE PROMO ======
app.post("/apply-promo", async (req, res) => {
  const { code, amount } = req.body

  const { data } = await supabase
    .from("promos")
    .select("*")
    .eq("code", code)
    .single()

  if (!data) return res.json({ valid: false })

  if (new Date(data.expires_at) < new Date()) {
    return res.json({ valid: false })
  }

  if (data.used >= data.usage_limit) {
    return res.json({ valid: false })
  }

  const discountAmount = amount * data.discount

  res.json({ valid: true, discountAmount })
})

// ====== PAYMENT ======
app.post("/pay", async (req, res) => {
  const { name, phone, amount, promoCode } = req.body

  let finalAmount = amount

  if (promoCode) {
    const { data } = await supabase
      .from("promos")
      .select("*")
      .eq("code", promoCode)
      .single()

    if (data && data.used < data.usage_limit) {
      finalAmount = amount - amount * data.discount

      await supabase
        .from("promos")
        .update({ used: data.used + 1 })
        .eq("code", promoCode)
    }
  }

  await supabase.from("payments").insert([{
    name,
    phone,
    amount: finalAmount,
    promo_code: promoCode
  }])
  // 👉 ICI TU METTRAS L’API AIRTEL PLUS TARD

  res.json({ success: true,
    amount: finalAmount,
    message: "Paiements effectué avec succès! La Maison de la Presse vous remercie pour votre fidélité",
   })
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


