require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const adminRoutes = require('./routes/adminRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Роздача статичних файлів з папки public
app.use(express.static(path.join(__dirname, '../public')));

// Підключення маршрутів автентифікації
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vehicles', vehicleRoutes);

// Тестовий маршрут
app.get('/api/health', async (req, res) => {
    try {
        const dbRes = await pool.query('SELECT NOW()');
        res.status(200).json({
            status: 'success',
            message: 'Server is running',
            db_time: dbRes.rows[0].now
        });
    } catch (err) {
        console.error('Database connection error:', err);
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

// Експортуємо app для тестування. Запускаємо сервер, лише якщо файл викликано напряму
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

module.exports = app;