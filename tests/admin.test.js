const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

// Мокаємо базу даних
jest.mock('../src/db', () => ({
    query: jest.fn(),
}));

describe('Модуль адміністратора (Тест-план 5)', () => {
    let adminToken, customerToken;
    const adminId = 'admin-uuid-123';

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        // Генеруємо токени: один для адміністратора, інший для перевірки доступу
        adminToken = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET);
        customerToken = jwt.sign({ id: 'customer-uuid-456', role: 'customer' }, process.env.JWT_SECRET);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ---------------------------------------------------------
    // Перевірка прав доступу
    // ---------------------------------------------------------
    describe('Перевірка Role Middleware', () => {
        it('TC-5.1: Звичайний користувач (customer) намагається отримати доступ', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toMatch(/Недостатньо прав/);
        });

        it('TC-5.2: Запит без токена', async () => {
            const res = await request(app).get('/api/admin/users');
            expect(res.statusCode).toEqual(401);
        });
    });

    // ---------------------------------------------------------
    // Статистика та списки
    // ---------------------------------------------------------
    describe('GET Requests (Stats, Users, Orders)', () => {
        it('TC-5.3: Отримання загальної статистики', async () => {
            // Мокаємо 3 послідовні запити до БД для count(*)
            pool.query
                .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // users
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })  // orders
                .mockResolvedValueOnce({ rows: [{ count: '15' }] }); // proposals

            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ users: 10, orders: 5, proposals: 15 });
            expect(pool.query).toHaveBeenCalledTimes(3);
        });

        it('TC-5.4: Отримання списку всіх користувачів', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'user-1', name: 'Іван', role: 'customer' }] });

            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Іван');
        });

        it('TC-5.5: Отримання списку всіх заявок', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'order-1', cargo_type: 'Палети', customer_name: 'ТОВ Логістика' }] });

            const res = await request(app)
                .get('/api/admin/orders')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body[0].customer_name).toBe('ТОВ Логістика');
        });
    });

    // ---------------------------------------------------------
    // Видалення користувачів
    // ---------------------------------------------------------
    describe('DELETE /api/admin/users/:id', () => {
        it('TC-5.6: Успішне видалення користувача', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'user-to-delete' }] });

            const res = await request(app)
                .delete('/api/admin/users/user-to-delete')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toMatch(/успішно видалено/);
        });

        it('TC-5.7: Спроба адміністратора видалити самого себе', async () => {
            // Передаємо adminId, який зашитий у токені
            const res = await request(app)
                .delete(`/api/admin/users/${adminId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/Неможливо видалити власний акаунт/);
            // Перевіряємо, що до бази даних запит навіть не дійшов
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('TC-5.8: Видалення неіснуючого користувача', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // БД нічого не повернула

            const res = await request(app)
                .delete('/api/admin/users/fake-user-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toMatch(/не знайдено/);
        });
    });
});