// Ця функція приймає масив дозволених ролей
exports.checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Недостатньо прав для виконання цієї дії.' });
        }
        next();
    };
};