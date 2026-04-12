# 🧪 Guia Completo de Testes de Rotas - FinApp

Este guia fornece documentação completa para testar todas as rotas da API do FinApp.

---

## 📋 Índice

1. [Configuração Inicial](#configuração-inicial)
2. [Rotas de Usuário](#rotas-de-usuário)
3. [Rotas de Transações](#rotas-de-transações)
4. [Rotas de Categorias](#rotas-de-categorias)
5. [Testes Automatizados](#testes-automatizados)
6. [Postman Collection](#postman-collection)

---

## Configuração Inicial

### Iniciar o Servidor

```bash
cd fin_app_backend
npm run dev
```

**Saída Esperada:**
```
📊 Connecting to MongoDB...
✅ MongoDB connected!
🚀 Server running on http://localhost:3000
```

### Verificar Saúde da API

```bash
curl http://localhost:3000/health
```

### Popular Banco (Opcional)

```bash
npm run seed
```

**Credenciais de teste:**
- Email: `matheusfonseca@gmail.com`
- Senha: `123456`

---

## Rotas de Usuário

Base: `http://localhost:3000/users`

### 1. Registrar Usuário

**`POST /users/register`** (Público)

```bash
curl -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "password": "SenhaForte123!@#"
  }'
```

**Resposta 201:**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "_id": "674f...",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "balance": 0,
    "categories": [...]
  }
}
```

**Requisitos de Senha:**
- Mínimo 8 caracteres
- 1 maiúscula, 1 minúscula
- 1 número, 1 caractere especial

---

### 2. Login

**`POST /users/login`** (Público)

```bash
curl -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "joao@exemplo.com",
    "password": "SenhaForte123!@#"
  }'
```

**Resposta 200:**
```json
{
  "accessToken": "eyJhbGc...",
  "user": { ... }
}
```

⚠️ **Salve o accessToken para as próximas requisições!**

---

### 3. Obter Usuário Atual

**`GET /users/me`** (Protegido)

```bash
curl http://localhost:3000/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Atualizar Usuário

**`PUT /users/:id`** (Protegido)

```bash
curl -X PUT http://localhost:3000/users/674f... \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Pedro Silva"
  }'
```

---

### 5. Deletar Usuário

**`DELETE /users/:id`** (Protegido)

```bash
curl -X DELETE http://localhost:3000/users/674f... \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. Logout

**`POST /users/logout`** (Protegido)

```bash
curl -X POST http://localhost:3000/users/logout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -b cookies.txt
```

---

### 7. Renovar Token

**`POST /users/refresh`** (Cookie)

```bash
curl -X POST http://localhost:3000/users/refresh \
  -b cookies.txt
```

---

## Rotas de Transações

Base: `http://localhost:3000/records`

⚠️ **Todas requerem autenticação!**

### 1. Listar Transações

**`GET /records`**

```bash
curl http://localhost:3000/records \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resposta 200:**
```json
[
  {
    "_id": "674f...",
    "description": "Salário",
    "value": 5000.00,
    "type": "credito",
    "category": "Salário",
    "timestamp": "2025-11-01T10:00:00.000Z"
  }
]
```

---

### 2. Buscar Transação

**`GET /records/:id`**

```bash
curl http://localhost:3000/records/674f... \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. Criar Transação

**`POST /records`**

```bash
curl -X POST http://localhost:3000/records \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Compra supermercado",
    "value": -250.50,
    "type": "debito",
    "category": "Alimentação"
  }'
```

**Campos Obrigatórios:**
- `description` - Texto descritivo
- `value` - Número (negativo para débito)
- `type` - "credito" ou "debito"
- `category` - Nome da categoria existente

**Resposta 201:**
```json
{
  "_id": "674f...",
  "description": "Compra supermercado",
  "value": -250.50,
  "type": "debito",
  "category": "Alimentação",
  "timestamp": "2025-11-13T..."
}
```

---

### 4. Atualizar Transação

**`PUT /records/:id`**

```bash
curl -X PUT http://localhost:3000/records/674f... \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Compra atualizada",
    "value": -300.00
  }'
```

**Campos Opcionais:**
- `description`
- `value`
- `type`
- `category`
- `date` (ISO 8601)

---

### 5. Deletar Transação

**`DELETE /records/:id`**

```bash
curl -X DELETE http://localhost:3000/records/674f... \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Rotas de Categorias

Base: `http://localhost:3000/categories`

⚠️ **Todas requerem autenticação!**

### 1. Listar Categorias

**`GET /categories`**

```bash
curl http://localhost:3000/categories \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resposta 200:**
```json
[
  {
    "_id": "674f...",
    "name": "Alimentação",
    "type": "debito",
    "color": "#FF6384",
    "isDefault": true
  }
]
```

---

### 2. Criar Categoria

**`POST /categories`**

```bash
curl -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Educação",
    "type": "debito",
    "color": "#9B59B6"
  }'
```

**Validações:**
- Nome: máx 50 caracteres, não vazio
- Type: "credito" ou "debito"
- Color: hexadecimal válido (#RRGGBB)
- Nome não pode duplicar

---

### 3. Atualizar Categoria

**`PUT /categories/:id`**

```bash
curl -X PUT http://localhost:3000/categories/674f... \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Educação Online",
    "color": "#8E44AD"
  }'
```

⚠️ **Categorias padrão não podem ser atualizadas!**

---

### 4. Deletar Categoria

**`DELETE /categories/:id`**

```bash
curl -X DELETE http://localhost:3000/categories/674f... \
  -H "Authorization: Bearer YOUR_TOKEN"
```

⚠️ **Categorias padrão não podem ser deletadas!**

**Resposta 200:**
```json
{
  "message": "Categoria excluída. Transações movidas para \"Sem Categoria\""
}
```

---

## Testes Automatizados

### Setup

```bash
npm install --save-dev jest supertest mongodb-memory-server
```

**`jest.config.js`:**
```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js'
  ],
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js']
};
```

**`tests/setup.js`:**
```javascript
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});
```

---

### Exemplo: Teste de Autenticação

**`tests/auth.test.js`:**
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('Authentication', () => {
  describe('POST /users/register', () => {
    it('deve registrar novo usuário', async () => {
      const res = await request(app)
        .post('/users/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'Test123!@#'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('deve rejeitar senha fraca', async () => {
      const res = await request(app)
        .post('/users/register')
        .send({
          name: 'Test',
          email: 'test@example.com',
          password: '123'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /users/login', () => {
    beforeEach(async () => {
      await request(app).post('/users/register').send({
        name: 'Test',
        email: 'test@example.com',
        password: 'Test123!@#'
      });
    });

    it('deve fazer login com credenciais válidas', async () => {
      const res = await request(app)
        .post('/users/login')
        .send({
          email: 'test@example.com',
          password: 'Test123!@#'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('deve rejeitar senha incorreta', async () => {
      const res = await request(app)
        .post('/users/login')
        .send({
          email: 'test@example.com',
          password: 'wrong'
        });

      expect(res.statusCode).toBe(401);
    });
  });
});
```

---

### Exemplo: Teste de Transações

**`tests/transactions.test.js`:**
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('Transactions', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/users/register')
      .send({
        name: 'Test',
        email: 'test@example.com',
        password: 'Test123!@#'
      });
    token = res.body.accessToken;
  });

  describe('POST /records', () => {
    it('deve criar transação', async () => {
      const res = await request(app)
        .post('/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Test',
          value: -100,
          type: 'debito',
          category: 'Alimentação'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.description).toBe('Test');
    });

    it('deve rejeitar sem auth', async () => {
      const res = await request(app)
        .post('/records')
        .send({ description: 'Test', value: -100 });

      expect(res.statusCode).toBe(401);
    });

    it('deve rejeitar categoria inválida', async () => {
      const res = await request(app)
        .post('/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Test',
          value: -100,
          type: 'debito',
          category: 'Inexistente'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /records', () => {
    beforeEach(async () => {
      await request(app)
        .post('/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Test',
          value: -50,
          type: 'debito',
          category: 'Alimentação'
        });
    });

    it('deve listar transações', async () => {
      const res = await request(app)
        .get('/records')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /records/:id', () => {
    let transactionId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'Original',
          value: -100,
          type: 'debito',
          category: 'Alimentação'
        });
      transactionId = res.body._id;
    });

    it('deve atualizar transação', async () => {
      const res = await request(app)
        .put(`/records/${transactionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('Updated');
    });
  });

  describe('DELETE /records/:id', () => {
    let transactionId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/records')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: 'To Delete',
          value: -50,
          type: 'debito',
          category: 'Alimentação'
        });
      transactionId = res.body._id;
    });

    it('deve deletar transação', async () => {
      const res = await request(app)
        .delete(`/records/${transactionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
    });
  });
});
```

---

### Exemplo: Teste de Categorias

**`tests/categories.test.js`:**
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('Categories', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/users/register')
      .send({
        name: 'Test',
        email: 'test@example.com',
        password: 'Test123!@#'
      });
    token = res.body.accessToken;
  });

  describe('GET /categories', () => {
    it('deve listar categorias padrão', async () => {
      const res = await request(app)
        .get('/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('POST /categories', () => {
    it('deve criar categoria', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Educação',
          type: 'debito',
          color: '#9B59B6'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Educação');
      expect(res.body.isDefault).toBe(false);
    });

    it('deve rejeitar nome duplicado', async () => {
      await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Educação',
          type: 'debito',
          color: '#9B59B6'
        });

      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Educação',
          type: 'debito',
          color: '#000000'
        });

      expect(res.statusCode).toBe(400);
    });

    it('deve rejeitar cor inválida', async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test',
          type: 'debito',
          color: 'invalid'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /categories/:id', () => {
    let categoryId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Original',
          type: 'debito',
          color: '#000000'
        });
      categoryId = res.body._id;
    });

    it('deve atualizar categoria', async () => {
      const res = await request(app)
        .put(`/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /categories/:id', () => {
    let categoryId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'ToDelete',
          type: 'debito',
          color: '#000000'
        });
      categoryId = res.body._id;
    });

    it('deve deletar categoria', async () => {
      const res = await request(app)
        .delete(`/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
    });
  });
});
```

---

### Executar Testes

```bash
# Todos os testes
npm test

# Com cobertura
npm test -- --coverage

# Modo watch
npm test -- --watch

# Teste específico
npm test -- auth.test.js
```

---

## Postman Collection

### Importar Collection

1. Abra Postman
2. Clique em "Import"
3. Cole o JSON abaixo

**`FinApp.postman_collection.json`:**
```json
{
  "info": {
    "name": "FinApp API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "accessToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 201) {",
                  "  pm.collectionVariables.set('accessToken', pm.response.json().accessToken);",
                  "}"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Test User\",\n  \"email\": \"test@example.com\",\n  \"password\": \"Test123!@#\"\n}",
              "options": { "raw": { "language": "json" } }
            },
            "url": {
              "raw": "{{baseUrl}}/users/register",
              "host": ["{{baseUrl}}"],
              "path": ["users", "register"]
            }
          }
        },
        {
          "name": "Login",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "  pm.collectionVariables.set('accessToken', pm.response.json().accessToken);",
                  "}"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"Test123!@#\"\n}",
              "options": { "raw": { "language": "json" } }
            },
            "url": {
              "raw": "{{baseUrl}}/users/login",
              "host": ["{{baseUrl}}"],
              "path": ["users", "login"]
            }
          }
        }
      ]
    },
    {
      "name": "Transactions",
      "item": [
        {
          "name": "List Transactions",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/records",
              "host": ["{{baseUrl}}"],
              "path": ["records"]
            }
          }
        },
        {
          "name": "Create Transaction",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"description\": \"Test Transaction\",\n  \"value\": -100.00,\n  \"type\": \"debito\",\n  \"category\": \"Alimentação\"\n}",
              "options": { "raw": { "language": "json" } }
            },
            "url": {
              "raw": "{{baseUrl}}/records",
              "host": ["{{baseUrl}}"],
              "path": ["records"]
            }
          }
        }
      ]
    },
    {
      "name": "Categories",
      "item": [
        {
          "name": "List Categories",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/categories",
              "host": ["{{baseUrl}}"],
              "path": ["categories"]
            }
          }
        },
        {
          "name": "Create Category",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Educação\",\n  \"type\": \"debito\",\n  \"color\": \"#9B59B6\"\n}",
              "options": { "raw": { "language": "json" } }
            },
            "url": {
              "raw": "{{baseUrl}}/categories",
              "host": ["{{baseUrl}}"],
              "path": ["categories"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Códigos de Status HTTP

| Código | Significado | Quando Acontece |
|--------|-------------|-----------------|
| 200 | OK | Requisição bem-sucedida |
| 201 | Created | Recurso criado |
| 400 | Bad Request | Dados inválidos |
| 401 | Unauthorized | Token ausente/inválido |
| 403 | Forbidden | Sem permissão |
| 404 | Not Found | Recurso não existe |
| 500 | Internal Error | Erro no servidor |

---

## Dicas de Teste

### 1. Fluxo Completo

```bash
# 1. Registrar
TOKEN=$(curl -s -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@ex.com","password":"Test123!@#"}' \
  | jq -r '.accessToken')

# 2. Criar transação
curl -X POST http://localhost:3000/records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Test","value":-100,"type":"debito","category":"Alimentação"}'

# 3. Listar
curl http://localhost:3000/records \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Usar Variáveis

```bash
export API_URL="http://localhost:3000"
export TOKEN="eyJhbGc..."

curl $API_URL/records -H "Authorization: Bearer $TOKEN"
```

### 3. Debug com Verbose

```bash
curl -v http://localhost:3000/records \
  -H "Authorization: Bearer $TOKEN"
```

---

## Solução de Problemas

### Erro 401 - Unauthorized

**Causa:** Token inválido ou expirado

**Solução:**
```bash
# Fazer login novamente
curl -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
```

### Erro 400 - Categoria não encontrada

**Causa:** Nome de categoria incorreto

**Solução:**
```bash
# Listar categorias disponíveis
curl http://localhost:3000/categories \
  -H "Authorization: Bearer $TOKEN"
```

### Erro 500 - Internal Server Error

**Causa:** Problema no servidor

**Solução:**
1. Verificar logs do servidor
2. Verificar conexão com MongoDB
3. Verificar variáveis de ambiente (.env)

---

## Próximos Passos

✅ **Teste todas as rotas manualmente com cURL**
✅ **Configure Postman Collection**
✅ **Implemente testes automatizados**
✅ **Configure CI/CD para rodar testes**
✅ **Adicione testes de integração**

---

**Documentação criada para FinApp**
**Última atualização: Novembro 2025**
