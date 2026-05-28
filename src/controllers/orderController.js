const pool = require('../db');

// 1. POST /api/orders (Тільки для customer)
exports.createOrder = async (req, res) => {
    try {
        const { cargo_type, cargo_description, cargo_weight, origin_address, destination_address, desired_date, desired_price } = req.body;
        const customer_id = req.user.id;

        // TC-3.3: Валідація обов'язкових полів
        if (!cargo_type || !cargo_weight || !origin_address || !destination_address || !desired_date) {
            return res.status(400).json({ message: 'Заповніть всі обов\'язкові поля' });
        }

        // TC-3.4: Валідація дати (не в минулому)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Обнуляємо час для коректного порівняння дат
        const orderDate = new Date(desired_date);

        if (orderDate < today) {
            return res.status(400).json({ message: 'Дата не може бути в минулому' });
        }

        const result = await pool.query(
            `INSERT INTO orders
             (customer_id, cargo_type, cargo_description, cargo_weight, origin_address, destination_address, desired_date, desired_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [customer_id, cargo_type, cargo_description, cargo_weight, origin_address, destination_address, desired_date, desired_price]
        );

        res.status(201).json({ message: 'Заявку успішно створено', order: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка сервера при створенні заявки' });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { origin, destination, date, type } = req.query;

        // Явно перетворюємо параметри пагінації на числа
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        let query = "SELECT * FROM orders WHERE status = 'active'";
        let params = [];
        let paramIndex = 1;

        if (origin) { query += ` AND origin_address ILIKE $${paramIndex++}`; params.push(`%${origin}%`); }
        if (destination) { query += ` AND destination_address ILIKE $${paramIndex++}`; params.push(`%${destination}%`); }
        if (date) { query += ` AND desired_date = $${paramIndex++}`; params.push(date); }
        if (type) { query += ` AND cargo_type ILIKE $${paramIndex++}`; params.push(`%${type}%`); }

        // Додаємо пагінацію
        const offset = (page - 1) * limit;
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні заявок' });
    }
};

// 6. GET /api/orders/my (Власні заявки)
// Розміщуємо перед /:id, щоб "my" не сприймалося як ідентифікатор
exports.getMyOrders = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні власних заявок' });
    }
};

// 3. GET /api/orders/:id (Деталі)
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Заявку не знайдено' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні заявки' });
    }
};

// 4. PUT /api/orders/:id (Редагування)
exports.updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const customer_id = req.user.id;
        const { cargo_type, cargo_weight, desired_price } = req.body;

        // Перевіряємо, чи належить заявка користувачу і чи вона активна
        const check = await pool.query('SELECT status FROM orders WHERE id = $1 AND customer_id = $2', [id, customer_id]);
        if (check.rows.length === 0) return res.status(403).json({ message: 'Доступ заборонено або заявку не знайдено' });
        if (check.rows[0].status !== 'active') return res.status(400).json({ message: 'Можна редагувати лише активні заявки' });

        const result = await pool.query(
            `UPDATE orders SET cargo_type = $1, cargo_weight = $2, desired_price = $3, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $4 RETURNING *`,
            [cargo_type, cargo_weight, desired_price, id]
        );
        res.status(200).json({ message: 'Заявку оновлено', order: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при оновленні заявки' });
    }
};

// 5. DELETE /api/orders/:id (Скасування)
exports.cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const customer_id = req.user.id;

        const result = await pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 AND customer_id = $2 AND status = 'active' RETURNING *`,
            [id, customer_id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Заявку не знайдено або її неможливо скасувати' });
        }
        res.status(200).json({ message: 'Заявку скасовано' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при скасуванні заявки' });
    }
};