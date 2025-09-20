const { v4: uuidv4 } = require('uuid');

// Create user with proper userId references
const createMockUser = () => {
    // Use fixed ID so frontend can consistently access the user
    const userId = '317f632f-6149-4f77-aa02-1af65cad1750';
    return {
        id: userId,
        name: 'Matheus Fonseca',
        email: 'matheusfonseca@gmail.com',
        password: '123456',
        balance: 0,
        recurrentCredits: [
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-14'),
                description: 'Salário Setembro',
                value: 3500.00,
                type: 'credito',
                category: 'salario',
                userId: userId,
            },
        ],
        recurrentDebits: [
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-07'),
                description: 'Internet',
                value: -89.90,
                type: 'debito',
                category: 'contas',
                userId: userId,
            },
        ],
        transactions: [
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-15'),
                description: 'Supermercado',
                value: -150.50,
                type: 'debito',
                category: 'alimentacao',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-13'),
                description: 'Uber',
                value: -25.80,
                type: 'debito',
                category: 'transporte',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-12'),
                description: 'Farmácia',
                value: -45.90,
                type: 'debito',
                category: 'saude',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-11'),
                description: 'Conta de Luz',
                value: -120.00,
                type: 'debito',
                category: 'contas',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-10'),
                description: 'Restaurante',
                value: -85.00,
                type: 'debito',
                category: 'alimentacao',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-09'),
                description: 'Cinema',
                value: -30.00,
                type: 'debito',
                category: 'lazer',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-08'),
                description: 'Projeto Freelance',
                value: 800.00,
                type: 'credito',
                category: 'freelance',
                userId: userId,
            },
            {
                id: uuidv4(),
                timestamp: new Date('2024-09-06'),
                description: 'Padaria',
                value: -15.50,
                type: 'debito',
                category: 'alimentacao',
                userId: userId,
            },
        ],
    };
};

let userData = [createMockUser()];

module.exports = {
    getUserData: () => userData,
    setUserData: (data) => { userData = data; },
    addUser: (user) => userData.push(user),
    findUserById: (id) => userData.find(user => user.id === id),
    findUserByEmail: (email) => userData.find(user => user.email === email)
};
