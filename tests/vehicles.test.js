const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');
const jwt = require('jsonwebtoken');

jest.mock('../src/db', () => ({ query: jest.fn() }));

describe('Модуль транспортних засобів', () => {
    let carrierToken, customerToken;

    const validVehicle = {
        brand: 'MAN',
        model: 'TGX',
        vehicle_type: 'Тент',
        payload_tons: 20.5,
        license_plate: 'AA1111BB'
    };

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        carrierToken = jwt.sign({ id: 'carrier-1', role: 'carrier' }, process.env.JWT_SECRET);
        customerToken = jwt.sign({ id: 'customer-1', role: 'customer' }, process.env.JWT_SECRET);
    });

    beforeEach(() => { jest.clearAllMocks(); });

    describe('POST /api/vehicles', () => {
        it('TC-6.1: Перевізник додає валідний транспортний засіб', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // Немає дублікатів номерів
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'veh-1', ...validVehicle }] }); // INSERT

            const res = await request(app)
                .post('/api/vehicles')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validVehicle);

            expect(res.statusCode).toEqual(201);
            expect(res.body.vehicle.brand).toBe('MAN');
        });

        it('TC-6.2: Спроба додати авто з існуючим номерним знаком', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-veh' }] }); // Дублікат знайдено

            const res = await request(app)
                .post('/api/vehicles')
                .set('Authorization', `Bearer ${carrierToken}`)
                .send(validVehicle);

            expect(res.statusCode).toEqual(409);
        });

        it('TC-6.3: Замовник намагається додати авто', async () => {
            const res = await request(app)
                .post('/api/vehicles')
                .set('Authorization', `Bearer ${customerToken}`)
                .send(validVehicle);

            expect(res.statusCode).toEqual(403); // Заборонено рольовим middleware
        });
    });

    describe('GET & DELETE /api/vehicles', () => {
        it('TC-6.4: Отримання списку авто поточного перевізника', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'veh-1', brand: 'Volvo' }] });

            const res = await request(app)
                .get('/api/vehicles/my')
                .set('Authorization', `Bearer ${carrierToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body[0].brand).toBe('Volvo');
        });

        it('TC-6.5: Успішне видалення власного авто', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ id: 'veh-1' }] }); // DELETE повертає id

            const res = await request(app)
                .delete('/api/vehicles/veh-1')
                .set('Authorization', `Bearer ${carrierToken}`);

            expect(res.statusCode).toEqual(200);
        });
    });
});