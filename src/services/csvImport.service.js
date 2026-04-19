const { parse } = require('csv-parse/sync');
const { BANK_MAPPINGS } = require('../config/bankMappings');
const Category = require('../models/schemas/category.schema');
const AppError = require('../utils/AppError');

const MAX_PREVIEW_ROWS = 5000;

class CsvImportService {

  // ============================================
  // CSV Parsing
  // ============================================

  /**
   * Parse a CSV buffer into raw records using the appropriate separator.
   * @param {Buffer} buffer - The CSV file buffer
   * @param {string} separator - CSV delimiter (default ',')
   * @returns {Object[]} Parsed CSV records with column headers as keys
   */
  parseCSV(buffer, separator = ',') {
    const content = buffer.toString('utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: separator,
      bom: true
    });
  }

  /**
   * Extract column headers from a CSV buffer.
   * @param {Buffer} buffer - The CSV file buffer
   * @param {string} separator - CSV delimiter
   * @returns {string[]} Array of column header names
   */
  getCSVHeaders(buffer, separator = ',') {
    const content = buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: separator,
      bom: true,
      to: 1
    });
    if (records.length === 0) return [];
    return Object.keys(records[0]);
  }

  // ============================================
  // Date Parsing
  // ============================================

  /**
   * Parse a date string according to the given format.
   * @param {string} dateStr - Raw date string from CSV
   * @param {string} format - 'DD/MM/YYYY' or 'YYYY-MM-DD'
   * @returns {Date|null}
   */
  parseDate(dateStr, format) {
    if (!dateStr) return null;
    try {
      if (format === 'DD/MM/YYYY') {
        const [day, month, year] = dateStr.split('/');
        return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
      }
      if (format === 'YYYY-MM-DD') {
        return new Date(`${dateStr}T00:00:00`);
      }
      // Fallback: try native parsing
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  // ============================================
  // Keyword Matching
  // ============================================

  /**
   * Build a keyword matcher from user categories.
   * Returns a function that takes a string and returns the best matching category ID.
   * @param {Object[]} categories - User's categories with keywords
   * @returns {Function} (text: string) => { categoryId: string|null, categoryName: string|null }
   */
  buildKeywordMatcher(categories) {
    // Build lookup: each keyword (lowercased) → { categoryId, categoryName }
    const keywordMap = [];
    for (const cat of categories) {
      if (!cat.keywords || cat.keywords.length === 0) continue;
      for (const kw of cat.keywords) {
        const normalized = kw.toLowerCase().trim();
        if (normalized) {
          keywordMap.push({
            keyword: normalized,
            categoryId: cat._id,
            categoryName: cat.name
          });
        }
      }
    }

    // Sort by keyword length descending so longer (more specific) keywords match first
    keywordMap.sort((a, b) => b.keyword.length - a.keyword.length);

    return (text) => {
      if (!text) return { categoryId: null, categoryName: null };
      const lower = text.toLowerCase();
      for (const entry of keywordMap) {
        if (lower.includes(entry.keyword)) {
          return { categoryId: entry.categoryId, categoryName: entry.categoryName };
        }
      }
      return { categoryId: null, categoryName: null };
    };
  }

  // ============================================
  // Row Mapping (CSV record → transaction preview)
  // ============================================

  /**
   * Map raw CSV records to transaction preview rows using a bank mapping or custom mapping.
   *
   * @param {Object[]} records - Parsed CSV rows
   * @param {Object} mapping - Column mapping config (from BANK_MAPPINGS or custom)
   * @param {Function} matchKeyword - Keyword matcher function
   * @param {string} fallbackCategoryId - "Sem Categoria" _id
   * @param {string} fallbackCategoryName - "Sem Categoria" name
   * @returns {{ rows: Object[], errors: string[] }}
   */
  mapRows(records, mapping, matchKeyword, fallbackCategoryId, fallbackCategoryName) {
    const rows = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const lineNum = i + 2; // +2 because line 1 is the header

      // Extract fields using the column mapping
      const dateStr = record[mapping.columns.date];
      const valueStr = record[mapping.columns.value];
      const description = record[mapping.columns.description];

      // Validate required fields
      if (!dateStr || valueStr === undefined || valueStr === '' || !description) {
        errors.push(`Linha ${lineNum}: campos obrigatórios faltando`);
        continue;
      }

      // Parse date
      const parsedDate = this.parseDate(dateStr, mapping.dateFormat);
      if (!parsedDate) {
        errors.push(`Linha ${lineNum}: data inválida "${dateStr}"`);
        continue;
      }

      // Parse value
      // Handle comma as decimal separator (common in Brazilian CSVs)
      const normalizedValue = String(valueStr).replace(',', '.');
      const numericValue = parseFloat(normalizedValue);
      if (isNaN(numericValue) || numericValue === 0) {
        errors.push(`Linha ${lineNum}: valor inválido "${valueStr}"`);
        continue;
      }

      // Determine type from sign if valueSigned, otherwise default to expense
      let type, absValue;
      if (mapping.valueSigned) {
        type = numericValue >= 0 ? 'income' : 'expense';
        absValue = Math.abs(numericValue);
      } else {
        type = 'expense';
        absValue = Math.abs(numericValue);
      }

      // Keyword matching on the target field
      const keywordTargetValue = record[mapping.keywordTarget] || description;
      const { categoryId, categoryName } = matchKeyword(keywordTargetValue);

      rows.push({
        rowIndex: i,
        description: description.trim(),
        value: absValue,
        valueCents: Math.round(absValue * 100),
        type,
        categoryId: categoryId || fallbackCategoryId,
        categoryName: categoryName || fallbackCategoryName,
        date: parsedDate.toISOString().split('T')[0],
        timestamp: parsedDate,
        isPaid: true
      });
    }

    return { rows, errors };
  }

  // ============================================
  // Preview (parse + map, no DB writes)
  // ============================================

  /**
   * Generate a preview of the CSV import for user review.
   *
   * @param {Buffer} fileBuffer - The uploaded CSV file
   * @param {string} userId - Current user ID
   * @param {string} bankKey - Bank mapping key (e.g. 'nubank') or 'custom'
   * @param {Object} [customMapping] - Custom column mapping (required when bankKey is 'custom')
   * @returns {Promise<{ rows: Object[], errors: string[], headers: string[] }>}
   */
  async generatePreview(fileBuffer, userId, bankKey, customMapping) {
    let mapping;

    if (bankKey === 'custom') {
      if (!customMapping || !customMapping.columns || !customMapping.columns.date ||
          !customMapping.columns.value || !customMapping.columns.description) {
        throw new AppError(400, 'Mapeamento customizado incompleto: date, value e description são obrigatórios');
      }
      mapping = {
        columns: customMapping.columns,
        keywordTarget: customMapping.keywordTarget || customMapping.columns.description,
        dateFormat: customMapping.dateFormat || 'DD/MM/YYYY',
        valueSigned: customMapping.valueSigned !== undefined ? customMapping.valueSigned : true,
        separator: customMapping.separator || ','
      };
    } else {
      mapping = BANK_MAPPINGS[bankKey];
      if (!mapping) {
        throw new AppError(400, `Banco "${bankKey}" não suportado`);
      }
    }

    const separator = mapping.separator || ',';
    const records = this.parseCSV(fileBuffer, separator);

    if (!records || records.length === 0) {
      throw new AppError(400, 'Arquivo CSV vazio ou inválido');
    }

    if (records.length > MAX_PREVIEW_ROWS) {
      throw new AppError(400, `Arquivo muito grande: ${records.length} linhas. O limite é de ${MAX_PREVIEW_ROWS} linhas.`);
    }

    // Extract headers from the parsed records (avoids parsing the file twice)
    const headers = Object.keys(records[0]);

    // Validate that expected columns exist
    const requiredCols = [mapping.columns.date, mapping.columns.value, mapping.columns.description];
    const missingCols = requiredCols.filter(col => !headers.includes(col));
    if (missingCols.length > 0) {
      throw new AppError(400, `Colunas não encontradas no CSV: ${missingCols.join(', ')}`);
    }

    // Load user categories with keywords for matching
    const categories = await Category.find({ userId }).lean();

    // Find fallback category
    const fallback = categories.find(c => c.name === 'Sem Categoria');
    const fallbackId = fallback?._id?.toString() || null;
    const fallbackName = fallback?.name || 'Sem Categoria';

    // Build keyword matcher
    const matchKeyword = this.buildKeywordMatcher(categories);

    // Map rows
    const { rows, errors } = this.mapRows(records, mapping, matchKeyword, fallbackId, fallbackName);

    return { rows, errors, headers };
  }
}

module.exports = new CsvImportService();
