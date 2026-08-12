// src/lib/export/materialsWorkbook.ts
import ExcelJS from 'exceljs';
import type { MaterialCategory, MaterialItem, MaterialLineInput, MaterialLineResult } from '@/lib/calc';

const EXPORTABLE_CATEGORIES: MaterialCategory[] = ['Consumable', 'DAS Materials'];
const HEADERS = ['TYPE', 'MANUFACTURER / MODEL', 'DESCRIPTION', 'UNIT COST', 'QTY', 'EXT COST'];
const CURRENCY_FORMAT = '"$"#,##0.00';
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE5E7EB' } };

export function buildMaterialsWorkbook(
  materialItems: MaterialItem[],
  lines: MaterialLineResult[],
  quantities: MaterialLineInput[],
): ExcelJS.Workbook {
  const qtyByKey = new Map(quantities.map((q) => [q.key, q.quantity]));
  const extCostByKey = new Map(lines.map((l) => [l.key, l.extCost]));
  const workbook = new ExcelJS.Workbook();

  for (const category of EXPORTABLE_CATEGORIES) {
    const rows = materialItems.filter(
      (item) => item.category === category && (qtyByKey.get(item.key) ?? 0) > 0,
    );
    if (rows.length === 0) continue;

    const sheet = workbook.addWorksheet(category);
    sheet.columns = [
      { width: 20 },
      { width: 28 },
      { width: 45 },
      { width: 14 },
      { width: 10 },
      { width: 14 },
    ];

    const headerRow = sheet.addRow(HEADERS);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    });

    let total = 0;
    for (const item of rows) {
      const quantity = qtyByKey.get(item.key) ?? 0;
      const extCost = extCostByKey.get(item.key) ?? 0;
      total += extCost;
      const row = sheet.addRow([
        item.type,
        [item.manufacturer, item.model].filter(Boolean).join(' / '),
        item.description,
        item.unitCost,
        quantity,
        extCost,
      ]);
      row.getCell(4).numFmt = CURRENCY_FORMAT;
      row.getCell(6).numFmt = CURRENCY_FORMAT;
    }

    const totalRow = sheet.addRow(['Total', '', '', '', '', total]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
    });
    totalRow.getCell(6).numFmt = CURRENCY_FORMAT;
  }

  return workbook;
}
