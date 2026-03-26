const request = require('supertest');
const { app, server } = require('../index');

describe('Slots Routes', () => {
  afterAll(async () => {
    server.close();
  });

  describe('GET /api/user/slots (Unauthorized)', () => {
    it('should return 401 Unauthorized without a token', async () => {
      const res = await request(app)
        .get('/api/user/slots')
        .query({ from: '2026-03-01', to: '2026-03-31' });
      
      expect(res.statusCode).toEqual(401);
    });
  });
});
