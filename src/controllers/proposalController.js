const pool = require('../db');

// 1. POST /api/proposals (Тільки для carrier)
exports.createProposal = async (req, res) => {
    try {
        const { order_id, vehicle_id, price, comment } = req.body;
        const carrier_id = req.user.id;

        // TC-4.6: Пропозиція без vehicle_id -> 400
        if (!order_id || !price || !vehicle_id) {
            return res.status(400).json({ message: 'Заповніть обов\'язкові поля: order_id, vehicle_id та price' });
        }

        const orderCheck = await pool.query('SELECT status FROM orders WHERE id = $1', [order_id]);

        // TC-4.4: Пропозиція на неіснуючу заявку -> 404
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Заявку не знайдено' });
        }

        // TC-4.5: Пропозиція на заявку зі статусом confirmed -> 400
        if (orderCheck.rows[0].status !== 'active') {
            return res.status(400).json({ message: 'Заявка вже закрита або скасована' });
        }

        // TC-4.3: Повторна пропозиція -> 409
        const duplicateCheck = await pool.query(
            'SELECT id FROM proposals WHERE order_id = $1 AND carrier_id = $2',
            [order_id, carrier_id]
        );
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Ви вже надіслали пропозицію на цю заявку' });
        }

        const result = await pool.query(
            `INSERT INTO proposals (order_id, carrier_id, vehicle_id, price, comment) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [order_id, carrier_id, vehicle_id, price, comment]
        );

        res.status(201).json({ message: 'Пропозицію успішно надіслано', proposal: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка сервера при створенні пропозиції' });
    }
};

// 2. GET /api/orders/:id/proposals (Тільки для власника заявки)
exports.getOrderProposals = async (req, res) => {
    try {
        const order_id = req.params.id;
        const customer_id = req.user.id;

        // Перевіряємо, чи належить заявка цьому замовнику
        const orderCheck = await pool.query('SELECT id FROM orders WHERE id = $1 AND customer_id = $2', [order_id, customer_id]);
        if (orderCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Доступ заборонено. Ви не є власником цієї заявки' });
        }

        const result = await pool.query(
            `SELECT p.*, u.name as carrier_name, u.phone as carrier_phone 
             FROM proposals p 
             JOIN users u ON p.carrier_id = u.id 
             WHERE p.order_id = $1 ORDER BY p.created_at DESC`,
            [order_id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні пропозицій' });
    }
};

// 5. GET /api/proposals/my (Тільки для carrier)
exports.getMyProposals = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, o.origin_address, o.destination_address, o.cargo_type 
             FROM proposals p 
             JOIN orders o ON p.order_id = o.id 
             WHERE p.carrier_id = $1 ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні власних пропозицій' });
    }
};

// 3. PUT /api/proposals/:id/accept (Прийняти)
exports.acceptProposal = async (req, res) => {
    const client = await pool.connect(); // Отримуємо клієнт для транзакції
    try {
        const proposal_id = req.params.id;
        const customer_id = req.user.id;

        await client.query('BEGIN'); // Початок транзакції

        // 1. Отримуємо пропозицію та перевіряємо, чи заявка належить замовнику
        const proposalCheck = await client.query(
            `SELECT p.order_id, o.status as order_status 
             FROM proposals p 
             JOIN orders o ON p.order_id = o.id 
             WHERE p.id = $1 AND o.customer_id = $2`,
            [proposal_id, customer_id]
        );

        if (proposalCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Доступ заборонено або пропозицію не знайдено' });
        }

        const order_id = proposalCheck.rows[0].order_id;
        if (proposalCheck.rows[0].order_status !== 'active') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Ця заявка вже закрита або скасована' });
        }

        // 2. Оновлюємо статус обраної пропозиції
        await client.query(`UPDATE proposals SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [proposal_id]);

        // 3. Відхиляємо всі інші пропозиції для цієї заявки
        await client.query(`UPDATE proposals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND id != $2`, [order_id, proposal_id]);

        // 4. Змінюємо статус самої заявки на confirmed
        await client.query(`UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [order_id]);

        await client.query('COMMIT'); // Успішне завершення транзакції
        res.status(200).json({ message: 'Пропозицію успішно прийнято. Заявка підтверджена.' });
    } catch (err) {
        await client.query('ROLLBACK'); // Відкат у разі помилки
        console.error(err);
        res.status(500).json({ message: 'Помилка при прийнятті пропозиції' });
    } finally {
        client.release(); // Повертаємо клієнт до пулу
    }
};

// 4. PUT /api/proposals/:id/reject (Відхилити конкретну)
exports.rejectProposal = async (req, res) => {
    try {
        const proposal_id = req.params.id;
        const customer_id = req.user.id;

        // Перевіряємо права
        const check = await pool.query(
            `SELECT p.id FROM proposals p 
             JOIN orders o ON p.order_id = o.id 
             WHERE p.id = $1 AND o.customer_id = $2`,
            [proposal_id, customer_id]
        );

        if (check.rows.length === 0) return res.status(403).json({ message: 'Доступ заборонено' });

        await pool.query(`UPDATE proposals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [proposal_id]);
        res.status(200).json({ message: 'Пропозицію відхилено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при відхиленні пропозиції' });
    }
};