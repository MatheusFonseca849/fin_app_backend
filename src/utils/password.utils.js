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
            isValid: false, 
            message: 'Password must have at least 6 characters' 
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
            message: 'Password must contain at least one uppercase letter' 
        };
    }
    if(!hasLowerCase){
        return { 
            isValid: false, 
            message: 'Password must contain at least one lowercase letter' 
        };
    }
    if(!hasNumber){
        return { 
            isValid: false, 
            message: 'Password must contain at least one number' 
        };
    }
    if(!hasSpecialChar){
        return { 
            isValid: false, 
            message: 'Password must contain at least one special character' 
        };
    }
    
    return { isValid: true, message: 'Password is valid' };
};

module.exports = {
    hashPassword,
    comparePassword,
    validatePasswordStrength
}