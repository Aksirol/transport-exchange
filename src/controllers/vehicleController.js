const pool = require('../db');

// 1. POST /api/vehicles — Додати новий транспортний засіб (Тільки для carrier)
exports.addVehicle = async (req, res) => {
    try {
        const { brand, model, vehicle_type, payload_tons, license_plate } = req.body;
        const carrier_id = req.user.id;

        if (!brand || !model || !vehicle_type || !payload_tons || !license_plate) {
            return res.status(400).json({ message: 'Заповніть всі обов\'язкові поля' });
        }

        // Перевірка на унікальність номерного знака (згідно з ER-діаграмою він UNIQUE)
        const duplicateCheck = await pool.query('SELECT id FROM vehicles WHERE license_plate = $1', [license_plate]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Транспортний засіб з таким номерним знаком вже зареєстровано' });
        }

        const result = await pool.query(
            `INSERT INTO vehicles (carrier_id, brand, model, vehicle_type, payload_tons, license_plate) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [carrier_id, brand, model, vehicle_type, payload_tons, license_plate]
        );

        res.status(201).json({ message: 'Транспортний засіб успішно додано', vehicle: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при додаванні транспортного засобу' });
    }
};

// 2. GET /api/vehicles/my — Отримати авто поточного перевізника
exports.getMyVehicles = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM vehicles WHERE carrier_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при отриманні транспортних засобів' });
    }
};

// 3. DELETE /api/vehicles/:id — Видалити авто
exports.deleteVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const carrier_id = req.user.id;

        // Видаляємо лише те авто, яке належить поточному перевізнику
        const result = await pool.query(
            'DELETE FROM vehicles WHERE id = $1 AND carrier_id = $2 RETURNING id',
            [id, carrier_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Транспортний засіб не знайдено або доступ заборонено' });
        }

        res.status(200).json({ message: 'Транспортний засіб видалено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Помилка при видаленні транспортного засобу' });
    }
};