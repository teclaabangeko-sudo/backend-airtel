const { createClient } = require('@supabase/supabase-js')
const jwt = require("jsonwebtoken")
const express = require("express")
const cors = require("cors");
const bodyParser = require("body-parser");

const axios = require("axios")


const AIRTEL = {
  BASE_URL: "https://api.mypvit.pro",
  URL_CODE: "VP27NNQRATPM8TPK", // pour /rest
  SECRET_URL_CODE: "VP27NNQRATPM8TPK", // 🔥 pour renew-secret
  ACCOUNT_CODE: "ACC_69C10F341B7DF",
  CALLBACK_CODE: "PMBKZ",
  PASSWORD: "Libreville2026@",
}

let SECRET_KEY = null

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
app.post("/admin/create-promo", verifyToken, async (req, res) => {
  try {
    const { discount, expiresAt, usageLimit } = req.body

    const code = "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data, error } = await supabase
      .from("promos")
      .insert([{
        code,
        discount: discount || 0,
        expires_at: expiresAt || null,
        usage_limit: usageLimit || 0,
        used: 0
      }])

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return res.status(500).json({ error: error.message })
    }

    res.json({ code })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
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

  // 🔽 gestion promo (inchangé)
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

  try {
    // 🔐 récupérer secret si vide
    if (!SECRET_KEY) {
      await getSecret()
    }

    const reference = "REF" + Date.now()

    const airtelRes = await axios.post(
      `${AIRTEL.BASE_URL}/v1/${AIRTEL.URL_CODE}/rest`,
      {
        agent: "AGENT-1",
        amount: finalAmount,
        callback_url_code: AIRTEL.CALLBACK_CODE,
        customer_account_number: phone,
        merchant_operation_account_code: AIRTEL.ACCOUNT_CODE,
        transaction_type: "PAYMENT",
        owner_charge: "CUSTOMER",
        owner_charge_operator: "CUSTOMER",
        free_info: name,
        product: "IPC",
        operator_code: "AIRTEL_MONEY",
        reference: reference,
        service: "RESTFUL",
      },
      {
        headers: {
          "X-Secret": SECRET_KEY,
          "Content-Type": "application/json",
        },
      }
    )

    // 💾 sauvegarde en base
    await supabase.from("payments").insert([{
      name,
      phone,
      amount: finalAmount,
      reference,
      status: "PENDING",
      promo_code: promoCode
    }])

    res.json({
      success: true,
      status: "PENDING",
      message: "Paiement initié. Confirmez sur votre téléphone.",
    })

  } catch (err) {
    console.error("❌ AIRTEL ERROR:", err.response?.data || err.message)

    res.status(500).json({
      success: false,
      error: "Erreur paiement Airtel",
    })
  }
})



app.listen(3001, () => {
  console.log("Server running on port 3001");
});


async function getSecret() {
  try {
    const res = await axios.post(
    `${AIRTEL.BASE_URL}/v2/${AIRTEL.SECRET_URL_CODE}/renew-secret`,
      new URLSearchParams({
        operationAccountCode: AIRTEL.ACCOUNT_CODE,
        password: AIRTEL.PASSWORD,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )

    SECRET_KEY = res.data.secret
    console.log("✅ NEW SECRET:", SECRET_KEY)

  } catch (err) {
    console.error("❌ SECRET ERROR:", err.response?.data || err.message)
  }
}


app.post("/callback/airtel", async (req, res) => {
  const data = req.body

  console.log("📩 CALLBACK:", data)

  const { merchantReferenceId, status } = data

  // 🔄 mise à jour paiement
  await supabase
    .from("payments")
    .update({ status })
    .eq("reference", merchantReferenceId)

  // ✅ réponse obligatoire
  res.status(200).json({
    transactionId: data.transactionId,
    responseCode: data.code,
  })
})



