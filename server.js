const { createClient } = require('@supabase/supabase-js')
const jwt = require("jsonwebtoken")
const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const axios = require("axios")

// ================= ENV =================
const AIRTEL = {
  BASE_URL: process.env.AIRTEL_BASE_URL,
  URL_CODE: process.env.AIRTEL_URL_CODE,
  SECRET_URL_CODE: process.env.AIRTEL_SECRET_URL_CODE,
  ACCOUNT_CODE: process.env.AIRTEL_ACCOUNT_CODE,
  CALLBACK_CODE: process.env.AIRTEL_CALLBACK_CODE,
  PASSWORD: process.env.AIRTEL_PASSWORD,
}

const SECRET = process.env.JWT_SECRET

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ================= APP =================
const app = express()
app.use(cors())
app.use(bodyParser.json())

// ================= SECRET CACHE =================
let SECRET_KEY = null
let SECRET_EXPIRES_AT = 0

async function getSecret() {
  if (SECRET_KEY && Date.now() < SECRET_EXPIRES_AT) {
    return SECRET_KEY
  }

  try {
    const res = await axios.post(
      `${AIRTEL.BASE_URL}/v1/${AIRTEL.SECRET_URL_CODE}/renew-secret`,
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
    SECRET_EXPIRES_AT = Date.now() + (res.data.expires_in - 60) * 1000

    console.log("✅ NEW SECRET OK")
    return SECRET_KEY

  } catch (err) {
    console.error("❌ SECRET ERROR:", err.response?.data || err.message)
    throw err
    
  }
}
console.log("URL utilisée:", `${AIRTEL.BASE_URL}/v2/${AIRTEL.SECRET_URL_CODE}/renew-secret`)
// ================= ADMIN =================
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ role: "admin" }, SECRET, { expiresIn: "2h" })
    return res.json({ token })
  }

  res.status(401).json({ error: "Invalid credentials" })
})

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: "No token" })

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(403).json({ error: "Invalid token" })
  }
}

// ================= PROMO =================
app.post("/admin/create-promo", verifyToken, async (req, res) => {
  try {
    const { discount, expiresAt, usageLimit } = req.body

    const code = "PROMO-" + Math.random().toString(36).substring(2, 8).toUpperCase()

    const { error } = await supabase
      .from("promos")
      .insert([{
        code,
        discount: discount || 0,
        expires_at: expiresAt || null,
        usage_limit: usageLimit || 0,
        used: 0
      }])

    if (error) return res.status(500).json({ error: error.message })

    res.json({ code })

  } catch (err) {
    res.status(500).json({ error: "Server error" })
  }
})

app.get("/admin/promos", verifyToken, async (req, res) => {
  const { data } = await supabase.from("promos").select("*")
  res.json(data)
})

app.post("/apply-promo", async (req, res) => {
  const { code, amount } = req.body

  const { data } = await supabase
    .from("promos")
    .select("*")
    .eq("code", code)
    .single()

  if (!data) return res.json({ valid: false })

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return res.json({ valid: false })
  }

  if (data.used >= data.usage_limit) {
    return res.json({ valid: false })
  }

  const discountAmount = amount * data.discount

  res.json({ valid: true, discountAmount })
})

// ================= PAYMENT =================
app.post("/pay", async (req, res) => {
  let { name, phone, amount, promoCode } = req.body

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Montant invalide" })
  }


  let finalAmount = amount

  // promo
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
    const secret = await getSecret()

    const reference = "REF" + Date.now()

    await axios.post(
      `${AIRTEL.BASE_URL}/v2/${AIRTEL.URL_CODE}/rest`,
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
        product: "IPC", // <= 15 chars
        operator_code: "AIRTEL_MONEY",
        reference: reference,
        service: "RESTFUL",
      },
      {
        headers: {
          "X-Secret": secret,
          "Content-Type": "application/json",
        },
      }
    )

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
      reference,
      status: "PENDING",
    })

  } catch (err) {
    console.error("❌ AIRTEL ERROR:", err.response?.data || err.message)

    res.status(500).json({
      success: false,
      error: "Erreur paiement Airtel",
    })
  }
})

// ================= CALLBACK =================
app.post("/callback/airtel", async (req, res) => {
  const data = req.body

  console.log("📩 CALLBACK:", data)

  const { merchantReferenceId, status, amount } = data

  if (!merchantReferenceId) {
    return res.status(400).json({ error: "Invalid callback" })
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("reference", merchantReferenceId)
    .single()

  if (!payment) {
    return res.status(404).json({ error: "Payment not found" })
  }

  if (payment.status === "SUCCESS") {
    return res.status(200).json({ message: "Already processed" })
  }

  if (payment.amount !== amount) {
    console.error("⚠️ Montant différent détecté !")
  }

  await supabase
    .from("payments")
    .update({ status })
    .eq("reference", merchantReferenceId)

  res.status(200).json({
    transactionId: data.transactionId,
    responseCode: data.code,
  })
})

// ================= CHECK =================
app.get("/check/:reference", async (req, res) => {
  const { reference } = req.params

  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .single()

  res.json(data)
})

// ================= START =================
const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})