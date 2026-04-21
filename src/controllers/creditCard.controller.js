const creditCardService = require('../services/creditCard.service');
const createError = require('../middlewares/createError');

const recompileFatura = async (req, res) => {
  try {
    const { fatura, deletedOldFatura } = await creditCardService.recompileFatura(req.user.id);

    if (!fatura) {
      return res.json({
        message: 'Nenhuma despesa no cartão de crédito para compilar.',
        fatura: null,
        deletedOldFatura
      });
    }

    res.json({
      message: deletedOldFatura
        ? 'Fatura recompilada com sucesso.'
        : 'Fatura gerada com sucesso.',
      fatura,
      deletedOldFatura
    });
  } catch (error) {
    console.error('Recompile fatura error:', error);
    res.status(500).json(createError(500, 'Erro ao recompilar fatura'));
  }
};

module.exports = {
  recompileFatura,
};
