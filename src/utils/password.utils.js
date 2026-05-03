const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

const validatePasswordStrength = (password) => {
    if (!password || password.length < 8) {
        return { 
            isValid: false, 
            message: 'Senha deve ter no mínimo 8 caracteres' 
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
            isValid: false, 
            message: 'Senha deve conter pelo menos uma letra maiúscula' 
        };
    }
    if(!hasLowerCase){
        return { 
            isValid: false, 
            message: 'Senha deve conter pelo menos uma letra minúscula' 
        };
    }
    if(!hasNumber){
        return { 
            isValid: false, 
            message: 'Senha deve conter pelo menos um número' 
        };
    }
    if(!hasSpecialChar){
        return { 
            isValid: false, 
            message: 'Senha deve conter pelo menos um caractere especial' 
        };
    }
    
    return { isValid: true, message: 'Password is valid' };
};

module.exports = {
    hashPassword,
    comparePassword,
    validatePasswordStrength
}