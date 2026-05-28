const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

// Мокаємо pool.query та pool.connect для транзакцій
const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
};

jest.mock('../src/db', () => ({
    query: jest.fn(),
    connect: jest.fn(() => mockClient),
}));

describe('Модуль пропозицій (Тест-план 4.1 - 4.10)', () => {
    let customerToken, carrierToken;

    const validProposal = {
        order_id: 'order-123',
        vehicle_id: 'vehicle-456',
        price: 5000,
        comment: 'Готовий виїхати завтра'
    };

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        customerToken = jwt.sign({ id: 'customer-1', role: 'customer' }, process.env.JWT_SECRET);
        carrierToken = jwt.sign({ id: 'carrier-1', role: 'carrier' }, process.env.JWT_SECRET);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ---------------------------------------------------------
    // Створення пропозицій (TC-4.1 - TC-4.6)
    // ---------------------------------------------------------
    describe('POST /api/proposals', () => {
        it('TC-4.1: Перевізник надсилає пропозицію на активну заявку', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // orderCheck (знайдено, активна)
                .mockResolvedValueOnce({ rows: [] }) // duplicateCheck (немає дублікатів)
                .mockResolvedValueOnce({ rows: [{ id: 'prop-1', status: 'pending', ...validProposal }] }); // INSERT

            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validProposal);

            expect(res.statusCode).toEqual(201);
            expect(res.body.proposal.status).toBe('pending');
        });

        it('TC-4.2: Замовник намагається надіслати пропозицію', async () => {
            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${customerToken}`) // Токен customer
                .send(validProposal);

            expect(res.statusCode).toEqual(403);
        });

        it('TC-4.3: Повторна пропозиція від того ж перевізника', async () => {
            pool.query
                .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'existing-prop' }] }); // duplicateCheck (дублікат знайдено)

            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validProposal);

            expect(res.statusCode).toEqual(409);
        });

        it('TC-4.4: Пропозиція на неіснуючу заявку', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // orderCheck (не знайдено)

            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validProposal);

            expect(res.statusCode).toEqual(404);
        });

        it('TC-4.5: Пропозиція на заявку зі статусом confirmed', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ status: 'confirmed' }] }); // orderCheck (закрита)

            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validProposal);

            expect(res.statusCode).toEqual(400);
        });

        it('TC-4.6: Пропозиція без vehicle_id', async () => {
            const res = await request(app)
                .post('/api/proposals')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send({ order_id: 'order-123', price: 5000 }); // Без vehicle_id

            expect(res.statusCode).toEqual(400);
        });
    });

    // ---------------------------------------------------------
    // Прийняття пропозиції (TC-4.7 - TC-4.8)
    // ---------------------------------------------------------
    describe('PUT /api/proposals/:id/accept', () => {
        it('TC-4.7: Замовник приймає пропозицію (Транзакція)', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [{ order_id: 'ord-1', order_status: 'active' }] }) // SELECT: власник підтверджений
                .mockResolvedValueOnce() // UPDATE proposals (accepted)
                .mockResolvedValueOnce() // UPDATE proposals (rejected)
                .mockResolvedValueOnce() // UPDATE orders (confirmed)
                .mockResolvedValueOnce(); // COMMIT

            const res = await request(app)
                .put('/api/proposals/prop-1/accept')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            // Перевіряємо, що транзакція закрилася
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('TC-4.8: Замовник приймає пропозицію чужої заявки', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [] }); // SELECT: порожньо (не є власником)

            const res = await request(app)
                .put('/api/proposals/prop-1/accept')
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.statusCode).toEqual(403);
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK'); // Перевіряємо відкат транзакції
        });
    });

    // ---------------------------------------------------------
    // Перегляд пропозицій (TC-4.9 - TC-4.10)
    // ---------------------------------------------------------
    describe('GET Requests', () => {
        it('TC-4.9: Перегляд пропозицій чужої заявки (перевізник намагається викликати customer-маршрут)', async () => {
            const res = await request(app)
                .get('/api/orders/order-123/proposals')
                .set('Authorization', `Bearer ${carrierToken}`); // Токен перевізника

            expect(res.statusCode).toEqual(403);
        });

        it('TC-4.10: GET /api/proposals/my — власні пропозиції перевізника', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'prop-1', status: 'pending' }, { id: 'prop-2', status: 'rejected' }] });

            const res = await request(app)
                .get('/api/proposals/my')
                .set('Authorization', `Bearer ${carrierToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(2);
            expect(res.body[0].id).toBe('prop-1');
        });
    });
});