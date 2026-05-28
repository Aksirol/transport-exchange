const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    // Очікуємо заголовок у форматі "Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Доступ заборонено. Токен не надано.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Додаємо дані користувача в об'єкт запиту
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Недійсний або протермінований токен.' });
    }
};