const creditCardService = require('../services/creditCard.service');
const createError = require('../middlewares/createError');

const recompileFatura = async (req, res) => {
  try {
    const { faturas, deletedCount } = await creditCardService.recompileFatura(req.user.id);

    if (!faturas) {
      return res.json({
        message: 'Nenhuma despesa no cartão de crédito para compilar.',
        faturas: null,
        deletedCount
      });
    }

    res.json({
      message: deletedCount > 0
        ? 'Fatura recompilada com sucesso.'
        : 'Fatura gerada com sucesso.',
      faturas,
      deletedCount
    });
  } catch (error) {
    console.error('Recompile fatura error:', error);
    res.status(500).json(createError(500, 'Erro ao recompilar fatura'));
  }
};

module.exports = {
  recompileFatura,
};
