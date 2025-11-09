const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Create default categories function that accepts userId
const createDefaultCategories = (userId) => [
    { id: uuidv4(), name: 'Alimentação', type: 'debito', color: '#FF6B6B', isDefault: true, userId },
    { id: uuidv4(), name: 'Transporte', type: 'debito', color: '#4ECDC4', isDefault: true, userId },
    { id: uuidv4(), name: 'Saúde', type: 'debito', color: '#45B7D1', isDefault: true, userId },
    { id: uuidv4(), name: 'Contas', type: 'debito', color: '#FFA07A', isDefault: true, userId },
    { id: uuidv4(), name: 'Lazer', type: 'debito', color: '#98D8C8', isDefault: true, userId },
    { id: uuidv4(), name: 'Outros', type: 'debito', color: '#F7DC6F', isDefault: true, userId },
    { id: uuidv4(), name: 'Salário', type: 'credito', color: '#82E0AA', isDefault: true, userId },
    { id: uuidv4(), name: 'Freelance', type: 'credito', color: '#AED6F1', isDefault: true, userId },
    { id: uuidv4(), name: 'Sem Categoria', type: 'debito', color: '#D5DBDB', isDefault: true, userId },
];

// Create user with proper userId references
const createMockUser = () => {
    // Use fixed ID so frontend can consistently access the user
    const userId = '317f632f-6149-4f77-aa02-1af65cad1750';

    // Hash the password (synchronously for initialization)
    // In a real database, passwords would already be hashed
    const hashedPassword = bcrypt.hashSync('123456', 10);
    return {
        id: userId,
        name: 'Matheus Fonseca',
        email: 'matheusfonseca@gmail.com',
        password: hashedPassword,
        balance: 0,
        recurrentCredits: [
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-01'),
                description: 'Salário Outubro',
                value: 3500.00,
                type: 'credito',
                category: 'Salário',
                userId: userId,
            },
        ],
        recurrentDebits: [
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-05'),
                description: 'Internet',
                value: -89.90,
                type: 'debito',
                category: 'Contas',
                userId: userId,
            },
        ],
        transactions: [
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-05'),
                description: 'Supermercado',
                value: -150.50,
                type: 'debito',
                category: 'Alimentação',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-04'),
                description: 'Uber',
                value: -25.80,
                type: 'debito',
                category: 'Transporte',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-03'),
                description: 'Farmácia',
                value: -45.90,
                type: 'debito',
                category: 'Saúde',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-10-02'),
                description: 'Conta de Luz',
                value: -120.00,
                type: 'debito',
                category: 'Contas',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-09-28'),
                description: 'Restaurante',
                value: -85.00,
                type: 'debito',
                category: 'Alimentação',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-09-25'),
                description: 'Cinema',
                value: -30.00,
                type: 'debito',
                category: 'Lazer',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-09-20'),
                description: 'Projeto Freelance',
                value: 800.00,
                type: 'credito',
                category: 'Freelance',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-09-15'),
                description: 'Padaria',
                value: -15.50,
                type: 'debito',
                category: 'Alimentação',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-08-28'),
                description: 'Mercado Agosto',
                value: -200.00,
                type: 'debito',
                category: 'Alimentação',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-08-15'),
                description: 'Salário Agosto',
                value: 3500.00,
                type: 'credito',
                category: 'Salário',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-07-20'),
                description: 'Academia',
                value: -150.00,
                type: 'debito',
                category: 'Saúde',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-07-15'),
                description: 'Salário Julho',
                value: 3500.00,
                type: 'credito',
                category: 'Salário',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-06-25'),
                description: 'Conta de Internet',
                value: -100.00,
                type: 'debito',
                category: 'Contas',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-06-15'),
                description: 'Salário Junho',
                value: 3500.00,
                type: 'credito',
                category: 'Salário',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-05-20'),
                description: 'Compras Maio',
                value: -180.00,
                type: 'debito',
                category: 'Alimentação',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2025-05-15'),
                description: 'Salário Maio',
                value: 3500.00,
                type: 'credito',
                category: 'Salário',
                userId: userId,
            },
        ],
        categories: createDefaultCategories(userId),
    };
};

let userData = [createMockUser()];

module.exports = {
    getUserData: () => userData,
    setUserData: (data) => { userData = data; },
    addUser: (user) => userData.push(user),
    findUserById: (id) => userData.find(user => user.id === id),
    findUserByEmail: (email) => userData.find(user => user.email === email),
    createDefaultCategories: createDefaultCategories
};
