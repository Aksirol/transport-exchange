const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// POST /api/auth/register
// POST /api/auth/register
exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;

        // 1. Перевірка на наявність обов'язкових полів
        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'Заповніть всі обов\'язкові поля' });
        }

        // 2. Детальна валідація даних
        if (name.length < 3) {
            return res.status(400).json({ message: 'Ім\'я має містити щонайменше 3 символи' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Некоректний формат email' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Пароль має містити мінімум 6 символів' });
        }

        // Телефон необов'язковий у БД, але якщо він переданий, перевіряємо формат
        const phoneRegex = /^\+380\d{9}$/;
        if (phone && !phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Некоректний формат телефону. Використовуйте +380XXXXXXXXX' });
        }

        const allowedRoles = ['customer', 'carrier', 'admin'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Некоректна роль користувача' });
        }

        // 3. Перевірка, чи існує користувач
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(409).json({ message: 'Користувач з таким email вже існує' });
        }

        // 4. Хешування пароля
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 5. Запис у БД
        const result = await pool.query(
            'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role',
            [name, email, passwordHash, phone, role]
        );

        res.status(201).json({ message: 'Реєстрація успішна', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка сервера при реєстрації' });
    }
};

// POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Пошук користувача
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Невірний email або пароль' });
        }

        // Перевірка пароля
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Невірний email або пароль' });
        }

        // Генерація JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({ message: 'Вхід успішний', token, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка сервера при вході' });
    }
};