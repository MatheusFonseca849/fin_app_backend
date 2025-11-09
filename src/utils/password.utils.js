const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
    const saltRounds = 10
    return await bcrypt.hash(password, saltRounds)
}

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

const validatePasswordStrength = (password) => {
    if (!password || password.length < 6) {
        return { 
            valid: false, 
            message: 'Senha deve ter no mínimo 6 caracteres' 
        };
    }
    
    // - At least one uppercase letter
    // - At least one lowercase letter
    // - At least one number
    // - At least one special character
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if(!hasUpperCase){
        return { 
            valid: false, 
            message: 'Senha deve conter pelo menos uma letra maiúscula' 
        };
    }
    if(!hasLowerCase){
        return { 
            valid: false, 
            message: 'Senha deve conter pelo menos uma letra minúscula' 
        };
    }
    if(!hasNumber){
        return { 
            valid: false, 
            message: 'Senha deve conter pelo menos um número' 
        };
    }
    if(!hasSpecialChar){
        return { 
            valid: false, 
            message: 'Senha deve conter pelo menos um caractere especial' 
        };
    }
    
    return { valid: true, message: 'Senha válida' };
};

module.exports = {
    hashPassword,
    comparePassword,
    validatePasswordStrength
}