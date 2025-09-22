require("dotenv").config();
const express = require("express");
const axios = require("axios");
const https = require("https");

const app = express();
app.use(express.json());

const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Получение access token
 */
async function getToken() {
  const res = await axios.post(
    `${process.env.MARZBAN_URL}/api/admin/token`,
    new URLSearchParams({
      username: process.env.MARZBAN_USERNAME,
      password: process.env.MARZBAN_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: agent,
    }
  );
  return res.data.access_token;
}

/**
 * Продление подписки пользователя
 * Пример: POST /users/testvless/extend?days=30
 */
app.post("/users/:username/extend", async (req, res) => {
  try {
    const token = await getToken();
    const username = req.params.username;
    const days = parseInt(req.query.days || "30", 10);

    // 1. Получаем данные пользователя
    const userRes = await axios.get(
      `${process.env.MARZBAN_URL}/api/user/${username}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent,
      }
    );

    const user = userRes.data;

    // 2. Вычисляем новое время окончания
    const now = Math.floor(Date.now() / 1000); // текущее время (UTC timestamp)
    let currentExpire = user.expire || 0;

    if (currentExpire === 0 || currentExpire < now) {
      // если нет ограничения или срок уже истёк → начинаем отсчёт с "сейчас"
      currentExpire = now;
    }

    const newExpire = currentExpire + days * 24 * 60 * 60;

    // 3. Отправляем PUT для обновления
    const updateRes = await axios.put(
      `${process.env.MARZBAN_URL}/api/user/${username}`,
      {
        expire: newExpire,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent,
      }
    );

    res.json({
      message: `Подписка пользователя ${username} продлена на ${days} дней`,
      old_expire: user.expire,
      new_expire: newExpire,
      data: updateRes.data,
    });
  } catch (err) {
    console.error("❌ Ошибка продления:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});


/**
 * Создание пользователя (как Shnitcel, но с кастомным именем и Reality inbound)
 */
// Создание пользователя с корректным expire + Reality inbound по умолчанию
app.post("/users", async (req, res) => {
  try {
    const token = await getToken();
    const body = req.body || {};

    // Если пришёл готовый expire (unix seconds) — используем его.
    // Иначе если пришли months — считаем по календарю (через setMonth).
    let expire = body.expire;
    if ((!expire || Number.isNaN(Number(expire))) && body.months) {
      const base = new Date();
      base.setSeconds(0, 0);
      base.setMonth(base.getMonth() + Number(body.months));
      expire = Math.floor(base.getTime() / 1000);
    }

    const username =
      body.username ||
      `${body.telegram_id || "user"}_${body.plan || "M"}_${Math.floor(Math.random() * 10000)}`;

    const payload = {
      username,
      status: body.status || "active",
      ...(expire ? { expire } : {}),
      ...(body.data_limit !== undefined ? { data_limit: body.data_limit } : {}),
      ...(body.data_limit_reset_strategy
        ? { data_limit_reset_strategy: body.data_limit_reset_strategy }
        : {}),
      proxies: body.proxies || { vless: {} },
      note: body.note || "",
      // ✅ Reality inbound всегда по умолчанию
      inbounds: body.inbounds || { vless: ["VLESS TCP REALITY"] },
    };

    console.log("📤 Создаём пользователя в Marzban с payload:", payload);

    const createRes = await axios.post(
      `${process.env.MARZBAN_URL}/api/user`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent,
      }
    );

    res.json(createRes.data);
  } catch (err) {
    console.error("❌ Ошибка при создании:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});




// Список пользователей (полный)
app.get("/users", async (req, res) => {
  try {
    const token = await getToken();
    const usersRes = await axios.get(`${process.env.MARZBAN_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent,
    });

    // отдаём всё как есть
    res.json(usersRes.data);
  } catch (err) {
    console.error("❌ Ошибка получения списка:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});



/**
 * Удаление пользователя
 */
app.delete("/users/:username", async (req, res) => {
  try {
    const token = await getToken();
    const username = req.params.username;

    const delRes = await axios.delete(
      `${process.env.MARZBAN_URL}/api/user/${username}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent,
      }
    );

    res.json({ message: `Пользователь ${username} удалён`, data: delRes.data });
  } catch (err) {
    console.error("❌ Ошибка при удалении:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "🚀 Сервер работает!" });
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 API сервер запущен на http://localhost:${process.env.PORT}`);
});
