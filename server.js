const { createClient } = require('@supabase/supabase-js')
const jwt = require("jsonwebtoken")
const express = require("express")
const cors = require("cors");
const bodyParser = require("body-parser");


const app = express();
app.use(cors());
app.use(bodyParser.json());


const SECRET = "rljmkpbdvxvgpwbbmpsm" // 🔴

const supabase = createClient(
  "https://rljmkpbdvxvgpwbbmpsm.supabase.co",   // 🔴 Project URL
  "sb_publishable_bbc41qBxat_u5FItWfiRQg_1lOPHAF6" // 🔴  anon key
)


// ====== FAKE DATABASE ======
let promos = [];

// ====== SECURITY ======
const ADMIN_KEY = "Mdp2026@"; // change ça plus tard

// ====== GENERATE CODE ======
function generateCode() {
  return "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post("/admin/login", (req, res) => {
  const { email, password } = req.body

  // 🔴 change ces identifiants
  if (email === "mdp369@yahoo.fr" && password === "Mdp2026@") {
    const token = jwt.sign({ role: "admin" }, SECRET, { expiresIn: "2h" })

    return res.json({ token })
  }

  res.status(401).json({ error: "Invalid credentials" })
})


function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: "No token" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" })
  }
}

// ====== CREATE PROMO ======
app.post("/admin/create-promo",  verifyToken, async (req, res) => {
  const { discount, expiresAt, usageLimit } = req.body

  const code = "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase()

  const { data, error } = await supabase
    .from("promos")
    .insert([{
        code,
        discount,
        expires_at: expiresAt,
        usage_limit: usageLimit,
        used: 0
      }])

  if (error) return res.json({ error })

  res.json({ code, discount, expiresAt, usageLimit })
})

// ====== GET PROMOS ======
app.get("/admin/promos",  verifyToken, async (req, res) => {
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





