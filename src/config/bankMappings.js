/**
 * Bank CSV Mapping Definitions
 *
 * Each mapping defines:
 *   - label:          Display name for the UI
 *   - columns:        Maps our internal fields to CSV column headers
 *     - date:         Column name for transaction date
 *     - value:        Column name for transaction value
 *     - description:  Column name for transaction description
 *     - identifier:   (optional) Column name for a unique transaction ID
 *   - keywordTarget:  Which CSV column to match against category keywords
 *   - dateFormat:     How to parse the date string ('DD/MM/YYYY', 'YYYY-MM-DD', etc.)
 *   - valueSigned:    If true, sign of the value determines type (negative = expense, positive = income)
 *   - separator:      CSV delimiter (default ',')
 */

const BANK_MAPPINGS = {
  nubank: {
    label: 'NuBank',
    columns: {
      date: 'Data',
      value: 'Valor',
      description: 'Descrição',
      identifier: 'Identificador'
    },
    keywordTarget: 'Descrição',
    dateFormat: 'DD/MM/YYYY',
    valueSigned: true,
    separator: ','
  }
};

/**
 * Custom import uses user-defined column mappings sent from the frontend.
 * Frontend sends:
 *   { date: '<col>', value: '<col>', description: '<col>', keywordTarget: '<col>' }
 * along with dateFormat and valueSigned flags.
 */

module.exports = { BANK_MAPPINGS };
