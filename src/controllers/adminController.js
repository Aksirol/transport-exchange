const pool = require('../db');

// 1. GET /api/admin/stats — Загальна статистика
exports.getStats = async (req, res) => {
    try {
        const usersCount = await pool.query('SELECT COUNT(*) FROM users');
        const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
        const proposalsCount = await pool.query('SELECT COUNT(*) FROM proposals');

        res.status(200).json({
            users: parseInt(usersCount.rows[0].count),
            orders: parseInt(ordersCount.rows[0].count),
            proposals: parseInt(proposalsCount.rows[0].count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні статистики' });
    }
};

// 2. GET /api/admin/users — Список усіх користувачів
exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні користувачів' });
    }
};

// 3. DELETE /api/admin/users/:id — Видалення користувача
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Захист: адміністратор не може видалити сам себе
        if (id === req.user.id) {
            return res.status(400).json({ message: 'Неможливо видалити власний акаунт' });
        }

        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Користувача не знайдено' });
        }

        res.status(200).json({ message: 'Користувача успішно видалено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при видаленні користувача' });
    }
};

// 4. GET /api/admin/orders — Список усіх заявок (з даними замовників)
exports.getAllOrders = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, u.name as customer_name, u.email as customer_email 
            FROM orders o 
            JOIN users u ON o.customer_id = u.id 
            ORDER BY o.created_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні заявок' });
    }
};