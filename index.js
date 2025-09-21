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
 * Создание пользователя
 */
/**
 * Создание пользователя (как Shnitcel, но с кастомным именем)
 */
app.post("/users", async (req, res) => {
  try {
    const token = await getToken();
    const userData = req.body;

    // Генерация имени в формате "telegramId_M12_x"
    // например, если передаёшь telegramId и счётчик
    const username =
      userData.username ||
      `${userData.telegram_id || "user"}_M12_${Math.floor(Math.random() * 10000)}`;

    const payload = {
      username,
      status: "active",
      expire: null,                       // бессрочно (как Shnitcel)
      data_limit: null,                   // без лимита
      data_limit_reset_strategy: "no_reset",
      proxies: { vless: {} },             // VLESS включен
      note: userData.note || "",          // можно оставить пустым
      excluded_inbounds: { vless: [] },   // доступ ко всем inbound
    };

    console.log("📤 Отправляем payload в Marzban:", payload);

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
