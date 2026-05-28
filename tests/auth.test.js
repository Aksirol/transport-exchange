// tests/auth.test.js
const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Мокаємо базу даних, щоб не робити реальні запити
jest.mock('../src/db', () => ({
    query: jest.fn(),
}));

// Додаємо тестові захищені маршрути прямо в app для перевірки TC-2.8 - TC-2.11
const { verifyToken } = require('../src/middleware/authMiddleware');
const { checkRole } = require('../src/middleware/roleMiddleware');
app.get('/api/test/protected', verifyToken, (req, res) => res.status(200).json({ message: 'Доступ дозволено' }));
app.get('/api/test/admin', verifyToken, checkRole(['admin']), (req, res) => res.status(200).json({ message: 'Admin access' }));

describe('Модуль автентифікації (Тест-план 2.1 - 2.11)', () => {

    beforeEach(() => {
        jest.clearAllMocks(); // Очищаємо моки перед кожним тестом
        process.env.JWT_SECRET = 'test_secret';
    });

    // ---------------------------------------------------------
    // Блок реєстрації (TC-2.1 - TC-2.4)
    // ---------------------------------------------------------
    describe('POST /api/auth/register', () => {
        const validUser = {
            name: 'Іван Іванов', email: 'ivan@test.com', password: 'password123', role: 'customer'
        };

        it('TC-2.1: Реєстрація з валідними даними', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // Користувача не знайдено
            pool.query.mockResolvedValueOnce({ rows: [{ id: 1, ...validUser }] }); // Успішний запис

            const res = await request(app).post('/api/auth/register').send(validUser);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('user');
            expect(pool.query).toHaveBeenCalledTimes(2);
        });

        it('TC-2.2: Реєстрація з існуючим email', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Користувач існує

            const res = await request(app).post('/api/auth/register').send(validUser);

            expect(res.statusCode).toEqual(409);
        });

        it('TC-2.3: Реєстрація без обов\'язкових полів', async () => {
            const res = await request(app).post('/api/auth/register').send({ name: 'Іван' });

            expect(res.statusCode).toEqual(400);
        });

        it('TC-2.4: Реєстрація з коротким паролем (<6 символів)', async () => {
            const res = await request(app).post('/api/auth/register').send({
                ...validUser, password: '123'
            });

            expect(res.statusCode).toEqual(400);
        });
    });

    // ---------------------------------------------------------
    // Блок входу (TC-2.5 - TC-2.7)
    // ---------------------------------------------------------
    describe('POST /api/auth/login', () => {
        const loginData = { email: 'ivan@test.com', password: 'password123' };

        it('TC-2.5: Вхід з правильним паролем', async () => {
            const hashedPassword = await bcrypt.hash(loginData.password, 10);
            pool.query.mockResolvedValueOnce({
                rows: [{ id: 1, email: loginData.email, password_hash: hashedPassword, role: 'customer' }]
            });

            const res = await request(app).post('/api/auth/login').send(loginData);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
        });

        it('TC-2.6: Вхід з неправильним паролем', async () => {
            const hashedPassword = await bcrypt.hash('differentPassword', 10);
            pool.query.mockResolvedValueOnce({
                rows: [{ id: 1, email: loginData.email, password_hash: hashedPassword, role: 'customer' }]
            });

            const res = await request(app).post('/api/auth/login').send(loginData);

            expect(res.statusCode).toEqual(401);
        });

        it('TC-2.7: Вхід неіснуючого користувача', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // Не знайдено

            const res = await request(app).post('/api/auth/login').send(loginData);

            expect(res.statusCode).toEqual(401);
        });
    });

    // ---------------------------------------------------------
    // Блок захисту маршрутів (TC-2.8 - TC-2.11)
    // ---------------------------------------------------------
    describe('Middleware Protection', () => {
        let validToken, expiredToken;

        beforeAll(() => {
            validToken = jwt.sign({ id: 1, role: 'carrier' }, 'test_secret', { expiresIn: '1h' });
            expiredToken = jwt.sign({ id: 1, role: 'carrier' }, 'test_secret', { expiresIn: '-1s' });
        });

        it('TC-2.8: Запит із валідним JWT на захищений маршрут', async () => {
            const res = await request(app)
                .get('/api/test/protected')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.statusCode).toEqual(200);
        });

        it('TC-2.9: Запит із протермінованим JWT', async () => {
            const res = await request(app)
                .get('/api/test/protected')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(res.statusCode).toEqual(403); // У нашому middleware jwt.verify падає в catch, повертаючи 403
        });

        it('TC-2.10: Запит без токена на захищений маршрут', async () => {
            const res = await request(app).get('/api/test/protected');

            expect(res.statusCode).toEqual(401);
        });

        it('TC-2.11: Carrier намагається отримати admin-ендпоінт', async () => {
            const res = await request(app)
                .get('/api/test/admin')
                .set('Authorization', `Bearer ${validToken}`); // Токен carrier

            expect(res.statusCode).toEqual(403);
        });
    });
});