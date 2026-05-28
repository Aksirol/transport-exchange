const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

// Мокаємо базу даних
jest.mock('../src/db', () => ({
    query: jest.fn(),
}));

describe('Модуль заявок (Тест-план 3.1 - 3.13)', () => {
    let customerToken, carrierToken;

    // Створюємо майбутню дату для валідних тестів
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 5);
    const validDateString = validDate.toISOString().split('T')[0];

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const pastDateString = pastDate.toISOString().split('T')[0];

    const validOrderPayload = {
        cargo_type: 'Деревина',
        cargo_weight: 20,
        origin_address: 'Київ',
        destination_address: 'Львів',
        desired_date: validDateString,
    };

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        // Генеруємо токени для різних ролей
        customerToken = jwt.sign({ id: 'uuid-customer-1', role: 'customer' }, process.env.JWT_SECRET);
        carrierToken = jwt.sign({ id: 'uuid-carrier-1', role: 'carrier' }, process.env.JWT_SECRET);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Створення заявки ---
    describe('POST /api/orders', () => {
        it('TC-3.1: Замовник створює заявку з повними даними', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'order-1', status: 'active', ...validOrderPayload }] });

            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${customerToken}`)
                .send(validOrderPayload);

            expect(res.statusCode).toEqual(201);
            expect(res.body.order.status).toBe('active');
        });

        it('TC-3.2: Перевізник намагається створити заявку', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${carrierToken}`) // Токен перевізника
                .send(validOrderPayload);

            expect(res.statusCode).toEqual(403);
        });

        it('TC-3.3: Створення заявки без обов\'язкових полів', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ cargo_type: 'Деревина' }); // Не вистачає полів

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/обов'язкові поля/);
        });

        it('TC-3.4: Створення заявки з датою в минулому', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ ...validOrderPayload, desired_date: pastDateString });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Дата не може бути в минулому');
        });
    });

    // --- Отримання списків ---
    describe('GET /api/orders', () => {
        it('TC-3.5: Отримання списку заявок (тільки active, пагінація працює)', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'order-1' }, { id: 'order-2' }] });

            const res = await request(app)
                .get('/api/orders?page=1&limit=5')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            // Перевіряємо, чи в запиті SQL були передані ліміт (5) та зсув (0)
            expect(pool.query.mock.calls[0][1]).toContain(5);
            expect(pool.query.mock.calls[0][1]).toContain(0);
        });

        it('TC-3.6: Фільтр за містом відправлення', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ origin_address: 'Київ' }] });

            const res = await request(app)
                .get('/api/orders?origin=Київ')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(pool.query.mock.calls[0][1]).toContain('%Київ%'); // Перевірка параметра запиту
        });
    });

    // --- Деталі заявки ---
    describe('GET /api/orders/:id', () => {
        it('TC-3.7: Отримання деталей заявки за ID', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: '123', cargo_type: 'Зерно' }] });

            const res = await request(app)
                .get('/api/orders/123')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.cargo_type).toBe('Зерно');
        });

        it('TC-3.8: Отримання неіснуючої заявки', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // БД нічого не знаходить

            const res = await request(app)
                .get('/api/orders/999')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(404);
        });
    });

    // --- Редагування заявки ---
    describe('PUT /api/orders/:id', () => {
        it('TC-3.9: Замовник редагує власну активну заявку', async () => {
            // Мок перевірки належності (заявка активна і належить юзеру)
            pool.query.mockResolvedValueOnce({ rows: [{ status: 'active' }] });
            // Мок самого оновлення
            pool.query.mockResolvedValueOnce({ rows: [{ id: '123', cargo_weight: 30 }] });

            const res = await request(app)
                .put('/api/orders/123')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ cargo_weight: 30 });

            expect(res.statusCode).toEqual(200);
            expect(res.body.order.cargo_weight).toBe(30);
        });

        it('TC-3.10: Замовник редагує чужу заявку', async () => {
            // Мок перевірки належності (заявку не знайдено для цього customer_id)
            pool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .put('/api/orders/123')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ cargo_weight: 30 });

            expect(res.statusCode).toEqual(403);
        });

        it('TC-3.11: Редагування підтвердженої заявки (confirmed)', async () => {
            // Мок перевірки належності (заявка належить, але статус confirmed)
            pool.query.mockResolvedValueOnce({ rows: [{ status: 'confirmed' }] });

            const res = await request(app)
                .put('/api/orders/123')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ cargo_weight: 30 });

            expect(res.statusCode).toEqual(400);
        });
    });

    // --- Скасування заявки ---
    describe('DELETE /api/orders/:id', () => {
        it('TC-3.12: Скасування власної активної заявки', async () => {
            // Мок UPDATE запиту, що повертає скасовану заявку
            pool.query.mockResolvedValueOnce({ rows: [{ id: '123', status: 'cancelled' }] });

            const res = await request(app)
                .delete('/api/orders/123')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toMatch(/скасовано/);
        });
    });

    // --- Власні заявки ---
    describe('GET /api/orders/my/list', () => {
        it('TC-3.13: GET /api/orders/my/list — список власних заявок', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'my-order-1' }] });

            const res = await request(app)
                .get('/api/orders/my/list')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].id).toBe('my-order-1');
        });
    });
});